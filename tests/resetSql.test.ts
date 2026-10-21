// Test de logique — cohérence du script supabase/RESET-DONNEES-TEST.sql :
//   node --experimental-strip-types tests/resetSql.test.ts
// Le porteur décide de lancer la SECTION 2 (destructive, irréversible) d'après les chiffres de
// la SECTION 1 (aperçu). Invariant (audit pré-lancement 2026-10, C165) : TOUTE table vidée par
// la section 2 est comptée dans l'aperçu, et le récapitulatif final ne cite que des tables
// réellement vidées — sinon l'aperçu ment par omission et le porteur valide à l'aveugle.

import { readFileSync } from 'node:fs';

let failed = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? '✓' : '✗ ÉCHEC'} ${msg}`);
  if (!cond) failed++;
};

const sql = readFileSync(new URL('../supabase/RESET-DONNEES-TEST.sql', import.meta.url), 'utf8');
const between = (from: string, to: string) => sql.slice(sql.indexOf(from), sql.indexOf(to, sql.indexOf(from)));
const tables = (chunk: string, re: RegExp) => new Set([...chunk.matchAll(re)].map((m) => m[1]));

// Section 1 = de son titre au premier `order by element;` ; section 2 = le bloc begin/commit ;
// récapitulatif = après `commit;`.
const s1 = between('SECTION 1', 'order by element;');
const s2 = between('\nbegin;', '\ncommit;');
const recap = sql.slice(sql.indexOf('\ncommit;'));

const counted = tables(s1, /count\(\*\) from public\.([a-z_]+)/g);
const deleted = tables(s2, /^\s*delete from public\.([a-z_]+)/gm);
const recapped = tables(recap, /count\(\*\) from public\.([a-z_]+)/g);

check(deleted.size >= 40, `section 2 : ${deleted.size} tables vidées (balayage non vide)`);
const missing = [...deleted].filter((t) => !counted.has(t));
check(missing.length === 0, `aperçu : chaque table vidée est comptée${missing.length ? ` — manquent : ${missing.join(', ')}` : ''}`);
const recapUnknown = [...recapped].filter((t) => t !== 'profiles' && !deleted.has(t));
check(
  recapUnknown.length === 0,
  `récapitulatif : seules des tables vidées (et profiles)${recapUnknown.length ? ` — ${recapUnknown.join(', ')}` : ''}`,
);
check(counted.has('profiles') && recapped.has('profiles'), 'comptes conservés : comptés dans l’aperçu et le récapitulatif');
check(/set_config\('padel\.level_write', 'on', true\)/.test(s2), 'section 2 : GUC du moteur de niveau posé avant la remise à 3.0');
check(/where role <> 'operator'/.test(s2), 'section 2 : les comptes opérateur ne sont jamais rétrogradés');

if (failed) {
  console.error(`\n${failed} ÉCHEC(S) — reset SQL`);
  process.exit(1);
}
console.log('\nTOUS LES TESTS RESET SQL PASSENT.');
