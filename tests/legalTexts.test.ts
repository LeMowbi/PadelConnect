// Test de logique — textes légaux (site/privacy.html, site/cgu.html FR + EN, src/app/legal.tsx,
// site/supprimer-mon-compte.html) :
//   node --experimental-strip-types tests/legalTexts.test.ts
// Ces trois textes se recopient l'un l'autre à la main : une promesse corrigée dans l'un revient
// dans l'autre au prochain copier-coller. Invariants (audit des règles métier 2026-10) :
// (1) aucune promesse FAUSSE ne revient — « téléphone jamais montré » (R-13 : l'organisateur d'un
//     tournoi le partage aux inscrits), « compte suspendu » (R-104 : aucun outil de suspension),
//     « respecte la réglementation (ARTCI) » (R-15 : affirmation non étayée) ;
// (2) les mentions obligatoires sont présentes partout — loi n° 2013-450, droit d'opposition,
//     prestataires, ce qui subsiste après suppression (R-07), prénom + initiale des matchs ouverts
//     (R-103), et le marqueur « À COMPLÉTER » de l'identité juridique tant qu'elle manque ;
// (3) la page publique de suppression de compte (exigence Google Play) existe et est reliée ;
// (4) décisions porteur du 2026-10-22 écrites partout : fidélité cible (CONF-7 — créateur seul,
//     −50 %, plafond 5 000 FCFA, offert par PadelConnect, remise appliquée par le club, cours
//     exclus), actus/agenda désactivables (R-14), matchs passés d'un compte supprimé gardés par
//     les partenaires (« Ancien joueur », R-30), frais d'un tournoi annulé par le club (T-12) ;
// (5) les copies ne divergent pas : HTML FR de cgu.html = dictionnaire I18N FR, et chaque
//     paragraphe partagé de cgu.html se retrouve mot pour mot dans legal.tsx.

/// <reference types="node" />
import { readFileSync } from 'node:fs';

let failed = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? '✓' : '✗ ÉCHEC'} ${msg}`);
  if (!cond) failed++;
};
const lire = (chemin: string) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8');
// Texte « plat » : espaces, retours à la ligne et apostrophes typographiques normalisés (le site
// écrit « ' », l'app « ’ » ; prettier replie les lignes de legal.tsx à sa guise).
const plat = (s: string) => s.replace(/’/g, "'").replace(/\s+/g, ' ');

const privacy = plat(lire('site/privacy.html'));
const cgu = plat(lire('site/cgu.html')); // HTML FR + dictionnaire I18N FR/EN
const legal = plat(lire('src/app/legal.tsx'));
const suppression = plat(lire('site/supprimer-mon-compte.html'));
const textes: [string, string][] = [
  ['privacy', privacy],
  ['cgu', cgu],
  ['legal.tsx', legal],
];

// ── (1) Promesses fausses qui ne doivent jamais revenir ─────────────────────────────
for (const [nom, t] of textes) {
  check(!/jamais montrées aux autres joueurs/i.test(t), `${nom} : plus de « coordonnées jamais montrées » (R-13)`);
  check(!/suspendu/i.test(t) && !/suspended/i.test(t), `${nom} : plus de « compte suspendu » (R-104)`);
  check(!/respecte la réglementation/i.test(t) && !/complies with Ivorian/i.test(t), `${nom} : plus de « respecte l'ARTCI » (R-15)`);
}

// ── (2) Mentions obligatoires présentes partout ─────────────────────────────────────
for (const [nom, t] of textes) {
  check(t.includes('2013-450'), `${nom} : loi n° 2013-450 citée (R-15)`);
  check(/opposition/.test(t), `${nom} : droit d'opposition (R-15)`);
  check(/Brevo/.test(t) && /Cloudflare/.test(t) && /Expo/.test(t), `${nom} : prestataires nommés (R-15)`);
  check(t.includes("n'est pas affiché publiquement"), `${nom} : téléphone « pas affiché publiquement » (R-13)`);
  check(t.includes('aux équipes inscrites'), `${nom} : exception de l'organisateur de tournoi (R-13)`);
  check(t.includes('nom complet est visible des joueurs du même match'), `${nom} : nom complet des matchs ouverts (R-103)`);
  check(t.includes('« Compte supprimé »'), `${nom} : ce qui subsiste après suppression (R-07)`);
  check(t.includes('À COMPLÉTER'), `${nom} : identité juridique marquée « À COMPLÉTER » (décision n° 22)`);
}
for (const [nom, t] of [textes[1], textes[2]]) {
  check(t.includes('en cas de récidive, le compte peut être supprimé'), `${nom} : modération sans outil fictif (R-104)`);
}
check(cgu.includes('repeat offenders'), 'cgu EN : récidive (R-104)');
check(cgu.includes('full name is visible to the players of the same match'), 'cgu EN : nom complet des matchs ouverts (R-103)');
check(cgu.includes('law no. 2013-450'), 'cgu EN : loi n° 2013-450 (R-15)');
check(
  legal.includes('SIL Open Font License') && lire('assets/fonts/OFL.txt').includes('SIL OPEN FONT LICENSE Version 1.1'),
  'licences : OFL citée dans l’app et jointe aux polices (R-100)',
);

