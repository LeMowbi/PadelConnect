// Test de logique — helpers PURS du store (src/store/helpers.ts), bundlé par tests/helpers.test.mjs
// (esbuild résout l'alias @/ : helpers importe @/lib/days à l'exécution) :
//   node tests/helpers.test.mjs
// Contrats qui comptent : (1) frAuthError ne montre JAMAIS l'anglais brut de GoTrue et
// reconnaît le « Database error saving new user » qui MASQUE le refus PHONE_TAKEN du trigger
// handle_new_user ; (2) isReservationOwner est la règle UNIQUE « c'est ma résa » (écrans + rappels
// locaux), connecté ou non ; (3) loggedOutState purge tout le périmètre du compte (fidélité,
// préférence « actus et agenda » et marqueur d'historique tronqué compris) ; (4) un COURS n'est
// pas une partie (décision porteur n° 3, même règle que la 98) : ni dans « Parties jouées », ni
// dans la série, ni dans le graphe d'activité ; (5) classement « ex æquo » (décision n° 10) : rang
// partagé du serveur, repli positionnel sur un serveur d'avant la 98 ; (6) préférence « actus et
// agenda » (décision n° 17) : écriture honnête via set_news_push. (5) et (6) passent par la
// doublure Supabase de helpers.test.mjs (globalThis.__sb).

import { fetchLeaderboard } from '@/lib/leaderboard';
import { setNewsPush } from '@/lib/social';
import {
  AUTH_ERROR_FALLBACK,
  computeStats,
  frAuthError,
  initialState,
  isLesson,
  isPlayed,
  isReservationOwner,
  loggedOutState,
  playedMatchTimes,
} from '@/store/helpers';
import type { OfficialResult, Reservation } from '@/store/AppContext';

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

// ── frAuthError : messages PAR CAS, jamais d'anglais à l'écran ───────────────────────────────
eq(
  frAuthError('Database error saving new user'),
  'Inscription impossible — ce numéro est peut-être déjà utilisé par un autre compte. Réessaie ou connecte-toi.',
  'frAuthError : « Database error saving new user » (PHONE_TAKEN masqué par GoTrue) → message prudent',
);
eq(frAuthError('Some brand new GoTrue message'), AUTH_ERROR_FALLBACK, 'frAuthError : message inconnu → repli FR (plus jamais le brut)');
check(
  !/[a-z]+ error|saving|should be/i.test(frAuthError('Password reset token has expired')),
  'frAuthError : aucun fragment anglais ne fuit',
);
eq(
  frAuthError('Password should be at least 6 characters.'),
  'Mot de passe trop court (6 caractères minimum).',
  'frAuthError : mot de passe trop court',
);
eq(
  frAuthError('New password should be different from the old password.'),
  'Choisis un mot de passe différent de l’ancien.',
  'frAuthError : same_password (reset-password) → refus définitif dédié, PAS « trop court »',
);
eq(
  frAuthError('Signups not allowed for this instance'),
  'Inscriptions momentanément fermées — réessaie plus tard ou écris-nous.',
  'frAuthError : inscriptions fermées → plus de « config Supabase »',
);
check(
  frAuthError('Invalid login credentials').includes('Mot de passe oublié'),
  'frAuthError : identifiants incorrects → renvoie vers « Mot de passe oublié ? »',
);
eq(
  frAuthError('Network request failed'),
  'Connexion internet impossible — réessaie.',
  'frAuthError : réseau → « réessaie » (le seul cas légitime)',
);
eq(
  frAuthError('Password is known to be weak and easy to guess, please choose a different one.'),
  'Mot de passe trop facile à deviner — choisis-en un autre.',
  'frAuthError : weak_password → refus dédié, PAS le repli « Réessaie »',
);
eq(frAuthError(''), AUTH_ERROR_FALLBACK, 'frAuthError : message vide → repli');
check(
  frAuthError('Email not confirmed').startsWith('Confirme d’abord ton e-mail'),
  'frAuthError : e-mail non confirmé → message dédié (l’écran propose ensuite le renvoi du lien)',
);

