// Tournoi « Americano » — génération PURE des rondes (rotation de paires) et du classement final.
// Module SANS import runtime et SANS aléa (`Math.random` interdit) : à mêmes entrées, mêmes sorties.
// Le gérant peut donc réafficher, repartager ou recalculer sa grille sans qu'elle change sous ses yeux.
//
// PRINCIPE de l'americano : on change de partenaire à CHAQUE ronde et on marque des points
// INDIVIDUELS (chaque joueur encaisse le score de son équipe), pas des victoires — le classement
// départage les JOUEURS, jamais les paires. Un match = un jeu court (ex. en 24 points), pas de sets.
//
// ALGORITHME, en deux couches indépendantes :
//   1) QUI JOUE (repos tournant) — on n'aligne que `4 × min(⌊joueurs/4⌋, terrains)` joueurs par
//      ronde. Les actifs sont une FENÊTRE CONTIGUË de la liste, décalée du nombre de joueurs au
//      repos à chaque ronde : les blocs de repos pavent alors le cercle sans trou ni recouvrement,
//      donc chacun se repose le même nombre de fois à ±1 près (et joue autant de matchs à ±1 près).
//   2) QUI AVEC QUI (méthode du cercle) — dans le groupe actif, le 1er joueur reste fixe et les
//      autres tournent d'un cran : c'est le round-robin classique, dont la propriété est que sur
//      `taille − 1` rondes chaque paire apparaît EXACTEMENT une fois → personne n'a deux fois le
//      même partenaire. Les paires obtenues sont ensuite assemblées en matchs (première moitié
//      contre seconde moitié, avec un décalage tournant) pour varier aussi les ADVERSAIRES.
//      ⚠️ Le cran de rotation n'est PAS le numéro de ronde mais le nombre de fois que CE groupe
//      est déjà passé sur le terrain : sinon, à 6 joueurs sur 1 terrain, le cycle de la fenêtre et
//      celui de la rotation se synchronisent et la ronde 4 rejoue la ronde 1 à l'identique.

// Un joueur est identifié par son prénom (unique dans la session, cf. `normalizePlayers`).
export type AmericanoPlayer = string;

// Une équipe = exactement 2 joueurs (le padel se joue en double, y compris en americano).
export type AmericanoTeam = [AmericanoPlayer, AmericanoPlayer];

// Un match d'une ronde. `courtIndex` est l'INDEX du terrain (0 = 1er terrain), pas son nom :
// le module reste indépendant du nommage des terrains de chaque club.
export type AmericanoMatch = { courtIndex: number; teamA: AmericanoTeam; teamB: AmericanoTeam };

// Une ronde : ses matchs simultanés + les joueurs au repos (ordre de la liste d'origine).
// `round` est le NUMÉRO affiché, à partir de 1 (« Ronde 1 »).
export type AmericanoRound = { round: number; matches: AmericanoMatch[]; resting: AmericanoPlayer[] };

// Un score saisi, rattaché à un match par le couple (numéro de ronde, index de terrain).
export type AmericanoScore = { round: number; courtIndex: number; scoreA: number; scoreB: number };

// État COMPLET d'un americano en cours, tel que persisté côté serveur (competitions.americano,
// SQL 82) : la génération/le classement restent purs (client), le serveur ne fait qu'afficher.
export type AmericanoState = { players: string[]; courts: number; rounds: AmericanoRound[]; scores: AmericanoScore[] };

// Une ligne de classement. `played` = matchs RÉELLEMENT joués (un score enregistré), pas les
// matchs prévus — c'est ce qui rend « points / played » (moyenne par match) honnête.
export type AmericanoStanding = { player: AmericanoPlayer; points: number; played: number };

// Podium : les 3 premiers. Champs optionnels — un americano à 4 joueurs a un podium complet, une
// session à moins de 3 classés non.
export type AmericanoPodium = { first?: AmericanoPlayer; second?: AmericanoPlayer; third?: AmericanoPlayer };

export const MIN_PLAYERS = 4; // en dessous, on ne remplit même pas un terrain
export const MAX_PLAYERS = 16; // au-delà, on fait deux sessions (grille illisible sur téléphone)
export const DEFAULT_MAX_ROUNDS = 7; // plafond du nombre de rondes par défaut (une soirée)
const ROUNDS_CAP = 30; // garde-fou : un `rounds` forgé ne doit pas générer une grille absurde

