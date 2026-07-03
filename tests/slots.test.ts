// Test de logique — génération des créneaux à partir des heures d’ouverture (modularité club).
// Exécute les VRAIES fonctions source (src/lib/slots.ts) :
//   node --experimental-strip-types tests/slots.test.ts

import { buildSlots, inferOpenClose, minutesToSlot, slotToMinutes, SESSION_MIN } from '../src/lib/slots.ts';

let failed = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? '✓' : '✗ ÉCHEC'} ${msg}`);
  if (!cond) failed++;
};
const eq = (a: unknown, b: unknown, msg: string) => check(JSON.stringify(a) === JSON.stringify(b), msg);

// SESSION_MIN = 1h30, comme partout dans l’app.
check(SESSION_MIN === 90, 'Une session dure 1h30 (90 min)');

// Conversions HH:MM ↔ minutes.
check(slotToMinutes('08:00') === 480, '08:00 → 480 min');
check(slotToMinutes('24:00') === 1440, '24:00 (minuit) → 1440 min');
check(slotToMinutes('7:30') === 450, '7:30 (une seule chiffre d’heure) → 450 min');
check(slotToMinutes('bad') === null, 'Format invalide → null');
check(slotToMinutes('25:00') === null, 'Heure hors bornes → null');
check(minutesToSlot(480) === '08:00', '480 min → 08:00');
check(minutesToSlot(1440) === '24:00', '1440 min → 24:00');
check(minutesToSlot(9999) === '24:00', 'Au-delà de minuit → borné à 24:00');

// Club ouvrant à 8h, fermant à 23h : créneaux de 1h30 qui tiennent avant la fermeture.
eq(
  buildSlots('08:00', '23:00'),
  ['08:00', '09:30', '11:00', '12:30', '14:00', '15:30', '17:00', '18:30', '20:00', '21:30'],
  'Ouverture 08:00 → 23:00 : 10 créneaux de 1h30 (le dernier finit à 23:00)',
);

// Un créneau ne doit pas déborder la fermeture : 08:00 → 22:00 s’arrête à 20:00 (finit 21:30),
// pas 21:30 (qui finirait à 23:00, après la fermeture).
eq(buildSlots('08:00', '22:00').at(-1), '20:00', 'Dernier créneau ≤ fermeture (pas de débordement)');

// Un club différent (ouverture tardive) a d’AUTRES créneaux — chacun ses horaires.
eq(buildSlots('10:00', '20:00'), ['10:00', '11:30', '13:00', '14:30', '16:00', '17:30'], 'Autre club : 10:00 → 20:00');

// Plage vide / incohérente → aucun créneau.
eq(buildSlots('20:00', '20:00'), [], 'Ouverture = fermeture → aucun créneau');
eq(buildSlots('22:00', '08:00'), [], 'Fermeture avant ouverture → aucun créneau');
eq(buildSlots('08:00', '09:00'), [], 'Plage trop courte pour une session → aucun créneau');

// Déduction ouverture/fermeture depuis des créneaux actifs (pré-remplissage des sélecteurs).
eq(inferOpenClose(['08:00', '09:30', '11:00']), { open: '08:00', close: '12:30' }, 'Déduction : dernier créneau + une session');
eq(inferOpenClose([]), { open: '08:00', close: '23:00' }, 'Aucun créneau → valeurs par défaut');
// Des trous au milieu (créneaux fermés) ne changent pas les BORNES déduites.
eq(inferOpenClose(['08:00', '14:00']), { open: '08:00', close: '15:30' }, 'Trous internes : bornes = min/max + session');

if (failed) {
  console.error(`\n${failed} test(s) en échec`);
  process.exit(1);
}
console.log('\nTous les tests slots.ts passent.');
