// Test de logique — badges joueur (src/lib/badges.ts) :
//   node --experimental-strip-types tests/badges.test.ts
// Deux invariants comptent : (1) un badge ne se débloque JAMAIS avant son seuil (un badge
// affiché « gagné » à tort serait un écran menteur), et (2) les identifiants sont STABLES
// (ils serviront de clé à une éventuelle persistance) — un renommage casse le test.

import { ALL_BADGES, badgeBoard, earnedBadges, type BadgeInput } from '../src/lib/badges.ts';

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

// Joueur tout neuf : aucun chiffre.
const ZERO: BadgeInput = {
  playedCount: 0,
  tournamentsPlayed: 0,
  tournamentsWon: 0,
  points: 0,
  validatedWins: 0,
  weekStreak: 0,
  friendsCount: 0,
};
const ids = (input: BadgeInput) => earnedBadges(input).map((b) => b.id);
const has = (input: BadgeInput, id: string) => ids(input).includes(id);

// ── Catalogue : identifiants stables, aucun doublon, présentation complète ──────
eq(
  ALL_BADGES.map((b) => b.id),
  ['first_resa', 'five_resa', 'twenty_resa', 'first_tournoi', 'tournoi_winner', 'first_win', 'points_100', 'streak_3', 'social_3'],
  'catalogue : les 9 identifiants, dans l’ordre canonique',
);
check(new Set(ALL_BADGES.map((b) => b.id)).size === ALL_BADGES.length, 'catalogue : aucun identifiant en double');
check(
  ALL_BADGES.every((b) => b.icon.length > 0 && b.title.length > 0 && b.desc.length > 0),
  'catalogue : chaque badge a icône, titre et description',
);

// ── Borne 0 : un compte neuf ne gagne RIEN ─────────────────────────────────────
eq(earnedBadges(ZERO), [], 'compte neuf (tout à 0) : aucun badge');

// ── Parties jouées : 1 / 5 / 20, seuils exacts (frontières) ────────────────────
check(!has({ ...ZERO, playedCount: 0 }, 'first_resa'), '0 partie : pas de « Premier match »');
check(has({ ...ZERO, playedCount: 1 }, 'first_resa'), '1 partie : « Premier match » gagné');
check(!has({ ...ZERO, playedCount: 4 }, 'five_resa'), '4 parties : « Habitué » encore verrouillé');
check(has({ ...ZERO, playedCount: 5 }, 'five_resa'), '5 parties : « Habitué » gagné');
check(!has({ ...ZERO, playedCount: 19 }, 'twenty_resa'), '19 parties : « Pilier du club » encore verrouillé');
check(has({ ...ZERO, playedCount: 20 }, 'twenty_resa'), '20 parties : « Pilier du club » gagné');
eq(ids({ ...ZERO, playedCount: 20 }), ['first_resa', 'five_resa', 'twenty_resa'], '20 parties : les 3 paliers de parties sont cumulés');

// ── Tournois, victoires, points, série, amis : seuils exacts ───────────────────
check(!has({ ...ZERO, tournamentsPlayed: 0 }, 'first_tournoi'), '0 tournoi : pas de « Compétiteur »');
check(has({ ...ZERO, tournamentsPlayed: 1 }, 'first_tournoi'), '1 tournoi joué : « Compétiteur » gagné');
check(!has({ ...ZERO, tournamentsWon: 0 }, 'tournoi_winner'), '0 tournoi gagné : pas de « Champion »');
check(has({ ...ZERO, tournamentsWon: 1 }, 'tournoi_winner'), '1 tournoi gagné : « Champion » gagné');
check(!has({ ...ZERO, validatedWins: 0 }, 'first_win'), '0 victoire validée : pas de « Première victoire »');
check(has({ ...ZERO, validatedWins: 1 }, 'first_win'), '1 victoire validée : « Première victoire » gagnée');
check(!has({ ...ZERO, points: 99 }, 'points_100'), '99 points : « Cap des 100 » encore verrouillé');
check(has({ ...ZERO, points: 100 }, 'points_100'), '100 points : « Cap des 100 » gagné');
check(!has({ ...ZERO, weekStreak: 2 }, 'streak_3'), 'série de 2 semaines : « Régulier » encore verrouillé');
check(has({ ...ZERO, weekStreak: 3 }, 'streak_3'), 'série de 3 semaines : « Régulier » gagné');
check(!has({ ...ZERO, friendsCount: 2 }, 'social_3'), '2 amis : « Esprit d’équipe » encore verrouillé');
check(has({ ...ZERO, friendsCount: 3 }, 'social_3'), '3 amis : « Esprit d’équipe » gagné');

// Chaque critère est INDÉPENDANT : un seul chiffre ne débloque qu'un seul badge.
eq(ids({ ...ZERO, points: 100 }), ['points_100'], 'les points seuls ne débloquent pas les badges de parties');
eq(ids({ ...ZERO, friendsCount: 12 }), ['social_3'], 'les amis seuls ne débloquent que le badge social');

// ── badgeBoard : tous les badges, gagnés d'abord, ordre canonique conservé ─────
const board = badgeBoard({ ...ZERO, playedCount: 5, friendsCount: 3 });
eq(board.length, ALL_BADGES.length, 'tableau : tous les badges sont rendus (gagnés + à débloquer)');
eq(
  board.filter((b) => b.earned).map((b) => b.badge.id),
  ['first_resa', 'five_resa', 'social_3'],
  'tableau : les gagnés en tête, dans l’ordre canonique',
);
eq(
  board.slice(0, 3).map((b) => b.earned),
  [true, true, true],
  'tableau : aucun badge verrouillé ne se glisse avant un badge gagné',
);
eq(
  board.filter((b) => !b.earned).map((b) => b.badge.id),
  ['twenty_resa', 'first_tournoi', 'tournoi_winner', 'first_win', 'points_100', 'streak_3'],
  'tableau : les verrouillés suivent, ordre canonique conservé',
);
eq(
  badgeBoard(ZERO).map((b) => b.earned),
  ALL_BADGES.map(() => false),
  'tableau : compte neuf → tout est à débloquer, rien ne disparaît',
);
eq(
  badgeBoard({
    playedCount: 20,
    tournamentsPlayed: 3,
    tournamentsWon: 1,
    points: 240,
    validatedWins: 4,
    weekStreak: 6,
    friendsCount: 9,
  }).map((b) => b.badge.id),
  ALL_BADGES.map((b) => b.id),
  'tableau : joueur complet → ordre canonique intact (tout est gagné)',
);

if (failed) {
  console.error(`\n${failed} test(s) en échec`);
  process.exit(1);
}
console.log('\nTous les tests badges.ts passent.');
