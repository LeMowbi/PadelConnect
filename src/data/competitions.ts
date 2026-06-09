// Compétitions — données de DÉMONSTRATION. Créées par un CLUB ou par un JOUEUR.

export type Competition = {
  id: string;
  title: string;
  organizerType: 'club' | 'joueur';
  organizer: string;
  clubId?: string;
  clubName?: string;
  date: string;
  format: string;
  level: string;
  reward: string; // récompense / dotation
  fee: string; // frais d'inscription
  slots: number;
  registered: number;
  official?: boolean;
  createdByMe?: boolean;
};

export const seedCompetitions: Competition[] = [
  {
    id: 'c1',
    title: 'Tournoi du week-end — Double mixte',
    organizerType: 'club',
    organizer: 'Padelta',
    clubId: 'padelta',
    clubName: 'Padelta',
    date: 'Sam. 14 juin',
    format: 'Poules + tableau final',
    level: 'Intermédiaire',
    reward: 'Bon d’achat 100 000 FCFA + lots partenaires',
    fee: '10 000 FCFA / équipe',
    slots: 16,
    registered: 11,
    official: true,
  },
  {
    id: 'c2',
    title: 'Americano du dimanche',
    organizerType: 'club',
    organizer: 'Padel Zone 4',
    clubId: 'padel-zone-4',
    clubName: 'Padel Zone 4',
    date: 'Dim. 15 juin',
    format: 'Americano (rotation)',
    level: 'Tous niveaux',
    reward: 'Trophée + équipement padel',
    fee: '5 000 FCFA / joueur',
    slots: 24,
    registered: 18,
    official: true,
  },
  {
    id: 'c3',
    title: 'Défi entre amis — Riviera',
    organizerType: 'joueur',
    organizer: 'Moustapha',
    date: 'Ven. 20 juin',
    format: 'Mini-tournoi 4 équipes',
    level: 'Débutant / Intermédiaire',
    reward: 'Cagnotte 30 000 FCFA',
    fee: 'Gratuit',
    slots: 8,
    registered: 5,
  },
];

export const COMP_FORMATS = [
  'Poules + tableau final',
  'Americano (rotation)',
  'Mini-tournoi',
  'Élimination directe',
];
