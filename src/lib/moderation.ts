// Modération du contenu généré par les joueurs (UGC) — exigée par l'App Store (Guideline 1.2)
// et Google Play : signaler un avis, bloquer un joueur, et récupérer sa liste de blocages pour
// masquer localement les avis / matchs ouverts des comptes bloqués (SQL 51).

import { supabase } from './supabase';

// Signale un avis (motif optionnel). true = enregistré (l'opérateur modère sous 24 h).
export async function reportReview(reviewId: string, reason = ''): Promise<boolean> {
  const { data, error } = await supabase.rpc('report_review', { p_review_id: reviewId, p_reason: reason });
  return !error && data === true;
}

// Bloque un joueur (ses avis et ses matchs ouverts disparaissent de MA vue). true = ok.
export async function blockUser(userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('block_user', { p_user_id: userId });
  return !error && data === true;
}

// Débloque un joueur.
export async function unblockUser(userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('unblock_user', { p_user_id: userId });
  return !error && data === true;
}

// Ma liste de comptes bloqués. Convention réseau (CLAUDE.md §8) : `null` en cas d'échec réseau
// (≠ [] = aucun blocage) pour que l'appelant ne réaffiche pas à tort un contenu masqué.
export async function fetchBlockedUserIds(): Promise<string[] | null> {
  const { data, error } = await supabase.rpc('fetch_blocked_users');
  if (error) return null;
  return ((data ?? []) as string[]).filter(Boolean);
}
