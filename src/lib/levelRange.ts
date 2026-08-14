// Fourchette de niveau d'un match ouvert (81) — logique PURE (aucun import React/Supabase),
// partagée par le tunnel de réservation, la réservation rapide et « Matchs ouverts ».
// `null` = borne NON fixée : les deux bornes nulles = match ouvert à tous les niveaux.
// Le refus d'un joueur hors fourchette est SERVEUR (join_open_match → 'level') ; ce module
// n'en est que le MIROIR d'affichage (mêmes bornes incluses).

// Extension explicite (comme reservationsMap.ts) : ce module est exécuté TEL QUEL par node
// dans tests/levelRange.test.ts, qui ne résout ni l'alias @/ ni les imports sans extension.
import { levelText } from './format.ts';

export const LEVEL_FLOOR = 1; // plancher de niveau de l'app (miroir de clampLevel, store/helpers)
export const LEVEL_CEIL = 7; // plafond (idem) — la contrainte SQL borne aussi [1, 7]
export const LEVEL_RANGE_STEP = 0.5; // pas des mini-steppers (demi-points, comme le quiz)

export type LevelRange = { min: number | null; max: number | null };

// Arrondit au demi-point et borne [1, 7] : aucune saisie ne peut sortir de ce que le serveur
// accepte (contrainte reservations_open_level_range_chk).
export function snapLevel(n: number): number {
  const snapped = Math.round(n / LEVEL_RANGE_STEP) * LEVEL_RANGE_STEP;
  return Math.min(LEVEL_CEIL, Math.max(LEVEL_FLOOR, snapped));
}

// Un pas sur UNE borne. Depuis « — » (borne libre), les deux boutons posent le niveau
// d'ANCRAGE (celui du joueur) : le premier appui donne une valeur crédible plutôt qu'un 1 ou
// un 7 arbitraire. Si l'ordre min ≤ max serait rompu, on pousse l'AUTRE borne — le geste
// demandé est toujours respecté et la fourchette reste valide côté serveur.
export function stepLevelRange(range: LevelRange, edge: 'min' | 'max', dir: 1 | -1, anchor: number): LevelRange {
  const cur = range[edge];
  const next = cur === null ? snapLevel(anchor) : snapLevel(cur + dir * LEVEL_RANGE_STEP);
  const out: LevelRange = edge === 'min' ? { min: next, max: range.max } : { min: range.min, max: next };
  if (out.min !== null && out.max !== null && out.min > out.max) {
    if (edge === 'min') out.max = out.min;
    else out.min = out.max;
  }
  return out;
}

// Mon niveau entre-t-il dans la fourchette ? Miroir EXACT de la garde serveur : bornes
// INCLUSES, une borne nulle n'oppose rien.
export function levelInRange(level: number, min: number | null, max: number | null): boolean {
  if (min !== null && level < min) return false;
  if (max !== null && level > max) return false;
  return true;
}

// Libellé compact : '' (ouverte à tous), « 2,5 – 4 », « 3 » (bornes égales), « 3 et plus »,
// « 4 maximum ». Les demi-points s'écrivent à la virgule française (levelText).
export function levelRangeText(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return min === max ? levelText(min) : `${levelText(min)} – ${levelText(max)}`;
  if (min !== null) return `${levelText(min)} et plus`;
  if (max !== null) return `${levelText(max)} maximum`;
  return '';
}
