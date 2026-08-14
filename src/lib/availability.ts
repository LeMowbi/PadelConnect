// Disponibilité des terrains — logique centrale, réutilisée par l’écran « Réserver »,
// la fiche de réservation et la création de match. Tout est calculé terrain par terrain
// et indexé sur la KEY stable du jour (AAAA-MM-JJ), jamais sur le libellé d’affichage.
//
// Créneaux à DURÉE VARIABLE (1h/1h30) : chaque terrain a SA grille (courtSchedule.ts) et chaque
// réservation fige SA durée. La disponibilité raisonne donc en CHEVAUCHEMENT D'INTERVALLE
// `[début, début+durée)` (convention demi-ouverte stricte, miroir EXACT de la contrainte
// d'exclusion + des gardes serveur SQL 68) — un créneau candidat 09:00·1h est libre même si
// 08:00·1h30 (adjacent) est pris, mais bloqué si 08:00·1h30 déborde dessus.

import { SAMPLE_SLOTS, compareClubs, defaultCourts, type Club } from '@/data/clubs';
import { isTournamentBlocking, type Competition } from '@/data/competitions';
import { type CourtSlot, resolveCourtSlots, slotDurationAt, toMin } from '@/lib/courtSchedule';
import { rangeBlocks, type BlockedRange } from '@/lib/ranges';
import type { BlockedSlot, Reservation } from '@/store/AppContext';

// Occupation cross-joueur : créneaux pris par TOUS (vue serveur, sans identité). Sert à
// masquer un terrain déjà réservé par un AUTRE joueur, que je ne « vois » pas dans mes résas.
// `durationMin` (défaut 90) permet le calcul de chevauchement d'intervalle.
export type Occupancy = { clubId: string; dateKey: string; time: string; court: string; durationMin: number };

// Tranches d'état nécessaires pour RÉSOUDRE la grille par terrain d'un club (rétrocompatible).
export type ScheduleCtx = {
  clubSlots: Record<string, string[]>; // ancienne grille club unique (heures « ! » = fermé) @90
  clubCourts: Record<string, string[]>; // terrains gérés par club
  courtSlots: Record<string, Record<string, CourtSlot[]>>; // grille PAR TERRAIN (source de vérité, 68)
  courtClosed: Record<string, Record<string, string[]>>; // fermetures récurrentes héritées (54)
};

export type AvailCtx = ScheduleCtx & {
  clubs: Club[]; // clubs visibles (de base + inscrits activés)
  reservations: Reservation[];
  occupancy?: Occupancy[]; // créneaux pris par les autres joueurs (serveur)
  comps: Competition[];
  blocked: BlockedSlot[]; // créneaux fermés hors app par les clubs (un jour, une heure, un terrain)
  ranges: BlockedRange[]; // fermetures sur PÉRIODE (54) — terrain ou club entier, plusieurs jours
};

// (rangeBlocks vit dans src/lib/ranges.ts — module pur, testé — et est ré-exporté ici
// pour les écrans qui raisonnent « disponibilité ».)
export { rangeBlocks };

// Deux intervalles `[a, a+aDur)` et `[b, b+bDur)` se chevauchent-ils ? Demi-ouvert strict
// (adjacents = OK) — UNE seule convention client+serveur (int8range `[)`).
function intervalsOverlap(aTime: string, aDur: number, bTime: string, bDur: number): boolean {
  const a = toMin(aTime);
  const b = toMin(bTime);
  if (a === null || b === null) return false;
  return b < a + aDur && a < b + bDur;
}

// Grille EFFECTIVE de chaque terrain d'un club (durée + fermetures), résolue de façon
// rétrocompatible (courtSlots → source de vérité ; sinon dérive de l'ancienne grille @90).
export function resolvedGridFor(club: Club, ctx: ScheduleCtx): Record<string, CourtSlot[]> {
  return resolveCourtSlots(
    {
      courtSlots: ctx.courtSlots[club.id] ?? null,
      slots: ctx.clubSlots[club.id] ?? null,
      courtClosed: ctx.courtClosed[club.id] ?? null,
    },
    courtsFor(club, ctx.clubCourts),
    SAMPLE_SLOTS,
  );
}

