// Avis VÉRIFIÉS côté serveur : seul un joueur ayant joué au club peut noter (contrôle dans
// la fonction submit_review). Le gérant peut répondre (reply_to_review). On lit/écrit ici,
// l’écran fiche club affiche et rafraîchit.

import { supabase } from './supabase';

export type ServerReview = {
  id: string;
  clubId: string;
  userId: string;
  author: string;
  rating: number;
  text: string;
  reply?: string;
  replyAt?: string;
  createdAt: string;
  // Notes par critère (83, optionnelles — les anciens avis n'en ont pas).
  ratingCourts?: number;
  ratingService?: number;
  ratingFacilities?: number;
};

type Row = {
  id: string;
  club_id: string;
  user_id: string;
  author_name: string | null;
  rating: number;
  text: string | null;
  reply: string | null;
  reply_at: string | null;
  created_at: string;
  rating_courts: number | null;
  rating_service: number | null;
  rating_facilities: number | null;
};

function toReview(r: Row): ServerReview {
  return {
    id: r.id,
    clubId: r.club_id,
    userId: r.user_id,
    author: r.author_name ?? 'Joueur',
    rating: r.rating,
    text: r.text ?? '',
    reply: r.reply ?? undefined,
    replyAt: r.reply_at ?? undefined,
    createdAt: r.created_at,
    ratingCourts: r.rating_courts ?? undefined,
    ratingService: r.rating_service ?? undefined,
    ratingFacilities: r.rating_facilities ?? undefined,
  };
}

// Note moyenne + nombre d’avis PAR CLUB en un seul appel (RPC fetch_club_ratings, 39) —
// alimente les cartes des listes (« 4.2 ★ (12) », comme la fiche). null = échec réseau.
// Moyennes PAR CRITÈRE (83) : présentes seulement si des avis structurés existent ; le client
// ne les affiche qu'à partir de 3 avis structurés (structuredCount).
export type ClubRating = {
  avg: number;
  count: number;
  avgCourts?: number;
  avgService?: number;
  avgFacilities?: number;
  structuredCount: number;
};
export async function fetchClubRatings(): Promise<Record<string, ClubRating> | null> {
  const { data, error } = await supabase.rpc('fetch_club_ratings');
  if (error) return null;
  const out: Record<string, ClubRating> = {};
  for (const r of (data ?? []) as {
    club_id: string;
    avg_rating: number;
    review_count: number;
    avg_courts: number | null;
    avg_service: number | null;
    avg_facilities: number | null;
    structured_count: number | null;
  }[]) {
    out[r.club_id] = {
      avg: Number(r.avg_rating),
      count: r.review_count,
      avgCourts: r.avg_courts == null ? undefined : Number(r.avg_courts),
      avgService: r.avg_service == null ? undefined : Number(r.avg_service),
      avgFacilities: r.avg_facilities == null ? undefined : Number(r.avg_facilities),
      structuredCount: Number(r.structured_count ?? 0),
    };
  }
  return out;
}

// Avis d’un club (les plus récents d’abord). Convention réseau (CLAUDE.md §8) : `null` en cas
// d’échec réseau (≠ [] = aucun avis) pour que l’appelant NE VIDE PAS le miroir affiché sur un blip.
export async function fetchClubReviews(clubId: string): Promise<ServerReview[] | null> {
  const { data, error } = await supabase.from('reviews').select('*').eq('club_id', clubId).order('created_at', { ascending: false });
  if (error) return null;
  return (data ?? []).map((r) => toReview(r as Row));
}

// Dépose/met à jour mon avis. Distingue le refus métier (pas encore joué → non vérifié) d’une
// erreur réseau/serveur, pour afficher le bon message côté UI. Les 3 notes par critère (83)
// sont OPTIONNELLES : null/undefined = non renseignée (jamais 0 — le serveur refuserait).
export async function submitReview(
  clubId: string,
  rating: number,
  text: string,
  structured?: { courts?: number | null; service?: number | null; facilities?: number | null },
): Promise<{ ok: boolean; reason?: 'not_played' | 'error' }> {
  const { data, error } = await supabase.rpc('submit_review', {
    p_club_id: clubId,
    p_rating: rating,
    p_text: text,
    p_rating_courts: structured?.courts ?? null,
    p_rating_service: structured?.service ?? null,
    p_rating_facilities: structured?.facilities ?? null,
  });
  if (error) return { ok: false, reason: 'error' };
  if (data === true) return { ok: true };
  return { ok: false, reason: 'not_played' };
}

// Supprime MON avis sur ce club (RLS : delete own).
export async function deleteMyReview(clubId: string, userId: string): Promise<boolean> {
  const { error } = await supabase.from('reviews').delete().eq('club_id', clubId).eq('user_id', userId);
  return !error;
}

// Le gérant du club répond à un avis (p_reply vide = retire la réponse).
export async function replyToReview(reviewId: string, reply: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('reply_to_review', { p_review_id: reviewId, p_reply: reply });
  return !error && data === true;
}
