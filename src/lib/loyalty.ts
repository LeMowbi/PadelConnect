// Fidélité PadelConnect — logique PURE (testée dans tests/loyalty.test.ts).
// Règle cible (décision porteur 2026-10-21/22, SQL 92) : « 10 réservations CRÉÉES par le joueur
// et JOUÉES = −50 % sur son prochain match, plafonné à 5 000 FCFA, offert par PadelConnect ».
// Le joueur montre un CODE (6 caractères) au club ; le club saisit le prix du match, l'app
// calcule la remise, le serveur la plafonne (`club_serve_loyalty_claim`) et elle est DÉDUITE du
// décompte de commission du club sur la semaine du service (operateur.tsx).

import { weekKeyOf } from './days.ts';

// Parties par cycle — même constante que `claim_loyalty` (`v_played / 10`).
export const LOYALTY_CYCLE = 10;
// Plafond par DÉFAUT du serveur (92 : `loyalty_cap()` sans réglage) — référence des tests, jamais affiché ;
// `loyalty_cap()` fait foi (réglable par l'opérateur, bornes [100, 1 000 000]).
export const LOYALTY_CAP_DEFAULT = 5000;
export const LOYALTY_CAP_MIN = 100;
export const LOYALTY_CAP_MAX = 1000000;
// Alphabet du code (SQL `loyalty_new_code`) : ni 0/O ni 1/I — rien à confondre au comptoir.
const LOYALTY_CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;

// Compteur serveur (`my_loyalty`) : `played` = réservations CRÉÉES par le joueur et jouées (base
// de la fidélité) ; `playedAll` = créateur OU invité accepté (base des +2 pts et de la tuile
// « Parties jouées ») ; `cap` = plafond RÉEL de la remise (réglé par l'opérateur) ; null = serveur
// d'avant la 92 (my_loyalty de la 82 : ni plafond ni règle cible → « Fidélité bientôt disponible »).
export type Loyalty = { played: number; playedAll: number; claimed: number; cap: number | null };

// Garde d'HYDRATATION : l'état persisté d'une version antérieure (82 : `{ played, claimed }`,
// sans `playedAll` ni `cap`) ne doit jamais atteindre l'écran — `fcfa(loyalty.cap)` planterait.
// Forme incomplète → null (= « pas encore lu », relu au chargement de session).
export function asLoyalty(raw: unknown): Loyalty | null {
  if (!raw || typeof raw !== 'object') return null;
  const l = raw as Record<string, unknown>;
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  const ok = [l.played, l.playedAll, l.claimed].every(num) && (l.cap === null || num(l.cap));
  return ok
    ? { played: l.played as number, playedAll: l.playedAll as number, claimed: l.claimed as number, cap: l.cap as number | null }
    : null;
}

// Normalisation IDENTIQUE à celle du serveur (majuscules, tout ce qui n'est pas alphanumérique
// retiré) : « ab-c d12 » → « ABCD12 ». Le gérant peut taper comme il veut.
export function normalizeLoyaltyCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Un code PLAUSIBLE (forme) — le serveur seul sait s'il existe. Sert à griser le bouton.
export function isLoyaltyCode(input: string): boolean {
  return LOYALTY_CODE_RE.test(normalizeLoyaltyCode(input));
}

// Remise à servir : −50 % du prix du match, plafonnée. 0 si le prix est invalide (le bouton
// « Servir » reste grisé). Arrondi à l'entier : le serveur exige un montant ≥ 1.
export function loyaltyDiscount(matchPrice: number, cap: number): number {
  if (!Number.isFinite(matchPrice) || matchPrice <= 0) return 0;
  return Math.max(0, Math.min(Math.round(matchPrice / 2), Math.floor(cap)));
}

// Progression de la carte à tampons — exactement la règle de `claim_loyalty` : `pending` =
// cycles complets NON réclamés ; `filled` = pastilles pleines = réservations faites VERS la
// prochaine réclamation (`played − 10 × claimed`, bornée à [0, 10] : 10 quand un cycle attend
// d'être réclamé). Jamais `played % 10` : un joueur qui a plus réclamé que joué (réclamation sous
// la règle de la 82, invitations comprises, ou parties annulées après coup) verrait 9/10 puis 0/10
// sans récompense — sa prochaine remise exige 10 × (claimed + 1) réservations créées et jouées.
// null (compteur pas encore lu) → rien de rempli, rien à réclamer.
export function loyaltyProgress(loyalty: { played: number; claimed: number } | null): { pending: number; filled: number } {
  if (!loyalty) return { pending: 0, filled: 0 };
  const pending = Math.max(0, Math.floor(loyalty.played / LOYALTY_CYCLE) - loyalty.claimed);
  const filled = Math.min(LOYALTY_CYCLE, Math.max(0, loyalty.played - LOYALTY_CYCLE * loyalty.claimed));
  return { pending, filled };
}

// Clé « club × semaine calendaire » — MÊME forme que `operatorPayments` (`<clubId>:<lundi>`).
export function loyaltyWeekKey(clubId: string, week: string): string {
  return `${clubId}:${week}`;
}

// Remises servies regroupées par club × semaine DU SERVICE (pas de la partie) : c'est sur le
// décompte de cette semaine-là que PadelConnect rembourse le club. Lignes vides → {}.
export function loyaltyServedByWeek(lines: { clubId: string; amount: number; servedAt: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of lines) {
    if (!(l.amount > 0)) continue;
    const key = loyaltyWeekKey(l.clubId, weekKeyOf(l.servedAt));
    out[key] = (out[key] ?? 0) + l.amount;
  }
  return out;
}

// Remises de LA semaine `week`, par club ({ clubId: montant }) — y compris les clubs SANS partie
// jouée en app cette semaine-là : leur remise doit quand même figurer au décompte (net négatif =
// PadelConnect la leur reverse), sinon elle disparaissait du décompte, de l'export et du total.
export function loyaltyByClubForWeek(byKey: Record<string, number>, week: string): Record<string, number> {
  const suffix = `:${week}`;
  const out: Record<string, number> = {};
  for (const [key, amount] of Object.entries(byKey)) {
    if (key.endsWith(suffix) && amount > 0) out[key.slice(0, -suffix.length)] = amount;
  }
  return out;
}