// Heures d'OUVERTURE d'un club = union des débuts de créneaux ouverts de TOUS ses terrains,
// triée. (Un même début peut porter une durée différente selon le terrain — l'union ne garde
// que l'heure de départ ; la durée se lit terrain par terrain via `freeCourtSlotsAt`.)
export function openSlotsFor(club: Club, ctx: ScheduleCtx): string[] {
  const grid = resolvedGridFor(club, ctx);
  const set = new Set<string>();
  for (const court of Object.keys(grid)) for (const s of grid[court]) if (!s.x) set.add(s.t);
  return [...set].sort();
}

// Terrains d’un club : ceux gérés par le club, sinon « Terrain 1…N » par défaut.
export function courtsFor(club: Club, clubCourts: Record<string, string[]>): string[] {
  return clubCourts[club.id] ?? defaultCourts(club);
}

// Un tournoi SANS terrains ni créneaux précis (seeds de démo) bloque TOUT le club ce jour-là.
// Les tournois serveur ciblent des terrains/créneaux précis → blocage géré créneau par créneau
// dans freeCourts (ce helper ne signale donc QUE le blocage « journée entière »).
export function hasFullDayCompetition(clubId: string, dateKey: string, comps: Competition[]): boolean {
  return comps.some(
    (c) =>
      isTournamentBlocking(c) && // en attente / refusé / clôturé → ne bloque RIEN (miroir garde serveur 'published')
      c.clubId === clubId &&
      dateKey >= c.dateKey &&
      dateKey <= (c.endDateKey ?? c.dateKey) &&
      (c.courtNames?.length ?? 0) === 0 &&
      (c.timeSlots?.length ?? 0) === 0,
  );
}

// Terrains bloqués par un tournoi pour un créneau CANDIDAT (heure + durée) à (club, jour).
// 'all' = tout le club (tournoi sans précision) ; sinon la liste des terrains dont un créneau
// de tournoi CHEVAUCHE l'intervalle candidat. Chaque créneau tournoi i = [slots[i], +durée[i]|90).
export function competitionBlockedCourts(
  clubId: string,
  dateKey: string,
  time: string,
  durationMin: number,
  comps: Competition[],
): 'all' | string[] {
  const blocked = new Set<string>();
  for (const c of comps) {
    if (!isTournamentBlocking(c)) continue; // en attente / refusé / clôturé → ne bloque aucun terrain
    if (c.clubId !== clubId) continue;
    if (!(dateKey >= c.dateKey && dateKey <= (c.endDateKey ?? c.dateKey))) continue;
    const courts = c.courtNames ?? [];
    const slots = c.timeSlots ?? [];
    const durs = c.slotDurations ?? [];
    if (courts.length === 0 && slots.length === 0) return 'all'; // seed : bloque tout le club ce jour
    // Le tournoi ne concerne ce créneau que si l'un de SES créneaux chevauche le candidat.
    if (slots.length > 0 && !slots.some((st, i) => intervalsOverlap(time, durationMin, st, durs[i] ?? 90))) continue;
    if (courts.length === 0) return 'all'; // créneaux précis, mais tous les terrains à ces heures
    for (const ct of courts) blocked.add(ct);
  }
  return [...blocked];
}