// ── (3) Page publique de suppression de compte ──────────────────────────────────────
check(
  suppression.includes('Supprimer mon compte') && suppression.includes('contact@padelconnectci.com'),
  'suppression : bouton de l’app ET demande par e-mail',
);
check(suppression.includes('« Compte supprimé »') && suppression.includes('30 jours'), 'suppression : ce qui subsiste et durées');
check(
  suppression.includes('« Ancien joueur »') &&
    suppression.includes('remises fidélité déjà servies') &&
    !/ton nom dans l'historique des matchs passés/i.test(suppression),
  'suppression : même « ce qui subsiste » que privacy/cgu/legal (R-30, 92)',
);
check(privacy.includes('href="/supprimer-mon-compte"'), 'privacy : lien vers la page de suppression');
check(
  cgu.includes('href=\\"/supprimer-mon-compte\\"') && cgu.includes('href="/supprimer-mon-compte"'),
  'cgu : lien FR (HTML) et dictionnaire',
);

// ── (4) Décisions porteur du 2026-10-22 ─────────────────────────────────────────────
for (const [nom, t] of textes) {
  check(t.includes('désactivables dans Profil → Notifications'), `${nom} : actus et agenda désactivables (R-14)`);
  check(t.includes('« Ancien joueur »'), `${nom} : matchs passés gardés par les partenaires, auteur anonymisé (R-30)`);
  check(t.includes('remises fidélité déjà servies'), `${nom} : remises servies conservées pour le décompte du club (92)`);
  check(t.includes("remises fidélité qu'il t'a servies"), `${nom} : le club voit les remises qu'il a servies (92)`);
  check(!t.includes("ton nom dans l'historique des matchs passés"), `${nom} : plus de « ton nom dans l'historique » seul (R-30)`);
  check(!t.includes('ton nom y figure'), `${nom} : plus de « ton nom y figure » (98, étape a)`);
  check(t.includes('la fiche du club, ses photos et ses annonces'), `${nom} : fiche du club géré conservée`);
}
for (const [nom, t] of [textes[1], textes[2]]) {
  check(
    t.includes('Chaque réservation que tu as créée et qui a été jouée') &&
      t.includes('les invitations, les cours avec un coach, les réservations annulées et les absences ne comptent pas') &&
      t.includes('−50 % sur ton prochain match, plafonné à 5 000 FCFA') &&
      t.includes('offert par PadelConnect') &&
      t.includes("tu montres ton code au club, qui l'applique sur le prix du match"),
    `${nom} : règle de fidélité cible (CONF-7)`,
  );
  check(t.includes("Un cours avec un coach n'est pas une partie"), `${nom} : un cours n'est pas une partie (T-3)`);
  check(t.includes("ni s'il est ensuite annulé par le club hôte"), `${nom} : frais d'un tournoi annulé par le club (T-12)`);
}
check(cgu.includes('Profile → Notifications'), 'cgu EN : actus et agenda désactivables (R-14)');
check(cgu.includes('50% off your next match, capped at 5,000 FCFA'), 'cgu EN : règle de fidélité cible (CONF-7)');
check(cgu.includes('A coaching lesson is not a game'), "cgu EN : un cours n'est pas une partie (T-3)");
check(cgu.includes('or if the host club later cancels it'), "cgu EN : frais d'un tournoi annulé par le club (T-12)");
check(cgu.includes('“Former player”') && cgu.includes('loyalty discounts already served'), 'cgu EN : ce qui subsiste (R-30, 92)');
check(privacy.includes('sauf si tu les désactives'), "privacy : usage des actus et de l'agenda (R-14)");

// ── (5) Aucune divergence entre les copies ──────────────────────────────────────────
// Dictionnaire I18N de cgu.html, évalué tel quel (fichier du dépôt) ; texte brut = balises retirées.
const cguBrut = lire('site/cgu.html');
const fenetre: { I18N?: Record<string, { fr: string; en: string }> } = {};
new Function('window', /<script>\s*([\s\S]*?window\.I18N[\s\S]*?)<\/script>/.exec(cguBrut)?.[1] ?? '')(fenetre);
const I18N = fenetre.I18N ?? {};
const sansBalises = (s: string) => plat(s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&')).trim();
const elements = [...cguBrut.matchAll(/<(\w+)[^>]*\sdata-i18n(?:-html)?="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g)];
check(elements.length > 20 && Object.keys(I18N).length > 20, 'cgu : HTML et dictionnaire lus');
for (const [, , cle, html] of elements) {
  const fr = I18N[cle]?.fr;
  check(fr !== undefined && sansBalises(html) === sansBalises(fr), `cgu : HTML FR = dictionnaire FR (${cle})`);
}
// legal.tsx : balises JSX et `{' '}` retirés, puis chaque paragraphe partagé doit s'y trouver.
const legalBrut = plat(
  lire('src/app/legal.tsx')
    .replace(/\{' '\}/g, ' ')
    .replace(/<[^>]+>/g, ''),
);
for (const cle of [
  'service.texte1',
  'service.texte2',
  'compte.texte1',
  'compte.texte2',
  'reservations.texte1',
  'reservations.texte1b',
  'reservations.texte2',
  'fidelite.texte1',
  'tournois.texte1',
  'moderation.texte1',
]) {
  const fr = I18N[cle]?.fr;
  check(fr !== undefined && legalBrut.includes(sansBalises(fr)), `legal.tsx = cgu.html (${cle})`);
}

if (failed) {
  console.error(`\n${failed} test(s) en échec`);
  process.exit(1);
}
console.log('\nTous les tests des textes légaux passent.');
