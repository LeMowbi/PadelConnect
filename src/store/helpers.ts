// Fonctions PURES du store, extraites d’AppContext pour l’alléger et les rendre testables.
// Aucune ne dépend d’une valeur d’AppContext (uniquement des types) : pas de cycle runtime.

import type { CustomClub } from '@/data/clubs';
import type { ClubConfig } from '@/lib/clubsServer';
import type { ServerCompetitions } from '@/lib/competitionsServer';
import { addWeeks, weekKeyOf } from '@/lib/days';
import type { MyParticipation } from '@/lib/reservations';
import type { AppState, CompResult, OfficialResult } from './AppContext';

export const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
export const clampLevel = (n: number) => Math.min(7, Math.max(1, Math.round(n * 100) / 100));

export const LEVEL_STEP = 0.5; // bonus de niveau pour l’équipe vainqueure d’un tournoi officiel
export const LEVEL_PENALTY = 0.25; // malus de niveau pour l’équipe classée dernière (facultatif)

// Série en cours 🔥 : semaines calendaires CONSÉCUTIVES avec au moins une partie jouée, en
// remontant depuis la semaine courante. Une semaine EN COURS sans partie ne casse pas la
// série (elle n'est pas finie) : on regarde alors depuis la semaine précédente.
export function weeklyStreak(playedStartsAt: number[], now: number): number {
  if (playedStartsAt.length === 0) return 0;
  const weeks = new Set(playedStartsAt.map((ts) => weekKeyOf(ts)));
  const current = weekKeyOf(now);
  let cursor = weeks.has(current) ? current : addWeeks(current, -1);
  let streak = 0;
  while (weeks.has(cursor)) {
    streak += 1;
    cursor = addWeeks(cursor, -1);
  }
  return streak;
}

// Traduit les messages d’erreur Supabase en français clair pour l’utilisateur.
export function frAuthError(msg: string): string {
  const m = (msg || '').toLowerCase();
  if (m.includes('email not confirmed')) return 'Confirme d’abord ton e-mail — vérifie ta boîte mail (et tes spams).';
  if (m.includes('invalid login')) return 'Identifiant ou mot de passe incorrect.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Cet e-mail a déjà un compte — connecte-toi.';
  if (m.includes('unable to validate email') || m.includes('invalid format')) return 'Adresse e-mail invalide — vérifie-la.';
  if (m.includes('password should be') || m.includes('password')) return 'Mot de passe trop court (6 caractères minimum).';
  if (m.includes('network') || m.includes('fetch') || m.includes('timeout')) return 'Connexion internet impossible — réessaie.';
  if (m.includes('security purposes') || m.includes('rate limit') || (m.includes('after') && m.includes('seconds')))
    return 'Trop de tentatives — patiente une minute avant de réessayer.';
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
  // et la relance « 0 ami » seraient faux dès l’inscription.
  friends: [],
  friendRequests: [],
  coachProfile: null, // fiche coach du compte connecté (promu par son club)
  myLessons: [],
  clubRatings: {}, // note moyenne + nb d’avis par club (rempli au chargement de session)
  officialResults: [],
  compRegistrations: {},
  compResults: {},
  clubPhotos: {},
  clubOffers: {},
  clubCovers: {}, // photo « de profil » par club (carte des listes)
  clubCourtPhotos: {}, // une photo par terrain, par club
  clubInfo: {},
  hiddenCoachIds: [],
  boostedClubIds: [],
  boostExpiry: {},
  operatorPayments: {},
  customClubs: [],
  clubStatus: {},
  clubCommission: {},
  tournamentFee: 10000, // frais fixe par défaut des tournois joueurs (réglable par l’opérateur)
  waveLink: null, // lien de paiement Wave (défini par l’opérateur, v2)
  role: 'player',
  accountType: 'player', // type choisi à l'inscription (joueur / club) — pilote l'affichage
  serverManagedClubId: null,
  serverUserId: null,
  participantReservationIds: [],
  pendingInvitationIds: [],
  occupancy: [],
  storageFull: false,
  managedClubId: 'padelta',
  clubSlots: {},
  clubCourts: {},
  // Fermetures récurrentes par terrain (54) : { clubId: { 'Terrain 1': ['18:00'] } }.
  clubCourtClosed: {},
  blockedSlots: [],
  // Fermetures sur période (54) : « Terrain 2 fermé du 10 au 24 juillet (travaux) ».
  blockedRanges: [],
  // Comptes que J'AI bloqués (modération UGC) : miroir persisté — un échec réseau au montage
  // d'un écran ne fait plus réapparaître les avis / matchs ouverts d'un compte bloqué.
  blockedUserIds: [],
  // Aucune actu d’accueil par défaut : le bandeau n’apparaît QUE si l’opérateur en publie une
  // (synchronisée serveur, visible par tous). Évite un bandeau de démo qui s’affiche puis
  // disparaît au chargement quand aucune actu n’est réellement publiée.
  operatorNews: null,
  dismissedNewsId: null,
};

