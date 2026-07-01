// État global de l'app (prototype) + persistance locale via AsyncStorage.

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
  unregisterCompetition as unregisterCompetitionRpc,
} from '@/lib/competitionsServer';
import type { Competition } from '@/data/competitions';
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
  blockSlotRow,
  cancelReservationRow,
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
  type SlotOccupancy,
} from '@/lib/reservations';
import { cancelMatchReminder, scheduleMatchReminder, syncMatchReminders } from '@/lib/notifications';
import { registerPushToken } from '@/lib/push';
import { uploadAvatar } from '@/lib/avatar';
import { phoneToAuthEmail, supabase } from '@/lib/supabase';
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
} from './helpers';
import { ACCENTS } from '@/theme';

export type Account = {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string; // identifiant de connexion (inscription par e-mail) — facultatif pour les comptes téléphone
  photoUri?: string;
  birthDate?: string; // JJ/MM/AAAA — sert à l'âge et au signe astro
  gender?: 'homme' | 'femme' | 'nd';
};
export type Invited = { id: string; name: string; confirmed: boolean };

// Demande d'inscription de club stockée côté serveur (table public.club_requests).
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

// Message d'aide / signalement envoyé par un joueur (table public.support_messages).
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
  date: string; // libellé d'affichage (ex. « Demain 13 »)
  dateKey: string; // identité stable du jour (AAAA-MM-JJ) — base des calculs
  time: string;
  startsAt: number; // horodatage réel du créneau (rappel, anti double-réservation)
  price: number; // prix RÉEL du créneau (figé à la réservation — base commission & partage)
  players: number;
  invited: Invited[];
  bookedBy?: { name: string; phone: string }; // qui a réservé — visible côté club
  clubConfirmed?: boolean; // le gérant a confirmé la réservation (visible par le joueur)
  createdAt: number;
};

// Durée d'une session (1h30) — sert à savoir quand une réservation est « jouée ».
export const SESSION_MS = 90 * 60000;

// Une réservation est « jouée » dès que son heure de fin est passée (automatique, jamais déclaré).
export function isPlayed(r: Reservation, now = Date.now()): boolean {
  return r.startsAt + SESSION_MS <= now;
}

// Palmarès du joueur : une entrée par tournoi joué (vainqueur, dernière place, ou participant).
export type OfficialResult = {
  id: string;
  compId?: string;
  title: string;
  result: 'win' | 'played' | 'last';
  at: number;
  levelAfter: number;
};

// Résultat d'un tournoi clôturé par son ORGANISATEUR (club ou créateur du défi).
// `loser` = équipe classée dernière (désignation facultative → malus de niveau).
// winner = 1ʳᵉ place. Pour un americano : second/third = podium (2ᵉ/3ᵉ). loser = dernière
// place (formats à élimination). Tous optionnels sauf le vainqueur.
export type CompResult = { winner: string; second?: string; third?: string; loser?: string; closedAt: number };

// Actualité éditorialisée par l'opérateur, affichée en bandeau sur l'accueil joueur.
export type OperatorNews = { id: string; title: string; subtitle?: string; link?: string };

// Créneau fermé PAR LE CLUB (résa téléphone/WhatsApp, entretien…). Ce n'est PAS une
// réservation PadelConnect : jamais compté dans l'historique, la commission ou les stats.
export type BlockedSlot = { clubId: string; dateKey: string; time: string; court: string; reason: string };

// Infos d'un club modifiables par son gérant (s'appliquent par-dessus les données de base).
export type ClubInfo = {
  name?: string;
  area?: string;
  blurb?: string;
  type?: Club['type'];
  priceFrom?: number;
  priceTiers?: PriceTier[]; // tarifs par plage horaire définis par le gérant
  contactPhone?: string; // numéro WhatsApp du club — alimente le lien discret de la fiche
};

export type AppState = {
  account: Account | null;
  level: number; // 1.0 → 7.0
  remindersOn: boolean; // préférence : rappels de match (sur l'app installée)
  reserverView: 'Par heure' | 'Par club'; // dernière vue utilisée sur l'écran Réserver
  userReviews: Review[];
  myCompetitions: Competition[];
  reservations: Reservation[];
  favoriteClubIds: string[];
  friends: Friend[];
  friendRequests: IncomingFriendRequest[]; // demandes d'ami REÇUES en attente (Accepter / Refuser)
  officialResults: OfficialResult[];
  compRegistrations: Record<string, { partner: string; at: number }>;
  compResults: Record<string, CompResult>; // tournoi clôturé → équipe vainqueure
  clubPhotos: Record<string, string[]>;
  clubOffers: Record<string, { id: string; kind: 'offre' | 'actu' | 'evenement'; title: string; detail: string }[]>;
  clubCoaches: Record<string, { id: string; name: string; specialty: string; phone?: string }[]>;
  clubInfo: Record<string, ClubInfo>; // surcharges gérant (nom, tarif, WhatsApp…)
  hiddenCoachIds: string[]; // coachs (de démo) retirés par leur club
  boostedClubIds: string[];
  boostExpiry: Record<string, number>; // clubId → date d'expiration du boost (affichage)
  operatorPayments: Record<string, 'sent' | 'paid'>; // « clubId:AAAA-MM » → statut de règlement
  customClubs: CustomClub[]; // clubs inscrits via l'app (activation par l'opérateur)
  clubStatus: Record<string, 'active' | 'coming_soon' | 'hidden'>; // statut piloté par l'opérateur (tout club)
  clubCommission: Record<string, number>; // taux de commission propre à chaque club (vu opérateur)
  tournamentFee: number; // frais fixe (FCFA) appliqué aux tournois JOUEURS — réglé par l'opérateur
  // RÔLE vérifié côté serveur (Supabase) — la VRAIE sécurité des espaces.
  //  - 'operator' : toi (PadelConnect). 'club' : un gérant. 'player' : par défaut.
  // Un joueur ne peut pas se promouvoir (protégé par un trigger côté serveur).
  role: 'player' | 'operator' | 'club';
  serverManagedClubId: string | null; // pour un compte 'club' : l'id du club géré
  serverUserId: string | null; // id Supabase quand connecté → mode « réservations serveur »
  participantReservationIds: string[]; // résas où JE suis invité (hors invitations refusées)
  pendingInvitationIds: string[]; // sous-ensemble : invitations à confirmer (Accepter/Refuser)
  occupancy: SlotOccupancy[]; // créneaux pris par TOUS (vue publique) → dispo cross-joueur
  storageFull: boolean; // true si la sauvegarde a dû abandonner des photos (quota plein)
  managedClubId: string;
  clubSlots: Record<string, string[]>; // horaires ouverts par club
  clubCourts: Record<string, string[]>; // terrains (courts) gérés par club
  blockedSlots: BlockedSlot[]; // créneaux fermés hors app par les clubs
  operatorNews: OperatorNews | null; // actu d'accueil publiée par l'opérateur
  dismissedNewsId: string | null; // id de l'actu fermée par le joueur (réapparaît si nouvelle)
};

// 3 chiffres, pas plus : parties jouées (auto), tournois joués, tournois gagnés.
export type Stats = { played: number; tournamentsPlayed: number; tournamentsWon: number };

export const COMMISSION_RATE = 0.1; // commission opérateur (10 %)
const STORAGE_KEY = 'padelco_state_v4'; // v4 : modèle sans matchs ni victoires/défaites
export const MAX_CLUB_PHOTOS = 6; // plafond de photos par club (quota de stockage local)

