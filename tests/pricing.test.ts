// Test de logique — tarifs par plage horaire (v4.5).
// Exécute les VRAIES fonctions source (src/lib/pricing.ts, src/lib/format.ts) :
//   node --experimental-strip-types tests/pricing.test.ts
// (les imports de types de pricing.ts sont effacés à l'exécution — aucun double).

import { commissionOf, groupTiersByLabel, minPrice, price60Of, priceForSlot, priceTiersFor, validateTiers } from '../src/lib/pricing.ts';
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
// Hors plages (ex. 06:00 si le club ouvre tôt) → repli sur la plage la plus PROCHE (07:00 → creuses).
check(priceForSlot(padelta, '06:00') === 10000, 'Créneau hors plages (06:00) → plage la plus proche (heures creuses)');
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
check(commissionOf(30000, 0.1) === 3000, 'Commission 10 % sur une résa 18:00 Padelta → 3 000');

// ——— Commission d'une unité de facturation (club × semaine) — R-66 ———
// UN seul arrondi sur le volume du club (jamais un arrondi par résa) : 2 × 1 050 à 7 % = 147,
// pas round(73,5) + round(73,5) = 148 (l'écart que l'opérateur voyait entre deux écrans).
check(commissionOf(2 * 1050, 0.07) === 147, '2 × 1 050 à 7 % → 147 (un arrondi sur le volume, pas 148)');
check(Math.round(1050 * 0.07) * 2 === 148, 'Contre-épreuve : arrondi par résa → 148 (le défaut corrigé)');
check(commissionOf(45000, 0.1) === 4500, '3 × 15 000 à 10 % → 4 500');
check(commissionOf(0, 0.1) === 0, 'Aucune partie → 0');
check(commissionOf(12000, 0) === 0, 'Taux 0 % → 0');
// Imprécision flottante absorbée : 1 350 × 0,35 = 472,49999999999994 en double → 473 (472,5 exact).
check(1350 * 0.35 < 472.5, 'Contre-épreuve : 1 350 × 0,35 tombe SOUS 472,5 en flottant');
check(commissionOf(1350, 0.35) === 473, '1 350 à 35 % → 473 (472,5 arrondi au franc supérieur, flottant absorbé)');
check(commissionOf(12350, 0.07) === 865, '12 350 à 7 % → 865 (864,5 arrondi)');

// ——— Validation des plages à l'enregistrement (v4.5.2, fonction pure) ———
const tier = (start: string, end: string, price = 10000) => ({ start, end, price });

// Aucune plage → tarif unique, toujours valide (rétro-compatibilité).
check(validateTiers([]).ok === true, 'Aucune plage → valide (tarif unique)');

// Couverture exacte 07:00 → 24:00 en continu → OK (ordre d'entrée quelconque).
check(
  validateTiers([tier('16:00', '20:30'), tier('07:00', '16:00'), tier('20:30', '24:00')]).ok === true,
  'Couverture 07:00→24:00 continue (désordonnée) → OK',
);
check(validateTiers([tier('07:00', '24:00')]).ok === true, 'Une seule plage 07:00→24:00 → OK');

// Trou → erreur, message désignant le trou exact.
const gap = validateTiers([tier('07:00', '16:00'), tier('17:00', '24:00')]);
check(
  gap.ok === false && /Trou entre 16:00 et 17:00/.test((gap as { error: string }).error),
  'Trou 16:00–17:00 → bloqué avec message précis',
);

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

// price60 (prix 1h) : optionnel, mêmes bornes, et JAMAIS supérieur au prix 1h30 (cohérence éco).
check(validateTiers([{ start: '07:00', end: '24:00', price: 15000, price60: 10000 }]).ok === true, 'price60 ≤ price → OK');
check(
  validateTiers([{ start: '07:00', end: '24:00', price: 15000, price60: 20000 }]).ok === false,
  'price60 > price (1h plus cher que 1h30) → bloqué',
);
check(validateTiers([{ start: '07:00', end: '24:00', price: 15000, price60: 500 }]).ok === false, 'price60 sous PRICE_MIN → bloqué');

