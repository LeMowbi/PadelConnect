// Test de logique — promesses écrites qui dépendent d'un comportement réel :
//   node --experimental-strip-types tests/promessesTextes.test.ts
// (1) Présence et cours (CGU FR + EN, src/app/legal.tsx, site/privacy.html) : `public_reliability`
//     (80, jamais redéfinie depuis — la 98 la laisse telle quelle, T-3) compte les résas jouées dont
//     le joueur est TITULAIRE ou participant accepté. Un cours INDIVIDUEL est à l'élève
//     (respond_lesson) → il compte ; un cours COLLECTIF est au nom du coach (create_group_lesson),
//     l'élève n'est que dans `lesson_students` → il ne compte pas. Les textes doivent le dire, et le
//     seuil du badge « Fiable » ne parle plus de « parties » (un cours n'en est pas une).
//     Si `public_reliability` est un jour redéfinie, ce test le signale : relire les textes.
// (2) Promesse de durée (« réserve … en 2 minutes », « en quelques secondes », « en une minute »,
//     « en un clic »… — le motif est lui-même testé sur des variantes) : aucun appareil n'ayant
//     permis de chronométrer un build de préproduction avant le #69, les textes FIGÉS dans le binaire
//     (parrainage, invitation d'un ami, partage d'une fiche club, pied du profil, argumentaire gérant)
//     disent « en quelques gestes » — plus aucune durée promise dans src/, hors temps de LECTURE
//     (« Découvrir les règles en 2 minutes », écran decouvrir.tsx). La promesse ne
//     reste que sur le sous-titre App Store (modifiable seulement avec une nouvelle version, comme le
//     nom : tranché AVANT la soumission du #69) et sur le site (modifiable sans build, FR et EN) :
//     chaque page du site qui la porte doit être citée dans la condition de chronométrage §0 de
//     docs/STORE-LISTING.md, y compris site/og.png (image d'aperçu servie, rendu de og.svg) avec sa
//     commande de régénération.
// (3) Commission (écran « Pourquoi PadelConnect », volet clubs) : elle porte sur les créneaux JOUÉS
//     réservés via l'app, cours avec un coach compris (un cours n'est pas une « partie »).

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

