// Grille de créneaux PAR TERRAIN, à durée variable (1h ou 1h30). Module PUR et testable
// (aucun import runtime — n'importe QUE des types, effacés à l'exécution), réutilisé par la
// disponibilité, l'éditeur Espace Club, le tunnel joueur et les cours.
//
// Chaque terrain a SA grille : une liste de créneaux { heure de début, durée (60|90), fermé? }.
// Deux créneaux d'un même terrain ne se chevauchent JAMAIS (intervalle demi-ouvert `[t, t+d)`,
// comparaison stricte `<` — deux créneaux qui se TOUCHENT sont OK : 08:00·1h30 puis 09:30·1h).
//
// Créneau fermé : `x: true` (ex. pause déjeuner). C'est la représentation CANONIQUE d'un créneau
// fermé récurrent — `resolveCourtSlots` y replie aussi l'ancien préfixe « ! » (grille club héritée)
// et l'ancienne map `court_closed`, pour qu'un club pas encore re-réglé ne « rouvre » aucune fermeture.

export type CourtSlot = { t: string; d: 60 | 90; x?: boolean };

// Config d'un club telle que lue (les trois champs sont hérités/optionnels).
export type CourtScheduleConfig = {
  courtSlots?: Record<string, CourtSlot[]> | null; // grille par terrain (source de vérité si présente)
  slots?: string[] | null; // ancienne grille club unique (heures « HH:MM », « !HH:MM » = fermé) @90
  courtClosed?: Record<string, string[]> | null; // anciennes fermetures récurrentes par terrain
};

const CLOSED_PREFIX = '!';

// « HH:MM » → minutes depuis minuit, ou null si invalide (accepte « H:MM » ou « HH:MM », 24:00 = 1440).
export function toMin(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min !== 0)) return null;
  return h * 60 + min;
}

// Libellé humain d'une durée (badge, messages).
export function durationLabel(d: number): string {
  return d === 60 ? '1h' : '1h30';
}

// Fin d'un créneau en minutes (début + durée), ou null si l'heure est invalide.
export function slotEnd(t: string, d: number): number | null {
  const s = toMin(t);
  return s === null ? null : s + d;
}

// Deux créneaux se chevauchent-ils ? Intervalles DEMI-OUVERTS `[début, fin)`, comparaison stricte :
// des créneaux adjacents (08:00·1h30 → 09:30 et 09:30·1h) ne se chevauchent PAS. Chacun utilise SA
// PROPRE durée (≠ tampon fixe). C'est la même convention que la contrainte d'exclusion serveur (int8range `[)`).
export function overlaps(a: CourtSlot, b: CourtSlot): boolean {
  const as = toMin(a.t);
  const bs = toMin(b.t);
  if (as === null || bs === null) return false;
  return as < bs + b.d && bs < as + a.d;
}

// Un horaire (heure + durée) peut-il rejoindre la grille d'un terrain ? PURE : format (pas de 30 min),
// pas avant 05:00, la session tient avant minuit, pas déjà présent, aucun chevauchement (durée propre).
export function canAddCourtSlot(existing: CourtSlot[], t: string, d: 60 | 90): { ok: true } | { ok: false; error: string } {
  const s = toMin(t);
  if (s === null || s % 30 !== 0) return { ok: false, error: 'Heure invalide (par pas de 30 min, ex. 09:00 ou 09:30).' };
  if (d !== 60 && d !== 90) return { ok: false, error: 'Durée invalide (1h ou 1h30).' };
  if (s < 5 * 60) return { ok: false, error: 'Pas de créneau avant 05:00.' };
  if (s + d > 24 * 60) return { ok: false, error: `La session (${durationLabel(d)}) doit finir au plus tard à minuit.` };
  const cand: CourtSlot = { t, d };
  for (const e of existing) {
    if (toMin(e.t) === s) return { ok: false, error: `Le créneau ${t} existe déjà sur ce terrain.` };
    if (overlaps(cand, e)) return { ok: false, error: `Chevauche le créneau ${e.t} (${durationLabel(e.d)}).` };
  }
  return { ok: true };
}

// Créneaux OUVERTS d'un terrain (fermés `x` exclus), triés par heure.
export function openCourtSlots(courtSlots: Record<string, CourtSlot[]>, court: string): CourtSlot[] {
  return (courtSlots[court] ?? [])
    .filter((s) => !s.x)
    .slice()
    .sort((a, b) => (toMin(a.t) ?? 0) - (toMin(b.t) ?? 0));
}

