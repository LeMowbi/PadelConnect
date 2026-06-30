// Fonctions PURES du store, extraites d'AppContext pour l'alléger et les rendre testables.
// Aucune ne dépend d'une valeur d'AppContext (uniquement des types) : pas de cycle runtime.

import type { CustomClub } from '@/data/clubs';
import type { ClubConfig } from '@/lib/clubsServer';
import type { MyParticipation } from '@/lib/reservations';
import type { AppState } from './AppContext';

export const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
export const clampLevel = (n: number) => Math.min(7, Math.max(1, Math.round(n * 100) / 100));

// Traduit les messages d'erreur Supabase en français clair pour l'utilisateur.
export function frAuthError(msg: string): string {
  const m = (msg || '').toLowerCase();
  if (m.includes('email not confirmed')) return "Confirme d'abord ton e-mail — vérifie ta boîte mail (et tes spams).";
  if (m.includes('invalid login')) return 'Identifiant ou mot de passe incorrect.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Cet e-mail a déjà un compte — connecte-toi.';
  if (m.includes('unable to validate email') || m.includes('invalid format')) return 'Adresse e-mail invalide — vérifie-la.';
  if (m.includes('password should be') || m.includes('password')) return 'Mot de passe trop court (6 caractères minimum).';
  if (m.includes('network') || m.includes('fetch') || m.includes('timeout')) return 'Connexion internet impossible — réessaie.';
  if (m.includes('email logins are disabled') || m.includes('signups not allowed'))
    return 'Connexion désactivée côté serveur (vérifie la config Supabase).';
  return msg || 'Une erreur est survenue. Réessaie.';
}

export const initialState: AppState = {
  account: null,
  level: 3.0,
  remindersOn: true,
  reserverView: 'Par heure',
  userReviews: [],
  myCompetitions: [],
  reservations: [],
  favoriteClubIds: [],
  // Un compte démarre sans ami : sinon « Mes amis · 4 », le trophée « 5 amis » à 4/5
  // et la relance « 0 ami » seraient faux dès l'inscription.
  friends: [],
  officialResults: [],
  compRegistrations: {},
  compResults: {},
  clubPhotos: {},
  clubOffers: {},
  clubCoaches: {},
  clubInfo: {},
  hiddenCoachIds: [],
  boostedClubIds: [],
  boostExpiry: {},
  operatorPayments: {},
  customClubs: [],
  clubStatus: {},
  clubCommission: {},
  role: 'player',
  serverManagedClubId: null,
  serverUserId: null,
  participantReservationIds: [],
  pendingInvitationIds: [],
  occupancy: [],
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
};

// Config club serveur → tranches du store. Le serveur fait foi pour les clubs qu'il connaît ;
// on ne remplace une tranche locale que si le serveur la fournit (slice présent). Mutualisé
// entre le chargement de session et le rafraîchissement au retour au premier plan.
export function clubConfigSlices(s: AppState, configs: Record<string, ClubConfig>) {
  const clubSlots = { ...s.clubSlots };
  const clubCourts = { ...s.clubCourts };
  const clubOffers = { ...s.clubOffers };
  const clubCoaches = { ...s.clubCoaches };
  const clubPhotos = { ...s.clubPhotos };
  for (const [id, c] of Object.entries(configs)) {
    if (c.slots) clubSlots[id] = c.slots;
    if (c.courts) clubCourts[id] = c.courts;
    if (c.offers) clubOffers[id] = c.offers;
    if (c.coaches) clubCoaches[id] = c.coaches;
    if (c.photos) clubPhotos[id] = c.photos;
  }
  return { clubSlots, clubCourts, clubOffers, clubCoaches, clubPhotos };
}

// État ramené à « déconnecté » : identité + données serveur ET tout le périmètre personnel
// (niveau, amis, favoris, avis, palmarès…) remis à zéro, pour qu'un autre compte ouvert sur
// le même appareil ne récupère rien du précédent. On conserve uniquement d'éventuels clubs
// démo créés en local (les clubs venus du serveur se rechargeront à la prochaine session).
// Utilisé par signOut, la révocation externe (SIGNED_OUT) et la suppression de compte.
export function loggedOutState(s: AppState): AppState {
  return {
    ...s,
    account: null,
    role: 'player',
    serverManagedClubId: null,
    serverUserId: null,
    reservations: [],
    participantReservationIds: [],
    pendingInvitationIds: [],
    occupancy: [],
    customClubs: s.customClubs.filter((c) => !c.fromServer),
    clubCommission: {}, // donnée opérateur : on la purge à la déconnexion
    level: initialState.level,
    friends: [],
    favoriteClubIds: [],
    userReviews: [],
    myCompetitions: [],
    compRegistrations: {},
    compResults: {},
    officialResults: [],
  };
}

// Invitations → deux listes : celles à inclure dans « mes réservations » (tout sauf refusées)
// et celles encore À CONFIRMER (Accepter/Refuser). Une seule source pour les deux dérivés.
export function splitParticipations(parts: MyParticipation[]): { active: string[]; pending: string[] } {
  return {
    active: parts.filter((p) => p.status !== 'declined').map((p) => p.reservationId),
    pending: parts.filter((p) => p.status === 'invited').map((p) => p.reservationId),
  };
}

// Fusionne les clubs venus du SERVEUR dans la liste locale `customClubs` : on garde les clubs
// démo créés localement (sans drapeau `fromServer`) et on remplace l'ensemble des clubs serveur
// par la version fraîchement chargée (dédup par id, le serveur fait foi).
export function mergeServerClubs(local: CustomClub[], server: CustomClub[]): CustomClub[] {
  const serverIds = new Set(server.map((c) => c.id));
  const localOnly = local.filter((c) => !c.fromServer && !serverIds.has(c.id));
  return [...localOnly, ...server];
}
