// Tarification par plage horaire. Chaque gérant définit librement jusqu'à 3 plages
// (heure de début, heure de fin, prix). Sans plage, le club garde son tarif unique
// (priceFrom) — rétro-compatible. Le prix RÉEL d'un créneau est stocké sur la
// réservation au moment de la création (cf. addReservation), pour que la commission
// opérateur et la répartition « par joueur » soient exactes même si le tarif change.

import type { Club, PriceTier } from '@/data/clubs';

// Plages valides d'un club (prix > 0 et bornes renseignées).
export function priceTiersFor(club: Club): PriceTier[] {
  return (club.priceTiers ?? []).filter((t) => t.price > 0 && t.start && t.end);
}

// Prix « dès » affiché : le minimum des plages, sinon le tarif unique.
export function minPrice(club: Club): number {
  const tiers = priceTiersFor(club);
  return tiers.length ? Math.min(...tiers.map((t) => t.price)) : club.priceFrom;
}

// Prix d'un créneau « HH:MM » : la plage qui le contient, sinon le tarif unique.
// Le repli `minPrice` est une CEINTURE DE SÉCURITÉ silencieuse : grâce à
// validateTiers (à l'enregistrement), une saisie valide couvre 07:00→24:00 sans
// trou, donc ce repli n'est en pratique jamais atteint.
export function priceForSlot(club: Club, time: string): number {
  const tiers = priceTiersFor(club);
  if (tiers.length) {
    const match = tiers.find((t) => time >= t.start && time < t.end);
    return match ? match.price : minPrice(club);
  }
  return club.priceFrom;
}

// ——— Regroupement d'affichage par plage nommée (fiche club, purement visuel) ———
// Si le gérant a NOMMÉ ses plages, la fiche club les présente en onglets
// (SegmentedControl). On ne regroupe que lorsque TOUTES les plages ont un nom et
// qu'il y a au moins 2 noms distincts ; sinon on rend la liste à plat (rétro-compat).
// Plusieurs plages partageant un même nom sont rangées sous le même onglet, dans
// l'ordre d'origine. Aucune incidence sur le prix : c'est de la présentation.
export function groupTiersByLabel(tiers: PriceTier[]): { label: string; items: PriceTier[] }[] {
  if (tiers.length === 0) return [];
  if (!tiers.every((t) => (t.label ?? '').trim())) return []; // une plage sans nom → pas d'onglets
  const order: string[] = [];
  const byLabel = new Map<string, PriceTier[]>();
  for (const t of tiers) {
    const key = (t.label ?? '').trim();
    if (!byLabel.has(key)) {
      byLabel.set(key, []);
      order.push(key);
    }
    byLabel.get(key)!.push(t);
  }
  if (order.length < 2) return []; // un seul nom → l'onglet n'apporte rien, liste à plat
  return order.map((label) => ({ label, items: byLabel.get(label)! }));
}

// ——— Validation des plages tarifaires (à l'enregistrement, Espace Club) ———
// Fonction PURE et testable. Reçoit les plages COMPLÈTES (les plages incomplètes
// sont déjà ignorées par l'appelant). Règle : soit aucune plage (→ tarif unique,
// rétro-compatible), soit une couverture CONTINUE 07:00 → 24:00, sans trou ni
// chevauchement. Renvoie un message d'erreur précis et actionnable.

const OPEN_MIN = 7 * 60; // 07:00
const CLOSE_MIN = 24 * 60; // 24:00 (minuit, borne de fin exclusive des plages)

// « HH:MM » → minutes depuis minuit, ou null si le format est invalide.
export function timeToMinutes(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((t ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min !== 0)) return null;
  return h * 60 + min;
}

export type TierValidation = { ok: true } | { ok: false; error: string };

export function validateTiers(tiers: PriceTier[]): TierValidation {
  if (tiers.length === 0) return { ok: true }; // aucune plage → le tarif unique s'applique

  const parsed = tiers.map((t) => ({ t, s: timeToMinutes(t.start), e: timeToMinutes(t.end) }));
  for (const p of parsed) {
    if (p.s === null) return { ok: false, error: `Heure de début invalide « ${p.t.start} » (format attendu HH:MM, ex. 07:00).` };
    if (p.e === null) return { ok: false, error: `Heure de fin invalide « ${p.t.end} » (format attendu HH:MM, ex. 16:00).` };
    if (p.s >= p.e) return { ok: false, error: `Plage incohérente : ${p.t.start} doit être avant ${p.t.end}.` };
  }

  const sorted = parsed.slice().sort((a, b) => a.s! - b.s!);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first.s !== OPEN_MIN) {
    return { ok: false, error: `Tes plages doivent couvrir 07:00 → 24:00. La première commence à ${first.t.start} au lieu de 07:00.` };
  }
  if (last.e !== CLOSE_MIN) {
    return { ok: false, error: `Tes plages doivent couvrir 07:00 → 24:00. La dernière finit à ${last.t.end} au lieu de 24:00.` };
  }
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (cur.s! > prev.e!) {
      return { ok: false, error: `Tes plages doivent couvrir 07:00 → 24:00. Trou entre ${prev.t.end} et ${cur.t.start}.` };
    }
    if (cur.s! < prev.e!) {
      return { ok: false, error: `Deux plages se chevauchent (${prev.t.start}–${prev.t.end} et ${cur.t.start}–${cur.t.end}).` };
    }
  }
  return { ok: true };
}