// ── isReservationOwner : règle UNIQUE « c'est ma résa » ──────────────────────────────────────
const base = {
  id: 'r1',
  clubId: 'padelta',
  dateKey: '2026-10-22',
  time: '18:00',
  court: 'Terrain 1',
  startsAt: 0,
  price: 15000,
  invited: [],
};
const mine = { ...base, userId: 'me' } as unknown as Reservation;
const other = { ...base, userId: 'him', bookedBy: { name: 'Awa' } } as unknown as Reservation;
const local = { ...base } as unknown as Reservation; // résa locale (démo), sans userId ni bookedBy
check(isReservationOwner(mine, 'me'), 'owner : connecté, ma résa (userId = moi)');
check(!isReservationOwner(other, 'me'), 'owner : connecté, résa d’un autre compte');
check(isReservationOwner(local, 'me'), 'owner : connecté, résa locale sans userId → à moi');
check(isReservationOwner(local, null), 'owner : sans session, résa locale → à moi');
check(!isReservationOwner(other, null), 'owner : sans session, résa « bookedBy » d’un autre → pas à moi');

// ── loggedOutState : tout le périmètre du compte est purgé ───────────────────────────────────
const cleared = loggedOutState({
  ...initialState,
  serverUserId: 'me',
  loyalty: { played: 12, playedAll: 12, claimed: 1, cap: 5000 },
  friends: [{ id: 'f1', name: 'Awa', phone: '0707070707' }],
  favoritePlayerIds: ['f1'],
  blockedUserIds: ['x'],
  reservationsCoveredFrom: 1_700_000_000_000,
  newsPush: false,
});
eq(cleared.serverUserId, null, 'loggedOut : identité serveur purgée');
eq(cleared.newsPush, null, 'loggedOut : préférence « actus et agenda » purgée (le compte suivant relit la sienne)');
eq(cleared.loyalty, null, 'loggedOut : compteur de fidélité serveur purgé (sinon le compte suivant hérite des tampons)');
eq(cleared.friends, [], 'loggedOut : amis purgés');
eq(cleared.favoritePlayerIds, [], 'loggedOut : joueurs suivis purgés');
eq(cleared.blockedUserIds, [], 'loggedOut : bloqués purgés');
eq(
  cleared.reservationsCoveredFrom,
  null,
  'loggedOut : marqueur « historique incomplet » purgé (sinon le compte suivant hérite d’un bandeau faux)',
);

// ── Décision 3 : un COURS n'est pas une partie (miroir de `coalesce(coach_name, '') = ''`, 98) ──
const NOW = Date.UTC(2026, 9, 22, 12); // jeudi 22/10/2026 12:00 UTC
const HOUR = 3_600_000;
const resa = (id: string, startsAt: number, over: Partial<Reservation> = {}) =>
  ({ ...base, id, startsAt, durationMin: 90, userId: 'me', ...over }) as unknown as Reservation;
check(!isLesson(resa('a', 0)), 'isLesson : résa sans coach → partie');
check(!isLesson(resa('a', 0, { coachName: '' })), 'isLesson : coach_name vide → partie (comme le serveur)');
check(isLesson(resa('a', 0, { coachName: 'Yao K.' })), 'isLesson : coach_name renseigné → cours');
check(isPlayed(resa('a', NOW - 90 * 60_000), NOW), 'isPlayed : fin du créneau atteinte (1h30) → jouée');
check(!isPlayed(resa('a', NOW - 60 * 60_000), NOW), 'isPlayed : créneau de 1h30 commencé il y a 1 h → pas encore jouée');

