// Test de logique — grille de créneaux PAR TERRAIN à durée variable (1h/1h30).
// Exécute les VRAIES fonctions source (src/lib/courtSchedule.ts) :
//   node --experimental-strip-types tests/courtSchedule.test.ts
// C'est la garde ANTI DOUBLE-VENTE côté logique pure : chevauchement d'intervalles + dérivation
// rétro-compatible (les créneaux fermés « ! » / court_closed ne doivent JAMAIS rouvrir).

import {
  type CourtSlot,
  canAddCourtSlot,
  offeredDurations,
  openCourtSlots,
  overlaps,
  resolveCourtSlots,
  slotDurationAt,
  slotEnd,
  toMin,
} from '../src/lib/courtSchedule.ts';

let failed = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? '✓' : '✗ ÉCHEC'} ${msg}`);
  if (!cond) failed++;
};
const S = (t: string, d: 60 | 90, x?: boolean): CourtSlot => (x ? { t, d, x } : { t, d });

// Grille par défaut (miroir de SAMPLE_SLOTS de data/clubs.ts — vérifié identique par seeds.test).
const SAMPLE = ['07:30', '09:00', '10:30', '12:00', '16:30', '18:00', '19:30', '21:00'];

console.log('\n— toMin / slotEnd —');
check(toMin('09:00') === 540, 'toMin 09:00 = 540');
check(toMin('9:30') === 570, 'toMin accepte 9:30');
check(toMin('24:00') === 1440, 'toMin 24:00 = 1440');
check(toMin('24:30') === null && toMin('9h') === null, 'toMin refuse 24:30 / format libre');
check(slotEnd('08:00', 90) === 570, 'slotEnd 08:00·1h30 = 09:30');

console.log('\n— overlaps (demi-ouvert strict) —');
check(overlaps(S('08:00', 90), S('09:30', 60)) === false, 'adjacents 08:00·1h30 / 09:30·1h : PAS de chevauchement');
check(overlaps(S('08:00', 90), S('09:00', 60)) === true, '08:00·1h30 vs 09:00·1h : chevauchement');
check(overlaps(S('08:00', 90), S('09:29', 60)) === true, '08:00·1h30 vs 09:29 : chevauchement');
// Asymétrie DANS LES DEUX SENS (bug si on ne lit qu'une seule durée)
check(overlaps(S('08:00', 60), S('09:00', 90)) === false, '1h avant 1h30 : 08:00·1h puis 09:00 OK');
check(overlaps(S('08:00', 60), S('08:30', 90)) === true, '1h avant 1h30 : 08:30 chevauche 08:00·1h');
check(overlaps(S('08:00', 90), S('09:30', 60)) === false, '1h30 avant 1h : 09:30 OK');
check(overlaps(S('08:00', 90), S('09:00', 60)) === true, '1h30 avant 1h : 09:00 chevauche');

console.log('\n— canAddCourtSlot —');
const grid: CourtSlot[] = [S('08:00', 90), S('09:30', 60)]; // 08:00→09:30, 09:30→10:30
check(canAddCourtSlot(grid, '10:30', 90).ok === true, 'ajout 10:30·1h30 après 09:30·1h : OK (adjacent)');
check(canAddCourtSlot(grid, '10:00', 60).ok === false, 'ajout 10:00·1h : refusé (chevauche 09:30·1h)');
check(canAddCourtSlot(grid, '09:00', 90).ok === false, 'ajout 09:00·1h30 : refusé (chevauche 08:00)');
check(canAddCourtSlot(grid, '08:00', 60).ok === false, 'ajout 08:00 : refusé (existe déjà)');
check(canAddCourtSlot([], '23:00', 60).ok === true, '23:00·1h : OK (finit à minuit)');
check(canAddCourtSlot([], '23:00', 90).ok === false, '23:00·1h30 : refusé (déborde minuit)');
check(canAddCourtSlot([], '22:30', 90).ok === true, '22:30·1h30 : OK (finit à minuit)');
check(canAddCourtSlot([], '04:30', 60).ok === false, '04:30 : refusé (avant 05:00)');
check(canAddCourtSlot([], '09:15', 60).ok === false, '09:15 : refusé (pas de 30 min)');

console.log('\n— openCourtSlots / slotDurationAt / offeredDurations —');
const cs = { 'Terrain 1': [S('09:30', 60), S('08:00', 90), S('12:00', 90, true)] };
check(
  openCourtSlots(cs, 'Terrain 1')
    .map((s) => s.t)
    .join(',') === '08:00,09:30',
  'openCourtSlots : triés, fermé exclu',
);
check(slotDurationAt(cs, 'Terrain 1', '09:30') === 60, 'slotDurationAt 09:30 = 60');
check(slotDurationAt(cs, 'Terrain 1', '12:00') === null, 'slotDurationAt d’un créneau fermé = null');
check(slotDurationAt(cs, 'Terrain 1', '07:00') === null, 'slotDurationAt heure absente = null');
const off = offeredDurations(cs, ['Terrain 1']);
check(off.has(60) && off.has(90) && off.size === 2, 'offeredDurations = {60,90}');

console.log('\n— resolveCourtSlots (rétro-compat + ANTI-RÉOUVERTURE) —');
// null court_slots ⇒ dérive de slots @90, « ! » RESTE fermé
const r1 = resolveCourtSlots({ slots: ['08:00', '!12:30', '14:00'] }, ['Terrain 1'], SAMPLE)['Terrain 1'];
check(r1.length === 3 && r1.every((s) => s.d === 90), 'legacy slots ⇒ tout @90');
const lunch = r1.find((s) => s.t === '12:30');
check(!!lunch && lunch.x === true, '« !12:30 » RESTE fermé (pas de double-vente)');
// court_closed hérité ⇒ fermé aussi
const r2 = resolveCourtSlots({ slots: ['08:00', '09:30'], courtClosed: { 'Terrain 1': ['09:30'] } }, ['Terrain 1'], SAMPLE)['Terrain 1'];
check(r2.find((s) => s.t === '09:30')?.x === true, 'court_closed hérité ⇒ 09:30 fermé');
// courtSlots présent mais terrain absent ⇒ défaut @90 (fallback)
const r3 = resolveCourtSlots({ courtSlots: { 'Terrain 1': [S('08:00', 60)] } }, ['Terrain 2'], SAMPLE)['Terrain 2'];
check(r3.length === SAMPLE.length && r3.every((s) => s.d === 90), 'terrain sans grille ⇒ défaut @90');
// rien du tout ⇒ grille par défaut @90 (club sans config reste réservable)
const r4 = resolveCourtSlots({}, ['Terrain 1'], SAMPLE)['Terrain 1'];
check(r4.length === SAMPLE.length && r4.map((s) => s.t)[0] === '07:30', 'aucune config ⇒ grille par défaut');
// null ⇒ comportement identique à aujourd'hui (tout @90, mêmes heures)
const r5 = resolveCourtSlots({ courtSlots: null, slots: ['08:00', '09:30', '11:00'] }, ['T'], SAMPLE)['T'];
check(r5.every((s) => s.d === 90) && r5.length === 3, 'null court_slots ≡ aujourd’hui (tout 1h30)');

console.log(`\n${failed === 0 ? 'TOUS LES TESTS COURTSCHEDULE PASSENT.' : `${failed} ÉCHEC(S).`}`);
process.exit(failed === 0 ? 0 : 1);
