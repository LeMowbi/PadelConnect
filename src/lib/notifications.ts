// Rappels de match LOCAUX (sans serveur) via expo-notifications : trois notifications
// programmées par réservation (fin de l’annulation gratuite, ~2 h avant, puis « Alors, ce
// match ? » 20 min après la fin du créneau pour saisir le score — C2).
// L’utilisateur active/désactive le tout via l’interrupteur « Rappels de match » du profil.
// Web : tout est neutralisé (no-op). Ce fichier ne DEMANDE jamais la permission à froid (E1) :
// il la LIT ; seul `requestPushPermission` (push.ts) ouvre la fenêtre système, sur un geste.
//
// Ce fichier porte aussi les rappels d’AGENDA (82, « Me rappeler » sur un événement : la veille
// à 18 h) et le TAP sur une notification (locale OU push serveur) : on route vers l’écran
// concerné plutôt que de rouvrir l’app là où elle en était (cf. useNotificationTapRouter).

import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { DAY_MS, HOUR_MS, MINUTE_MS, slotTimestamp } from './days';
import { requestPushPermission } from './push';
import { CANCEL_DEADLINE_MS } from './reservations';
import { SESSION_MIN } from './slots';

const isNative = Platform.OS === 'ios' || Platform.OS === 'android';
const REMINDER_LEAD_MS = 2 * HOUR_MS; // 1ᵉʳ rappel : 2 h avant le créneau
// 2ᵉ rappel : AVANT la limite d’annulation gratuite (5 h avant le match, CANCEL_DEADLINE_MS partagé
// avec l’écran Réservations), pour laisser le temps d’annuler sans frais si on ne peut plus venir.
// iOS : 15 min avant la limite (5 h 15 avant le créneau), heure exacte. Android 12+ : sans la
// permission « alarmes exactes » (non demandée), l'OS peut RETARDER un rappel local de plusieurs
// dizaines de minutes → marge de 45 min et texte non chiffré (« moins d'une heure »), jamais
// « dans 15 min » qui serait faux une fois le rappel décalé (R-90).
const ANDROID_INEXACT = Platform.OS === 'android';
const CANCEL_WARNING_LEAD_MS = CANCEL_DEADLINE_MS + (ANDROID_INEXACT ? 45 : 15) * MINUTE_MS;
const CANCEL_WARNING_TEXT = ANDROID_INEXACT
  ? 'Moins d’une heure pour annuler gratuitement.'
  : 'Dans 15 min, l’annulation gratuite ne sera plus possible.';
// Canal Android des rappels LOCAUX (R-88) : sans `channelId`, ils tombaient dans le canal par
// défaut « Miscellaneous » (en anglais, importance moyenne) au lieu de « Rappels & alertes ».
const ANDROID_CHANNEL = 'default';
// 3ᵉ rappel (C2) : fin du créneau + 20 min — le temps de ranger les raquettes, pas celui d’oublier.
const SCORE_REMINDER_DELAY_MS = 20 * MINUTE_MS;
// Identifiants STABLES des trois rappels d’une résa (`cancel-{id}`, `soon-{id}`, `score-{id}`, comme
// `event-{id}`) : les re-poser REMPLACE au lieu de dupliquer — deux resyncs qui se chevauchent ne
// peuvent plus doubler « Tu joues toujours ? » / « Ton match approche ».
const CANCEL_PREFIX = 'cancel-';
const SOON_PREFIX = 'soon-';
const SCORE_PREFIX = 'score-';

// Affichage en premier plan (app ouverte) : bannière + son, sans pastille.
if (isNative) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  // Android 8+ : sans canal EXPLICITE, les rappels/push retombent sur un canal d'importance
  // moyenne → pas d'affichage « heads-up ». On crée un canal HIGH pour que les alertes
  // (rappel d'annulation, match qui approche, push du gérant) apparaissent bien en avant-plan.
  if (Platform.OS === 'android') {
    void Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
      name: 'Rappels & alertes',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }
}