const WEEK = 7 * 24 * HOUR;
const mirror = [
  resa('m1', NOW - 2 * HOUR), // partie jouée cette semaine
  resa('m2', NOW - WEEK - 2 * HOUR), // partie jouée la semaine précédente
  resa('c1', NOW - 2 * WEEK - 2 * HOUR, { coachName: 'Yao K.' }), // COURS joué il y a 2 semaines
  resa('c2', NOW - 3 * HOUR, { coachName: 'Yao K.' }), // COURS joué cette semaine
  resa('p1', NOW - 4 * HOUR, { userId: 'him' }), // invitation jamais acceptée
  resa('f1', NOW + 24 * HOUR), // à venir
];
eq(
  playedMatchTimes(mirror, ['p1'], NOW),
  [NOW - 2 * HOUR, NOW - WEEK - 2 * HOUR],
  'playedMatchTimes : parties jouées seulement (ni cours, ni invitation en attente, ni à venir)',
);
const official: OfficialResult[] = [
  { id: 'o1', title: 'Open', result: 'win', won: true, at: 0 },
  { id: 'o2', title: 'Amical', result: 'played', won: false, at: 0 },
];
const st = computeStats(mirror, official, ['p1'], null, NOW);
eq(st.played, 2, 'computeStats : les 2 cours joués ne comptent pas dans « Parties jouées »');
eq(st.streakWeeks, 2, 'computeStats : la série s’arrête où il n’y a eu qu’un cours (2 semaines, pas 3)');
eq([st.tournamentsPlayed, st.tournamentsWon], [2, 1], 'computeStats : tournois joués / gagnés inchangés');
eq(
  computeStats(mirror, [], ['p1'], 7, NOW).played,
  7,
  'computeStats : compteur serveur (hors cours, 98) prioritaire s’il dépasse le miroir',
);
eq(computeStats(mirror, [], ['p1'], 1, NOW).played, 2, 'computeStats : miroir plus frais que le serveur → partie tout juste finie gardée');
eq(
  computeStats([resa('c3', NOW - 2 * HOUR, { coachName: 'Yao K.' })], [], [], 0, NOW).streakWeeks,
  0,
  'computeStats : un coach qui ne donne que des cours n’a pas de série',
);

// ── Doublure Supabase (helpers.test.mjs) ─────────────────────────────────────────────────────
type SbStub = { calls: { name: string; args: unknown }[]; next: { data: unknown; error: unknown } };
const sb = (globalThis as unknown as { __sb: SbStub }).__sb;
const serverRow = (userId: string, points: number, rank?: number) => ({
  user_id: userId,
  name: `J ${userId}`,
  level: '3.5',
  wins: 0,
  match_wins: 1,
  off_played: 0,
  played: 2,
  points,
  ...(rank === undefined ? {} : { rank }),
});

// ── Décision 10 : classement « ex æquo » ─────────────────────────────────────────────────────
void (async () => {
  sb.next = { data: [serverRow('a', 20, 1), serverRow('b', 20, 1), serverRow('c', 12, 3), serverRow('d', 4, 4)], error: null };
  const board = await fetchLeaderboard(50);
  eq(
    board?.map((r) => [r.rank, r.tied]),
    [
      [1, true],
      [1, true],
      [3, false],
      [4, false],
    ],
    'classement : rang PARTAGÉ du serveur (1, 1, 3) et drapeau « ex æquo » sur les seuls rangs partagés',
  );
  eq(sb.calls.at(-1), { name: 'fetch_leaderboard', args: { p_limit: 50 } }, 'classement : RPC fetch_leaderboard(p_limit)');

  sb.next = { data: [serverRow('a', 20), serverRow('b', 20), serverRow('c', 12)], error: null };
  eq(
    (await fetchLeaderboard())?.map((r) => [r.rank, r.tied]),
    [
      [1, false],
      [2, false],
      [3, false],
    ],
    'classement : serveur d’avant la 98 (sans colonne rank) → rang positionnel, aucun « ex æquo » inventé',
  );

  sb.next = { data: null, error: { message: 'offline' } };
  eq(await fetchLeaderboard(), null, 'classement : échec réseau → null (convention §8)');

  // ── Décision 17 : préférence « actus et agenda » (set_news_push, 98) ──────────────────────
  sb.next = { data: true, error: null };
  eq(await setNewsPush(false), true, 'news_push : enregistré → true');
  eq(sb.calls.at(-1), { name: 'set_news_push', args: { p_on: false } }, 'news_push : RPC set_news_push(p_on)');
  sb.next = { data: false, error: null };
  eq(await setNewsPush(true), false, 'news_push : refus serveur (non connecté) → false, jamais un faux ✓');
  sb.next = { data: null, error: { message: 'offline' } };
  eq(await setNewsPush(true), false, 'news_push : échec réseau → false');

  if (failed > 0) {
    console.error(`\n${failed} assertion(s) en échec`);
    process.exit(1);
  }
  console.log('\nhelpers.test : tout est vert ✓');
})();