// Durée d'un créneau OUVERT d'un terrain à une heure donnée (pour tarif/cours), ou null s'il n'existe pas.
export function slotDurationAt(courtSlots: Record<string, CourtSlot[]>, court: string, t: string): 60 | 90 | null {
  const s = (courtSlots[court] ?? []).find((x) => x.t === t && !x.x);
  return s ? s.d : null;
}

// Ensemble des durées RÉELLEMENT proposées (ouvertes) par un club sur ses terrains — pour `minPrice`
// (« dès X F » ne doit jamais annoncer une durée que le club n'offre pas).
export function offeredDurations(courtSlots: Record<string, CourtSlot[]>, courts: string[]): Set<60 | 90> {
  const out = new Set<60 | 90>();
  for (const c of courts) for (const s of openCourtSlots(courtSlots, c)) out.add(s.d);
  return out;
}

// Normalise une grille terrain stockée : durée bornée à 60|90 (défaut 90), heure valide, dédup par
// heure (premier gagne), tri par heure.
function normalize(arr: CourtSlot[]): CourtSlot[] {
  const seen = new Set<number>();
  const out: CourtSlot[] = [];
  for (const s of arr) {
    const m = toMin(s.t);
    if (m === null || seen.has(m)) continue;
    seen.add(m);
    out.push({ t: s.t, d: s.d === 60 ? 60 : 90, ...(s.x ? { x: true } : {}) });
  }
  return out.sort((a, b) => (toMin(a.t) ?? 0) - (toMin(b.t) ?? 0));
}

// Dérive une grille terrain @90 depuis l'ancienne grille club « HH:MM »/« !HH:MM », en repliant AUSSI
// les fermetures récurrentes `court_closed` en `x:true` (sinon un club pas re-réglé rouvrirait ses
// pauses). Un créneau fermé par « ! » OU par court_closed est marqué fermé.
function fromLegacy(slots: string[], closed: string[] | null): CourtSlot[] {
  const closedSet = new Set((closed ?? []).map((c) => toMin(c)).filter((m): m is number => m !== null));
  const out: CourtSlot[] = [];
  const seen = new Set<number>();
  for (const entry of slots) {
    const isClosed = entry.startsWith(CLOSED_PREFIX);
    const time = isClosed ? entry.slice(CLOSED_PREFIX.length) : entry;
    const m = toMin(time);
    if (m === null || seen.has(m)) continue;
    seen.add(m);
    const shut = isClosed || closedSet.has(m);
    out.push({ t: time, d: 90, ...(shut ? { x: true } : {}) });
  }
  return out.sort((a, b) => (toMin(a.t) ?? 0) - (toMin(b.t) ?? 0));
}

// Résout la grille EFFECTIVE de chaque terrain, avec repli rétro-compatible.
//   • `courtSlots[court]` présent → source de vérité (normalisée).
//   • `courtSlots` présent mais CE terrain absent (terrain ajouté après migration) → défaut @90 (fallback).
//   • `courtSlots` absent → dérive de l'ancienne grille `slots` (+ court_closed) @90.
//   • rien du tout → grille par défaut `fallback` @90 (les clubs sans config restent réservables).
// `fallback` = SAMPLE_SLOTS (passé par l'appelant : le module reste PUR, sans import de données app).
export function resolveCourtSlots(cfg: CourtScheduleConfig, courts: string[], fallback: string[]): Record<string, CourtSlot[]> {
  const out: Record<string, CourtSlot[]> = {};
  // Objet VIDE `{}` traité comme `null` : le contrat rétro-compat veut qu'un « efface » (aucune
  // grille par terrain) DÉRIVE de l'ancienne grille `slots` + court_closed. Sans ce garde, `{}`
  // (truthy) tomberait sur le défaut @90 et rouvrirait silencieusement les fermetures héritées.
  const cs = cfg.courtSlots && Object.keys(cfg.courtSlots).length ? cfg.courtSlots : null;
  const legacy = cfg.slots && cfg.slots.length ? cfg.slots : null;
  for (const court of courts) {
    if (cs && Array.isArray(cs[court])) {
      out[court] = normalize(cs[court]);
    } else if (cs) {
      // grille par terrain existante mais ce terrain n'y est pas → défaut @90
      out[court] = fromLegacy(fallback, null);
    } else if (legacy) {
      out[court] = fromLegacy(legacy, cfg.courtClosed?.[court] ?? null);
    } else {
      out[court] = fromLegacy(fallback, cfg.courtClosed?.[court] ?? null);
    }
  }
  return out;
}
