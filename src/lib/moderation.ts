// Modération du contenu généré par les joueurs (UGC) — exigée par l'App Store (Guideline 1.2)
// et Google Play : signaler un avis, bloquer un joueur, et récupérer sa liste de blocages pour
// masquer localement les avis / matchs ouverts des comptes bloqués (SQL 51).

import { supabase } from './supabase';

// ─── Plafonds anti-abus (SQL 94) ───────────────────────────────────────────────
// Le serveur refuse par un CODE, jamais par une panne : 'rate_limited' = fenêtre HORAIRE (30
// recherches de numéro / h, partagées entre la recherche d'ami et la demande d'ami) ;
// 'rate_limited_day' = fenêtre JOURNALIÈRE (20 demandes d'ami, 5 messages support, 10 signalements,
// 3 demandes de club). Une RPC qui renvoie un texte le renvoie en statut ; les triggers et
// find_player_by_phone le LÈVENT (SQLSTATE P0001) → il arrive dans `error.message` (PostgREST).
// Afficher « Connexion impossible — réessaie » serait un mensonge en boucle : on dit la vraie
// fenêtre.
export type RateLimited = 'rate_limited' | 'rate_limited_day';

// Code de plafond porté par une erreur PostgREST (null = autre erreur, réseau compris).
export function rateLimitedCode(error: { message?: string } | null | undefined): RateLimited | null {
  const msg = error?.message ?? '';
  if (msg.includes('rate_limited_day')) return 'rate_limited_day';
  if (msg.includes('rate_limited')) return 'rate_limited';
  return null;
}

// Message honnête par fenêtre (texte horaire décidé par le porteur ; la variante journalière évite
// de promettre « dans une heure » quand le compteur ne se remet à zéro qu'à minuit).
export function rateLimitedMessage(code: RateLimited): string {
  return code === 'rate_limited_day'
    ? 'Doucement 😊 — tu as atteint la limite du jour, réessaie demain'
    : 'Doucement 😊 — réessaie dans une heure';
}

// Signale un avis (motif optionnel). 'ok' = enregistré (l'opérateur modère sous 24 h) ;
// 'rate_limited_day' = plafond de 10 signalements / jour (trigger 94, traverse la RPC) ;
// 'error' = échec réseau / serveur.
export async function reportReview(reviewId: string, reason = ''): Promise<'ok' | 'rate_limited_day' | 'error'> {
  const { data, error } = await supabase.rpc('report_review', { p_review_id: reviewId, p_reason: reason });
  if (error) return rateLimitedCode(error) ? 'rate_limited_day' : 'error';
  return data === true ? 'ok' : 'error';
}

// Bloque un joueur (ses avis et ses matchs ouverts disparaissent de MA vue). true = ok.
export async function blockUser(userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('block_user', { p_user_id: userId });
  return !error && data === true;
}

// Ma liste de comptes bloqués. Convention réseau (CLAUDE.md §8) : `null` en cas d'échec réseau
// (≠ [] = aucun blocage) pour que l'appelant ne réaffiche pas à tort un contenu masqué.
export async function fetchBlockedUserIds(): Promise<string[] | null> {
  const { data, error } = await supabase.rpc('fetch_blocked_users');
  if (error) return null;
  return ((data ?? []) as string[]).filter(Boolean);
}

// ─── Côté OPÉRATEUR : traiter les avis signalés (promesse « modéré sous 24 h ») ───

export type ReviewReport = {
  reportId: string;
  reviewId: string;
  clubId: string;
  authorName: string;
  rating: number;
  reviewText: string;
  reason: string;
  reportedAt: string;
};

type ReportRow = {
  report_id: string;
  review_id: string;
  club_id: string;
  author_name: string;
  rating: number;
  review_text: string;
  reason: string;
  reported_at: string;
};

// Avis signalés (réservé à l'opérateur, SQL 53). null = échec réseau (≠ [] = rien à modérer).
export async function fetchReviewReports(): Promise<ReviewReport[] | null> {
  const { data, error } = await supabase.rpc('fetch_review_reports');
  if (error) return null;
  return ((data ?? []) as ReportRow[]).map((r) => ({
    reportId: r.report_id,
    reviewId: r.review_id,
    clubId: r.club_id,
    authorName: r.author_name,
    rating: r.rating,
    reviewText: r.review_text,
    reason: r.reason,
    reportedAt: r.reported_at,
  }));
}

// Retire l'avis signalé (les signalements liés partent en cascade). true = fait.
export async function operatorDeleteReview(reviewId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('operator_delete_review', { p_review_id: reviewId });
  return !error && data === true;
}

// Classe le signalement sans toucher l'avis (contenu jugé acceptable). true = fait.
export async function operatorDismissReport(reportId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('operator_dismiss_report', { p_report_id: reportId });
  return !error && data === true;
}
