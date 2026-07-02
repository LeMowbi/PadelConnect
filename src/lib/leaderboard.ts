// Classement général des joueurs (44) : par NIVEAU (seul signal anti-triche), départagé par
// tournois officiels gagnés puis parties jouées. Convention réseau §8 : null = échec réseau.

import { supabase } from './supabase';

export type LeaderboardRow = {
  userId: string;
  name: string; // prénom + initiale (le serveur n'expose pas plus)
  level: number;
  wins: number; // tournois officiels gagnés
  played: number; // parties jouées
};

export async function fetchLeaderboard(limit = 50): Promise<LeaderboardRow[] | null> {
  const { data, error } = await supabase.rpc('fetch_leaderboard', { p_limit: limit });
  if (error) return null;
  return ((data ?? []) as { user_id: string; name: string; level: number; wins: number; played: number }[]).map((r) => ({
    userId: r.user_id,
    name: r.name,
    level: Number(r.level),
    wins: r.wins,
    played: r.played,
  }));
}

// Ma position exacte (même au-delà du top affiché). null = échec réseau OU non classé.
export async function fetchMyRank(): Promise<number | null> {
  const { data, error } = await supabase.rpc('my_leaderboard_rank');
  if (error || typeof data !== 'number') return null;
  return data;
}
