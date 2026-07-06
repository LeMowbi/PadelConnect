// État global de l’app (prototype) + persistance locale via AsyncStorage.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState as RNAppState } from 'react-native';
import { setClubStatusMap, type Club, type CustomClub, type PriceTier } from '@/data/clubs';
import {
  approveClubRequest as approveClubRequestRpc,
  createClub as createClubRpc,
  fetchClubOverrides,
  deleteClub as deleteClubRpc,
  fetchClubBoosts,
  fetchClubCommissions,
  fetchClubConfigs,
  fetchClubStatus,
  fetchOperatorPayments,
  fetchServerClubs,
  setClubBoost as setClubBoostRpc,
  setOperatorPayment as setOperatorPaymentRpc,
  grantClubAccessByPhone as grantClubAccessByPhoneRpc,
  revokeClubAccessByPhone as revokeClubAccessByPhoneRpc,
  setBaseClubStatus as setBaseClubStatusRpc,
  setClubCommission as setClubCommissionRpc,
  setClubStatus as setClubStatusRpc,
  upsertClubConfig,
  upsertClubOverride,
} from '@/lib/clubsServer';
import { removeClubPhotoFile, uploadClubPhoto } from '@/lib/clubPhotos';
import {
  cancelLessonRequest,
  fetchMyCoachProfile,
  fetchMyLessons,
  requestLesson,
  updateCoachProfile,
  type CoachProfile,
  type Lesson,
} from '@/lib/coachesServer';
import {
  approveCompetition as approveCompetitionRpc,
  closeCompetition as closeCompetitionRpc,
  createCompetition as createCompetitionRpc,
  deleteCompetition as deleteCompetitionRpc,
  fetchCompetitions,
  fetchMyCompRegistrations,
  fetchTournamentFee,
  registerCompetition as registerCompetitionRpc,
  rejectCompetition as rejectCompetitionRpc,
  setTournamentFee as setTournamentFeeRpc,
  setWaveLink as setWaveLinkRpc,
  confirmTournamentPayment as confirmTournamentPaymentRpc,
  unregisterCompetition as unregisterCompetitionRpc,
} from '@/lib/competitionsServer';
import { seedCompetitions, type Competition } from '@/data/competitions';
import { competitionBlockedCourts } from '@/lib/availability';
import type { Review } from '@/data/reviews';
import { type Friend } from '@/data/user';
import {
  fetchFriendRequests,
  fetchFriends,
  removeFriendOnServer,
  respondFriendRequest as respondFriendRequestOnServer,
  sendFriendRequest as sendFriendRequestOnServer,
  type FriendRequestResult,
  type IncomingFriendRequest,
} from '@/lib/friends';
import {
  blockRangeRow,
  blockSlotRow,
  cancelReservationRow,
  fetchBlockedRanges,
  fetchBlockedSlots,
  fetchMyParticipations,
  markNoShowRow,
  unblockSlotRow,
  respondInvitation as respondInvitationRpc,
  fetchOccupancy,
  fetchReservations,
  insertReservation,
  linkParticipants,
  setClubConfirmedRow,
  unblockRangeRow,
  type BlockedRange,
  type BlockRangeStatus,
  type SlotOccupancy,
} from '@/lib/reservations';
import { blockUser as blockUserRpc, fetchBlockedUserIds } from '@/lib/moderation';
import { cancelMatchReminder, onPushReceivedInForeground, scheduleMatchReminder, syncMatchReminders } from '@/lib/notifications';
import { registerPushToken } from '@/lib/push';
import { uploadAvatar } from '@/lib/avatar';
import { clearOperatorNewsServer, fetchOperatorNews, setOperatorNewsServer } from '@/lib/operatorNews';
import { fetchClubRatings, type ClubRating } from '@/lib/reviewsServer';
import { track } from '@/lib/diagnostics';
import { phoneToAuthEmail, supabase, SUPABASE_AUTH_STORAGE_KEY } from '@/lib/supabase';
import {
  clampLevel,
  clubConfigSlices,
  competitionSlices,
  frAuthError,
  initialState,
  LEVEL_PENALTY,
  LEVEL_STEP,
  loggedOutState,
  mergeServerClubs,
  splitParticipations,
  uid,
  weeklyStreak,
} from './helpers';
import { ACCENTS } from '@/theme';

export type Account = {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string; // identifiant de connexion (inscription par e-mail) — facultatif pour les comptes téléphone
  photoUri?: string;
  birthDate?: string; // JJ/MM/AAAA — sert à l’âge et au signe astro
  gender?: 'homme' | 'femme' | 'nd';
};
export type Invited = { id: string; name: string; confirmed: boolean };

// Demande d’inscription de club stockée côté serveur (table public.club_requests).
export type ServerClubRequest = {
  id: string;
  name: string;
  area: string | null;
  type: string | null;
  courts: number | null;
  price_from: number | null;
  contact_phone: string | null;
  message: string | null;
  status: 'new' | 'contacted' | 'approved' | 'rejected';
  created_at: string;
};

// Message d’aide / signalement envoyé par un joueur (table public.support_messages).
export type ServerSupportMessage = {
  id: string;
  name: string | null;
  contact_phone: string | null;
  message: string;
  status: 'new' | 'read' | 'resolved';
  created_at: string;
};

export type Reservation = {
  id: string;
  userId?: string; // auteur côté serveur (sert à filtrer « mes » résas en mode club/opérateur)
  clubId: string;
  clubName: string;
  court: string; // terrain précis réservé (ex. « Terrain 2 »)
  date: string; // libellé d’affichage (ex. « Demain 13 »)
  dateKey: string; // identité stable du jour (AAAA-MM-JJ) — base des calculs
  time: string;
  startsAt: number; // horodatage réel du créneau (rappel, anti double-réservation)
  price: number; // prix RÉEL du créneau (figé à la réservation — base commission & partage)
  players: number;
  invited: Invited[];
  bookedBy?: { name: string; phone: string }; // qui a réservé — visible côté club
  coachName?: string; // cours : nom du coach (créée par respond_lesson à son acceptation)
  clubConfirmed?: boolean; // le gérant a confirmé la réservation (visible par le joueur)
  openMatch?: boolean; // match OUVERT (45) : visible dans « Matchs ouverts », rejoignable
  openLevel?: string; // niveau souhaité du match ouvert (ex. « 3–4 », libre)
  openCapacity?: number; // nombre de joueurs attendus : 2 = 1v1, 4 = 2v2 (défaut 4)
  createdAt: number;
};

// Durée d’une session (1h30) — sert à savoir quand une réservation est « jouée ».
export const SESSION_MS = 90 * 60000;

// Une réservation est « jouée » dès que son heure de fin est passée (automatique, jamais déclaré).
export function isPlayed(r: Reservation, now = Date.now()): boolean {
  return r.startsAt + SESSION_MS <= now;
}

// Palmarès du joueur : une entrée par tournoi joué (vainqueur, dernière place, ou participant).
// `levelAfter` n’est renseigné QUE pour les défis locaux (niveau calculé sur l’appareil au moment
// de la clôture). Pour les tournois SERVEUR, le niveau est attribué côté serveur et relu ensuite :
// on n’affiche que le delta (+0.50 / −0.25) pour ne jamais montrer un « niveau après » périmé.
export type OfficialResult = {
  id: string;
  compId?: string;
  title: string;
  result: 'win' | 'played' | 'last';
  at: number;
  levelAfter?: number;
};

// Résultat d’un tournoi clôturé par son ORGANISATEUR (club ou créateur du défi).
// `loser` = équipe classée dernière (désignation facultative → malus de niveau).
// winner = 1ʳᵉ place. Pour un americano : second/third = podium (2ᵉ/3ᵉ). loser = dernière
// place (formats à élimination). Tous optionnels sauf le vainqueur.
export type CompResult = { winner: string; second?: string; third?: string; loser?: string; closedAt: number };

// Actualité éditorialisée par l’opérateur, affichée en bandeau sur l’accueil joueur.
export type OperatorNews = { id: string; title: string; subtitle?: string; link?: string };

// Créneau fermé PAR LE CLUB (résa téléphone/WhatsApp, entretien…). Ce n’est PAS une
// réservation PadelConnect : jamais compté dans l’historique, la commission ou les stats.
export type BlockedSlot = { clubId: string; dateKey: string; time: string; court: string; reason: string };

// Infos d’un club modifiables par son gérant (s’appliquent par-dessus les données de base).
export type ClubInfo = {
  name?: string;
  area?: string;
  blurb?: string;
  type?: Club['type'];
  priceFrom?: number;
  priceTiers?: PriceTier[]; // tarifs par plage horaire définis par le gérant
  contactPhone?: string; // numéro WhatsApp du club — alimente le lien discret de la fiche
  mapsQuery?: string; // position Google Maps (nom + adresse) — éditable même pour les fondateurs
};

export type AppState = {
  account: Account | null;
  level: number; // 1.0 → 7.0
  remindersOn: boolean; // préférence : rappels de match (sur l’app installée)
  reserverView: 'Par heure' | 'Par club'; // dernière vue utilisée sur l’écran Réserver
  userReviews: Review[];
  myCompetitions: Competition[];
  reservations: Reservation[];
  favoriteClubIds: string[];
  friends: Friend[];
  friendRequests: IncomingFriendRequest[]; // demandes d’ami REÇUES en attente (Accepter / Refuser)
  coachProfile: CoachProfile | null; // MA fiche coach (null = pas coach) → entrée « Espace Coach »
  myLessons: Lesson[]; // mes cours côté ÉLÈVE (demandes + acceptés/refusés)
  clubRatings: Record<string, ClubRating>; // note moyenne + nb d’avis par club (cartes des listes)
  officialResults: OfficialResult[];
  compRegistrations: Record<string, { partner: string; at: number }>;
  compResults: Record<string, CompResult>; // tournoi clôturé → équipe vainqueure
  clubPhotos: Record<string, string[]>;
  clubOffers: Record<string, { id: string; kind: 'offre' | 'actu' | 'evenement'; title: string; detail: string }[]>;
  clubCovers: Record<string, string>; // photo « de profil » du club (celle de la carte, avant d’ouvrir la fiche)
  clubCourtPhotos: Record<string, Record<string, string>>; // clubId → { nom du terrain: photo }
  clubInfo: Record<string, ClubInfo>; // surcharges gérant (nom, tarif, WhatsApp…)
  hiddenCoachIds: string[]; // coachs (de démo) retirés par leur club
  boostedClubIds: string[];
  boostExpiry: Record<string, number>; // clubId → date d’expiration du boost (affichage)
  operatorPayments: Record<string, 'sent' | 'paid'>; // « clubId:AAAA-MM » → statut de règlement
  customClubs: CustomClub[]; // clubs inscrits via l’app (activation par l’opérateur)
  clubStatus: Record<string, 'active' | 'coming_soon' | 'hidden'>; // statut piloté par l’opérateur (tout club)
  clubCommission: Record<string, number>; // taux de commission propre à chaque club (vu opérateur)
  tournamentFee: number; // frais fixe (FCFA) appliqué aux tournois JOUEURS — réglé par l’opérateur
  waveLink: string | null; // lien de paiement Wave de l’opérateur (frais tournois joueurs, v2)
  // RÔLE vérifié côté serveur (Supabase) — la VRAIE sécurité des espaces.
  //  - 'operator' : toi (PadelConnect). 'club' : un gérant. 'player' : par défaut.
  // Un joueur ne peut pas se promouvoir (protégé par un trigger côté serveur).
  role: 'player' | 'operator' | 'club';
  // TYPE DE COMPTE choisi à l’inscription (joueur / club). Indépendant du RÔLE vérifié
  // serveur : un compte club reste account_type='club' mais role='player' TANT que
  // l’opérateur n’a pas validé son club → l’app affiche « club en cours de validation ».
  accountType: 'player' | 'club';
  serverManagedClubId: string | null; // pour un compte 'club' : l’id du club géré
  serverUserId: string | null; // id Supabase quand connecté → mode « réservations serveur »
  participantReservationIds: string[]; // résas où JE suis invité (hors invitations refusées)
  pendingInvitationIds: string[]; // sous-ensemble : invitations à confirmer (Accepter/Refuser)
  occupancy: SlotOccupancy[]; // créneaux pris par TOUS (vue publique) → dispo cross-joueur
  storageFull: boolean; // true si la sauvegarde a dû abandonner des photos (quota plein)
  managedClubId: string;
  clubSlots: Record<string, string[]>; // horaires ouverts par club
  clubCourts: Record<string, string[]>; // terrains (courts) gérés par club
  blockedSlots: BlockedSlot[]; // créneaux fermés hors app par les clubs
  blockedRanges: BlockedRange[]; // fermetures sur PÉRIODE (54) — terrain ou club entier
  // Fermetures récurrentes PAR TERRAIN (54) : { clubId: { 'Terrain 1': ['18:00'] } }.
  clubCourtClosed: Record<string, Record<string, string[]>>;
  // Comptes que J'AI bloqués (modération UGC, 51) : miroir persisté — un échec réseau au
  // montage d'un écran ne fait plus réapparaître les avis / matchs ouverts d'un compte bloqué.
  blockedUserIds: string[];
  operatorNews: OperatorNews | null; // actu d’accueil publiée par l’opérateur
  dismissedNewsId: string | null; // id de l’actu fermée par le joueur (réapparaît si nouvelle)
};

// 3 chiffres, pas plus : parties jouées (auto), tournois joués, tournois gagnés.
export type Stats = { played: number; tournamentsPlayed: number; tournamentsWon: number; streakWeeks: number };

export const COMMISSION_RATE = 0.1; // commission opérateur (10 %)
const STORAGE_KEY = 'padelco_state_v4'; // v4 : modèle sans matchs ni victoires/défaites
// Photo choisie à l’inscription : mise de côté ici car il n’y a pas encore de session (e-mail à
// confirmer). On l’envoie au stockage dès la 1ʳᵉ session, puis on efface cette clé.
const PENDING_AVATAR_KEY = 'padelco_pending_avatar_uri';
export const MAX_CLUB_PHOTOS = 6; // plafond de photos par club (quota de stockage local)
export const MAX_UPCOMING = 6; // réservations À VENIR max par joueur (anti-blocage des terrains)

// Résultat d’addReservation : soit un succès, soit un échec avec sa raison (traduite en toast
// par l’appelant). La règle vit ici → elle s’applique à TOUS les points d’entrée (fiche club
// ET fiche rapide), impossible à contourner.
// partnersNotified = false : la résa est créée mais le rattachement des amis invités a échoué
// (pas de push ni de résa chez eux) — l'écran de succès doit le dire au lieu de le taire.
export type AddReservationResult =
  { ok: true; partnersNotified?: boolean } | { ok: false; reason: 'past' | 'conflict' | 'limit' | 'closed' | 'network' };