// Un intervalle candidat `[time, time+durationMin)` est-il LIBRE sur un terrain précis ? Compare
// aux réservations, à l'occupation cross-joueur, aux fermetures hors app et aux périodes fermées,
// TOUJOURS en chevauchement d'intervalle (chacun avec SA durée). Tournois traités à part (appelant).
function courtIntervalFree(
  club: Club,
  dateKey: string,
  time: string,
  durationMin: number,
  court: string,
  ctx: AvailCtx,
  clubRanges: BlockedRange[],
): boolean {
  const hits = (items: { time: string; durationMin?: number }[]) =>
    items.some((x) => intervalsOverlap(time, durationMin, x.time, x.durationMin ?? 90));
  const onCourt = (x: { clubId: string; dateKey: string; court: string }) =>
    x.clubId === club.id && x.dateKey === dateKey && x.court === court;
  if (hits(ctx.reservations.filter(onCourt))) return false;
  if (hits((ctx.occupancy ?? []).filter(onCourt))) return false;
  if (hits(ctx.blocked.filter(onCourt))) return false;
  if (clubRanges.some((r) => rangeBlocks(r, dateKey, time, court, durationMin))) return false;
  return true;
}

// Créneaux LIBRES d'un club à (jour, heure) : pour CHAQUE terrain, la durée du créneau ouvert à
// cette heure (s'il en propose un) et l'intervalle réellement disponible. C'est le cœur de la
// disponibilité joueur (les durées peuvent différer d'un terrain à l'autre au même horaire).
export function freeCourtSlotsAt(club: Club, dateKey: string, time: string, ctx: AvailCtx): { court: string; durationMin: 60 | 90 }[] {
  const grid = resolvedGridFor(club, ctx);
  const clubRanges = ctx.ranges.filter((r) => r.clubId === club.id);
  const out: { court: string; durationMin: 60 | 90 }[] = [];
  for (const court of courtsFor(club, ctx.clubCourts)) {
    const d = slotDurationAt(grid, court, time); // créneau OUVERT à cette heure sur ce terrain ?
    if (d === null) continue;
    const compBlocked = competitionBlockedCourts(club.id, dateKey, time, d, ctx.comps);
    if (compBlocked === 'all' || compBlocked.includes(court)) continue;
    if (!courtIntervalFree(club, dateKey, time, d, court, ctx, clubRanges)) continue;
    out.push({ court, durationMin: d });
  }
  return out;
}

// Terrains encore libres d’un club à (jour, heure) POUR UNE DURÉE donnée — le terrain doit
// proposer EXACTEMENT ce créneau ouvert (heure + durée) et son intervalle doit être libre.
export function freeCourts(club: Club, dateKey: string, time: string, durationMin: 60 | 90, ctx: AvailCtx): string[] {
  return freeCourtSlotsAt(club, dateKey, time, ctx)
    .filter((x) => x.durationMin === durationMin)
    .map((x) => x.court);
}

// Grille des horaires = union des créneaux ouverts par les clubs (triée).
export function slotGrid(ctx: ScheduleCtx & { clubs: Club[] }): string[] {
  const set = new Set<string>();
  for (const club of ctx.clubs) for (const s of openSlotsFor(club, ctx)) set.add(s);
  return [...set].sort();
}

export type ClubAvail = { club: Club; free: number; durations: number[] };

// Clubs ayant ≥1 créneau libre à (jour, heure) — hors compétition, non passé. Padelta d’abord
// puis alphabétique (compareClubs), comme toutes les listes joueurs.
export function clubsFreeAt(dateKey: string, time: string, slotTs: number, ctx: AvailCtx): ClubAvail[] {
  if (slotTs <= Date.now()) return [];
  return ctx.clubs
    .filter((club) => !club.comingSoon) // un club « Bientôt » n’est pas encore réservable
    .map((club) => {
      // Un SEUL balayage par (club, heure) : le nombre de terrains ET les durées offertes en
      // sortent ensemble — l'écran n'a plus à rebalayer la dispo pour afficher un prix (68).
      const frees = freeCourtSlotsAt(club, dateKey, time, ctx);
      return { club, free: frees.length, durations: [...new Set(frees.map((x) => x.durationMin))] };
    })
    .filter((x) => x.free > 0)
    .sort((a, b) => compareClubs(a.club, b.club));
}
