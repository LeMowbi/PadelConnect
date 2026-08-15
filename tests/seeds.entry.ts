// Vérification des DONNÉES SEEDS réelles (bundlé par tests/seeds.test.mjs avec
// l'alias @/ résolu) : ids uniques, références croisées valides, plages tarifaires
// continues, équipes de démo uniques. Source réelle — aucun double.
// NB : les seeds de joueurs/amis de démo ont été retirés (comptes réels uniquement) ;
// ce test ne couvre donc plus que les données encore embarquées (clubs, tournois, coachs).

import { clubs } from '@/data/clubs';
import { americanoPodiumTeams, seedCompetitions, teamsToShow, formatFee } from '@/data/competitions';
import { coaches } from '@/data/coaches';
import { minPrice, priceTiersFor } from '@/lib/pricing';
import { weeklyStreak } from '@/store/helpers';

let failed = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? '✓' : '✗ ÉCHEC'} ${msg}`);
  if (!cond) failed++;
};
const uniqueIds = (items: { id: string }[]) => new Set(items.map((i) => i.id)).size === items.length;

// 1. Ids uniques partout.
check(uniqueIds(clubs), `Clubs : ${clubs.length} ids uniques`);
check(uniqueIds(seedCompetitions), `Tournois seeds : ${seedCompetitions.length} ids uniques`);
check(uniqueIds(coaches), `Coachs : ${coaches.length} ids uniques`);

// 2. Références croisées : tous les clubId pointent vers un club existant.
const clubIds = new Set(clubs.map((c) => c.id));
check(
  seedCompetitions.every((c) => !c.clubId || clubIds.has(c.clubId)),
  'Tournois seeds → clubId existants',
);
check(
  coaches.every((c) => !c.clubId || clubIds.has(c.clubId)),
  'Coachs → clubId existants',
);

// 3. Tarifs : priceFrom > 0 partout ; plages de Padelta triées, sans trou ni
//    chevauchement, couvrant 07:00 → 24:00 ; « dès » = min des plages.
check(
  clubs.every((c) => c.priceFrom > 0),
  'priceFrom > 0 pour tous les clubs',
);
const padelta = clubs.find((c) => c.id === 'padelta')!;
const tiers = priceTiersFor(padelta);
check(tiers.length === 3, 'Padelta : 3 plages valides');
const sorted = [...tiers].sort((a, b) => (a.start < b.start ? -1 : 1));
let continuous = sorted[0].start === '07:00' && sorted[sorted.length - 1].end === '24:00';
for (let i = 1; i < sorted.length; i++) if (sorted[i].start !== sorted[i - 1].end) continuous = false;
check(continuous, 'Padelta : plages continues 07:00 → 24:00 (sans trou ni chevauchement)');
check(minPrice(padelta) === padelta.priceFrom, 'Padelta : priceFrom aligné sur le min des plages');
check(
  clubs.filter((c) => c.id !== 'padelta').every((c) => priceTiersFor(c).length === 0),
  'Autres clubs seeds : tarif unique (aucune plage)',
);

// 4. Aucun tournoi de démo exposé (données réelles uniquement).
check(seedCompetitions.length === 0, 'Aucun tournoi de démonstration embarqué (données réelles serveur)');

// 5. teamsToShow : aucun nom fictif — un tournoi LOCAL (hors serveur) ne montre que MON
// équipe (si inscrit), jamais d'adversaires inventés ; un tournoi SERVEUR montre son roster réel.
const localComp = { id: 'synthetic-local', slots: 8, registered: 0 } as unknown as Parameters<typeof teamsToShow>[0];
check(teamsToShow(localComp).length === 0, 'teamsToShow (local, non inscrit) : aucune équipe fictive');
check(
  teamsToShow(localComp, 'Moi & Partenaire').length === 1,
  'teamsToShow (local, inscrit) : seulement MON équipe, pas d’adversaire inventé',
);
const serverComp = {
  id: 'synthetic-server',
  slots: 8,
  registered: 2,
  server: true,
  teamNames: ['Awa & Yann', 'Moi & Partenaire'],
} as unknown as Parameters<typeof teamsToShow>[0];
check(teamsToShow(serverComp, 'Moi & Partenaire')[0] === 'Moi & Partenaire', 'teamsToShow (serveur) : mon équipe en tête du roster réel');

// 6. formatFee : vide → « Gratuit », espace les milliers, et est idempotent (fonction pure).
check(
  formatFee('') === 'Gratuit' && /^5\s000$/u.test(formatFee('5000')) && formatFee(formatFee('5000')) === formatFee('5000'),
  'formatFee : Gratuit + espacement des milliers + idempotent',
);

// 7. americanoPodiumTeams : le classement de l'americano est INDIVIDUEL alors que la clôture
// désigne des ÉQUIPES → on remonte à l'équipe du joueur classé, jamais deux fois la même
// (les 2 joueurs d'une équipe sur le podium), et rien tant qu'aucun score n'est saisi.
const amComp = {
  id: 'synthetic-americano',
  slots: 8,
  registered: 2,
  server: true,
  format: 'Americano (rotation)',
  teamNames: ['Awa & Yann', 'Bob & Cyr'],
  americano: {
    players: ['Awa', 'Yann', 'Bob', 'Cyr'],
    courts: 1,
    rounds: [{ round: 1, matches: [{ courtIndex: 0, teamA: ['Awa', 'Bob'], teamB: ['Yann', 'Cyr'] }], resting: [] }],
    scores: [{ round: 1, courtIndex: 0, scoreA: 24, scoreB: 10 }],
  },
} as unknown as Parameters<typeof americanoPodiumTeams>[0];
const amPodium = americanoPodiumTeams(amComp);
check(amPodium.first === 'Awa & Yann', 'americanoPodiumTeams : le joueur en tête donne SON équipe');
check(amPodium.second === 'Bob & Cyr', 'americanoPodiumTeams : 2ᵉ place = l’équipe du 2ᵉ joueur');
check(amPodium.third === undefined, 'americanoPodiumTeams : une équipe déjà classée n’est jamais reproposée');
const amEmpty = { ...amComp, americano: { ...amComp.americano!, scores: [] } };
check(Object.keys(americanoPodiumTeams(amEmpty)).length === 0, 'americanoPodiumTeams : aucun score ⇒ aucune suggestion');
// Promotion : quand les 2 premiers joueurs sont du MÊME duo, l'équipe suivante MONTE en 2ᵉ
// place (jamais de podium « 1ᵉʳ + 3ᵉ sans 2ᵉ »).
const amPromo = americanoPodiumTeams({ ...amComp, teamNames: ['Awa & Bob', 'Yann & Cyr'] } as typeof amComp);
check(
  amPromo.first === 'Awa & Bob' && amPromo.second === 'Yann & Cyr',
  'americanoPodiumTeams : promotion — l’équipe suivante monte quand le duo de tête truste les 2 premières places',
);

// ── weeklyStreak (helpers.ts, pur) : série de semaines calendaires consécutives jouées ──────
// Bundlé ici (esbuild résout @/ ; helpers.ts n'importe en runtime que @/lib/days, pur) car les
// tests node --strip-types ne résolvent pas l'alias @/. Une semaine EN COURS vide ne casse pas la
// série (elle n'est pas finie), un TROU dans une semaine passée la casse.
const WEEK_MS = 7 * 86400000;
const streakNow = Date.UTC(2026, 7, 15, 12, 0, 0); // repère fixe (samedi 15 août 2026)
check(weeklyStreak([], streakNow) === 0, 'weeklyStreak : aucune partie ⇒ série 0');
// Semaine courante VIDE mais les 2 précédentes jouées : la série remonte depuis la semaine passée.
check(
  weeklyStreak([streakNow - WEEK_MS, streakNow - 2 * WEEK_MS], streakNow) === 2,
  'weeklyStreak : semaine courante vide ne casse pas — série = 2 (2 semaines passées consécutives)',
);
// Série pleine : semaine courante + 2 précédentes jouées.
check(
  weeklyStreak([streakNow, streakNow - WEEK_MS, streakNow - 2 * WEEK_MS], streakNow) === 3,
  'weeklyStreak : 3 semaines consécutives (courante incluse) ⇒ série 3',
);
// TROU : semaine courante et 2 semaines avant jouées, mais PAS la semaine passée → la série s'arrête à 1.
check(
  weeklyStreak([streakNow, streakNow - 2 * WEEK_MS], streakNow) === 1,
  'weeklyStreak : un trou (semaine passée non jouée) casse la série ⇒ 1',
);

console.log(failed === 0 ? '\nTOUTES LES DONNÉES SEEDS SONT COHÉRENTES.' : `\n${failed} incohérence(s) seeds.`);
if (failed > 0) process.exitCode = 1;
