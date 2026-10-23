// Social & niveau (chantier v3, lot A — SQL 80) : joueurs favoris, fiabilité publique,
// moteur de niveau (historique + réconciliation du chemin « validé à 48 h »).

import { LOYALTY_CAP_DEFAULT, type Loyalty } from './loyalty';
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

// Taux de présence AGRÉGÉ de joueurs (badge « Fiable · N % »), cours exclus (98, décision n° 3).
// Le détail (annulations…) reste réservé au club. null = échec réseau. Clé du Record = userId.
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

// ─── Push « actus et agenda PadelConnect » (98, décision porteur n° 17) ─────────

// Activés par défaut, désactivables dans Profil → Notifications ; notify-club v50 ne diffuse les
// actus et l'agenda qu'aux comptes `news_push = true`. true = enregistré ; false = refus (hors
// session) ou échec réseau — jamais un faux ✓. La LECTURE vient du profil, chargé par le store
// (tranche `newsPush`, session + premier plan).
export async function setNewsPush(on: boolean): Promise<boolean> {
  const { data, error } = await supabase.rpc('set_news_push', { p_on: on });
  return !error && data === true;
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

// ─── Fidélité (82, règle cible 92, décisions 98) ────────────────────────────────
// « 10 réservations CRÉÉES et JOUÉES = −50 % sur le prochain match (jusqu'au plafond), offert
// par PadelConnect ». Logique pure (code, remise, progression) : src/lib/loyalty.ts. Depuis la 98,
// `my_loyalty` exclut les cours (décision n° 3) et ne compte dans `claimed` que les réclamations
// de la règle cible (décision n° 4 : les anciennes repartent à zéro, mais restent listées et
// servables par my_loyalty_claims, numéros de cycle conservés).

// Type du compteur (et sa garde d'hydratation `asLoyalty`) : src/lib/loyalty.ts.
export type { Loyalty };

// Mon compteur. null = échec réseau.
export async function fetchMyLoyalty(): Promise<Loyalty | null> {
  const { data, error } = await supabase.rpc('my_loyalty');
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    played: Number(row.played ?? 0),
    playedAll: Number(row.played_all ?? 0),
    claimed: Number(row.claimed ?? 0),
    cap: Number(row.cap ?? LOYALTY_CAP_DEFAULT),
  };
}

// Réclamer la récompense du cycle suivant. 'not_yet' = pas encore 10 nouvelles réservations.
export async function claimLoyalty(): Promise<'ok' | 'not_yet' | 'error'> {
  const { data, error } = await supabase.rpc('claim_loyalty');
  if (error) return 'error';
  return data === 'ok' || data === 'not_yet' ? data : 'error';
}

// Plafond courant de la remise (FCFA), lu du serveur. null = échec réseau (on garde le dernier
// connu ou le défaut, jamais une promesse inventée dans un libellé « jusqu'à … »).
export async function fetchLoyaltyCap(): Promise<number | null> {
  const { data, error } = await supabase.rpc('loyalty_cap');
  if (error || typeof data !== 'number') return null;
  return data;
}

// Opérateur : règle le plafond (bornes serveur [100, 1 000 000]). true = enregistré.
export async function setLoyaltyCap(cap: number): Promise<boolean> {
  const { data, error } = await supabase.rpc('set_loyalty_cap', { p_cap: cap });
  return !error && data === true;
}

// Une réclamation : `code` = le justificatif à montrer au club ; `clubId`/`amount` renseignés
// une fois la remise servie par un club (null si servie en secours par PadelConnect).
export type MyLoyaltyClaim = {
  cycle: number;
  claimedAt: number;
  served: boolean;
  code: string;
  clubId: string | null;
  amount: number | null;
};

// MES cycles réclamés (le justificatif « montre ce code au club » doit SURVIVRE au démontage de
// l'onglet — sans cette lecture, la preuve ne s'affichait qu'une fois). null = échec réseau.
export async function fetchMyLoyaltyClaims(): Promise<MyLoyaltyClaim[] | null> {
  const { data, error } = await supabase.rpc('my_loyalty_claims');
  if (error) return null;
  return (
    (data ?? []) as {
      cycle: number;
      claimed_at: string;
      served: boolean;
      code: string | null;
      club_id: string | null;
      amount: number | null;
    }[]
  ).map((r) => ({
    cycle: r.cycle,
    claimedAt: new Date(r.claimed_at).getTime(),
    served: r.served === true,
    code: r.code ?? '', // serveur d'avant la 92 : pas de colonne code → '' (le profil masque alors le bloc)
    clubId: r.club_id ?? null,
    amount: r.amount ?? null,
  }));
}

export type LoyaltyClaim = {
  id: string;
  userId: string | null; // null = compte supprimé (la remise servie reste au décompte, SQL 92)
  playerName: string;
  cycle: number;
  claimedAt: number;
  served: boolean;
  code: string;
  clubId: string | null;
  amount: number | null;
  matchPrice: number | null; // prix du match déclaré par le club au service (null : secours PadelConnect)
  servedAt: number | null;
};

