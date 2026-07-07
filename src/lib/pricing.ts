// Tarification par plage horaire. Chaque gérant définit librement jusqu’à 3 plages
// (heure de début, heure de fin, prix). Sans plage, le club garde son tarif unique
// (priceFrom) — rétro-compatible. Le prix RÉEL d’un créneau est stocké sur la
// réservation au moment de la création (cf. addReservation), pour que la commission
// opérateur et la répartition « par joueur » soient exactes même si le tarif change.

import type { Club, PriceTier } from '@/data/clubs';

// Plages valides d’un club (prix 1h30 > 0 et bornes renseignées). On n’exige PAS `price60` :
// il est OPTIONNEL (dérivé si absent), donc un club 100 % 1h30 reste valide.
export function priceTiersFor(club: Club): PriceTier[] {
  return (club.priceTiers ?? []).filter((t) => t.price > 0 && t.start && t.end);
}

// Prix 1h d’une plage : `price60` s’il est saisi, sinon dérivé au prorata (⅔) et borné au plancher.
export function price60Of(tier: PriceTier): number {
  return tier.price60 && tier.price60 > 0 ? tier.price60 : Math.max(PRICE_MIN, Math.round((tier.price * 2) / 3));
}

// Prix 1h dérivé du tarif unique d’un club sans plage (priceFrom = prix 1h30 indicatif).
function flat60(club: Club): number {
  return Math.max(PRICE_MIN, Math.round((club.priceFrom * 2) / 3));
}

// Prix d’une session selon sa DURÉE (60|90) pour une plage.
function priceOfTier(tier: PriceTier, durationMin: number): number {
  return durationMin === 60 ? price60Of(tier) : tier.price;
}

// Prix « dès » affiché : le minimum sur (plages × durées RÉELLEMENT proposées). `offered` par défaut
// = {90} (comportement historique : un club sans grille par terrain ne propose que du 1h30). On ne
// compte que les durées offertes → jamais un « dès [prix 1h] » pour un club qui n’a que du 1h30.
export function minPrice(club: Club, offered: Set<60 | 90> = new Set([90])): number {
  const durs: (60 | 90)[] = offered.size ? [...offered] : [90];
  const tiers = priceTiersFor(club);
  if (tiers.length) {
    const cands: number[] = [];
    for (const t of tiers) for (const d of durs) cands.push(priceOfTier(t, d));
    return Math.min(...cands);
  }
  return Math.min(...durs.map((d) => (d === 60 ? flat60(club) : club.priceFrom)));
}

// Prix d’un créneau « HH:MM » pour une DURÉE (défaut 1h30) : l’heure choisit la plage, la durée
// choisit la colonne (1h/1h30). Sinon le tarif unique. Le repli `minPrice` est une CEINTURE DE
// SÉCURITÉ silencieuse : grâce à validateTiers, une saisie valide couvre les heures d’ouverture sans
// trou. Comparaison NUMÉRIQUE (« 9:00 » serait sinon mal classée face à « 16:00 »).
export function priceForSlot(club: Club, time: string, durationMin: number = 90): number {
  const tiers = priceTiersFor(club);
  if (tiers.length) {
    const tm = timeToMinutes(time);
    const match =
      tm === null
        ? undefined
        : tiers.find((t) => {
            const s = timeToMinutes(t.start);
            const e = timeToMinutes(t.end);
            return s !== null && e !== null && tm >= s && tm < e;
          });
    if (match) return priceOfTier(match, durationMin);
    return minPrice(club, new Set([durationMin === 60 ? 60 : 90]));
  }
  return durationMin === 60 ? flat60(club) : club.priceFrom;
}

// ——— Regroupement d’affichage par plage nommée (fiche club, purement visuel) ———
// Si le gérant a NOMMÉ ses plages, la fiche club les présente en onglets
// (SegmentedControl). On ne regroupe que lorsque TOUTES les plages ont un nom et
// qu’il y a au moins 2 noms distincts ; sinon on rend la liste à plat (rétro-compat).
// Plusieurs plages partageant un même nom sont rangées sous le même onglet, dans
// l’ordre d’origine. Aucune incidence sur le prix : c’est de la présentation.
export function groupTiersByLabel(tiers: PriceTier[]): { label: string; items: PriceTier[] }[] {
  if (tiers.length === 0) return [];
  if (!tiers.every((t) => (t.label ?? '').trim())) return []; // une plage sans nom → pas d’onglets
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
  if (order.length < 2) return []; // un seul nom → l’onglet n’apporte rien, liste à plat
  return order.map((label) => ({ label, items: byLabel.get(label)! }));
}

