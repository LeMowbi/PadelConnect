// Test de logique — fermetures sur PÉRIODE (54) : le prédicat `rangeBlocks` décide si une
// période fermée couvre (jour, heure, terrain). Exécute la VRAIE fonction source :
//   node --experimental-strip-types tests/ranges.test.ts

import { rangeBlocks, type BlockedRange } from '../src/lib/ranges.ts';

let failed = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? '✓' : '✗ ÉCHEC'} ${msg}`);
  if (!cond) failed++;
};

const base: BlockedRange = {
  id: 'r1',
  clubId: 'padelta',
  court: 'Terrain 2',
  dateFrom: '2026-07-10',
  dateTo: '2026-07-24',
  times: null,
  reason: 'travaux',
};

// Terrain précis, toute la journée.
check(rangeBlocks(base, '2026-07-15', '09:30', 'Terrain 2'), 'Jour dans la période + bon terrain → bloqué');
check(rangeBlocks(base, '2026-07-10', '05:00', 'Terrain 2'), 'Borne de DÉBUT incluse');
check(rangeBlocks(base, '2026-07-24', '22:30', 'Terrain 2'), 'Borne de FIN incluse');
check(!rangeBlocks(base, '2026-07-09', '09:30', 'Terrain 2'), 'Veille du début → libre');
check(!rangeBlocks(base, '2026-07-25', '09:30', 'Terrain 2'), 'Lendemain de la fin → libre');
check(!rangeBlocks(base, '2026-07-15', '09:30', 'Terrain 1'), 'Autre terrain → libre (fermeture ciblée)');

// Tout le club (court: null).
const wholeClub: BlockedRange = { ...base, court: null };
check(rangeBlocks(wholeClub, '2026-07-15', '09:30', 'Terrain 1'), 'court=null : TOUS les terrains bloqués');
check(rangeBlocks(wholeClub, '2026-07-15', '09:30', 'Terrain 4'), 'court=null : même un terrain ajouté ensuite');

// Heures ciblées (times non nul) : seules CES heures sont fermées.
const evenings: BlockedRange = { ...base, times: ['18:00', '19:30'] };
check(rangeBlocks(evenings, '2026-07-15', '18:00', 'Terrain 2'), 'Heure listée → bloqué');
check(!rangeBlocks(evenings, '2026-07-15', '09:30', 'Terrain 2'), 'Heure non listée → libre (le matin reste réservable)');

// Créneaux à DURÉE VARIABLE (68) : une heure fermée T ferme l'intervalle [T, T+90). Un créneau
// candidat est bloqué dès qu'il CHEVAUCHE (miroir EXACT de la garde serveur). Adjacent = OK.
const noon: BlockedRange = { ...base, times: ['12:00'] };
check(rangeBlocks(noon, '2026-07-15', '12:00', 'Terrain 2', 60), 'Candidat 12:00·1h dans la fermeture 12:00 → bloqué');
check(rangeBlocks(noon, '2026-07-15', '11:30', 'Terrain 2', 90), 'Candidat 11:30·1h30 déborde sur 12:00 → bloqué');
check(!rangeBlocks(noon, '2026-07-15', '10:30', 'Terrain 2', 90), 'Candidat 10:30·1h30 finit à 12:00 (adjacent) → libre');
check(rangeBlocks(noon, '2026-07-15', '13:00', 'Terrain 2', 60), 'Candidat 13:00·1h dans [12:00,13:30) → bloqué');
check(!rangeBlocks(noon, '2026-07-15', '13:30', 'Terrain 2', 90), 'Candidat 13:30 après [12:00,13:30) (adjacent) → libre');

// Période d'un seul jour (dateFrom = dateTo) : comportement « blocage journée ».
const oneDay: BlockedRange = { ...base, dateFrom: '2026-07-15', dateTo: '2026-07-15' };
check(rangeBlocks(oneDay, '2026-07-15', '11:00', 'Terrain 2'), 'Période d’un seul jour : ce jour est bloqué');
check(!rangeBlocks(oneDay, '2026-07-16', '11:00', 'Terrain 2'), 'Période d’un seul jour : le lendemain est libre');

// Changement de mois/d'année : la comparaison lexicographique des clés AAAA-MM-JJ tient.
const yearEnd: BlockedRange = { ...base, dateFrom: '2026-12-28', dateTo: '2027-01-03' };
check(rangeBlocks(yearEnd, '2027-01-01', '09:30', 'Terrain 2'), 'Période à cheval sur l’année : 1ᵉʳ janvier bloqué');
check(!rangeBlocks(yearEnd, '2027-01-04', '09:30', 'Terrain 2'), 'Période à cheval sur l’année : 4 janvier libre');

if (failed) {
  console.error(`\n${failed} test(s) en échec`);
  process.exit(1);
}
console.log('\nTous les tests ranges.ts passent.');
