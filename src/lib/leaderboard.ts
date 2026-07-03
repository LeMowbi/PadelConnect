// Classement général des joueurs (46) : par POINTS gagnés dans l'app (modèle « Race » FIP —
// le niveau est plafonné à 7 ET déclaré à l'inscription, il ne peut pas servir de rang).
// 100 pts = tournoi officiel gagné · 10 pts = tournoi officiel joué · 3 pts = victoire de
// match confirmée · 2 pts = partie jouée. Convention réseau §8 : null = échec réseau.

import { supabase } from './supabase';

export type LeaderboardRow = {
  userId: string;
  name: string; // prénom + initiale (le serveur n'expose pas plus)
  level: number; // affiché à titre d'info (force) — le rang, ce sont les points
  wins: number; // tournois officiels gagnés
  matchWins: number; // victoires de match confirmées (score saisi + validé)
  offPlayed: number; // tournois officiels JOUÉS (participations, valent ×10 pts)
  played: number; // parties jouées
  points: number; // le RANG : gagné dans l'app, infalsifiable, sans plafond
};

export async function fetchLeaderboard(limit = 50): Promise<LeaderboardRow[] | null> {
  const { data, error } = await supabase.rpc('fetch_leaderboard', { p_limit: limit });
  if (error) return null;
  return (
    (data ?? []) as {
      user_id: string;
      name: string;
      level: number;
      wins: number;
      match_wins: number;
      off_played: number;
      played: number;
      points: number;
    }[]
  ).map((r) => ({
    userId: r.user_id,
    name: r.name,
    level: Number(r.level),
    wins: r.wins,
    matchWins: r.match_wins ?? 0,
    offPlayed: r.off_played ?? 0,
    played: r.played,
    points: r.points ?? 0,
  }));
}

// Ma position exacte (même au-delà du top affiché). null = échec réseau OU non classé.
export async function fetchMyRank(): Promise<number | null> {
  const { data, error } = await supabase.rpc('my_leaderboard_rank');
  if (error || typeof data !== 'number') return null;
  return data;
}
