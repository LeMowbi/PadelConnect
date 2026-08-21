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
  id: string;
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
    .select('id, delta, level_before, level_after, reason, created_at')
    // Tri secondaire par id : reconcile_my_levels applique jusqu'à 50 matchs dans UNE transaction
    // (created_at identiques) — sans lui, l'ordre serait arbitraire entre ces lignes.
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);
  if (error) return null;
  return (
    (data ?? []) as { id: string; delta: number; level_before: number; level_after: number; reason: string; created_at: string }[]
  ).map((r) => ({
    id: r.id,
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

// ─── Liste d'attente sur créneau complet (81) ───────────────────────────────────

// Poser une alerte « me prévenir si ça se libère ». 'past' = créneau déjà passé.
export async function joinSlotWaitlist(
  clubId: string,
  dateKey: string,
  time: string,
  durationMin: 60 | 90,
): Promise<'ok' | 'past' | 'error'> {
  const { data, error } = await supabase.rpc('join_slot_waitlist', {
    p_club_id: clubId,
    p_date_key: dateKey,
    p_time: time,
    p_duration: durationMin,
  });
  if (error) return 'error';
  return data === 'ok' || data === 'past' ? data : 'error';
}

// Retirer mon alerte. Tri-état : 'removed' = retirée ; 'absent' = la ligne n'existait DÉJÀ plus
// (consommée one-shot par un push, purgée par le trigger 89 ou par la purge des passées — refus
// DÉFINITIF, à traiter comme un succès idempotent) ; 'error' = échec réseau, réessayer a du sens.
export type LeaveWaitlistStatus = 'removed' | 'absent' | 'error';
export async function leaveSlotWaitlist(clubId: string, dateKey: string, time: string): Promise<LeaveWaitlistStatus> {
  const { data, error } = await supabase.rpc('leave_slot_waitlist', { p_club_id: clubId, p_date_key: dateKey, p_time: time });
  if (error) return 'error';
  return data === true ? 'removed' : 'absent';
}

// Mes alertes posées (pour afficher l'état « Alerte posée ✓ » dans le tunnel). null = échec réseau.
export async function fetchMySlotWaitlist(): Promise<{ clubId: string; dateKey: string; time: string }[] | null> {
  const { data, error } = await supabase.from('slot_waitlist').select('club_id, date_key, time');
  if (error) return null;
  return ((data ?? []) as { club_id: string; date_key: string; time: string }[]).map((r) => ({
    clubId: r.club_id,
    dateKey: r.date_key,
    time: r.time,
  }));
}

// ─── Alertes « un match à ton niveau » (81) ─────────────────────────────────────

// Préférence serveur (le ciblage se fait dans notify-club). true = enregistrée.
export async function setMatchAlerts(on: boolean): Promise<boolean> {
  const { data: session } = await supabase.auth.getSession();
  const uid = session?.session?.user?.id;
  if (!uid) return false;
  const { error } = await supabase.from('profiles').update({ match_alerts: on }).eq('id', uid);
  return !error;
}

// Lecture de la préférence (l'écran Profil la charge à l'ouverture — pas de tranche store).
export async function fetchMatchAlerts(): Promise<boolean | null> {
  const { data: session } = await supabase.auth.getSession();
  const uid = session?.session?.user?.id;
  if (!uid) return null;
  const { data, error } = await supabase.from('profiles').select('match_alerts').eq('id', uid).maybeSingle();
  if (error || !data) return null;
  return data.match_alerts === true;
}

// ─── Suivre un club (81) — synchronise le cœur favori LOCAL vers le serveur ─────

// SET idempotent (pas un toggle) : re-jouable sans risque après un échec réseau. Best-effort —
// le cœur local reste la vérité d'affichage, le serveur ne sert qu'au ciblage des push.
export async function setClubFollow(clubId: string, on: boolean): Promise<boolean> {
  const { data, error } = await supabase.rpc('follow_club', { p_club_id: clubId, p_on: on });
  return !error && data === true;
}

// Mes clubs suivis côté serveur (RLS select-own) — sert à la réconciliation de session avec les
// cœurs favoris locaux (les cœurs posés AVANT la 81 n'ont pas de ligne serveur). null = échec réseau.
export async function fetchMyFollowedClubIds(): Promise<string[] | null> {
  const { data, error } = await supabase.from('club_followers').select('club_id');
  if (error) return null;
  return ((data ?? []) as { club_id: string }[]).map((r) => r.club_id).filter(Boolean);
}

// ─── Fidélité « 10 parties = 1 récompense » (82) ────────────────────────────────

export type Loyalty = { played: number; claimed: number };

// Mon compteur (parties réellement jouées + cycles déjà réclamés). null = échec réseau.
export async function fetchMyLoyalty(): Promise<Loyalty | null> {
  const { data, error } = await supabase.rpc('my_loyalty');
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return { played: Number(row.played ?? 0), claimed: Number(row.claimed ?? 0) };
}

// Réclamer la récompense du cycle suivant. 'not_yet' = pas encore 10 nouvelles parties.
export async function claimLoyalty(): Promise<'ok' | 'not_yet' | 'error'> {
  const { data, error } = await supabase.rpc('claim_loyalty');
  if (error) return 'error';
  return data === 'ok' || data === 'not_yet' ? data : 'error';
}

// Texte de la récompense, réglé par l'opérateur (app_config). null = échec réseau, '' = non réglé.
export async function fetchLoyaltyReward(): Promise<string | null> {
  const { data, error } = await supabase.from('app_config').select('value').eq('key', 'loyalty_reward').maybeSingle();
  if (error) return null;
  return data?.value ?? '';
}

// Opérateur : règle le texte de la récompense. true = enregistré.
export async function setLoyaltyReward(text: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('set_app_config', { p_key: 'loyalty_reward', p_value: text });
  return !error && data === true;
}

export type MyLoyaltyClaim = { cycle: number; claimedAt: number; served: boolean };

// MES cycles réclamés (le justificatif « montre cet écran au club » doit SURVIVRE au démontage
// de l'onglet — sans cette lecture, la preuve ne s'affichait qu'une fois). null = échec réseau.
export async function fetchMyLoyaltyClaims(): Promise<MyLoyaltyClaim[] | null> {
  const { data, error } = await supabase.rpc('my_loyalty_claims');
  if (error) return null;
  return ((data ?? []) as { cycle: number; claimed_at: string; served: boolean }[]).map((r) => ({
    cycle: r.cycle,
    claimedAt: new Date(r.claimed_at).getTime(),
    served: r.served === true,
  }));
}

export type LoyaltyClaim = { id: string; userId: string; playerName: string; cycle: number; claimedAt: number; served: boolean };

// Opérateur : réclamations à servir (les non servies d'abord). null = échec réseau.
export async function fetchLoyaltyClaims(): Promise<LoyaltyClaim[] | null> {
  const { data, error } = await supabase.rpc('fetch_loyalty_claims');
  if (error) return null;
  return ((data ?? []) as { id: string; user_id: string; player_name: string; cycle: number; claimed_at: string; served: boolean }[]).map(
    (r) => ({
      id: r.id,
      userId: r.user_id,
      playerName: r.player_name,
      cycle: r.cycle,
      claimedAt: new Date(r.claimed_at).getTime(),
      served: r.served,
    }),
  );
}

// Opérateur : marque une réclamation « servie » (remise en main propre faite). true = ok.
export async function serveLoyaltyClaim(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('serve_loyalty_claim', { p_id: id });
  return !error && data === true;
}
