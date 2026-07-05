// Test de logique — libellés d'affichage (format.ts). Exécute les VRAIES fonctions source :
// node --experimental-strip-types tests/format.test.ts
// pctLabel a déjà régressé une fois (imprécision flottante : 0.07*100 = 7.0000000000000001 →
// « 7,0 » au lieu de « 7 »). Ce taux part dans le décompte WhatsApp au club et l'export CSV.

import { fcfa, pctLabel } from '../src/lib/format.ts';

let failed = 0;
const eq = (a: unknown, b: unknown, msg: string) => {
  const ok = a === b;
  console.log(`${ok ? '✓' : `✗ ÉCHEC (${JSON.stringify(a)} ≠ ${JSON.stringify(b)})`} ${msg}`);
  if (!ok) failed++;
};

// Taux ENTIERS (les plus courants) → aucune décimale, malgré l'imprécision flottante.
eq(pctLabel(0.07), '7', '7 % → « 7 » (pas « 7,0 »)');
eq(pctLabel(0.1), '10', '10 %');
eq(pctLabel(0.14), '14', '14 % → « 14 » (imprécision flottante absorbée)');
eq(pctLabel(0.28), '28', '28 %');
eq(pctLabel(0.29), '29', '29 %');
eq(pctLabel(0.55), '55', '55 %');
eq(pctLabel(0), '0', '0 % → « 0 »');
eq(pctLabel(1), '100', '100 %');
// Taux non entiers → une décimale à la virgule.
eq(pctLabel(0.125), '12,5', '12,5 % → « 12,5 »');
eq(pctLabel(0.005), '0,5', '0,5 %');

// fcfa : espacement des milliers (espace insécable) + suffixe.
eq(fcfa(10000), '10 000 FCFA', 'fcfa milliers');
eq(fcfa(0), '0 FCFA', 'fcfa zéro');

if (failed) {
  console.error(`\n${failed} test(s) en échec`);
  process.exit(1);
}
console.log('\nTous les tests format.ts passent.');
