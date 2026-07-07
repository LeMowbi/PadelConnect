// Test de logique — DISPONIBILITÉ par CHEVAUCHEMENT D'INTERVALLE (créneaux 1h/1h30, 68).
//   node --experimental-strip-types tests/availability.test.ts
//
// src/lib/availability.ts importe l'alias @/ (data/clubs, data/competitions, store/AppContext)
// que node ne résout pas → on reproduit ICI, fidèlement, la composition des gardes (mêmes
// prédicats, réutilisant les VRAIS helpers purs `overlaps`/`rangeBlocks`/`slotDurationAt`/
// `resolveCourtSlots`). C'est la garde ANTI DOUBLE-VENTE côté app : un candidat [t,t+d) doit être
// exclu d'un terrain dès qu'il chevauche une résa / occupation / fermeture / créneau de tournoi,
// et rester libre s'il est seulement ADJACENT. La cohérence avec availability.ts est tenue par tsc.

import { type CourtSlot, overlaps, resolveCourtSlots, slotDurationAt } from '../src/lib/courtSchedule.ts';
import { rangeBlocks, type BlockedRange } from '../src/lib/ranges.ts';

let failed = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? '✓' : '✗ ÉCHEC'} ${msg}`);
  if (!cond) failed++;
};

const SAMPLE = ['07:30', '09:00', '10:30', '12:00', '16:30', '18:00', '19:30', '21:00'];

// Intervalle candidat vs intervalle occupé (mirror de `intervalsOverlap` d'availability.ts).
const io = (aT: string, aD: number, bT: string, bD: number) => overlaps({ t: aT, d: aD as 60 | 90 }, { t: bT, d: bD as 60 | 90 });

// ─── competitionBlockedCourts (mirror) ────────────────────────────────────────────────────────
type Comp = { clubId: string; dateKey: string; endDateKey?: string; courtNames?: string[]; timeSlots?: string[]; slotDurations?: number[] };
function compBlocked(clubId: string, dateKey: string, time: string, dur: number, comps: Comp[]): 'all' | string[] {
  const blocked = new Set<string>();
  for (const c of comps) {
    if (c.clubId !== clubId) continue;
    if (!(dateKey >= c.dateKey && dateKey <= (c.endDateKey ?? c.dateKey))) continue;
    const courts = c.courtNames ?? [];
    const slots = c.timeSlots ?? [];
    const durs = c.slotDurations ?? [];
    if (courts.length === 0 && slots.length === 0) return 'all';
    if (slots.length > 0 && !slots.some((st, i) => io(time, dur, st, durs[i] ?? 90))) continue;
    if (courts.length === 0) return 'all';
    for (const ct of courts) blocked.add(ct);
  }
  return [...blocked];
}

console.log('\n— chevauchement d’intervalle (résa / occupation) —');
// Terrain pris 08:00·1h30 → un candidat 09:00·1h chevauche (déborde à 10:00 sur [08:00,09:30)? non :
// 08:00·90 = [480,570) ; 09:00 = 540 < 570 → chevauche), un 09:30·1h est adjacent (libre).
check(io('09:00', 60, '08:00', 90), 'candidat 09:00·1h chevauche un 08:00·1h30 → pris');
check(!io('09:30', 60, '08:00', 90), 'candidat 09:30·1h adjacent à un 08:00·1h30 → libre');
check(io('08:00', 90, '09:00', 60), 'symétrie : 08:00·1h30 chevauche un 09:00·1h existant');
check(!io('08:00', 90, '09:30', 60), 'symétrie : 08:00·1h30 adjacent à un 09:30·1h existant → libre');

console.log('\n— competitionBlockedCourts (durée du créneau tournoi) —');
const t1 = { clubId: 'padelta', dateKey: '2026-07-15', courtNames: ['Terrain 1'], timeSlots: ['08:00'], slotDurations: [90] };
check((compBlocked('padelta', '2026-07-15', '09:00', 60, [t1]) as string[]).includes('Terrain 1'), 'tournoi 08:00·1h30 bloque un candidat 09:00 (chevauche)');
check(!(compBlocked('padelta', '2026-07-15', '09:30', 60, [t1]) as string[]).includes('Terrain 1'), 'tournoi 08:00·1h30 ne bloque pas 09:30 (adjacent)');
// Tournoi à créneau 1h : ne bloque que [08:00,09:00) → un 09:00 est libre.
const t60 = { ...t1, slotDurations: [60] };
check(!(compBlocked('padelta', '2026-07-15', '09:00', 60, [t60]) as string[]).includes('Terrain 1'), 'tournoi 08:00·1h : 09:00 libre (créneau plus court)');
check(compBlocked('padelta', '2026-07-15', '05:00', 90, [{ clubId: 'padelta', dateKey: '2026-07-15' }]) === 'all', 'tournoi seed sans précision → tout le club');

console.log('\n— composition freeCourtSlotsAt (grille + occupation + période) —');
// Grille : Terrain 1 mixte (08:00·1h30 puis 09:30·1h), Terrain 2 tout en 1h30.
const cfg: { courtSlots: Record<string, CourtSlot[]> } = {
  courtSlots: {
    'Terrain 1': [{ t: '08:00', d: 90 }, { t: '09:30', d: 60 }],
    'Terrain 2': [{ t: '08:00', d: 90 }, { t: '10:30', d: 90 }],
  },
};
const courts = ['Terrain 1', 'Terrain 2'];
const grid = resolveCourtSlots(cfg, courts, SAMPLE);
type Occ = { court: string; time: string; durationMin: number };
const occ: Occ[] = [{ court: 'Terrain 2', time: '08:00', durationMin: 90 }]; // Terrain 2 pris à 08:00
const ranges: BlockedRange[] = [];
// freeCourtSlotsAt('08:00') : Terrain 1 propose 08:00·1h30 (libre), Terrain 2 propose 08:00·1h30 (pris).
function freeAt(time: string): { court: string; d: 60 | 90 }[] {
  const out: { court: string; d: 60 | 90 }[] = [];
  for (const court of courts) {
    const d = slotDurationAt(grid, court, time);
    if (d === null) continue;
    if (occ.some((o) => o.court === court && io(time, d, o.time, o.durationMin))) continue;
    if (ranges.some((r) => rangeBlocks(r, '2026-07-15', time, court, d))) continue;
    out.push({ court, d });
  }
  return out;
}
const at8 = freeAt('08:00');
check(at8.length === 1 && at8[0].court === 'Terrain 1' && at8[0].d === 90, '08:00 : seul Terrain 1 libre (T2 pris), durée 1h30');
const at930 = freeAt('09:30');
check(at930.length === 1 && at930[0].court === 'Terrain 1' && at930[0].d === 60, '09:30 : Terrain 1 propose un 1h (T2 n’a pas de créneau à cette heure)');
// L'occupation 08:00·1h30 sur T2 ne bloque PAS un créneau 10:30 (adjacent après fin 09:30).
const at1030 = freeAt('10:30');
check(at1030.some((x) => x.court === 'Terrain 2' && x.d === 90), '10:30 : Terrain 2 libre (l’occupation 08:00 ne déborde pas)');

console.log(`\n${failed === 0 ? 'TOUS LES TESTS AVAILABILITY PASSENT.' : `${failed} ÉCHEC(S).`}`);
process.exit(failed === 0 ? 0 : 1);
