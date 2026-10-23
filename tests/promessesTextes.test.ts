// Test de logique — promesses écrites qui dépendent d'un comportement réel :
//   node --experimental-strip-types tests/promessesTextes.test.ts
// (1) Présence et cours (CGU FR + EN, src/app/legal.tsx, site/privacy.html) : `public_reliability`
//     (80, jamais redéfinie depuis — la 98 la laisse telle quelle, T-3) compte les résas jouées dont
//     le joueur est TITULAIRE ou participant accepté. Un cours INDIVIDUEL est à l'élève
//     (respond_lesson) → il compte ; un cours COLLECTIF est au nom du coach (create_group_lesson),
//     l'élève n'est que dans `lesson_students` → il ne compte pas. Les textes doivent le dire, et le
//     seuil du badge « Fiable » ne parle plus de « parties » (un cours n'en est pas une).
//     Si `public_reliability` est un jour redéfinie, ce test le signale : relire les textes.
// (2) Promesse de durée de l'app (« réserve … en 2 minutes ») : chaque fichier de src/ qui la porte
//     doit être cité dans la condition §0 de docs/STORE-LISTING.md (ces textes sont figés dans le
//     binaire : leur sort se décide avant le build).

/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';

let failed = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? '✓' : '✗ ÉCHEC'} ${msg}`);
  if (!cond) failed++;
};
const racine = new URL('../', import.meta.url);
const lire = (chemin: string) => readFileSync(new URL(chemin, racine), 'utf8');
// Texte « plat » : apostrophes typographiques et blancs normalisés (prettier replie à sa guise).
const plat = (s: string) => s.replace(/’/g, "'").replace(/\s+/g, ' ');

// ── (1) Présence : un cours individuel compte, un cours collectif non ───────────────
const cgu = plat(lire('site/cgu.html')); // HTML FR + dictionnaire I18N FR/EN
const legal = plat(lire('src/app/legal.tsx'));
const privacy = plat(lire('site/privacy.html'));

for (const [nom, t] of [
  ['cgu', cgu],
  ['legal.tsx', legal],
] as const) {
  check(t.includes('un cours individuel reste compté dans ta présence'), `${nom} : cours individuel compté dans la présence`);
  check(t.includes("un cours collectif où tu es élève n'y compte pas"), `${nom} : cours collectif hors présence`);
  check(!t.includes('il reste compté dans ta présence'), `${nom} : plus de « il reste compté » sans nuance`);
  check(!t.includes('ne compte ni pour ta présence'), `${nom} : plus de « ne compte ni pour ta présence »`);
}
check(
  cgu.includes('a private lesson still counts towards your attendance') &&
    cgu.includes('a group lesson you attend as a student does not') &&
    !cgu.includes('it still counts towards your attendance'),
  'cgu EN : même nuance cours individuel / collectif',
);
for (const [nom, t] of [
  ['cgu', cgu],
  ['legal.tsx', legal],
  ['privacy', privacy],
] as const) {
  check(t.includes('à partir de 5 matchs ou cours individuels joués'), `${nom} : seuil du badge « Fiable » sans « parties »`);
  check(!t.includes('à partir de 5 parties jouées'), `${nom} : plus de « 5 parties jouées »`);
}
check(
  cgu.includes('from 5 matches or private lessons played') && !cgu.includes('from 5 games played'),
  'cgu EN : seuil du badge « Fiable »',
);

// La règle décrite ci-dessus tient tant que la DERNIÈRE définition de public_reliability ignore
// lesson_students et les cours (coach_name) — sinon les textes sont à relire.
const migrations = readdirSync(new URL('supabase/', racine))
  .filter((f) => /^\d+_.*\.sql$/.test(f))
  .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
const derniere = (fonction: string) => {
  const motif = new RegExp(`create or replace function public\\.${fonction}\\s*\\(`, 'i');
  const f = migrations.filter((m) => motif.test(lire(`supabase/${m}`))).at(-1);
  if (!f) return '';
  const sql = lire(`supabase/${f}`);
  const debut = sql.search(motif);
  const fin = sql.indexOf('$$;', sql.indexOf('$$', debut) + 2);
  return sql.slice(debut, fin);
};
const reliability = derniere('public_reliability');
check(reliability.length > 0, 'public_reliability : définition trouvée');
check(
  !/lesson_students|coach_name/.test(reliability) && /reservation_participants/.test(reliability),
  'public_reliability : titulaire ou participant accepté, sans règle propre aux cours (textes à relire sinon)',
);
const groupe = derniere('create_group_lesson');
check(
  /insert into public\.reservations[\s\S]*?values\s*\(\s*v_uid\b/.test(groupe),
  'create_group_lesson : la résa du cours collectif est au nom du coach (textes à relire sinon)',
);

// ── (2) Promesse de durée figée dans le binaire ─────────────────────────────────────
const store = plat(lire('docs/STORE-LISTING.md'));
const fichiers = (dir: string): string[] =>
  readdirSync(new URL(dir, racine)).flatMap((n) => {
    const chemin = `${dir}${n}`;
    return statSync(new URL(chemin, racine)).isDirectory() ? fichiers(`${chemin}/`) : [chemin];
  });
const porteurs = fichiers('src/').filter((f) => /\.tsx?$/.test(f) && /r[ée]serv\w*[^`'\n]{0,60}en 2 minutes/i.test(plat(lire(f))));
for (const f of porteurs) {
  check(store.includes(`\`${f}\``), `STORE-LISTING §0 cite ${f} (promesse « en 2 minutes » figée dans le binaire)`);
}
console.log(`  (${porteurs.length} fichier(s) de l'app portent la promesse de durée)`);

if (failed) {
  console.error(`\n${failed} test(s) en échec`);
  process.exit(1);
}
console.log('\nTous les tests des promesses écrites passent.');