type AppContextType = {
  state: AppState;
  hydrated: boolean;
  stats: Stats;
  myReservations: Reservation[]; // mes réservations seules (cf. memo) — pour tout écran perso
  setAccount: (a: Account) => void;
  updateAccount: (patch: Partial<Account>) => void;
  // Inscription serveur PRINCIPALE — e-mail (confirmé) + mot de passe, le téléphone est
  // conservé (sans SMS) pour que les clubs puissent joindre les joueurs. `needsConfirm`
  // = true quand l'e-mail de confirmation vient d'être envoyé (pas encore de session).
  signUpWithEmail: (
    email: string,
    password: string,
    phone: string,
    profile: { firstName: string; lastName: string; birthDate?: string; gender?: Account['gender']; level?: number; referralCode?: string },
  ) => Promise<{ ok: boolean; needsConfirm?: boolean; error?: string }>;
  signInWithEmail: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  // Recharge la session (profil + données) — appelé après la confirmation d'e-mail (deep link).
  refreshSession: () => Promise<void>;
  // Ajouter / changer l'e-mail du compte (confirmation par lien envoyé à la nouvelle adresse).
  updateEmail: (email: string) => Promise<{ ok: boolean; error?: string }>;
  // Connexion serveur héritée — téléphone + mot de passe (comptes créés avant l'e-mail).
  signInWithPhone: (phone: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  // Mot de passe oublié : envoi d'un lien de réinitialisation par e-mail.
  resetPassword: (email: string) => Promise<{ ok: boolean; error?: string }>;
  // Renvoyer l'e-mail de confirmation d'inscription.
  resendConfirmation: (email: string) => Promise<{ ok: boolean; error?: string }>;
  // Suppression définitive du compte (exigence App Store / Google Play).
  deleteAccount: () => Promise<{ ok: boolean; error?: string }>;
  signOut: () => void;
  setLevel: (n: number) => void;
  closeCompetition: (
    comp: { id: string; title: string; official?: boolean },
    winnerName: string,
    winnerIsMe: boolean,
    loserName?: string,
    loserIsMe?: boolean,
    podium?: { second?: string; third?: string }, // americano : 2ᵉ/3ᵉ place
  ) => Promise<void>;
  setRemindersOn: (on: boolean) => void;
  setReserverView: (v: 'Par heure' | 'Par club') => void;
  addCompetition: (c: Omit<Competition, 'id' | 'createdByMe'>) => Promise<{ ok: boolean }>;
  approveCompetition: (id: string) => Promise<void>; // le club hôte valide un tournoi créé par un joueur
  rejectCompetition: (id: string) => Promise<void>; // le club hôte refuse un tournoi créé par un joueur
  deleteCompetition: (id: string) => Promise<void>; // annulation / suppression (créateur ou club hôte)
  registerCompetition: (id: string, partner: string) => Promise<void>;
  unregisterCompetition: (id: string) => Promise<void>;
  setTournamentFee: (amount: number) => Promise<{ ok: boolean }>; // opérateur : frais fixe tournois joueurs
  // Réservations : SERVEUR = source de vérité quand connecté (sinon miroir local, démo).
  addReservation: (r: Omit<Reservation, 'id' | 'createdAt' | 'bookedBy' | 'userId'>) => Promise<boolean>;
  cancelReservation: (id: string) => Promise<boolean>;
  // Réservation partagée : l'invité accepte (accept=true) ou refuse son invitation.
  respondInvitation: (reservationId: string, accept: boolean) => Promise<boolean>;
  confirmReservationByClub: (id: string) => Promise<boolean>;
  // Envoie une DEMANDE d'ami par numéro (plus d'ajout instantané) : la personne doit accepter.
  sendFriendRequest: (phone: string) => Promise<FriendRequestResult>;
  // Réponds à une demande REÇUE (accept=true → on devient amis ; false → refusée).
  respondFriendRequest: (requestId: string, accept: boolean) => Promise<boolean>;
  removeFriend: (id: string) => void;
  toggleFavorite: (clubId: string) => void;
  addClubPhoto: (clubId: string, uri: string) => Promise<void>;
  removeClubPhoto: (clubId: string, uri: string) => void;
  addClubOffer: (clubId: string, kind: 'offre' | 'actu' | 'evenement', title: string, detail: string) => void;
  removeClubOffer: (clubId: string, id: string) => void;
  addClubCoach: (clubId: string, name: string, specialty: string, phone: string) => void;
  removeClubCoach: (clubId: string, id: string) => void;
  setClubInfo: (clubId: string, patch: ClubInfo) => void;
  toggleBoostClub: (clubId: string) => void;
  setBoost: (clubId: string, days: number) => Promise<{ ok: boolean }>; // days > 0 active (expiration), 0 désactive — serveur
  setPaymentStatus: (clubId: string, weekKey: string, status: 'tofacture' | 'sent' | 'paid') => void;
  requestClub: (input: {
    name: string;
    area: string;
    type: Club['type'];
    courts: number;
    priceFrom: number;
    contactPhone?: string;
  }) => void;
  cancelOwnClubRequest: (id: string) => void; // annule une demande « en attente » créée sur cet appareil
  // Demande d'inscription de club envoyée au SERVEUR (visible par l'opérateur).
  submitClubRequest: (input: {
    name: string;
    area: string;
    type?: Club['type'];
    courts?: number;
    priceFrom?: number;
    contactPhone?: string;
    message?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  // L'opérateur lit toutes les demandes (RLS) ; setStatus met à jour une demande.
  // On renvoie un drapeau ok pour distinguer « vide » d'un échec réseau/RLS.
  fetchClubRequests: () => Promise<{ ok: boolean; requests: ServerClubRequest[] }>;
  setClubRequestStatus: (id: string, status: ServerClubRequest['status']) => Promise<{ ok: boolean }>;
  // Approuve une demande côté SERVEUR : crée le club (visible par tous) + donne au
  // demandeur l'accès à son Espace Club. Recharge ensuite la liste des clubs serveur.
  approveClubRequest: (requestId: string) => Promise<{ ok: boolean; clubId?: string }>;
  // Opérateur : statut d'un club serveur (Actif / Bientôt / masqué) et pré-chargement d'un club.
  operatorSetClubStatus: (clubId: string, status: 'active' | 'coming_soon' | 'hidden') => Promise<{ ok: boolean }>;
  // Opérateur : statut piloté de N'IMPORTE QUEL club, y compris les 9 de base embarqués.
  operatorSetBaseStatus: (clubId: string, status: 'active' | 'coming_soon' | 'hidden') => Promise<{ ok: boolean }>;
  // Opérateur : supprime définitivement un club serveur (+ données liées).
  operatorDeleteClub: (clubId: string) => Promise<{ ok: boolean }>;
  // Opérateur : accorde / retire l'accès « Espace Club » à un joueur via son numéro (tout club).
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
  // Aide / signalements : le joueur envoie un message, l'opérateur les lit/traite.
  submitSupportMessage: (message: string, contactPhone?: string) => Promise<{ ok: boolean; error?: string }>;
  fetchSupportMessages: () => Promise<{ ok: boolean; messages: ServerSupportMessage[] }>;
  // Boucle de retour : le joueur relit SES messages d'aide et leur statut.
  fetchMySupportMessages: () => Promise<ServerSupportMessage[]>;
  setSupportMessageStatus: (id: string, status: ServerSupportMessage['status']) => Promise<{ ok: boolean }>;
  approveClub: (id: string) => void;
  rejectClub: (id: string) => void;
  setManagedClub: (id: string) => void;
  setClubSlots: (clubId: string, slots: string[]) => void;
  setClubCourts: (clubId: string, courts: string[]) => void;
  blockSlot: (b: BlockedSlot, startsAt: number) => boolean;
  unblockSlot: (clubId: string, dateKey: string, time: string, court: string) => void;
  setOperatorNews: (news: { title: string; subtitle?: string; link?: string }) => void;
  removeOperatorNews: () => void; // retire l'actu d'accueil publiée
  dismissNews: (id: string) => void;
  resetAll: () => void;
};

const AppContext = createContext<AppContextType | null>(null);
function computeStats(reservations: Reservation[], officialResults: OfficialResult[]): Stats {
  const now = Date.now();
  return {
    played: reservations.filter((r) => isPlayed(r, now)).length,
    tournamentsPlayed: officialResults.length,
    tournamentsWon: officialResults.filter((o) => o.result === 'win').length,
  };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(initialState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        // On repart de l'état par défaut puis on superpose l'état persisté (champs connus).
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
  // depuis Supabase (ainsi, dès que l'opérateur promeut un compte côté serveur, le
  // changement prend effet à la prochaine ouverture). Sans session → on ne touche à rien.
  // Préférence « rappels » lue par loadSession SANS la remettre dans ses dépendances
  // (sinon un simple basculement de l'interrupteur relancerait toute la session).
  const remindersOnRef = useRef(state.remindersOn);
  useEffect(() => {
    remindersOnRef.current = state.remindersOn;
  }, [state.remindersOn]);

  // Persistance SERVEUR du niveau : il évolue avec les tournois officiels (clôture / gain
  // détecté au rafraîchissement). On ne pousse QUE quand le profil du compte courant a été
  // hydraté (levelHydratedUserRef == uid) — sinon un démarrage / changement de compte poussait
  // 3.0 AVANT de connaître le vrai niveau serveur, l'écrasant définitivement en cas d'échec réseau.
  const levelSyncRef = useRef<number | null>(null);
  const levelHydratedUserRef = useRef<string | null>(null);
  useEffect(() => {
    const uid = state.serverUserId;
    if (!uid) {
      levelSyncRef.current = null; // déconnexion → on réarme pour le prochain compte
      levelHydratedUserRef.current = null;
      return;
    }
    if (levelHydratedUserRef.current !== uid) return; // profil pas encore chargé → on ne pousse rien
    if (levelSyncRef.current === state.level) return;
    levelSyncRef.current = state.level;
    void supabase.from('profiles').update({ level: state.level }).eq('id', uid);
  }, [state.level, state.serverUserId]);

  // « Époque » de session : incrémentée à chaque déconnexion / réinitialisation. Toute
  // requête en vol (loadSession, rafraîchissement au premier plan) capture l'époque au
  // départ et n'applique son résultat QUE si l'époque n'a pas changé entre-temps — sinon
  // une réponse tardive réécrirait les données d'un compte déjà déconnecté.
  const sessionEpochRef = useRef(0);

  // Charge (ou recharge) la session serveur : profil + rôle, réservations, occupation,
  // participations et clubs serveur. Réutilisé au démarrage ET après la confirmation
  // d'e-mail (deep link) — d'où l'extraction en fonction stable.
  const loadSession = useCallback(async () => {
    const epoch = sessionEpochRef.current;
    const stillCurrent = () => sessionEpochRef.current === epoch;
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId || !stillCurrent()) return;
      void registerPushToken(userId); // jeton de push → profil (pour les notifs serveur)
      // On connaît la session → mode « réservations serveur ». Si on CHANGE de compte
      // (userId différent de celui en mémoire), on repart d'un périmètre personnel NEUF
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
              favoriteClubIds: [],
              userReviews: [],
              myCompetitions: [],
              compRegistrations: {},
              compResults: {},
              officialResults: [],
              level: initialState.level,
            },
      );
      const { data: prof, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (!stillCurrent()) return;
      // Hors-ligne / erreur réseau : on GARDE le profil et le rôle persistés localement
      // (pas de rétrogradation silencieuse d'un gérant/opérateur qui ouvre l'app sans réseau).
      if (!error && prof) {
        const hydratedLevel = clampLevel(Number(prof.level ?? initialState.level));
        setState((s) => ({
          ...s,
          account: {
            firstName: prof.first_name ?? s.account?.firstName ?? '',
            lastName: prof.last_name ?? s.account?.lastName ?? '',
            phone: prof.phone ?? s.account?.phone ?? '',
            // L'e-mail d'AUTHENTIFICATION fait foi (il change après « changer d'e-mail », pas
            // profiles.email qui n'est renseigné qu'à la création) → on lit session.user.email.
            email: session?.user?.email ?? prof.email ?? s.account?.email,
            photoUri: prof.photo_uri ?? s.account?.photoUri,
            birthDate: prof.birth_date ?? s.account?.birthDate,
            gender: prof.gender ?? s.account?.gender,
          },
          role: (prof.role as AppState['role']) ?? 'player',
          serverManagedClubId: prof.managed_club_id ?? null,
          level: hydratedLevel,
        }));
        // Le niveau du compte courant est désormais connu : on arme la synchro (le ref reflète
        // la valeur serveur → aucun push tant qu'un tournoi ne l'a pas réellement modifié).
        levelSyncRef.current = hydratedLevel;
        levelHydratedUserRef.current = userId;
      }
      // Réservations : le serveur est la source de vérité → on remplace le miroir local
      // par les résas pertinentes (les miennes ; club/opérateur : celles de leur périmètre,
      // via RLS), l'occupation de TOUS (disponibilité), et les clubs ajoutés côté serveur.
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
        opPayments,
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
        fetchOperatorPayments(),
      ]);
      if (!stillCurrent()) return; // déconnexion survenue pendant le chargement → on n'écrit rien
      const { active: activeParts, pending: pendingParts } = splitParticipations(parts);
      // null = échec réseau pour ce fetch → on garde l'existant (≠ tableau/objet vide = succès).
      if (clubStatus) setClubStatusMap(clubStatus); // registre lu dans data/clubs (badge « Bientôt »)
      setState((s) => ({
        ...s,
        // En cas d'échec réseau on garde le miroir persisté (offline-friendly).
        reservations: reservationsRes.ok ? reservationsRes.reservations : s.reservations,
        occupancy: occ ?? s.occupancy,
        participantReservationIds: activeParts,
        pendingInvitationIds: pendingParts,
        // Amis synchronisés (le serveur fait foi). null = échec réseau → on garde le miroir.
        friends: friends ?? s.friends,
        // Demandes d'ami reçues en attente (Accepter / Refuser). null = échec réseau → on garde.
        friendRequests: friendReqs ?? s.friendRequests,
        // null = échec réseau → on garde les clubs serveur déjà chargés (sinon ils disparaîtraient).
        customClubs: serverClubs ? mergeServerClubs(s.customClubs, serverClubs) : s.customClubs,
        clubStatus: clubStatus ?? s.clubStatus,
        clubCommission: commissions ?? s.clubCommission, // vide pour les non-opérateurs (RLS)
        // Boosts serveur (visibles par tous) : actifs = ceux dont l'expiration est future.
        boostExpiry: boosts ?? s.boostExpiry,
        boostedClubIds: boosts ? Object.keys(boosts).filter((id) => boosts[id] > Date.now()) : s.boostedClubIds,
        // Pages club éditées par les gérants (serveur) → visibles par tous. On fusionne au-dessus
        // des éventuelles surcharges locales (le serveur fait foi pour les clubs qu'il connaît).
        clubInfo: { ...s.clubInfo, ...overrides },
        // Config club partagée (horaires, terrains, offres, coachs, photos).
        ...clubConfigSlices(s, configs),
        // Tournois serveur (visibles par tous, synchronisés) + mes inscriptions + clôtures.
        ...competitionSlices(s, serverComps, compRegs),
        tournamentFee: tournamentFee ?? s.tournamentFee,
        // Créneaux fermés hors app (serveur) : source de vérité, visibles par tous les joueurs.
        blockedSlots: blocked ?? s.blockedSlots,
        // Règlements opérateur (persistants). Vide pour les non-opérateurs (RLS).
        operatorPayments: opPayments ?? s.operatorPayments,
      }));
      // Resynchronise les rappels locaux (résas créées sur un autre appareil incluses).
      if (reservationsRes.ok) {
        const mine = reservationsRes.reservations.filter(
          (r) => (!r.userId || r.userId === userId || activeParts.includes(r.id)) && r.startsAt > Date.now(),
        );
        void syncMatchReminders(mine, remindersOnRef.current);
      }
    } catch {
      // getSession a échoué (réseau) : on reste sur l'état local hydraté, sans crash.
    }
  }, []);

  // Recharge les tournois serveur + mes inscriptions et les fusionne (foreground et après
  // une création/inscription/clôture). null = échec réseau → on garde l'existant.
  const refreshCompetitions = useCallback(async (userId: string) => {
    const [serverComps, compRegs] = await Promise.all([fetchCompetitions(userId), fetchMyCompRegistrations()]);
    if (!serverComps && !compRegs) return;
    setState((s) => ({ ...s, ...competitionSlices(s, serverComps, compRegs) }));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    // IIFE asynchrone : les setState de loadSession surviennent APRÈS un await (jamais de
    // façon synchrone dans le corps de l'effet) → pas de cascade de rendus.
    void (async () => {
      await loadSession();
    })();
  }, [hydrated, loadSession]);

  // Session révoquée À L'EXTÉRIEUR de l'app (jeton de rafraîchissement expiré/invalide,
  // compte supprimé côté serveur, mot de passe changé ailleurs) : Supabase émet SIGNED_OUT.
  // On remet alors l'app en état déconnecté pour ne pas laisser un compte « fantôme » affiché
  // avec des données qui ne se rechargeront plus. Notre propre signOut a déjà nettoyé l'état :
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

  // Retour au premier plan : on rafraîchit l'occupation (et mes résas) pour que la
  // disponibilité affichée ne reste pas figée si d'autres joueurs ont réservé entre-temps.
  useEffect(() => {
    if (!state.serverUserId) return;
    const userId = state.serverUserId;
    const sub = RNAppState.addEventListener('change', (st) => {
      if (st !== 'active') return;
      // On capture l'époque au déclenchement : si une déconnexion survient pendant les
      // requêtes, leurs résultats tardifs ne réécriront pas les données du compte sortant.
      const epoch = sessionEpochRef.current;
      const ok = () => sessionEpochRef.current === epoch;
      void fetchOccupancy().then((occ) => occ && ok() && setState((s) => ({ ...s, occupancy: occ })));
      void fetchReservations().then((res) => {
        if (res.ok && ok()) setState((s) => ({ ...s, reservations: res.reservations }));
      });
      void fetchMyParticipations(userId).then((parts) => {
        if (!ok()) return;
        const { active, pending } = splitParticipations(parts);
        setState((s) => ({ ...s, participantReservationIds: active, pendingInvitationIds: pending }));
      });
      // Amis ajoutés/retirés sur un autre appareil : on relit pour garder la liste à jour.
      void fetchFriends().then((friends) => friends && ok() && setState((s) => ({ ...s, friends })));
      // Nouvelles demandes d'ami reçues (retour au premier plan) → badge/section à jour.
      void fetchFriendRequests().then((reqs) => reqs && ok() && setState((s) => ({ ...s, friendRequests: reqs })));
      // Créneaux fermés par un club (sur un autre appareil) → dispo à jour partout.
      void fetchBlockedSlots().then((blocked) => blocked && ok() && setState((s) => ({ ...s, blockedSlots: blocked })));
      // Règlements opérateur (persistants) — vide pour les non-opérateurs (RLS).
      void fetchOperatorPayments().then((op) => op && ok() && setState((s) => ({ ...s, operatorPayments: op })));
      void fetchServerClubs().then(
        (serverClubs) => serverClubs && ok() && setState((s) => ({ ...s, customClubs: mergeServerClubs(s.customClubs, serverClubs) })),
      );
      // Statut piloté par l'opérateur (badges « Bientôt »/masquage de tout club) : on relit
      // pour refléter une bascule décidée sur un autre appareil sans réinstaller.
      void fetchClubStatus().then((clubStatus) => {
        if (!clubStatus || !ok()) return;
        setClubStatusMap(clubStatus);
        setState((s) => ({ ...s, clubStatus }));
      });
      void fetchClubBoosts().then((boosts) => {
        if (!boosts || !ok()) return;
        setState((s) => ({
          ...s,
          boostExpiry: boosts,
          boostedClubIds: Object.keys(boosts).filter((id) => boosts[id] > Date.now()),
        }));
      });
      // Config club (horaires, terrains, offres, coachs, photos) éditée par un gérant ailleurs :
      // on relit pour que la disponibilité et la fiche restent à jour sans réinstaller.
      void fetchClubConfigs().then((configs) => {
        if (ok()) setState((s) => ({ ...s, ...clubConfigSlices(s, configs) }));
      });
      // Tournois créés/validés/clôturés sur un autre appareil : on relit pour rester à jour.
      if (ok()) void refreshCompetitions(userId);
      // Rafraîchit le RÔLE/profil : si l'opérateur vient d'accorder l'accès gérant (#39), le
      // gérant voit son Espace Club apparaître au retour dans l'app, sans réinstaller.
      void supabase
        .from('profiles')
        .select('role, managed_club_id, level')
        .eq('id', userId)
        .maybeSingle()
        .then(({ data: prof }) => {
          if (!prof || !ok()) return;
          setState((s) => ({
            ...s,
            role: (prof.role as AppState['role']) ?? s.role,
            serverManagedClubId: prof.managed_club_id ?? null,
            level: clampLevel(Number(prof.level ?? s.level)),
          }));
        });
    });
    return () => sub.remove();
  }, [state.serverUserId, refreshCompetitions]);

  // Expiration AUTOMATIQUE des boosts « Sponsorisé » : à l'ouverture et à chaque retour au
  // premier plan, on retire ceux dont la date est dépassée — aucun badge doré ne traîne
  // après son terme, sans intervention de l'opérateur.
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
    sweep();
    const sub = RNAppState.addEventListener('change', (st) => st === 'active' && sweep());
    return () => sub.remove();
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    (async () => {
      try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        // Sauvegarde complète OK → on lève l'éventuel drapeau « stockage plein ».
        setState((s) => (s.storageFull ? { ...s, storageFull: false } : s));
      } catch {
        // Quota dépassé (photos volumineuses en data-uri) : plutôt que de TOUT perdre
        // silencieusement (offres, coachs…), on persiste sans les photos ET on prévient
        // l'utilisateur via le drapeau storageFull (bandeau dans l'Espace Club).
        try {
          const slim = {
            ...state,
            clubPhotos: {},
            account: state.account ? { ...state.account, photoUri: undefined } : null,
          };
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
        } catch {
          // stockage indisponible — l'app continue en mémoire
        }
        setState((s) => (s.storageFull ? s : { ...s, storageFull: true }));
      }
    })();
  }, [state, hydrated]);

  // MES réservations — source unique pour tout calcul PERSONNEL. En mode serveur, un compte
  // club/opérateur reçoit aussi les résas de son périmètre (RLS) ; on filtre donc sur mon
  // user_id pour ne jamais afficher/compter celles des autres comme les miennes.
  // En mode serveur : mes résas = celles que J'AI créées + celles où un ami m'a invité
  // (participantReservationIds) — ces dernières apparaissent chez moi sans recompter la
  // commission (une résa = un terrain = une commission, comptée chez l'auteur).
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
      updateAccount: (patch) => {
        setState((s) => ({ ...s, account: s.account ? { ...s.account, ...patch } : s.account }));
        // Persistance SERVEUR des champs texte modifiés (si connecté) : sans ça, ils étaient
        // écrasés par l'ancienne valeur serveur au prochain chargement.
        const userId = state.serverUserId;
        if (!userId) return;
        const row: Record<string, string | null> = {};
        if (patch.firstName !== undefined) row.first_name = patch.firstName.trim();
        if (patch.lastName !== undefined) row.last_name = patch.lastName.trim();
        if (patch.phone !== undefined) row.phone = patch.phone.trim();
        if (patch.birthDate !== undefined) row.birth_date = patch.birthDate?.trim() || null;
        if (patch.gender !== undefined) row.gender = patch.gender ?? null;
        if (Object.keys(row).length > 0) void supabase.from('profiles').update(row).eq('id', userId);
        // PHOTO : on l'envoie au stockage (survit à une réinstallation, synchro multi-appareils).
        if ('photoUri' in patch) {
          const uri = patch.photoUri;
          if (uri && !uri.startsWith('http')) {
            // Nouvelle photo locale → upload, puis on remplace l'URI locale par l'URL publique.
            void uploadAvatar(userId, uri).then((url) => {
              if (!url) return;
              setState((s) => ({ ...s, account: s.account ? { ...s.account, photoUri: url } : s.account }));
              void supabase.from('profiles').update({ photo_uri: url }).eq('id', userId);
            });
          } else {
            // Photo retirée (uri vide) ou déjà une URL serveur → on reflète tel quel côté serveur.
            void supabase
              .from('profiles')
              .update({ photo_uri: uri ?? null })
              .eq('id', userId);
          }
        }
      },
      // ── Inscription par E-MAIL (parcours principal) ────────────────────────
      // E-mail réel + mot de passe ; le téléphone est conservé (sans SMS). Avec la
      // confirmation d'e-mail activée côté Supabase, le compte est créé mais SANS session :
      // le profil est rempli automatiquement côté serveur (trigger handle_new_user) à
      // partir des `data` ci-dessous, et la session s'ouvre quand l'utilisateur clique le
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
            },
          },
        });
        if (error) return { ok: false, error: frAuthError(error.message) };
        // E-mail DÉJÀ utilisé : Supabase ne renvoie pas d'erreur (anti-énumération) mais
        // un user « factice » sans identités. On le détecte pour éviter d'afficher un faux
        // « vérifiez vos e-mails » et on oriente vers la connexion.
        if (data.user && data.user.identities?.length === 0) {
          return { ok: false, error: 'Cet e-mail a déjà un compte. Connecte-toi plutôt.' };
        }
        // Confirmation requise → pas encore de session : on invite à valider l'e-mail.
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
      // Ajouter / changer l'e-mail du compte : Supabase envoie un lien de confirmation à la
      // NOUVELLE adresse ; le changement ne s'applique qu'après le clic sur ce lien.
      updateEmail: async (email) => {
        const clean = email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return { ok: false, error: 'Adresse e-mail invalide.' };
        const { error } = await supabase.auth.updateUser({ email: clean }, { emailRedirectTo: Linking.createURL('auth-callback') });
        if (error) return { ok: false, error: frAuthError(error.message) };
        return { ok: true };
      },
      // Connexion serveur héritée — comptes créés AVANT l'e-mail, via le téléphone (e-mail
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
        // On efface d'ABORD le jeton push du profil sortant (session/RLS encore valides), sinon
        // l'ancien compte continuerait de recevoir sur ce téléphone les notifs d'un autre compte.
        const outgoing = state.serverUserId;
        if (outgoing)
          void supabase
            .from('profiles')
            .update({ expo_push_token: null })
            .eq('id', outgoing)
            .then(() => {});
        sessionEpochRef.current += 1; // invalide toute requête en vol du compte sortant
        supabase.auth.signOut().catch(() => {});
        void syncMatchReminders([], false); // on efface les rappels locaux du compte sortant
        setState(loggedOutState);
      },
      // Réinitialisation du mot de passe : envoie un lien par e-mail qui rouvre l'app sur l'écran
      // DÉDIÉ « reset-password » (≠ auth-callback de la confirmation d'inscription) où l'utilisateur
      // saisit un NOUVEAU mot de passe. Pas d'erreur révélée si l'e-mail n'existe pas (anti-énumération).
      resetPassword: async (email) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
          redirectTo: Linking.createURL('reset-password'),
        });
        if (error) return { ok: false, error: frAuthError(error.message) };
        return { ok: true };
      },
      // Renvoie l'e-mail de confirmation d'inscription (si l'utilisateur ne l'a pas reçu / l'a perdu).
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
      // la ligne auth.users → cascade sur profil/résas/parrainages ; puis on revient à l'écran
      // d'accueil dans un état neuf. Irréversible : l'écran appelant confirme avant d'appeler.
      deleteAccount: async () => {
        const { error } = await supabase.rpc('delete_account');
        if (error) return { ok: false, error: 'Suppression impossible — réessaie dans un instant.' };
        sessionEpochRef.current += 1;
        supabase.auth.signOut().catch(() => {});
        void syncMatchReminders([], false);
        setState(loggedOutState);
        return { ok: true };
      },
      setLevel: (n) => setState((s) => ({ ...s, level: clampLevel(n) })),
      // Clôture par l'ORGANISATEUR (ou le club hôte) : fige le vainqueur + podium. Le NIVEAU des
      // joueurs inscrits est attribué UNE SEULE FOIS côté serveur (close_competition, tournois
      // officiels) → jamais recalculé côté client (pas de double attribution à la réinstallation).
      closeCompetition: async (comp, winnerName, winnerIsMe, loserName, loserIsMe, podium) => {
        const serverComp = state.myCompetitions.find((c) => c.id === comp.id && c.server);
        if (serverComp) {
          const ok = await closeCompetitionRpc(comp.id, {
            winner: winnerName,
            second: podium?.second,
            third: podium?.third,
            loser: loserName,
          });
          if (!ok) return; // le serveur a refusé (droits)
          if (state.serverUserId) {
            // Rejoue clôture + palmarès depuis le serveur, puis relit MON niveau (mis à jour côté
            // serveur si j'ai gagné/perdu) pour l'afficher immédiatement.
            await refreshCompetitions(state.serverUserId);
            void supabase
              .from('profiles')
              .select('level')
              .eq('id', state.serverUserId)
              .maybeSingle()
              .then(({ data }) => data && setState((s) => ({ ...s, level: clampLevel(Number(data.level ?? s.level)) })));
          }
          return;
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
      },
      setRemindersOn: (on) => {
        setState((s) => ({ ...s, remindersOn: on }));
        // (Dé)programme les rappels locaux pour MES résas à venir (pas celles des autres,
        // qu'un compte club/opérateur reçoit via RLS) selon l'interrupteur.
        const upcoming = myReservations.filter((r) => r.startsAt > Date.now());
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
          return { ok: true };
        }
        setState((s) => ({ ...s, myCompetitions: [{ ...c, id: uid(), createdByMe: true, server: false }, ...s.myCompetitions] }));
        return { ok: true };
      },
      // Le club hôte (ou l'opérateur) valide un tournoi créé par un joueur (« en attente » → visible).
      approveCompetition: async (id) => {
        const serverComp = state.myCompetitions.find((c) => c.id === id && c.server);
        if (serverComp) {
          const ok = await approveCompetitionRpc(id);
          if (ok && state.serverUserId) await refreshCompetitions(state.serverUserId);
          return;
        }
        setState((s) => ({ ...s, myCompetitions: s.myCompetitions.map((c) => (c.id === id ? { ...c, status: 'approved' } : c)) }));
      },
      // Le club hôte refuse un tournoi joueur « en attente » → « refusé » (jamais publié).
      rejectCompetition: async (id) => {
        const serverComp = state.myCompetitions.find((c) => c.id === id && c.server);
        if (serverComp) {
          const ok = await rejectCompetitionRpc(id);
          if (ok && state.serverUserId) await refreshCompetitions(state.serverUserId);
          return;
        }
        setState((s) => ({ ...s, myCompetitions: s.myCompetitions.map((c) => (c.id === id ? { ...c, status: 'rejected' } : c)) }));
      },
      deleteCompetition: async (id) => {
        const serverComp = state.myCompetitions.find((c) => c.id === id && c.server);
        if (serverComp) {
          const ok = await deleteCompetitionRpc(id);
          if (!ok) return; // le serveur a refusé (droits) → on ne retire rien localement
        }
        setState((s) => {
          const regs = { ...s.compRegistrations };
          delete regs[id];
          return { ...s, myCompetitions: s.myCompetitions.filter((c) => c.id !== id), compRegistrations: regs };
        });
      },
      registerCompetition: async (id, partner) => {
        const serverComp = state.myCompetitions.find((c) => c.id === id && c.server);
        if (serverComp) {
          const ok = await registerCompetitionRpc(id, partner);
          if (!ok) return; // tournoi complet / non publié / échec
        }
        setState((s) =>
          s.compRegistrations[id]
            ? s
            : { ...s, compRegistrations: { ...s.compRegistrations, [id]: { partner: partner.trim() || 'Partenaire', at: Date.now() } } },
        );
        if (serverComp && state.serverUserId) void refreshCompetitions(state.serverUserId); // maj du compteur d'inscrits
      },
      unregisterCompetition: async (id) => {
        const serverComp = state.myCompetitions.find((c) => c.id === id && c.server);
        if (serverComp) {
          const ok = await unregisterCompetitionRpc(id);
          if (!ok) return;
        }
        setState((s) => {
          const next = { ...s.compRegistrations };
          delete next[id];
          return { ...s, compRegistrations: next };
        });
        if (serverComp && state.serverUserId) void refreshCompetitions(state.serverUserId);
      },
      // Opérateur : règle le frais fixe appliqué aux futurs tournois joueurs.
      setTournamentFee: async (amount) => {
        const ok = await setTournamentFeeRpc(amount);
        if (!ok) return { ok: false };
        setState((s) => ({ ...s, tournamentFee: Math.max(0, Math.round(amount)) }));
        return { ok: true };
      },
      addReservation: async (r) => {
        // Garde-fou : on ne réserve jamais un créneau dont l'heure de début est passée.
        if (r.startsAt <= Date.now()) return false;
        // Anti double-réservation locale (réponse immédiate). La barrière FORTE reste la
        // contrainte unique serveur : si un autre joueur a pris le terrain entre-temps,
        // l'insert échoue (conflict) et on renvoie false.
        const sameSlot = (x: { clubId: string; dateKey: string; time: string; court: string }) =>
          x.clubId === r.clubId && x.dateKey === r.dateKey && x.time === r.time && x.court === r.court;
        if (state.reservations.some(sameSlot) || state.occupancy.some(sameSlot)) return false;
        const bookedBy = state.account
          ? { name: `${state.account.firstName} ${state.account.lastName}`.trim(), phone: state.account.phone }
          : undefined;

        // Mode SERVEUR (connecté) : on écrit sur Supabase d'abord (source de vérité).
        if (state.serverUserId) {
          const res = await insertReservation(r, state.serverUserId, bookedBy);
          if (!res.ok || !res.reservation) {
            // Conflit (un autre joueur a pris le terrain) : on resynchronise l'occupation
            // pour que la disponibilité affichée se corrige immédiatement (anti dead-loop).
            if (res.conflict) {
              const fresh = await fetchOccupancy();
              if (fresh) setState((s) => ({ ...s, occupancy: fresh }));
            }
            return false;
          }
          const created = res.reservation;
          setState((s) => ({
            ...s,
            reservations: [created, ...s.reservations.filter((x) => x.id !== created.id)],
            occupancy: [...s.occupancy, { clubId: created.clubId, dateKey: created.dateKey, time: created.time, court: created.court }],
          }));
          // Réservation PARTAGÉE : les amis invités qui ont un compte la voient aussi chez eux.
          // On rattache par numéro (résolu côté serveur) — la résa reste UNIQUE (une commission).
          const invitedPhones = (created.invited ?? [])
            .map((iv) => state.friends.find((f) => f.id === iv.id)?.phone)
            .filter((p): p is string => !!p);
          if (invitedPhones.length > 0) void linkParticipants(created.id, invitedPhones);
          if (state.remindersOn) void scheduleMatchReminder(created); // rappel local ~2 h avant
          return true;
        }

        // Mode LOCAL (démo, hors session) : comportement d'origine.
        const localId = uid();
        setState((s) => {
          if (s.reservations.some(sameSlot)) return s;
          return { ...s, reservations: [{ ...r, bookedBy, id: localId, createdAt: Date.now() }, ...s.reservations] };
        });
        if (state.remindersOn) void scheduleMatchReminder({ ...r, id: localId });
        return true;
      },
      cancelReservation: async (id) => {
        const res = state.reservations.find((r) => r.id === id);
        // Serveur d'abord (si connecté et résa serveur) : on n'efface le miroir qu'au succès.
        // La fonction serveur refuse l'annulation à moins de 5h (règle non contournable).
        if (state.serverUserId && res) {
          const ok = await cancelReservationRow(id);
          if (!ok) return false; // refus serveur (délai 5h) ou réseau → on ne ment pas à l'UI
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
      // Le club (ou l'opérateur) marque une réservation « pas venu » : la fonction serveur la
      // passe en 'no_show' (créneau libéré, absence comptée). On retire la résa du miroir local
      // et l'occupation correspondante, comme pour une annulation. false si refusé.
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
      // Réservation partagée : l'invité accepte ou refuse. Mise à jour optimiste (on retire
      // l'invitation des « à confirmer » ; si refus, on retire aussi la résa de ma liste), puis
      // on confirme côté serveur — en cas d'échec on rejoue l'état précédent.
      respondInvitation: async (reservationId, accept) => {
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
        if (!ok) {
          setState((s) => ({ ...s, pendingInvitationIds: prevPending, participantReservationIds: prevParts }));
        }
        return ok;
      },
      confirmReservationByClub: async (id) => {
        const res = state.reservations.find((r) => r.id === id);
        const next = !res?.clubConfirmed;
        if (state.serverUserId && res) {
          const ok = await setClubConfirmedRow(id, next);
          if (!ok) return false; // RLS/réseau a refusé → on ne bascule pas l'affichage
        }
        setState((s) => ({
          ...s,
          reservations: s.reservations.map((r) => (r.id === id ? { ...r, clubConfirmed: next } : r)),
        }));
        return true;
      },
      sendFriendRequest: async (phone) => {
        // Hors session : impossible d'envoyer une vraie demande.
        if (!state.serverUserId) return { status: 'error' };
        const res = await sendFriendRequestOnServer(phone);
        // Cas 'accepted' (la personne m'avait déjà invité) : le lien mutuel est créé côté serveur,
        // on l'ajoute tout de suite au miroir local (anti-doublon par id / numéro).
        if (res.status === 'accepted' && res.friend) {
          const friend = res.friend;
          setState((s) => {
            const digits = phone.replace(/\D/g, '').slice(-10);
            if (s.friends.some((f) => f.id === friend.id)) return s;
            if (digits.length >= 8 && s.friends.some((f) => (f.phone ?? '').replace(/\D/g, '').slice(-10) === digits)) return s;
            return { ...s, friends: [friend, ...s.friends] };
          });
        }
        return res;
      },
      respondFriendRequest: async (requestId, accept) => {
        const ok = await respondFriendRequestOnServer(requestId, accept);
        if (!ok) return false;
        // On retire la demande de la liste « reçues » et, si acceptée, on recharge la liste d'amis
        // (le lien mutuel vient d'être créé côté serveur → id stable, nom, niveau à jour).
        setState((s) => ({ ...s, friendRequests: s.friendRequests.filter((r) => r.requestId !== requestId) }));
        if (accept) void fetchFriends().then((friends) => friends && setState((s) => ({ ...s, friends })));
        return true;
      },
      removeFriend: (id) => {
        if (state.serverUserId) void removeFriendOnServer(id); // retrait serveur (idempotent, deux sens)
        setState((s) => ({ ...s, friends: s.friends.filter((f) => f.id !== id) }));
      },
      toggleFavorite: (clubId) =>
        setState((s) => ({
          ...s,
          favoriteClubIds: s.favoriteClubIds.includes(clubId)
            ? s.favoriteClubIds.filter((x) => x !== clubId)
            : [...s.favoriteClubIds, clubId],
        })),
      // Photo de club : un fichier local est d'abord ENVOYÉ au Storage (URL publique) pour que
      // les joueurs la voient sur tous les appareils ; une URL https est gardée telle quelle.
      // Puis on enregistre la liste des photos côté serveur (config club).
      addClubPhoto: async (clubId, uri) => {
        if (!uri) return;
        const current = state.clubPhotos[clubId] ?? [];
        if (current.length >= MAX_CLUB_PHOTOS) return;
        let finalUrl = uri;
        const isLocalUri = !/^https?:\/\//.test(uri);
        if (state.serverUserId && isLocalUri) {
          const uploaded = await uploadClubPhoto(clubId, uri);
          // Échec d'upload sur un club serveur : on N'ENREGISTRE PAS une URI locale (file:// ou
          // data-URI) — elle serait illisible pour les autres appareils/joueurs. On prévient.
          if (!uploaded) {
            Alert.alert('Photo non envoyée', "L'envoi de la photo a échoué. Vérifie ta connexion et réessaie.");
            return;
          }
          finalUrl = uploaded;
        }
        setState((s) => {
          const existing = s.clubPhotos[clubId] ?? [];
          // Plafond pour éviter de dépasser le quota de stockage local (perte de photos).
          if (existing.includes(finalUrl) || existing.length >= MAX_CLUB_PHOTOS) return s;
          const next = [...existing, finalUrl];
          if (s.serverUserId) void upsertClubConfig(clubId, { photos: next });
          return { ...s, clubPhotos: { ...s.clubPhotos, [clubId]: next } };
        });
      },
      removeClubPhoto: (clubId, uri) =>
        setState((s) => {
          const next = (s.clubPhotos[clubId] ?? []).filter((x) => x !== uri);
          if (s.serverUserId) {
            void upsertClubConfig(clubId, { photos: next });
            void removeClubPhotoFile(uri); // best-effort : retire aussi le fichier du Storage
          }
          return { ...s, clubPhotos: { ...s.clubPhotos, [clubId]: next } };
        }),
      addClubOffer: (clubId, kind, title, detail) =>
        setState((s) => {
          const t = title.trim();
          if (!t) return s;
          const existing = s.clubOffers[clubId] ?? [];
          const next = [{ id: uid(), kind, title: t, detail: detail.trim() }, ...existing];
          if (s.serverUserId) void upsertClubConfig(clubId, { offers: next });
          return { ...s, clubOffers: { ...s.clubOffers, [clubId]: next } };
        }),
      removeClubOffer: (clubId, id) =>
        setState((s) => {
          const next = (s.clubOffers[clubId] ?? []).filter((o) => o.id !== id);
          if (s.serverUserId) void upsertClubConfig(clubId, { offers: next });
          return { ...s, clubOffers: { ...s.clubOffers, [clubId]: next } };
        }),
      addClubCoach: (clubId, name, specialty, phone) =>
        setState((s) => {
          const n = name.trim();
          if (!n) return s;
          // Normalise le téléphone en format international (+225) pour que le lien
          // WhatsApp/appel fonctionne (sinon openWhatsApp échoue sur un numéro local).
          const p = phone.trim();
          const normPhone = p ? (p.startsWith('+') ? p : `+225 ${p}`) : undefined;
          const existing = s.clubCoaches[clubId] ?? [];
          const next = [{ id: uid(), name: n, specialty: specialty.trim() || 'Coach', phone: normPhone }, ...existing];
          if (s.serverUserId) void upsertClubConfig(clubId, { coaches: next });
          return { ...s, clubCoaches: { ...s.clubCoaches, [clubId]: next } };
        }),
      removeClubCoach: (clubId, id) =>
        setState((s) => {
          const next = (s.clubCoaches[clubId] ?? []).filter((c) => c.id !== id);
          if (s.serverUserId) void upsertClubConfig(clubId, { coaches: next });
          return { ...s, clubCoaches: { ...s.clubCoaches, [clubId]: next } };
        }),
      setClubInfo: (clubId, patch) =>
        setState((s) => {
          const merged = { ...s.clubInfo[clubId], ...patch };
          // Le gérant connecté pousse sa page au serveur (visible par tous). Le serveur refuse
          // si ce n'est pas son club (gérant d'un autre club / joueur) — la modif reste alors locale.
          if (s.serverUserId) void upsertClubOverride(clubId, merged);
          return { ...s, clubInfo: { ...s.clubInfo, [clubId]: merged } };
        }),
      toggleBoostClub: (clubId) =>
        setState((s) => ({
          ...s,
          boostedClubIds: s.boostedClubIds.includes(clubId) ? s.boostedClubIds.filter((x) => x !== clubId) : [...s.boostedClubIds, clubId],
        })),
      // Boost piloté côté SERVEUR → visible par tous les joueurs. On écrit d'abord au serveur
      // (réservé à l'opérateur), puis on met à jour le miroir local au succès.
      setBoost: async (clubId, days) => {
        const expiry = days > 0 ? Date.now() + days * 86400000 : null;
        if (state.serverUserId) {
          const ok = await setClubBoostRpc(clubId, expiry);
          if (!ok) return { ok: false };
        }
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
      setPaymentStatus: (clubId, weekKey, status) => {
        const k = `${clubId}:${weekKey}`;
        // Persistance SERVEUR (opérateur) : le statut « Payé / envoyé » survit à une réinstallation
        // ou à un 2ᵉ appareil (sinon des sommes déjà réglées réapparaissaient « à facturer »).
        if (state.serverUserId) void setOperatorPaymentRpc(k, status);
        setState((s) => {
          const next = { ...s.operatorPayments };
          if (status === 'tofacture') delete next[k];
          else next[k] = status;
          return { ...s, operatorPayments: next };
        });
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
            rating: 0,
            reviewsCount: 0,
            mapsQuery: `${n} padel ${area.trim() || ''} Abidjan`.replace(/\s+/g, ' '),
            accent: accents[s.customClubs.length % accents.length],
            status: 'pending',
            contactPhone: contactPhone?.trim() || undefined,
            createdAt: Date.now(),
          };
          // Le gérant bascule directement sur SON club pour préparer sa page.
          return { ...s, customClubs: [...s.customClubs, club], managedClubId: club.id };
        }),
      // Le gérant annule SA demande tant qu'elle est « en attente » (pas encore activée).
      cancelOwnClubRequest: (id) =>
        setState((s) => ({
          ...s,
          customClubs: s.customClubs.filter((c) => !(c.id === id && c.status === 'pending')),
        })),
      // ── Demandes d'inscription club (serveur) ──────────────────────────────
      // Un joueur envoie « inscris mon club » → ligne dans club_requests (RLS :
      // l'auteur peut créer, seul l'opérateur lit/traite). L'opérateur les voit
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
          contact_phone: input.contactPhone?.trim() || null,
          message: input.message?.trim() || null,
          requested_by: user.id,
        });
        if (error) return { ok: false, error: 'Envoi impossible — réessaie dans un instant.' };
        return { ok: true };
      },
      fetchClubRequests: async () => {
        const { data, error } = await supabase.from('club_requests').select('*').order('created_at', { ascending: false });
        // On distingue « rien à traiter » d'un échec (réseau / RLS) : l'opérateur ne doit
        // pas croire qu'il n'y a aucune demande alors que le chargement a juste échoué.
        if (error) return { ok: false, requests: [] };
        return { ok: true, requests: (data ?? []) as ServerClubRequest[] };
      },
      setClubRequestStatus: async (id, status) => {
        const { error } = await supabase.from('club_requests').update({ status }).eq('id', id);
        return { ok: !error };
      },
      // Approbation serveur : crée le club + donne l'accès gérant au demandeur, puis
      // recharge la liste des clubs serveur pour que le nouveau club apparaisse aussitôt.
      approveClubRequest: async (requestId) => {
        const res = await approveClubRequestRpc(requestId);
        if (res.ok) {
          const serverClubs = await fetchServerClubs();
          if (serverClubs) setState((s) => ({ ...s, customClubs: mergeServerClubs(s.customClubs, serverClubs) }));
        }
        return res;
      },
      // Opérateur : change le statut d'un club serveur (Actif ⇄ Bientôt ⇄ masqué) puis
      // recharge la liste pour refléter le changement immédiatement.
      operatorSetClubStatus: async (clubId, status) => {
        const ok = await setClubStatusRpc(clubId, status);
        if (ok) {
          const serverClubs = await fetchServerClubs();
          if (serverClubs) setState((s) => ({ ...s, customClubs: mergeServerClubs(s.customClubs, serverClubs) }));
        }
        return { ok };
      },
      // Opérateur : bascule le statut de N'IMPORTE QUEL club (y compris les 9 de base
      // embarqués). On relit la table club_status, met à jour le registre lu par data/clubs
      // (badges « Bientôt »/masquage appliqués partout) et l'état pour re-rendre.
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
      // Opérateur : donne l'accès « Espace Club » à un joueur (par numéro) pour un club donné.
      // Le gérant le voit apparaître au prochain retour dans l'app (rafraîchissement du rôle).
      operatorGrantClubAccess: async (phone, clubId) => grantClubAccessByPhoneRpc(phone, clubId),
      operatorRevokeClubAccess: async (phone) => revokeClubAccessByPhoneRpc(phone),
      // Opérateur : fixe la commission propre à un club (taux 0–1). Met à jour l'état local
      // pour que le décompte se recalcule aussitôt avec le bon pourcentage.
      operatorSetClubCommission: async (clubId, rate) => {
        const ok = await setClubCommissionRpc(clubId, rate);
        if (ok) setState((s) => ({ ...s, clubCommission: { ...s.clubCommission, [clubId]: rate } }));
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
        if (error) return [];
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
      // change la disponibilité réelle). Le serveur refuse si ce n'est pas son club → reste local.
      setClubSlots: (clubId, slots) =>
        setState((s) => {
          const next = [...slots].sort();
          if (s.serverUserId) void upsertClubConfig(clubId, { slots: next });
          return { ...s, clubSlots: { ...s.clubSlots, [clubId]: next } };
        }),
      setClubCourts: (clubId, courts) =>
        setState((s) => {
          if (s.serverUserId) void upsertClubConfig(clubId, { courts });
          return { ...s, clubCourts: { ...s.clubCourts, [clubId]: courts } };
        }),
      // Fermer un créneau hors app. Garde-fous : jamais dans le passé, jamais par-dessus
      // une réservation PadelConnect, jamais en double.
      blockSlot: (b, startsAt) => {
        if (startsAt <= Date.now()) return false;
        const sameSlot = (x: { clubId: string; dateKey: string; time: string; court: string }) =>
          x.clubId === b.clubId && x.dateKey === b.dateKey && x.time === b.time && x.court === b.court;
        if (state.reservations.some(sameSlot)) return false;
        if (state.blockedSlots.some(sameSlot)) return false;
        // Persistance SERVEUR : le blocage devient RÉEL (visible par tous, empêche vraiment la
        // réservation via le trigger) et survit à la réinstallation. Optimiste + réconcilié au fetch.
        if (state.serverUserId) void blockSlotRow(b);
        setState((s) => ({ ...s, blockedSlots: [...s.blockedSlots, b] }));
        return true;
      },
      unblockSlot: (clubId, dateKey, time, court) => {
        if (state.serverUserId) void unblockSlotRow(clubId, dateKey, time, court);
        setState((s) => ({
          ...s,
          blockedSlots: s.blockedSlots.filter(
            (x) => !(x.clubId === clubId && x.dateKey === dateKey && x.time === time && x.court === court),
          ),
        }));
      },
      // L'opérateur publie/met à jour l'actu d'accueil. On ne régénère l'id (ce qui la
      // fait RÉAPPARAÎTRE chez les joueurs qui l'avaient fermée) QUE si le contenu change.
      setOperatorNews: (news) =>
        setState((s) => {
          const title = news.title.trim();
          const subtitle = news.subtitle?.trim() || undefined;
          // Lien : on n'accepte qu'une URL ; on préfixe https:// si l'opérateur l'a oublié.
          let link = news.link?.trim() || undefined;
          if (link && !/^https?:\/\//i.test(link)) link = `https://${link}`;
          if (link && !/^https?:\/\/.+\..+/i.test(link)) link = undefined;
          const prev = s.operatorNews;
          const unchanged = !!prev && prev.title === title && prev.subtitle === subtitle && prev.link === link;
          return { ...s, operatorNews: { id: unchanged ? prev.id : uid(), title, subtitle, link } };
        }),
      removeOperatorNews: () => setState((s) => ({ ...s, operatorNews: null })),
      dismissNews: (id) => setState((s) => ({ ...s, dismissedNewsId: id })),
      resetAll: () => {
        // Réinitialisation TOTALE : on coupe la session serveur, on efface les rappels et
        // la clé persistée, puis on revient à l'état seed complet (≈ première ouverture).
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
