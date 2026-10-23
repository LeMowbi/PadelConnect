// Test des rappels LOCAUX de match (src/lib/notifications.ts) et du point UNIQUE de demande de
// permission (src/lib/push.ts) — bundlé par tests/notifications.test.mjs avec des doublures natives.
// Invariants :
//  (1) BUDGET iOS : 64 notifications locales max, les plus lointaines jetées EN SILENCE → après une
//      resync pleine (18 réservations × 3 rappels) + 8 rappels d'agenda, on reste ≤ 64 (= 62) et ce
//      sont les créneaux les plus PROCHES qui sont gardés ;
//  (2) RAPPEL DE SCORE (C2) : fin du créneau (durée FIGÉE, repli 1h30) + 20 min, identifiant stable
//      `score-{id}` (re-poser = remplacer, jamais dupliquer), posé seulement si `scorable`, texte
//      décidé par le porteur ; un match en cours ne garde que ce rappel ; cancelMatchReminder retire
//      les TROIS rappels d'une résa sans toucher aux autres ni aux rappels d'agenda ;
//  (3) MUTISME (E1) : une resync à froid sans permission ne pose rien ET n'ouvre jamais la fenêtre
//      système ; registerPushToken n'enregistre rien sans permission ; seul requestPushPermission
//      ouvre la fenêtre (une fois), et « Me rappeler » (geste) passe par lui ; hasNotificationPermission
//      (garde du store avant ses lectures réseau) lit sans jamais rien ouvrir ;
//  (4) CHEVAUCHEMENT : les 3 rappels d'une résa ont des identifiants STABLES (cancel-/soon-/score-)
//      et toutes les écritures passent par une file unique → deux resyncs qui se chevauchent ne
//      dupliquent rien, seule la dernière demandée s'applique, l'ordre des appels est respecté ;
//  (5) CANAL Android « default » sur les rappels locaux (R-88) ; texte et marge iOS de l'annulation
//      gratuite (R-90 : la variante Android, 45 min, dépend de Platform au chargement du module) ;
//  (6) PUSH « partie annulée » reçu au premier plan → rappels de la partie retirés (R-26) ; routage
//      gérant multi-clubs vers l'Espace Club du BON club (R-47) ;
//  (7) RESYNC D'AGENDA (R-83) : événement reporté → rappel reposé à la nouvelle veille ; plus
//      rappelable → retiré ; inchangé → intact ; jamais de fenêtre de permission.

import * as Notifications from 'expo-notifications';
import {
  cancelEventReminder,
  cancelMatchReminder,
  canRemindEvent,
  eventReminderAt,
  hasNotificationPermission,
  IOS_LOCAL_NOTIFICATION_LIMIT,
  MAX_EVENT_REMINDERS,
  MAX_SCHEDULED_RESERVATIONS,
  onPushReceivedInForeground,
  REMINDERS_PER_RESERVATION,
  resyncEventReminders,
  routeForNotification,
  scheduleEventReminder,
  scheduleMatchReminder,
  scoreReminderAt,
  syncMatchReminders,
  type ReminderInput,
} from '@/lib/notifications';
import { registerPushToken, requestPushPermission } from '@/lib/push';
import { dayKey, DAY_MS, HOUR_MS, MINUTE_MS } from '@/lib/days';
import { CANCEL_DEADLINE_MS } from '@/lib/reservations';
import { SESSION_MIN } from '@/lib/slots';

// État des doublures (cf. tests/notifications.test.mjs).
type Stub = { permission: { granted: boolean; canAskAgain: boolean }; prompts: number; received: ((n: unknown) => void)[] };
const stub = (globalThis as unknown as { __notifs: Stub }).__notifs;
const serverStub = (globalThis as unknown as { __supabase: { tokenWrites: number } }).__supabase;

