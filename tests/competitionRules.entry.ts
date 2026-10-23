// Règles PURES des tournois (src/data/competitions.ts), bundlé par tests/competitionRules.test.mjs
// (esbuild résout l'alias @/ — le module importe @/lib/americano et @/lib/days).
// Trois invariants : (1) des frais « 0 » / « offert » / vides sont GRATUITS partout (aucun bouton
// « Contacter … (règlement) » pour rien, C-05) ; (2) deux équipes au MÊME libellé restent toutes
// deux affichées (R-41 — l'équipe homonyme ne disparaît pas derrière la mienne) ; (3) le
// pré-contrôle d'inscription détecte un libellé déjà pris, sans tenir compte de la casse ni des
// espaces (la clôture serveur ne saurait pas quelle équipe créditer).

import { entryFeeLabel, hasEntryFee, isFreeFee, teamNameTaken, teamsToShow, type Competition } from '@/data/competitions';

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

// 1. Frais gratuits : vide, « Gratuit », « offert(e) », zéro (avec ou sans F / FCFA / XOF).
for (const free of [
  '',
  '   ',
  'Gratuit',
  'GRATUIT',
  'offert',
  'Offerte',
  '0',
  '00',
  ' 0 ',
  '0F',
  '0 F',
  '0 FCFA',
  '0fcfa',
  '0 F CFA',
  '0 XOF',
]) {
  check(isFreeFee(free), `isFreeFee(${JSON.stringify(free)}) = gratuit`);
  check(!hasEntryFee(free), `hasEntryFee(${JSON.stringify(free)}) = faux (pas de bouton de règlement)`);
  eq(entryFeeLabel(free), 'Gratuit', `entryFeeLabel(${JSON.stringify(free)}) → « Gratuit »`);
}
for (const paid of ['5000', '5 000 FCFA', '10000 F', '100', '2 500 F par équipe', 'Cagnotte']) {
  check(!isFreeFee(paid), `isFreeFee(${JSON.stringify(paid)}) = payant`);
  check(hasEntryFee(paid), `hasEntryFee(${JSON.stringify(paid)}) = vrai`);
}
eq(entryFeeLabel('10000 FCFA'), '10 000 FCFA', 'entryFeeLabel espace les milliers (comme formatFee)');
eq(entryFeeLabel(undefined), 'Gratuit', 'entryFeeLabel(undefined) → « Gratuit »');

// 2. Libellés homonymes : la mienne en tête, l'homonyme d'une AUTRE équipe reste listé.
const comp = {
  id: 'c1',
  title: 'T',
  organizerType: 'club',
  organizer: 'Club',
  date: '',
  dateKey: '2026-11-02',
  format: 'Mini-tournoi',
  level: 'Tous niveaux',
  reward: '',
  fee: 'Gratuit',
  slots: 8,
  registered: 3,
  server: true,
  teamNames: ['Zed & Yo', 'Ali & Partenaire', 'Ali & Partenaire'],
} as Competition;
eq(
  teamsToShow(comp, 'Ali & Partenaire'),
  ['Ali & Partenaire', 'Zed & Yo', 'Ali & Partenaire'],
  'teamsToShow : ma team en tête, l’équipe homonyme n’est pas avalée',
);
eq(teamsToShow(comp, 'Zed & Yo'), ['Zed & Yo', 'Ali & Partenaire', 'Ali & Partenaire'], 'teamsToShow : une seule occurrence retirée');
eq(teamsToShow(comp), comp.teamNames, 'teamsToShow sans équipe : roster tel quel');

// 3. Pré-contrôle d'inscription (R-41).
check(teamNameTaken(comp, 'Ali & Partenaire'), 'teamNameTaken : libellé identique');
check(teamNameTaken(comp, '  ali &  partenaire '), 'teamNameTaken : casse et espaces ignorés');
check(!teamNameTaken(comp, 'Ali & Koffi'), 'teamNameTaken : partenaire différent → libre');
check(!teamNameTaken({ ...comp, teamNames: undefined }, 'Ali & Partenaire'), 'teamNameTaken : roster inconnu → libre');

if (failed > 0) {
  console.error(`\n${failed} échec(s).`);
  process.exit(1);
}
console.log('\nRègles des tournois : tout est vert.');