// Opérateur : réclamations (les non servies d'abord). null = échec réseau.
export async function fetchLoyaltyClaims(): Promise<LoyaltyClaim[] | null> {
  const { data, error } = await supabase.rpc('fetch_loyalty_claims');
  if (error) return null;
  return (
    (data ?? []) as {
      id: string;
      user_id: string | null;
      player_name: string;
      cycle: number;
      claimed_at: string;
      served: boolean;
      code: string;
      club_id: string | null;
      amount: number | null;
      match_price: number | null;
      served_at: string | null;
    }[]
  ).map((r) => ({
    id: r.id,
    userId: r.user_id ?? null,
    playerName: r.player_name,
    cycle: r.cycle,
    claimedAt: new Date(r.claimed_at).getTime(),
    served: r.served,
    code: r.code,
    clubId: r.club_id ?? null,
    amount: r.amount ?? null,
    matchPrice: r.match_price ?? null,
    servedAt: r.served_at ? new Date(r.served_at).getTime() : null,
  }));
}

// Opérateur, cas de SECOURS : marque une réclamation « servie » en main propre par PadelConnect
// (sans club ni montant → rien n'est déduit à un club). true = ok.
export async function serveLoyaltyClaim(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('serve_loyalty_claim', { p_id: id });
  return !error && data === true;
}

const SERVE_STATUSES = ['ok', 'not_found', 'already', 'over_cap', 'invalid', 'forbidden', 'rate_limited'] as const;
export type ServeLoyaltyStatus = (typeof SERVE_STATUSES)[number] | 'error';

// Gérant : sert la remise du code montré par le joueur (montant RÉELLEMENT remis, ≤ moitié du
// prix du match ET ≤ plafond ; le prix est tracé) — atomique côté serveur (double service →
// 'already') ; 'rate_limited' = 30 essais / heure dépassés (anti-devinette des codes). 'error' =
// échec réseau (réessayer a du sens).
export async function clubServeLoyaltyClaim(clubId: string, code: string, amount: number, matchPrice: number): Promise<ServeLoyaltyStatus> {
  const { data, error } = await supabase.rpc('club_serve_loyalty_claim', {
    p_club_id: clubId,
    p_claim_code: code,
    p_amount: amount,
    p_match_price: matchPrice,
  });
  if (error) return 'error';
  return SERVE_STATUSES.find((st) => st === data) ?? 'error';
}

export type ClubLoyaltyServed = {
  id: string;
  playerName: string;
  code: string;
  amount: number;
  matchPrice: number | null;
  servedAt: number;
};

// Gérant : les remises servies par SON club (récentes d'abord) — ce qui sera déduit de son
// décompte. null = échec réseau (≠ [] = aucune remise).
export async function fetchClubLoyaltyServed(clubId: string): Promise<ClubLoyaltyServed[] | null> {
  const { data, error } = await supabase.rpc('club_loyalty_served', { p_club_id: clubId });
  if (error) return null;
  return (
    (data ?? []) as { id: string; player_name: string; code: string; amount: number; match_price: number | null; served_at: string }[]
  ).map((r) => ({
    id: r.id,
    playerName: r.player_name,
    code: r.code,
    amount: Number(r.amount ?? 0),
    matchPrice: r.match_price ?? null,
    servedAt: new Date(r.served_at).getTime(),
  }));
}

export type LoyaltyServedLine = { clubId: string; amount: number; servedAt: number };

// Opérateur : remises servies par les clubs sur [from, to) — regroupées côté client par club ×
// semaine du service (loyaltyServedByWeek) et déduites du décompte. null = échec réseau.
export async function fetchOperatorLoyaltyServed(fromMs: number, toMs: number): Promise<LoyaltyServedLine[] | null> {
  const { data, error } = await supabase.rpc('operator_loyalty_served', {
    p_from: new Date(fromMs).toISOString(),
    p_to: new Date(toMs).toISOString(),
  });
  if (error) return null;
  return ((data ?? []) as { club_id: string; amount: number; served_at: string }[]).map((r) => ({
    clubId: r.club_id,
    amount: Number(r.amount ?? 0),
    servedAt: new Date(r.served_at).getTime(),
  }));
}

// Opérateur : coût total de la fidélité sur [from, to) (somme EXACTE des remises servies par les
// clubs + nombre). null = échec réseau.
export async function fetchOperatorLoyaltyCost(fromMs: number, toMs: number): Promise<{ total: number; served: number } | null> {
  const { data, error } = await supabase.rpc('operator_loyalty_cost', {
    p_from: new Date(fromMs).toISOString(),
    p_to: new Date(toMs).toISOString(),
  });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return { total: Number(row.total ?? 0), served: Number(row.served ?? 0) };
}
