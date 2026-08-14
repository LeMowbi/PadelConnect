// Annonces club (83) : le gérant publie des annonces sur SA fiche club (promo, horaires
// exceptionnels…) ; les SUIVEURS du club (cœur favori, club_followers) reçoivent un push si la
// case « notification » était cochée à la création (webhook club_news, INSERT seul — décision
// assumée : une correction de texte ne re-pousse jamais). Convention §8 : null = échec réseau.

import { supabase } from './supabase';

export type ClubNews = { id: string; title: string; body: string; link: string; createdAt: number };

// Fiche club : les 10 dernières annonces.
export async function fetchClubNews(clubId: string): Promise<ClubNews[] | null> {
  const { data, error } = await supabase.rpc('fetch_club_news', { p_club_id: clubId });
  if (error) return null;
  return ((data ?? []) as { id: string; title: string; body: string; link: string; created_at: string }[]).map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body ?? '',
    link: r.link ?? '',
    createdAt: new Date(r.created_at).getTime(),
  }));
}

// Gérant : crée (id null) ou modifie une annonce de SON club. Renvoie l'id, null = refus
// (titre < 3, lien non-https, 100 max) ou échec réseau. push : effet à la CRÉATION seulement.
export async function upsertClubNews(n: {
  id: string | null;
  clubId: string;
  title: string;
  body: string;
  link: string;
  push: boolean;
}): Promise<string | null> {
  const { data, error } = await supabase.rpc('upsert_club_news', {
    p_id: n.id,
    p_club_id: n.clubId,
    p_title: n.title,
    p_body: n.body,
    p_link: n.link,
    p_push: n.push,
  });
  if (error || !data) return null;
  return data as string;
}

// Gérant : supprime une annonce. true = supprimée.
export async function deleteClubNews(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('delete_club_news', { p_id: id });
  return !error && data === true;
}
