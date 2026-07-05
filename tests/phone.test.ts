// Test de logique — normalisation du numéro (identité de compte). Exécute la VRAIE fonction
// source (src/lib/phone.ts, module PUR) : node --experimental-strip-types tests/phone.test.ts
// Une régression ici = collision de comptes ou comptes fantômes (deux saisies du même numéro
// doivent tomber sur la MÊME forme canonique).

import { normalizePhone } from '../src/lib/phone.ts';

let failed = 0;
const eq = (a: unknown, b: unknown, msg: string) => {
  const ok = a === b;
  console.log(`${ok ? '✓' : `✗ ÉCHEC (${JSON.stringify(a)} ≠ ${JSON.stringify(b)})`} ${msg}`);
  if (!ok) failed++;
};

// Toutes les variantes d'un même mobile ivoirien → MÊME forme canonique « 225 + 10 chiffres ».
const CANON = '2250707070707';
eq(normalizePhone('0707070707'), CANON, 'Local 10 chiffres → 225 + numéro');
eq(normalizePhone('+225 07 07 07 07 07'), CANON, '+225 espacé → forme canonique');
eq(normalizePhone('00225 0707070707'), CANON, 'Préfixe international 00225 → forme canonique');
eq(normalizePhone('2250707070707'), CANON, 'Déjà 225 + 10 chiffres → inchangé');
eq(normalizePhone('07.07.07.07.07'), CANON, 'Séparateurs (points) ignorés');
eq(normalizePhone('  0707070707  '), CANON, 'Espaces de bord ignorés');

// Le 0 local ne doit JAMAIS être retiré (il porte le préfixe opérateur 07/05/01…).
eq(normalizePhone('0507070707'), '2250507070707', 'Préfixe 05 conservé');
eq(normalizePhone('0107070707'), '2250107070707', 'Préfixe 01 conservé');

// Deux numéros DIFFÉRENTS ne se confondent pas.
const ok1 = normalizePhone('0707070707') !== normalizePhone('0707070708');
console.log(`${ok1 ? '✓' : '✗ ÉCHEC'} Deux numéros distincts → deux formes distinctes`);
if (!ok1) failed++;

// Numéro étranger (autre indicatif) : laissé tel quel, jamais transformé en numéro ivoirien.
eq(normalizePhone('+33 6 12 34 56 78'), '33612345678', 'Numéro français → chiffres bruts, pas de préfixe 225');
eq(normalizePhone('12345'), '12345', 'Format inhabituel (trop court) → laissé tel quel');
eq(normalizePhone(''), '', 'Chaîne vide → vide');

if (failed) {
  console.error(`\n${failed} test(s) en échec`);
  process.exit(1);
}
console.log('\nTous les tests phone.ts passent.');
