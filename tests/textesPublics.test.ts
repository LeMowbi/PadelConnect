// Test de logique — textes publics du site (site/privacy.html, site/cgu.html FR + EN,
// site/supprimer-mon-compte.html, site/index.html) :
//   node --experimental-strip-types tests/textesPublics.test.ts
// Complète tests/legalTexts.test.ts (vague 3c, groupe « textes »). Invariants :
// (1) ce qui subsiste après suppression suit delete_account de la 98 : la place d'un compte supprimé
//     devient « Ancien joueur » PARTOUT — son nom ne reste nulle part dans l'historique des autres ;
// (2) la fiche d'un club géré (photos, annonces) reste en ligne : les quatre copies le disent ;
// (3) la page publique ne range plus parmi les données effacées ce que la 98 garde sans nom ;
// (4) la politique liste blocages et signalements, et ne déclare pas un suivi d'écrans inexistant
//     (seuls 3 `track(` métier : inscription, réservation, tournoi) ;
// (5) aucun superlatif inventé sur la page d'accueil (« aucune donnée factice », CLAUDE.md §2).

/// <reference types="node" />
import { readFileSync } from 'node:fs';

let failed = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? '✓' : '✗ ÉCHEC'} ${msg}`);
  if (!cond) failed++;
};
const lire = (chemin: string) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8');
// Texte « plat » : espaces, retours à la ligne et apostrophes typographiques normalisés.
const plat = (s: string) => s.replace(/’/g, "'").replace(/\s+/g, ' ');

const privacy = plat(lire('site/privacy.html'));
const cgu = plat(lire('site/cgu.html')); // HTML FR + dictionnaire I18N FR/EN
const suppression = plat(lire('site/supprimer-mon-compte.html'));
const accueil = plat(lire('site/index.html'));
const textes: [string, string][] = [
  ['privacy', privacy],
  ['cgu', cgu],
  ['supprimer-mon-compte', suppression],
];

// ── (1) « Ancien joueur » partout, plus aucun nom gardé ─────────────────────────────
for (const [nom, t] of textes) {
  check(!t.includes('ton nom y figure'), `${nom} : plus de « ton nom y figure » (98, étape a)`);
  check(t.includes('ta place y apparaît « Ancien joueur », sans ton nom'), `${nom} : place « Ancien joueur », sans nom (98)`);
}
check(!cgu.includes('your name appears where you were invited'), 'cgu EN : plus de « your name appears » (98)');
check(cgu.includes('your place shows as “Ancien joueur”'), 'cgu EN : libellé réel « Ancien joueur » cité');
check(cgu.includes('organiser shown as “Compte supprimé”'), 'cgu EN : libellé réel « Compte supprimé » cité');

// ── (2) Fiche du club d'un gérant : même ligne dans les quatre copies ───────────────
for (const [nom, t] of textes) {
  check(/la fiche du club, ses photos et ses annonces/.test(t), `${nom} : la fiche du club géré reste en ligne`);
}
check(cgu.includes("the club's page, its photos and its announcements"), 'cgu EN : la fiche du club géré reste en ligne');

// ── (3) Page publique : rien de « supprimé » que la 98 garde ────────────────────────
check(!suppression.includes('tes avis, tes scores,'), 'suppression : « tes scores » n’est plus effacé sans réserve');
check(suppression.includes('sauf les matchs passés que gardent tes partenaires'), 'suppression : exception des matchs passés');

// ── (4) Politique : données de modération, diagnostics réels ────────────────────────
check(
  privacy.includes('joueurs que tu as bloqués') && privacy.includes('avis que tu as signalés'),
  'privacy : blocages et signalements listés',
);
check(!privacy.includes('écrans consultés'), 'privacy : plus de suivi d’écrans déclaré');
check(privacy.includes('inscription terminée, réservation ou tournoi créé'), 'privacy : les 3 événements réels');
const tracks = [...lire('src/store/AppContext.tsx').matchAll(/\btrack\('([a-z_]+)'/g)].map((m) => m[1]);
check(
  tracks.sort().join(',') === 'competition_created,reservation_created,signup_completed',
  `diagnostics : seuls 3 événements métier (${tracks.join(', ')})`,
);

// ── (5) Page d'accueil sans superlatif ──────────────────────────────────────────────
check(!/meilleurs clubs/i.test(accueil) && !/best clubs/i.test(accueil), 'index : plus de « meilleurs clubs »');

if (failed) {
  console.error(`\n${failed} test(s) en échec`);
  process.exit(1);
}
console.log('\nTous les tests des textes publics passent.');