// ——— Bornes dynamiques : la couverture suit les HEURES D'OUVERTURE du club (chaque club
// ouvre à son heure). Un club 08:00→23:00 valide 08:00→23:00, et REFUSE le 07:00→24:00 forcé. ———
check(validateTiers([tier('08:00', '23:00')], 8 * 60, 23 * 60).ok === true, 'Club 08:00→23:00 : plage unique couvrant l’amplitude → OK');
check(
  validateTiers([tier('08:00', '16:00'), tier('16:00', '23:00')], 8 * 60, 23 * 60).ok === true,
  'Club 08:00→23:00 : deux plages jointes → OK',
);
// Une plage ENGLOBANTE (plus large que l'amplitude) est acceptée : les configs héritées
// (07:00→24:00 d'avant les horaires modulables) restent enregistrables telles quelles.
check(
  validateTiers([tier('07:00', '24:00')], 8 * 60, 23 * 60).ok === true,
  'Club 08:00→23:00 : plage englobante 07:00→24:00 → OK (héritage accepté)',
);
check(
  validateTiers([tier('09:00', '23:00')], 8 * 60, 23 * 60).ok === false,
  'Club 08:00→23:00 : première plage commence après l’ouverture → bloqué',
);
check(
  validateTiers([tier('08:00', '22:00')], 8 * 60, 23 * 60).ok === false,
  'Club 08:00→23:00 : dernière plage finit avant 23:00 → bloqué',
);
// Rétro-compat : sans bornes fournies, on garde 07:00 → 24:00.
check(validateTiers([tier('07:00', '24:00')]).ok === true, 'Sans bornes → défaut 07:00→24:00 (rétro-compat)');
// Grille libre : un horaire ajouté HORS de la couverture des plages est vendu au prix de la plage
// la plus PROCHE (repli priceForSlot, R-67) — d'où l'avertissement à l'ajout — et re-valider des
// plages inchangées contre l'amplitude ÉLARGIE échouerait : ClubInfoCard ne re-valide que des
// plages MODIFIÉES.
const widened = {
  priceFrom: 12000,
  priceTiers: [tier('08:00', '16:00'), tier('16:00', '23:00', 30000)],
} as Parameters<typeof priceForSlot>[0];
check(priceForSlot(widened, '06:30') === 10000, 'Créneau libre avant les plages (06:30) → plage 08:00–16:00 (la plus proche)');
// R-67 : une heure tardive ajoutée APRÈS la dernière plage (chère) n'est plus bradée au minimum.
check(priceForSlot(widened, '23:00') === 30000, 'Créneau 23:00 après la dernière plage → 30 000 (plus proche), pas le minimum 10 000');
check(priceForSlot(widened, '23:30', 60) === 20000, 'Créneau 1h 23:30 hors plages → prix 1h de la plage la plus proche (⅔ de 30 000)');
// Trou entre deux plages (grille libre) : la plus proche gagne ; à égalité, celle qui PRÉCÈDE.
const holed = {
  priceFrom: 12000,
  priceTiers: [tier('08:00', '12:00', 10000), tier('14:00', '23:00', 30000)],
} as Parameters<typeof priceForSlot>[0];
check(priceForSlot(holed, '12:30') === 10000, 'Trou 12:00–14:00, créneau 12:30 → plage qui vient de finir (10 000)');
check(priceForSlot(holed, '13:30') === 30000, 'Trou 12:00–14:00, créneau 13:30 → plage qui commence à 14:00 (30 000)');
check(priceForSlot(holed, '13:00') === 10000, 'Trou 12:00–14:00, créneau 13:00 (équidistant) → plage qui précède (10 000)');
// Heure illisible → ceinture de sécurité inchangée : prix minimum.
check(priceForSlot(holed, 'xx') === 10000, 'Heure invalide → repli prix minimum (ceinture de sécurité)');
check(
  validateTiers([tier('08:00', '16:00'), tier('16:00', '23:00')], 6 * 60 + 30, 23 * 60).ok === false,
  'Amplitude élargie (06:30) + plages inchangées → validation en échec (d’où la re-validation UNIQUEMENT si modifiées)',
);

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
check(
  groupTiersByLabel([lt('07:00', '16:00', 'Journée'), lt('16:00', '24:00')]).length === 0,
  'Une plage sans nom → pas d’onglets (liste à plat)',
);

// Toutes le même nom → un seul onglet inutile → liste à plat.
check(
  groupTiersByLabel([lt('07:00', '16:00', 'Tarif'), lt('16:00', '24:00', 'Tarif')]).length === 0,
  'Un seul nom distinct → pas d’onglets',
);

// Deux plages partageant un nom + une troisième distincte → 2 onglets, le 1er a 2 lignes.
const shared = groupTiersByLabel([lt('07:00', '12:00', 'Journée'), lt('12:00', '16:00', 'Journée'), lt('16:00', '24:00', 'Soirée')]);
check(shared.length === 2, 'Deux plages même nom + une autre → 2 onglets');
check(shared[0].label === 'Journée' && shared[0].items.length === 2, 'Onglet « Journée » regroupe ses 2 plages');

// Aucune plage → aucun onglet.
check(groupTiersByLabel([]).length === 0, 'Aucune plage → aucun onglet');

