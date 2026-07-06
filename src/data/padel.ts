// Contenu pédagogique « Découvrir le padel ». Règles vérifiées et simplifiées.

export const padelIntro =
  'Le padel est un sport de raquette qui se joue presque toujours en double (2 contre 2), sur un terrain fermé par des parois vitrées et grillagées que l’on peut utiliser pendant le jeu. C’est un mélange de tennis et de squash : facile à prendre en main, très tactique et surtout très convivial.';

export type PadelSection = { title: string; icon: string; points: string[] };

export const padelSections: PadelSection[] = [
  {
    title: 'Le terrain',
    icon: 'grid-outline',
    points: [
      '20 mètres de long sur 10 mètres de large — plus petit qu’un court de tennis.',
      'Il est entouré de parois vitrées et de grillage qui font partie du jeu.',
      'Un filet sépare le terrain en deux, comme au tennis.',
    ],
  },
  {
    title: 'Le service',
    icon: 'tennisball-outline',
    points: [
      'Le service se fait « à la cuillère », sous le niveau de la taille.',
      'La balle doit d’abord rebondir au sol, derrière la ligne de service.',
      'Elle doit ensuite atterrir en diagonale dans le carré de service adverse.',
      'On a droit à deux essais, comme au tennis.',
    ],
  },
  {
    title: 'Le comptage des points',
    icon: 'calculator-outline',
    points: [
      'Le comptage est identique au tennis : 15, 30, 40, puis jeu.',
      'Une manche (set) se gagne en 6 jeux, avec 2 jeux d’écart.',
      'À 6 jeux partout, on joue un jeu décisif (tie-break).',
      'Un match se joue le plus souvent en 2 manches gagnantes.',
    ],
  },
  {
    title: 'Les parois',
    icon: 'albums-outline',
    points: [
      'La balle peut rebondir sur vos propres parois après avoir touché le sol.',
      'Vous pouvez donc renvoyer une balle qui a rebondi sur le mur de votre camp.',
      'Mais la balle ne doit jamais toucher une paroi adverse avant de rebondir au sol chez l’adversaire.',
    ],
  },
  {
    title: 'Bien démarrer',
    icon: 'sparkles-outline',
    points: [
      'La raquette (« pala ») est pleine et perforée : il n’y a pas de cordage.',
      'On privilégie le placement et la régularité plutôt que la pure puissance.',
      'C’est un sport social : on joue à 4, parfait pour rencontrer du monde.',
    ],
  },
];

export const padelTips = [
  'Place-toi côte à côte avec ton partenaire et avance ou recule ensemble.',
  'Laisse la balle redescendre après la paroi : tu auras un meilleur angle.',
  'La régularité gagne plus de points que les coups spectaculaires.',
];
