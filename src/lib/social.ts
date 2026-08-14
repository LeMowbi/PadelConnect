// Social & niveau (chantier v3, lot A — SQL 80) : joueurs favoris, fiabilité publique,
// moteur de niveau (historique + réconciliation du chemin « validé à 48 h »).

import { supabase } from './supabase';

// ─── Joueurs favoris ────────────────────────────────────────────────────────────

// Suivre / ne plus suivre un joueur. 'not_found' = compte disparu OU blocage masqué (le serveur
// ne révèle jamais un blocage — même convention que la demande d'ami, 53).
export async function toggleFavoritePlayer(userId: string): Promise<'added' | 'removed' | 'not_found' | null> {
  const { data, error } = await supabase.rpc('toggle_favorite_player', { p_user_id: userId });
  if (error) return null; // échec réseau (≠ refus) : l'appelant garde son état
  return data === 'added' || data === 'removed' ? data : 'not_found';
}

// Mes joueurs suivis. Convention §8 : null = échec réseau (≠ [] = aucun favori).
export async function fetchFavoritePlayerIds(): Promise<string[] | null> {
  const { data, error } = await supabase.from('favorite_players').select('fav_user_id');
  if (error) return null;
  return ((data ?? []) as { fav_user_id: string }[]).map((r) => r.fav_user_id).filter(Boolean);
}

// ─── Fiabilité publique ─────────────────────────────────────────────────────────

export type PublicReliability = { played: number; presencePct: number };

// Taux de présence AGRÉGÉ de joueurs (badge « Fiable · N % »). Le détail (annulations…)
// reste réservé au club. null = échec réseau. Clé du Record = userId.
export async function fetchPublicReliability(userIds: string[]): Promise<Record<string, PublicReliability> | null> {
  if (userIds.length === 0) return {};
  const { data, error } = await supabase.rpc('public_reliability', { p_user_ids: userIds.slice(0, 50) });
  if (error) return null;
  const out: Record<string, PublicReliability> = {};
  for (const r of (data ?? []) as { user_id: string; played: number; presence_pct: number }[]) {
    out[r.user_id] = { played: r.played ?? 0, presencePct: r.presence_pct ?? 100 };
  }
  return out;
}

// ─── Moteur de niveau ───────────────────────────────────────────────────────────

export type LevelHistoryEntry = {
  delta: number;
  levelBefore: number;
  levelAfter: number;
  reason: 'match' | 'tournament';
  at: number; // epoch ms
};

// Mon historique d'ajustements de niveau (les plus récents d'abord). null = échec réseau.
export async function fetchMyLevelHistory(limit = 10): Promise<LevelHistoryEntry[] | null> {
  const { data, error } = await supabase
    .from('level_history')
    .select('delta, level_before, level_after, reason, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return null;
  return ((data ?? []) as { delta: number; level_before: number; level_after: number; reason: string; created_at: string }[]).map((r) => ({
    delta: Number(r.delta),
    levelBefore: Number(r.level_before),
    levelAfter: Number(r.level_after),
    reason: r.reason === 'tournament' ? 'tournament' : 'match',
    at: new Date(r.created_at).getTime(),
  }));
}

// Rattrape mes matchs validés « à 48 h » (chemin lazy : aucune écriture serveur à T+48 h) —
// appelé à l'ouverture de session, fire-and-forget. Renvoie le nombre de matchs appliqués.
export async function reconcileMyLevels(): Promise<number> {
  const { data, error } = await supabase.rpc('reconcile_my_levels');
  return error ? 0 : Number(data ?? 0);
}
