// Coachs — PROFILS DE DÉMONSTRATION (fictifs). À remplacer par de vrais coachs.

export type Coach = {
  id: string;
  name: string;
  level: string;
  levelValue: number; // niveau enseigné (1.0 → 7.0), pour le classement
  area: string;
  pricePerHour: number; // FCFA — indicatif
  rating: number;
  specialties: string[];
  bio: string;
  accent: string;
};

export const coaches: Coach[] = [
  {
    id: 'coach-1',
    name: 'Coach Aïcha K. (démo)',
    level: 'Initiation & intermédiaire',
    levelValue: 3.0,
    area: 'Cocody',
    pricePerHour: 15000,
    rating: 4.8,
    specialties: ['Service', 'Placement', 'Débutants'],
    bio: "Profil de démonstration. Pédagogue, idéale pour démarrer le padel sereinement et corriger les bases.",
    accent: '#C9A24B',
  },
  {
    id: 'coach-2',
    name: 'Coach David T. (démo)',
    level: 'Avancé & compétition',
    levelValue: 5.5,
    area: 'Marcory',
    pricePerHour: 18000,
    rating: 4.7,
    specialties: ['Jeu au filet', 'Tactique', 'Compétition'],
    bio: "Profil de démonstration. Travaille la tactique de double et le jeu offensif au filet.",
    accent: '#1FB57A',
  },
  {
    id: 'coach-3',
    name: 'Coach Marina S. (démo)',
    level: 'Intermédiaire & avancé',
    levelValue: 4.5,
    area: 'Riviera',
    pricePerHour: 16000,
    rating: 4.6,
    specialties: ['Sorties de mur', 'Régularité', 'Préparation physique'],
    bio: "Profil de démonstration. Spécialiste des sorties de paroi et de la régularité d'échange.",
    accent: '#3FA7D6',
  },
  {
    id: 'coach-4',
    name: 'Coach Yann B. (démo)',
    level: 'Débutant & enfants',
    levelValue: 1.5,
    area: 'Zone 4',
    pricePerHour: 14000,
    rating: 4.9,
    specialties: ['Enfants', 'Initiation', 'Ludique'],
    bio: "Profil de démonstration. Séances ludiques pour enfants et grands débutants.",
    accent: '#C9A24B',
  },
];

export function getCoach(id?: string | string[]): Coach | undefined {
  const key = Array.isArray(id) ? id[0] : id;
  return coaches.find((c) => c.id === key);
}