// iOS ne conserve que les 64 notifications locales programmées les plus PROCHES et jette le
// reste en silence. Budget PARTAGÉ, dérivé ici pour rester cohérent par construction : 8 rappels
// d’agenda réservés, puis 3 rappels par réservation (annulation gratuite, match qui approche, score
// à saisir) → ⌊(64 − 8) / 3⌋ = 18 réservations × 3 = 54, soit 62 ≤ 64 au total — invariant prouvé
// par tests/notifications.test.mjs. On ne planifie que les créneaux les plus proches, ceux qui comptent.
export const IOS_LOCAL_NOTIFICATION_LIMIT = 64;
export const REMINDERS_PER_RESERVATION = 3;
// Budget PROPRE aux rappels d'agenda (82) : sans plafond, 12 événements rappelés feraient déborder
// le total et iOS jetterait des rappels EN SILENCE.
export const MAX_EVENT_REMINDERS = 8;
export const MAX_SCHEDULED_RESERVATIONS = Math.floor((IOS_LOCAL_NOTIFICATION_LIMIT - MAX_EVENT_REMINDERS) / REMINDERS_PER_RESERVATION);

// `isOwner` : true si JE suis l’auteur de la réservation (celui qui peut l’annuler). Un ami
// simplement INVITÉ n’a ni bouton « Annuler » ni « équipe » à confirmer — ses rappels doivent
// donc être différents (cf. scheduleMatchReminder). Par défaut true (compat : tous les points
// d’entrée qui planifient MA propre réservation, jamais celle d’un tiers).
// `scorable` : un score POURRA être saisi après le match (au moins un partenaire AVEC COMPTE a
// accepté — sinon submit_match_score répondrait 'no_players') → le 3ᵉ rappel n’est posé que là.
// `durationMin` : durée FIGÉE du créneau (60|90) — la fin du match en dépend (rappel de score).
export type ReminderInput = {
  id: string;
  clubName: string;
  time: string;
  startsAt: number;
  durationMin: number;
  court: string;
  isOwner?: boolean;
  scorable?: boolean;
};

// Lit la permission SANS jamais ouvrir la fenêtre système (E1 : les resyncs à froid sont muettes).
// Exporté : le store s'en sert pour ne pas lancer les lectures réseau d'une resync qui ne pourra
// rien poser (web, permission non accordée).
export async function hasNotificationPermission(): Promise<boolean> {
  if (!isNative) return false;
  return (await Notifications.getPermissionsAsync()).granted;
}

// Les rappels de match : les deux d’AVANT (`match-reminder`) et celui de score (`score-reminder`).
function isMatchReminder(n: Notifications.NotificationRequest): boolean {
  const kind = (n.content.data as { kind?: string } | null)?.kind;
  return kind === 'match-reminder' || kind === 'score-reminder';
}

// Horodatage du rappel de score : fin RÉELLE du créneau (durée figée, repli 1h30 pour un miroir
// antérieur à la 68 — même repli qu’isPlayed) + 20 min. Exporté : le store s’en sert pour garder
// dans la resync un match en cours ou tout juste fini dont ce rappel est encore devant nous.
export function scoreReminderAt(startsAt: number, durationMin: number): number {
  return startsAt + (durationMin || SESSION_MIN) * MINUTE_MS + SCORE_REMINDER_DELAY_MS;
}

// Programme un rappel sous un identifiant STABLE (no-op si la date est déjà passée).
async function scheduleAt(
  identifier: string,
  when: number,
  r: ReminderInput,
  kind: 'match-reminder' | 'score-reminder',
  title: string,
  body: string,
): Promise<void> {
  if (when <= Date.now()) return;
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: { title, body, data: { reservationId: r.id, kind } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(when), channelId: ANDROID_CHANNEL },
  });
}

// File UNIQUE des écritures de rappels de match (poser / retirer / resync) : chaque opération attend
// la fin de la précédente, dans l’ordre des appels. Sans elle, une resync pouvait effacer pendant
// qu’une autre posait (push au premier plan + « Accepter » une invitation, retour de la fenêtre de
// permission + interrupteur…). Un échec n’enraye pas la file (le suivant part quand même).
let queue: Promise<void> = Promise.resolve();
function enqueue(task: () => Promise<void>): Promise<void> {
  const run = queue.then(task);
  queue = run.catch(() => {});
  return run;
}

