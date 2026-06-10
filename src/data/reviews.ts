// Avis sur les clubs — données de DÉMONSTRATION (auteurs fictifs).
// Les utilisateurs peuvent en ajouter ; ces avis N'ORDONNENT PAS la liste des clubs.

export type Review = {
  id: string;
  clubId: string;
  author: string;
  rating: number; // 1..5
  text: string;
  date: string;
};

export const seedReviews: Review[] = [
  { id: 'r1', clubId: 'padelta', author: 'Karim', rating: 5, text: 'Terrains couverts impeccables, parfait même en saison des pluies.', date: 'Mai 2026' },
  { id: 'r2', clubId: 'padelta', author: 'Ines', rating: 5, text: 'Accueil top et le café est un vrai plus après le match.', date: 'Avr. 2026' },
  { id: 'r3', clubId: 'district-club', author: 'Fatou', rating: 5, text: 'Cadre agréable, on reste manger après avoir joué.', date: 'Mai 2026' },
  { id: 'r4', clubId: 'padel-zone-4', author: 'David', rating: 4, text: 'Bien situé en Zone 4, réservation simple.', date: 'Mai 2026' },
  { id: 'r5', clubId: 'abidjan-padel', author: 'Marina', rating: 5, text: "L'appli du club rend la résa très rapide.", date: 'Avr. 2026' },
  { id: 'r6', clubId: 'padel-magic', author: 'Yann', rating: 4, text: 'Sympa de jouer près de l’Hôtel Ivoire, beau cadre.', date: 'Mars 2026' },
];

// Note moyenne d'un club EN INCLUANT les avis publiés par l'utilisateur :
// moyenne pondérée entre la note de base (rating × reviewsCount) et les nouveaux avis.
export function ratingFor(
  club: { id: string; rating: number; reviewsCount: number },
  userReviews: Review[]
): { rating: number; count: number } {
  const mine = userReviews.filter((r) => r.clubId === club.id);
  const count = club.reviewsCount + mine.length;
  if (mine.length === 0 || count === 0) return { rating: club.rating, count };
  const sum = club.rating * club.reviewsCount + mine.reduce((s, r) => s + r.rating, 0);
  return { rating: Math.round((sum / count) * 10) / 10, count };
}