// Fiches stores (docs/STORE-LISTING.md) : même nuance (cours individuels) et fidélité hors cours (98).
const fiche = plat(lire('docs/STORE-LISTING.md'));
check(
  (fiche.match(/matchs ou de cours individuels joués/g) ?? []).length === 2 && !/matchs ou de cours joués/.test(fiche),
  'STORE-LISTING : fiabilité « matchs ou cours individuels joués » (iOS + Play)',
);
check(
  (fiche.match(/réservations créées et jouées \(hors cours\) =/g) ?? []).length === 4 && !/créées et jouées =/.test(fiche),
  'STORE-LISTING : fidélité « hors cours » dans les 4 blocs',
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

// ── (2) Promesse de durée : plus aucune dans l'app, conditionnée sur le site ─────────
const store = plat(lire('docs/STORE-LISTING.md'));
const fichiers = (dir: string): string[] =>
  readdirSync(new URL(dir, racine)).flatMap((n) => {
    const chemin = `${dir}${n}`;
    return statSync(new URL(chemin, racine)).isDirectory() ? fichiers(`${chemin}/`) : [chemin];
  });
// Temps de lecture, hors de la règle : le lien de l'accueil et l'écran « Découvrir le padel » entier.
const LECTURE = 'src/app/decouvrir.tsx';
// Toute durée promise, pas seulement « en 2 min » : chiffre ou nombre en lettres (« en 30 secondes »,
// « en une minute », « en moins de 2 minutes »), « en quelques secondes », « en un clic ». Les
// formulations de remplacement (« en quelques gestes », « in a few taps ») n'y tombent pas.
const promesse =
  /\ben (moins d(e |')|à peine |seulement )?(\d+|une?|deux|trois|quatre|cinq|dix|quelques) ?(mn|min|minutes?|sec|secondes?)\b|\ben (un|1|deux|quelques) clics?\b|\ben un éclair\b/i;
const promesseEn =
  /\bin (less than |under |just |only )?(\d+|an?|one|two|three|five|ten|a few|few) ?(min|minutes?|sec|seconds?)\b|\bin (mere )?seconds\b|\bin (a|one|two) clicks?\b|\bin no time\b/i;
const promet = (t: string) => promesse.test(t) || promesseEn.test(t);
// Le motif lui-même : une variante de durée doit être vue, les textes de remplacement non.
const variantes = [
  'réserve en moins de 2 minutes',
  'réserve en 30 secondes',
  'réserve en une minute',
  'réserve en moins d’une minute',
  'réserve en deux minutes',
  'réserve en 3 min',
  'en quelques secondes',
  'en un clic',
  'booked in 2 minutes',
  'booked in under a minute',
  'in a few seconds',
  'in seconds',
];
const sansDuree = ['en quelques gestes', 'in a few taps', 'en 2 échanges', 'un pas de 30 minutes', 'en 2 contre 2'];
const manquees = variantes.filter((v) => !promet(plat(v)));
const fauxPositifs = sansDuree.filter((v) => promet(plat(v)));
check(
  manquees.length === 0 && fauxPositifs.length === 0,
  `motif des promesses de durée${manquees.length ? ` (manquées : ${manquees.join(' / ')})` : ''}${
    fauxPositifs.length ? ` (faux positifs : ${fauxPositifs.join(' / ')})` : ''
  }`,
);
const porteurs = fichiers('src/').filter(
  (f) => /\.tsx?$/.test(f) && f !== LECTURE && promesse.test(plat(lire(f)).replace(/les règles en 2 minutes/g, '')),
);
check(
  porteurs.length === 0,
  `aucune promesse de durée dans src/ hors temps de lecture${porteurs.length ? ` (encore : ${porteurs.join(', ')})` : ''}`,
);
check(!/r[ée]serv\w*[^`'<]{0,60}en 2 min/i.test(plat(lire(LECTURE))), `${LECTURE} : « En 2 minutes » reste un temps de lecture`);
for (const f of ['src/app/parrainage.tsx', 'src/app/(tabs)/amis.tsx', 'src/app/(tabs)/profil.tsx']) {
  check(
    plat(lire(f)).includes('de padel en quelques gestes') || plat(lire(f)).includes('à Abidjan en quelques gestes'),
    `${f} : « en quelques gestes »`,
  );
  check(store.includes(`\`${f}\``), `STORE-LISTING §0 cite ${f} (texte figé traité)`);
}
for (const [f, texte] of [
  ['src/lib/share.ts', 'réserve ton terrain en quelques gestes'],
  ['src/app/pourquoi.tsx', 'réservent en quelques gestes'],
] as const) {
  check(plat(lire(f)).includes(texte), `${f} : « en quelques gestes »`);
  check(store.includes(`\`${f}\``), `STORE-LISTING §0 cite ${f} (texte figé traité)`);
}
check(store.includes("- [x] Textes de l'app FIGÉS dans le binaire"), 'STORE-LISTING §0 : case des textes de l’app cochée');
// Site : modifiable sans build, mais chaque page qui promet une durée (FR ou EN) est sous la condition §0.
const pagesSite = fichiers('site/').filter((f) => /\.(html|svg)$/.test(f) && promet(plat(lire(f))));
for (const f of pagesSite) {
  check(store.includes(`\`${f}\``), `STORE-LISTING §0 cite ${f} (promesse du site à chronométrer)`);
}
// L'image d'aperçu réellement servie est og.png, RENDU de og.svg : son texte (illisible par grep) porte
// la promesse tant que le SVG la porte. La procédure §0 doit la citer ET dire comment la régénérer.
const section0Brut =
  lire('docs/STORE-LISTING.md')
    .split(/^## 1\. /m)[0]
    .split(/^## 0\. /m)[1] ?? '';
const section0 = plat(section0Brut);
// La case du chronométrage elle-même (liste des textes du site à corriger en cas d'échec).
const caseChrono = plat(section0Brut.split(/^- \[/m).find((c) => c.includes('Le parcours rapide tient réellement')) ?? '');
const servieOgPng = ['site/index.html', 'site/get.html', 'site/invite.html'].filter((f) =>
  plat(lire(f)).includes('content="https://padelconnectci.com/og.png"'),
);
check(servieOgPng.length > 0, `og.png est l'image d'aperçu servie (${servieOgPng.join(', ')})`);
if (pagesSite.includes('site/og.svg') && servieOgPng.length > 0) {
  check(caseChrono.includes('`site/og.png`'), 'STORE-LISTING §0 : la case du chronométrage cite site/og.png (rendu servi de og.svg)');
  check(
    /@resvg\/resvg-js@\d+\.\d+\.\d+/.test(section0) &&
      section0.includes("readFileSync('site/og.svg'") &&
      /\)" site\/og\.png\b/.test(section0),
    'STORE-LISTING §0 : commande de régénération og.svg → og.png (version exacte)',
  );
  for (const f of ['docs/CHECKLIST-STORES.md', '.claude/skills/padel-sortie-ios/SKILL.md']) {
    check(lire(f).includes('`site/og.png`'), `${f} : l'image d'aperçu site/og.png est dans la procédure de repli`);
  }
}
check(
  plat(lire('site/get.html')).includes("'Réserve un terrain de padel à Abidjan, directement dans ton navigateur.'"),
  'site/get.html : variante navigateur sans durée (parcours web jamais chronométré)',
);
check(
  plat(lire('site/invite.html')).includes(
    "'Réserve un terrain de padel à Abidjan, trouve des partenaires et joue des tournois, directement dans ton navigateur.'",
  ) && plat(lire('site/invite.html')).includes('<p id="accroche">'),
  'site/invite.html : variante navigateur sans durée (parcours web jamais chronométré)',
);
console.log(`  (${pagesSite.length} page(s) du site portent encore la promesse de durée)`);

// ── (3) Commission : créneaux joués, cours compris ──────────────────────────────────
const pourquoi = plat(lire('src/app/pourquoi.tsx'));
check(
  pourquoi.includes(
    "uniquement sur les créneaux joués réservés via l'app (parties et cours avec un coach ; rien sur une absence ni une annulation)",
  ),
  'pourquoi.tsx : commission sur les créneaux joués, cours avec un coach compris',
);
check(!pourquoi.includes('uniquement sur les parties jouées'), 'pourquoi.tsx : plus de « parties jouées » pour la commission');

if (failed) {
  console.error(`\n${failed} test(s) en échec`);
  process.exit(1);
}
console.log('\nTous les tests des promesses écrites passent.');
