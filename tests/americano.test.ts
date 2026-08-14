// Test de logique — tournoi Americano (rotation de paires + classement individuel).
// Exécute les VRAIES fonctions source (src/lib/americano.ts) :
//   node --experimental-strip-types tests/americano.test.ts
// Ce qui est prouvé ici : rotation ÉQUILIBRÉE (tout le monde joue autant, repos tournants),
// DIVERSITÉ des partenaires (jamais deux fois le même quand la rotation est complète),
// classement/podium exacts, et robustesse des saisies de score (rien ne fait sauter le tableau).

import { type AmericanoRound, type AmericanoScore, buildRounds, normalizePlayers, podium, standings } from '../src/lib/americano.ts';

let failed = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? '✓' : '✗ ÉCHEC'} ${msg}`);
  if (!cond) failed++;
};

// Prénoms de test, distincts et triés alphabétiquement (17 = un de plus que MAX_PLAYERS).
const NAMES = [
  'Ali',
  'Bob',
  'Cyr',
  'Dan',
  'Eva',
  'Fode',
  'Gus',
  'Hawa',
  'Ines',
  'Jo',
  'Koffi',
  'Lea',
  'Moh',
  'Nadia',
  'Ola',
  'Pia',
  'Rita',
];
const P = (n: number) => NAMES.slice(0, n);

// Clé d'une paire, indépendante de l'ordre des deux joueurs.
const pairKey = (a: string, b: string) => [a, b].sort().join('|');

// Nombre de matchs joués par chaque joueur de la liste (0 pour qui n'apparaît jamais).
function playedCount(players: string[], rounds: AmericanoRound[]): Map<string, number> {
  const out = new Map(players.map((p) => [p, 0]));
  for (const r of rounds) {
    for (const m of r.matches) for (const p of [...m.teamA, ...m.teamB]) out.set(p, (out.get(p) ?? 0) + 1);
  }
  return out;
}

// Nombre de rondes de repos par joueur.
function restCount(players: string[], rounds: AmericanoRound[]): Map<string, number> {
  const out = new Map(players.map((p) => [p, 0]));
  for (const r of rounds) for (const p of r.resting) out.set(p, (out.get(p) ?? 0) + 1);
  return out;
}

// Combien de fois chaque paire a joué ENSEMBLE (partenaires, pas adversaires).
function partnerCount(rounds: AmericanoRound[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rounds) {
    for (const m of r.matches) {
      for (const team of [m.teamA, m.teamB]) {
        const k = pairKey(team[0], team[1]);
        out.set(k, (out.get(k) ?? 0) + 1);
      }
    }
  }
  return out;
}

const spread = (m: Map<string, number>) => Math.max(...m.values()) - Math.min(...m.values());
const maxOf = (m: Map<string, number>) => Math.max(...m.values());

console.log('\n— normalizePlayers —');
check(
  normalizePlayers([' Ali ', 'Bob', 'ali', '', '  ', 'Bob']).join(',') === 'Ali,Bob',
  'rogne, retire les vides et les doublons (casse ignorée)',
);

console.log('\n— garde-fous d’effectif / de terrain —');
check(buildRounds(P(3), 1).length === 0, 'moins de 4 joueurs ⇒ []');
check(buildRounds([], 2).length === 0, 'liste vide ⇒ []');
check(buildRounds(P(17), 4).length === 0, 'plus de 16 joueurs ⇒ []');
check(buildRounds(P(8), 0).length === 0, 'aucun terrain ⇒ []');
check(buildRounds([' Ali ', 'ali', 'Bob', 'Cyr', 'Dan'], 1).length === 3, 'doublons retirés ⇒ 4 joueurs valides, grille générée');

console.log('\n— 4 joueurs, 1 terrain (americano complet) —');
const r4 = buildRounds(P(4), 1);
check(r4.length === 3, '3 rondes par défaut (joueurs − 1)');
check(
  r4.every((r) => r.matches.length === 1 && r.resting.length === 0),
  'chaque ronde : 1 match, personne au repos',
);
check(r4[0].round === 1 && r4[2].round === 3, 'rondes numérotées à partir de 1');
check(r4[0].matches[0].courtIndex === 0, 'courtIndex indexé à partir de 0');
check(
  r4[0].matches[0].teamA.join('/') === 'Ali/Dan' && r4[0].matches[0].teamB.join('/') === 'Bob/Cyr',
  'ronde 1 déterministe : Ali/Dan contre Bob/Cyr',
);
const p4 = partnerCount(r4);
check(p4.size === 6 && maxOf(p4) === 1, 'les 6 paires possibles jouent chacune EXACTEMENT une fois');
check(spread(playedCount(P(4), r4)) === 0, 'chacun joue les 3 matchs');

console.log('\n— 8 joueurs, 2 terrains (rotation complète) —');
const r8 = buildRounds(P(8), 2);
check(r8.length === 7, '7 rondes par défaut (joueurs − 1, plafonné à 7)');
check(
  r8.every((r) => r.matches.length === 2 && r.resting.length === 0),
  'chaque ronde : 2 matchs, personne au repos',
);
check(
  r8.every((r) => new Set(r.matches.flatMap((m) => [...m.teamA, ...m.teamB])).size === 8),
  'chaque ronde aligne les 8 joueurs, chacun une seule fois',
);
const played8 = playedCount(P(8), r8);
check(spread(played8) === 0 && maxOf(played8) === 7, 'chaque joueur joue les 7 rondes');
const p8 = partnerCount(r8);
check(p8.size === 28 && maxOf(p8) === 1, 'les 28 paires possibles jouent chacune une seule fois (partenaires jamais répétés)');
check(maxOf(partnerCount(buildRounds(P(8), 2, 3))) === 1, 'sur 3 rondes à 8 joueurs : personne 2× le même partenaire');

console.log('\n— 6 joueurs (byes équitables) —');
const r6 = buildRounds(P(6), 2);
check(r6.length === 5, '5 rondes par défaut');
check(
  r6.every((r) => r.matches.length === 1 && r.resting.length === 2),
  '⌊6/4⌋ = 1 match par ronde même avec 2 terrains ⇒ 2 joueurs au repos',
);
check(spread(restCount(P(6), r6)) <= 1, 'repos équitables à ±1 près');
check(spread(playedCount(P(6), r6)) <= 1, 'matchs joués équitables à ±1 près');
check(
  new Set(r6.map((r) => r.matches.map((m) => `${[...m.teamA].sort().join()}v${[...m.teamB].sort().join()}`).join('/'))).size === 5,
  'les 5 rondes sont toutes différentes (la fenêtre de repos ne se resynchronise pas)',
);

console.log('\n— 12 / 16 joueurs (schémas équilibrés) —');
const r12 = buildRounds(P(12), 3);
check(
  r12.length === 7 && r12.every((r) => r.matches.length === 3 && r.resting.length === 0),
  '12 joueurs / 3 terrains : 3 matchs par ronde, personne au repos',
);
check(spread(playedCount(P(12), r12)) === 0 && maxOf(partnerCount(r12)) === 1, '12 joueurs : jeu égal et aucun partenaire répété');
const r16 = buildRounds(P(16), 4);
check(
  r16.length === 7 && r16.every((r) => r.matches.length === 4 && r.resting.length === 0),
  '16 joueurs / 4 terrains : 4 matchs par ronde, personne au repos',
);
check(spread(playedCount(P(16), r16)) === 0 && maxOf(partnerCount(r16)) === 1, '16 joueurs : jeu égal et aucun partenaire répété');
const r16c2 = buildRounds(P(16), 2);
check(
  r16c2.every((r) => r.matches.length === 2 && r.resting.length === 8) && spread(playedCount(P(16), r16c2)) <= 1,
  '16 joueurs / 2 terrains : terrains respectés, jeu équitable à ±1 près',
);

console.log('\n— rondes demandées & déterminisme —');
check(buildRounds(P(8), 2, 3).length === 3, 'paramètre rounds respecté');
check(buildRounds(P(8), 2, 0).length === 1, 'rounds ≤ 0 ramené à 1 ronde');
check(
  JSON.stringify(buildRounds(P(10), 2)) === JSON.stringify(buildRounds(P(10), 2)),
  'PUR : deux appels identiques donnent la même grille',
);

console.log('\n— standings (scénario numérique complet) —');
// Grille 4 joueurs : R1 Ali/Dan–Bob/Cyr · R2 Ali/Bob–Cyr/Dan · R3 Ali/Cyr–Dan/Bob.
const scores: AmericanoScore[] = [
  { round: 1, courtIndex: 0, scoreA: 24, scoreB: 10 },
  { round: 2, courtIndex: 0, scoreA: 15, scoreB: 24 },
  { round: 3, courtIndex: 0, scoreA: 24, scoreB: 8 },
];
const table = standings(P(4), r4, scores);
check(table.map((t) => `${t.player}:${t.points}`).join(' ') === 'Ali:63 Cyr:58 Dan:56 Bob:33', 'points individuels cumulés et triés');
check(
  table.every((t) => t.played === 3),
  'chacun compte 3 matchs joués',
);
check(
  standings(P(4), r4, []).every((t) => t.points === 0 && t.played === 0),
  'aucun score ⇒ tout le monde à 0, personne oublié',
);
check(
  standings(P(4), r4, [{ round: 1, courtIndex: 0, scoreA: 24, scoreB: 10 }])
    .map((t) => t.player)
    .join(',') === 'Ali,Dan,Bob,Cyr',
  'égalité de points départagée par ordre alphabétique',
);

console.log('\n— standings (saisies bancales ignorées) —');
const noisy: AmericanoScore[] = [
  { round: 1, courtIndex: 0, scoreA: 5, scoreB: 5 }, // saisie erronée…
  { round: 1, courtIndex: 0, scoreA: 24, scoreB: 10 }, // …corrigée : seule celle-ci compte
  { round: 99, courtIndex: 0, scoreA: 24, scoreB: 0 }, // ronde inexistante
  { round: 1, courtIndex: 7, scoreA: 24, scoreB: 0 }, // terrain inexistant
  { round: 2, courtIndex: 0, scoreA: Number.NaN, scoreB: 10 }, // valeur inexploitable
  { round: 3, courtIndex: 0, scoreA: -5, scoreB: 10 }, // score négatif
];
const cleaned = standings(P(4), r4, noisy);
check(
  cleaned.map((t) => `${t.player}:${t.points}`).join(' ') === 'Ali:24 Dan:24 Bob:10 Cyr:10',
  'seule la correction du match réel est comptée',
);
check(
  cleaned.every((t) => t.played === 1),
  'une re-saisie corrige le score, elle ne double pas les matchs joués',
);
const partial = standings(['Ali', 'Bob'], r4, scores);
check(
  partial.length === 2 && partial.map((t) => t.player).join(',') === 'Ali,Bob',
  'un joueur absent de la liste ne crée pas de ligne fantôme',
);

console.log('\n— podium —');
const pod = podium(table);
check(pod.first === 'Ali' && pod.second === 'Cyr' && pod.third === 'Dan', 'podium = les 3 premiers du classement');
const small = podium(standings(['Ali', 'Bob'], [], []));
check(small.first === 'Ali' && small.second === 'Bob' && small.third === undefined, 'moins de 3 classés ⇒ 3ᵉ place vide');
check(Object.keys(podium([])).length === 0, 'classement vide ⇒ podium vide');

console.log(`\n${failed === 0 ? 'TOUS LES TESTS AMERICANO PASSENT.' : `${failed} ÉCHEC(S).`}`);
process.exit(failed === 0 ? 0 : 1);
