// Disponibilité des terrains — logique centrale, réutilisée par l'écran « Réserver »,
// la fiche de réservation et la création de match. Tout est calculé terrain par terrain
// et indexé sur la KEY stable du jour (AAAA-MM-JJ), jamais sur le libellé d'affichage.

import { SAMPLE_SLOTS, defaultCourts, type Club } from '@/data/clubs';
import type { Competition } from '@/data/competitions';
import type { BlockedSlot, Reservation } from '@/store/AppContext';

export type AvailCtx = {
  clubs: Club[]; // clubs visibles (de base + inscrits activés)
  clubSlots: Record<string, string[]>;
  clubCourts: Record<string, string[]>;
  reservations: Reservation[];
  comps: Competition[];
  blocked: BlockedSlot[]; // créneaux fermés hors app par les clubs
};

// Horaires ouverts par un club (sinon créneaux standards).
export function openSlotsFor(club: Club, clubSlots: Record<string, string[]>): string[] {
  return clubSlots[club.id] ?? SAMPLE_SLOTS;
}

// Terrains d'un club : ceux gérés par le club, sinon « Terrain 1…N » par défaut.
export function courtsFor(club: Club, clubCourts: Record<string, string[]>): string[] {
  return clubCourts[club.id] ?? defaultCourts(club);
}

// Une compétition au club ce jour-là bloque tous ses terrains.
export function hasCompetition(clubId: string, dateKey: string, comps: Competition[]): boolean {
  return comps.some((c) => c.clubId === clubId && c.dateKey === dateKey);
}

// Terrains encore libres d'un club à (jour, heure) — réservés ET bloqués hors app exclus.
export function freeCourts(club: Club, dateKey: string, time: string, ctx: AvailCtx): string[] {
  if (hasCompetition(club.id, dateKey, ctx.comps)) return [];
  const taken = ctx.reservations
    .filter((r) => r.clubId === club.id && r.dateKey === dateKey && r.time === time)
    .map((r) => r.court);
  const blocked = ctx.blocked
    .filter((b) => b.clubId === club.id && b.dateKey === dateKey && b.time === time)
    .map((b) => b.court);
  return courtsFor(club, ctx.clubCourts).filter((c) => !taken.includes(c) && !blocked.includes(c));
}

// Grille des horaires = union des créneaux ouverts par les clubs (triée).
export function slotGrid(ctx: Pick<AvailCtx, 'clubs' | 'clubSlots'>): string[] {
  const set = new Set<string>();
  for (const club of ctx.clubs) for (const s of openSlotsFor(club, ctx.clubSlots)) set.add(s);
  return [...set].sort();
}

export type ClubAvail = { club: Club; free: number };

// Clubs ayant ≥1 terrain libre à (jour, heure) — créneau ouvert, hors compétition, non passé.
export function clubsFreeAt(dateKey: string, time: string, slotTs: number, ctx: AvailCtx): ClubAvail[] {
  if (slotTs <= Date.now()) return [];
  return ctx.clubs
    .filter((club) => openSlotsFor(club, ctx.clubSlots).includes(time))
    .map((club) => ({ club, free: freeCourts(club, dateKey, time, ctx).length }))
    .filter((x) => x.free > 0)
    .sort((a, b) => a.club.name.localeCompare(b.club.name));
}
