// Test de logique — un seul annuaire de coachs (décision porteur n° 16, T-19 / R-81) :
//   node --experimental-strip-types tests/coachsAnnuaire.test.ts
// L'annuaire STATIQUE (`src/data/coaches.ts`, fiches « réserve par téléphone », vide au
// lancement) est supprimé : `/coachs` renvoie vers `/cours` (coachs RÉSERVABLES de tous les
// clubs). Verrouille la suppression contre un retour silencieux : plus aucun fichier, plus
// aucun import, plus aucun lien vers une fiche statique `/coachs/<id>`.

/// <reference types="node" />
import { existsSync, readdirSync, readFileSync } from 'node:fs';

let failed = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? '✓' : '✗ ÉCHEC'} ${msg}`);
  if (!cond) failed++;
};
const racine = new URL('../', import.meta.url);
const chemin = (rel: string) => new URL(rel, racine);
const lire = (rel: string) => readFileSync(chemin(rel), 'utf8');

// ── (1) Les fichiers de l'annuaire statique n'existent plus ──────────────────────
check(!existsSync(chemin('src/data/coaches.ts')), 'src/data/coaches.ts supprimé');
check(!existsSync(chemin('src/app/coachs/[id].tsx')), 'fiche statique src/app/coachs/[id].tsx supprimée');

// ── (2) /coachs n'est plus qu'une redirection vers /cours ────────────────────────
const coachs = lire('src/app/coachs/index.tsx');
check(/<Redirect\s+href="\/cours"\s*\/>/.test(coachs), '/coachs → <Redirect href="/cours" />');
check(!/useState|SegmentedControl|ContactButtons/.test(coachs), '/coachs : plus aucune liste ni contact direct');

// ── (3) Aucun import ni lien résiduel dans l'app, les tests et le site ─────────────
const sources = ['src', 'tests', 'site'].flatMap((dir) =>
  (readdirSync(chemin(dir), { recursive: true }) as string[])
    .filter((f) => /\.(tsx?|mjs|js|html)$/.test(f) && !f.endsWith('coachsAnnuaire.test.ts'))
    .map((f) => ({ f: `${dir}/${f}`, txt: lire(`${dir}/${f}`) })),
);
check(sources.length > 50, `balayage effectif (${sources.length} fichiers lus)`);
const imports = sources.filter((s) => /data\/coaches['"]/.test(s.txt)).map((s) => s.f);
check(imports.length === 0, `aucun import de data/coaches${imports.length ? ` (${imports.join(', ')})` : ''}`);
const liens = sources.filter((s) => /['"`]\/coachs(\/|['"`])/.test(s.txt)).map((s) => s.f);
check(liens.length === 0, `aucun lien vers /coachs ou /coachs/<id>${liens.length ? ` (${liens.join(', ')})` : ''}`);

console.log(failed === 0 ? '\nANNUAIRE DES COACHS : UN SEUL (/cours).' : `\n${failed} échec(s) annuaire des coachs.`);
if (failed > 0) process.exitCode = 1;
