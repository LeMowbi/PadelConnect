// Test de logique — barème du quiz de niveau à l’inscription (src/lib/levelQuiz.ts) :
//   node --experimental-strip-types tests/levelQuiz.test.ts
// Ce barème remplace le niveau auto-déclaré : il alimente le profil, l’équilibrage des matchs
// et l’affichage `levelLabel`. Deux invariants sont VITAUX et vérifiés ici sur les 135
// combinaisons possibles : « jamais joué » ne dépasse jamais 2, et le quiz ne rend jamais plus
// de 5.5 (les niveaux 6-7 se gagnent en tournoi officiel, côté serveur).

import { levelFromQuiz, QUIZ_MAX, QUIZ_MIN, QUIZ_QUESTIONS, type QuizAnswers, type QuizKey } from '../src/lib/levelQuiz.ts';

let failed = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? '✓' : '✗ ÉCHEC'} ${msg}`);
  if (!cond) failed++;
};
const eq = (a: unknown, b: unknown, msg: string) => check(JSON.stringify(a) === JSON.stringify(b), msg);

// Valeurs de chaque question, DU MOINS AU PLUS FORT (ordre supposé par le barème).
const FREQUENCIES: QuizAnswers['frequency'][] = ['jamais', 'decouverte', 'mensuel', 'hebdo', 'intensif'];
const RACKETS: QuizAnswers['racketSport'][] = ['aucun', 'loisir', 'confirme'];
const COMPETITIONS: QuizAnswers['competition'][] = ['jamais', 'amical', 'tournois'];
const SELVES: QuizAnswers['selfAssess'][] = ['debutant', 'intermediaire', 'avance'];

// Valeurs telles que les propose l’UI (pour prouver que les 4 listes ci-dessus = les questions).
const valuesOf = (key: QuizKey): string[] => {
  const q = QUIZ_QUESTIONS.find((x) => x.key === key);
  if (!q) return [];
  const options: readonly { value: string; label: string }[] = q.options;
  return options.map((o) => o.value);
};

// ── Les 4 questions affichées ───────────────────────────────────────────────────
check(QUIZ_QUESTIONS.length === 4, 'Le quiz pose exactement 4 questions');
eq(
  QUIZ_QUESTIONS.map((q) => q.key),
  ['frequency', 'racketSport', 'competition', 'selfAssess'],
  'Les 4 questions couvrent les 4 champs de réponse, dans l’ordre du parcours',
);
eq(valuesOf('frequency'), FREQUENCIES, 'Options de fréquence affichées du moins au plus fort');
eq(valuesOf('racketSport'), RACKETS, 'Options « autre sport de raquette » dans l’ordre croissant');
eq(valuesOf('competition'), COMPETITIONS, 'Options de compétition dans l’ordre croissant');
eq(valuesOf('selfAssess'), SELVES, 'Options d’auto-évaluation dans l’ordre croissant');
check(
  QUIZ_QUESTIONS.every((q) => {
    const options: readonly { value: string; label: string }[] = q.options;
    return q.title.length > 0 && options.length >= 2 && options.every((o) => o.label.length > 0);
  }),
  'Chaque question a un intitulé, au moins 2 options, et aucune option sans libellé',
);

// ── Cas de référence ────────────────────────────────────────────────────────────
const answers = (
  frequency: QuizAnswers['frequency'],
  racketSport: QuizAnswers['racketSport'],
  competition: QuizAnswers['competition'],
  selfAssess: QuizAnswers['selfAssess'],
): QuizAnswers => ({ frequency, racketSport, competition, selfAssess });

// Débutant complet : le plancher de l’app.
check(levelFromQuiz(answers('jamais', 'aucun', 'jamais', 'debutant')) === 1, 'Débutant complet → niveau 1 (plancher)');
check(QUIZ_MIN === 1 && QUIZ_MAX === 5.5, 'Bornes du quiz : plancher 1, plafond 5.5');

// PLAFOND « jamais joué » : quoi qu’il coche ailleurs, il ne dépasse pas 2.
check(
  levelFromQuiz(answers('jamais', 'confirme', 'tournois', 'avance')) === 2,
  'A « jamais joué » mais se dit avancé/compétiteur → plafonné à 2',
);
check(levelFromQuiz(answers('jamais', 'confirme', 'amical', 'intermediaire')) === 2, 'Jamais joué + tennis confirmé → plafonné à 2');
check(levelFromQuiz(answers('jamais', 'loisir', 'jamais', 'debutant')) === 1.5, 'Jamais joué + raquette loisir → 1.5 (sous le plafond)');

// PLAFOND GÉNÉRAL : le quiz ne rend jamais plus de 5.5 (6 et 7 se gagnent en jouant).
check(
  levelFromQuiz(answers('hebdo', 'confirme', 'tournois', 'avance')) === 5.5,
  'Hebdo + tennis confirmé + tournois + avancé → 5.5 (brut 6, plafonné)',
);
check(
  levelFromQuiz(answers('intensif', 'confirme', 'tournois', 'avance')) === QUIZ_MAX,
  'Le profil MAXIMAL (brut 6.5) ne dépasse pas non plus 5.5',
);

// Progression au milieu du barème (base 1 + points).
check(levelFromQuiz(answers('decouverte', 'loisir', 'jamais', 'debutant')) === 2, 'Découverte + raquette loisir → 2');
check(levelFromQuiz(answers('mensuel', 'aucun', 'amical', 'intermediaire')) === 3, 'Mensuel + matchs entre amis + intermédiaire → 3');
check(levelFromQuiz(answers('hebdo', 'loisir', 'amical', 'intermediaire')) === 4, 'Hebdo + loisir + amical + intermédiaire → 4');
check(levelFromQuiz(answers('intensif', 'aucun', 'tournois', 'debutant')) === 4.5, 'Intensif + tournois, modeste sur lui-même → 4.5');

// ── Propriétés vérifiées sur les 135 combinaisons ───────────────────────────────
const all: QuizAnswers[] = [];
for (const frequency of FREQUENCIES)
  for (const racketSport of RACKETS)
    for (const competition of COMPETITIONS)
      for (const selfAssess of SELVES) all.push(answers(frequency, racketSport, competition, selfAssess));
check(all.length === 135, 'Les 4 questions donnent 135 combinaisons de réponses');

check(
  all.every((a) => {
    const lvl = levelFromQuiz(a);
    return lvl >= QUIZ_MIN && lvl <= QUIZ_MAX && Number.isInteger(lvl * 2);
  }),
  'Toute réponse donne un multiple de 0.5 dans [1, 5.5]',
);
check(
  all.every((a) => a.frequency !== 'jamais' || levelFromQuiz(a) <= 2),
  'Aucune combinaison « jamais joué » ne dépasse 2 (135 combinaisons balayées)',
);

// MONOTONIE : répondre « plus » sur une question ne fait JAMAIS baisser le niveau — sinon un
// joueur aurait intérêt à se sous-déclarer pour monter, et les plafonds seraient contournables.
const nextOf = <T>(list: T[], value: T): T | null => {
  const i = list.indexOf(value);
  return i >= 0 && i + 1 < list.length ? list[i + 1] : null;
};
let monotone = true;
for (const a of all) {
  const lvl = levelFromQuiz(a);
  const stronger: QuizAnswers[] = [];
  const f = nextOf(FREQUENCIES, a.frequency);
  if (f) stronger.push({ ...a, frequency: f });
  const r = nextOf(RACKETS, a.racketSport);
  if (r) stronger.push({ ...a, racketSport: r });
  const c = nextOf(COMPETITIONS, a.competition);
  if (c) stronger.push({ ...a, competition: c });
  const s = nextOf(SELVES, a.selfAssess);
  if (s) stronger.push({ ...a, selfAssess: s });
  for (const up of stronger) if (levelFromQuiz(up) < lvl) monotone = false;
}
check(monotone, 'Monotonie : répondre « plus » ne fait jamais baisser le niveau (135 combinaisons)');

// Le plafond 5.5 est réellement ATTEINT (barème utile, pas décoratif) et 1 reste possible.
check(
  all.some((a) => levelFromQuiz(a) === QUIZ_MAX) && all.some((a) => levelFromQuiz(a) === QUIZ_MIN),
  'Le quiz atteint son plafond 5.5 et son plancher 1',
);

if (failed) {
  console.error(`\n${failed} test(s) en échec`);
  process.exit(1);
}
console.log('\nTous les tests levelQuiz.ts passent.');
