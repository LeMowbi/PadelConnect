// Test de logique — sélecteur de jours (régression A du patch v4.4.1).
// Exécute la VRAIE fonction source `nextDays` (src/lib/days.ts) ; aucun double.
//   node --experimental-strip-types tests/days.test.ts
//
// Contexte : un audit avait cru que « Samedi 13 » disparaissait des chips. En réalité,
// le jour J+1 porte le libellé « Demain » : quand on est un vendredi, le samedi suivant
// EST présent, simplement étiqueté « Demain » (et non « Samedi 13 »). La liste produit
// toujours n jours consécutifs sans trou — ce test le verrouille.

import { dayKey, nextDays, recurringDates, weekKeyOf } from '../src/lib/days.ts';

let failed = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? '✓' : '✗ ÉCHEC'} ${msg}`);
  if (!cond) failed++;
};

const dayDiff = (a: string, b: string) => (new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86400000;

function isConsecutive(keys: string[]): boolean {
  for (let i = 1; i < keys.length; i++) if (dayDiff(keys[i - 1], keys[i]) !== 1) return false;
  return true;
}

// 1) 7 jours consécutifs sans trou, sur 7 dates de départ variées (jours de semaine
//    différents + bascules de mois et d'année).
const starts = [
  new Date(2026, 5, 11, 23, 40), // jeudi (scénario de l'audit)
  new Date(2026, 5, 12, 9, 0), // vendredi (date « réelle » du test)
  new Date(2026, 5, 30, 23, 40), // 30 juin → bascule de mois
  new Date(2026, 1, 26, 23, 59), // février
  new Date(2026, 11, 29, 23, 40), // 29 déc → bascule d'année
  new Date(2026, 2, 1, 0, 1), // 1er mars
  new Date(2026, 9, 31, 23, 40), // 31 oct
];
for (const s of starts) {
  const keys = nextDays(7, s).map((d) => d.key);
  check(keys.length === 7 && isConsecutive(keys), `7 jours consécutifs depuis ${keys[0]} → ${keys[keys.length - 1]}`);
}

// 2) Scénario audit, jeudi 11 juin : J+2 apparaît bien étiqueté « Samedi 13 ».
const jeudi = nextDays(7, new Date(2026, 5, 11, 23, 40));
check(jeudi[2].label === 'Samedi 13' && jeudi[2].key === '2026-06-13', 'Jeudi 11 → J+2 = « Samedi 13 » (2026-06-13)');

// 3) Vendredi 12 juin : le samedi 13 n'a PAS disparu — c'est le chip « Demain 13 » (J+1).
const vendredi = nextDays(7, new Date(2026, 5, 12, 9, 0));
check(vendredi[1].label === 'Demain 13' && vendredi[1].key === '2026-06-13', 'Vendredi 12 → samedi 13 présent comme « Demain 13 » (J+1)');
check(
  vendredi.some((d) => d.key === '2026-06-13'),
  'Vendredi 12 → 2026-06-13 bien dans la liste (non manquant)',
);

// 4) v4.4.2 : les libellés relatifs portent le NUMÉRO du jour (anti-ambiguïté le soir).
check(vendredi[0].label === 'Aujourd’hui 12', 'Vendredi 12 → chip 0 = « Aujourd’hui 12 »');
check(jeudi[0].label === 'Aujourd’hui 11' && jeudi[1].label === 'Demain 12', 'Jeudi 11 → « Aujourd’hui 11 » · « Demain 12 »');
// Fin de mois : le numéro suit le calendrier (30 juin → « Demain 1 »).
const finJuin = nextDays(7, new Date(2026, 5, 30, 23, 40));
check(
  finJuin[0].label === 'Aujourd’hui 30' && finJuin[1].label === 'Demain 1',
  '30 juin → « Aujourd’hui 30 » · « Demain 1 » (bascule de mois)',
);

// 5) dateKey en UTC FIXE (getUTC*) : le jour ne dépend PAS du fuseau de l'appareil — une résa
//    conserve le même dateKey partout. Les tests tournent sous TZ=UTC (cf. script test:logic),
//    donc le constructeur Date local ci-dessous coïncide avec l'heure UTC attendue.
check(dayKey(new Date(2026, 5, 12, 23, 0)) === '2026-06-12', 'dayKey(12 juin 23h UTC) = 2026-06-12 (jour stable, indépendant du fuseau)');
check(dayKey(new Date(2026, 5, 12, 0, 0)) === '2026-06-12', 'dayKey(12 juin 00h UTC) = 2026-06-12');

// 6) Semaine calendaire lundi → dimanche : bornes exactes (base de la facturation).
check(weekKeyOf(new Date(2026, 5, 14, 23, 59).getTime()) === '2026-06-08', 'Dimanche 14 juin 23:59 → semaine du lundi 8 juin');
check(weekKeyOf(new Date(2026, 5, 15, 0, 0).getTime()) === '2026-06-15', 'Lundi 15 juin 00:00 → semaine du lundi 15 juin');
check(weekKeyOf(new Date(2026, 5, 8, 0, 0).getTime()) === '2026-06-08', 'Lundi 8 juin 00:00 → sa propre semaine');
check(weekKeyOf(new Date(2026, 6, 1, 12, 0).getTime()) === '2026-06-29', 'Mercredi 1ᵉʳ juillet → semaine à cheval du lundi 29 juin');

// 7) recurringDates (83) : N occurrences du MÊME jour de semaine, première date incluse,
//    bascules de mois/année propres, bornes [1, 26], format invalide → [].
const rec = recurringDates('2026-08-20', 4); // un jeudi
check(
  rec.length === 4 && rec[0] === '2026-08-20' && rec[1] === '2026-08-27' && rec[2] === '2026-09-03' && rec[3] === '2026-09-10',
  'recurringDates : 4 jeudis consécutifs, bascule de mois comprise',
);
check(
  rec.every((k, i) => i === 0 || dayDiff(rec[i - 1], k) === 7),
  'recurringDates : exactement 7 jours entre chaque occurrence',
);
const recYear = recurringDates('2026-12-24', 3);
check(recYear[2] === '2027-01-07', 'recurringDates : bascule d\u2019ann\u00e9e propre (24 d\u00e9c \u2192 7 janv)');
check(
  recurringDates('2026-08-20', 99).length === 26 && recurringDates('2026-08-20', 0).length === 1,
  'recurringDates : weeks born\u00e9 [1, 26]',
);
check(recurringDates('pas-une-date', 4).length === 0, 'recurringDates : format invalide \u2192 []');

console.log(failed === 0 ? '\nTOUS LES TESTS JOURS PASSENT.' : `\n${failed} test(s) jours en échec.`);
if (failed > 0) process.exitCode = 1;
