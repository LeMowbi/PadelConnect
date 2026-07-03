// Disponibilité des terrains — logique centrale, réutilisée par l’écran « Réserver »,
// la fiche de réservation et la création de match. Tout est calculé terrain par terrain
// et indexé sur la KEY stable du jour (AAAA-MM-JJ), jamais sur le libellé d’affichage.

import { SAMPLE_SLOTS, compareClubs, defaultCourts, type Club } from '@/data/clubs';
import { isTournamentPublic, type Competition } from '@/data/competitions';
import { rangeBlocks, type BlockedRange } from '@/lib/ranges';
import { isClosedSlot } from '@/lib/slots';
import type { BlockedSlot, Reservation } from '@/store/AppContext';

// Occupation cross-joueur : créneaux pris par TOUS (vue serveur, sans identité). Sert à
// masquer un terrain déjà réservé par un AUTRE joueur, que je ne « vois » pas dans mes résas.
export type Occupancy = { clubId: string; dateKey: string; time: string; court: string };

export type AvailCtx = {
  clubs: Club[]; // clubs visibles (de base + inscrits activés)
  clubSlots: Record<string, string[]>;
  clubCourts: Record<string, string[]>;
  reservations: Reservation[];
  occupancy?: Occupancy[]; // créneaux pris par les autres joueurs (serveur)
  comps: Competition[];
  blocked: BlockedSlot[]; // créneaux fermés hors app par les clubs (un jour, une heure, un terrain)
  ranges: BlockedRange[]; // fermetures sur PÉRIODE (54) — terrain ou club entier, plusieurs jours
  // Fermetures RÉCURRENTES par terrain (54) : { clubId: { 'Terrain 1': ['18:00', …] } } —
  // le Terrain 1 n'est jamais réservable à 18:00 (ex. réservé aux cours), les autres si.
  courtClosed: Record<string, Record<string, string[]>>;
};

// (rangeBlocks vit dans src/lib/ranges.ts — module pur, testé — et est ré-exporté ici
// pour les écrans qui raisonnent « disponibilité ».)
export { rangeBlocks };

// Horaires OUVERTS par un club (sinon créneaux standards). La config stocke la grille complète,
// créneaux fermés préfixés « ! » (cf. src/lib/slots.ts) — on ne garde ici que les ouverts.
export function openSlotsFor(club: Club, clubSlots: Record<string, string[]>): string[] {
  return (clubSlots[club.id] ?? SAMPLE_SLOTS).filter((t) => !isClosedSlot(t));
}

// Terrains d’un club : ceux gérés par le club, sinon « Terrain 1…N » par défaut.
export function courtsFor(club: Club, clubCourts: Record<string, string[]>): string[] {
  return clubCourts[club.id] ?? defaultCourts(club);
}

// Un tournoi a-t-il lieu à ce club ce jour-là ? (n’importe lequel, plage début → fin incluse)
// Sert aux vues CLUB (planning) : le gérant veut savoir qu’un tournoi se tient, même partiel.
export function hasCompetition(clubId: string, dateKey: string, comps: Competition[]): boolean {
  return comps.some((c) => c.clubId === clubId && dateKey >= c.dateKey && dateKey <= (c.endDateKey ?? c.dateKey));
}

// Un tournoi SANS terrains ni créneaux précis (seeds de démo) bloque TOUT le club ce jour-là.
// Les tournois serveur ciblent des terrains/créneaux précis → blocage géré créneau par créneau
// dans freeCourts (ce helper ne signale donc QUE le blocage « journée entière »).
export function hasFullDayCompetition(clubId: string, dateKey: string, comps: Competition[]): boolean {
  return comps.some(
    (c) =>
      isTournamentPublic(c) && // un tournoi en attente / refusé ne bloque RIEN avant approbation
      c.clubId === clubId &&
      dateKey >= c.dateKey &&
      dateKey <= (c.endDateKey ?? c.dateKey) &&
      (c.courtNames?.length ?? 0) === 0 &&
      (c.timeSlots?.length ?? 0) === 0,
  );
}