type AppContextType = {
  state: AppState;
  hydrated: boolean;
  stats: Stats;
  myReservations: Reservation[]; // mes réservations seules (cf. memo) — pour tout écran perso
  setAccount: (a: Account) => void;
  // photoSaved = false quand une NOUVELLE photo locale a échoué à l’upload (réseau) : l’appelant
  // doit alors prévenir l’utilisateur au lieu d’afficher un toast de succès mensonger.
  // photoSaved / profileSaved = false : la photo / les champs texte n'ont PAS atteint le
  // serveur (réseau) — l'écran d'édition doit le dire au lieu d'un succès mensonger.
  updateAccount: (patch: Partial<Account>) => Promise<{ photoSaved: boolean; profileSaved: boolean }>;
  // Inscription serveur PRINCIPALE — e-mail (confirmé) + mot de passe, le téléphone est
  // conservé (sans SMS) pour que les clubs puissent joindre les joueurs. `needsConfirm`
  // = true quand l’e-mail de confirmation vient d’être envoyé (pas encore de session).
  signUpWithEmail: (
    email: string,
    password: string,
    phone: string,
    profile: {
      firstName: string;
      lastName: string;
      birthDate?: string;
      gender?: Account['gender'];
      level?: number;
      referralCode?: string;
      photoUri?: string;
      // Compte CLUB (Chantier 1) : type + infos du club. Quand accountType='club', le
      // serveur crée d’office la demande d’inscription (validée ensuite par l’opérateur).
      accountType?: 'player' | 'club';
      club?: { name: string; area?: string; type?: string; courts?: number; priceFrom?: number };
    },
  ) => Promise<{ ok: boolean; needsConfirm?: boolean; error?: string }>;
  signInWithEmail: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  // Recharge la session (profil + données) — appelé après la confirmation d’e-mail (deep link).
  refreshSession: () => Promise<void>;
  // Ajouter / changer l’e-mail du compte (confirmation par lien envoyé à la nouvelle adresse).
  updateEmail: (email: string) => Promise<{ ok: boolean; error?: string }>;
  // Connexion serveur héritée — téléphone + mot de passe (comptes créés avant l’e-mail).
  signInWithPhone: (phone: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  // Mot de passe oublié : envoi d’un lien de réinitialisation par e-mail.
  resetPassword: (email: string) => Promise<{ ok: boolean; error?: string }>;
  // Renvoyer l’e-mail de confirmation d’inscription.
  resendConfirmation: (email: string) => Promise<{ ok: boolean; error?: string }>;
  // Suppression définitive du compte (exigence App Store / Google Play).
  deleteAccount: () => Promise<{ ok: boolean; error?: string }>;
  signOut: () => void;
  closeCompetition: (
    comp: { id: string; title: string; official?: boolean },
    winnerName: string,
    winnerIsMe: boolean,
    loserName?: string,
    loserIsMe?: boolean,
    podium?: { second?: string; third?: string }, // americano : 2ᵉ/3ᵉ place
  ) => Promise<boolean>; // false = échec serveur (réseau/droits) → l’UI ne doit pas se taire
  setRemindersOn: (on: boolean) => void;
  setReserverView: (v: 'Par heure' | 'Par club') => void;
  addCompetition: (c: Omit<Competition, 'id' | 'createdByMe'>) => Promise<{ ok: boolean }>;
  approveCompetition: (id: string) => Promise<boolean>; // le club hôte valide un tournoi joueur (false = échec serveur)
  rejectCompetition: (id: string, reason?: string) => Promise<boolean>; // le club hôte refuse (motif optionnel montré à l’organisateur)
  deleteCompetition: (id: string) => Promise<boolean>; // annulation / suppression (créateur ou club hôte) — false = refus serveur / hors-ligne
  registerCompetition: (id: string, partner: string) => Promise<boolean>; // false = échec serveur
  unregisterCompetition: (id: string) => Promise<boolean>; // false = échec serveur
  setTournamentFee: (amount: number) => Promise<{ ok: boolean }>; // opérateur : frais fixe tournois joueurs
  setWaveLink: (link: string) => Promise<{ ok: boolean }>; // opérateur : lien de paiement Wave (v2)
  confirmTournamentPayment: (id: string) => Promise<{ ok: boolean }>; // opérateur : confirme un paiement Wave
  // Réservations : SERVEUR = source de vérité quand connecté (sinon miroir local, démo).
  addReservation: (r: Omit<Reservation, 'id' | 'createdAt' | 'bookedBy' | 'userId'>) => Promise<AddReservationResult>;
  cancelReservation: (id: string) => Promise<boolean>;
  // Réservation partagée : l’invité accepte (accept=true) ou refuse son invitation.
  respondInvitation: (reservationId: string, accept: boolean) => Promise<boolean>;
  confirmReservationByClub: (id: string) => Promise<boolean>;
  // Envoie une DEMANDE d’ami par numéro (plus d’ajout instantané) : la personne doit accepter.
  sendFriendRequest: (phone: string) => Promise<FriendRequestResult>;
  // Réponds à une demande REÇUE (accept=true → on devient amis ; false → refusée).
  respondFriendRequest: (requestId: string, accept: boolean) => Promise<boolean>;
  removeFriend: (id: string) => Promise<boolean>; // false = échec serveur (réseau) → l’ami reste affiché
  // Bloquer un joueur (modération UGC) : écrit le serveur puis le miroir state.blockedUserIds.
  blockUserAccount: (userId: string) => Promise<boolean>;
  toggleFavorite: (clubId: string) => void;
  addClubPhoto: (clubId: string, uri: string) => Promise<boolean>;
  removeClubPhoto: (clubId: string, uri: string) => Promise<boolean>;
  addClubOffer: (clubId: string, kind: 'offre' | 'actu' | 'evenement', title: string, detail: string) => Promise<boolean>;
  removeClubOffer: (clubId: string, id: string) => Promise<boolean>;
  // Photo « de profil » du club (celle de la carte) — null = la retirer. false = échec upload/serveur.
  setClubCover: (clubId: string, uri: string | null) => Promise<boolean>;
  // Une photo PAR TERRAIN (montre le terrain sur la fiche) — null = la retirer.
  setClubCourtPhoto: (clubId: string, court: string, uri: string | null) => Promise<boolean>;
  // L’ÉLÈVE demande un cours à un coach. Le terrain n’est PAS réservé ici : il le sera quand
  // le coach acceptera (puis le club confirmera la réservation — double validation).
  requestCoachLesson: (input: {
    coachId: string;
    clubId: string;
    clubName: string;
    dateKey: string;
    dateLabel: string;
    time: string;
    court: string;
    startsAt: number;
    price: number;
  }) => Promise<boolean>;
  // L’élève annule sa demande de cours EN ATTENTE (un cours accepté = une réservation normale).
  cancelMyLesson: (id: string) => Promise<boolean>;
  // Le COACH règle sa fiche : spécialité, tarif indicatif (null = non affiché), disponibilités.
  saveCoachSettings: (specialty: string, price: number | null, slots: string[]) => Promise<boolean>;
  // Recharge fiche coach + mes cours (pull-to-refresh de l’Espace Coach / « Mes réservations »).
  refreshLessons: () => Promise<void>;
  // Recharge les notes moyennes (après dépôt/suppression d’un avis — sinon les cartes des
  // listes garderaient l’ancienne moyenne jusqu’au prochain retour au premier plan).
  refreshClubRatings: () => Promise<void>;
  // ok = false si l’écriture SERVEUR échoue (l’appelant affiche un toast honnête au lieu d’un « ✓ »).
  setClubInfo: (clubId: string, patch: ClubInfo) => Promise<{ ok: boolean }>;
  setBoost: (clubId: string, days: number) => Promise<{ ok: boolean }>; // days > 0 active (expiration), 0 désactive — serveur
  setPaymentStatus: (clubId: string, weekKey: string, status: 'tofacture' | 'sent' | 'paid') => Promise<{ ok: boolean }>;
  requestClub: (input: {
    name: string;
    area: string;
    type: Club['type'];
    courts: number;
    priceFrom: number;
    contactPhone?: string;
  }) => void;
  cancelOwnClubRequest: (id: string) => void; // annule une demande « en attente » créée sur cet appareil
  // Demande d’inscription de club envoyée au SERVEUR (visible par l’opérateur).
  submitClubRequest: (input: {
    name: string;
    area: string;
    type?: Club['type'];
    courts?: number;
    priceFrom?: number;
    contactPhone?: string;
    message?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  // L’opérateur lit toutes les demandes (RLS) ; setStatus met à jour une demande.
  // On renvoie un drapeau ok pour distinguer « vide » d’un échec réseau/RLS.
  fetchClubRequests: () => Promise<{ ok: boolean; requests: ServerClubRequest[] }>;
  setClubRequestStatus: (id: string, status: ServerClubRequest['status']) => Promise<{ ok: boolean }>;
  // Approuve une demande côté SERVEUR : crée le club (visible par tous) + donne au
  // demandeur l’accès à son Espace Club. Recharge ensuite la liste des clubs serveur.
  approveClubRequest: (requestId: string) => Promise<{ ok: boolean; clubId?: string }>;
  // Opérateur : statut d’un club serveur (Actif / Bientôt / masqué) et pré-chargement d’un club.
  operatorSetClubStatus: (clubId: string, status: 'active' | 'coming_soon' | 'hidden') => Promise<{ ok: boolean }>;
  // Opérateur : statut piloté de N’IMPORTE QUEL club, y compris les 9 de base embarqués.
  operatorSetBaseStatus: (clubId: string, status: 'active' | 'coming_soon' | 'hidden') => Promise<{ ok: boolean }>;
  // Opérateur : supprime définitivement un club serveur (+ données liées).
  operatorDeleteClub: (clubId: string) => Promise<{ ok: boolean }>;
  // Opérateur : accorde / retire l’accès « Espace Club » à un joueur via son numéro (tout club).
  operatorGrantClubAccess: (phone: string, clubId: string) => Promise<{ ok: boolean; name?: string }>;
  operatorRevokeClubAccess: (phone: string) => Promise<{ ok: boolean; name?: string }>;
  // Opérateur : commission propre à un club (taux 0–1, ex. 0.12 = 12 %).
  operatorSetClubCommission: (clubId: string, rate: number) => Promise<{ ok: boolean }>;
  // Club / opérateur : marque une réservation « pas venu » (absence comptée, créneau libéré).
  markNoShow: (id: string) => Promise<boolean>;
  operatorCreateClub: (input: {
    name: string;
    area: string;
    type: string;
    courts: number;
    priceFrom: number;
  }) => Promise<{ ok: boolean; clubId?: string }>;
  // Aide / signalements : le joueur envoie un message, l’opérateur les lit/traite.
  submitSupportMessage: (message: string, contactPhone?: string) => Promise<{ ok: boolean; error?: string }>;
  fetchSupportMessages: () => Promise<{ ok: boolean; messages: ServerSupportMessage[] }>;
  // Boucle de retour : le joueur relit SES messages d’aide et leur statut.
  // null = échec réseau (l’écran garde la liste affichée) ≠ [] = aucun message (convention §8).
  fetchMySupportMessages: () => Promise<ServerSupportMessage[] | null>;
  setSupportMessageStatus: (id: string, status: ServerSupportMessage['status']) => Promise<{ ok: boolean }>;
  approveClub: (id: string) => void;
  rejectClub: (id: string) => void;
  setManagedClub: (id: string) => void;
  // false = l’écriture SERVEUR a échoué (réseau/session) : le miroir local n’est PAS touché,
  // l’appelant doit prévenir le gérant (toast) au lieu de laisser la grille diverger en silence.
  setClubSlots: (clubId: string, slots: string[]) => Promise<boolean>;
  setClubCourts: (clubId: string, courts: string[]) => Promise<boolean>;
  blockSlot: (b: BlockedSlot, startsAt: number) => Promise<boolean>;
  unblockSlot: (clubId: string, dateKey: string, time: string, court: string) => Promise<boolean>;
  // Fermetures sur PÉRIODE (54). 'reservations' = une résa à venir vit dans la période.
  blockRange: (input: Omit<BlockedRange, 'id'>) => Promise<BlockRangeStatus>;
  unblockRange: (id: string) => Promise<boolean>;
  // Fermetures RÉCURRENTES par terrain (54) — false = échec serveur, miroir intact.
  setCourtClosed: (clubId: string, closed: Record<string, string[]>) => Promise<boolean>;
  // ok = false quand l’écriture SERVEUR a échoué (réseau/session) : l’actu reste alors visible
  // seulement sur le téléphone de l’opérateur — l’appelant doit le dire honnêtement.
  // `push` (47) : true = notify-club envoie AUSSI l’actu en notification à tous les joueurs.
  setOperatorNews: (news: { title: string; subtitle?: string; link?: string; push?: boolean }) => Promise<{ ok: boolean }>;
  removeOperatorNews: () => Promise<{ ok: boolean }>; // retire l’actu d’accueil publiée (attend le serveur)
  dismissNews: (id: string) => void;
  resetAll: () => void;
};

const AppContext = createContext<AppContextType | null>(null);
function computeStats(reservations: Reservation[], officialResults: OfficialResult[]): Stats {
  const now = Date.now();
  const played = reservations.filter((r) => isPlayed(r, now));
  return {
    played: played.length,
    tournamentsPlayed: officialResults.length,
    tournamentsWon: officialResults.filter((o) => o.result === 'win').length,
    // Série en cours (semaines consécutives avec ≥ 1 partie) — affichée sur le profil.
    streakWeeks: weeklyStreak(
      played.map((r) => r.startsAt),
      now,
    ),
  };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(initialState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        // On repart de l’état par défaut puis on superpose l’état persisté (champs connus).
        if (raw) {
          const parsed = { ...initialState, ...JSON.parse(raw) } as AppState;
          setClubStatusMap(parsed.clubStatus ?? {}); // statut « Bientôt » dès le 1er rendu
          setState(parsed);
        }
      } catch {
        // état par défaut
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  // Au démarrage, si une session serveur existe, on rafraîchit le profil ET le RÔLE
  // depuis Supabase (ainsi, dès que l’opérateur promeut un compte côté serveur, le
  // changement prend effet à la prochaine ouverture). Sans session → on ne touche à rien.
  // Préférence « rappels » lue par loadSession SANS la remettre dans ses dépendances
  // (sinon un simple basculement de l’interrupteur relancerait toute la session).
  const remindersOnRef = useRef(state.remindersOn);
  useEffect(() => {
    remindersOnRef.current = state.remindersOn;
  }, [state.remindersOn]);

  // NOTE : le NIVEAU est écrit par le client UNE SEULE FOIS, à l’inscription (choix initial du
  // joueur, borné [1.0, 7.0] côté serveur par handle_new_user — cf. supabase/36_audit_hardening.sql).
  // Ensuite, il n’est PLUS JAMAIS modifié par le client : seul close_competition (tournois
  // officiels) l’ajuste côté serveur, protégé en base par le trigger protect_level
  // (34_level_integrity.sql) — anti-triche. Le client se contente de LIRE `level` (loadSession,
  // reread après clôture) et de l’afficher.

  // « Époque » de session : incrémentée à chaque déconnexion / réinitialisation. Toute
  // requête en vol (loadSession, rafraîchissement au premier plan) capture l’époque au
  // départ et n’applique son résultat QUE si l’époque n’a pas changé entre-temps — sinon
  // une réponse tardive réécrirait les données d’un compte déjà déconnecté.
  const sessionEpochRef = useRef(0);
  // Id du compte serveur COURANT, suivi dans une ref (comme remindersOnRef) : permet à
  // loadSession de détecter une BASCULE de compte (A→B) au moment où elle s'exécute, sans
  // remettre serverUserId dans ses dépendances — pour bumper l'époque et invalider toute
  // requête en vol du compte A (ex. un refreshMirror premier-plan lancé juste avant la bascule).
  const serverUserIdRef = useRef<string | null>(state.serverUserId);
  useEffect(() => {
    serverUserIdRef.current = state.serverUserId;
  }, [state.serverUserId]);

  // Charge (ou recharge) la session serveur : profil + rôle, réservations, occupation,
  // participations et clubs serveur. Réutilisé au démarrage ET après la confirmation
  // d’e-mail (deep link) — d’où l’extraction en fonction stable.
  const loadSession = useCallback(async () => {
    let epoch = sessionEpochRef.current;
    const stillCurrent = () => sessionEpochRef.current === epoch;
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId || !stillCurrent()) return;
      // BASCULE de compte (A→B) : on bumpe l'époque AVANT de repartir sur un périmètre neuf, pour
      // qu'une requête en vol du compte A (refreshMirror premier-plan qui avait capturé l'ancienne
      // époque) ne réécrive plus rien après. On réaligne l'époque locale pour que les gardes
      // PROPRES de loadSession (stillCurrent) restent valides après le bump.
      if (serverUserIdRef.current && serverUserIdRef.current !== userId) {
        sessionEpochRef.current += 1;
        epoch = sessionEpochRef.current;
        serverUserIdRef.current = userId;
      }
      void registerPushToken(userId); // jeton de push → profil (pour les notifs serveur)
      // On connaît la session → mode « réservations serveur ». Si on CHANGE de compte
      // (userId différent de celui en mémoire), on repart d’un périmètre personnel NEUF
      // pour ne jamais montrer les données du compte précédent (amis, favoris, miroir…).
      setState((s) =>
        s.serverUserId === userId
          ? { ...s, serverUserId: userId }
          : {
              ...s,
              serverUserId: userId,
              reservations: [],
              participantReservationIds: [],
              pendingInvitationIds: [],
              occupancy: [],
              friends: [],
              friendRequests: [],
              favoriteClubIds: [],
              userReviews: [],
              myCompetitions: [],
              compRegistrations: {},
              compResults: {},
              officialResults: [],
              // Fiche coach et cours = données du COMPTE : jamais héritées du précédent
              // (sinon, si le fetch qui suit échoue, l'« Espace Coach » de l’ancien compte
              // resterait visible pour le nouveau).
              coachProfile: null,
              myLessons: [],
              level: initialState.level,
              // Profil aussi : sans quoi les replis `?? s.account?.…` ci-dessous feraient
              // hériter photo / date de naissance / genre de l'ANCIEN compte au nouveau
              // (bascule via lien de confirmation cliqué alors qu'un autre compte est connecté).
              account: null,
              // Rôle et périmètres SENSIBLES aussi (mêmes défauts que loggedOutState) : si la
              // relecture du profil échoue juste après la bascule, le nouveau compte ne doit
              // pas hériter d'un rôle opérateur/gérant ni des miroirs financiers de l'ancien.
              role: 'player',
              accountType: 'player',
              serverManagedClubId: null,
              blockedUserIds: [],
              clubCommission: {},
              operatorPayments: {},
            },
      );
      const { data: prof, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (!stillCurrent()) return;
      // Hors-ligne / erreur réseau : on GARDE le profil et le rôle persistés localement
      // (pas de rétrogradation silencieuse d’un gérant/opérateur qui ouvre l’app sans réseau).
      if (!error && prof) {
        const hydratedLevel = clampLevel(Number(prof.level ?? initialState.level));
        setState((s) => ({
          ...s,
          account: {
            firstName: prof.first_name ?? s.account?.firstName ?? '',
            lastName: prof.last_name ?? s.account?.lastName ?? '',
            phone: prof.phone ?? s.account?.phone ?? '',
            // L’e-mail d’AUTHENTIFICATION fait foi (il change après « changer d’e-mail », pas
            // profiles.email qui n’est renseigné qu’à la création) → on lit session.user.email.
            email: session?.user?.email ?? prof.email ?? s.account?.email,
            photoUri: prof.photo_uri ?? s.account?.photoUri,
            birthDate: prof.birth_date ?? s.account?.birthDate,
            gender: prof.gender ?? s.account?.gender,
          },
          role: (prof.role as AppState['role']) ?? 'player',
          accountType: prof.account_type === 'club' ? 'club' : 'player',
          serverManagedClubId: prof.managed_club_id ?? null,
          level: hydratedLevel,
        }));
        // Photo choisie à l’inscription (mise de côté avant confirmation e-mail) : si le serveur
        // n’a pas encore d’avatar, on l’envoie maintenant que la session existe, puis on efface.
        if (!prof.photo_uri) {
          void AsyncStorage.getItem(PENDING_AVATAR_KEY).then((pending) => {
            if (!pending || !stillCurrent()) return;
            void uploadAvatar(userId, pending).then((url) => {
              void AsyncStorage.removeItem(PENDING_AVATAR_KEY);
              if (!url || !stillCurrent()) return;
              setState((s) => ({ ...s, account: s.account ? { ...s.account, photoUri: url } : s.account }));
              void supabase.from('profiles').update({ photo_uri: url }).eq('id', userId);
            });
          });
        } else {
          void AsyncStorage.removeItem(PENDING_AVATAR_KEY); // avatar serveur déjà présent → on nettoie
        }
      }
      // Réservations : le serveur est la source de vérité → on remplace le miroir local
      // par les résas pertinentes (les miennes ; club/opérateur : celles de leur périmètre,
      // via RLS), l’occupation de TOUS (disponibilité), et les clubs ajoutés côté serveur.
      const [
        reservationsRes,
        occ,
        parts,
        serverClubs,
        overrides,
        clubStatus,
        configs,
        commissions,
        boosts,
        friends,
        friendReqs,
        serverComps,
        compRegs,
        tournamentFee,
        blocked,
        blockedRangesRes,
        opPayments,
        news,
        coachProfile,
        myLessons,
        ratings,
        blockedUsers,
      ] = await Promise.all([
        fetchReservations(),
        fetchOccupancy(),
        fetchMyParticipations(userId),
        fetchServerClubs(),
        fetchClubOverrides(),
        fetchClubStatus(),
        fetchClubConfigs(),
        fetchClubCommissions(),
        fetchClubBoosts(),
        fetchFriends(),
        fetchFriendRequests(),
        fetchCompetitions(userId),
        fetchMyCompRegistrations(),
        fetchTournamentFee(),
        fetchBlockedSlots(),
        fetchBlockedRanges(),
        fetchOperatorPayments(),
        fetchOperatorNews(),
        fetchMyCoachProfile(),
        fetchMyLessons(userId),
        fetchClubRatings(),
        fetchBlockedUserIds(),
      ]);
      if (!stillCurrent()) return; // déconnexion survenue pendant le chargement → on n’écrit rien
      // null = échec réseau → on garde les invitations existantes (≠ tableau vide = « aucune »).
      const split = parts ? splitParticipations(parts) : null;
      // Pour la resynchro des rappels ci-dessous uniquement : si le fetch a échoué, on ne re-planifie
      // que MES résas (les invitations déjà connues gardent leurs rappels déjà posés).
      const activeParts = split ? split.active : [];
      // null = échec réseau pour ce fetch → on garde l’existant (≠ tableau/objet vide = succès).
      if (clubStatus) setClubStatusMap(clubStatus); // registre lu dans data/clubs (badge « Bientôt »)
      setState((s) => ({
        ...s,
        // En cas d’échec réseau on garde le miroir persisté (offline-friendly).
        reservations: reservationsRes.ok ? reservationsRes.reservations : s.reservations,
        occupancy: occ ?? s.occupancy,
        participantReservationIds: split ? split.active : s.participantReservationIds,
        pendingInvitationIds: split ? split.pending : s.pendingInvitationIds,
        // Amis synchronisés (le serveur fait foi). null = échec réseau → on garde le miroir.
        friends: friends ?? s.friends,
        // Demandes d’ami reçues en attente (Accepter / Refuser). null = échec réseau → on garde.
        friendRequests: friendReqs ?? s.friendRequests,
        // null = échec réseau → on garde les clubs serveur déjà chargés (sinon ils disparaîtraient).
        customClubs: serverClubs ? mergeServerClubs(s.customClubs, serverClubs) : s.customClubs,
        clubStatus: clubStatus ?? s.clubStatus,
        clubCommission: commissions ?? s.clubCommission, // vide pour les non-opérateurs (RLS)
        // Boosts serveur (visibles par tous) : actifs = ceux dont l’expiration est future.
        boostExpiry: boosts ?? s.boostExpiry,
        boostedClubIds: boosts ? Object.keys(boosts).filter((id) => boosts[id] > Date.now()) : s.boostedClubIds,
        // Pages club éditées par les gérants (serveur) → visibles par tous. On fusionne au-dessus
        // des éventuelles surcharges locales (le serveur fait foi pour les clubs qu’il connaît).
        // null = échec réseau → on garde les surcharges déjà connues (convention §8).
        clubInfo: overrides ? { ...s.clubInfo, ...overrides } : s.clubInfo,
        // Config club partagée (horaires, terrains, offres, coachs, photos).
        ...clubConfigSlices(s, configs),
        // Tournois serveur (visibles par tous, synchronisés) + mes inscriptions + clôtures.
        ...competitionSlices(s, serverComps, compRegs),
        tournamentFee: tournamentFee ?? s.tournamentFee,
        // Créneaux fermés hors app (serveur) : source de vérité, visibles par tous les joueurs.
        blockedSlots: blocked ?? s.blockedSlots,
        // Fermetures sur période (54) : mêmes règles (null = échec réseau → on garde).
        blockedRanges: blockedRangesRes ?? s.blockedRanges,
        // Règlements opérateur (persistants). Vide pour les non-opérateurs (RLS).
        operatorPayments: opPayments ?? s.operatorPayments,
        // Actu d’accueil publiée par l’opérateur (visible par TOUS). undefined = échec réseau →
        // on garde l’existant ; null = aucune actu publiée → bandeau retiré.
        operatorNews: news === undefined ? s.operatorNews : news,
        // Ma fiche coach : undefined = échec réseau → on garde ; null = pas (ou plus) coach.
        coachProfile: coachProfile === undefined ? s.coachProfile : coachProfile,
        // Mes cours côté élève. null = échec réseau → on garde le miroir.
        myLessons: myLessons ?? s.myLessons,
        // Notes moyennes des clubs (cartes « 4.2 ★ (12) »). null = échec réseau → on garde.
        clubRatings: ratings ?? s.clubRatings,
        // Comptes que j'ai bloqués (modération 51). null = échec réseau → on garde le miroir.
        blockedUserIds: blockedUsers ?? s.blockedUserIds,
      }));
      // Resynchronise les rappels locaux (résas créées sur un autre appareil incluses). isOwner
      // distingue MES résas (je peux annuler) d’une invitation d’ami (rappels adaptés, cf.
      // scheduleMatchReminder) — sinon un invité recevait « annulation gratuite » / « confirme ton
      // équipe » alors qu’il n’a ni bouton Annuler ni équipe à confirmer.
      if (reservationsRes.ok) {
        const mine = reservationsRes.reservations
          .filter((r) => (!r.userId || r.userId === userId || activeParts.includes(r.id)) && r.startsAt > Date.now())
          .map((r) => ({ ...r, isOwner: !r.userId || r.userId === userId }));
        void syncMatchReminders(mine, remindersOnRef.current);
      }
    } catch {
      // getSession a échoué (réseau) : on reste sur l’état local hydraté, sans crash.
    }
  }, []);

  // Recharge les tournois serveur + mes inscriptions et les fusionne (foreground et après
  // une création/inscription/clôture). null = échec réseau → on garde l’existant.
  const refreshCompetitions = useCallback(async (userId: string) => {
    const epoch = sessionEpochRef.current;
    const [serverComps, compRegs] = await Promise.all([fetchCompetitions(userId), fetchMyCompRegistrations()]);
    if (!serverComps && !compRegs) return;
    if (sessionEpochRef.current !== epoch) return; // déconnexion pendant la requête → pas d’écriture tardive
    setState((s) => ({ ...s, ...competitionSlices(s, serverComps, compRegs) }));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    // IIFE asynchrone : les setState de loadSession surviennent APRÈS un await (jamais de
    // façon synchrone dans le corps de l’effet) → pas de cascade de rendus.
    void (async () => {
      await loadSession();
    })();
  }, [hydrated, loadSession]);

  // Session révoquée À L’EXTÉRIEUR de l’app (jeton de rafraîchissement expiré/invalide,
  // compte supprimé côté serveur, mot de passe changé ailleurs) : Supabase émet SIGNED_OUT.
  // On remet alors l’app en état déconnecté pour ne pas laisser un compte « fantôme » affiché
  // avec des données qui ne se rechargeront plus. Notre propre signOut a déjà nettoyé l’état :
  // le garde `s.serverUserId` rend ce reset idempotent (aucune action si déjà déconnecté).
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== 'SIGNED_OUT') return;
      sessionEpochRef.current += 1; // invalide toute requête en vol du compte sortant
      void syncMatchReminders([], false);
      setState((s) => (s.serverUserId ? loggedOutState(s) : s));
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // Retour au premier plan OU push reçu APP OUVERTE : on rafraîchit l’occupation (et mes
  // résas) pour que l’écran ne reste pas figé — sans le second déclencheur, une bannière
  // « Réservation confirmée » pouvait s’afficher au-dessus d’un écran encore périmé.
  useEffect(() => {
    if (!state.serverUserId) return;
    const userId = state.serverUserId;
    // Même resynchronisation que loadSession, en UN SEUL setState : les ~17 réponses réseau
    // arrivaient avant dans des tâches séparées (un setState chacune) → rafale de re-renders
    // de toute l'app à chaque retour au premier plan. Chaque champ garde son repli §8
    // (`?? s.existant`) : un fetch en échec n'écrase jamais le miroir local.
    const refreshMirror = () => {
      // On capture l’époque au déclenchement : si une déconnexion survient pendant les
      // requêtes, leurs résultats tardifs ne réécriront pas les données du compte sortant.
      const epoch = sessionEpochRef.current;
      const ok = () => sessionEpochRef.current === epoch;
      void (async () => {
        try {
          const [
            occ,
            reservationsRes,
            parts,
            friends,
            friendReqs,
            coachProfile,
            myLessons,
            ratings,
            news,
            blocked,
            blockedRangesRes,
            opPayments,
            serverClubs,
            overrides,
            clubStatus,
            boosts,
            configs,
            serverComps,
            compRegs,
            blockedUsers,
            prof,
          ] = await Promise.all([
            fetchOccupancy(),
            fetchReservations(),
            fetchMyParticipations(userId),
            // Amis ajoutés/retirés sur un autre appareil + nouvelles demandes reçues.
            fetchFriends(),
            fetchFriendRequests(),
            // Fiche coach (le club a pu me promouvoir/retirer) + mes cours (réponse du coach).
            fetchMyCoachProfile(),
            fetchMyLessons(userId),
            // Notes moyennes, actu d’accueil, créneaux fermés hors app, règlements opérateur.
            fetchClubRatings(),
            fetchOperatorNews(),
            fetchBlockedSlots(),
            fetchBlockedRanges(),
            fetchOperatorPayments(),
            fetchServerClubs(),
            // Pages club éditées ailleurs (infos, tarifs, Maps) : sans cette relecture, le
            // formulaire du gérant repartait d'un miroir périmé au retour au premier plan.
            fetchClubOverrides(),
            // Statut « Bientôt »/masquage + boosts + config partagée (horaires, terrains, photos).
            fetchClubStatus(),
            fetchClubBoosts(),
            fetchClubConfigs(),
            // Tournois créés/validés/clôturés sur un autre appareil.
            fetchCompetitions(userId),
            fetchMyCompRegistrations(),
            // Comptes bloqués (un blocage fait sur un autre appareil masque ici aussi).
            fetchBlockedUserIds(),
            // RÔLE/profil : si l’opérateur vient d’accorder l’accès gérant (#39), l'Espace
            // Club apparaît au retour dans l’app, sans réinstaller.
            supabase
              .from('profiles')
              .select('role, managed_club_id, level, account_type')
              .eq('id', userId)
              .maybeSingle()
              .then(({ data }) => data),
          ]);
          if (!ok()) return;
          // null = échec réseau → on garde les invitations existantes (convention §8).
          const split = parts ? splitParticipations(parts) : null;
          if (clubStatus) setClubStatusMap(clubStatus); // registre lu dans data/clubs (« Bientôt »)
          setState((s) => ({
            ...s,
            occupancy: occ ?? s.occupancy,
            reservations: reservationsRes.ok ? reservationsRes.reservations : s.reservations,
            participantReservationIds: split ? split.active : s.participantReservationIds,
            pendingInvitationIds: split ? split.pending : s.pendingInvitationIds,
            friends: friends ?? s.friends,
            friendRequests: friendReqs ?? s.friendRequests,
            // undefined = échec réseau → on garde ; null = pas (ou plus) coach / d'actu.
            coachProfile: coachProfile === undefined ? s.coachProfile : coachProfile,
            myLessons: myLessons ?? s.myLessons,
            clubRatings: ratings ?? s.clubRatings,
            operatorNews: news === undefined ? s.operatorNews : news,
            blockedSlots: blocked ?? s.blockedSlots,
            blockedRanges: blockedRangesRes ?? s.blockedRanges,
            operatorPayments: opPayments ?? s.operatorPayments,
            customClubs: serverClubs ? mergeServerClubs(s.customClubs, serverClubs) : s.customClubs,
            clubInfo: overrides ? { ...s.clubInfo, ...overrides } : s.clubInfo,
            clubStatus: clubStatus ?? s.clubStatus,
            boostExpiry: boosts ?? s.boostExpiry,
            boostedClubIds: boosts ? Object.keys(boosts).filter((id) => boosts[id] > Date.now()) : s.boostedClubIds,
            ...clubConfigSlices(s, configs),
            ...competitionSlices(s, serverComps, compRegs),
            blockedUserIds: blockedUsers ?? s.blockedUserIds,
            role: prof ? ((prof.role as AppState['role']) ?? s.role) : s.role,
            accountType: prof ? (prof.account_type === 'club' ? 'club' : 'player') : s.accountType,
            serverManagedClubId: prof ? (prof.managed_club_id ?? null) : s.serverManagedClubId,
            level: prof ? clampLevel(Number(prof.level ?? s.level)) : s.level,
          }));
          // Resynchronise les rappels locaux (même bloc que loadSession) : un match annulé par
          // son créateur (ou une invitation refusée ailleurs) perd son rappel sans redémarrage.
          if (reservationsRes.ok) {
            const activeParts = split ? split.active : [];
            const mine = reservationsRes.reservations
              .filter((r) => (!r.userId || r.userId === userId || activeParts.includes(r.id)) && r.startsAt > Date.now())
              .map((r) => ({ ...r, isOwner: !r.userId || r.userId === userId }));
            void syncMatchReminders(mine, remindersOnRef.current);
          }
        } catch {
          // échec réseau global : on reste sur le miroir local, sans crash (comme loadSession)
        }
      })();
    };
    const sub = RNAppState.addEventListener('change', (st) => st === 'active' && refreshMirror());
    // Même resynchronisation quand un push arrive alors que l’app est déjà au premier plan.
    const offPush = onPushReceivedInForeground(refreshMirror);
    return () => {
      sub.remove();
      offPush();
    };
  }, [state.serverUserId]);

  // Expiration AUTOMATIQUE des boosts « Sponsorisé » : à l’ouverture et à chaque retour au
  // premier plan, on retire ceux dont la date est dépassée — aucun badge doré ne traîne
  // après son terme, sans intervention de l’opérateur.
  useEffect(() => {
    if (!hydrated) return;
    const sweep = () =>
      setState((s) => {
        const now = Date.now();
        const expired = s.boostedClubIds.filter((id) => s.boostExpiry[id] && s.boostExpiry[id] <= now);
        if (expired.length === 0) return s;
        const boostExpiry = { ...s.boostExpiry };
        expired.forEach((id) => delete boostExpiry[id]);
        return { ...s, boostedClubIds: s.boostedClubIds.filter((id) => !expired.includes(id)), boostExpiry };
      });
    // Premier balayage DIFFÉRÉ (pas de setState synchrone dans le corps de l’effet — règle
    // React Compiler), puis à chaque retour au premier plan.
    const t = setTimeout(sweep, 0);
    const sub = RNAppState.addEventListener('change', (st) => st === 'active' && sweep());
    return () => {
      clearTimeout(t);
      sub.remove();
    };
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const persist = async () => {
      try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        // Sauvegarde complète OK → on lève l’éventuel drapeau « stockage plein ».
        setState((s) => (s.storageFull ? { ...s, storageFull: false } : s));
      } catch {
        // Quota dépassé (photos volumineuses en data-uri) : plutôt que de TOUT perdre
        // silencieusement (offres, coachs…), on persiste sans les photos ET on prévient
        // l’utilisateur via le drapeau storageFull (bandeau dans l’Espace Club).
        try {
          const slim = {
            ...state,
            clubPhotos: {},
            // Aussi les covers / photos par terrain : en data-URI (web/démo) elles peuvent avoir
            // rempli le quota à elles seules → sans ça, la 2ᵉ écriture échouait aussi et tout était perdu.
            clubCovers: {},
            clubCourtPhotos: {},
            account: state.account ? { ...state.account, photoUri: undefined } : null,
          };
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
        } catch {
          // stockage indisponible — l’app continue en mémoire
        }
        setState((s) => (s.storageFull ? s : { ...s, storageFull: true }));
      }
    };
    // Debounce : une rafale de petites mutations (saisie d’un champ, bascule d’un favori) ne
    // déclenche qu’UNE sérialisation après un court silence, au lieu d’un JSON.stringify + write
    // à chaque frappe. Compromis accepté : une mutation dans les 500 ms précédant une fermeture
    // brutale peut ne pas être persistée (miroir best-effort, le serveur reste la source de vérité).
    // MAIS certaines préférences (rappels, favoris, actu fermée…) ne vivent QUE localement — pas
    // de filet serveur pour elles — d’où le flush immédiat au passage en arrière-plan ci-dessous.
    let t: ReturnType<typeof setTimeout> | null = setTimeout(persist, 500);
    const sub = RNAppState.addEventListener('change', (st) => {
      if (st === 'active' || !t) return;
      clearTimeout(t);
      t = null;
      void persist();
    });
    return () => {
      if (t) clearTimeout(t);
      sub.remove();
    };
  }, [state, hydrated]);

  // MES réservations — source unique pour tout calcul PERSONNEL. En mode serveur, un compte
  // club/opérateur reçoit aussi les résas de son périmètre (RLS) ; on filtre donc sur mon
  // user_id pour ne jamais afficher/compter celles des autres comme les miennes.
  // En mode serveur : mes résas = celles que J’AI créées + celles où un ami m’a invité
  // (participantReservationIds) — ces dernières apparaissent chez moi sans recompter la
  // commission (une résa = un terrain = une commission, comptée chez l’auteur).
  const myReservations = useMemo(
    () =>
      state.serverUserId
        ? state.reservations.filter((r) => !r.userId || r.userId === state.serverUserId || state.participantReservationIds.includes(r.id))
        : state.reservations,
    [state.reservations, state.serverUserId, state.participantReservationIds],
  );

  const stats = useMemo(() => computeStats(myReservations, state.officialResults), [myReservations, state.officialResults]);

  const api = useMemo<AppContextType>(
    () => ({
      state,
      hydrated,
      stats,
      myReservations,
      setAccount: (a) => setState((s) => ({ ...s, account: a })),
      updateAccount: async (patch) => {
        const prev = state.account; // snapshot AVANT l'écriture optimiste — pour un rollback honnête
        setState((s) => ({ ...s, account: s.account ? { ...s.account, ...patch } : s.account }));
        // Persistance SERVEUR des champs texte modifiés (si connecté) : sans ça, ils étaient
        // écrasés par l’ancienne valeur serveur au prochain chargement.
        const userId = state.serverUserId;
        if (!userId) return { photoSaved: true, profileSaved: true };
        const row: Record<string, string | null> = {};
        // Filet de sécurité : ne jamais écraser prénom/nom/téléphone par une chaîne vide côté
        // serveur (l’écran d’édition valide déjà, mais on protège aussi ce point d’entrée).
        if (patch.firstName !== undefined && patch.firstName.trim()) row.first_name = patch.firstName.trim();
        if (patch.lastName !== undefined && patch.lastName.trim()) row.last_name = patch.lastName.trim();
        if (patch.phone !== undefined && patch.phone.trim()) row.phone = patch.phone.trim();
        if (patch.birthDate !== undefined) row.birth_date = patch.birthDate?.trim() || null;
        if (patch.gender !== undefined) row.gender = patch.gender ?? null;
        // Champs texte ATTENDUS comme la photo : en fire-and-forget, un « enregistré » hors-ligne
        // mentait et l'ancien prénom/numéro serveur revenait silencieusement au prochain lancement
        // (le numéro sert aux clubs et à la correspondance amis/coachs — une divergence casse tout ça).
        let profileSaved = true;
        if (Object.keys(row).length > 0) {
          const { error } = await supabase.from('profiles').update(row).eq('id', userId);
          if (error) {
            profileSaved = false;
            // Échec serveur (hors-ligne…) : on REVIENT aux valeurs précédentes des champs texte
            // concernés — comme le fait déjà la photo — sinon l'écran affiche un prénom/numéro
            // « enregistré » à tort jusqu'au prochain loadSession, alors que le serveur garde l'ancien.
            setState((s) => {
              if (!s.account) return s;
              const a = { ...s.account };
              if (patch.firstName !== undefined) a.firstName = prev?.firstName ?? a.firstName;
              if (patch.lastName !== undefined) a.lastName = prev?.lastName ?? a.lastName;
              if (patch.phone !== undefined) a.phone = prev?.phone ?? a.phone;
              if (patch.birthDate !== undefined) a.birthDate = prev?.birthDate;
              if (patch.gender !== undefined) a.gender = prev?.gender;
              return { ...s, account: a };
            });
          }
        }
        // PHOTO : on l’envoie au stockage (survit à une réinstallation, synchro multi-appareils).
        // On ATTEND le résultat (≠ fire-and-forget) pour que l’appelant sache honnêtement si la
        // photo a bien été enregistrée, au lieu d’un toast de succès mensonger en cas d’échec réseau.
        if ('photoUri' in patch) {
          const uri = patch.photoUri;
          if (uri && !uri.startsWith('http')) {
            // Nouvelle photo locale → upload, puis on remplace l’URI locale par l’URL publique.
            const prevPhoto = state.account?.photoUri; // photo AVANT ce changement (snapshot)
            const url = await uploadAvatar(userId, uri);
            if (!url) {
              // Échec d’upload : on NE conserve PAS l’URI locale file:// (illisible après une
              // réinstallation ou sur un autre appareil) → on revient à la photo précédente.
              setState((s) => ({ ...s, account: s.account ? { ...s.account, photoUri: prevPhoto } : s.account }));
              return { photoSaved: false, profileSaved };
            }
            setState((s) => ({ ...s, account: s.account ? { ...s.account, photoUri: url } : s.account }));
            // L'écriture de la LIGNE profil est attendue elle aussi : un upload Storage réussi
            // avec une ligne non mise à jour laissait « photoSaved: true » mentir.
            const { error: photoErr } = await supabase.from('profiles').update({ photo_uri: url }).eq('id', userId);
            if (photoErr) return { photoSaved: false, profileSaved };
          } else {
            // Photo retirée (uri vide) ou déjà une URL serveur → on reflète tel quel côté serveur.
            const { error: photoErr } = await supabase
              .from('profiles')
              .update({ photo_uri: uri ?? null })
              .eq('id', userId);
            if (photoErr) return { photoSaved: false, profileSaved };
          }
        }
        return { photoSaved: true, profileSaved };
      },
      // ── Inscription par E-MAIL (parcours principal) ────────────────────────
      // E-mail réel + mot de passe ; le téléphone est conservé (sans SMS). Avec la
      // confirmation d’e-mail activée côté Supabase, le compte est créé mais SANS session :
      // le profil est rempli automatiquement côté serveur (trigger handle_new_user) à
      // partir des `data` ci-dessous, et la session s’ouvre quand l’utilisateur clique le
      // lien de confirmation (deep link → refreshSession).
      signUpWithEmail: async (email, password, phone, profile) => {
        const cleanEmail = email.trim().toLowerCase();
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            emailRedirectTo: Linking.createURL('auth-callback'),
            data: {
              first_name: profile.firstName.trim(),
              last_name: profile.lastName.trim(),
              phone: phone.trim(),
              birth_date: profile.birthDate?.trim() || null,
              gender: profile.gender ?? null,
              level: clampLevel(profile.level ?? 3.0),
              referred_by: profile.referralCode?.trim() || null,
              // Compte CLUB : le trigger serveur (56) lit ces clés pour poser account_type
              // et créer la demande d’inscription du club (validée ensuite par l’opérateur).
              account_type: profile.accountType === 'club' ? 'club' : 'player',
              club_name: profile.club?.name?.trim() || null,
              club_area: profile.club?.area?.trim() || null,
              club_type: profile.club?.type || null,
              club_courts: profile.club?.courts ?? null,
              club_price_from: profile.club?.priceFrom ?? null,
            },
          },
        });
        if (error) return { ok: false, error: frAuthError(error.message) };
        // E-mail DÉJÀ utilisé : Supabase ne renvoie pas d’erreur (anti-énumération) mais
        // un user « factice » sans identités. On le détecte pour éviter d’afficher un faux
        // « vérifiez vos e-mails » et on oriente vers la connexion.
        if (data.user && data.user.identities?.length === 0) {
          return { ok: false, error: 'Cet e-mail a déjà un compte. Connecte-toi plutôt.' };
        }
        // Photo choisie à l’inscription : on la met de côté (pas encore de session pour l’envoyer
        // au stockage). loadSession l’enverra à la 1ʳᵉ ouverture de session, puis effacera la clé.
        // On efface D’ABORD systématiquement une éventuelle clé laissée par une inscription
        // PRÉCÉDENTE jamais confirmée sur cet appareil (sinon sa photo « fuiterait » vers ce
        // nouveau compte à la prochaine connexion) — on ne la repose que si CETTE inscription a
        // vraiment une photo à envoyer.
        await AsyncStorage.removeItem(PENDING_AVATAR_KEY);
        const pendingPhoto = profile.photoUri;
        if (pendingPhoto && !/^https?:\/\//.test(pendingPhoto)) {
          await AsyncStorage.setItem(PENDING_AVATAR_KEY, pendingPhoto);
        }
        track('signup_completed', { needsConfirm: !data.session });
        // Confirmation requise → pas encore de session : on invite à valider l’e-mail.
        if (!data.session) return { ok: true, needsConfirm: true };
        // Confirmation désactivée (selon config) → session immédiate : on charge tout.
        await loadSession();
        return { ok: true };
      },
      // Connexion par e-mail (compte déjà confirmé).
      signInWithEmail: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
        if (error) return { ok: false, error: frAuthError(error.message) };
        await loadSession();
        return { ok: true };
      },
      refreshSession: loadSession,
      // Ajouter / changer l’e-mail du compte : Supabase envoie un lien de confirmation à la
      // NOUVELLE adresse ; le changement ne s’applique qu’après le clic sur ce lien.
      updateEmail: async (email) => {
        const clean = email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return { ok: false, error: 'Adresse e-mail invalide.' };
        const { error } = await supabase.auth.updateUser({ email: clean }, { emailRedirectTo: Linking.createURL('auth-callback') });
        if (error) return { ok: false, error: frAuthError(error.message) };
        return { ok: true };
      },
      // Connexion serveur héritée — comptes créés AVANT l’e-mail, via le téléphone (e-mail
      // interne sans SMS). On se connecte puis on délègue à loadSession : une SEULE source
      // de vérité pour le chargement profil + résas + occupation (pas de doublon à maintenir).
      signInWithPhone: async (phone, password) => {
        const email = phoneToAuthEmail(phone);
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return { ok: false, error: frAuthError(error.message) };
        await loadSession();
        return { ok: true };
      },
      signOut: () => {
        // On efface d’ABORD le jeton push du profil sortant (session/RLS encore valides), sinon
        // l’ancien compte continuerait de recevoir sur ce téléphone les notifs d’un autre compte.
        const outgoing = state.serverUserId;
        if (outgoing)
          void supabase
            .from('profiles')
            .update({ expo_push_token: null })
            .eq('id', outgoing)
            .then(() => {});
        sessionEpochRef.current += 1; // invalide toute requête en vol du compte sortant
        // HORS-LIGNE, auth-js n'efface PAS la session locale quand la révocation serveur échoue
        // (signOut résout avec { error } sans retirer la session) : le compte « ressusciterait »
        // au prochain lancement. En cas d'échec, on efface la session persistée NOUS-MÊMES —
        // le refresh token restera simplement non révoqué côté serveur, sans session locale.
        void supabase.auth.signOut().then(({ error }) => {
          if (error) void AsyncStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY).catch(() => {});
        });
        void syncMatchReminders([], false); // on efface les rappels locaux du compte sortant
        // Anti-fuite de photo entre comptes sur le même appareil : une clé orpheline (inscription
        // jamais confirmée) ne doit pas être reprise par le PROCHAIN compte connecté ici.
        void AsyncStorage.removeItem(PENDING_AVATAR_KEY);
        // Purge disque IMMÉDIATE (sans attendre le persist débouncé de 500 ms) : un kill/crash
        // juste après la déconnexion ne doit pas réhydrater le compte sortant au prochain
        // lancement (getSession ne renverrait rien → l'état fantôme resterait affiché).
        const cleared = loggedOutState(state);
        void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cleared)).catch(() => {});
        setState(cleared);
      },
      // Réinitialisation du mot de passe : envoie un lien par e-mail qui rouvre l’app sur l’écran
      // DÉDIÉ « reset-password » (≠ auth-callback de la confirmation d’inscription) où l’utilisateur
      // saisit un NOUVEAU mot de passe. Pas d’erreur révélée si l’e-mail n’existe pas (anti-énumération).
      resetPassword: async (email) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
          redirectTo: Linking.createURL('reset-password'),
        });
        if (error) return { ok: false, error: frAuthError(error.message) };
        return { ok: true };
      },
      // Renvoie l’e-mail de confirmation d’inscription (si l’utilisateur ne l’a pas reçu / l’a perdu).
      resendConfirmation: async (email) => {
        const { error } = await supabase.auth.resend({
          type: 'signup',
          email: email.trim().toLowerCase(),
          options: { emailRedirectTo: Linking.createURL('auth-callback') },
        });
        if (error) return { ok: false, error: frAuthError(error.message) };
        return { ok: true };
      },
      // Suppression DÉFINITIVE du compte (exigence App Store / Google Play). Le serveur efface
      // la ligne auth.users → cascade sur profil/résas/parrainages ; puis on revient à l’écran
      // d’accueil dans un état neuf. Irréversible : l’écran appelant confirme avant d’appeler.
      deleteAccount: async () => {
        const { error } = await supabase.rpc('delete_account');
        if (error) return { ok: false, error: 'Suppression impossible — réessaie dans un instant.' };
        sessionEpochRef.current += 1;
        // Même repli que signOut : auth-js RÉSOUT avec { error } sans purger la session locale
        // quand la révocation serveur échoue (réseau) — on la retire alors nous-mêmes, sinon une
        // session fantôme d'un compte SUPPRIMÉ resurgit au prochain lancement.
        void supabase.auth.signOut().then(({ error }) => {
          if (error) void AsyncStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY).catch(() => {});
        });
        void syncMatchReminders([], false);
        void AsyncStorage.removeItem(PENDING_AVATAR_KEY); // anti-fuite de photo vers le prochain compte
        // Même purge disque immédiate que signOut (le compte n'existe PLUS : aucune trace à garder).
        const cleared = loggedOutState(state);
        void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cleared)).catch(() => {});
        setState(cleared);
        return { ok: true };
      },
      // Clôture par l’ORGANISATEUR (ou le club hôte) : fige le vainqueur + podium. Le NIVEAU des
      // joueurs inscrits est attribué UNE SEULE FOIS côté serveur (close_competition, tournois
      // officiels) → jamais recalculé côté client (pas de double attribution à la réinstallation).
      closeCompetition: async (comp, winnerName, winnerIsMe, loserName, loserIsMe, podium) => {
        const epoch = sessionEpochRef.current; // pour ignorer une réponse tardive après déconnexion
        const serverComp = state.myCompetitions.find((c) => c.id === comp.id && c.server);
        if (serverComp) {
          const ok = await closeCompetitionRpc(comp.id, {
            winner: winnerName,
            second: podium?.second,
            third: podium?.third,
            loser: loserName,
          });
          if (!ok) return false; // le serveur a refusé (droits)
          if (state.serverUserId) {
            // Rejoue clôture + palmarès depuis le serveur, puis relit MON niveau (attribué côté
            // serveur si j’ai gagné/perdu) pour l’afficher immédiatement. Lecture ATTENDUE (pas un
            // .then() détaché) et gardée par l’époque de session (pas d’écriture tardive).
            const uid = state.serverUserId;
            await refreshCompetitions(uid);
            const { data } = await supabase.from('profiles').select('level').eq('id', uid).maybeSingle();
            if (data && sessionEpochRef.current === epoch) {
              setState((s) => ({ ...s, level: clampLevel(Number(data.level ?? state.level)) }));
            }
          }
          return true;
        }
        // Mode LOCAL (démo hors session, tournoi non serveur) : palmarès + niveau locaux.
        setState((s) => {
          if (s.compResults[comp.id]) return s; // déjà clôturé
          const compResults = {
            ...s.compResults,
            [comp.id]: {
              winner: winnerName.trim(),
              second: podium?.second?.trim() || undefined,
              third: podium?.third?.trim() || undefined,
              loser: loserName?.trim() || undefined,
              closedAt: Date.now(),
            },
          };
          const registered = !!s.compRegistrations[comp.id];
          const already = s.officialResults.some((o) => o.compId === comp.id);
          if (!registered || already) return { ...s, compResults };
          let level = s.level;
          let result: 'win' | 'played' | 'last' = 'played';
          if (winnerIsMe && comp.official) {
            level = clampLevel(level + LEVEL_STEP);
            result = 'win';
          } else if (loserIsMe && comp.official) {
            level = clampLevel(level - LEVEL_PENALTY);
            result = 'last';
          }
          return {
            ...s,
            compResults,
            level,
            officialResults: [
              { id: uid(), compId: comp.id, title: comp.title, result, at: Date.now(), levelAfter: level },
              ...s.officialResults,
            ],
          };
        });
        return true;
      },
      setRemindersOn: (on) => {
        setState((s) => ({ ...s, remindersOn: on }));
        // (Dé)programme les rappels locaux pour MES résas à venir (pas celles des autres,
        // qu’un compte club/opérateur reçoit via RLS) selon l’interrupteur. isOwner distingue
        // mes réservations d’une invitation d’ami (rappels adaptés, cf. scheduleMatchReminder).
        const upcoming = myReservations
          .filter((r) => r.startsAt > Date.now())
          .map((r) => ({ ...r, isOwner: !r.userId || r.userId === state.serverUserId }));
        void syncMatchReminders(upcoming, on);
      },
      setReserverView: (v) => setState((s) => ({ ...s, reserverView: v })),
      // Création : serveur (visible par tous, synchronisé) si connecté — club → publié direct,
      // joueur → en attente de validation du club hôte. Sinon ajout local (démo hors session).
      addCompetition: async (c) => {
        if (state.serverUserId) {
          const newId = await createCompetitionRpc({
            title: c.title,
            organizerType: c.organizerType,
            organizerName: c.organizer,
            organizerPhone: state.account?.phone,
            clubId: c.clubId,
            clubName: c.clubName,
            dateKey: c.dateKey,
            endDateKey: c.endDateKey,
            courts: c.courtNames ?? [],
            slots: c.timeSlots ?? [],
            capacity: c.slots,
            fee: c.fee,
            reward: c.reward,
            format: c.format,
            level: c.level,
          });
          if (!newId) return { ok: false };
          await refreshCompetitions(state.serverUserId);
          track('competition_created', { organizerType: c.organizerType, clubId: c.clubId });
          return { ok: true };
        }
        setState((s) => ({ ...s, myCompetitions: [{ ...c, id: uid(), createdByMe: true, server: false }, ...s.myCompetitions] }));
        return { ok: true };
      },
      // Le club hôte (ou l’opérateur) valide un tournoi créé par un joueur (« en attente » → visible).
      // Renvoie false si le serveur a refusé (réseau/droits) → l’UI affiche l’échec au lieu de se taire.
      approveCompetition: async (id) => {
        const serverComp = state.myCompetitions.find((c) => c.id === id && c.server);
        if (serverComp) {
          const ok = await approveCompetitionRpc(id);
          if (ok && state.serverUserId) await refreshCompetitions(state.serverUserId);
          return ok;
        }
        setState((s) => ({ ...s, myCompetitions: s.myCompetitions.map((c) => (c.id === id ? { ...c, status: 'approved' } : c)) }));
        return true;
      },
      // Le club hôte refuse un tournoi joueur « en attente » → « refusé » (jamais publié).
      // Le motif (optionnel) est stocké côté serveur et montré à l’organisateur (fiche + push).
      rejectCompetition: async (id, reason = '') => {
        const serverComp = state.myCompetitions.find((c) => c.id === id && c.server);
        if (serverComp) {
          const ok = await rejectCompetitionRpc(id, reason);
          if (ok && state.serverUserId) await refreshCompetitions(state.serverUserId);
          return ok;
        }
        setState((s) => ({
          ...s,
          myCompetitions: s.myCompetitions.map((c) =>
            c.id === id ? { ...c, status: 'rejected', rejectReason: reason.trim() || undefined } : c,
          ),
        }));
        return true;
      },
      deleteCompetition: async (id) => {
        const serverComp = state.myCompetitions.find((c) => c.id === id && c.server);
        if (serverComp) {
          const ok = await deleteCompetitionRpc(id);
          if (!ok) return false; // le serveur a refusé (droits/hors-ligne) → on ne retire rien localement
        }
        setState((s) => {
          const regs = { ...s.compRegistrations };
          delete regs[id];
          return { ...s, myCompetitions: s.myCompetitions.filter((c) => c.id !== id), compRegistrations: regs };
        });
        return true;
      },
      registerCompetition: async (id, partner) => {
        const serverComp = state.myCompetitions.find((c) => c.id === id && c.server);
        if (serverComp) {
          const ok = await registerCompetitionRpc(id, partner);
          if (!ok) return false; // tournoi complet / non publié / échec → on ne confirme pas
        }
        setState((s) =>
          s.compRegistrations[id]
            ? s
            : { ...s, compRegistrations: { ...s.compRegistrations, [id]: { partner: partner.trim() || 'Partenaire', at: Date.now() } } },
        );
        if (serverComp && state.serverUserId) void refreshCompetitions(state.serverUserId); // maj du compteur d’inscrits
        return true;
      },
      unregisterCompetition: async (id) => {
        const serverComp = state.myCompetitions.find((c) => c.id === id && c.server);
        if (serverComp) {
          const ok = await unregisterCompetitionRpc(id);
          if (!ok) return false;
        }
        setState((s) => {
          const next = { ...s.compRegistrations };
          delete next[id];
          return { ...s, compRegistrations: next };
        });
        if (serverComp && state.serverUserId) void refreshCompetitions(state.serverUserId);
        return true;
      },
      // Opérateur : règle le frais fixe appliqué aux futurs tournois joueurs.
      setTournamentFee: async (amount) => {
        const ok = await setTournamentFeeRpc(amount);
        if (!ok) return { ok: false };
        setState((s) => ({ ...s, tournamentFee: Math.max(0, Math.round(amount)) }));
        return { ok: true };
      },
      // Opérateur : enregistre le lien de paiement Wave (frais tournois joueurs, v2). On attend
      // le serveur avant de refléter (écriture honnête), puis on met à jour le miroir local.
      setWaveLink: async (link) => {
        const clean = link.trim();
        const ok = await setWaveLinkRpc(clean);
        if (!ok) return { ok: false };
        setState((s) => ({ ...s, waveLink: clean || null }));
        return { ok: true };
      },
      // Opérateur : confirme la réception du paiement d’un tournoi → passe payment_status à
      // 'paid'. On reflète localement le tournoi concerné (le prochain fetch confirmera).
      confirmTournamentPayment: async (id) => {
        const ok = await confirmTournamentPaymentRpc(id);
        if (!ok) return { ok: false };
        setState((s) => ({
          ...s,
          myCompetitions: s.myCompetitions.map((c) => (c.id === id ? { ...c, paymentStatus: 'paid' } : c)),
        }));
        return { ok: true };
      },
      addReservation: async (r) => {
        // Garde-fou : on ne réserve jamais un créneau dont l’heure de début est passée.
        if (r.startsAt <= Date.now()) return { ok: false, reason: 'past' };
        // Limite anti-blocage : un joueur ne peut pas accaparer trop de créneaux à venir. La règle
        // vit ICI (et non dans un seul écran) → elle s’applique à la fiche club ET à la fiche rapide.
        const myUpcoming = state.reservations.filter(
          (x) => (!x.userId || x.userId === state.serverUserId) && x.startsAt > Date.now(),
        ).length;
        if (myUpcoming >= MAX_UPCOMING) return { ok: false, reason: 'limit' };
        // Anti double-réservation locale (réponse immédiate). La barrière FORTE reste la
        // contrainte unique serveur : si un autre joueur a pris le terrain entre-temps,
        // l’insert échoue (conflict) et on renvoie une erreur.
        const sameSlot = (x: { clubId: string; dateKey: string; time: string; court: string }) =>
          x.clubId === r.clubId && x.dateKey === r.dateKey && x.time === r.time && x.court === r.court;
        if (state.reservations.some(sameSlot) || state.occupancy.some(sameSlot)) return { ok: false, reason: 'conflict' };
        const bookedBy = state.account
          ? { name: `${state.account.firstName} ${state.account.lastName}`.trim(), phone: state.account.phone }
          : undefined;

        // Mode SERVEUR (connecté) : on écrit sur Supabase d’abord (source de vérité).
        if (state.serverUserId) {
          // Garde d'époque (motif respondInvitation) : une déconnexion pendant la requête ne
          // doit pas réinjecter la résa (ni son rappel) dans l'état du téléphone déconnecté.
          const epoch = sessionEpochRef.current;
          const res = await insertReservation(r, state.serverUserId, bookedBy);
          if (!res.ok || !res.reservation) {
            // Refus dédiés des gardes serveur : créneau réellement passé (horloge du téléphone
            // en retard) et plafond de résas à venir — messages existants, pas « terrain pris ».
            if (res.past) return { ok: false, reason: 'past' };
            if (res.limit) return { ok: false, reason: 'limit' };
            // « slot closed » (54) : le club vient de fermer ce créneau (période, terrain,
            // grille) — « choisis un autre terrain » serait faux. On resynchronise les
            // fermetures pour que la grille affichée se corrige immédiatement.
            if (res.closed) {
              const [freshRanges, freshConfigs] = await Promise.all([fetchBlockedRanges(), fetchClubConfigs()]);
              if (sessionEpochRef.current === epoch) {
                setState((s) => ({
                  ...s,
                  blockedRanges: freshRanges ?? s.blockedRanges,
                  ...clubConfigSlices(s, freshConfigs),
                }));
              }
              return { ok: false, reason: 'closed' };
            }
            // Conflit (un autre joueur a pris le terrain) : on resynchronise l’occupation
            // pour que la disponibilité affichée se corrige immédiatement (anti dead-loop).
            if (res.conflict) {
              const fresh = await fetchOccupancy();
              if (fresh && sessionEpochRef.current === epoch) setState((s) => ({ ...s, occupancy: fresh }));
              return { ok: false, reason: 'conflict' };
            }
            // Échec réseau/serveur (≠ conflit) : le terrain n’est PAS pris — le message doit
            // inviter à réessayer, pas à changer de terrain.
            return { ok: false, reason: 'network' };
          }
          const created = res.reservation;
          if (sessionEpochRef.current !== epoch) return { ok: false, reason: 'network' }; // déconnexion entre-temps
          setState((s) => ({
            ...s,
            reservations: [created, ...s.reservations.filter((x) => x.id !== created.id)],
            occupancy: [...s.occupancy, { clubId: created.clubId, dateKey: created.dateKey, time: created.time, court: created.court }],
          }));
          // Réservation PARTAGÉE : les amis invités qui ont un compte la voient aussi chez eux.
          // On rattache par numéro (résolu côté serveur) — la résa reste UNIQUE (une commission).
          // On ATTEND le résultat : en échec, les invités ne recevront ni push ni la résa chez
          // eux alors que la carte affiche « Avec X » — l'écran doit le dire (partnersNotified).
          const invitedPhones = (created.invited ?? [])
            .map((iv) => state.friends.find((f) => f.id === iv.id)?.phone)
            .filter((p): p is string => !!p);
          const partnersNotified = invitedPhones.length > 0 ? await linkParticipants(created.id, invitedPhones) : true;
          if (state.remindersOn && sessionEpochRef.current === epoch) void scheduleMatchReminder(created); // rappel local ~2 h avant
          track('reservation_created', { clubId: created.clubId, players: created.players });
          return { ok: true, partnersNotified };
        }

        // Mode LOCAL (démo, hors session) : comportement d’origine.
        const localId = uid();
        setState((s) => {
          if (s.reservations.some(sameSlot)) return s;
          return { ...s, reservations: [{ ...r, bookedBy, id: localId, createdAt: Date.now() }, ...s.reservations] };
        });
        if (state.remindersOn) void scheduleMatchReminder({ ...r, id: localId });
        return { ok: true };
      },
      cancelReservation: async (id) => {
        const res = state.reservations.find((r) => r.id === id);
        // Serveur d’abord (si connecté et résa serveur) : on n’efface le miroir qu’au succès.
        // La fonction serveur refuse l’annulation à moins de 5h (règle non contournable).
        if (state.serverUserId && res) {
          const ok = await cancelReservationRow(id);
          if (!ok) return false; // refus serveur (délai 5h) ou réseau → on ne ment pas à l’UI
        }
        void cancelMatchReminder(id); // on retire son rappel local

        setState((s) => ({
          ...s,
          reservations: s.reservations.filter((r) => r.id !== id),
          occupancy: res
            ? s.occupancy.filter(
                (o) => !(o.clubId === res.clubId && o.dateKey === res.dateKey && o.time === res.time && o.court === res.court),
              )
            : s.occupancy,
        }));
        return true;
      },
      // Le club (ou l’opérateur) marque une réservation « pas venu » : la fonction serveur la
      // passe en 'no_show' (créneau libéré, absence comptée). On retire la résa du miroir local
      // et l’occupation correspondante, comme pour une annulation. false si refusé.
      markNoShow: async (id) => {
        const res = state.reservations.find((r) => r.id === id);
        const ok = await markNoShowRow(id, true);
        if (!ok) return false;
        setState((s) => ({
          ...s,
          reservations: s.reservations.filter((r) => r.id !== id),
          occupancy: res
            ? s.occupancy.filter(
                (o) => !(o.clubId === res.clubId && o.dateKey === res.dateKey && o.time === res.time && o.court === res.court),
              )
            : s.occupancy,
        }));
        return true;
      },
      // Réservation partagée : l’invité accepte ou refuse. Mise à jour optimiste (on retire
      // l’invitation des « à confirmer » ; si refus, on retire aussi la résa de ma liste), puis
      // on confirme côté serveur — en cas d’échec on rejoue l’état précédent.
      respondInvitation: async (reservationId, accept) => {
        const epoch = sessionEpochRef.current;
        const prevPending = state.pendingInvitationIds;
        const prevParts = state.participantReservationIds;
        setState((s) => ({
          ...s,
          pendingInvitationIds: s.pendingInvitationIds.filter((id) => id !== reservationId),
          participantReservationIds: accept
            ? s.participantReservationIds
            : s.participantReservationIds.filter((id) => id !== reservationId),
        }));
        const ok = await respondInvitationRpc(reservationId, accept);
        // Garde d’époque : une déconnexion pendant l’appel a déjà vidé ces tranches — la
        // restauration tardive réinjecterait les données du compte sorti.
        if (!ok && sessionEpochRef.current === epoch) {
          setState((s) => ({ ...s, pendingInvitationIds: prevPending, participantReservationIds: prevParts }));
        }
        // Refus accepté par le serveur : on retire aussi les rappels locaux déjà posés pour ce
        // match (comme cancelReservation) — sinon « Ton match approche » sonne pour un match refusé.
        if (ok && !accept) void cancelMatchReminder(reservationId);
        return ok;
      },
      confirmReservationByClub: async (id) => {
        const epoch = sessionEpochRef.current;
        const res = state.reservations.find((r) => r.id === id);
        const next = !res?.clubConfirmed;
        if (state.serverUserId && res) {
          const ok = await setClubConfirmedRow(id, next);
          if (!ok) return false; // RLS/réseau a refusé → on ne bascule pas l’affichage
        }
        if (sessionEpochRef.current !== epoch) return false; // déconnexion entre-temps
        setState((s) => ({
          ...s,
          reservations: s.reservations.map((r) => (r.id === id ? { ...r, clubConfirmed: next } : r)),
        }));
        return true;
      },
      sendFriendRequest: async (phone) => {
        // Hors session : impossible d’envoyer une vraie demande.
        if (!state.serverUserId) return { status: 'error' };
        // Garde d'époque : une déconnexion pendant l'appel ne doit pas réinjecter l'ami du
        // compte sorti dans l'état déconnecté (le test serverUserId ci-dessus est une closure
        // évaluée AVANT l'await — il ne protège pas).
        const epoch = sessionEpochRef.current;
        const res = await sendFriendRequestOnServer(phone);
        if (sessionEpochRef.current !== epoch) return res;
        // Cas 'accepted' (la personne m’avait déjà invité) : le lien mutuel est créé côté serveur,
        // on l’ajoute tout de suite au miroir local (anti-doublon par id / numéro).
        if (res.status === 'accepted' && res.friend) {
          const friend = res.friend;
          setState((s) => {
            // On retire aussi la demande ENTRANTE correspondante : le serveur venait de l’accepter
            // automatiquement (envoi croisé) — sans ça, la carte « Demande d’ami » restait affichée
            // avec des boutons Accepter/Refuser qui n’avaient plus rien à confirmer côté serveur.
            const friendRequests = s.friendRequests.filter((r) => r.fromId !== friend.id);
            if (s.friends.some((f) => f.id === friend.id)) return { ...s, friendRequests };
            const digits = phone.replace(/\D/g, '').slice(-10);
            if (digits.length >= 8 && s.friends.some((f) => (f.phone ?? '').replace(/\D/g, '').slice(-10) === digits)) {
              return { ...s, friendRequests };
            }
            return { ...s, friends: [friend, ...s.friends], friendRequests };
          });
        }
        return res;
      },
      respondFriendRequest: async (requestId, accept) => {
        const epoch = sessionEpochRef.current;
        const ok = await respondFriendRequestOnServer(requestId, accept);
        if (!ok || sessionEpochRef.current !== epoch) return ok; // déconnexion pendant la requête
        // On retire la demande de la liste « reçues » et, si acceptée, on recharge la liste d’amis
        // (le lien mutuel vient d’être créé côté serveur → id stable, nom, niveau à jour).
        setState((s) => ({ ...s, friendRequests: s.friendRequests.filter((r) => r.requestId !== requestId) }));
        if (accept)
          void fetchFriends().then((friends) => friends && sessionEpochRef.current === epoch && setState((s) => ({ ...s, friends })));
        return true;
      },
      // Bloquer un joueur (modération UGC) : serveur d'abord, puis miroir persisté — les écrans
      // lisent state.blockedUserIds (une seule source de vérité, jamais réinitialisée par un
      // échec réseau au montage).
      blockUserAccount: async (userId) => {
        const epoch = sessionEpochRef.current;
        const ok = await blockUserRpc(userId);
        if (!ok || sessionEpochRef.current !== epoch) return ok;
        setState((s) => (s.blockedUserIds.includes(userId) ? s : { ...s, blockedUserIds: [...s.blockedUserIds, userId] }));
        return true;
      },
      removeFriend: async (id) => {
        // Aligné sur respondFriendRequest : on attend la confirmation SERVEUR avant de retirer
        // l’ami de l’affichage (sinon, hors-ligne, il réapparaît au prochain fetchFriends réussi).
        if (!state.serverUserId) {
          setState((s) => ({ ...s, friends: s.friends.filter((f) => f.id !== id) }));
          return true;
        }
        const epoch = sessionEpochRef.current;
        const ok = await removeFriendOnServer(id); // idempotent (les deux sens du lien)
        if (!ok || sessionEpochRef.current !== epoch) return false; // échec réseau ou déconnexion entre-temps
        setState((s) => ({ ...s, friends: s.friends.filter((f) => f.id !== id) }));
        return true;
      },
      toggleFavorite: (clubId) =>
        setState((s) => ({
          ...s,
          favoriteClubIds: s.favoriteClubIds.includes(clubId)
            ? s.favoriteClubIds.filter((x) => x !== clubId)
            : [...s.favoriteClubIds, clubId],
        })),
      // Photo de club : un fichier local est d’abord ENVOYÉ au Storage (URL publique) pour que
      // les joueurs la voient sur tous les appareils ; une URL https est gardée telle quelle.
      // Puis on enregistre la liste des photos côté serveur (config club).
      // Écritures HONNÊTES (audit 8) : galerie et offres ATTENDENT le serveur et ne touchent le
      // miroir qu'au succès (motif setClubCover) — sinon la page divergeait entre ce téléphone
      // et ceux des joueurs dès la moindre coupure réseau.
      addClubPhoto: async (clubId, uri) => {
        if (!uri) return false;
        const existing = state.clubPhotos[clubId] ?? [];
        // Plafond pour éviter de dépasser le quota de stockage local (perte de photos).
        if (existing.length >= MAX_CLUB_PHOTOS) return false;
        let finalUrl = uri;
        const isLocalUri = !/^https?:\/\//.test(uri);
        if (state.serverUserId && isLocalUri) {
          const uploaded = await uploadClubPhoto(clubId, uri);
          // Échec d’upload sur un club serveur : on N’ENREGISTRE PAS une URI locale (file:// ou
          // data-URI) — elle serait illisible pour les autres appareils/joueurs. On prévient.
          if (!uploaded) {
            Alert.alert('Photo non envoyée', 'L’envoi de la photo a échoué. Vérifie ta connexion et réessaie.');
            return false;
          }
          finalUrl = uploaded;
        }
        if (existing.includes(finalUrl)) return true;
        const next = [...existing, finalUrl];
        if (state.serverUserId) {
          const ok = await upsertClubConfig(clubId, { photos: next });
          if (!ok) return false;
        }
        setState((s) => ({ ...s, clubPhotos: { ...s.clubPhotos, [clubId]: next } }));
        return true;
      },
      removeClubPhoto: async (clubId, uri) => {
        const next = (state.clubPhotos[clubId] ?? []).filter((x) => x !== uri);
        if (state.serverUserId) {
          const ok = await upsertClubConfig(clubId, { photos: next });
          if (!ok) return false;
          void removeClubPhotoFile(uri); // best-effort : retire aussi le fichier du Storage
        }
        setState((s) => ({ ...s, clubPhotos: { ...s.clubPhotos, [clubId]: next } }));
        return true;
      },
      addClubOffer: async (clubId, kind, title, detail) => {
        const t = title.trim();
        if (!t) return false;
        const next = [{ id: uid(), kind, title: t, detail: detail.trim() }, ...(state.clubOffers[clubId] ?? [])];
        if (state.serverUserId) {
          const ok = await upsertClubConfig(clubId, { offers: next });
          if (!ok) return false;
        }
        setState((s) => ({ ...s, clubOffers: { ...s.clubOffers, [clubId]: next } }));
        return true;
      },
      removeClubOffer: async (clubId, id) => {
        const next = (state.clubOffers[clubId] ?? []).filter((o) => o.id !== id);
        if (state.serverUserId) {
          const ok = await upsertClubConfig(clubId, { offers: next });
          if (!ok) return false;
        }
        setState((s) => ({ ...s, clubOffers: { ...s.clubOffers, [clubId]: next } }));
        return true;
      },
      // Photo « de profil » du club : uploadée si locale (comme addClubPhoto), puis enregistrée
      // dans la config serveur. null = retirer ('' côté serveur — cf. 38_coaches_lessons.sql).
      setClubCover: async (clubId, uri) => {
        const previous = state.clubCovers[clubId];
        let finalUrl = uri;
        if (uri && state.serverUserId && !/^https?:\/\//.test(uri)) {
          finalUrl = await uploadClubPhoto(clubId, uri);
          if (!finalUrl) return false; // échec d’upload : on n’enregistre JAMAIS une URI locale
        }
        if (state.serverUserId) {
          const ok = await upsertClubConfig(clubId, { coverUrl: finalUrl ?? '' });
          if (!ok) return false;
          // L’ancienne cover uploadée ne sert plus à rien → suppression best-effort du fichier.
          if (previous && previous !== finalUrl) void removeClubPhotoFile(previous);
        }
        setState((s) => {
          const covers = { ...s.clubCovers };
          if (finalUrl) covers[clubId] = finalUrl;
          else delete covers[clubId];
          return { ...s, clubCovers: covers };
        });
        return true;
      },
      // Une photo PAR TERRAIN : la carte complète { terrain: url } est réécrite côté serveur
      // (retirer un terrain = renvoyer la carte sans lui).
      setClubCourtPhoto: async (clubId, court, uri) => {
        const current = state.clubCourtPhotos[clubId] ?? {};
        const previous = current[court];
        let finalUrl = uri;
        if (uri && state.serverUserId && !/^https?:\/\//.test(uri)) {
          finalUrl = await uploadClubPhoto(clubId, uri);
          if (!finalUrl) return false; // échec d’upload : on n’enregistre JAMAIS une URI locale
        }
        const next = { ...current };
        if (finalUrl) next[court] = finalUrl;
        else delete next[court];
        if (state.serverUserId) {
          const ok = await upsertClubConfig(clubId, { courtPhotos: next });
          if (!ok) return false;
          if (previous && previous !== finalUrl) void removeClubPhotoFile(previous);
        }
        setState((s) => ({ ...s, clubCourtPhotos: { ...s.clubCourtPhotos, [clubId]: next } }));
        return true;
      },
      // Demande de cours (élève). Fonctionnalité 100 % serveur : hors session → false (l’UI
      // invite à se connecter). Le miroir « mes cours » est rechargé au succès.
      requestCoachLesson: async (input) => {
        if (!state.serverUserId) return false;
        const epoch = sessionEpochRef.current;
        const id = await requestLesson(input);
        if (!id || sessionEpochRef.current !== epoch) return false;
        const lessons = await fetchMyLessons(state.serverUserId);
        if (lessons && sessionEpochRef.current === epoch) setState((s) => ({ ...s, myLessons: lessons }));
        return true;
      },
      cancelMyLesson: async (id) => {
        const epoch = sessionEpochRef.current;
        const ok = await cancelLessonRequest(id);
        if (!ok || sessionEpochRef.current !== epoch) return false;
        setState((s) => ({ ...s, myLessons: s.myLessons.map((l) => (l.id === id ? { ...l, status: 'cancelled' } : l)) }));
        return true;
      },
      // Réglages de MA fiche coach — au succès, le miroir local reflète la fiche serveur.
      saveCoachSettings: async (specialty, price, slots) => {
        const epoch = sessionEpochRef.current;
        const ok = await updateCoachProfile(specialty, price, slots);
        if (!ok || sessionEpochRef.current !== epoch) return false;
        setState((s) => (s.coachProfile ? { ...s, coachProfile: { ...s.coachProfile, specialty, price: price ?? undefined, slots } } : s));
        return true;
      },
      refreshLessons: async () => {
        const userId = state.serverUserId;
        if (!userId) return;
        const epoch = sessionEpochRef.current;
        const [cp, lessons] = await Promise.all([fetchMyCoachProfile(), fetchMyLessons(userId)]);
        if (sessionEpochRef.current !== epoch) return;
        setState((s) => ({
          ...s,
          coachProfile: cp === undefined ? s.coachProfile : cp, // undefined = échec réseau → on garde
          myLessons: lessons ?? s.myLessons,
        }));
      },
      refreshClubRatings: async () => {
        const epoch = sessionEpochRef.current;
        const rt = await fetchClubRatings();
        if (!rt || sessionEpochRef.current !== epoch) return; // null = échec réseau → on garde
        setState((s) => ({ ...s, clubRatings: rt }));
      },
      // Le gérant connecté pousse sa page au serveur (visible par tous). On ATTEND le serveur et
      // on n’applique le miroir local qu’au succès : sinon un « Enregistré ✓ » mentait hors-ligne
      // (la modif n’était que locale et se rétablissait silencieusement au prochain chargement).
      setClubInfo: async (clubId, patch) => {
        const merged = { ...state.clubInfo[clubId], ...patch };
        if (state.serverUserId) {
          const ok = await upsertClubOverride(clubId, merged);
          if (!ok) return { ok: false };
        }
        setState((s) => ({ ...s, clubInfo: { ...s.clubInfo, [clubId]: { ...s.clubInfo[clubId], ...patch } } }));
        return { ok: true };
      },
      // Boost piloté côté SERVEUR → visible par tous les joueurs. On écrit d’abord au serveur
      // (réservé à l’opérateur), puis on met à jour le miroir local au succès.
      setBoost: async (clubId, days) => {
        const epoch = sessionEpochRef.current;
        const expiry = days > 0 ? Date.now() + days * 86400000 : null;
        if (state.serverUserId) {
          const ok = await setClubBoostRpc(clubId, expiry);
          if (!ok) return { ok: false };
        }
        if (sessionEpochRef.current !== epoch) return { ok: false }; // déconnexion entre-temps
        setState((s) => {
          if (!expiry) {
            const exp = { ...s.boostExpiry };
            delete exp[clubId];
            return { ...s, boostedClubIds: s.boostedClubIds.filter((x) => x !== clubId), boostExpiry: exp };
          }
          return {
            ...s,
            boostedClubIds: s.boostedClubIds.includes(clubId) ? s.boostedClubIds : [...s.boostedClubIds, clubId],
            boostExpiry: { ...s.boostExpiry, [clubId]: expiry },
          };
        });
        return { ok: true };
      },
      // Persistance SERVEUR (opérateur) : le statut « Payé / envoyé » survit à une réinstallation
      // ou à un 2ᵉ appareil. On ATTEND le serveur et n’applique le miroir qu’au succès : sinon un
      // échec réseau faisait revenir en silence le statut à « À facturer » (accusé mensonger).
      setPaymentStatus: async (clubId, weekKey, status) => {
        const k = `${clubId}:${weekKey}`;
        if (state.serverUserId) {
          const ok = await setOperatorPaymentRpc(k, status);
          if (!ok) return { ok: false };
        }
        setState((s) => {
          const next = { ...s.operatorPayments };
          if (status === 'tofacture') delete next[k];
          else next[k] = status;
          return { ...s, operatorPayments: next };
        });
        return { ok: true };
      },
      requestClub: ({ name, area, type, courts, priceFrom, contactPhone }) =>
        setState((s) => {
          const n = name.trim();
          if (n.length < 2) return s;
          // Anti double-tap : on ne recrée pas une demande « en attente » identique
          // (même nom + même quartier) déjà soumise sur cet appareil.
          const areaClean = area.trim() || 'Abidjan';
          const dup = s.customClubs.some(
            (c) =>
              c.status === 'pending' &&
              c.name.trim().toLowerCase() === n.toLowerCase() &&
              c.area.trim().toLowerCase() === areaClean.toLowerCase(),
          );
          if (dup) return s;
          const accents = ACCENTS;
          const club: CustomClub = {
            id: uid(),
            name: n,
            area: area.trim() || 'Abidjan',
            city: 'Abidjan',
            type,
            courts: Math.max(1, courts),
            blurb: `Club de padel à ${area.trim() || 'Abidjan'} — inscrit via PadelConnect.`,
            amenities: ['Vestiaires'],
            priceFrom: Math.max(0, priceFrom),
            mapsQuery: `${n} padel ${area.trim() || ''} Abidjan`.replace(/\s+/g, ' '),
            accent: accents[s.customClubs.length % accents.length],
            status: 'pending',
            contactPhone: contactPhone?.trim() || undefined,
            createdAt: Date.now(),
          };
          // Le gérant bascule directement sur SON club pour préparer sa page.
          return { ...s, customClubs: [...s.customClubs, club], managedClubId: club.id };
        }),
      // Le gérant annule SA demande tant qu’elle est « en attente » (pas encore activée).
      cancelOwnClubRequest: (id) =>
        setState((s) => ({
          ...s,
          customClubs: s.customClubs.filter((c) => !(c.id === id && c.status === 'pending')),
        })),
      // ── Demandes d’inscription club (serveur) ──────────────────────────────
      // Un joueur envoie « inscris mon club » → ligne dans club_requests (RLS :
      // l’auteur peut créer, seul l’opérateur lit/traite). L’opérateur les voit
      // dans son espace et change leur statut (nouveau → contacté → approuvé…).
      submitClubRequest: async (input) => {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return { ok: false, error: 'Connecte-toi pour inscrire ton club.' };
        const name = input.name.trim();
        if (name.length < 2) return { ok: false, error: 'Indique le nom du club.' };
        const { error } = await supabase.from('club_requests').insert({
          name,
          area: input.area?.trim() || null,
          type: input.type ?? null,
          courts: input.courts ?? null,
          price_from: input.priceFrom ?? null,
          // Filet de sécurité (comme submitSupportMessage) : si le champ a été vidé, on retombe
          // sur le téléphone du compte pour garder un canal de rappel — la carte de succès promet
          // « on te recontacte au numéro indiqué ».
          contact_phone: input.contactPhone?.trim() || state.account?.phone || null,
          message: input.message?.trim() || null,
          requested_by: user.id,
        });
        if (error) return { ok: false, error: 'Envoi impossible — réessaie dans un instant.' };
        return { ok: true };
      },
      fetchClubRequests: async () => {
        const { data, error } = await supabase.from('club_requests').select('*').order('created_at', { ascending: false });
        // On distingue « rien à traiter » d’un échec (réseau / RLS) : l’opérateur ne doit
        // pas croire qu’il n’y a aucune demande alors que le chargement a juste échoué.
        if (error) return { ok: false, requests: [] };
        return { ok: true, requests: (data ?? []) as ServerClubRequest[] };
      },
      setClubRequestStatus: async (id, status) => {
        // Refus : passe par la RPC serveur (SECURITY DEFINER) qui, en plus de marquer la demande
        // 'rejected', repasse le demandeur en compte JOUEUR — sinon son app resterait bloquée sur
        // « club en cours de validation » à jamais (account_type='club' non réinitialisé).
        if (status === 'rejected') {
          const { data, error } = await supabase.rpc('reject_club_request', { p_id: id });
          return { ok: !error && data === true };
        }
        const { error } = await supabase.from('club_requests').update({ status }).eq('id', id);
        return { ok: !error };
      },
      // Approbation serveur : crée le club + donne l’accès gérant au demandeur, puis
      // recharge la liste des clubs serveur pour que le nouveau club apparaisse aussitôt.
      approveClubRequest: async (requestId) => {
        const res = await approveClubRequestRpc(requestId);
        if (res.ok) {
          const serverClubs = await fetchServerClubs();
          if (serverClubs) setState((s) => ({ ...s, customClubs: mergeServerClubs(s.customClubs, serverClubs) }));
        }
        return res;
      },
      // Opérateur : change le statut d’un club serveur (Actif ⇄ Bientôt ⇄ masqué) puis
      // recharge la liste pour refléter le changement immédiatement.
      operatorSetClubStatus: async (clubId, status) => {
        const ok = await setClubStatusRpc(clubId, status);
        if (ok) {
          const serverClubs = await fetchServerClubs();
          if (serverClubs) setState((s) => ({ ...s, customClubs: mergeServerClubs(s.customClubs, serverClubs) }));
        }
        return { ok };
      },
      // Opérateur : bascule le statut de N’IMPORTE QUEL club (y compris les 9 de base
      // embarqués). On relit la table club_status, met à jour le registre lu par data/clubs
      // (badges « Bientôt »/masquage appliqués partout) et l’état pour re-rendre.
      operatorSetBaseStatus: async (clubId, status) => {
        const ok = await setBaseClubStatusRpc(clubId, status);
        if (ok) {
          const clubStatus = await fetchClubStatus();
          if (clubStatus) {
            setClubStatusMap(clubStatus);
            setState((s) => ({ ...s, clubStatus }));
          }
        }
        return { ok };
      },
      // Opérateur : donne l’accès « Espace Club » à un joueur (par numéro) pour un club donné.
      // Le gérant le voit apparaître au prochain retour dans l’app (rafraîchissement du rôle).
      operatorGrantClubAccess: async (phone, clubId) => grantClubAccessByPhoneRpc(phone, clubId),
      operatorRevokeClubAccess: async (phone) => revokeClubAccessByPhoneRpc(phone),
      // Opérateur : fixe la commission propre à un club (taux 0–1). Met à jour l’état local
      // pour que le décompte se recalcule aussitôt avec le bon pourcentage.
      operatorSetClubCommission: async (clubId, rate) => {
        const epoch = sessionEpochRef.current;
        const ok = await setClubCommissionRpc(clubId, rate);
        // Garde d’époque : clubCommission est purgée à la déconnexion — pas d’écriture tardive.
        if (ok && sessionEpochRef.current === epoch) setState((s) => ({ ...s, clubCommission: { ...s.clubCommission, [clubId]: rate } }));
        return { ok };
      },
      // Opérateur : supprime définitivement un club serveur. On retire le club du miroir local
      // et on recharge la liste serveur pour refléter la suppression chez tous.
      operatorDeleteClub: async (clubId) => {
        const ok = await deleteClubRpc(clubId);
        if (ok) {
          const serverClubs = await fetchServerClubs();
          setState((s) => ({
            ...s,
            // Retrait local immédiat ; on refusionne la liste serveur seulement si elle a bien chargé.
            customClubs: serverClubs
              ? mergeServerClubs(
                  s.customClubs.filter((c) => c.id !== clubId),
                  serverClubs,
                )
              : s.customClubs.filter((c) => c.id !== clubId),
          }));
        }
        return { ok };
      },
      // Opérateur : pré-charge un club « Bientôt » côté serveur (il apparaît aussitôt en liste).
      operatorCreateClub: async (input) => {
        const res = await createClubRpc(input);
        if (res.ok) {
          const serverClubs = await fetchServerClubs();
          if (serverClubs) setState((s) => ({ ...s, customClubs: mergeServerClubs(s.customClubs, serverClubs) }));
        }
        return res;
      },
      // ── Aide / signalements (serveur) ──────────────────────────────────────
      submitSupportMessage: async (message, contactPhone) => {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return { ok: false, error: 'Connecte-toi pour nous écrire.' };
        const body = message.trim();
        if (body.length < 5) return { ok: false, error: 'Décris un peu plus ton problème.' };
        const name = state.account ? `${state.account.firstName} ${state.account.lastName}`.trim() : null;
        const { error } = await supabase.from('support_messages').insert({
          user_id: user.id,
          name,
          contact_phone: contactPhone?.trim() || state.account?.phone || null,
          message: body,
        });
        if (error) return { ok: false, error: 'Envoi impossible — réessaie.' };
        return { ok: true };
      },
      fetchSupportMessages: async () => {
        // Nettoyage opportuniste : on purge les résolus de +7 jours à chaque ouverture (best-effort).
        void supabase.rpc('purge_old_resolved_support');
        const { data, error } = await supabase.from('support_messages').select('*').order('created_at', { ascending: false });
        if (error) return { ok: false, messages: [] };
        return { ok: true, messages: (data ?? []) as ServerSupportMessage[] };
      },
      // Boucle de retour : le JOUEUR relit SES propres messages et leur statut (RLS select_own).
      fetchMySupportMessages: async () => {
        const userId = state.serverUserId;
        if (!userId) return [];
        const { data, error } = await supabase
          .from('support_messages')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });
        if (error) return null; // échec réseau ≠ « aucun message » — l’écran garde l’existant
        return (data ?? []) as ServerSupportMessage[];
      },
      setSupportMessageStatus: async (id, status) => {
        const { error } = await supabase.from('support_messages').update({ status }).eq('id', id);
        return { ok: !error };
      },
      approveClub: (id) =>
        setState((s) => ({ ...s, customClubs: s.customClubs.map((c) => (c.id === id ? { ...c, status: 'active' } : c)) })),
      rejectClub: (id) =>
        setState((s) => ({
          ...s,
          customClubs: s.customClubs.filter((c) => c.id !== id),
          managedClubId: s.managedClubId === id ? 'padelta' : s.managedClubId,
        })),
      setManagedClub: (id) => setState((s) => ({ ...s, managedClubId: id })),
      // Horaires/terrains : le gérant connecté pousse au serveur (visible par TOUS les joueurs,
      // change la disponibilité réelle). Le serveur refuse si ce n’est pas son club → reste local.
      // Horaires/terrains : on ATTEND le serveur avant d'écrire le miroir (comme setClubInfo) —
      // sinon un échec réseau laissait la grille locale diverger en silence de ce que voient
      // les joueurs, et la modif « revenait en arrière » au prochain chargement.
      // Garde d'époque (comme setCourtClosed) : une réponse tardive ne ré-écrit pas l'état
      // (ni le disque) après une déconnexion ou une bascule de compte.
      setClubSlots: async (clubId, slots) => {
        const next = [...slots].sort();
        const epoch = sessionEpochRef.current;
        if (state.serverUserId) {
          const ok = await upsertClubConfig(clubId, { slots: next });
          if (!ok) return false;
        }
        if (sessionEpochRef.current !== epoch) return true;
        setState((s) => ({ ...s, clubSlots: { ...s.clubSlots, [clubId]: next } }));
        return true;
      },
      setClubCourts: async (clubId, courts) => {
        const epoch = sessionEpochRef.current;
        if (state.serverUserId) {
          const ok = await upsertClubConfig(clubId, { courts });
          if (!ok) return false;
        }
        if (sessionEpochRef.current !== epoch) return true;
        setState((s) => ({ ...s, clubCourts: { ...s.clubCourts, [clubId]: courts } }));
        return true;
      },
      // Fermer un créneau hors app. Garde-fous : jamais dans le passé, jamais par-dessus
      // une réservation PadelConnect, jamais en double.
      blockSlot: async (b, startsAt) => {
        if (startsAt <= Date.now()) return false;
        const sameSlot = (x: { clubId: string; dateKey: string; time: string; court: string }) =>
          x.clubId === b.clubId && x.dateKey === b.dateKey && x.time === b.time && x.court === b.court;
        if (state.reservations.some(sameSlot)) return false;
        if (state.blockedSlots.some(sameSlot)) return false;
        // Ceinture-bretelles : jamais de blocage manuel par-dessus un terrain déjà retenu par un
        // tournoi publié (même protection que la grille/le détail de créneau côté UI) — même si
        // un appelant oubliait de vérifier avant d’appeler blockSlot.
        const comps = [
          ...state.myCompetitions.filter((c) => c.clubId === b.clubId),
          ...seedCompetitions.filter((c) => c.clubId === b.clubId),
        ];
        const compBlocked = competitionBlockedCourts(b.clubId, b.dateKey, b.time, comps);
        if (compBlocked === 'all' || compBlocked.includes(b.court)) return false;
        // Persistance SERVEUR : le blocage devient RÉEL (visible par tous, empêche vraiment la
        // réservation via le trigger) et survit à la réinstallation. On ATTEND le serveur et
        // n’applique le miroir qu’au succès : sinon le gérant croyait le créneau fermé alors que
        // le serveur avait refusé (ex. déjà réservé) — il aurait pu accepter un joueur en double.
        if (state.serverUserId) {
          const ok = await blockSlotRow(b);
          if (!ok) return false;
        }
        setState((s) => ({ ...s, blockedSlots: [...s.blockedSlots, b] }));
        return true;
      },
      unblockSlot: async (clubId, dateKey, time, court) => {
        if (state.serverUserId) {
          const ok = await unblockSlotRow(clubId, dateKey, time, court);
          if (!ok) return false;
        }
        setState((s) => ({
          ...s,
          blockedSlots: s.blockedSlots.filter(
            (x) => !(x.clubId === clubId && x.dateKey === dateKey && x.time === time && x.court === court),
          ),
        }));
        return true;
      },
      // Ferme un terrain (ou tout le club) sur une PÉRIODE (54) : travaux, événement privé…
      // Écriture honnête : le serveur d'abord (il refuse si une résa à venir vit dans la
      // période — 'reservations'), puis relecture du miroir (la ligne créée porte son id serveur).
      blockRange: async (input) => {
        if (!state.serverUserId) return 'error';
        const epoch = sessionEpochRef.current;
        const { status, id } = await blockRangeRow(input);
        if (status !== 'ok') return status;
        const fresh = await fetchBlockedRanges();
        if (sessionEpochRef.current === epoch) {
          // Relecture ratée juste après un succès serveur ? On insère quand même la ligne créée
          // (le serveur renvoie son id) : la période reste visible, rouvrable, et freeCourts
          // est juste tout de suite — sans ça, « Période fermée ✓ » avec un miroir intact
          // invitait à re-soumettre (doublon serveur).
          setState((s) => ({
            ...s,
            blockedRanges: fresh ?? (id ? [...s.blockedRanges, { ...input, id }] : s.blockedRanges),
          }));
        }
        return 'ok';
      },
      // Rouvre une période fermée. Le miroir n'est mis à jour qu'au succès serveur.
      unblockRange: async (id) => {
        if (!state.serverUserId) return false;
        const epoch = sessionEpochRef.current;
        const ok = await unblockRangeRow(id);
        if (!ok || sessionEpochRef.current !== epoch) return ok;
        setState((s) => ({ ...s, blockedRanges: s.blockedRanges.filter((r) => r.id !== id) }));
        return true;
      },
      // Fermetures RÉCURRENTES par terrain (54) : remplace la carte complète du club
      // ({ 'Terrain 1': ['18:00'] }). Écriture honnête, motif setClubSlots. Garde d'époque :
      // une réponse tardive ne ré-écrit pas l'état (ni le disque) après déconnexion/bascule.
      setCourtClosed: async (clubId, closed) => {
        const epoch = sessionEpochRef.current;
        if (state.serverUserId) {
          const ok = await upsertClubConfig(clubId, { courtClosed: closed });
          if (!ok) return false;
        }
        if (sessionEpochRef.current !== epoch) return true;
        setState((s) => ({ ...s, clubCourtClosed: { ...s.clubCourtClosed, [clubId]: closed } }));
        return true;
      },
      // L’opérateur publie/met à jour l’actu d’accueil. On ne régénère l’id (ce qui la
      // fait RÉAPPARAÎTRE chez les joueurs qui l’avaient fermée) QUE si le contenu change.
      // ok = false si la publication SERVEUR échoue : l’appelant doit le dire honnêtement (au lieu
      // d’un « Publiée ✓ » mensonger si l’actu n’a en fait été enregistrée que localement).
      setOperatorNews: async (news) => {
        const title = news.title.trim();
        const subtitle = news.subtitle?.trim() || undefined;
        // Lien : on n’accepte qu’une URL ; on préfixe https:// si l’opérateur l’a oublié.
        let link = news.link?.trim() || undefined;
        if (link && !/^https?:\/\//i.test(link)) link = `https://${link}`;
        if (link && !/^https?:\/\/.+\..+/i.test(link)) link = undefined;
        const prev = state.operatorNews;
        const unchanged = !!prev && prev.title === title && prev.subtitle === subtitle && prev.link === link;
        // Contenu inchangé → même id (le bandeau ne réapparaît pas chez ceux qui l'ont fermé)…
        // SAUF si la case « notification » est cochée : l'opérateur veut un (re)envoi délibéré →
        // nouvel id, sinon la garde anti-doublon de notify-club ignorerait ce push en silence
        // (republier le même texte pendant un test donnait l'impression que « ça ne marche pas »).
        const next = { id: unchanged && news.push !== true ? prev.id : uid(), title, subtitle, link };
        // On ATTEND le serveur AVANT d’écrire le miroir (comme removeOperatorNews) : sinon,
        // hors-ligne, le bandeau s’affichait « publié » alors que rien n’était parti, puis
        // disparaissait au prochain fetch réussi (accusé mensonger).
        const ok = state.serverUserId ? await setOperatorNewsServer(next, news.push === true) : true;
        if (ok) setState((s) => ({ ...s, operatorNews: next }));
        return { ok };
      },
      // Retrait de l’actu d’accueil : on ATTEND le serveur et on ne vide le miroir qu’au succès —
      // sinon, hors-ligne, l’actu « retirée » restait publiée pour tous et réapparaissait au
      // prochain fetch, sans que l’opérateur le sache (l’appel réseau était noyé dans l’updater).
      removeOperatorNews: async () => {
        if (state.serverUserId) {
          const ok = await clearOperatorNewsServer();
          if (!ok) return { ok: false };
        }
        setState((s) => ({ ...s, operatorNews: null }));
        return { ok: true };
      },
      dismissNews: (id) => setState((s) => ({ ...s, dismissedNewsId: id })),
      resetAll: () => {
        // Réinitialisation TOTALE : on coupe la session serveur, on efface les rappels et
        // la clé persistée, puis on revient à l’état seed complet (≈ première ouverture).
        sessionEpochRef.current += 1; // invalide toute requête en vol
        supabase.auth.signOut().catch(() => {});
        void syncMatchReminders([], false);
        AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
        setState(initialState);
      },
    }),
    [state, hydrated, stats, myReservations, loadSession, refreshCompetitions],
  );

  return <AppContext.Provider value={api}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp doit être utilisé dans <AppProvider>');
  return ctx;
}
