// Carnets club (83) : le gérant crédite N séances à un joueur (par téléphone), puis décompte
// MANUELLEMENT une réservation à la fois (v1 assumée — un tap gérant, idempotent + audité côté
// serveur). Le joueur voit ses soldes. Convention §8 : null = échec réseau (≠ [] = aucun carnet).

import { supabase } from './supabase';

export type ClubPass = {
  id: string;
  userId: string;
  playerName: string;
  label: string;
  total: number;
  remaining: number;
  createdAt: number;
};

export type MyPass = { id: string; clubId: string; label: string; total: number; remaining: number };

// Gérant : crédite un carnet (appariement téléphone 10 derniers chiffres, refus d'ambiguïté —
// motif grant_club_access_by_phone). Renvoie le NOM du joueur crédité, null = refus/échec
// (introuvable, ambigu, bornes 1..100, réseau).
export async function clubGrantPass(clubId: string, phone: string, total: number, label: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('club_grant_pass', {
    p_club_id: clubId,
    p_phone: phone,
    p_total: total,
    p_label: label,
  });
  if (error || !data) return null;
  return data as string;
}

// Gérant : décompte UNE réservation du carnet de son auteur (atomique + idempotent serveur).
// 'none' = le joueur n'a pas de carnet avec du solde ; 'already' = déjà décomptée.
export async function clubUsePass(reservationId: string): Promise<'ok' | 'forbidden' | 'gone' | 'already' | 'none' | 'error'> {
  const { data, error } = await supabase.rpc('club_use_pass', { p_reservation_id: reservationId });
  if (error) return 'error';
  return data === 'ok' || data === 'forbidden' || data === 'gone' || data === 'already' || data === 'none' ? data : 'error';
}

// Gérant : les carnets de SON club (actifs d'abord).
export async function fetchClubPasses(clubId: string): Promise<ClubPass[] | null> {
  const { data, error } = await supabase.rpc('club_passes_list', { p_club_id: clubId });
  if (error) return null;
  return (
    (data ?? []) as {
      id: string;
      user_id: string;
      player_name: string;
      label: string;
      total: number;
      remaining: number;
      created_at: string;
    }[]
  ).map((r) => ({
    id: r.id,
    userId: r.user_id,
    playerName: r.player_name,
    label: r.label ?? '',
    total: r.total,
    remaining: r.remaining,
    createdAt: new Date(r.created_at).getTime(),
  }));
}

// Joueur : MES carnets (tous clubs), actifs d'abord.
export async function fetchMyPasses(): Promise<MyPass[] | null> {
  const { data, error } = await supabase.rpc('my_passes');
  if (error) return null;
  return ((data ?? []) as { id: string; club_id: string; label: string; total: number; remaining: number }[]).map((r) => ({
    id: r.id,
    clubId: r.club_id,
    label: r.label ?? '',
    total: r.total,
    remaining: r.remaining,
  }));
}

// Réservations déjà DÉCOMPTÉES d'un carnet (RLS : visibles du porteur et du gérant) — sert à
// afficher « Décomptée ✓ » sur la carte résa côté club. null = échec réseau.
export async function fetchPassUses(reservationIds: string[]): Promise<Set<string> | null> {
  if (reservationIds.length === 0) return new Set();
  const { data, error } = await supabase.from('pass_uses').select('reservation_id').in('reservation_id', reservationIds.slice(0, 100));
  if (error) return null;
  return new Set(((data ?? []) as { reservation_id: string }[]).map((r) => r.reservation_id));
}
