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
  open_level_min: null,
  open_level_max: null,
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

// 8) Fourchette de niveau d'un match ouvert (81) : remappée telle quelle, null = borne absente
// (jamais 0, piège de Number(null)), et le numeric que PostgREST peut renvoyer en CHAÎNE est casté.
{
  const r = rowToReservation(base({ open_match: true, open_level_min: 2.5, open_level_max: null }));
  check(r.openLevelMin === 2.5, 'fourchette → min 2.5 mappé');
  check(r.openLevelMax === null, 'fourchette → max absent = null');
  const n = rowToReservation(base({ open_match: true }));
  check(n.openLevelMin === null && n.openLevelMax === null, 'sans fourchette → null / null (pas 0)');
  const str = rowToReservation(base({ open_match: true, open_level_min: '3' as unknown as number }));
  check(str.openLevelMin === 3, 'numeric en chaîne « 3 » → 3');
}

// 9) Cours annulé par le COACH (96) ou coach supprimé (97) : 'club_cancelled' (aucune pénalité
// pour l'élève) MAIS cancelledByCoach → la carte ne dit pas « Annulée par le club ».
{
  const r = rowToReservation(base({ status: 'club_cancelled', cancel_reason: 'Cours annulé par le coach' }));
  check(r.cancelledByClub === true && r.cancelledByCoach === true, 'cours annulé par le coach → cancelledByCoach = true');
  check(r.cancelReason === 'Cours annulé par le coach', 'cours annulé par le coach → motif affichable conservé');
  const gone = rowToReservation(base({ status: 'club_cancelled', cancel_reason: 'Coach indisponible' }));
  check(gone.cancelledByCoach === true, 'coach indisponible (compte supprimé) → cancelledByCoach = true');
  const club = rowToReservation(base({ status: 'club_cancelled', cancel_reason: 'Déjà pris au téléphone' }));
  check(club.cancelledByCoach === false, 'motif rédigé par le club → cancelledByCoach = false');
  const own = rowToReservation(base({ status: 'cancelled', cancel_reason: 'Cours annulé par le coach' }));
  check(own.cancelledByCoach === false, 'statut cancelled (joueur) → jamais cancelledByCoach');
}

// 10) Club supprimé (97) : le marqueur technique 'club_deleted' n'est JAMAIS montré comme motif.
{
  const r = rowToReservation(base({ status: 'cancelled', cancel_reason: 'club_deleted' }));
  check(r.cancelReason === undefined, 'marqueur club_deleted → cancelReason indéfini (jamais affiché)');
  check(r.cancelledByClub === false && r.cancelledByCoach === false, 'marqueur club_deleted → ni club ni coach');
}

// 11) Compte supprimé (98, décision n° 9) : `owner_deleted` → `ownerDeleted` ; colonne absente
// (serveur d'avant la 98) ou null → false.
{
  check(rowToReservation(base({ owner_deleted: true })).ownerDeleted === true, 'owner_deleted = true → ownerDeleted');
  check(rowToReservation(base()).ownerDeleted === false, 'owner_deleted absent (avant la 98) → false');
  check(rowToReservation(base({ owner_deleted: null })).ownerDeleted === false, 'owner_deleted null → false');
}

console.log(failed === 0 ? '\nTOUS LES TESTS reservationsMap PASSENT.' : `\n${failed} test(s) en échec.`);
process.exit(failed === 0 ? 0 : 1);
