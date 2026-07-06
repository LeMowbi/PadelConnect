// Test de logique — libellés d'affichage (format.ts). Exécute les VRAIES fonctions source :
// node --experimental-strip-types tests/format.test.ts
// pctLabel a déjà régressé une fois (imprécision flottante : 0.07*100 = 7.0000000000000001 →
// « 7,0 » au lieu de « 7 »). Ce taux part dans le décompte WhatsApp au club et l'export CSV.

import { fcfa, pctLabel, perPlayerOf } from '../src/lib/format.ts';

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

// perPlayerOf : part par joueur sur l'EFFECTIF RÉEL (2 = 1v1, 4 = 2v2), arrondie à la centaine.
// Porte TOUTE la propagation de capacité 1v1/2v2 : une régression (retour à un ÷4 en dur) fausserait
// silencieusement le montant affiché ET les messages WhatsApp aux partenaires.
eq(perPlayerOf(30000, 2), '15 000 FCFA', '1v1 → moitié du terrain');
eq(perPlayerOf(30000, 4), '7 500 FCFA', '2v2 → quart (arrondi centaine)');
eq(perPlayerOf(30000, 3), '10 000 FCFA', '3 joueurs → tiers (10 000)');
eq(perPlayerOf(10000, 2), '5 000 FCFA', '1v1 à 10 000');
eq(perPlayerOf(10000, 4), '2 500 FCFA', '2v2 à 10 000');
eq(perPlayerOf(30000, 1), '30 000 FCFA', 'borne : 1 joueur → prix entier');
eq(perPlayerOf(30000, 0), '30 000 FCFA', 'borne Math.max(1,…) : jamais de division par zéro');
eq(perPlayerOf(0, 2), '0 FCFA', 'prix 0 → 0');

if (failed) {
  console.error(`\n${failed} test(s) en échec`);
  process.exit(1);
}
console.log('\nTous les tests format.ts passent.');
