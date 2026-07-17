// Test de logique — mapping serveur → client des réservations (src/lib/reservationsMap.ts).
//   node --experimental-strip-types tests/reservations.test.ts
// Verrouille le SEUL point de traduction serveur→client, en particulier l'annulation par le
// club (75) : statut 'club_cancelled' → cancelledByClub, motif, et proposition d'alternative
// (avec ses replis). Une régression ici ferait disparaître la carte « Annulée par le club » du
// joueur ou casserait « Accepter la proposition ».

import { rowToReservation, type Row } from '../src/lib/reservationsMap.ts';

let failed = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? '✓' : '✗ ÉCHEC'} ${msg}`);
  if (!cond) failed++;
};

const base = (over: Partial<Row> = {}): Row => ({
  id: 'r1',
  user_id: 'u1',
  club_id: 'club-demo',
  club_name: 'Démo',
  date_key: '2099-01-01',
  date_label: 'Lun 1',
  time: '08:00',
  starts_at: null,
  court: 'Terrain 1',
  duration_min: 90,
  price: 10000,
  players: 1,
  invited: [],
  booked_by_name: null,
  booked_by_phone: null,
  coach_name: null,
  club_confirmed: false,
  open_match: false,
  open_level: null,
  open_capacity: null,
  status: 'booked',
  cancel_reason: null,
  proposed_court: null,
  proposed_date_key: null,
  proposed_time: null,
  proposed_duration_min: null,
  created_at: '2099-01-01T00:00:00.000Z',
  ...over,
});

// 1) Résa normale → pas d'annulation club, pas de proposition.
{
  const r = rowToReservation(base({ status: 'booked' }));
  check(r.cancelledByClub === false, 'booked → cancelledByClub = false');
  check(r.cancelReason === undefined, 'booked → cancelReason indéfini');
  check(r.proposal === undefined, 'booked → proposal indéfini');
}

// 2) Annulation JOUEUR (cancelled) → toujours pas « par le club ».
{
  const r = rowToReservation(base({ status: 'cancelled' }));
  check(r.cancelledByClub === false, 'cancelled (joueur) → cancelledByClub = false');
}

// 3) Annulation par le CLUB avec proposition complète (durée 60 valide).
{
  const r = rowToReservation(
    base({
      status: 'club_cancelled',
      cancel_reason: 'Déjà pris au téléphone',
      proposed_court: 'Terrain 2',
      proposed_date_key: '2099-01-02',
      proposed_time: '10:00',
      proposed_duration_min: 60,
    }),
  );
  check(r.cancelledByClub === true, 'club_cancelled → cancelledByClub = true');
  check(r.cancelReason === 'Déjà pris au téléphone', 'club_cancelled → motif mappé');
  check(!!r.proposal, 'club_cancelled + proposition → proposal défini');
  check(r.proposal?.court === 'Terrain 2', 'proposition → terrain');
  check(r.proposal?.dateKey === '2099-01-02', 'proposition → jour');
  check(r.proposal?.time === '10:00', 'proposition → heure');
  check(r.proposal?.durationMin === 60, 'proposition → durée 60 honorée');
}

// 4) Annulation club SANS proposition → proposal indéfini (mais toujours cancelledByClub).
{
  const r = rowToReservation(base({ status: 'club_cancelled', cancel_reason: 'Terrain indisponible' }));
  check(r.cancelledByClub === true, 'club_cancelled sans proposition → cancelledByClub = true');
  check(r.proposal === undefined, 'club_cancelled sans proposed_* → proposal indéfini');
}

// 5) Proposition PARTIELLE (seul le terrain change) → jour/heure retombent sur ceux de la résa.
{
  const r = rowToReservation(base({ status: 'club_cancelled', proposed_court: 'Terrain 3' }));
  check(r.proposal?.court === 'Terrain 3', 'proposition partielle → terrain proposé');
  check(r.proposal?.dateKey === '2099-01-01', 'proposition partielle → jour = celui de la résa');
  check(r.proposal?.time === '08:00', 'proposition partielle → heure = celle de la résa');
}

// 6) Durée proposée INVALIDE (45) → repli sur la durée figée de la résa (90).
{
  const r = rowToReservation(base({ status: 'club_cancelled', proposed_time: '11:00', proposed_duration_min: 45 }));
  check(r.proposal?.durationMin === 90, 'durée proposée 45 (invalide) → repli 90');
}

// 7) duration_min absent (ancien binaire / migration) → 1h30 par défaut.
{
  const r = rowToReservation(base({ duration_min: null }));
  check(r.durationMin === 90, 'duration_min null → 90 (rétrocompat 1h30)');
}

console.log(failed === 0 ? '\nTOUS LES TESTS reservationsMap PASSENT.' : `\n${failed} test(s) en échec.`);
process.exit(failed === 0 ? 0 : 1);
