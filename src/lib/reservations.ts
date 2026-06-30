// Couche données « réservations serveur ». Le serveur Supabase est la SOURCE DE VÉRITÉ ;
// le store garde un MIROIR local (lectures synchrones rapides + résilience hors-ligne).
// On écrit ici, puis on met à jour le miroir dans AppContext.

import { slotTimestamp } from './days';
import { supabase } from './supabase';
import type { Invited, Reservation } from '@/store/AppContext';

// Occupation d'un créneau (sans identité) — alimente la disponibilité cross-joueur.
export type SlotOccupancy = { clubId: string; dateKey: string; time: string; court: string };

type Row = {
  id: string;
  user_id: string;
  club_id: string;
  club_name: string | null;
  date_key: string | null;
  date_label: string | null;
  time: string | null;
  starts_at: number | string | null;
  court: string | null;
  price: number | null;
  players: number | null;
  invited: Invited[] | null;
  booked_by_name: string | null;
  booked_by_phone: string | null;
  club_confirmed: boolean | null;
  created_at: string | null;
};

// Ligne serveur → modèle local.
export function rowToReservation(row: Row): Reservation {
  // startsAt CANONIQUE : recalculé depuis (date_key + time) en heure fixe Abidjan, pour
  // neutraliser un éventuel fuseau erroné de l'appareil qui a créé la résa (le starts_at
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
    price: row.price ?? 0,
    players: row.players ?? 1,
    invited: row.invited ?? [],
    bookedBy: row.booked_by_name ? { name: row.booked_by_name, phone: row.booked_by_phone ?? '' } : undefined,
    clubConfirmed: row.club_confirmed ?? false,
    createdAt: Number.isFinite(createdTs) ? createdTs : Date.now(),
  };
}

// Modèle local (sans id/createdAt) → ligne serveur à insérer.
function reservationToRow(
  r: Omit<Reservation, 'id' | 'createdAt' | 'bookedBy' | 'userId'>,
  userId: string,
  bookedBy?: { name: string; phone: string },
) {
  return {
    user_id: userId,
    club_id: r.clubId,
    club_name: r.clubName,
    date_key: r.dateKey,
    date_label: r.date,
    time: r.time,
    starts_at: r.startsAt,
    court: r.court,
    price: r.price,
    players: r.players,
    invited: r.invited,
    booked_by_name: bookedBy?.name ?? null,
    booked_by_phone: bookedBy?.phone ?? null,
    status: 'booked',
  };
}

// Crée la réservation côté serveur. conflict=true si le terrain vient d'être pris
// (violation de la contrainte unique 23505) → l'UI repropose un autre terrain.
export async function insertReservation(
  input: Omit<Reservation, 'id' | 'createdAt' | 'bookedBy' | 'userId'>,
  userId: string,
  bookedBy?: { name: string; phone: string },
): Promise<{ ok: boolean; reservation?: Reservation; conflict?: boolean }> {
  const { data, error } = await supabase
    .from('reservations')
    .insert(reservationToRow(input, userId, bookedBy))
    .select()
    .single();
  if (error) return { ok: false, conflict: (error as { code?: string }).code === '23505' };
  return { ok: true, reservation: rowToReservation(data as Row) };
}

// Annulation : passe par la fonction serveur (SECURITY DEFINER) qui vérifie l'auteur ET le
// délai des 5h (règle non contournable côté serveur) et met la résa en statut 'cancelled'
// (le créneau se libère, mais la trace reste pour que le club voie l'annulation).
export async function cancelReservationRow(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('cancel_reservation', { p_id: id });
  return !error && data === true;
}

export async function setClubConfirmedRow(id: string, value: boolean): Promise<boolean> {
  // Passe par la fonction serveur (SECURITY DEFINER) qui ne modifie QUE club_confirmed
  // après contrôle du rôle — pas d'UPDATE large qui laisserait réécrire prix/terrain.
  const { data, error } = await supabase.rpc('set_club_confirmed', { p_id: id, p_value: value });
  return !error && data === true;
}

// Mes réservations ACTIVES (RLS) — pour un compte club/opérateur, la RLS renvoie aussi
// celles de son club / toutes. On exclut les annulées (status='cancelled') : elles ne
// comptent ni dans la liste joueur ni dans la base de commission. Trié par date de créneau.
export async function fetchReservations(): Promise<{ ok: boolean; reservations: Reservation[] }> {
  const { data, error } = await supabase.from('reservations').select('*').eq('status', 'booked').order('starts_at', { ascending: true });
  if (error) return { ok: false, reservations: [] };
  return { ok: true, reservations: (data ?? []).map((r) => rowToReservation(r as Row)) };
}

// Réservations ANNULÉES du périmètre (RLS) — pour un compte club/opérateur, ce sont les
// annulations de son club. On garde la trace (status='cancelled' posé par cancel_reservation)
// pour que le club soit prévenu qu'un créneau s'est libéré. Trié du plus récent au plus ancien.
export async function fetchCancelledReservations(): Promise<Reservation[]> {
  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('status', 'cancelled')
    .order('starts_at', { ascending: false });
  if (error) return [];
  return (data ?? []).map((r) => rowToReservation(r as Row));
}

// Réservation PARTAGÉE : rattache les amis invités (par leur numéro) à la réservation.
// La résolution numéro → compte se fait côté serveur (fonction SECURITY DEFINER), donc on
// n'expose jamais les profils. Les non-inscrits sont simplement ignorés.
export async function linkParticipants(reservationId: string, phones: string[]): Promise<void> {
  const clean = phones.map((p) => p.trim()).filter((p) => p.replace(/\D/g, '').length >= 8);
  if (clean.length === 0) return;
  await supabase.rpc('link_participants', { p_reservation_id: reservationId, p_phones: clean });
}

// Les réservations où JE suis invité (participant), AVEC le statut de mon invitation.
// 'invited' = à confirmer (Accepter/Refuser), 'accepted' = je viens, 'declined' = j'ai refusé.
export type MyParticipation = { reservationId: string; status: 'invited' | 'accepted' | 'declined' };
export async function fetchMyParticipations(userId: string): Promise<MyParticipation[]> {
  const { data, error } = await supabase.from('reservation_participants').select('reservation_id, status').eq('user_id', userId);
  if (error) return [];
  return (data ?? []).map((r: { reservation_id: string; status: string | null }) => ({
    reservationId: r.reservation_id,
    status: (r.status as MyParticipation['status']) ?? 'invited',
  }));
}

// L'invité répond à une invitation (Accepter / Refuser) — fonction serveur (SECURITY DEFINER).
export async function respondInvitation(reservationId: string, accept: boolean): Promise<boolean> {
  const { data, error } = await supabase.rpc('respond_invitation', { p_reservation_id: reservationId, p_accept: accept });
  return !error && data === true;
}

// Occupation de TOUS les créneaux pris (vue publique sans identité).
export async function fetchOccupancy(): Promise<SlotOccupancy[]> {
  const { data, error } = await supabase.from('slot_occupancy').select('*');
  if (error) return [];
  return (data ?? []).map((o: { club_id: string; date_key: string; time: string; court: string }) => ({
    clubId: o.club_id,
    dateKey: o.date_key,
    time: o.time,
    court: o.court,
  }));
}