let failed = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? '✓' : '✗ ÉCHEC'} ${msg}`);
  if (!cond) failed++;
};
const eq = (a: unknown, b: unknown, msg: string) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  console.log(`${ok ? '✓' : `✗ ÉCHEC (${JSON.stringify(a)} ≠ ${JSON.stringify(b)})`} ${msg}`);
  if (!ok) failed++;
};

const now = Date.now();
const scheduled = () => Notifications.getAllScheduledNotificationsAsync();
const kindsOf = async (id: string) =>
  (await scheduled())
    .filter((n) => (n.content.data as { reservationId?: string }).reservationId === id)
    .map((n) => (n.content.data as { kind: string }).kind)
    .sort();
const reminder = (id: string, startsAt: number, extra: Partial<ReminderInput> = {}): ReminderInput => ({
  id,
  clubName: 'Padelta',
  time: '18:00',
  startsAt,
  durationMin: 90,
  court: 'Terrain 1',
  ...extra,
});

// ── (1) Budget : constantes cohérentes par construction ───────────────────────
eq(MAX_SCHEDULED_RESERVATIONS, 18, 'budget : 18 réservations planifiées au plus');
eq(REMINDERS_PER_RESERVATION, 3, 'budget : 3 rappels par réservation (annulation, approche, score)');
eq(MAX_EVENT_REMINDERS, 8, 'budget : 8 rappels d’agenda réservés');
const total = MAX_SCHEDULED_RESERVATIONS * REMINDERS_PER_RESERVATION + MAX_EVENT_REMINDERS;
check(total <= IOS_LOCAL_NOTIFICATION_LIMIT, `budget : ${total} ≤ ${IOS_LOCAL_NOTIFICATION_LIMIT} (plafond iOS)`);
eq(total, 62, 'budget : 18 × 3 + 8 = 62');

// ── (2) scoreReminderAt : fin réelle du créneau + 20 min ──────────────────────
eq(scoreReminderAt(now, 60), now + 80 * MINUTE_MS, 'score : créneau 1h → +80 min');
eq(scoreReminderAt(now, 90), now + 110 * MINUTE_MS, 'score : créneau 1h30 → +110 min');
eq(scoreReminderAt(now, 0), now + (SESSION_MIN + 20) * MINUTE_MS, 'score : durée absente (miroir antérieur à la 68) → repli 1h30');

// ── (2) scheduleMatchReminder : 3 rappels pour l'auteur d'un match « scorable » ─
const SCORE_TEXT = 'Saisis le score — il compte pour le classement et, une fois confirmé par l’adversaire, pour ton niveau.';
await scheduleMatchReminder(reminder('r1', now + 10 * HOUR_MS, { isOwner: true, scorable: true }));
eq(await kindsOf('r1'), ['match-reminder', 'match-reminder', 'score-reminder'], 'auteur scorable : annulation + approche + score');
const score1 = (await scheduled()).find((n) => n.identifier === 'score-r1');
const cancel1 = (await scheduled()).find((n) => n.identifier === 'cancel-r1');
const triggerOf = (n: Notifications.NotificationRequest | undefined) =>
  n?.trigger as { date?: Date; channelId?: string } | null | undefined;
eq(
  (await scheduled()).filter((n) => n.identifier.endsWith('-r1')).map((n) => triggerOf(n)?.channelId),
  ['default', 'default', 'default'],
  'canal Android : les 3 rappels de match vont dans « Rappels & alertes » (default), jamais « Miscellaneous »',
);
eq(
  triggerOf(cancel1)?.date?.getTime(),
  now + 10 * HOUR_MS - CANCEL_DEADLINE_MS - 15 * MINUTE_MS,
  'annulation gratuite (iOS, heure exacte) : 15 min avant la limite des 5 h',
);
eq(
  cancel1?.content.body,
  'Padelta à 18:00 · Terrain 1. Dans 15 min, l’annulation gratuite ne sera plus possible.',
  'annulation gratuite (iOS) : « Dans 15 min » reste vrai (rappel à l’heure exacte)',
);
check(!!score1, 'score : identifiant STABLE score-{id}');
eq(score1?.content.body, SCORE_TEXT, 'score : texte décidé par le porteur');
eq(score1?.content.title, 'Alors, ce match ? 🎾', 'score : titre « Alors, ce match ? »');
eq(
  (score1?.trigger as { date?: Date } | null)?.date?.getTime(),
  scoreReminderAt(now + 10 * HOUR_MS, 90),
  'score : déclenché à fin du créneau + 20 min',
);
await scheduleMatchReminder(reminder('r1', now + 10 * HOUR_MS, { isOwner: true, scorable: true }));
eq((await scheduled()).filter((n) => n.identifier === 'score-r1').length, 1, 'score : re-poser remplace (jamais deux rappels de score)');
eq(
  (await scheduled())
    .filter((n) => (n.content.data as { reservationId?: string }).reservationId === 'r1')
    .map((n) => n.identifier)
    .sort(),
  ['cancel-r1', 'score-r1', 'soon-r1'],
  'identifiants STABLES des 3 rappels : re-poser remplace, « Tu joues toujours ? » / « Ton match approche » jamais en double',
);

await scheduleMatchReminder(reminder('r2', now + 10 * HOUR_MS, { isOwner: true, scorable: false }));
eq(
  await kindsOf('r2'),
  ['match-reminder', 'match-reminder'],
  'auteur NON scorable (aucun partenaire avec compte) : pas de rappel de score',
);

await scheduleMatchReminder(reminder('r3', now + 10 * HOUR_MS, { isOwner: false, scorable: true }));
eq(await kindsOf('r3'), ['match-reminder', 'score-reminder'], 'invité accepté : approche + score (pas d’annulation gratuite)');

await scheduleMatchReminder(reminder('r4', now - 30 * MINUTE_MS, { isOwner: true, scorable: true }));
eq(await kindsOf('r4'), ['score-reminder'], 'match EN COURS : seul le rappel de score est encore devant nous');

await scheduleMatchReminder(reminder('r5', now - 3 * HOUR_MS, { isOwner: true, scorable: true }));
eq(await kindsOf('r5'), [], 'match fini depuis plus de 20 min : plus rien à poser');

// cancelMatchReminder : retire les trois rappels d'UNE résa, laisse les autres et l'agenda.
await Notifications.scheduleNotificationAsync({
  identifier: 'event-e1',
  content: { title: 'C’est demain 📅', body: 'Tournoi', data: { kind: 'event', id: 'e1' } },
  trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(now + DAY_MS) },
});
await cancelMatchReminder('r1');
eq(await kindsOf('r1'), [], 'cancelMatchReminder : les 3 rappels de r1 retirés');
eq((await kindsOf('r3')).length, 2, 'cancelMatchReminder : r3 intact');
check(
  (await scheduled()).some((n) => n.identifier === 'event-e1'),
  'cancelMatchReminder : rappel d’agenda intact',
);

// ── (1) syncMatchReminders : budget tenu, créneaux les plus proches gardés ────
// 7 rappels d'agenda de plus (8 au total) + 30 réservations scorables (dont une en cours).
for (let i = 2; i <= MAX_EVENT_REMINDERS; i++) {
  await Notifications.scheduleNotificationAsync({
    identifier: `event-e${i}`,
    content: { title: 'C’est demain 📅', body: 'Événement', data: { kind: 'event', id: `e${i}` } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(now + i * DAY_MS) },
  });
}
const many: ReminderInput[] = [];
for (let i = 1; i <= 30; i++) many.push(reminder(`m${i}`, now + i * DAY_MS, { isOwner: true, scorable: true }));
await syncMatchReminders([...many].reverse(), true); // ordre d'entrée quelconque : le tri est interne
const after = await scheduled();
eq(after.length, 62, 'resync pleine : 18 × 3 + 8 agenda = 62 notifications programmées (le pire cas du budget)');
check(after.length <= IOS_LOCAL_NOTIFICATION_LIMIT, 'resync pleine : sous le plafond iOS de 64');
eq((await kindsOf('m18')).length, 3, 'resync : la 18ᵉ journée à venir est encore planifiée');
eq(await kindsOf('m19'), [], 'resync : la 19ᵉ est au-delà du budget — jetée par NOUS (prévisible), pas par iOS (silencieux)');
eq(await kindsOf('m30'), [], 'resync : la plus lointaine n’est pas planifiée');
eq(after.filter((n) => n.identifier.startsWith('event-')).length, 8, 'resync : les 8 rappels d’agenda survivent (kind distinct)');
eq(await kindsOf('r3'), [], 'resync : une résa absente de la liste perd ses rappels (annulée / pas venu / annulée club)');

// Un match EN COURS (startsAt passé) compte comme le plus proche : gardé en tête du budget, avec
// son seul rappel de score ; la 18ᵉ journée à venir bascule alors hors budget.
await syncMatchReminders([...many.slice(0, 29), reminder('live', now - 20 * MINUTE_MS, { isOwner: true, scorable: true })], true);
eq(await kindsOf('live'), ['score-reminder'], 'resync : le match en cours (le plus proche) est gardé, score seul');
eq((await kindsOf('m17')).length, 3, 'resync : 17 journées à venir + le match en cours = 18 résas');
eq(await kindsOf('m18'), [], 'resync : la 18ᵉ journée cède sa place au match en cours');
eq((await scheduled()).length, 17 * 3 + 1 + 8, 'resync : 17 × 3 + 1 + 8 agenda = 60');

// ── (4) Resyncs qui se chevauchent : file unique, la DERNIÈRE demande l'emporte ─
// Scénario du constat : push au premier plan (refreshMirror → resync) puis « Accepter » une
// invitation (seconde resync) avant la fin de la première. Lancées sans attendre l'une l'autre.
const first = syncMatchReminders(many.slice(0, 5), true);
const second = syncMatchReminders([...many.slice(0, 4), reminder('acc', now + 30 * MINUTE_MS + 6 * HOUR_MS, { isOwner: false })], true);
await Promise.all([first, second]);
const overlapped = (await scheduled()).filter((n) => !n.identifier.startsWith('event-'));
eq(overlapped.length, 4 * 3 + 1, 'chevauchement : 4 résas × 3 + l’invitation acceptée (approche seule) = 13, aucun doublon');
eq(new Set(overlapped.map((n) => n.identifier)).size, overlapped.length, 'chevauchement : chaque identifiant n’existe qu’une fois');
eq(await kindsOf('m5'), [], 'chevauchement : la resync dépassée (plus ancienne) ne s’applique pas');
eq(await kindsOf('acc'), ['match-reminder'], 'chevauchement : la dernière resync demandée s’applique');
// Ordre des appels respecté entre resync et retrait / pose ponctuels.
const syncing = syncMatchReminders(many.slice(0, 2), true);
const cancelling = cancelMatchReminder('m1');
const adding = scheduleMatchReminder(reminder('new', now + 3 * DAY_MS, { isOwner: true, scorable: false }));
await Promise.all([syncing, cancelling, adding]);
eq(await kindsOf('m1'), [], 'file : un retrait demandé APRÈS une resync en vol n’est pas re-posé par elle');
eq((await kindsOf('m2')).length, 3, 'file : la resync a bien posé les autres résas');
eq(
  await kindsOf('new'),
  ['match-reminder', 'match-reminder'],
  'file : une pose demandée APRÈS une resync en vol n’est pas effacée par elle',
);

// Interrupteur coupé : tous nos rappels tombent, l'agenda reste.
await syncMatchReminders(many, false);
eq((await scheduled()).length, 8, 'interrupteur coupé : seuls les 8 rappels d’agenda restent');

// ── (3) Mutisme à froid (E1) ──────────────────────────────────────────────────
stub.permission = { granted: false, canAskAgain: true };
stub.prompts = 0;
await syncMatchReminders(many, true);
eq((await scheduled()).length, 8, 'sans permission : la resync ne pose rien');
eq(stub.prompts, 0, 'sans permission : la resync n’ouvre JAMAIS la fenêtre système (muette)');
check(!(await hasNotificationPermission()), 'sans permission : hasNotificationPermission → false (le store saute ses lectures réseau)');
eq(stub.prompts, 0, 'hasNotificationPermission : lit sans jamais ouvrir la fenêtre système');
await registerPushToken();
eq(serverStub.tokenWrites, 0, 'sans permission : registerPushToken n’enregistre rien et ne demande rien');
eq(stub.prompts, 0, 'registerPushToken : muet');

// Seul requestPushPermission ouvre la fenêtre — une fois.
check(await requestPushPermission(), 'requestPushPermission : accordée');
check(await hasNotificationPermission(), 'permission accordée : hasNotificationPermission → true');
eq(stub.prompts, 1, 'requestPushPermission : la fenêtre système s’est ouverte UNE fois');
check(await requestPushPermission(), 'requestPushPermission : déjà accordée → true');
eq(stub.prompts, 1, 'requestPushPermission : déjà accordée → sans rouvrir la fenêtre');
await registerPushToken();
eq(serverStub.tokenWrites, 1, 'permission accordée : le jeton est enregistré');

// Refus définitif : rien ne s'ouvre, false honnête (l'écran mène aux Réglages).
stub.permission = { granted: false, canAskAgain: false };
check(!(await requestPushPermission()), 'refus définitif : false');
eq(stub.prompts, 1, 'refus définitif : la fenêtre ne se rouvre pas');

// « Me rappeler » (geste explicite) passe par l'unique helper : fenêtre ouverte si jamais demandée.
stub.permission = { granted: false, canAskAgain: true };
const inTwoDays = dayKey(new Date(now + 2 * DAY_MS));
const ev = { id: 'e-new', title: 'Open', dateKey: inTwoDays, place: 'Padelta' };
check(canRemindEvent(inTwoDays, now), 'agenda : un événement dans 2 jours est rappelable');
eq(await scheduleEventReminder(ev), 'full', 'agenda : 8 rappels déjà posés → budget d’agenda atteint (jamais jeté en silence)');
eq(stub.prompts, 2, 'agenda : la fenêtre s’est ouverte via requestPushPermission (geste, pas à froid)');
await cancelEventReminder('e8');
eq(await scheduleEventReminder(ev), true, 'agenda : une place libérée → rappel posé');
eq(stub.prompts, 2, 'agenda : permission déjà accordée → la fenêtre ne se rouvre pas');

// ── (6) Push « partie annulée » au premier plan → rappels retirés (R-26) ─────
await scheduleMatchReminder(reminder('rc', now + 10 * HOUR_MS, { isOwner: true, scorable: true }));
await scheduleMatchReminder(reminder('rk', now + 10 * HOUR_MS, { isOwner: true, scorable: true }));
let refreshed = 0;
const unsubscribe = onPushReceivedInForeground(() => refreshed++);
const deliver = (data: Record<string, unknown>) => stub.received.forEach((cb) => cb({ request: { content: { data } } }));
deliver({ kind: 'reservation', id: 'rk' }); // push ordinaire sur une partie (confirmation…) : rien à retirer
deliver({ kind: 'reservation', id: 'rc', event: 'cancelled' });
await cancelMatchReminder('aucune'); // file unique : attend la fin du retrait déclenché par le push
eq(await kindsOf('rc'), [], 'push « partie annulée » reçu : les rappels de la partie sont retirés');
eq((await kindsOf('rk')).length, 3, 'push ordinaire : les rappels de la partie restent');
eq(refreshed, 2, 'push reçu : le store est toujours prévenu (resync du miroir)');
unsubscribe();
await cancelMatchReminder('rk');

// Routage du tap (R-47) : un gérant multi-clubs atterrit sur l'Espace Club du club CONCERNÉ.
eq(
  routeForNotification({ kind: 'club_reservation', clubId: 'district club' }),
  '/club-admin?clubId=district%20club',
  'tap gérant : clubId transmis (encodé)',
);
eq(
  routeForNotification({ kind: 'club_tournament' }),
  '/club-admin?section=Tournois',
  'tap gérant : demande de tournoi sans clubId → onglet Tournois',
);
eq(
  routeForNotification({ kind: 'club_tournament', clubId: 'c1' }),
  '/club-admin?clubId=c1&section=Tournois',
  'tap gérant : demande de tournoi → club concerné, onglet Tournois',
);
eq(routeForNotification({ kind: 'club_reservation' }), '/club-admin', 'tap gérant : ancien push sans clubId → Espace Club (inchangé)');
eq(
  routeForNotification({ kind: 'reservation', id: 'rc', event: 'cancelled' }),
  '/reservations',
  'tap « partie annulée » : Mes réservations',
);

// ── (7) Resync des rappels d'agenda (R-83) ────────────────────────────────────
const inThreeDays = dayKey(new Date(now + 3 * DAY_MS));
const inFiveDays = dayKey(new Date(now + 5 * DAY_MS));
const today = dayKey(new Date(now));
const evTrigger = async (id: string) => triggerOf((await scheduled()).find((n) => n.identifier === `event-${id}`));
await cancelEventReminder('e7'); // place libre dans le budget d'agenda
eq(await scheduleEventReminder({ id: 'rep', title: 'Open', dateKey: inThreeDays, place: 'Padelta' }), true, 'agenda : rappel posé');
eq((await evTrigger('rep'))?.channelId, 'default', 'agenda : canal Android « default »');
const prompts = stub.prompts;
await resyncEventReminders([{ id: 'rep', title: 'Open', dateKey: inThreeDays, place: 'Padelta' }]);
eq((await evTrigger('rep'))?.date?.getTime(), eventReminderAt(inThreeDays), 'resync : événement inchangé → rappel intact');
await resyncEventReminders([{ id: 'rep', title: 'Open', dateKey: inFiveDays, place: 'Padelta' }]);
eq(
  (await evTrigger('rep'))?.date?.getTime(),
  eventReminderAt(inFiveDays),
  'resync : événement REPORTÉ → rappel reposé à la nouvelle veille 18 h',
);
await resyncEventReminders([{ id: 'rep', title: 'Open de Cocody', dateKey: inFiveDays, place: 'Padelta' }]);
eq(
  (await scheduled()).find((n) => n.identifier === 'event-rep')?.content.body,
  'Open de Cocody — Padelta',
  'resync : titre corrigé → texte du rappel mis à jour',
);
await resyncEventReminders([{ id: 'rep', title: 'Open de Cocody', dateKey: today, place: 'Padelta' }]);
eq(await evTrigger('rep'), undefined, 'resync : avancé à aujourd’hui (veille passée) → rappel retiré, jamais à l’ancienne date');
check(!!(await evTrigger('e1')), 'resync : un événement absent de la liste n’est pas touché (relève du balayage)');
eq(stub.prompts, prompts, 'resync : n’ouvre jamais la fenêtre de permission');

if (failed) {
  console.error(`\n${failed} test(s) en échec`);
  process.exit(1);
}
console.log('\nTous les tests notifications.ts / push.ts passent.');
