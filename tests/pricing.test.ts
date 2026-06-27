// Test de logique — tarifs par plage horaire (v4.5).
// Exécute les VRAIES fonctions source (src/lib/pricing.ts, src/lib/format.ts) :
//   node --experimental-strip-types tests/pricing.test.ts
// (les imports de types de pricing.ts sont effacés à l'exécution — aucun double).

import { groupTiersByLabel, minPrice, priceForSlot, priceTiersFor, validateTiers } from '../src/lib/pricing.ts';
import { perPlayer } from '../src/lib/format.ts';

let failed = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? '✓' : '✗ ÉCHEC'} ${msg}`);
  if (!cond) failed++;
};

// Club façon Padelta : 3 plages réelles (creuses / prime time / soirée) — mêmes
// valeurs que le seed (la cohérence seed ↔ ce miroir est vérifiée par seeds.test.mjs).
const padelta = {
  priceFrom: 10000,
  priceTiers: [
    { start: '07:00', end: '16:00', price: 10000 },
    { start: '16:00', end: '20:30', price: 30000 },
    { start: '20:30', end: '24:00', price: 15000 },
  ],
} as Parameters<typeof priceForSlot>[0];

check(priceForSlot(padelta, '10:30') === 10000, 'Padelta 10:30 → 10 000 (heures creuses)');
check(priceForSlot(padelta, '18:00') === 30000, 'Padelta 18:00 → 30 000 (prime time)');
check(priceForSlot(padelta, '21:00') === 15000, 'Padelta 21:00 → 15 000 (soirée)');
// BORNES : début de plage INCLUS, fin EXCLUSIVE.
check(priceForSlot(padelta, '07:00') === 10000, 'Borne 07:00 pile → heures creuses (début inclus)');
check(priceForSlot(padelta, '16:00') === 30000, 'Borne 16:00 pile → prime time (frontière creuse/prime)');
check(priceForSlot(padelta, '20:30') === 15000, 'Borne 20:30 pile → soirée (frontière prime/soirée)');
check(priceForSlot(padelta, '23:59') === 15000, 'Borne 23:59 → soirée (plage jusqu’à 24:00 exclu)');
// Hors plages (ex. 06:00 si le club ouvre tôt) → repli sur le MIN des plages (choix assumé).
check(priceForSlot(padelta, '06:00') === 10000, 'Créneau hors plages (06:00) → repli prix minimum');
check(priceForSlot(padelta, '07:30') === 10000, 'Padelta 07:30 → 10 000');
check(minPrice(padelta) === 10000, 'Fiche « dès » = min des plages (10 000)');

// Rétro-compatibilité : club SANS plages → tarif unique partout.
const simple = { priceFrom: 14000 } as Parameters<typeof priceForSlot>[0];
check(priceForSlot(simple, '18:00') === 14000, 'Club sans plages : 18:00 → tarif unique 14 000');
check(minPrice(simple) === 14000, 'Club sans plages : « dès » = tarif unique');
check(priceTiersFor(simple).length === 0, 'Club sans plages : aucune plage');

// Plages invalides (prix 0 / bornes vides) ignorées → retour au tarif unique.
const broken = {
  priceFrom: 12000,
  priceTiers: [
    { start: '', end: '16:00', price: 9000 },
    { start: '16:00', end: '20:00', price: 0 },
  ],
} as Parameters<typeof priceForSlot>[0];
check(priceForSlot(broken, '18:00') === 12000, 'Plages invalides ignorées → tarif unique');

// Répartition & commission sur le prix RÉEL (tests 2 et 5 de la mission).
check(perPlayer(30000) === '7 500 FCFA', 'Part par joueur à 30 000 → « 7 500 FCFA » (message partenaires)');
check(perPlayer(10000) === '2 500 FCFA', 'Part par joueur à 10 000 → « 2 500 FCFA »');
check(Math.round(30000 * 0.1) === 3000, 'Commission 10 % sur une résa 18:00 Padelta → 3 000');

// ——— Validation des plages à l'enregistrement (v4.5.2, fonction pure) ———
const tier = (start: string, end: string, price = 10000) => ({ start, end, price });

// Aucune plage → tarif unique, toujours valide (rétro-compatibilité).
check(validateTiers([]).ok === true, 'Aucune plage → valide (tarif unique)');

// Couverture exacte 07:00 → 24:00 en continu → OK (ordre d'entrée quelconque).
check(validateTiers([tier('16:00', '20:30'), tier('07:00', '16:00'), tier('20:30', '24:00')]).ok === true, 'Couverture 07:00→24:00 continue (désordonnée) → OK');
check(validateTiers([tier('07:00', '24:00')]).ok === true, 'Une seule plage 07:00→24:00 → OK');

// Trou → erreur, message désignant le trou exact.
const gap = validateTiers([tier('07:00', '16:00'), tier('17:00', '24:00')]);
check(gap.ok === false && /Trou entre 16:00 et 17:00/.test((gap as { error: string }).error), 'Trou 16:00–17:00 → bloqué avec message précis');

// Chevauchement → erreur.
const ov = validateTiers([tier('07:00', '20:30'), tier('19:00', '24:00')]);
check(ov.ok === false && /chevauchent/.test((ov as { error: string }).error), 'Chevauchement 19:00 dans 07:00–20:30 → bloqué');

// Bornes : ne commence pas à 07:00 / ne finit pas à 24:00.
check(validateTiers([tier('08:00', '24:00')]).ok === false, 'Début ≠ 07:00 → bloqué');
check(validateTiers([tier('07:00', '22:00')]).ok === false, 'Fin ≠ 24:00 → bloqué');

// Bornes 07:00 et 24:00 PILE acceptées.
check(validateTiers([tier('07:00', '12:00'), tier('12:00', '24:00')]).ok === true, 'Bornes 07:00 et 24:00 pile, jointure 12:00 → OK');

// Plage incohérente (début ≥ fin) et format invalide → erreur.
check(validateTiers([tier('16:00', '07:00')]).ok === false, 'Début après fin → bloqué');
check(validateTiers([tier('7h', '24:00')]).ok === false, 'Format heure invalide → bloqué');

// L'état n'est PAS modifié quand la validation échoue (miroir de ClubInfoCard.save).
let savedPatch: unknown = null;
const fakeSave = (built: ReturnType<typeof tier>[]) => {
  const v = validateTiers(built);
  if (!v.ok) return; // on n'appelle pas onSave → store intact
  savedPatch = built;
};
fakeSave([tier('07:00', '16:00'), tier('17:00', '24:00')]); // trou
check(savedPatch === null, 'Validation en échec → onSave NON appelé (état du club intact)');
fakeSave([tier('07:00', '24:00')]); // valide
check(savedPatch !== null, 'Validation OK → onSave appelé');

// ——— groupTiersByLabel : regroupement d'affichage par plage nommée (fiche club) ———
type Tier = Parameters<typeof groupTiersByLabel>[0][number];
const lt = (start: string, end: string, label?: string): Tier => ({ start, end, price: 10000, label });

// Toutes nommées, 3 noms distincts → 3 onglets dans l'ordre d'origine.
const named = groupTiersByLabel([lt('07:00', '16:00', 'Journée'), lt('16:00', '20:30', 'Soirée'), lt('20:30', '24:00', 'Fin de soirée')]);
check(named.length === 3, 'Plages nommées (3 noms distincts) → 3 onglets');
check(named.map((g) => g.label).join('|') === 'Journée|Soirée|Fin de soirée', 'Onglets dans l’ordre d’origine');
check(named[1].items.length === 1 && named[1].items[0].start === '16:00', 'Onglet « Soirée » contient la bonne plage');

// Une plage sans nom → pas d'onglets (liste à plat, rétro-compatible).
check(groupTiersByLabel([lt('07:00', '16:00', 'Journée'), lt('16:00', '24:00')]).length === 0, 'Une plage sans nom → pas d’onglets (liste à plat)');

// Toutes le même nom → un seul onglet inutile → liste à plat.
check(groupTiersByLabel([lt('07:00', '16:00', 'Tarif'), lt('16:00', '24:00', 'Tarif')]).length === 0, 'Un seul nom distinct → pas d’onglets');

// Deux plages partageant un nom + une troisième distincte → 2 onglets, le 1er a 2 lignes.
const shared = groupTiersByLabel([lt('07:00', '12:00', 'Journée'), lt('12:00', '16:00', 'Journée'), lt('16:00', '24:00', 'Soirée')]);
check(shared.length === 2, 'Deux plages même nom + une autre → 2 onglets');
check(shared[0].label === 'Journée' && shared[0].items.length === 2, 'Onglet « Journée » regroupe ses 2 plages');

// Aucune plage → aucun onglet.
check(groupTiersByLabel([]).length === 0, 'Aucune plage → aucun onglet');

console.log(failed === 0 ? '\nTOUS LES TESTS TARIFS PASSENT.' : `\n${failed} test(s) tarifs en échec.`);
if (failed > 0) process.exitCode = 1;
