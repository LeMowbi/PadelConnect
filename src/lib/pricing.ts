// Tarification par plage horaire. Chaque gérant définit librement jusqu’à 3 plages
// (heure de début, heure de fin, prix 1h30 + prix 1h optionnel — dérivé à ⅔, arrondi à la centaine, si vide). Sans plage,
// le club garde son tarif unique (priceFrom) — rétro-compatible. Le prix RÉEL d’un créneau est stocké sur la
// réservation au moment de la création (cf. addReservation), pour que la commission
// opérateur et la répartition « par joueur » soient exactes même si le tarif change.

import type { Club, PriceTier } from '@/data/clubs';
import { fcfa } from './format.ts';

// Plages valides d’un club (prix 1h30 > 0 et bornes renseignées). On n’exige PAS `price60` :
// il est OPTIONNEL (dérivé si absent), donc un club 100 % 1h30 reste valide.
export function priceTiersFor(club: Club): PriceTier[] {
  return (club.priceTiers ?? []).filter((t) => t.price > 0 && t.start && t.end);
}

// Prix 1h DÉRIVÉ d’un prix 1h30 : ⅔ arrondi à la CENTAINE (T-10 : 16 700, jamais « 16 667 FCFA »),
// borné au plancher. Une seule division (× 2 / 300) : un ⅔ qui tombe pile sur 50 (1 575 → 1 050)
// reste exact et part à la centaine supérieure. Recopié tel quel par le site (prix60Derive, site.js).
function derived60(price90: number): number {
  return Math.max(PRICE_MIN, Math.round((price90 * 2) / 300) * 100);
}

// Prix 1h d’une plage : `price60` s’il est saisi (jamais arrondi), sinon dérivé (derived60).
export function price60Of(tier: PriceTier): number {
  return tier.price60 && tier.price60 > 0 ? tier.price60 : derived60(tier.price);
}

// Prix 1h dérivé du tarif unique d’un club sans plage (priceFrom = prix 1h30 indicatif).
function flat60(club: Club): number {
  return derived60(club.priceFrom);
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
// choisit la colonne (1h/1h30). Sinon le tarif unique. Comparaison NUMÉRIQUE (« 9:00 » serait
// sinon mal classée face à « 16:00 »).
// Créneau HORS de toute plage (le gérant a élargi ses horaires sans retoucher ses plages — il en
// est averti à l’ajout) : prix de la plage la plus PROCHE dans le temps (celle qui vient de finir
// ou celle qui va commencer ; à égalité, celle qui PRÉCÈDE — le créneau prolonge la plage qu’il
// suit). Le prix minimum du club aurait bradé une heure chère ajoutée en fin de soirée (R-67).
// Une heure illisible garde la ceinture de sécurité historique : le prix minimum.
export function priceForSlot(club: Club, time: string, durationMin: number = 90): number {
  const tiers = priceTiersFor(club);
  if (tiers.length) {
    const tm = timeToMinutes(time);
    if (tm === null) return minPrice(club, new Set([durationMin === 60 ? 60 : 90]));
    let nearest: PriceTier | undefined;
    let nearestGap = Infinity;
    let nearestStart = Infinity;
    for (const t of tiers) {
      const s = timeToMinutes(t.start);
      const e = timeToMinutes(t.end);
      if (s === null || e === null) continue;
      if (tm >= s && tm < e) return priceOfTier(t, durationMin); // l’heure tombe dans la plage
      const gap = tm < s ? s - tm : tm - e; // fin EXCLUSIVE : un créneau à `e` pile est à 0 min
      if (gap < nearestGap || (gap === nearestGap && s < nearestStart)) {
        nearest = t;
        nearestGap = gap;
        nearestStart = s;
      }
    }
    if (nearest) return priceOfTier(nearest, durationMin);
    return minPrice(club, new Set([durationMin === 60 ? 60 : 90]));
  }
  return durationMin === 60 ? flat60(club) : club.priceFrom;
}

// ——— Commission PadelConnect (Espace opérateur) ———
// Commission d’une UNITÉ DE FACTURATION (un club × une semaine) : volume = somme des prix figés
// des parties jouées, × le taux PROPRE au club, arrondi UNE seule fois au franc. Tous les montants
// de l’opérateur (ligne du club, décompte WhatsApp, export, relance, « cette semaine », cumul
// 6 mois) additionnent CES montants : arrondir par résa ou sur un total global donnait 148 ici et
// 147 là pour la même semaine (R-66). Le produit est d’abord ramené au millionième : en double,
// 1 350 × 0,35 vaut 472,49999999999994 et serait arrondi à 472 au lieu de 473.
export function commissionOf(revenue: number, rate: number): number {
  return Math.round(Math.round(revenue * rate * 1e6) / 1e6);
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
      return { ok: false, error: `Tarif 1h30 invalide (${fcfa(p.t.price)}) : entre ${fcfa(PRICE_MIN)} et ${fcfa(PRICE_MAX)} la session.` };
    }
    // price60 est OPTIONNEL (dérivé si absent) ; s'il est saisi, il respecte les mêmes bornes.
    if (p.t.price60 != null && (p.t.price60 < PRICE_MIN || p.t.price60 > PRICE_MAX)) {
      return { ok: false, error: `Tarif 1h invalide (${fcfa(p.t.price60)}) : entre ${fcfa(PRICE_MIN)} et ${fcfa(PRICE_MAX)} la session.` };
    }
    // Cohérence économique : une session d'1h ne peut pas coûter PLUS cher qu'une d'1h30 (sinon
    // la fiche afficherait « 1h · 30 000 » au-dessus de « 1h30 · 20 000 » — absurde pour le joueur).
    if (p.t.price60 != null && p.t.price60 > p.t.price) {
      return { ok: false, error: `Le prix 1h (${fcfa(p.t.price60)}) ne peut pas dépasser le prix 1h30 (${fcfa(p.t.price)}).` };
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
      error: `Tes plages doivent couvrir ${range}. La première commence à ${first.t.start}, après l’ouverture (${fmt(openMin)}).`,
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