// ——— Validation des plages tarifaires (à l’enregistrement, Espace Club) ———
// Fonction PURE et testable. Reçoit les plages COMPLÈTES (les plages incomplètes
// sont déjà ignorées par l’appelant). Règle : soit aucune plage (→ tarif unique,
// rétro-compatible), soit une couverture CONTINUE des HEURES D’OUVERTURE du club
// (openMin → closeMin), sans trou ni chevauchement. Chaque club ouvrant à son heure,
// les bornes sont passées par l’appelant (déduites des créneaux ouverts) ; à défaut,
// on retombe sur 07:00 → 24:00 (rétro-compatible). Message d’erreur précis et actionnable.

const DEFAULT_OPEN_MIN = 7 * 60; // 07:00 (repli si le club n’a pas d’horaires personnalisés)
const DEFAULT_CLOSE_MIN = 24 * 60; // 24:00 (minuit, borne de fin exclusive des plages)

// « minutes depuis minuit » → « HH:MM » (pour les messages d’erreur).
function fmt(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Bornes de vraisemblance d'un tarif de session — LES MÊMES que le serveur (SQL 40) :
// un prix hors bornes y est refusé en silence, donc on bloque À LA SAISIE avec un message.
export const PRICE_MIN = 1000;
export const PRICE_MAX = 1000000;

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

export function validateTiers(
  tiers: PriceTier[],
  openMin: number = DEFAULT_OPEN_MIN,
  closeMin: number = DEFAULT_CLOSE_MIN,
): TierValidation {
  if (tiers.length === 0) return { ok: true }; // aucune plage → le tarif unique s’applique

  const range = `${fmt(openMin)} → ${fmt(closeMin)}`; // couverture attendue = heures du club
  const parsed = tiers.map((t) => ({ t, s: timeToMinutes(t.start), e: timeToMinutes(t.end) }));
  for (const p of parsed) {
    if (p.s === null) return { ok: false, error: `Heure de début invalide « ${p.t.start} » (format attendu HH:MM, ex. ${fmt(openMin)}).` };
    if (p.e === null) return { ok: false, error: `Heure de fin invalide « ${p.t.end} » (format attendu HH:MM, ex. ${fmt(closeMin)}).` };
    if (p.s >= p.e) return { ok: false, error: `Plage incohérente : ${p.t.start} doit être avant ${p.t.end}.` };
    if (p.t.price < PRICE_MIN || p.t.price > PRICE_MAX) {
      return { ok: false, error: `Tarif 1h30 invalide (${p.t.price} F) : entre 1 000 et 1 000 000 FCFA la session.` };
    }
    // price60 est OPTIONNEL (dérivé si absent) ; s'il est saisi, il respecte les mêmes bornes.
    if (p.t.price60 != null && (p.t.price60 < PRICE_MIN || p.t.price60 > PRICE_MAX)) {
      return { ok: false, error: `Tarif 1h invalide (${p.t.price60} F) : entre 1 000 et 1 000 000 FCFA la session.` };
    }
  }

  // Couverture AU MOINS égale à l'amplitude d'ouverture : une plage qui déborde avant
  // l'ouverture ou après la fermeture est inoffensive (priceForSlot ne matche que les créneaux
  // réellement ouverts) — exiger l'égalité stricte bloquait toute config héritée (ex. plages
  // 07:00→24:00 enregistrées avant les horaires modulables) dès que la grille dérivait d'autres
  // bornes, y compris pour enregistrer un simple changement de WhatsApp ou de position Maps.
  const sorted = parsed.slice().sort((a, b) => a.s! - b.s!);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first.s! > openMin) {
    return {
      ok: false,
      error: `Tes plages doivent couvrir ${range}. La première commence à ${first.t.start}, après l'ouverture (${fmt(openMin)}).`,
    };
  }
  if (last.e! < closeMin) {
    return {
      ok: false,
      error: `Tes plages doivent couvrir ${range}. La dernière finit à ${last.t.end}, avant la fermeture (${fmt(closeMin)}).`,
    };
  }
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (cur.s! > prev.e!) {
      return { ok: false, error: `Tes plages doivent couvrir ${range}. Trou entre ${prev.t.end} et ${cur.t.start}.` };
    }
    if (cur.s! < prev.e!) {
      return { ok: false, error: `Deux plages se chevauchent (${prev.t.start}–${prev.t.end} et ${cur.t.start}–${cur.t.end}).` };
    }
  }
  return { ok: true };
}
