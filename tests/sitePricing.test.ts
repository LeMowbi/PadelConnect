// Test de logique — prix « dès » du site vitrine (site/assets/site.js) :
//   node --experimental-strip-types tests/sitePricing.test.ts
// Le site (vanilla JS, sans bundler) RECOPIE la règle de l'app : pricing.minPrice sur les durées
// réellement ouvertes (courtSchedule.resolveCourtSlots + offeredDurations). Ce test charge les
// fonctions du site telles quelles et les confronte à l'app : si l'une des deux règles évolue
// sans l'autre, le site annonce un prix différent de l'app (ex. Elite Club : 30 000 au lieu de
// 20 000 pour un club qui vend du 1h).

/// <reference types="node" />
import { readFileSync } from 'node:fs';
import type { Club, PriceTier } from '../src/data/clubs.ts';
import { offeredDurations, resolveCourtSlots, type CourtSlot } from '../src/lib/courtSchedule.ts';
import { minPrice } from '../src/lib/pricing.ts';

let failed = 0;
const eq = (a: unknown, b: unknown, msg: string) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  console.log(`${ok ? '✓' : `✗ ÉCHEC (${JSON.stringify(a)} ≠ ${JSON.stringify(b)})`} ${msg}`);
  if (!ok) failed++;
};

// Fonctions du site, extraites du fichier publié (entre la constante et le chargement réseau).
type SiteConfig = { court_slots?: Record<string, CourtSlot[]> | null } | undefined;
type SiteFns = {
  dureesProposees: (cf: SiteConfig, terrains: string[]) => Record<number, boolean>;
  prixDes: (prixUnique: number, plages: PriceTier[] | null, durees: Record<number, boolean>) => number;
};
const src = readFileSync(new URL('../site/assets/site.js', import.meta.url), 'utf8');
const debut = src.indexOf('  var PRICE_MIN = 1000;');
const fin = src.indexOf('  function loadServerClubs()');
if (debut < 0 || fin < debut) throw new Error('site.js : bloc du prix « dès » introuvable (marqueurs déplacés ?)');
const site = new Function(`${src.slice(debut, fin)}; return { dureesProposees, prixDes };`)() as SiteFns;

const SAMPLE = ['07:30', '09:00', '10:30', '12:00', '16:30', '18:00', '19:30', '21:00'];
const sitePrice = (priceFrom: number, tiers: PriceTier[] | null, cs: Record<string, CourtSlot[]> | null, courts: string[]) =>
  site.prixDes(priceFrom, tiers, site.dureesProposees(cs === null ? undefined : { court_slots: cs }, courts));
const appPrice = (priceFrom: number, tiers: PriceTier[], cs: Record<string, CourtSlot[]> | null, courts: string[]) => {
  const offered = offeredDurations(resolveCourtSlots({ courtSlots: cs, slots: null, courtClosed: null }, courts, SAMPLE), courts);
  return minPrice({ priceFrom, priceTiers: tiers } as Club, offered.size ? offered : undefined);
};

// ── Cas concrets ───────────────────────────────────────────────────────────────
const T1 = ['Terrain 1'];
eq(sitePrice(30000, [], { 'Terrain 1': [{ t: '08:00', d: 60 }] }, T1), 20000, 'Elite Club : tout en 1h → ⅔ du tarif unique');
eq(sitePrice(30000, [], { 'Terrain 1': [{ t: '08:00', d: 60, x: true }] }, T1), 30000, 'créneau 1h FERMÉ → seul le 1h30 compte');
eq(sitePrice(30000, [], null, T1), 30000, 'sans grille par terrain → 1h30 seulement');
eq(sitePrice(30000, [], {}, T1), 30000, 'grille vide {} ≡ absente → 1h30 seulement');
eq(sitePrice(1200, [], { 'Terrain 1': [{ t: '08:00', d: 60 }] }, T1), 1000, 'prix 1h dérivé borné au plancher 1 000');
// T-10 : le ⅔ dérivé est arrondi à la CENTAINE, comme dans l'app (jamais « dès 16 667 FCFA »).
eq(sitePrice(25000, [], { 'Terrain 1': [{ t: '08:00', d: 60 }] }, T1), 16700, 'tarif unique 25 000 en 1h → dès 16 700');
eq(
  sitePrice(25000, [{ start: '07:00', end: '24:00', price: 14000 }], { 'Terrain 1': [{ t: '09:00', d: 60 }] }, T1),
  9300,
  'plage 14 000 sans prix 1h → dès 9 300 (9 333 arrondi)',
);
const padelta: PriceTier[] = [
  { start: '07:00', end: '16:00', price: 10000 },
  { start: '16:00', end: '20:30', price: 30000 },
];
eq(sitePrice(25000, padelta, null, T1), 10000, 'plages prioritaires sur le tarif unique');
eq(
  sitePrice(25000, [{ start: '07:00', end: '24:00', price: 12000, price60: 7000 }], { 'Terrain 1': [{ t: '09:00', d: 60 }] }, T1),
  7000,
  'price60 saisi utilisé tel quel',
);
eq(sitePrice(25000, [{ start: '', end: '24:00', price: 5000 }], null, T1), 25000, 'plage incomplète ignorée');
eq(sitePrice(30000, [], { 'Terrain 9': [{ t: '08:00', d: 60 }] }, T1), 30000, 'grille d’un terrain retiré ignorée');

// ── Parité exhaustive pseudo-aléatoire avec l'app ──────────────────────────────
let graine = 42;
const alea = () => (graine = (graine * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const choisir = <T>(xs: T[]): T => xs[Math.floor(alea() * xs.length)];
let ecarts = 0;
for (let n = 0; n < 5000; n++) {
  const courts = Array.from({ length: 1 + Math.floor(alea() * 3) }, (_, i) => `Terrain ${i + 1}`);
  let cs: Record<string, CourtSlot[]> | null = null;
  if (alea() < 0.8) {
    cs = {};
    for (const c of courts)
      if (alea() < 0.8)
        cs[c] = Array.from({ length: Math.floor(alea() * 4) }, () => ({
          t: choisir(['08:00', '8:00', '09:30', 'xx', '25:00']),
          d: choisir<60 | 90>([60, 90]),
          ...(alea() < 0.3 ? { x: true } : {}),
        }));
  }
  const priceFrom = choisir([1200, 1575, 10000, 25000, 30000]);
  const tiers: PriceTier[] =
    alea() < 0.5
      ? []
      : Array.from({ length: 1 + Math.floor(alea() * 3) }, () => ({
          start: choisir(['07:00', '']),
          end: '24:00',
          price: choisir([0, 1600, 9000, 14000, 20000]),
          ...(alea() < 0.5 ? { price60: choisir([0, 5000, 15000]) } : {}),
        }));
  if (sitePrice(priceFrom, tiers, cs, courts) !== appPrice(priceFrom, tiers, cs, courts)) ecarts++;
}
eq(ecarts, 0, 'site ≡ app sur 5 000 configurations (grilles, fermetures, plages, price60)');

if (failed) {
  console.error(`\n${failed} test(s) en échec`);
  process.exit(1);
}
console.log('\nTous les tests du prix « dès » du site passent.');
