// Amis — données de DÉMONSTRATION. Le compte de l'utilisateur vit dans le store (AppContext).

export type Friend = { id: string; name: string; level: number };

export const seedFriends: Friend[] = [
  { id: 'f1', name: 'Karim', level: 4.0 },
  { id: 'f2', name: 'Fatou', level: 2.0 },
  { id: 'f3', name: 'David', level: 5.0 },
  { id: 'f4', name: 'Ines', level: 3.5 },
];
