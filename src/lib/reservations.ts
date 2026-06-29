// Couche données « réservations serveur ». Le serveur Supabase est la SOURCE DE VÉRITÉ ;
// le store garde un MIROIR local (lectures synchrones rapides + résilience hors-ligne).
// On écrit ici, puis on met à jour le miroir dans AppContext.

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
  return {
    id: row.id,
    userId: row.user_id,
    clubId: row.club_id,
    clubName: row.club_name ?? '',
    court: row.court ?? '',
    date: row.date_label ?? '',
    dateKey: row.date_key ?? '',
    time: row.time ?? '',
    startsAt: Number(row.starts_at ?? 0),
    price: row.price ?? 0,
    players: row.players ?? 1,
    invited: row.invited ?? [],
    bookedBy: row.booked_by_name ? { name: row.booked_by_name, phone: row.booked_by_phone ?? '' } : undefined,
    clubConfirmed: row.club_confirmed ?? false,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
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

export async function deleteReservationRow(id: string): Promise<boolean> {
  const { error } = await supabase.from('reservations').delete().eq('id', id);
  return !error;
}

export async function setClubConfirmedRow(id: string, value: boolean): Promise<boolean> {
  // Passe par la fonction serveur (SECURITY DEFINER) qui ne modifie QUE club_confirmed
  // après contrôle du rôle — pas d'UPDATE large qui laisserait réécrire prix/terrain.
  const { data, error } = await supabase.rpc('set_club_confirmed', { p_id: id, p_value: value });
  return !error && data === true;
}

// Mes réservations (RLS) — pour un compte club/opérateur, la RLS renvoie aussi celles
// de son club / toutes. On trie par date de créneau.
export async function fetchReservations(): Promise<{ ok: boolean; reservations: Reservation[] }> {
  const { data, error } = await supabase.from('reservations').select('*').order('starts_at', { ascending: true });
  if (error) return { ok: false, reservations: [] };
  return { ok: true, reservations: (data ?? []).map((r) => rowToReservation(r as Row)) };
}

// Réservation PARTAGÉE : rattache les amis invités (par leur numéro) à la réservation.
// La résolution numéro → compte se fait côté serveur (fonction SECURITY DEFINER), donc on
// n'expose jamais les profils. Les non-inscrits sont simplement ignorés.
export async function linkParticipants(reservationId: string, phones: string[]): Promise<void> {
  const clean = phones.map((p) => p.trim()).filter((p) => p.replace(/\D/g, '').length >= 8);
  if (clean.length === 0) return;
  await supabase.rpc('link_participants', { p_reservation_id: reservationId, p_phones: clean });
}

// Les réservations où JE suis invité (participant) → à inclure dans « mes réservations ».
export async function fetchMyParticipations(userId: string): Promise<string[]> {
  const { data, error } = await supabase.from('reservation_participants').select('reservation_id').eq('user_id', userId);
  if (error) return [];
  return (data ?? []).map((r: { reservation_id: string }) => r.reservation_id);
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
