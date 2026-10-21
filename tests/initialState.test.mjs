// Test de logique — état de PREMIÈRE OUVERTURE (initialState RÉEL de src/store/helpers.ts) et
// clôture LOCALE d'un tournoi (hors session : tournoi créé sans serveur, `server: false`).
//   node tests/initialState.test.mjs
//
// esbuild résout l'alias @/ et bundle les VRAIES valeurs du store (initialState, clampLevel,
// LEVEL_STEP, LEVEL_PENALTY) : aucune copie de l'état ni des constantes ici. Seul le reducer de
// clôture locale (AppContext.tsx, closeCompetition, branche « Mode LOCAL ») est reproduit, le
// store dépendant du runtime React Native.
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const result = await build({
  stdin: {
    contents: "export { initialState, clampLevel, LEVEL_STEP, LEVEL_PENALTY } from '@/store/helpers';",
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  alias: { '@': join(root, 'src') },
  logLevel: 'silent',
});
const out = join(mkdtempSync(join(tmpdir(), 'padelco-initial-')), 'initial.mjs');
writeFileSync(out, result.outputFiles[0].text);
const { initialState, clampLevel, LEVEL_STEP, LEVEL_PENALTY } = await import(pathToFileURL(out).href);

let failed = 0;
const check = (cond, msg) => {
  console.log(`${cond ? '✓' : '✗ ÉCHEC'} ${msg}`);
  if (!cond) failed++;
};

// 1) Première ouverture : aucune donnée factice (ni ami, ni palmarès, ni tournoi, ni résa).
check(initialState.account === null, 'Première ouverture : aucun compte');
check(initialState.level === 3.0, 'Première ouverture : niveau 3.0');
check(initialState.friends.length === 0, 'Première ouverture : aucun ami (plus d’amis seeds)');
check(initialState.officialResults.length === 0, 'Première ouverture : palmarès vide');
check(Object.keys(initialState.compRegistrations).length === 0, 'Première ouverture : aucune inscription');
check(Object.keys(initialState.compResults).length === 0, 'Première ouverture : aucun résultat');
check(initialState.myCompetitions.length === 0 && initialState.reservations.length === 0, 'Première ouverture : ni tournoi ni résa');

// 2) Clôture LOCALE (miroir de la branche « Mode LOCAL » de closeCompetition) : vainqueur + (option)
// dernière équipe ; le niveau ne bouge que pour un tournoi OFFICIEL auquel je suis inscrit.
const closeCompetition = (s, comp, winnerIsMe, loserName, loserIsMe = false) => {
  if (s.compResults[comp.id]) return s;
  const compResults = { ...s.compResults, [comp.id]: { winner: 'X', loser: loserName?.trim() || undefined, closedAt: 1 } };
  const registered = !!s.compRegistrations[comp.id];
  const already = s.officialResults.some((o) => o.compId === comp.id);
  if (!registered || already) return { ...s, compResults };
  let level = s.level;
  let result = 'played';
  if (winnerIsMe && comp.official) {
    level = clampLevel(level + LEVEL_STEP);
    result = 'win';
  } else if (loserIsMe && comp.official) {
    level = clampLevel(level - LEVEL_PENALTY);
    result = 'last';
  }
  return {
    ...s,
    compResults,
    level,
    officialResults: [{ id: 'o', compId: comp.id, result, levelAfter: level }, ...s.officialResults],
  };
};

const COMP = 'c-fin';
const official = { id: COMP, official: true };
const registeredAt = (level) => ({ ...initialState, account: { firstName: 'I' }, level, compRegistrations: { [COMP]: { partner: 'K' } } });

// Scénario : clôture officielle gagnée (3.50 → 4.00).
check(closeCompetition(registeredAt(3.5), official, true).level === 4.0, 'Clôture officielle gagnée : niveau 3.50 → 4.00 (+0.50)');

// Plafond 7.0 : 6.75 + 0.50 = 7.25 → 7.0 ; 7.0 reste 7.0.
check(closeCompetition(registeredAt(6.75), official, true).level === 7.0, 'Plafond : 6.75 + 0.50 → 7.0 (jamais au-delà)');
check(closeCompetition(registeredAt(7.0), official, true).level === 7.0, 'Plafond : 7.0 reste 7.0');

// Malus « dernière place » : −0.25, avec plancher 1.0.
const sLast = closeCompetition(registeredAt(3.5), official, false, 'Awa & Yann', true);
check(sLast.level === 3.25, 'Dernière place officielle : 3.50 → 3.25 (−0.25)');
check(sLast.officialResults[0].result === 'last', 'Palmarès : entrée « Dernière place »');
check(sLast.compResults[COMP].loser === 'Awa & Yann', 'Résultat : équipe dernière enregistrée');
check(closeCompetition(registeredAt(1.0), official, false, 'X', true).level === 1.0, 'Plancher : un niveau 1.0 ne descend pas sous 1.0');
// Comportement CHOISI et documenté : 1.1 − 0.25 = 0.85 → remonté au plancher 1.0.
check(closeCompetition(registeredAt(1.1), official, false, 'X', true).level === 1.0, 'Plancher : 1.1 − 0.25 (= 0.85) → ramené à 1.0');

// « Passer » : clôture sans dernière équipe → aucun loser écrit, niveau intact.
const sSkip = closeCompetition(registeredAt(3.5), official, false, undefined, false);
check(sSkip.compResults[COMP].loser === undefined && sSkip.level === 3.5, '« Passer » : pas de dernière équipe écrite, niveau inchangé');

// Double clôture impossible : le second appel ne change RIEN.
const once = closeCompetition(registeredAt(3.5), official, true);
check(closeCompetition(once, official, true) === once, 'Double clôture : le 2ᵉ appel est un no-op strict');

// Tournoi AMICAL : ni bonus ni malus, palmarès seulement.
check(closeCompetition(registeredAt(3.5), { id: COMP, official: false }, true).level === 3.5, 'Tournoi amical gagné : niveau inchangé');

// Non inscrit : résultat enregistré, niveau et palmarès intacts.
const sOut = closeCompetition({ ...initialState, level: 3.5 }, official, true);
check(!!sOut.compResults[COMP] && sOut.level === 3.5 && sOut.officialResults.length === 0, 'Non inscrit : résultat seul, niveau intact');

// Immutabilité : la clôture n'a pas pollué l'état de première ouverture.
check(initialState.level === 3.0 && Object.keys(initialState.compResults).length === 0, 'État initial intact (immutabilité préservée)');

console.log(failed === 0 ? '\nTOUS LES TESTS ÉTAT INITIAL & CLÔTURE LOCALE PASSENT.' : `\n${failed} test(s) en échec.`);
if (failed > 0) process.exitCode = 1;
