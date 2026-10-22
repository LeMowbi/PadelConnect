// Test de logique — pile des surfaces de toast (src/lib/toastStack.ts) :
//   node --experimental-strip-types tests/toastStack.test.ts
// Trois invariants comptent : (1) le message est dessiné sur UNE seule surface, la plus haute
// (dernière enregistrée encore active) — jamais sous une feuille où personne ne le voit ;
// (2) une feuille qui commence à se fermer rend la main à la surface d'en dessous (ou à la
// racine), même si elle n'était pas la plus haute ; (3) un double enregistrement (effet rejoué
// en mode strict) ne duplique jamais une surface ni ne la fait remonter.

import { pushSurface, removeSurface, topSurface } from '../src/lib/toastStack.ts';

let failed = 0;
const eq = (a: unknown, b: unknown, msg: string) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  console.log(`${ok ? '✓' : `✗ ÉCHEC (${JSON.stringify(a)} ≠ ${JSON.stringify(b)})`} ${msg}`);
  if (!ok) failed++;
};

// ── Racine seule ────────────────────────────────────────────────────────────────
eq(topSurface([]), null, 'pile vide : la racine dessine le message');

// ── Empilement : la dernière feuille ouverte est la plus haute ──────────────────
const one = pushSurface([], 'feuille');
eq(one, ['feuille'], 'une feuille ouverte s’empile');
eq(topSurface(one), 'feuille', 'la feuille ouverte dessine le message');
const two = pushSurface(one, 'confirmation');
eq(topSurface(two), 'confirmation', 'la surface ouverte en dernier est la plus haute');
eq(pushSurface(two, 'feuille'), two, 'ré-enregistrement idempotent : pas de doublon, pas de remontée');

// ── Fermeture : retour à la surface d'en dessous ────────────────────────────────
eq(topSurface(removeSurface(two, 'confirmation')), 'feuille', 'la plus haute se ferme → celle d’en dessous reprend');
eq(removeSurface(two, 'feuille'), ['confirmation'], 'une surface du milieu se ferme → la plus haute reste en tête');
eq(topSurface(removeSurface(one, 'feuille')), null, 'dernière feuille fermée → retour à la racine');
eq(removeSurface(one, 'inconnue'), one, 'retrait d’une surface absente : sans effet');

// ── Immuabilité (état React) ────────────────────────────────────────────────────
const base: readonly string[] = ['a'];
pushSurface(base, 'b');
removeSurface(base, 'a');
eq(base, ['a'], 'les opérations ne modifient jamais la pile reçue');

if (failed) {
  console.error(`\n${failed} test(s) en échec`);
  process.exit(1);
}
console.log('\nTous les tests toastStack.ts passent.');
