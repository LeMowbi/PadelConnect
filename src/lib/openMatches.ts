// Matchs OUVERTS (45), modèle Playtomic : le créateur a déjà réservé son terrain (bloqué
// direct) et cherche des joueurs — chacun peut rejoindre une des places restantes.
// Convention réseau §8 : null = échec réseau (≠ [] = aucun match ouvert).

import { supabase } from './supabase';

export type OpenMatch = {
  id: string;
  clubId: string;
  clubName: string;
  dateKey: string;
  dateLabel: string;
  time: string;
  court: string;
  startsAt: number;
  level: string; // niveau souhaité (libre, ex. « 3–4 ») — '' = tous niveaux
  creatorId: string;
  creatorName: string;
  placesLeft: number; // places restantes aux côtés du créateur (capacité − 1 − arrivés)
  capacity: number; // 2 = 1v1 · 4 = 2v2
  durationMin: number; // durée réelle du créneau (60|90, créneaux modulables 68) — 90 par défaut
  // Fourchette de niveau (81) : null = ouvert à tous. Le refus est SERVEUR (join → 'level').
  levelMin: number | null;
  levelMax: number | null;
};

export async function fetchOpenMatches(): Promise<OpenMatch[] | null> {
  const { data, error } = await supabase.rpc('fetch_open_matches');
  if (error) return null;
  return (
    (data ?? []) as {
      id: string;
      club_id: string;
      club_name: string;
      date_key: string;
      date_label: string;
      time: string;
      court: string;
      starts_at: number;
      open_level: string;
      creator_id: string;
      creator_name: string;
      places_left: number;
      capacity: number;
      duration_min: number;
      open_level_min: number | null;
      open_level_max: number | null;
    }[]
  ).map((r) => ({
    id: r.id,
    clubId: r.club_id,
    clubName: r.club_name,
    dateKey: r.date_key,
    dateLabel: r.date_label,
    time: r.time,
    court: r.court,
    startsAt: Number(r.starts_at),
    level: r.open_level ?? '',
    creatorId: r.creator_id,
    creatorName: r.creator_name,
    placesLeft: r.places_left,
    capacity: r.capacity ?? 4,
    durationMin: r.duration_min ?? 90,
    levelMin: r.open_level_min == null ? null : Number(r.open_level_min),
    levelMax: r.open_level_max == null ? null : Number(r.open_level_max),
  }));
}

// Rejoindre : la place est prise IMMÉDIATEMENT (le créateur reçoit un push). Statuts serveur
// distincts pour des messages honnêtes ('full' ≠ 'gone' ≠ 'already') ; 'error' = échec réseau.
export type JoinResult = 'ok' | 'full' | 'gone' | 'own' | 'already' | 'forbidden' | 'level' | 'error';

export async function joinOpenMatch(id: string): Promise<JoinResult> {
  const { data, error } = await supabase.rpc('join_open_match', { p_id: id });
  if (error) return 'error';
  return (data as JoinResult) ?? 'error';
}