// Programme les rappels d’UNE réservation (chacun ignoré si sa date est déjà passée) :
//  1) 5 h 15 min avant (5 h 45 sur Android, cf. CANCEL_WARNING_LEAD_MS) → dernière fenêtre pour
//     annuler sans frais (AUTEUR uniquement : un invité n’a pas de bouton « Annuler », ce rappel
//     ne le concerne pas) ;
//  2) 2 h avant → le match approche (tout le monde, texte adapté selon le rôle) ;
//  3) fin du créneau + 20 min → saisir le score (C2, seulement si `scorable`). Texte honnête :
//     le score compte au classement dès validation, et pour le niveau une fois confirmé en face
//     (règle 49 : un perdant confirme, ou saisie gagnante restée seule 48 h). Le tap mène à
//     « Mes réservations » (bouton « Mettre le score »).
// Hors file : appelé par `scheduleMatchReminder` et par la resync, déjà dans la file.
async function armMatchReminder(r: ReminderInput): Promise<void> {
  const isOwner = r.isOwner ?? true;
  if (isOwner) {
    await scheduleAt(
      `${CANCEL_PREFIX}${r.id}`,
      r.startsAt - CANCEL_WARNING_LEAD_MS,
      r,
      'match-reminder',
      'Tu joues toujours ? ⏳',
      `${r.clubName} à ${r.time} · ${r.court}. ${CANCEL_WARNING_TEXT}`,
    );
  }
  await scheduleAt(
    `${SOON_PREFIX}${r.id}`,
    r.startsAt - REMINDER_LEAD_MS,
    r,
    'match-reminder',
    'Ton match de padel approche 🎾',
    isOwner
      ? `${r.clubName} à ${r.time} · ${r.court}. Pense à confirmer ton équipe !`
      : `${r.clubName} à ${r.time} · ${r.court}. Confirme ta présence !`,
  );
  if (!r.scorable) return;
  await scheduleAt(
    `${SCORE_PREFIX}${r.id}`,
    scoreReminderAt(r.startsAt, r.durationMin),
    r,
    'score-reminder',
    'Alors, ce match ? 🎾',
    'Saisis le score — il compte pour le classement et, une fois confirmé par l’adversaire, pour ton niveau.',
  );
}

export function scheduleMatchReminder(r: ReminderInput): Promise<void> {
  if (!isNative) return Promise.resolve();
  return enqueue(() => armMatchReminder(r));
}

// Annule les rappels d’une réservation donnée — les trois (annulation de la résa, invitation
// refusée, « pas venu », annulation club, score déjà saisi). Balayage par `kind` + résa (et non
// par identifiant) : retire aussi les rappels posés par une version antérieure sans identifiant.
export function cancelMatchReminder(reservationId: string): Promise<void> {
  if (!isNative) return Promise.resolve();
  return enqueue(async () => {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      all
        .filter((n) => isMatchReminder(n) && (n.content.data as { reservationId?: string }).reservationId === reservationId)
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
  });
}

