// Fermetures sur PÉRIODE (54) — modèle + prédicat PURS (aucun import : testables sous node).
// « Terrain 2 fermé du 10 au 24 juillet (travaux) » : terrain précis ou tout le club,
// toute la journée ou certaines heures. La couche réseau vit dans src/lib/reservations.ts.

// « HH:MM » → minutes depuis minuit (ou null). Copie locale minimale de courtSchedule.toMin :
// ce module reste sans import pour tourner tel quel sous node (strip-types) ET dans Metro.
function toMin(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min !== 0)) return null;
  return h * 60 + min;
}

export type BlockedRange = {
  id: string;
  clubId: string;
  court: string | null; // null = tous les terrains
  dateFrom: string; // clés de jour 'AAAA-MM-JJ' (UTC, comme partout)
  dateTo: string;
  times: string[] | null; // null = toute la journée
  reason: string;
};

// Une période fermée couvre-t-elle un créneau candidat (jour, heure, DURÉE) pour ce terrain ?
// Les clés de jour se comparent lexicographiquement (format fixe AAAA-MM-JJ), bornes INCLUSES.
// Quand `times` est renseigné, chaque heure fermée T ferme l'intervalle [T, T+90) — on bloque le
// candidat [time, time+durationMin) dès qu'il CHEVAUCHE une heure fermée (miroir EXACT de la
// garde serveur `reservations_insert_guard` : `hhmm(bt) < hhmm(time)+dur && hhmm(time) < hhmm(bt)+90`).
// `durationMin` par défaut 90 → l'ancien comportement « l'heure listée est fermée » est préservé.
export function rangeBlocks(range: BlockedRange, dateKey: string, time: string, court: string, durationMin = 90): boolean {
  if (dateKey < range.dateFrom || dateKey > range.dateTo) return false;
  if (range.court !== null && range.court !== court) return false;
  if (range.times === null) return true; // toute la journée
  const tMin = toMin(time);
  if (tMin === null) return false;
  return range.times.some((bt) => {
    const b = toMin(bt);
    return b !== null && b < tMin + durationMin && tMin < b + 90;
  });
}