// Terrains bloqués par un tournoi à (club, jour, heure). 'all' = tout le club (tournoi sans
// précision) ; sinon la liste des terrains réservés au tournoi à ce créneau précis.
export function competitionBlockedCourts(clubId: string, dateKey: string, time: string, comps: Competition[]): 'all' | string[] {
  const blocked = new Set<string>();
  for (const c of comps) {
    if (!isTournamentPublic(c)) continue; // en attente / refusé → ne bloque aucun terrain
    if (c.clubId !== clubId) continue;
    if (!(dateKey >= c.dateKey && dateKey <= (c.endDateKey ?? c.dateKey))) continue;
    const courts = c.courtNames ?? [];
    const slots = c.timeSlots ?? [];
    if (courts.length === 0 && slots.length === 0) return 'all'; // seed : bloque tout le club ce jour
    if (slots.length > 0 && !slots.includes(time)) continue; // ce créneau n’est pas concerné
    if (courts.length === 0) return 'all'; // créneaux précis, mais tous les terrains à ces heures
    for (const ct of courts) blocked.add(ct);
  }
  return [...blocked];
}

// Terrains encore libres d’un club à (jour, heure) — réservés, bloqués hors app ET retenus
// par un tournoi exclus. Un tournoi ne bloque QUE ses terrains/créneaux déclarés.
export function freeCourts(club: Club, dateKey: string, time: string, ctx: AvailCtx): string[] {
  const compBlocked = competitionBlockedCourts(club.id, dateKey, time, ctx.comps);
  if (compBlocked === 'all') return [];
  const taken = ctx.reservations.filter((r) => r.clubId === club.id && r.dateKey === dateKey && r.time === time).map((r) => r.court);
  // Terrains pris par d’AUTRES joueurs (occupation serveur) — invisibles dans mes résas.
  const occupied = (ctx.occupancy ?? [])
    .filter((o) => o.clubId === club.id && o.dateKey === dateKey && o.time === time)
    .map((o) => o.court);
  const blocked = ctx.blocked.filter((b) => b.clubId === club.id && b.dateKey === dateKey && b.time === time).map((b) => b.court);
  // Fermetures sur période (54) et fermetures récurrentes par terrain (54).
  const clubRanges = ctx.ranges.filter((r) => r.clubId === club.id);
  const closedByCourt = ctx.courtClosed[club.id] ?? {};
  return courtsFor(club, ctx.clubCourts).filter(
    (c) =>
      !compBlocked.includes(c) &&
      !taken.includes(c) &&
      !occupied.includes(c) &&
      !blocked.includes(c) &&
      !(closedByCourt[c] ?? []).includes(time) &&
      !clubRanges.some((r) => rangeBlocks(r, dateKey, time, c)),
  );
}

// Grille des horaires = union des créneaux ouverts par les clubs (triée).
export function slotGrid(ctx: Pick<AvailCtx, 'clubs' | 'clubSlots'>): string[] {
  const set = new Set<string>();
  for (const club of ctx.clubs) for (const s of openSlotsFor(club, ctx.clubSlots)) set.add(s);
  return [...set].sort();
}

export type ClubAvail = { club: Club; free: number };

// Clubs ayant ≥1 terrain libre à (jour, heure) — créneau ouvert, hors compétition, non passé.
// Padelta d’abord puis alphabétique (compareClubs), comme toutes les listes joueurs.
export function clubsFreeAt(dateKey: string, time: string, slotTs: number, ctx: AvailCtx): ClubAvail[] {
  if (slotTs <= Date.now()) return [];
  return ctx.clubs
    .filter((club) => !club.comingSoon) // un club « Bientôt » n’est pas encore réservable
    .filter((club) => openSlotsFor(club, ctx.clubSlots).includes(time))
    .map((club) => ({ club, free: freeCourts(club, dateKey, time, ctx).length }))
    .filter((x) => x.free > 0)
    .sort((a, b) => compareClubs(a.club, b.club));
}