// Resynchronise TOUS les rappels : on efface les nôtres puis on (re)planifie selon l’état.
// Appelé au démarrage, après une réservation, et au basculement de l’interrupteur. MUET : sans
// permission déjà accordée, rien n’est posé et rien n’est demandé (E1).
// Seule la DERNIÈRE resync demandée s’applique : une resync dépassée par une plus récente (déjà
// en file) est sautée, ou s’interrompt entre deux résas — la plus récente efface puis re-pose tout.
// « Dernière » = dernier APPEL ici ; le store ordonne en amont ses resyncs dès leur ENTRÉE, avant
// ses lectures réseau (cf. syncReminders, AppContext).
let syncGeneration = 0;
export function syncMatchReminders(reservations: ReminderInput[], enabled: boolean): Promise<void> {
  if (!isNative) return Promise.resolve();
  const generation = ++syncGeneration;
  const superseded = () => generation !== syncGeneration;
  return enqueue(async () => {
    if (superseded()) return;
    const all = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(all.filter(isMatchReminder).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
    if (!enabled) return;
    if (!(await hasNotificationPermission())) return;
    // On ne planifie que les créneaux les PLUS PROCHES (≤ MAX_SCHEDULED_RESERVATIONS), pour rester
    // sous le plafond iOS de 64 notifications locales — sinon les rappels lointains seraient jetés.
    // Un match en cours (seul son rappel de score est devant nous) passe en tête : c’est le plus proche.
    const soonest = [...reservations].sort((a, b) => a.startsAt - b.startsAt).slice(0, MAX_SCHEDULED_RESERVATIONS);
    for (const r of soonest) {
      if (superseded()) return;
      await armMatchReminder(r);
    }
  });
}

// ─── Rappels d’AGENDA (82) ────────────────────────────────────────────────────
// « Me rappeler » sur un événement de l’agenda du padel ivoirien (accueil) : une notification
// LOCALE la VEILLE à 18 h. Même mécanique qu’un rappel de match :
//  • l’identifiant est STABLE (`event-{id}`) → poser deux fois n’en crée pas deux, retirer est
//    un simple cancel par identifiant, et l’état du bouton se relit depuis le système ;
//  • ces rappels portent `kind: 'event'` : `syncMatchReminders` n’annule QUE les siens
//    (`match-reminder` / `score-reminder`), donc une resync des matchs ne les efface jamais.
const EVENT_PREFIX = 'event-';
const EVENT_REMINDER_HOUR = '18:00'; // la veille à 18 h (heure d’Abidjan = UTC, cf. slotTimestamp)
// Plafond : MAX_EVENT_REMINDERS (bloc budget en tête de fichier — part réservée des 64 d'iOS).

// Horodatage du rappel d’un événement : la veille du jour J à 18 h.
export function eventReminderAt(dateKey: string): number {
  return slotTimestamp(dateKey, EVENT_REMINDER_HOUR) - DAY_MS;
}

// Peut-on encore poser un rappel ? Non sur le web (pas de notification locale) et non si la
// veille 18 h est déjà passée (événement demain ou aujourd’hui) → le bouton n’est pas affiché.
export function canRemindEvent(dateKey: string, now: number = Date.now()): boolean {
  return isNative && eventReminderAt(dateKey) > now;
}

// Identifiants des événements ayant DÉJÀ un rappel programmé (état du bouton au montage).
// Convention §8 : null = lecture impossible (web / permission refusée), ≠ [] = aucun rappel.
export async function scheduledEventReminderIds(): Promise<string[] | null> {
  if (!isNative) return null;
  const all = await Notifications.getAllScheduledNotificationsAsync();
  return all.filter((n) => n.identifier.startsWith(EVENT_PREFIX)).map((n) => n.identifier.slice(EVENT_PREFIX.length));
}

type EventInput = { id: string; title: string; dateKey: string; place: string };

// Texte du rappel d'un événement (comparé par resyncEventReminders pour détecter un changement).
function eventReminderBody(ev: EventInput): string {
  return ev.place ? `${ev.title} — ${ev.place}` : ev.title;
}

// Pose (ou remplace : identifiant stable) le rappel d'un événement. `dateKey` voyage dans `data` :
// c'est lui qui permet à resyncEventReminders de voir qu'un événement a été REPORTÉ.
function armEventReminder(ev: EventInput): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    identifier: `${EVENT_PREFIX}${ev.id}`,
    content: {
      title: 'C’est demain 📅',
      body: eventReminderBody(ev),
      data: { kind: 'event', id: ev.id, dateKey: ev.dateKey },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(eventReminderAt(ev.dateKey)),
      channelId: ANDROID_CHANNEL,
    },
  });
}

