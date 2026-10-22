// Test de logique — fidélité PadelConnect, règle cible (src/lib/loyalty.ts) :
//   node --experimental-strip-types tests/loyalty.test.ts
// Invariants : (1) le code saisi au comptoir est normalisé EXACTEMENT comme le serveur
// (`club_serve_loyalty_claim` : majuscules, non-alphanumériques retirés) ; (2) la remise
// proposée au gérant ne dépasse JAMAIS le plafond (sinon le serveur répondrait 'over_cap' après
// coup) ; (3) la progression de la carte à tampons est le MIROIR de `claim_loyalty` ; (4) une
// remise est déduite sur la semaine calendaire de son SERVICE, par club — y compris pour un club
// sans partie jouée cette semaine-là ; (5) un compteur persisté par une version antérieure (sans
// `cap`) est écarté à l'hydratation au lieu de faire planter la carte fidélité.

import {
  LOYALTY_CAP_DEFAULT,
  LOYALTY_CYCLE,
  asLoyalty,
  isLoyaltyCode,
  loyaltyByClubForWeek,
  loyaltyDiscount,
  loyaltyProgress,
  loyaltyServedByWeek,
  loyaltyWeekKey,
  normalizeLoyaltyCode,
} from '../src/lib/loyalty.ts';
import { weekKeyOf } from '../src/lib/days.ts';

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

// ── Code du justificatif ────────────────────────────────────────────────────────
eq(normalizeLoyaltyCode(' ab-c d12 '), 'ABCD12', 'normalisation : majuscules, espaces et tiret retirés (comme le serveur)');
eq(normalizeLoyaltyCode('ULTJCL'), 'ULTJCL', 'normalisation : code propre inchangé');
check(isLoyaltyCode('ultjcl'), 'code plausible : 6 caractères de l’alphabet, minuscules acceptées');
check(isLoyaltyCode('A2B-3C4'), 'code plausible : séparateur toléré avant normalisation');
check(!isLoyaltyCode('ABCDE'), 'code refusé : 5 caractères');
check(!isLoyaltyCode('ABCDEFG'), 'code refusé : 7 caractères');
check(!isLoyaltyCode('ABC0D1'), 'code refusé : 0 et 1 n’existent pas dans l’alphabet (ni O ni I)');
check(!isLoyaltyCode('ABCOIE'), 'code refusé : O et I n’existent pas dans l’alphabet');
check(!isLoyaltyCode(''), 'code refusé : vide');

// ── Remise −50 % plafonnée ──────────────────────────────────────────────────────
eq(loyaltyDiscount(7000, LOYALTY_CAP_DEFAULT), 3500, 'remise : −50 % d’un match à 7 000 = 3 500');
eq(loyaltyDiscount(15000, LOYALTY_CAP_DEFAULT), 5000, 'remise : −50 % de 15 000 (7 500) plafonné à 5 000');
eq(loyaltyDiscount(10000, LOYALTY_CAP_DEFAULT), 5000, 'remise : exactement au plafond');
eq(loyaltyDiscount(15000, 7000), 7000, 'remise : suit le plafond RÉEL réglé par l’opérateur (7 000)');
eq(loyaltyDiscount(15000, 7000.9), 7000, 'remise : plafond non entier tronqué (le serveur exige un entier)');
eq(loyaltyDiscount(1, LOYALTY_CAP_DEFAULT), 1, 'remise : 0,5 arrondi à 1 (≥ 1, accepté par le serveur)');
eq(loyaltyDiscount(0, LOYALTY_CAP_DEFAULT), 0, 'remise : prix 0 → 0 (bouton grisé)');
eq(loyaltyDiscount(-500, LOYALTY_CAP_DEFAULT), 0, 'remise : prix négatif → 0');
eq(loyaltyDiscount(Number.NaN, LOYALTY_CAP_DEFAULT), 0, 'remise : saisie non numérique → 0');
check(LOYALTY_CYCLE === 10, 'cycle : 10 réservations (même constante que claim_loyalty)');

