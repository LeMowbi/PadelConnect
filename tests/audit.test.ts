// Audit v4.5.1 — décompte hebdo, commission, garde-fous de réservation et
// inscription tournoi. weekKeyOf est la VRAIE source (src/lib/days.ts) ; les
// regroupements/garde-fous reproduisent fidèlement operateur.tsx / AppContext.
//   node --experimental-strip-types tests/audit.test.ts

import { weekKeyOf } from '../src/lib/days.ts';
import { overlaps } from '../src/lib/courtSchedule.ts';

let failed = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? '✓' : '✗ ÉCHEC'} ${msg}`);
  if (!cond) failed++;
};

type Resa = { id: string; clubId: string; startsAt: number; price: number; played: boolean };
const COMMISSION_RATE = 0.1;

// Miroir du décompte opérateur : parties JOUÉES de la semaine, groupées par club,
// volume = somme des prix réels, commission = Math.round(volume × 10 %).
function weeklyRows(reservations: Resa[], week: string) {
  const groups = new Map<string, { count: number; revenue: number }>();
  for (const r of reservations.filter((x) => weekKeyOf(x.startsAt) === week && x.played)) {
    const g = groups.get(r.clubId) ?? { count: 0, revenue: 0 };
    g.count += 1;
    g.revenue += r.price;
    groups.set(r.clubId, g);
  }
  return [...groups.entries()].map(([clubId, g]) => ({ clubId, ...g, commission: Math.round(g.revenue * COMMISSION_RATE) }));
}

// Semaine du lundi 8 juin 2026. Bornes : dimanche 14 23:59 dedans, lundi 15 00:00 dehors.
const WEEK = '2026-06-08';
const ts = (d: number, h: number, m = 0) => new Date(2026, 5, d, h, m).getTime();
const resas: Resa[] = [
  { id: 'r1', clubId: 'padelta', startsAt: ts(9, 18, 0), price: 30000, played: true }, // mardi prime
  { id: 'r2', clubId: 'padelta', startsAt: ts(10, 10, 30), price: 10000, played: true }, // mercredi creuse
  { id: 'r3', clubId: 'district-club', startsAt: ts(14, 23, 59), price: 14000, played: true }, // dimanche 23:59 → DANS la semaine
  { id: 'r4', clubId: 'padelta', startsAt: ts(15, 0, 0), price: 30000, played: true }, // lundi suivant 00:00 → HORS semaine
  { id: 'r5', clubId: 'padelta', startsAt: ts(11, 18, 0), price: 30000, played: false }, // à venir : jamais facturée
];

const rows = weeklyRows(resas, WEEK);
const padelta = rows.find((r) => r.clubId === 'padelta')!;
const district = rows.find((r) => r.clubId === 'district-club')!;
check(padelta.count === 2 && padelta.revenue === 40000, 'Padelta : 2 jouées, volume 40 000 (prix mixtes 30k + 10k)');
check(padelta.commission === 4000, 'Commission Padelta : 4 000 (10 % du volume réel)');
check(district.count === 1 && district.commission === 1400, 'District : dimanche 23:59 compté dans la semaine, commission 1 400');
check(!rows.some((r) => r.clubId === 'padelta' && r.count > 2), 'Lundi 00:00 suivant exclu ; résa à venir exclue');
check(
  weeklyRows(
    resas.filter((r) => r.id !== 'r1'),
    WEEK,
  ).find((r) => r.clubId === 'padelta')!.revenue === 10000,
  'Résa annulée (retirée du store) → exclue du volume',
);
check(Math.round(12345 * COMMISSION_RATE) === 1235, 'Arrondi commission : 12 345 → 1 235 (Math.round, au plus proche)');

// Garde-fou : annulation interdite à MOINS de 5h du début (miroir de reservations.tsx).
const FIVE_H = 5 * 3600000;
const canCancel = (startsAt: number, now: number) => startsAt - now > FIVE_H;
const now0 = ts(12, 12, 0);
check(canCancel(now0 + FIVE_H + 60000, now0) === true, 'Annulation à 5h01 du début : AUTORISÉE');
check(canCancel(now0 + FIVE_H - 60000, now0) === false, 'Annulation à 4h59 du début : REFUSÉE');
check(canCancel(now0 + FIVE_H, now0) === false, 'Annulation à 5h00 pile : REFUSÉE (strictement plus de 5h requis)');

// Garde-fou : anti double-réservation du même terrain (miroir d'addReservation, créneaux 1h/1h30).
// Chevauchement d'INTERVALLE (durée propre) — utilise le VRAI `overlaps` (courtSchedule.ts), la
// même convention demi-ouverte que la contrainte d'exclusion serveur (23P01).
type Slot = { clubId: string; dateKey: string; time: string; court: string; durationMin: 60 | 90 };
const taken = (list: Slot[], r: Slot) =>
  list.some(
    (x) =>
      x.clubId === r.clubId &&
      x.dateKey === r.dateKey &&
      x.court === r.court &&
      overlaps({ t: r.time, d: r.durationMin }, { t: x.time, d: x.durationMin }),
  );
const existing: Slot[] = [{ clubId: 'padelta', dateKey: '2026-06-13', time: '18:00', court: 'Terrain 1', durationMin: 90 }];
check(
  taken(existing, { clubId: 'padelta', dateKey: '2026-06-13', time: '18:00', court: 'Terrain 1', durationMin: 90 }),
  'Même terrain, même créneau → refusé',
);
check(
  !taken(existing, { clubId: 'padelta', dateKey: '2026-06-13', time: '18:00', court: 'Terrain 2', durationMin: 90 }),
  'Autre terrain, même créneau → accepté',
);
check(
  !taken(existing, { clubId: 'padelta', dateKey: '2026-06-14', time: '18:00', court: 'Terrain 1', durationMin: 90 }),
  'Même terrain, autre jour → accepté',
);
// Chevauchement partiel : un 1h à 19:00 tombe DANS le 18:00·1h30 (finit 19:30) → refusé ;
// un 1h à 19:30 est ADJACENT (18:00·1h30 finit pile à 19:30) → accepté.
check(
  taken(existing, { clubId: 'padelta', dateKey: '2026-06-13', time: '19:00', court: 'Terrain 1', durationMin: 60 }),
  'Créneau 1h à 19:00 chevauche le 18:00·1h30 → refusé',
);
check(
  !taken(existing, { clubId: 'padelta', dateKey: '2026-06-13', time: '19:30', court: 'Terrain 1', durationMin: 60 }),
  'Créneau 1h à 19:30 adjacent au 18:00·1h30 → accepté',
);

// Garde-fou : blocage hors app refusé sur un créneau déjà réservé (chevauchement d'intervalle).
check(taken(existing, existing[0]), 'Blocage par-dessus une résa app → refusé (chevauchement)');

// Garde-fou : tournoi plein (miroir de teamCount/full).
const teamCount = (slots: number, registered: number, isReg: boolean) => Math.min(slots, registered + (isReg ? 1 : 0));
const isFull = (slots: number, registered: number, isReg: boolean) =>
  Math.max(0, slots - teamCount(slots, registered, isReg)) === 0 && !isReg;
check(isFull(8, 8, false) === true, 'Tournoi 8/8 (non inscrit) → Complet, inscription impossible');
check(isFull(16, 16, false) === true, 'Tournoi 16/16 → Complet');
check(isFull(8, 7, false) === false, 'Tournoi 7/8 → inscription encore possible');
check(teamCount(8, 9, true) === 8, 'Compteur d’équipes plafonné à la capacité (jamais 9/8)');

// ——— Modération de tournoi (v4.16) : joueur → en attente → validé par le club ———
// Réplique inline de isTournamentPublic (src/data/competitions.ts), car ce module
// importe l'alias @/ que node ne résout pas ; la cohérence est vérifiée par tsc.
type Comp = { status?: 'pending' | 'approved'; createdByMe?: boolean; organizerType?: 'club' | 'joueur'; clubId?: string; id?: string };
const isPublic = (c: Comp) => c.status !== 'pending';
check(isPublic({}) === true, 'Seed/club (sans statut) → public');
check(isPublic({ status: 'approved' }) === true, 'Tournoi validé → public');
check(isPublic({ status: 'pending' }) === false, 'Tournoi joueur en attente → NON public');

// Liste /competitions : public OU créé par moi (le créateur voit son « en attente »).
const visibleInList = (c: Comp) => isPublic(c) || !!c.createdByMe;
check(visibleInList({ status: 'pending', createdByMe: true }) === true, 'Créateur voit son tournoi en attente dans la liste');
check(visibleInList({ status: 'pending', createdByMe: false }) === false, 'Les autres ne voient pas un tournoi en attente');

// Validation par le club : pending → approved (devient public, sort des demandes).
const reqs = (list: Comp[], clubId: string) =>
  list.filter((c) => c.clubId === clubId && c.status === 'pending' && c.organizerType === 'joueur');
let comps2: Comp[] = [{ id: 't0', clubId: 'padelta', status: 'pending', organizerType: 'joueur' }];
check(reqs(comps2, 'padelta').length === 1, 'Le club voit 1 demande de tournoi');
comps2 = comps2.map((c) => (c.id === 't0' ? { ...c, status: 'approved' as const } : c));
check(isPublic(comps2[0]) && reqs(comps2, 'padelta').length === 0, 'Après validation : public + plus dans les demandes');

console.log(failed === 0 ? '\nTOUS LES TESTS AUDIT PASSENT.' : `\n${failed} test(s) audit en échec.`);
if (failed > 0) process.exitCode = 1;
