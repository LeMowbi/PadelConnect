// Fermetures sur PÉRIODE (54) — modèle + prédicat PURS (aucun import : testables sous node).
// « Terrain 2 fermé du 10 au 24 juillet (travaux) » : terrain précis ou tout le club,
// toute la journée ou certaines heures. La couche réseau vit dans src/lib/reservations.ts.

export type BlockedRange = {
  id: string;
  clubId: string;
  court: string | null; // null = tous les terrains
  dateFrom: string; // clés de jour 'AAAA-MM-JJ' (UTC, comme partout)
  dateTo: string;
  times: string[] | null; // null = toute la journée
  reason: string;
};

// Une période fermée couvre-t-elle (jour, heure) pour ce terrain ? Les clés de jour se
// comparent lexicographiquement (format fixe AAAA-MM-JJ), bornes INCLUSES des deux côtés.
export function rangeBlocks(range: BlockedRange, dateKey: string, time: string, court: string): boolean {
  if (dateKey < range.dateFrom || dateKey > range.dateTo) return false;
  if (range.court !== null && range.court !== court) return false;
  return range.times === null || range.times.includes(time);
}
