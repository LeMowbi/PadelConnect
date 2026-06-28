// État global de l'app (prototype) + persistance locale via AsyncStorage.

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { clubs, type Club, type CustomClub, type PriceTier } from '@/data/clubs';
import type { Competition } from '@/data/competitions';
import { DEMO_CLOSED_COMP, DEMO_FINISHED_COMP } from '@/data/competitions';
import type { Review } from '@/data/reviews';
import { seedFriends, type Friend } from '@/data/user';
import { dayKey, nextDays } from '@/lib/days';
import { priceForSlot } from '@/lib/pricing';
import { phoneToAuthEmail, supabase } from '@/lib/supabase';
import { ACCENTS } from '@/theme';

export type Account = {
  firstName: string;
  lastName: string;
  phone: string;
  photoUri?: string;
  birthDate?: string; // JJ/MM/AAAA — sert à l'âge et au signe astro
  gender?: 'homme' | 'femme' | 'nd';
};
export type Invited = { id: string; name: string; confirmed: boolean };

export type Reservation = {
  id: string;
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
export type CompResult = { winner: string; loser?: string; closedAt: number };

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

type AppState = {
  account: Account | null;
  level: number; // 1.0 → 7.0
  remindersOn: boolean; // préférence : rappels de match (sur l'app installée)
  reserverView: 'Par heure' | 'Par club'; // dernière vue utilisée sur l'écran Réserver
  userReviews: Review[];
  myCompetitions: Competition[];
  reservations: Reservation[];
  favoriteClubIds: string[];
  friends: Friend[];
  officialResults: OfficialResult[];
  compRegistrations: Record<string, { partner: string; at: number }>;
  compResults: Record<string, CompResult>; // tournoi clôturé → équipe vainqueure
  clubPhotos: Record<string, string[]>;
  clubOffers: Record<string, { id: string; kind: 'offre' | 'actu' | 'evenement'; title: string; detail: string }[]>;
  clubCoaches: Record<string, { id: string; name: string; specialty: string; phone?: string }[]>;
  clubInfo: Record<string, ClubInfo>; // surcharges gérant (nom, tarif, WhatsApp…)
  clubCodes: Record<string, string>; // code à 4 chiffres d'accès à l'Espace Club (démo)
  unlockedClubIds: string[]; // clubs déjà déverrouillés sur cet appareil
  hiddenCoachIds: string[]; // coachs (de démo) retirés par leur club
  boostedClubIds: string[];
  boostExpiry: Record<string, number>; // clubId → date d'expiration du boost (affichage)
  operatorPayments: Record<string, 'sent' | 'paid'>; // « clubId:AAAA-MM » → statut de règlement
  customClubs: CustomClub[]; // clubs inscrits via l'app (activation par l'opérateur)
  clubMode: boolean;
  // Espace opérateur : protégé par un code PIN défini par l'opérateur sur SON appareil.
  // `operatorPin` est persisté ; `operatorUnlocked` est une session (remis à false à
  // chaque lancement) → le PIN est redemandé à chaque ouverture de l'app.
  operatorPin: string | null;
  operatorUnlocked: boolean;
  // RÔLE vérifié côté serveur (Supabase) — la VRAIE sécurité des espaces.
  //  - 'operator' : toi (PadelConnect). 'club' : un gérant. 'player' : par défaut.
  // Un joueur ne peut pas se promouvoir (protégé par un trigger côté serveur).
  role: 'player' | 'operator' | 'club';
  serverManagedClubId: string | null; // pour un compte 'club' : l'id du club géré
  storageFull: boolean; // true si la sauvegarde a dû abandonner des photos (quota plein)
  managedClubId: string;
  clubSlots: Record<string, string[]>; // horaires ouverts par club
  clubCourts: Record<string, string[]>; // terrains (courts) gérés par club
  blockedSlots: BlockedSlot[]; // créneaux fermés hors app par les clubs
  operatorNews: OperatorNews | null; // actu d'accueil publiée par l'opérateur
  dismissedNewsId: string | null; // id de l'actu fermée par le joueur (réapparaît si nouvelle)
  followed: Record<string, { name: string; level?: number; favoriteClub?: string }>; // joueurs suivis
};

// 3 chiffres, pas plus : parties jouées (auto), tournois joués, tournois gagnés.
export type Stats = { played: number; tournamentsPlayed: number; tournamentsWon: number };

export const COMMISSION_RATE = 0.1; // commission opérateur (10 %)
const LEVEL_STEP = 0.5; // bonus de niveau pour l'équipe vainqueure d'un tournoi officiel
const LEVEL_PENALTY = 0.25; // malus de niveau pour l'équipe classée dernière (facultatif)
const STORAGE_KEY = 'padelco_state_v4'; // v4 : modèle sans matchs ni victoires/défaites
export const MAX_CLUB_PHOTOS = 6; // plafond de photos par club (quota de stockage local)

// Traduit les messages d'erreur Supabase en français clair pour l'utilisateur.
function frAuthError(msg: string): string {
  const m = (msg || '').toLowerCase();
  if (m.includes('invalid login')) return 'Numéro ou mot de passe incorrect.';
  if (m.includes('already registered') || m.includes('already been registered'))
    return 'Ce numéro a déjà un compte — connecte-toi.';
  if (m.includes('password should be') || m.includes('password')) return 'Mot de passe trop court (6 caractères minimum).';
  if (m.includes('network') || m.includes('fetch') || m.includes('timeout')) return 'Connexion internet impossible — réessaie.';
  if (m.includes('email logins are disabled') || m.includes('signups not allowed'))
    return 'Connexion désactivée côté serveur (vérifie la config Supabase).';
  return msg || 'Une erreur est survenue. Réessaie.';
}

const initialState: AppState = {
  account: null,
  level: 3.0,
  remindersOn: true,
  reserverView: 'Par heure',
  userReviews: [],
  myCompetitions: [],
  reservations: [],
  favoriteClubIds: [],
  friends: seedFriends,
  officialResults: [],
  compRegistrations: {},
  compResults: {},
  clubPhotos: {},
  clubOffers: {},
  clubCoaches: {},
  clubInfo: {},
  // Codes de démo : un code à 4 chiffres par club de base (visibles dans l'Espace opérateur).
  clubCodes: Object.fromEntries(clubs.map((c, i) => [c.id, String((((i + 1) * 1234) % 9000) + 1000)])),
  unlockedClubIds: [],
  hiddenCoachIds: [],
  boostedClubIds: [],
  boostExpiry: {},
  operatorPayments: {},
  customClubs: [],
  clubMode: false,
  operatorPin: null,
  operatorUnlocked: false,
  role: 'player',
  serverManagedClubId: null,
  storageFull: false,
  managedClubId: 'padelta',
  clubSlots: {},
  clubCourts: {},
  blockedSlots: [],
  // Actu d'accueil de démo (modifiable dans l'Espace opérateur).
  operatorNews: {
    id: 'news-bienvenue',
    title: 'Bienvenue sur PadelConnect 🎾',
    subtitle: "Réserve ton terrain en 2 minutes — tous les clubs d'Abidjan.",
  },
  dismissedNewsId: null,
  followed: {},
};

type AppContextType = {
  state: AppState;
  hydrated: boolean;
  stats: Stats;
  setAccount: (a: Account) => void;
  updateAccount: (patch: Partial<Account>) => void;
  loadDemo: () => void;
  // Connexion serveur (Supabase) — téléphone + mot de passe (sans SMS).
  signUpWithPhone: (
    phone: string,
    password: string,
    profile: { firstName: string; lastName: string; birthDate?: string; gender?: Account['gender']; level?: number },
  ) => Promise<{ ok: boolean; error?: string }>;
  signInWithPhone: (phone: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => void;
  setLevel: (n: number) => void;
  closeCompetition: (
    comp: { id: string; title: string; official?: boolean },
    winnerName: string,
    winnerIsMe: boolean,
    loserName?: string,
    loserIsMe?: boolean,
  ) => void;
  setRemindersOn: (on: boolean) => void;
  setReserverView: (v: 'Par heure' | 'Par club') => void;
  addReview: (clubId: string, rating: number, text: string) => void;
  addCompetition: (c: Omit<Competition, 'id' | 'createdByMe'>) => void;
  approveCompetition: (id: string) => void; // le club hôte valide un tournoi créé par un joueur
  deleteCompetition: (id: string) => void; // annulation / refus d'un tournoi (créateur ou club hôte)
  registerCompetition: (id: string, partner: string) => void;
  unregisterCompetition: (id: string) => void;
  addReservation: (r: Omit<Reservation, 'id' | 'createdAt' | 'bookedBy'>) => boolean;
  cancelReservation: (id: string) => void;
  confirmReservationByClub: (id: string) => void;
  addFriend: (name: string, phone: string) => void;
  removeFriend: (id: string) => void;
  toggleFavorite: (clubId: string) => void;
  addClubPhoto: (clubId: string, uri: string) => void;
  removeClubPhoto: (clubId: string, uri: string) => void;
  addClubOffer: (clubId: string, kind: 'offre' | 'actu' | 'evenement', title: string, detail: string) => void;
  removeClubOffer: (clubId: string, id: string) => void;
  addClubCoach: (clubId: string, name: string, specialty: string, phone: string) => void;
  removeClubCoach: (clubId: string, id: string) => void;
  setClubInfo: (clubId: string, patch: ClubInfo) => void;
  toggleHideCoach: (coachId: string) => void;
  toggleBoostClub: (clubId: string) => void;
  setBoost: (clubId: string, days: number) => void; // days > 0 active (avec expiration), 0 désactive
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
  approveClub: (id: string) => void;
  rejectClub: (id: string) => void;
  unlockClub: (clubId: string, code: string) => boolean;
  setClubCode: (clubId: string, code: string) => void;
  setClubMode: (on: boolean) => void;
  setOperatorPin: (pin: string | null) => void; // définit/efface le code PIN opérateur
  // Tente de déverrouiller l'Espace opérateur : crée le PIN s'il n'existe pas encore,
  // sinon le vérifie. Retourne true si l'accès est accordé.
  unlockOperator: (pin: string) => boolean;
  lockOperator: () => void; // re-verrouille (déconnexion de l'Espace opérateur)
  setManagedClub: (id: string) => void;
  setClubSlots: (clubId: string, slots: string[]) => void;
  setClubCourts: (clubId: string, courts: string[]) => void;
  blockSlot: (b: BlockedSlot, startsAt: number) => boolean;
  unblockSlot: (clubId: string, dateKey: string, time: string, court: string) => void;
  setOperatorNews: (news: { title: string; subtitle?: string; link?: string }) => void;
  removeOperatorNews: () => void; // retire l'actu d'accueil publiée
  dismissNews: (id: string) => void;
  toggleFollow: (id: string, info: { name: string; level?: number; favoriteClub?: string }) => void;
  resetAll: () => void;
};

const AppContext = createContext<AppContextType | null>(null);
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const clampLevel = (n: number) => Math.min(7, Math.max(1, Math.round(n * 100) / 100));

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
        // `operatorUnlocked` est toujours remis à false : le PIN opérateur est
        // redemandé à chaque lancement (même si l'appareil était déverrouillé avant).
        if (raw) setState({ ...initialState, ...JSON.parse(raw), operatorUnlocked: false });
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
  useEffect(() => {
    if (!hydrated) return;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return;
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (!prof) return;
      setState((s) => ({
        ...s,
        account: {
          firstName: prof.first_name ?? s.account?.firstName ?? '',
          lastName: prof.last_name ?? s.account?.lastName ?? '',
          phone: prof.phone ?? s.account?.phone ?? '',
          photoUri: prof.photo_uri ?? s.account?.photoUri,
          birthDate: prof.birth_date ?? s.account?.birthDate,
          gender: prof.gender ?? s.account?.gender,
        },
        role: (prof.role as AppState['role']) ?? 'player',
        serverManagedClubId: prof.managed_club_id ?? null,
        level: clampLevel(Number(prof.level ?? s.level)),
      }));
    })();
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

  const stats = useMemo(() => computeStats(state.reservations, state.officialResults), [state.reservations, state.officialResults]);

  const api = useMemo<AppContextType>(
    () => ({
      state,
      hydrated,
      stats,
      setAccount: (a) => setState((s) => ({ ...s, account: a })),
      updateAccount: (patch) => setState((s) => ({ ...s, account: s.account ? { ...s.account, ...patch } : s.account })),
      loadDemo: () =>
        setState(() => {
          const now = Date.now();
          const demain = nextDays(2)[1]; // jour « Demain » stable
          const lastWeek = new Date(now - 3 * 86400000);
          const findSeed = (id: string) => clubs.find((c) => c.id === id)!;
          return {
            ...initialState,
            account: { firstName: 'Invité', lastName: 'Démo', phone: '+225 07 00 00 00 00', birthDate: '12/08/1998', gender: 'nd' },
            level: 3.5,
            favoriteClubIds: ['padelta'],
            reservations: [
              {
                id: uid(),
                clubId: 'district-club',
                clubName: 'District Club',
                court: 'Terrain 1',
                date: demain.label,
                dateKey: demain.key,
                time: '18:00',
                startsAt: demain.value + 18 * 3600000,
                price: priceForSlot(findSeed('district-club'), '18:00'),
                players: 4,
                invited: [],
                bookedBy: { name: 'Invité Démo', phone: '+225 07 00 00 00 00' },
                createdAt: now,
              },
              {
                id: uid(),
                clubId: 'padel-zone-4',
                clubName: 'Padel Zone 4',
                court: 'Terrain 2',
                date: 'Sem. dernière',
                dateKey: dayKey(lastWeek),
                time: '18:00',
                startsAt: now - 3 * 86400000,
                price: priceForSlot(findSeed('padel-zone-4'), '18:00'),
                players: 4,
                invited: [],
                bookedBy: { name: 'Invité Démo', phone: '+225 07 00 00 00 00' },
                clubConfirmed: true,
                createdAt: now - 3 * 86400000,
              },
            ],
            // L'utilisateur démo est inscrit aux 2 tournois terminés : un à clôturer (le
            // gérant désignera le vainqueur) + un déjà clôturé (il a participé, pas gagné).
            compRegistrations: {
              [DEMO_FINISHED_COMP]: { partner: 'Karim', at: now },
              [DEMO_CLOSED_COMP]: { partner: 'Karim', at: now },
            },
            compResults: { [DEMO_CLOSED_COMP]: { winner: 'Awa & Yann', closedAt: now - 6 * 86400000 } },
            officialResults: [
              {
                id: uid(),
                compId: DEMO_CLOSED_COMP,
                title: 'Americano officiel — Padel Zone 4',
                result: 'played',
                at: now - 6 * 86400000,
                levelAfter: 3.5,
              },
            ],
          };
        }),
      // Création de compte serveur : téléphone + mot de passe (e-mail interne, sans SMS).
      signUpWithPhone: async (phone, password, profile) => {
        const email = phoneToAuthEmail(phone);
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) return { ok: false, error: frAuthError(error.message) };
        let userId = data.user?.id;
        if (!data.session) {
          // Si signUp ne renvoie pas de session (selon config), on se connecte aussitôt.
          const si = await supabase.auth.signInWithPassword({ email, password });
          if (si.error) return { ok: false, error: frAuthError(si.error.message) };
          userId = si.data.user?.id ?? userId;
        }
        if (!userId) return { ok: false, error: 'Compte créé, mais connexion impossible. Réessaie.' };
        const level = clampLevel(profile.level ?? 3.0);
        const { error: pErr } = await supabase.from('profiles').upsert({
          id: userId,
          first_name: profile.firstName.trim(),
          last_name: profile.lastName.trim(),
          phone: phone.trim(),
          birth_date: profile.birthDate?.trim() || null,
          gender: profile.gender ?? null,
          level,
          updated_at: new Date().toISOString(),
        });
        if (pErr) return { ok: false, error: 'Profil non enregistré — réessaie.' };
        setState((s) => ({
          ...s,
          account: {
            firstName: profile.firstName.trim(),
            lastName: profile.lastName.trim(),
            phone: phone.trim(),
            birthDate: profile.birthDate?.trim() || undefined,
            gender: profile.gender,
          },
          level,
        }));
        return { ok: true };
      },
      // Connexion serveur d'un compte existant (ex. après réinstallation).
      signInWithPhone: async (phone, password) => {
        const email = phoneToAuthEmail(phone);
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return { ok: false, error: frAuthError(error.message) };
        const userId = data.user?.id;
        if (!userId) return { ok: false, error: 'Connexion impossible. Réessaie.' };
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
        setState((s) => ({
          ...s,
          account: {
            firstName: prof?.first_name ?? '',
            lastName: prof?.last_name ?? '',
            phone: prof?.phone ?? phone.trim(),
            photoUri: prof?.photo_uri ?? undefined,
            birthDate: prof?.birth_date ?? undefined,
            gender: prof?.gender ?? undefined,
          },
          role: (prof?.role as AppState['role']) ?? 'player',
          serverManagedClubId: prof?.managed_club_id ?? null,
          level: clampLevel(Number(prof?.level ?? 3.0)),
        }));
        return { ok: true };
      },
      signOut: () => {
        supabase.auth.signOut().catch(() => {});
        setState((s) => ({ ...s, account: null, role: 'player', serverManagedClubId: null, operatorUnlocked: false }));
      },
      setLevel: (n) => setState((s) => ({ ...s, level: clampLevel(n) })),
      // Clôture par l'ORGANISATEUR : fige le vainqueur (et, en option, l'équipe classée
      // dernière), et si TU étais inscrit met à jour ton palmarès. Tournoi OFFICIEL :
      // équipe vainqueure +0.50 / équipe dernière −0.25 (bornés 1.0–7.0). Participation,
      // tournoi amical, ou place intermédiaire : palmarès seulement, niveau inchangé.
      closeCompetition: (comp, winnerName, winnerIsMe, loserName, loserIsMe) =>
        setState((s) => {
          if (s.compResults[comp.id]) return s; // déjà clôturé
          const compResults = {
            ...s.compResults,
            [comp.id]: { winner: winnerName.trim(), loser: loserName?.trim() || undefined, closedAt: Date.now() },
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
        }),
      setRemindersOn: (on) => setState((s) => ({ ...s, remindersOn: on })),
      setReserverView: (v) => setState((s) => ({ ...s, reserverView: v })),
      addReview: (clubId, rating, text) =>
        setState((s) => ({
          ...s,
          userReviews: [
            { id: uid(), clubId, author: 'Vous', rating, text: text.trim() || 'Bonne expérience.', date: "À l'instant" },
            ...s.userReviews,
          ],
        })),
      addCompetition: (c) => setState((s) => ({ ...s, myCompetitions: [{ ...c, id: uid(), createdByMe: true }, ...s.myCompetitions] })),
      // Le club hôte valide un tournoi créé par un joueur (« en attente » → visible).
      approveCompetition: (id) =>
        setState((s) => ({ ...s, myCompetitions: s.myCompetitions.map((c) => (c.id === id ? { ...c, status: 'approved' } : c)) })),
      deleteCompetition: (id) =>
        setState((s) => {
          const regs = { ...s.compRegistrations };
          delete regs[id];
          return { ...s, myCompetitions: s.myCompetitions.filter((c) => c.id !== id), compRegistrations: regs };
        }),
      registerCompetition: (id, partner) =>
        setState((s) =>
          s.compRegistrations[id]
            ? s
            : { ...s, compRegistrations: { ...s.compRegistrations, [id]: { partner: partner.trim() || 'Partenaire', at: Date.now() } } },
        ),
      unregisterCompetition: (id) =>
        setState((s) => {
          const next = { ...s.compRegistrations };
          delete next[id];
          return { ...s, compRegistrations: next };
        }),
      addReservation: (r) => {
        // Garde-fou : on ne réserve jamais un créneau dont l'heure de début est passée.
        if (r.startsAt <= Date.now()) return false;
        // Anti double-réservation : un même TERRAIN ne peut être pris 2× au même créneau.
        // (Deux terrains différents au même horaire restent possibles.) Indexé sur dateKey.
        const taken = (x: Reservation) => x.clubId === r.clubId && x.dateKey === r.dateKey && x.time === r.time && x.court === r.court;
        if (state.reservations.some(taken)) return false;
        setState((s) => {
          if (s.reservations.some(taken)) return s;
          // Identité du réservant (nom + numéro) : c'est ce que le club reçoit.
          const bookedBy = s.account ? { name: `${s.account.firstName} ${s.account.lastName}`.trim(), phone: s.account.phone } : undefined;
          return { ...s, reservations: [{ ...r, bookedBy, id: uid(), createdAt: Date.now() }, ...s.reservations] };
        });
        return true;
      },
      cancelReservation: (id) => setState((s) => ({ ...s, reservations: s.reservations.filter((r) => r.id !== id) })),
      confirmReservationByClub: (id) =>
        setState((s) => ({
          ...s,
          reservations: s.reservations.map((r) => (r.id === id ? { ...r, clubConfirmed: !r.clubConfirmed } : r)),
        })),
      addFriend: (name, phone) =>
        setState((s) => {
          const n = name.trim();
          if (n.length < 2) return s;
          return { ...s, friends: [{ id: uid(), name: n, phone: phone.trim() || undefined }, ...s.friends] };
        }),
      removeFriend: (id) => setState((s) => ({ ...s, friends: s.friends.filter((f) => f.id !== id) })),
      toggleFavorite: (clubId) =>
        setState((s) => ({
          ...s,
          favoriteClubIds: s.favoriteClubIds.includes(clubId)
            ? s.favoriteClubIds.filter((x) => x !== clubId)
            : [...s.favoriteClubIds, clubId],
        })),
      addClubPhoto: (clubId, uri) =>
        setState((s) => {
          const existing = s.clubPhotos[clubId] ?? [];
          // Plafond pour éviter de dépasser le quota de stockage local (perte de photos).
          if (!uri || existing.includes(uri) || existing.length >= MAX_CLUB_PHOTOS) return s;
          return { ...s, clubPhotos: { ...s.clubPhotos, [clubId]: [...existing, uri] } };
        }),
      removeClubPhoto: (clubId, uri) =>
        setState((s) => ({ ...s, clubPhotos: { ...s.clubPhotos, [clubId]: (s.clubPhotos[clubId] ?? []).filter((x) => x !== uri) } })),
      addClubOffer: (clubId, kind, title, detail) =>
        setState((s) => {
          const t = title.trim();
          if (!t) return s;
          const existing = s.clubOffers[clubId] ?? [];
          return { ...s, clubOffers: { ...s.clubOffers, [clubId]: [{ id: uid(), kind, title: t, detail: detail.trim() }, ...existing] } };
        }),
      removeClubOffer: (clubId, id) =>
        setState((s) => ({ ...s, clubOffers: { ...s.clubOffers, [clubId]: (s.clubOffers[clubId] ?? []).filter((o) => o.id !== id) } })),
      addClubCoach: (clubId, name, specialty, phone) =>
        setState((s) => {
          const n = name.trim();
          if (!n) return s;
          // Normalise le téléphone en format international (+225) pour que le lien
          // WhatsApp/appel fonctionne (sinon openWhatsApp échoue sur un numéro local).
          const p = phone.trim();
          const normPhone = p ? (p.startsWith('+') ? p : `+225 ${p}`) : undefined;
          const existing = s.clubCoaches[clubId] ?? [];
          return {
            ...s,
            clubCoaches: {
              ...s.clubCoaches,
              [clubId]: [{ id: uid(), name: n, specialty: specialty.trim() || 'Coach', phone: normPhone }, ...existing],
            },
          };
        }),
      removeClubCoach: (clubId, id) =>
        setState((s) => ({ ...s, clubCoaches: { ...s.clubCoaches, [clubId]: (s.clubCoaches[clubId] ?? []).filter((c) => c.id !== id) } })),
      setClubInfo: (clubId, patch) =>
        setState((s) => ({ ...s, clubInfo: { ...s.clubInfo, [clubId]: { ...s.clubInfo[clubId], ...patch } } })),
      // Déverrouille l'Espace Club si le code correspond (mémorisé ensuite sur l'appareil).
      unlockClub: (clubId, code) => {
        const expected = state.clubCodes[clubId];
        if (!expected || code.trim() !== expected) return false;
        setState((s) => ({
          ...s,
          unlockedClubIds: s.unlockedClubIds.includes(clubId) ? s.unlockedClubIds : [...s.unlockedClubIds, clubId],
        }));
        return true;
      },
      setClubCode: (clubId, code) => setState((s) => ({ ...s, clubCodes: { ...s.clubCodes, [clubId]: code } })),
      toggleHideCoach: (coachId) =>
        setState((s) => ({
          ...s,
          hiddenCoachIds: s.hiddenCoachIds.includes(coachId)
            ? s.hiddenCoachIds.filter((x) => x !== coachId)
            : [...s.hiddenCoachIds, coachId],
        })),
      toggleBoostClub: (clubId) =>
        setState((s) => ({
          ...s,
          boostedClubIds: s.boostedClubIds.includes(clubId) ? s.boostedClubIds.filter((x) => x !== clubId) : [...s.boostedClubIds, clubId],
        })),
      setBoost: (clubId, days) =>
        setState((s) => {
          if (days <= 0) {
            const exp = { ...s.boostExpiry };
            delete exp[clubId];
            return { ...s, boostedClubIds: s.boostedClubIds.filter((x) => x !== clubId), boostExpiry: exp };
          }
          return {
            ...s,
            boostedClubIds: s.boostedClubIds.includes(clubId) ? s.boostedClubIds : [...s.boostedClubIds, clubId],
            boostExpiry: { ...s.boostExpiry, [clubId]: Date.now() + days * 86400000 },
          };
        }),
      setPaymentStatus: (clubId, weekKey, status) =>
        setState((s) => {
          const next = { ...s.operatorPayments };
          const k = `${clubId}:${weekKey}`;
          if (status === 'tofacture') delete next[k];
          else next[k] = status;
          return { ...s, operatorPayments: next };
        }),
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
      approveClub: (id) =>
        setState((s) => ({
          ...s,
          customClubs: s.customClubs.map((c) => (c.id === id ? { ...c, status: 'active' } : c)),
          // À l'activation, l'opérateur attribue un code d'accès (au hasard, modifiable ensuite).
          clubCodes: s.clubCodes[id] ? s.clubCodes : { ...s.clubCodes, [id]: String(Math.floor(1000 + Math.random() * 9000)) },
        })),
      rejectClub: (id) =>
        setState((s) => ({
          ...s,
          customClubs: s.customClubs.filter((c) => c.id !== id),
          managedClubId: s.managedClubId === id ? 'padelta' : s.managedClubId,
        })),
      setClubMode: (on) => setState((s) => ({ ...s, clubMode: on })),
      setOperatorPin: (pin) => setState((s) => ({ ...s, operatorPin: pin })),
      // PROTOTYPE (local) : 1ʳᵉ saisie = création du PIN (l'opérateur le choisit sur SON
      // appareil) ; ensuite = vérification. Une vraie sécurité « réservée à mon compte »
      // arrivera avec le serveur (rôle vérifié côté serveur, cf. src/lib/access.ts).
      unlockOperator: (pin) => {
        const clean = pin.trim();
        if (clean.length < 4) return false;
        if (!state.operatorPin) {
          setState((s) => ({ ...s, operatorPin: clean, operatorUnlocked: true }));
          return true;
        }
        if (clean !== state.operatorPin) return false;
        setState((s) => ({ ...s, operatorUnlocked: true }));
        return true;
      },
      lockOperator: () => setState((s) => ({ ...s, operatorUnlocked: false })),
      setManagedClub: (id) => setState((s) => ({ ...s, managedClubId: id })),
      setClubSlots: (clubId, slots) => setState((s) => ({ ...s, clubSlots: { ...s.clubSlots, [clubId]: [...slots].sort() } })),
      setClubCourts: (clubId, courts) => setState((s) => ({ ...s, clubCourts: { ...s.clubCourts, [clubId]: courts } })),
      // Fermer un créneau hors app. Garde-fous : jamais dans le passé, jamais par-dessus
      // une réservation PadelConnect, jamais en double.
      blockSlot: (b, startsAt) => {
        if (startsAt <= Date.now()) return false;
        const sameSlot = (x: { clubId: string; dateKey: string; time: string; court: string }) =>
          x.clubId === b.clubId && x.dateKey === b.dateKey && x.time === b.time && x.court === b.court;
        if (state.reservations.some(sameSlot)) return false;
        if (state.blockedSlots.some(sameSlot)) return false;
        setState((s) => ({ ...s, blockedSlots: [...s.blockedSlots, b] }));
        return true;
      },
      unblockSlot: (clubId, dateKey, time, court) =>
        setState((s) => ({
          ...s,
          blockedSlots: s.blockedSlots.filter(
            (x) => !(x.clubId === clubId && x.dateKey === dateKey && x.time === time && x.court === court),
          ),
        })),
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
      toggleFollow: (id, info) =>
        setState((s) => {
          const followed = { ...s.followed };
          if (followed[id]) delete followed[id];
          else followed[id] = info;
          return { ...s, followed };
        }),
      resetAll: () => {
        // Réinitialisation TOTALE de la démo : on efface AUSSI la clé persistée pour
        // qu'aucune donnée (niveau, palmarès, blocages, amis retirés…) ne survive à
        // un rechargement, puis on revient à l'état seed complet. La persistance
        // réécrira ensuite l'état seed — équivalent à une toute première ouverture.
        AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
        setState(initialState);
      },
    }),
    [state, hydrated, stats],
  );

  return <AppContext.Provider value={api}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp doit être utilisé dans <AppProvider>');
  return ctx;
}