// Pose le rappel d’un événement. false = refusé (permission, web, veille 18 h passée) ;
// 'full' = budget de rappels d'agenda atteint (l'UI invite à en retirer un d'abord).
// « Me rappeler » est un GESTE explicite : si la permission n’a jamais été demandée, la fenêtre
// système s’ouvre ici — via l’unique helper (E1), jamais à froid.
export async function scheduleEventReminder(ev: EventInput): Promise<boolean | 'full'> {
  if (!canRemindEvent(ev.dateKey)) return false;
  if (!(await requestPushPermission())) return false;
  const existing = await scheduledEventReminderIds();
  if (existing && !existing.includes(ev.id) && existing.length >= MAX_EVENT_REMINDERS) return 'full';
  await armEventReminder(ev);
  return true;
}

// Retire le rappel d’un événement (idempotent : aucun rappel posé = sans effet).
export async function cancelEventReminder(id: string): Promise<void> {
  if (!isNative) return;
  await Notifications.cancelScheduledNotificationAsync(`${EVENT_PREFIX}${id}`);
}

// Recale les rappels DÉJÀ posés sur les événements tels que le serveur les décrit MAINTENANT (R-83) :
// un événement REPORTÉ par l'opérateur gardait sinon son rappel à l'ANCIENNE date (« C'est demain »
// la veille d'un jour où il ne se passe plus rien), un titre / lieu corrigé gardait l'ancien texte.
// Rappel dont la date ou le texte a changé → reposé à la nouvelle veille 18 h ; plus rappelable
// (veille déjà passée) ou permission retirée → retiré (le bouton repasse à « Me rappeler »). Ne
// DEMANDE jamais la permission (resync à froid, E1). N'agit que sur les événements présents dans
// `rows` (liste fraîche) : les ABSENTS relèvent de sweepEventReminders (liste complète seulement).
export async function resyncEventReminders(rows: EventInput[]): Promise<void> {
  if (!isNative) return;
  const byId = new Map(rows.map((ev) => [ev.id, ev]));
  const stale = (await Notifications.getAllScheduledNotificationsAsync()).filter((n) => {
    if (!n.identifier.startsWith(EVENT_PREFIX)) return false;
    const ev = byId.get(n.identifier.slice(EVENT_PREFIX.length));
    if (!ev) return false;
    // Rappel posé avant cette version (sans dateKey) : recalé une fois, par prudence.
    const data = n.content.data as { dateKey?: string } | null;
    return data?.dateKey !== ev.dateKey || n.content.body !== eventReminderBody(ev);
  });
  if (stale.length === 0) return;
  const granted = await hasNotificationPermission();
  await Promise.all(
    stale.map((n) => {
      const ev = byId.get(n.identifier.slice(EVENT_PREFIX.length))!;
      return granted && canRemindEvent(ev.dateKey) ? armEventReminder(ev) : cancelEventReminder(ev.id);
    }),
  );
}

// Balaye les rappels ORPHELINS : un événement supprimé par l'opérateur côté serveur laisserait
// sinon son rappel local armé (« C'est demain 📅 » pour un événement annulé). Appelé par la
// section agenda de l'accueil UNIQUEMENT sur une liste fraîche ET complète (rows non-null,
// non tronquée) — jamais après un échec réseau (§8 : on ne détruit rien sur un blip).
export async function sweepEventReminders(liveIds: string[]): Promise<void> {
  if (!isNative) return;
  const scheduled = await scheduledEventReminderIds();
  if (!scheduled) return;
  const keep = new Set(liveIds);
  await Promise.all(scheduled.filter((id) => !keep.has(id)).map((id) => cancelEventReminder(id)));
}

// ─── Tap sur une notification → navigation ────────────────────────────────────
// Route l’utilisateur vers l’écran concerné au lieu de rouvrir l’app là où elle en était.
// `kind` couvre les rappels locaux (match-reminder / score-reminder) ET les push serveur
// (notify-club) qui portent désormais un payload `data` (friend_request / reservation / tournament).
type NotificationData = {
  kind?: string;
  id?: string;
  reservationId?: string;
  clubId?: string;
  dateKey?: string;
  time?: string;
  event?: string;
};

