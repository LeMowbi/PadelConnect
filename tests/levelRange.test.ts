// Test de logique — fourchette de niveau des matchs ouverts (src/lib/levelRange.ts) :
//   node --experimental-strip-types tests/levelRange.test.ts
// Deux invariants comptent : (1) une saisie ne sort JAMAIS de ce que le serveur accepte
// (demi-points bornés [1, 7], min ≤ max — contrainte reservations_open_level_range_chk), et
// (2) `levelInRange` est le MIROIR EXACT de la garde `join_open_match` (bornes incluses, borne
// nulle = aucune contrainte) — sinon l'app proposerait « Rejoindre » sur un match que le
// serveur refuse (ou l'inverse : un bouton grisé sans raison).

import { LEVEL_CEIL, LEVEL_FLOOR, levelInRange, levelRangeText, snapLevel, stepLevelRange } from '../src/lib/levelRange.ts';

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

// ── snapLevel : demi-points bornés ──────────────────────────────────────────────
eq(snapLevel(3), 3, 'snap : entier inchangé');
eq(snapLevel(3.5), 3.5, 'snap : demi-point inchangé');
eq(snapLevel(3.17), 3, 'snap : niveau serveur (2 décimales) ramené au demi-point');
eq(snapLevel(3.4), 3.5, 'snap : arrondi au demi-point supérieur');
eq(snapLevel(0.2), LEVEL_FLOOR, 'snap : borné au plancher 1');
eq(snapLevel(12), LEVEL_CEIL, 'snap : borné au plafond 7');

// ── stepLevelRange : premier appui, pas, bornes, cohérence min ≤ max ────────────
eq(stepLevelRange({ min: null, max: null }, 'min', 1, 3.5), { min: 3.5, max: null }, 'depuis « — » : le + pose le niveau d’ancrage');
eq(stepLevelRange({ min: null, max: null }, 'min', -1, 3.5), { min: 3.5, max: null }, 'depuis « — » : le − aussi (pas de 1 arbitraire)');
eq(stepLevelRange({ min: null, max: null }, 'max', 1, 3.17), { min: null, max: 3 }, 'ancrage arrondi au demi-point');
eq(stepLevelRange({ min: 3, max: null }, 'min', 1, 3), { min: 3.5, max: null }, 'pas de +0,5');
eq(stepLevelRange({ min: 3, max: null }, 'min', -1, 3), { min: 2.5, max: null }, 'pas de −0,5');
eq(stepLevelRange({ min: LEVEL_FLOOR, max: null }, 'min', -1, 3), { min: 1, max: null }, 'plancher : reste à 1');
eq(stepLevelRange({ min: null, max: LEVEL_CEIL }, 'max', 1, 3), { min: null, max: 7 }, 'plafond : reste à 7');
// Correction automatique de l'AUTRE borne (le geste demandé est toujours respecté).
eq(stepLevelRange({ min: 4, max: 4 }, 'min', 1, 3), { min: 4.5, max: 4.5 }, 'min qui dépasse max → max suit');
eq(stepLevelRange({ min: 4, max: 4 }, 'max', -1, 3), { min: 3.5, max: 3.5 }, 'max qui passe sous min → min suit');
eq(stepLevelRange({ min: 2, max: 5 }, 'max', -1, 3), { min: 2, max: 4.5 }, 'max au-dessus de min : aucune correction');
// Aucune séquence de pas ne produit une fourchette invalide (balayage exhaustif).
let sweep: { min: number | null; max: number | null } = { min: null, max: null };
let sweepOk = true;
for (const edge of ['min', 'max'] as const) {
  for (const dir of [1, -1] as const) {
    for (let i = 0; i < 40; i++) {
      sweep = stepLevelRange(sweep, edge, dir, 3.5);
      const bad =
        (sweep.min !== null && (sweep.min < LEVEL_FLOOR || sweep.min > LEVEL_CEIL)) ||
        (sweep.max !== null && (sweep.max < LEVEL_FLOOR || sweep.max > LEVEL_CEIL)) ||
        (sweep.min !== null && sweep.max !== null && sweep.min > sweep.max) ||
        (sweep.min !== null && Math.round(sweep.min * 2) !== sweep.min * 2);
      if (bad) sweepOk = false;
    }
  }
}
check(sweepOk, '160 pas enchaînés : fourchette toujours valide (bornes, ordre, demi-points)');

// ── levelInRange : miroir de la garde serveur ───────────────────────────────────
check(levelInRange(3, null, null), 'aucune borne → tout le monde entre');
check(levelInRange(2.5, 2.5, 4), 'borne basse INCLUSE');
check(levelInRange(4, 2.5, 4), 'borne haute INCLUSE');
check(!levelInRange(2.49, 2.5, 4), 'sous la borne basse → refusé');
check(!levelInRange(4.01, 2.5, 4), 'au-dessus de la borne haute → refusé');
check(levelInRange(7, 3, null), 'min seul : tout ce qui est au-dessus entre');
check(!levelInRange(2, 3, null), 'min seul : en dessous → refusé');
check(levelInRange(1, null, 4), 'max seul : tout ce qui est en dessous entre');
check(!levelInRange(5, null, 4), 'max seul : au-dessus → refusé');

// ── levelRangeText : libellés (virgule française, pas de zéro inutile) ──────────
eq(levelRangeText(null, null), '', 'ouverte à tous → libellé vide');
eq(levelRangeText(2.5, 4), '2,5 – 4', 'fourchette complète');
eq(levelRangeText(3, 3), '3', 'bornes égales → une seule valeur');
eq(levelRangeText(3, null), '3 et plus', 'min seul');
eq(levelRangeText(null, 4.5), '4,5 maximum', 'max seul');

if (failed) {
  console.error(`\n${failed} test(s) en échec`);
  process.exit(1);
}
console.log('\nTous les tests levelRange.ts passent.');
