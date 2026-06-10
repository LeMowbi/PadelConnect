// Amis — données de DÉMONSTRATION. Le compte de l'utilisateur vit dans le store (AppContext).

export type Friend = { id: string; name: string; phone?: string; level?: number };

export const seedFriends: Friend[] = [
  { id: 'f1', name: 'Karim', phone: '+225 07 11 22 33 44', level: 4.0 },
  { id: 'f2', name: 'Fatou', phone: '+225 05 66 77 88 99', level: 2.0 },
  { id: 'f3', name: 'David', level: 5.0 },
  { id: 'f4', name: 'Ines', level: 3.5 },
];
