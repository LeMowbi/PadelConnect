// Score de match (46, règle anti-triche durcie en 49) : CHAQUE joueur saisit les sets de son
// point de vue, l'app dérive la forme canonique et désigne le vainqueur AUTOMATIQUEMENT — pas
// de bouton « confirmer ». Validé UNIQUEMENT si un joueur du camp PERDANT confirme le score
// (saisie « j'ai perdu » en miroir), OU si une saisie GAGNANTE restée SEULE dépasse 48 h.
// Deux « je gagne » identiques ne valident donc jamais (invariant §9). Une victoire validée
// vaut +3 points (seuls les joueurs ayant saisi les marquent). Convention §8 : null = échec réseau.

import { supabase } from './supabase';

// Un set vu du joueur qui saisit : « nous » puis « eux ».
export type MatchSet = { me: number; them: number };

export type MatchScore = {
  reservationId: string;
  entries: number; // nombre de joueurs ayant saisi
  validated: boolean; // un perdant a confirmé, ou saisie gagnante restée seule plus de 48 h
  conflict: boolean; // les saisies ne concordent pas → le match ne compte pas
  mine: boolean; // j'ai saisi mon score
  iWon: boolean; // MA saisie était gagnante (n'a de sens que si mine)
  score: string; // score vu du vainqueur (ex. « 6-3, 6-4 ») — '' si saisies discordantes
  enteredNames: string; // qui d'autre a saisi (prénom + initiale), pour l'invitation à saisir
};

export type SubmitScoreResult = 'validated' | 'waiting' | 'conflict' | 'no_players' | 'error';

// L'état de score de MES matchs (au moins une saisie) — badge sur les passées + invitations.
export async function fetchMyMatchScores(): Promise<MatchScore[] | null> {
  const { data, error } = await supabase.rpc('fetch_my_match_scores');
  if (error) return null;
  return (
    (data ?? []) as {
      reservation_id: string;
      entries: number;
      validated: boolean;
      conflict: boolean;
      mine: boolean;
      i_won: boolean;
      score: string | null;
      entered_names: string | null;
    }[]
  ).map((r) => ({
    reservationId: r.reservation_id,
    entries: r.entries,
    validated: r.validated,
    conflict: r.conflict,
    mine: r.mine,
    iWon: r.i_won,
    score: r.score ?? '',
    enteredNames: r.entered_names ?? '',
  }));
}

// Saisir MON score (1 à 3 sets, de mon point de vue). Le serveur dérive le vainqueur et
// renvoie l'état du match après ma saisie. 'no_players' = moins de 2 comptes rattachés.
export async function submitMatchScore(reservationId: string, sets: MatchSet[]): Promise<SubmitScoreResult> {
  const { data, error } = await supabase.rpc('submit_match_score', {
    p_reservation_id: reservationId,
    p_sets: sets,
  });
  if (error) return 'error';
  return data === 'validated' || data === 'waiting' || data === 'conflict' || data === 'no_players' ? data : 'error';
}

// Quitter un match ouvert qu'on avait rejoint (48) : ma place est réellement libérée (retirée
// de `invited`, players décrémenté) → un autre joueur peut la reprendre. Réservé au participant.
export async function leaveOpenMatch(reservationId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('leave_open_match', { p_id: reservationId });
  return !error && data === true;
}

// Le créateur ouvre / ferme son match aux nouveaux joueurs (48) — les places déjà prises restent.
export async function setMatchOpen(reservationId: string, open: boolean): Promise<boolean> {
  const { data, error } = await supabase.rpc('set_match_open', { p_id: reservationId, p_open: open });
  return !error && data === true;
}