// Push « partie annulée » (notify-club : `kind: 'reservation'`, `event: 'cancelled'`, `id` = la résa) :
// les rappels LOCAUX de cette partie sont retirés dès réception (app ouverte) ou au tap — sinon
// « Ton match approche » sonnait pour un match qui n'a plus lieu (R-26). Reste le cas « push ignoré
// et app jamais rouverte » : la resync suivante (ouverture de l'app) le rattrape.
function dropCancelledReminders(data: NotificationData | null | undefined): void {
  if (data?.kind === 'reservation' && data.event === 'cancelled' && data.id) void cancelMatchReminder(data.id);
}

// Exporté pour tests/notifications.entry.ts (routage vérifié sans monter de composant).
export function routeForNotification(data: NotificationData | null | undefined): string | null {
  switch (data?.kind) {
    case 'friend_request':
      return '/amis';
    case 'reservation':
    case 'match-reminder':
    case 'score-reminder':
      // Pas d’écran par réservation individuelle : on amène à la liste, où elle est visible
      // (le rappel de score y trouve « Mettre le score » sous le match passé).
      return '/reservations';
    case 'lesson':
      // Demande de cours reçue → l’Espace Coach (Accepter / Refuser).
      return '/coach-admin';
    case 'club_reservation':
    case 'club_tournament':
      // Push destiné au GÉRANT (nouvelle résa / annulation / demande de tournoi) → un seul
      // tap ouvre l’Espace Club au lieu de laisser naviguer Profil → Espace Club à la main.
      // `clubId` (R-47) : un gérant MULTI-CLUBS peut recevoir le push d'un club qui n'est pas son
      // club actif — l'Espace Club le lit et propose de basculer. Ancien push sans clubId : inchangé.
      return data.clubId ? `/club-admin?clubId=${encodeURIComponent(data.clubId)}` : '/club-admin';
    case 'tournament':
      return data.id ? `/competition/${data.id}` : '/competitions';
    case 'news':
    case 'event':
      // Actu opérateur (47) / événement de l'agenda (82) → l'accueil, qui les affiche.
      return '/';
    case 'club_news':
      // Annonce d'un club suivi (83) → sa fiche, où la section « Annonces » l'affiche.
      return data.clubId ? `/club/${data.clubId}` : '/';
    case 'open_match':
      // Match ouvert d'un partenaire suivi / à mon niveau (80-81) → l'onglet Réserver, où la
      // section « Matchs ouverts » l'affiche (pas d'écran par match individuel).
      return '/reserver';
    case 'waitlist':
      // « Un créneau s'est libéré » (81) → tunnel du club pré-rempli jour/heure (mêmes query
      // params que la proposition d'annulation club, 75) — sinon l'onglet Réserver.
      return data.clubId && data.dateKey && data.time
        ? `/reserver/${data.clubId}?dateKey=${data.dateKey}&time=${encodeURIComponent(data.time)}`
        : '/reserver';
    default:
      return null;
  }
}

// Push reçu pendant que l'app est OUVERTE au premier plan : la bannière système s'affiche,
// mais rien ne rechargeait l'écran (seul le retour d'arrière-plan rafraîchit). Ce petit
// abonnement permet à AppContext de resynchroniser le miroir dès réception. No-op sur le web.
export function onPushReceivedInForeground(cb: () => void): () => void {
  if (!isNative) return () => {};
  const sub = Notifications.addNotificationReceivedListener((n) => {
    dropCancelledReminders(n.request.content.data as NotificationData);
    cb();
  });
  return () => sub.remove();
}

// Hook à monter UNE FOIS à la racine (RootNav) : gère le tap en premier plan/arrière-plan
// ET le démarrage « à froid » depuis une notification (getLastNotificationResponseAsync).
export function useNotificationTapRouter(push: (route: string) => void): void {
  useEffect(() => {
    if (!isNative) return;
    let active = true;
    const handle = (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data as NotificationData;
      dropCancelledReminders(data);
      const route = routeForNotification(data);
      if (route && active) push(route);
    };
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    // App lancée directement depuis une notification (froid) : la réponse est déjà disponible.
    void Notifications.getLastNotificationResponseAsync().then((r) => {
      if (r && active) handle(r);
    });
    return () => {
      active = false;
      sub.remove();
    };
  }, [push]);
}