// Prénoms exploitables : rognés, vides retirés, DOUBLONS retirés (comparaison insensible à la
// casse et aux espaces — deux « Ali » dans la même session rendraient le classement ambigu).
// La première orthographe saisie fait foi. Fonction exportée car `standings` doit appliquer
// EXACTEMENT la même normalisation que `buildRounds` pour retrouver ses joueurs.
export function normalizePlayers(players: string[]): AmericanoPlayer[] {
  const seen = new Set<string>();
  const out: AmericanoPlayer[] = [];
  for (const raw of players ?? []) {
    const name = (raw ?? '').trim();
    if (!name) continue;
    const key = name.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

// Nombre de matchs simultanés : borné par l'effectif (4 joueurs par terrain) ET par les terrains
// réellement disponibles. 0 = rien à jouer.
function matchesPerRound(count: number, courts: number): number {
  if (!Number.isFinite(courts)) return 0;
  return Math.max(0, Math.min(Math.floor(count / 4), Math.floor(courts)));
}

// Ordre du « cercle » d'un groupe actif : le 1er joueur reste fixe, les autres tournent de `turn`
// crans. C'est ce qui fait tourner les partenaires sans jamais répéter une paire.
function ring(active: AmericanoPlayer[], turn: number): AmericanoPlayer[] {
  const size = active.length;
  const out: AmericanoPlayer[] = [active[0]];
  for (let i = 1; i < size; i++) out.push(active[1 + ((i - 1 + turn) % (size - 1))]);
  return out;
}

// Génère la grille du tournoi. `courts` = terrains disponibles, `rounds` = nombre de rondes
// souhaité (défaut : joueurs − 1, plafonné à 7 — au-delà de joueurs − 1, la rotation se répète).
// Renvoie [] si l'effectif sort de [4, 16] ou si aucun terrain n'est disponible.
export function buildRounds(players: string[], courts: number, rounds?: number): AmericanoRound[] {
  const list = normalizePlayers(players);
  const count = list.length;
  if (count < MIN_PLAYERS || count > MAX_PLAYERS) return [];

  const perRound = matchesPerRound(count, courts);
  if (perRound === 0) return [];
  const active = perRound * 4; // joueurs sur les terrains à chaque ronde
  const idle = count - active; // joueurs au repos à chaque ronde

  const wanted = rounds ?? Math.min(count - 1, DEFAULT_MAX_ROUNDS);
  const total = Math.max(1, Math.min(ROUNDS_CAP, Math.floor(Number.isFinite(wanted) ? wanted : 0)));

  // Nombre de passages déjà effectués par chaque groupe actif (clé = décalage de la fenêtre).
  const passes = new Map<number, number>();
  const out: AmericanoRound[] = [];

  for (let r = 0; r < total; r++) {
    // 1) Fenêtre des joueurs actifs : elle avance de `idle` crans par ronde, donc les blocs de
    //    repos se suivent bout à bout autour de la liste → repos parfaitement équitables (±1).
    const offset = idle === 0 ? 0 : (r * idle) % count;
    const turn = passes.get(offset) ?? 0;
    passes.set(offset, turn + 1);

    const onCourt: AmericanoPlayer[] = [];
    for (let i = 0; i < active; i++) onCourt.push(list[(offset + i) % count]);

    // 2) Méthode du cercle → paires disjointes, jamais deux fois les mêmes sur ce groupe.
    const order = ring(onCourt, turn);
    const pairs: AmericanoTeam[] = [];
    for (let i = 0; i < active / 2; i++) pairs.push([order[i], order[active - 1 - i]]);

    // 3) Assemblage en matchs : 1ʳᵉ moitié des paires contre la 2ᵈᵉ, avec un décalage tournant
    //    pour que deux paires ne se croisent pas systématiquement (diversité des adversaires).
    const matches: AmericanoMatch[] = [];
    for (let j = 0; j < perRound; j++) {
      matches.push({ courtIndex: j, teamA: pairs[j], teamB: pairs[perRound + ((j + turn) % perRound)] });
    }

    const playing = new Set(onCourt);
    out.push({ round: r + 1, matches, resting: list.filter((p) => !playing.has(p)) });
  }
  return out;
}

// Un score saisi est-il exploitable ? (nombre fini et positif — pas de NaN, pas de points négatifs)
function isScore(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

// Crédite les 2 joueurs d'une équipe. Un nom absent de la liste (grille d'une autre session)
// est ignoré plutôt que de créer une ligne fantôme au classement.
function award(rows: Map<string, AmericanoStanding>, team: AmericanoTeam, points: number): void {
  for (const player of team) {
    const row = rows.get(player);
    if (!row) continue;
    row.points += points;
    row.played += 1;
  }
}

// Classement INDIVIDUEL : chaque joueur cumule les points marqués par son équipe, match par match.
// Tri : points décroissants, puis ordre alphabétique (départage stable et lisible).
// Un score qui ne retombe sur aucun match (ronde ou terrain inconnu) ou dont les valeurs sont
// inexploitables est ignoré — la saisie d'un gérant ne doit jamais faire sauter le tableau.
export function standings(players: string[], roundsPlayed: AmericanoRound[], scores: AmericanoScore[]): AmericanoStanding[] {
  const rows = new Map<string, AmericanoStanding>();
  for (const player of normalizePlayers(players)) rows.set(player, { player, points: 0, played: 0 });

  // Index des matchs de la grille par « ronde#terrain ».
  const byKey = new Map<string, AmericanoMatch>();
  for (const round of roundsPlayed ?? []) {
    for (const match of round.matches ?? []) byKey.set(`${round.round}#${match.courtIndex}`, match);
  }

  // Une seule saisie retenue par match : une correction REMPLACE le score, elle ne s'y ajoute pas
  // (sinon un gérant qui corrige une faute de frappe doublerait les points et les matchs joués).
  const finals = new Map<string, AmericanoScore>();
  for (const score of scores ?? []) {
    const key = `${score.round}#${score.courtIndex}`;
    if (!byKey.has(key) || !isScore(score.scoreA) || !isScore(score.scoreB)) continue;
    finals.set(key, score);
  }

  for (const [key, score] of finals) {
    const match = byKey.get(key);
    if (!match) continue;
    award(rows, match.teamA, score.scoreA);
    award(rows, match.teamB, score.scoreB);
  }

  return [...rows.values()].sort((a, b) => b.points - a.points || a.player.localeCompare(b.player));
}

// Les 3 premiers d'un classement DÉJÀ trié (sortie de `standings`). Les champs manquent
// proprement quand l'effectif classé est plus petit (jamais de `undefined` affiché à l'écran).
export function podium(rows: AmericanoStanding[]): AmericanoPodium {
  const out: AmericanoPodium = {};
  if (rows?.[0]) out.first = rows[0].player;
  if (rows?.[1]) out.second = rows[1].player;
  if (rows?.[2]) out.third = rows[2].player;
  return out;
}