// ——— Deux prix par plage (1h / 1h30) — modularité des durées ———
// price60 saisi : utilisé tel quel ; absent : dérivé au prorata (⅔ arrondi à la centaine) et borné au plancher (1000).
const twoPrice = {
  priceFrom: 10000,
  priceTiers: [
    { start: '08:00', end: '16:00', price: 9000, price60: 6000, label: 'Journée' },
    { start: '16:00', end: '22:00', price: 12000, label: 'Soirée' }, // pas de price60 → dérivé
  ],
} as Parameters<typeof priceForSlot>[0];
check(priceForSlot(twoPrice, '09:00', 90) === 9000, 'Plage journée · 1h30 → 9 000');
check(priceForSlot(twoPrice, '09:00', 60) === 6000, 'Plage journée · 1h → 6 000 (price60 saisi)');
check(priceForSlot(twoPrice, '17:00', 90) === 12000, 'Plage soirée · 1h30 → 12 000');
check(priceForSlot(twoPrice, '17:00', 60) === 8000, 'Plage soirée · 1h → 8 000 (dérivé ⅔ de 12 000)');
check(priceForSlot(twoPrice, '09:00') === 9000, 'Défaut sans durée = 1h30 (rétro-compat) → 9 000');
// price60Of : dérivation + plancher.
check(price60Of({ start: '', end: '', price: 12000 }) === 8000, 'price60Of(12000) = 8000');
check(price60Of({ start: '', end: '', price: 1200 }) === 1000, 'price60Of(1200) planché à 1000 (pas 800)');
check(price60Of({ start: '', end: '', price: 9000, price60: 5000 }) === 5000, 'price60Of respecte price60 saisi');
// T-10 (décision porteur n° 12) : le ⅔ DÉRIVÉ est arrondi à la CENTAINE — jamais « 16 667 FCFA ».
check(price60Of({ start: '', end: '', price: 25000 }) === 16700, 'price60Of(25000) = 16 700 (⅔ = 16 666,67, arrondi à la centaine)');
check(price60Of({ start: '', end: '', price: 10000 }) === 6700, 'price60Of(10000) = 6 700 (et non 6 667)');
check(price60Of({ start: '', end: '', price: 14000 }) === 9300, 'price60Of(14000) = 9 300 (9 333,33 arrondi à la centaine inférieure)');
check(price60Of({ start: '', end: '', price: 1575 }) === 1100, 'price60Of(1575) = 1 100 (1 050 pile → centaine supérieure)');
check(price60Of({ start: '', end: '', price: 1600 }) === 1100, 'price60Of(1600) = 1 100 (1 066,67, au-dessus du plancher)');
check(price60Of({ start: '', end: '', price: 25000, price60: 16650 }) === 16650, 'price60 SAISI jamais arrondi (16 650 reste 16 650)');
// Invariants sur toute la plage de prix saisissables : centaine ronde (ou plancher), à ±50 du ⅔
// exact, jamais au-dessus du prix 1h30 (validateTiers l'exige d'un prix 1h SAISI).
let derivedBad = 0;
for (let p = 1000; p <= 1000000; p += 7) {
  const d = price60Of({ start: '', end: '', price: p });
  if (d % 100 !== 0 || d > p || (d !== 1000 && Math.abs(d - (p * 2) / 3) > 50)) derivedBad++;
}
check(derivedBad === 0, 'Prix 1h dérivé : centaine ronde, ±50 du ⅔, ≤ prix 1h30 (1 000 → 1 000 000 FCFA)');
// minPrice ne compte QUE les durées offertes.
check(minPrice(twoPrice, new Set([90])) === 9000, 'minPrice {90} = min des 1h30 (9 000)');
check(minPrice(twoPrice, new Set([60, 90])) === 6000, 'minPrice {60,90} = 6 000 (le 1h le moins cher)');
check(minPrice(twoPrice) === 9000, 'minPrice défaut {90} → 9 000 (jamais un « dès 1h » non offert)');
// Club sans plage : le 1h dérive du tarif unique, MÊME arrondi à la centaine (T-10).
check(priceForSlot(simple, '18:00', 60) === 9300, 'Club sans plage · 1h = ⅔ du tarif unique arrondi à la centaine (9 300)');
check(
  minPrice({ priceFrom: 25000 } as Parameters<typeof minPrice>[0], new Set([60])) === 16700,
  'Club sans plage, 1h seul · « dès » 16 700',
);
// validateTiers : price60 hors bornes refusé, absent accepté.
check(validateTiers([{ start: '07:00', end: '24:00', price: 9000, price60: 500 }]).ok === false, 'price60 < 1000 → bloqué');
check(validateTiers([{ start: '07:00', end: '24:00', price: 9000, price60: 6000 }]).ok === true, 'price60 valide → OK');
check(validateTiers([{ start: '07:00', end: '24:00', price: 9000 }]).ok === true, 'price60 absent (optionnel) → OK');

console.log(failed === 0 ? '\nTOUS LES TESTS TARIFS PASSENT.' : `\n${failed} test(s) tarifs en échec.`);
if (failed > 0) process.exitCode = 1;
