// Quiz de niveau de l’inscription — barème PUR et testable (aucun import, aucun état, aucun réseau).
// Le joueur ne choisit plus lui-même son niveau (source de « 6 » fantaisistes qui se voyaient en
// deux échanges) : il répond à 4 questions simples et l’app en DÉRIVE un niveau de départ, par un
// barème TRANSPARENT, borné [1, 7] comme partout ailleurs (`clampLevel`, src/store/helpers.ts ;
// le serveur borne pareil à l’inscription, SQL 36).
//
// BARÈME — additif, au demi-point, base 1.0 (tout le monde part du plancher) :
//   fréquence   +0 / +0.5 / +1 / +1.5 / +2   (jamais joué → plusieurs fois par semaine)
//   raquette    +0 / +0.5 / +1               (autre sport de raquette : tennis, squash, badminton)
//   compétition +0 / +0.5 / +1.5             (jamais → matchs entre amis → tournois)
//   auto-éval   +0 / +0.5 / +1               (débutant → intermédiaire → avancé)
//
// DEUX PLAFONDS anti-fantaisie (le niveau sert à ÉQUILIBRER les matchs, pas à se vanter) :
//   1) « Je n’ai jamais joué » ⇒ NEVER_PLAYED_MAX (2.0) quoi qu’il coche ailleurs — le tennis
//      donne des réflexes, il ne fait pas encore un joueur de padel ;
//   2) le quiz ne rend JAMAIS plus de QUIZ_MAX (5.5) — les niveaux 6 et 7 se GAGNENT sur le
//      terrain (tournois officiels : +LEVEL_STEP à la clôture, attribué côté serveur).
// Le total brut peut monter à 6.5 : les plafonds sont donc bien ATTEINTS, pas décoratifs.

export type QuizAnswers = {
  frequency: 'jamais' | 'decouverte' | 'mensuel' | 'hebdo' | 'intensif';
  racketSport: 'aucun' | 'loisir' | 'confirme';
  competition: 'jamais' | 'amical' | 'tournois';
  selfAssess: 'debutant' | 'intermediaire' | 'avance';
};

// Clé d’une question = champ de réponse (les 4 questions couvrent EXACTEMENT les 4 champs).
export type QuizKey = keyof QuizAnswers;

// Une question et ses options. Type MAPPÉ (union discriminée par `key`) : les options d’une
// question ne peuvent porter que les valeurs de SON champ — une faute de frappe ne compile pas.
export type QuizQuestion = {
  [K in QuizKey]: {
    key: K;
    title: string;
    help: string;
    options: readonly { value: QuizAnswers[K]; label: string }[];
  };
}[QuizKey];

export const QUIZ_MIN = 1; // plancher des niveaux de l’app (identique à clampLevel)
export const QUIZ_MAX = 5.5; // plafond du quiz : 6 et 7 se gagnent en jouant

const NEVER_PLAYED_MAX = 2; // plafond de qui n’a jamais touché une raquette de padel
const BASE = 1; // point de départ commun à tout le monde

// Barème, une table par question. Ordre des valeurs = ordre d’affichage (croissant) : répondre
// « plus » ne peut jamais faire BAISSER le niveau obtenu.
const FREQUENCY_POINTS: Record<QuizAnswers['frequency'], number> = {
  jamais: 0,
  decouverte: 0.5,
  mensuel: 1,
  hebdo: 1.5,
  intensif: 2,
};

const RACKET_POINTS: Record<QuizAnswers['racketSport'], number> = {
  aucun: 0,
  loisir: 0.5,
  confirme: 1,
};

// La compétition pèse plus lourd (+1.5) : c’est le meilleur indicateur d’un vrai niveau de jeu.
const COMPETITION_POINTS: Record<QuizAnswers['competition'], number> = {
  jamais: 0,
  amical: 0.5,
  tournois: 1.5,
};

const SELF_POINTS: Record<QuizAnswers['selfAssess'], number> = {
  debutant: 0,
  intermediaire: 0.5,
  avance: 1,
};

// Les 4 questions, dans l’ordre du parcours d’inscription (libellés en tutoiement, charte
// PadelConnect). Les options vont TOUJOURS du moins au plus fort — c’est ce que suppose le barème.
export const QUIZ_QUESTIONS: readonly QuizQuestion[] = [
  {
    key: 'frequency',
    title: 'Tu joues au padel à quelle fréquence ?',
    help: 'Réponds franchement — ton niveau évoluera tout seul en jouant.',
    options: [
      { value: 'jamais', label: 'Je n’ai jamais joué' },
      { value: 'decouverte', label: 'J’ai découvert récemment' },
      { value: 'mensuel', label: 'Une à deux fois par mois' },
      { value: 'hebdo', label: 'Chaque semaine' },
      { value: 'intensif', label: 'Plusieurs fois par semaine' },
    ],
  },
  {
    key: 'racketSport',
    title: 'Tu pratiques un autre sport de raquette ?',
    help: 'Tennis, squash, badminton… les réflexes, ça compte.',
    options: [
      { value: 'aucun', label: 'Aucun' },
      { value: 'loisir', label: 'En loisir' },
      { value: 'confirme', label: 'Bon niveau' },
    ],
  },
  {
    key: 'competition',
    title: 'Tu joues en compétition ?',
    help: 'Même un petit tournoi entre clubs compte.',
    options: [
      { value: 'jamais', label: 'Jamais' },
      { value: 'amical', label: 'Des matchs entre amis' },
      { value: 'tournois', label: 'Des tournois' },
    ],
  },
  {
    key: 'selfAssess',
    title: 'Et toi, tu te situes où ?',
    help: 'Ton ressenti, tout simplement.',
    options: [
      { value: 'debutant', label: 'Débutant' },
      { value: 'intermediaire', label: 'Intermédiaire' },
      { value: 'avance', label: 'Avancé' },
    ],
  },
];

// Niveau de départ dérivé des 4 réponses. PURE. Défensive : une valeur inconnue (réponse
// corrompue relue du disque) vaut 0 point — elle ne peut JAMAIS gonfler le niveau.
export function levelFromQuiz(a: QuizAnswers): number {
  const raw =
    BASE +
    (FREQUENCY_POINTS[a.frequency] ?? 0) +
    (RACKET_POINTS[a.racketSport] ?? 0) +
    (COMPETITION_POINTS[a.competition] ?? 0) +
    (SELF_POINTS[a.selfAssess] ?? 0);
  // Plafonds : celui du « jamais joué » remplace le plafond général (il est plus bas).
  const capped = Math.min(raw, a.frequency === 'jamais' ? NEVER_PLAYED_MAX : QUIZ_MAX);
  const rounded = Math.round(capped * 2) / 2; // au demi-point, comme les niveaux de l’app
  return Math.min(7, Math.max(QUIZ_MIN, rounded));
}
