// Mapping PUR ligne serveur → modèle local de réservation. Isolé de reservations.ts (qui importe
// le client Supabase, non chargeable hors app) pour être TESTABLE en Node (tests/reservations.test.ts) :
// c'est le SEUL point de traduction serveur→client, y compris tous les champs de l'annulation par
// le club (75). Aucune dépendance runtime au store ni au réseau — seulement `slotTimestamp` (pur).

import { slotTimestamp } from './days.ts';
import type { Invited, Reservation } from '@/store/AppContext';

export type Row = {
  id: string;
  user_id: string;
  club_id: string;
  club_name: string | null;
  date_key: string | null;
  date_label: string | null;
  time: string | null;
  starts_at: number | string | null;
  court: string | null;
  duration_min: number | null; // durée figée du créneau (60|90) — 90 par défaut (rétrocompat)
  price: number | null;
  players: number | null;
  invited: Invited[] | null;
  booked_by_name: string | null;
  booked_by_phone: string | null;
  coach_name: string | null; // cours : réservation créée par respond_lesson (acceptation coach)
  club_confirmed: boolean | null;
  open_match: boolean | null; // match ouvert (45) — rejoignable par les autres joueurs
  open_level: string | null;
  open_capacity: number | null; // 2 = 1v1 · 4 = 2v2 (v2)
  status: string | null; // 'booked' | 'cancelled' | 'no_show' | 'club_cancelled' (75)
  cancel_reason: string | null; // motif d'une annulation par le club (75)
  proposed_court: string | null; // proposition d'alternative (terrain / jour / heure / durée) — 75
  proposed_date_key: string | null;
  proposed_time: string | null;
  proposed_duration_min: number | null;
  created_at: string | null;
};

// Ligne serveur → modèle local.
export function rowToReservation(row: Row): Reservation {
  // startsAt CANONIQUE : recalculé depuis (date_key + time) en heure fixe Abidjan, pour
  // neutraliser un éventuel fuseau erroné de l’appareil qui a créé la résa (le starts_at
  // stocké ne sert que de repli si la date/heure manquent). Repli sûr contre NaN.
  const storedTs = Number(row.starts_at);
  const startsAt = row.date_key && row.time ? slotTimestamp(row.date_key, row.time) : Number.isFinite(storedTs) ? storedTs : 0;
  const createdTs = row.created_at ? new Date(row.created_at).getTime() : NaN;
  return {
    id: row.id,
    userId: row.user_id,
    clubId: row.club_id,
    clubName: row.club_name ?? '',
    court: row.court ?? '',
    date: row.date_label ?? '',
    dateKey: row.date_key ?? '',
    time: row.time ?? '',
    startsAt,
    durationMin: row.duration_min ?? 90, // absent (ancien binaire / migration) ⇒ 1h30
    price: row.price ?? 0,
    players: row.players ?? 1,
    invited: row.invited ?? [],
    bookedBy: row.booked_by_name ? { name: row.booked_by_name, phone: row.booked_by_phone ?? '' } : undefined,
    coachName: row.coach_name ?? undefined,
    clubConfirmed: row.club_confirmed ?? false,
    openMatch: row.open_match ?? false,
    openLevel: row.open_level ?? undefined,
    openCapacity: row.open_capacity ?? undefined,
    // Annulation par le CLUB (75) : motif + proposition d'alternative, portés par le même canal que
    // les annulées (fetchCancelledReservations fait select *). Absents = annulation joueur normale.
    cancelledByClub: row.status === 'club_cancelled',
    cancelReason: row.cancel_reason ?? undefined,
    proposal:
      row.proposed_court || row.proposed_time || row.proposed_date_key
        ? {
            court: row.proposed_court ?? row.court ?? '',
            dateKey: row.proposed_date_key ?? row.date_key ?? '',
            time: row.proposed_time ?? row.time ?? '',
            durationMin: (row.proposed_duration_min === 60 || row.proposed_duration_min === 90
              ? row.proposed_duration_min
              : (row.duration_min ?? 90)) as 60 | 90,
          }
        : undefined,
    createdAt: Number.isFinite(createdTs) ? createdTs : Date.now(),
  };
}
