// Joueurs de DÉMONSTRATION — alimentent le Classement et les mini-fiches « Suivre ».
// Les 4 premiers partagent les id des amis seeds (data/user.ts) : toucher un ami
// ouvre donc sa vraie fiche. Niveaux volontairement étalés (dont un à 1.0 pour
// tester le plancher du malus, et plusieurs sous 4.00 que l'utilisateur dépasse
// après une victoire).

export type Player = {
  id: string;
  name: string;
  level: number;
  tournamentsPlayed: number;
  tournamentsWon: number;
  favoriteClubId?: string;
};

export const seedPlayers: Player[] = [
  { id: 'f1', name: 'Karim', level: 4.0, tournamentsPlayed: 6, tournamentsWon: 2, favoriteClubId: 'padelta' },
  { id: 'f2', name: 'Fatou', level: 2.0, tournamentsPlayed: 2, tournamentsWon: 0, favoriteClubId: 'district-club' },
  { id: 'f3', name: 'David', level: 5.0, tournamentsPlayed: 9, tournamentsWon: 4, favoriteClubId: 'padel-zone-4' },
  { id: 'f4', name: 'Ines', level: 3.5, tournamentsPlayed: 4, tournamentsWon: 1, favoriteClubId: 'padelta' },
  { id: 'p5', name: 'Awa', level: 5.5, tournamentsPlayed: 12, tournamentsWon: 6, favoriteClubId: 'padel-magic' },
  { id: 'p6', name: 'Nadia', level: 6.0, tournamentsPlayed: 15, tournamentsWon: 8, favoriteClubId: 'padelta' },
  { id: 'p7', name: 'Yann', level: 4.5, tournamentsPlayed: 7, tournamentsWon: 2, favoriteClubId: 'ivoire-padel' },
  { id: 'p8', name: 'Marina', level: 4.25, tournamentsPlayed: 5, tournamentsWon: 1, favoriteClubId: 'district-club' },
  { id: 'p9', name: 'Moussa', level: 3.75, tournamentsPlayed: 4, tournamentsWon: 0, favoriteClubId: 'elite-club' },
  { id: 'p10', name: 'Serge', level: 3.0, tournamentsPlayed: 3, tournamentsWon: 0, favoriteClubId: 'padelhouse' },
  { id: 'p11', name: 'Aminata', level: 2.5, tournamentsPlayed: 2, tournamentsWon: 0, favoriteClubId: 'padel-palmeraie' },
  { id: 'p12', name: 'Idriss', level: 1.0, tournamentsPlayed: 1, tournamentsWon: 0, favoriteClubId: 'abidjan-padel' },
];

export function playerById(id: string): Player | undefined {
  return seedPlayers.find((p) => p.id === id);
}
