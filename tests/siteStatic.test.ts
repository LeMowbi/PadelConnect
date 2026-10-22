// Test de logique — site vitrine statique (site/) :
//   node --experimental-strip-types tests/siteStatic.test.ts
// Trois classes de défauts déjà vues en production : (1) le comptage des terrains (Elite Club
// annonçait 8 « terrains » dont PADBOL / BASKET / VOLLEY) ; (2) les deux AASA (racine et
// .well-known) qui divergent — Apple lit l'une ou l'autre selon le chemin ; (3) une réécriture
// _redirects vers un « .html » que Cloudflare Pages redirige en 308 vers l'URL propre → boucle
// infinie (ERR_TOO_MANY_REDIRECTS) sur toute la page de téléchargement.

/// <reference types="node" />
import { readFileSync } from 'node:fs';

let failed = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? '✓' : '✗ ÉCHEC'} ${msg}`);
  if (!cond) failed++;
};
const eq = (a: unknown, b: unknown, msg: string) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  console.log(`${ok ? '✓' : `✗ ÉCHEC (${JSON.stringify(a)} ≠ ${JSON.stringify(b)})`} ${msg}`);
  if (!ok) failed++;
};
const lire = (chemin: string) => readFileSync(new URL(`../site/${chemin}`, import.meta.url), 'utf8');

// ── (1) Comptage des terrains de padel (site.js, nbTerrainsPadel) ─────────────────
const src = lire('assets/site.js');
const debut = src.indexOf('  function nbTerrainsPadel(');
const fin = src.indexOf('  // Prix « dès » : MIROIR');
if (debut < 0 || fin < debut) throw new Error('site.js : nbTerrainsPadel introuvable (marqueurs déplacés ?)');
const nbTerrainsPadel = new Function(`${src.slice(debut, fin)}; return nbTerrainsPadel;`)() as (t: unknown[]) => number;

eq(
  nbTerrainsPadel(['PADEL 1', 'PADEL 2', 'PADEL 3', 'PADEL 4', 'PADBOL 1', 'PADBOL 2', 'BASKET', 'VOLLEY']),
  4,
  'Elite Club : seules les lignes « PADEL » comptent (PADBOL ≠ padel)',
);
eq(nbTerrainsPadel(['Terrain 1', 'Terrain 2']), 2, 'grille « Terrain N » comptée en entier');
eq(nbTerrainsPadel(['terrain central', 'Padel couvert', 'Basket']), 2, 'insensible à la casse');
eq(nbTerrainsPadel(['VIBORA', 'SMASH', 'LOBO', 'RULO', 'DELTA']), 5, 'noms libres (Padelta) : tout est compté, jamais 0');
eq(nbTerrainsPadel(['Terrain 1', null]), 1, 'ligne vide ignorée sans planter');

// ── (2) AASA : les deux copies sont identiques, avec applinks ET webcredentials ───
const aasaRacine = lire('apple-app-site-association');
const aasaWellKnown = lire('.well-known/apple-app-site-association');
check(aasaRacine === aasaWellKnown, 'AASA racine ≡ AASA .well-known (octet pour octet)');
const aasa = JSON.parse(aasaRacine) as {
  applinks: { details: { appIDs: string[]; components: { '/': string }[] }[] };
  webcredentials?: { apps: string[] };
};
const appIds = aasa.applinks.details.flatMap((d) => d.appIDs);
eq(aasa.webcredentials?.apps, appIds, 'webcredentials : même identifiant d’app que applinks');
const chemins = aasa.applinks.details.flatMap((d) => d.components.map((c) => c['/']));
check(
  ['/invite/*', '/club/*', '/auth-callback'].every((c) => chemins.includes(c)),
  'applinks : /invite/*, /club/*, /auth-callback',
);

// ── (3) _redirects : aucune cible en « .html » (boucle 308), /invite/* → page d'invitation ─
const regles = lire('_redirects')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))
  .map((l) => l.split(/\s+/));
check(
  regles.every(([, cible]) => !cible.endsWith('.html')),
  'aucune réécriture vers un « .html » (Cloudflare le redirige en 308)',
);
eq(
  regles.find(([source]) => source === '/invite/*'),
  ['/invite/*', '/invite', '200'],
  '/invite/* réécrit (200) vers la page d’invitation',
);
eq(
  regles.find(([source]) => source === '/club/*'),
  ['/club/*', '/get', '200'],
  '/club/* réécrit (200) vers /get',
);
check(lire('invite.html').length > 0 && lire('get.html').length > 0, 'les pages cibles existent (invite.html, get.html)');

// ── Sitemap : URL canoniques uniquement (sans « .html », sur le domaine apex) ──────
const urls = [...lire('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
check(urls.length > 0, 'sitemap : au moins une URL');
check(
  urls.every((u) => u.startsWith('https://padelconnectci.com/') && !u.endsWith('.html')),
  'sitemap : URL canoniques (apex, sans .html)',
);
check(/Sitemap: https:\/\/padelconnectci\.com\/sitemap\.xml/.test(lire('robots.txt')), 'robots.txt annonce le sitemap');
// Un « Disallow » sur les liens partagés casserait le noindex d'invite.html (Google ne lit pas une
// page bloquée) ET l'aperçu des liens chez les robots qui respectent robots.txt (X, LinkedIn, Messenger).
check(
  !/^\s*Disallow:\s*\/(invite|club)\b/im.test(lire('robots.txt')),
  'robots.txt : /invite/ et /club/ restent explorables (noindex lisible, aperçus des liens)',
);

if (failed) {
  console.error(`\n${failed} test(s) en échec`);
  process.exit(1);
}
console.log('\nTous les tests du site statique passent.');