// ── Carte à tampons — miroir de claim_loyalty (`played / 10 > claimed`) ─────────
eq(loyaltyProgress(null), { pending: 0, filled: 0 }, 'progression : compteur pas encore lu → rien');
eq(loyaltyProgress({ played: 0, claimed: 0 }), { pending: 0, filled: 0 }, 'progression : 0 partie');
eq(loyaltyProgress({ played: 7, claimed: 0 }), { pending: 0, filled: 7 }, 'progression : 7/10');
eq(
  loyaltyProgress({ played: 10, claimed: 0 }),
  { pending: 1, filled: 10 },
  'progression : cycle complet non réclamé → 10 pleines, 1 à réclamer',
);
eq(loyaltyProgress({ played: 12, claimed: 1 }), { pending: 0, filled: 2 }, 'progression : cycle réclamé → repart à 2/10');
eq(loyaltyProgress({ played: 25, claimed: 0 }), { pending: 2, filled: 10 }, 'progression : 2 cycles en attente');
eq(
  loyaltyProgress({ played: 3, claimed: 1 }),
  { pending: 0, filled: 0 },
  'progression : plus réclamé que joué (parties annulées après coup) → 0, jamais négatif ni un faux 3/10',
);
// Réclamation faite sous la règle de la 82 (invitations comprises) : la 2ᵉ remise exige 20
// réservations CRÉÉES. La carte montre la progression RÉELLE, jamais 9/10 puis 0/10 sans récompense.
eq(loyaltyProgress({ played: 9, claimed: 1 }), { pending: 0, filled: 0 }, 'progression : 9 créées, 1 réclamée → 0/10 (pas un faux 9/10)');
eq(
  loyaltyProgress({ played: 10, claimed: 1 }),
  { pending: 0, filled: 0 },
  'progression : 10ᵉ réservation → ne régresse pas (0/10 avant, 0/10 après)',
);
eq(loyaltyProgress({ played: 15, claimed: 1 }), { pending: 0, filled: 5 }, 'progression : 15 créées, 1 réclamée → 5/10 vers la 2ᵉ remise');
eq(
  loyaltyProgress({ played: 20, claimed: 1 }),
  { pending: 1, filled: 10 },
  'progression : 20 créées, 1 réclamée → carte complète (= claim_loyalty)',
);
// Monotonie : chaque réservation jouée de plus ne fait JAMAIS reculer la carte (claimed fixe).
for (const claimed of [0, 1, 2, 3]) {
  let prev = -1;
  let monotone = true;
  for (let played = 0; played <= 45; played++) {
    const { pending, filled } = loyaltyProgress({ played, claimed });
    const score = pending * LOYALTY_CYCLE + filled;
    if (score < prev) monotone = false;
    prev = score;
  }
  check(monotone, `progression : jamais de recul quand on joue (claimed = ${claimed})`);
}

// ── Déduction par club × semaine DU SERVICE ─────────────────────────────────────
const monday = Date.UTC(2026, 9, 19, 10); // lundi 19 oct. 2026
const sunday = Date.UTC(2026, 9, 25, 20); // dimanche 25 oct. (même semaine)
const nextWeek = Date.UTC(2026, 9, 26, 9); // lundi 26 oct. (semaine suivante)
const wk = weekKeyOf(monday);
eq(wk, '2026-10-19', 'semaine : clé = lundi (sanity)');
eq(
  loyaltyServedByWeek([
    { clubId: 'padelta', amount: 3500, servedAt: monday },
    { clubId: 'padelta', amount: 5000, servedAt: sunday },
    { clubId: 'padelta', amount: 1000, servedAt: nextWeek },
    { clubId: 'elite', amount: 2000, servedAt: sunday },
  ]),
  { 'padelta:2026-10-19': 8500, 'padelta:2026-10-26': 1000, 'elite:2026-10-19': 2000 },
  'déduction : sommée par club × semaine, la semaine suivante séparée',
);
eq(loyaltyServedByWeek([]), {}, 'déduction : aucune remise → {}');
eq(loyaltyServedByWeek([{ clubId: 'padelta', amount: 0, servedAt: monday }]), {}, 'déduction : montant 0 ignoré');
eq(loyaltyWeekKey('padelta', '2026-10-19'), 'padelta:2026-10-19', 'clé : même forme que operatorPayments');

// ── Remises de LA semaine, par club (lignes du décompte, même sans partie jouée) ─
const byKey = loyaltyServedByWeek([
  { clubId: 'padelta', amount: 3500, servedAt: monday },
  { clubId: 'club-sans-partie', amount: 5000, servedAt: sunday },
  { clubId: 'padelta', amount: 1000, servedAt: nextWeek },
]);
eq(
  loyaltyByClubForWeek(byKey, wk),
  { padelta: 3500, 'club-sans-partie': 5000 },
  'semaine : chaque club ayant servi une remise a sa ligne (même sans partie jouée en app)',
);
eq(loyaltyByClubForWeek(byKey, '2026-10-26'), { padelta: 1000 }, 'semaine : la semaine suivante ne reprend que ses remises');
eq(loyaltyByClubForWeek(byKey, '2026-10-12'), {}, 'semaine : aucune remise → {}');
eq(
  loyaltyByClubForWeek({ 'club:a:2026-10-19': 700 }, wk),
  { 'club:a': 700 },
  'semaine : un « : » dans l’id du club ne casse pas la clé (suffixe retiré, pas un split)',
);

// ── Hydratation : compteur persisté par une version antérieure ───────────────────
eq(
  asLoyalty({ played: 3, playedAll: 5, claimed: 0, cap: 5000 }),
  { played: 3, playedAll: 5, claimed: 0, cap: 5000 },
  'hydratation : forme complète gardée',
);
eq(asLoyalty({ played: 3, claimed: 0 }), null, 'hydratation : forme 82 (sans cap ni playedAll) → null, jamais fcfa(undefined)');
eq(asLoyalty({ played: 3, playedAll: 5, claimed: 0, cap: '5000' }), null, 'hydratation : plafond non numérique → null');
eq(asLoyalty({ played: 3, playedAll: 5, claimed: 0, cap: Number.NaN }), null, 'hydratation : NaN → null');
eq(asLoyalty(null), null, 'hydratation : null → null');
eq(asLoyalty(undefined), null, 'hydratation : absent → null');
eq(asLoyalty('x'), null, 'hydratation : valeur non objet → null');

if (failed) {
  console.error(`\n${failed} ÉCHEC(S) — fidélité`);
  process.exit(1);
}
console.log('\nTOUS LES TESTS FIDÉLITÉ PASSENT.');