// Config club serveur → tranches du store. Le serveur fait foi pour les clubs qu’il connaît ;
// on ne remplace une tranche locale que si le serveur la fournit (slice présent). Mutualisé
// entre le chargement de session et le rafraîchissement au retour au premier plan.
// `configs` = null en cas d’échec réseau (convention §8) → on garde les tranches existantes.
export function clubConfigSlices(s: AppState, configs: Record<string, ClubConfig> | null) {
  const clubSlots = { ...s.clubSlots };
  const clubCourts = { ...s.clubCourts };
  const clubOffers = { ...s.clubOffers };
  const clubPhotos = { ...s.clubPhotos };
  const clubCovers = { ...s.clubCovers };
  const clubCourtPhotos = { ...s.clubCourtPhotos };
  const clubCourtClosed = { ...s.clubCourtClosed };
  for (const [id, c] of Object.entries(configs ?? {})) {
    if (c.slots) clubSlots[id] = c.slots;
    if (c.courts) clubCourts[id] = c.courts;
    if (c.offers) clubOffers[id] = c.offers;
    if (c.photos) clubPhotos[id] = c.photos;
    if (c.coverUrl) clubCovers[id] = c.coverUrl;
    // Cover retirée par le gérant (serveur la renvoie absente) → on retire aussi le miroir.
    else if (id in clubCovers) delete clubCovers[id];
    if (c.courtPhotos) clubCourtPhotos[id] = c.courtPhotos;
    if (c.courtClosed) clubCourtClosed[id] = c.courtClosed;
  }
  return { clubSlots, clubCourts, clubOffers, clubPhotos, clubCovers, clubCourtPhotos, clubCourtClosed };
}

// État ramené à « déconnecté » : identité + données serveur ET tout le périmètre personnel
// (niveau, amis, favoris, avis, palmarès…) remis à zéro, pour qu’un autre compte ouvert sur
// le même appareil ne récupère rien du précédent. On conserve uniquement d’éventuels clubs
// démo créés en local (les clubs venus du serveur se rechargeront à la prochaine session).
// Utilisé par signOut, la révocation externe (SIGNED_OUT) et la suppression de compte.
export function loggedOutState(s: AppState): AppState {
  return {
    ...s,
    account: null,
    role: 'player',
    accountType: 'player',
    serverManagedClubId: null,
    serverUserId: null,
    reservations: [],
    participantReservationIds: [],
    pendingInvitationIds: [],
    occupancy: [],
    customClubs: s.customClubs.filter((c) => !c.fromServer),
    clubCommission: {}, // donnée opérateur : on la purge à la déconnexion
    operatorPayments: {}, // donnée opérateur : on la purge à la déconnexion
    level: initialState.level,
    friends: [],
    friendRequests: [],
    coachProfile: null, // fiche coach = liée au compte → purgée à la déconnexion
    myLessons: [],
    favoriteClubIds: [],
    userReviews: [],
    myCompetitions: [],
    compRegistrations: {},
    compResults: {},
    officialResults: [],
    blockedUserIds: [], // liste liée au compte → purgée à la déconnexion
  };
}

