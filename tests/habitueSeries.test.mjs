// Test de logique — séries d'HABITUÉS de l'Espace Club (liste « Habitués », « Arrêter la série ») :
//   node tests/habitueSeries.test.mjs
// Ce qui ne doit jamais revenir : deux habitués au même terrain et à la même heure, des JOURS
// différents (mardi Ali, jeudi Bob), fusionnés en une seule série — « Arrêter » l'une rouvrait
// alors aussi toutes les dates de l'autre (double réservation avec le client du téléphone).
// Les helpers vivent dans SectionReservations.tsx (composant React Native, non importable ici) :
// on extrait leur bloc PUR (de `export type HabitueSeries` au composant) et esbuild le compile
// avec les vrais helpers de dates (`src/lib/days.ts`) ; RECURRING_REASON est relu dans
// `src/lib/reservations.ts` (le module tire le client Supabase).
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

let failed = 0;
const check = (cond, msg) => {
  console.log(`${cond ? '✓' : '✗ ÉCHEC'} ${msg}`);
  if (!cond) failed++;
};

const src = read('src/components/club-admin/SectionReservations.tsx');
const start = src.indexOf('export type HabitueSeries');
const end = src.indexOf('export function SectionReservations(');
const reason = /export const RECURRING_REASON = ('[^']+');/.exec(read('src/lib/reservations.ts'));
if (start < 0 || end < start || !reason) {
  console.log('✗ ÉCHEC bloc des séries ou RECURRING_REASON introuvable');
  process.exit(1);
}

const result = await build({
  stdin: {
    contents: [
      `import { addWeeks, dowOfKey, slotTimestamp } from '@/lib/days';`,
      `import type { BlockedSlot } from '@/store/AppContext';`,
      `const RECURRING_REASON = ${reason[1]};`,
      src.slice(start, end),
    ].join('\n'),
    loader: 'ts',
    resolveDir: root,
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  alias: { '@': join(root, 'src') },
  logLevel: 'silent',
});
const out = join(mkdtempSync(join(tmpdir(), 'padelco-habitues-')), 'habitues.mjs');
writeFileSync(out, result.outputFiles[0].text);
const { upcomingSeries, habitueSeriesKey, seriesWhenLabel, seriesWeeksLabel } = await import(pathToFileURL(out).href);

const R = reason[1].slice(1, -1);
const now = Date.UTC(2026, 9, 23, 10); // vendredi 23 oct. 2026, 10:00 UTC
const blk = (dateKey, time = '18:00', court = 'Terrain 1', r = R) => ({ clubId: 'c1', dateKey, time, court, reason: r });

// Mardi 18:00 (Ali) et jeudi 18:00 (Bob), même terrain, 3 semaines chacun.
const tuesdays = ['2026-10-27', '2026-11-03', '2026-11-10'];
const thursdays = ['2026-10-29', '2026-11-05', '2026-11-12'];
const series = upcomingSeries([...thursdays.map((d) => blk(d)), ...tuesdays.map((d) => blk(d))], now);

check(series.length === 2, 'mardi et jeudi au même terrain et à la même heure = DEUX séries');
const [tue, thu] = series;
check(tue?.dow === 2 && thu?.dow === 4, 'jour de la semaine porté par la série (0 = dimanche, comme extract(dow))');
check(JSON.stringify(tue?.dateKeys) === JSON.stringify(tuesdays), 'la série du mardi ne porte QUE les mardis');
check(JSON.stringify(thu?.dateKeys) === JSON.stringify(thursdays), 'la série du jeudi ne porte QUE les jeudis');
check(habitueSeriesKey(tue) !== habitueSeriesKey(thu), 'clés distinctes (marqueur « arrêt en cours », clé React)');
check(habitueSeriesKey(tue) === 'Terrain 1|18:00|2', 'clé = terrain|heure|jour');
check(seriesWhenLabel(tue) === 'les mardis à 18:00', 'libellé « les mardis à 18:00 »');
check(seriesWhenLabel({ dow: 0, time: '09:30' }) === 'les dimanches à 09:30', 'libellé du dimanche');
check(seriesWeeksLabel(tue) === '3 semaines à venir', 'compte de la série du mardi seul');

// Ordre de lecture : terrain, heure, puis jour (lundi d'abord, dimanche en dernier).
const order = upcomingSeries(
  [blk('2026-11-01'), blk('2026-10-26'), blk('2026-10-27', '09:00'), blk('2026-10-28', '18:00', 'Terrain 0')],
  now,
);
check(
  order.map(habitueSeriesKey).join(' ; ') === 'Terrain 0|18:00|3 ; Terrain 1|09:00|2 ; Terrain 1|18:00|1 ; Terrain 1|18:00|0',
  'tri terrain → heure → jour (lundi avant dimanche)',
);

// Ce qui ne compte pas : le passé, un autre motif. Même jour de semaine = une seule série.
const filtered = upcomingSeries(
  [blk('2026-10-20'), blk('2026-10-23', '09:00'), blk('2026-10-30', '18:00', 'Terrain 1', 'Travaux'), blk('2026-10-30'), blk('2026-11-06')],
  now,
);
check(
  filtered.length === 1 && filtered[0].dow === 5 && filtered[0].dateKeys.length === 2,
  'passé et autres motifs exclus ; même jour = une série',
);

// Miroir tronqué : la série du jeudi atteint la coupure → « au moins », pas celle du mardi.
const cut = upcomingSeries([...tuesdays.map((d) => blk(d)), ...thursdays.map((d) => blk(d))], now, '2026-11-19');
check(cut[0].maybeMore === false && cut[1].maybeMore === true, 'maybeMore calculé PAR série (jour compris)');

if (failed) {
  console.log(`\n${failed} échec(s)`);
  process.exit(1);
}
console.log('\nSéries d’habitués : tout est vert.');
