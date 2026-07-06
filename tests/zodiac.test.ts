// Test de logique — date de naissance (masque, parsing UTC, signe astro, âge). Exécute les VRAIES
// fonctions source (src/lib/zodiac.ts, module PUR) : node --experimental-strip-types tests/zodiac.test.ts
// Une régression ici = mauvais âge/signe affiché, ou une date invalide acceptée à l'inscription.
// Tout est calculé en UTC FIXE (Abidjan = UTC) : le résultat ne doit pas dépendre du fuseau.

import { ageFrom, maskBirthDate, parseBirthDate, zodiacFor } from '../src/lib/zodiac.ts';

let failed = 0;
const eq = (a: unknown, b: unknown, msg: string) => {
  const ok = a === b;
  console.log(`${ok ? '✓' : `✗ ÉCHEC (${JSON.stringify(a)} ≠ ${JSON.stringify(b)})`} ${msg}`);
  if (!ok) failed++;
};

// ── Masque de saisie JJ/MM/AAAA : les « / » s'insèrent tout seuls, jamais au backspace ──
eq(maskBirthDate('0', ''), '0', 'Masque : premier chiffre');
eq(maskBirthDate('01', '0'), '01/', 'Masque : slash auto après le jour');
eq(maskBirthDate('0101', '010'), '01/01/', 'Masque : slash auto après le mois');
eq(maskBirthDate('01011999', '0101199'), '01/01/1999', 'Masque : date complète');
eq(maskBirthDate('01/', '01/0'), '01', 'Masque : backspace ne réinsère pas le slash');

// ── parseBirthDate : dates valides et refus des dates impossibles/hors bornes ──
const d = parseBirthDate('15/06/1990');
eq(d !== null && d.getUTCFullYear() === 1990 && d.getUTCMonth() === 5 && d.getUTCDate() === 15, true, 'Parse : 15/06/1990 en UTC');
eq(parseBirthDate('29/02/2001'), null, 'Parse : 29/02/2001 refusé (année non bissextile)');
eq(parseBirthDate('29/02/2000') !== null, true, 'Parse : 29/02/2000 accepté (bissextile)');
eq(parseBirthDate('31/13/2000'), null, 'Parse : mois 13 refusé');
eq(parseBirthDate('00/01/2000'), null, 'Parse : jour 0 refusé');
eq(parseBirthDate('01/01/1800'), null, 'Parse : avant 1920 refusé');
eq(parseBirthDate('01/01/2400'), null, 'Parse : date future refusée');
eq(parseBirthDate('pas une date'), null, 'Parse : texte libre refusé');

// ── zodiacFor : bornes exactes des signes (le jour de bascule compte) ──
const sign = (mo: number, day: number) => zodiacFor(new Date(Date.UTC(2000, mo - 1, day))).name;
eq(sign(1, 19), 'Capricorne', 'Signe : 19 janvier = Capricorne');
eq(sign(1, 20), 'Verseau', 'Signe : 20 janvier = Verseau (bascule)');
eq(sign(2, 18), 'Verseau', 'Signe : 18 février = Verseau');
eq(sign(2, 19), 'Poissons', 'Signe : 19 février = Poissons (bascule)');
eq(sign(6, 21), 'Cancer', 'Signe : 21 juin = Cancer');
eq(sign(12, 21), 'Sagittaire', 'Signe : 21 décembre = Sagittaire');
eq(sign(12, 22), 'Capricorne', 'Signe : 22 décembre = Capricorne (retour en fin d’année)');

// ── ageFrom : âge en années révolues (UTC), sans dépendre de l'heure locale ──
const now = new Date();
const bornExactly30 = new Date(Date.UTC(now.getUTCFullYear() - 30, now.getUTCMonth(), now.getUTCDate()));
eq(ageFrom(bornExactly30), 30, 'Âge : né il y a exactement 30 ans aujourd’hui → 30');
const bornTomorrow30 = new Date(Date.UTC(now.getUTCFullYear() - 30, now.getUTCMonth(), now.getUTCDate() + 1));
eq(ageFrom(bornTomorrow30), 29, 'Âge : anniversaire des 30 ans demain → encore 29');

if (failed) {
  console.error(`\n${failed} test(s) en échec`);
  process.exit(1);
}
console.log('\nTous les tests zodiac.ts passent.');