// Tournois serveur → tranches du store. Les tournois serveur remplacent l’ancien `myCompetitions`
// (les seeds de démo restent à part). Les clôtures serveur (winner/podium) rejouent compResults,
// et mes inscriptions serveur rejouent compRegistrations — en PRÉSERVANT à chaque fois ce qui
// concerne les seeds/local (id absent de la liste serveur). null = échec réseau → on garde l’existant.
export function competitionSlices(
  s: AppState,
  sc: ServerCompetitions | null,
  regs: Record<string, string> | null,
): Pick<AppState, 'myCompetitions' | 'compResults' | 'compRegistrations' | 'level' | 'officialResults' | 'waveLink'> {
  const comps = sc ? sc.comps : s.myCompetitions;
  const serverIds = new Set(comps.filter((c) => c.server).map((c) => c.id));

  let compResults = s.compResults;
  if (sc) {
    const seedResults = Object.fromEntries(Object.entries(s.compResults).filter(([id]) => !serverIds.has(id)));
    const serverResults: Record<string, CompResult> = {};
    for (const [id, cl] of Object.entries(sc.closes)) {
      // closedAt stable d’un rafraîchissement à l’autre (sinon re-render inutile à chaque fetch).
      serverResults[id] = {
        winner: cl.winner ?? '',
        second: cl.second,
        third: cl.third,
        loser: cl.loser,
        closedAt: s.compResults[id]?.closedAt ?? Date.now(),
      };
    }
    compResults = { ...seedResults, ...serverResults };
  }

  let compRegistrations = s.compRegistrations;
  if (regs) {
    const seedRegs = Object.fromEntries(Object.entries(s.compRegistrations).filter(([id]) => !serverIds.has(id)));
    const serverRegs: AppState['compRegistrations'] = {};
    for (const [id, partner] of Object.entries(regs)) serverRegs[id] = { partner, at: s.compRegistrations[id]?.at ?? Date.now() };
    compRegistrations = { ...seedRegs, ...serverRegs };
  }

  const base = {
    myCompetitions: comps,
    compResults,
    compRegistrations,
    level: s.level,
    officialResults: s.officialResults,
    // Le lien Wave n'est porté que par les lignes de tournoi (fetch_competitions). Un fetch RÉUSSI
    // mais VIDE (0 tournoi) renvoie waveLink=null : ce n'est pas un « lien effacé », on garde donc
    // la valeur locale au lieu de l'écraser (un effacement volontaire renvoie '' quand un tournoi existe).
    waveLink: sc ? (sc.waveLink ?? s.waveLink) : s.waveLink,
  };
  if (!sc || !s.account) return base;

  // PALMARÈS (affichage) de MES tournois serveur clôturés — DÉRIVÉ des clôtures serveur et
  // reconstruit à chaque fois (idempotent, sûr à la réinstallation). Le NIVEAU, lui, est attribué
  // UNE SEULE FOIS côté serveur à la clôture (close_competition) → on ne le recalcule jamais ici.
  // (On réutilise `serverIds` calculé plus haut — même ensemble d’ids de tournois serveur.)
  const serverResults: OfficialResult[] = [];
  for (const c of comps) {
    if (!c.server) continue;
    const close = sc.closes[c.id];
    if (!close) continue; // pas encore clôturé
    const reg = compRegistrations[c.id];
    if (!reg) continue; // je n’étais pas inscrit
    const myTeam = `${s.account.firstName ?? 'Toi'} & ${reg.partner}`;
    const result: OfficialResult['result'] =
      c.official && close.winner && myTeam === close.winner
        ? 'win'
        : c.official && close.loser && myTeam === close.loser
          ? 'last'
          : 'played';
    // id déterministe + `at` stable → aucune churn de re-render d’un fetch à l’autre.
    // PAS de `levelAfter` pour un tournoi serveur : au moment de la dérivation, s.level est
    // encore l’ANCIEN niveau (le +0.50 serveur n’est relu qu’après) → on afficherait un
    // « niveau après » périmé. L’UI ne montre que le delta, toujours juste.
    const prev = s.officialResults.find((o) => o.compId === c.id);
    serverResults.push({
      id: `srv-${c.id}`,
      compId: c.id,
      title: c.title,
      result,
      at: prev?.at ?? Date.now(),
    });
  }
  // On conserve les palmarès locaux éventuels (compId absent des tournois serveur) et on
  // remplace ceux des tournois serveur par la version dérivée.
  const keptLocal = s.officialResults.filter((o) => !o.compId || !serverIds.has(o.compId));
  const officialResults = [...serverResults, ...keptLocal];
  return { ...base, officialResults };
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
// démo créés localement (sans drapeau `fromServer`) et on remplace l’ensemble des clubs serveur
// par la version fraîchement chargée (dédup par id, le serveur fait foi).
export function mergeServerClubs(local: CustomClub[], server: CustomClub[]): CustomClub[] {
  const serverIds = new Set(server.map((c) => c.id));
  const localOnly = local.filter((c) => !c.fromServer && !serverIds.has(c.id));
  return [...localOnly, ...server];
}
