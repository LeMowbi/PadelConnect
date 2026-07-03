// Score de match (46, modèle Playtomic) : après un match fini, un joueur saisit qui a gagné
// parmi les joueurs identifiés de la réservation ; un AUTRE joueur confirme (ou conteste).
// Sans contestation sous 48 h, le résultat est validé automatiquement. Une victoire
// confirmée vaut +3 points au classement. Convention réseau §8 : null = échec réseau.

import { supabase } from './supabase';

export type MatchResult = {
  reservationId: string;
  status: 'pending' | 'confirmed' | 'disputed';
  iWon: boolean; // je fais partie des vainqueurs saisis
  mine: boolean; // c'est moi qui ai saisi ce résultat
};

export type MatchPlayer = { userId: string; name: string }; // prénom + initiale

export type ResultToConfirm = {
  resultId: string;
  reservationId: string;
  clubName: string;
  dateLabel: string;
  time: string;
  winnerNames: string;
  submittedName: string;
};

// L'état des résultats de MES matchs (badge Victoire / En attente / Contesté sur les passées).
export async function fetchMyMatchResults(): Promise<MatchResult[] | null> {
  const { data, error } = await supabase.rpc('fetch_my_match_results');
  if (error) return null;
  return ((data ?? []) as { reservation_id: string; status: MatchResult['status']; i_won: boolean; mine: boolean }[]).map((r) => ({
    reservationId: r.reservation_id,
    status: r.status,
    iWon: r.i_won,
    mine: r.mine,
  }));
}

// Les joueurs identifiés d'un match (créateur + invités/rejoints acceptés) — pour cocher qui a gagné.
export async function fetchMatchPlayers(reservationId: string): Promise<MatchPlayer[] | null> {
  const { data, error } = await supabase.rpc('fetch_match_players', { p_reservation_id: reservationId });
  if (error) return null;
  return ((data ?? []) as { user_id: string; name: string }[]).map((p) => ({ userId: p.user_id, name: p.name }));
}

// Saisir le résultat. 'no_players' = moins de 2 comptes rattachés au match (rien à confirmer).
export async function submitMatchResult(reservationId: string, winnerIds: string[]): Promise<'ok' | 'exists' | 'no_players' | 'error'> {
  const { data, error } = await supabase.rpc('submit_match_result', {
    p_reservation_id: reservationId,
    p_winner_ids: winnerIds,
  });
  if (error) return 'error';
  return data === 'ok' || data === 'exists' || data === 'no_players' ? data : 'error';
}

// Les résultats saisis par un AUTRE joueur qui attendent MA confirmation.
export async function fetchResultsToConfirm(): Promise<ResultToConfirm[] | null> {
  const { data, error } = await supabase.rpc('fetch_results_to_confirm');
  if (error) return null;
  return (
    (data ?? []) as {
      result_id: string;
      reservation_id: string;
      club_name: string | null;
      date_label: string | null;
      time: string | null;
      winner_names: string | null;
      submitted_name: string | null;
    }[]
  ).map((r) => ({
    resultId: r.result_id,
    reservationId: r.reservation_id,
    clubName: r.club_name ?? '',
    dateLabel: r.date_label ?? '',
    time: r.time ?? '',
    winnerNames: r.winner_names ?? '',
    submittedName: r.submitted_name ?? 'Un joueur',
  }));
}

// Confirmer (true) ou contester (false) un résultat saisi par un autre joueur.
export async function confirmMatchResult(resultId: string, agree: boolean): Promise<boolean> {
  const { data, error } = await supabase.rpc('confirm_match_result', { p_result_id: resultId, p_agree: agree });
  if (error) return false;
  return data === true;
}
