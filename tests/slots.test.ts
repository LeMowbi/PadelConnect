// Test de logique — génération des créneaux à partir des heures d’ouverture (modularité club).
// Exécute les VRAIES fonctions source (src/lib/slots.ts) :
//   node --experimental-strip-types tests/slots.test.ts

import {
  buildSlots,
  canAddSlot,
  closedSlot,
  inferOpenClose,
  isClosedSlot,
  minutesToSlot,
  slotTime,
  slotToMinutes,
  SESSION_MIN,
} from '../src/lib/slots.ts';

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

// Marqueur « fermé » ('!HH:MM') : la config stocke la grille COMPLÈTE, créneaux fermés compris —
// c'est ce qui rend les heures d'ouverture persistantes (rien ne se réinitialise) et un créneau
// fermé rouvrable (pause déjeuner).
check(isClosedSlot('!12:30') === true, "'!12:30' est marqué fermé");
check(isClosedSlot('12:30') === false, "'12:30' est ouvert");
check(slotTime('!12:30') === '12:30', 'slotTime retire la marque');
check(slotTime('12:30') === '12:30', 'slotTime laisse un horaire ouvert intact');
check(closedSlot('12:30') === '!12:30', 'closedSlot ajoute la marque');
// Les heures se déduisent de la grille STOCKÉE, marques retirées : un créneau fermé en bord de
// grille ne fait pas « rétrécir » la plage affichée au prochain passage.
eq(
  inferOpenClose(['08:00', '09:30', '!21:30'].map(slotTime)),
  { open: '08:00', close: '23:00' },
  'Créneau fermé en fin de grille : la fermeture déduite reste 23:00',
);

// Déduction ouverture/fermeture depuis des créneaux actifs (pré-remplissage des sélecteurs).
eq(inferOpenClose(['08:00', '09:30', '11:00']), { open: '08:00', close: '12:30' }, 'Déduction : dernier créneau + une session');
eq(inferOpenClose([]), { open: '08:00', close: '23:00' }, 'Aucun créneau → valeurs par défaut');
// Des trous au milieu (créneaux fermés) ne changent pas les BORNES déduites.
eq(inferOpenClose(['08:00', '14:00']), { open: '08:00', close: '15:30' }, 'Trous internes : bornes = min/max + session');

// ── Grille LIBRE (canAddSlot) : ajouter n'importe quel horaire, sessions de 1h30 sans
// chevauchement, marque « fermé » comprise dans les voisins.
check(canAddSlot(['08:00', '09:30'], '11:00').ok === true, 'canAddSlot : 11:00 après 09:30 (90 min pile) → OK');
check(canAddSlot(['08:00', '11:30'], '10:00').ok === true, 'canAddSlot : 10:00 tient pile entre 08:00 et 11:30 (sessions adjacentes) → OK');
check(canAddSlot(['08:00', '11:00'], '10:00').ok === false, 'canAddSlot : 10:00 à 60 min de 11:00 → chevauchement → refus');
check(canAddSlot(['08:00'], '09:00').ok === false, 'canAddSlot : 09:00 à 60 min de 08:00 → refus (session 1h30)');
check(canAddSlot(['!12:30'], '13:00').ok === false, 'canAddSlot : un créneau FERMÉ (!12:30) compte comme voisin → refus');
check(canAddSlot(['08:00'], '08:00').ok === false, 'canAddSlot : doublon exact → refus');
check(canAddSlot([], '04:30').ok === false, 'canAddSlot : avant 05:00 → refus');
check(canAddSlot([], '23:00').ok === false, 'canAddSlot : 23:00 + 1h30 déborde minuit → refus');
check(canAddSlot([], '22:30').ok === true, 'canAddSlot : 22:30 (fin 24:00 pile) → OK');
check(canAddSlot([], 'abc').ok === false, 'canAddSlot : format invalide → refus');
check('error' in canAddSlot(['08:00', '11:00'], '10:00'), 'canAddSlot : le refus porte un message actionnable');

if (failed) {
  console.error(`\n${failed} test(s) en échec`);
  process.exit(1);
}
console.log('\nTous les tests slots.ts passent.');
