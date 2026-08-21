// Badges joueur (gamification douce) — logique PURE (aucun import React/Supabase, aucun appel
// réseau) : l'écran « Mes statistiques » lui passe des chiffres qu'il a DÉJÀ, elle rend la
// liste des badges gagnés. Rien n'est stocké ni célébré : un badge n'est que la LECTURE de ce
// que le joueur a réellement fait (parties jouées, tournois, points, victoires validées).
//
// Les identifiants sont STABLES et ne doivent JAMAIS être renommés (ils serviront de clé le
// jour où l'on persistera un « déjà vu » ou une récompense côté serveur).

export type Badge = { id: string; icon: string; title: string; desc: string };

// Chiffres d'entrée, tous EXPLICITES (aucune dépendance au store) : l'appelant décide d'où ils
// viennent. Une valeur inconnue (échec réseau, convention §8) doit être passée à 0 par
// l'appelant, qui reste responsable de le dire honnêtement à l'écran.
export type BadgeInput = {
  playedCount: number; // parties réellement jouées (réservations passées)
  tournamentsPlayed: number; // tournois officiels joués
  tournamentsWon: number; // tournois officiels gagnés
  points: number; // points de classement gagnés dans l'app
  validatedWins: number; // victoires de match CONFIRMÉES (un perdant a reconnu le score)
  weekStreak: number; // série en cours : semaines consécutives avec ≥ 1 partie
  friendsCount: number; // amis acceptés (amitié mutuelle)
};

// Un badge = sa présentation + le seuil qui le débloque. `desc` est formulée comme la
// CONDITION (« 5 parties jouées ») : elle se lit aussi bien gagnée qu'en « À débloquer — … ».
type BadgeRule = Badge & { earned: (i: BadgeInput) => boolean };

const RULES: BadgeRule[] = [
  { id: 'first_resa', icon: '🎾', title: 'Premier match', desc: '1 partie jouée', earned: (i) => i.playedCount >= 1 },
  { id: 'five_resa', icon: '🔥', title: 'Habitué', desc: '5 parties jouées', earned: (i) => i.playedCount >= 5 },
  { id: 'twenty_resa', icon: '🏟️', title: 'Pilier du club', desc: '20 parties jouées', earned: (i) => i.playedCount >= 20 },
  { id: 'first_tournoi', icon: '🏆', title: 'Compétiteur', desc: '1 tournoi joué', earned: (i) => i.tournamentsPlayed >= 1 },
  { id: 'tournoi_winner', icon: '🥇', title: 'Champion', desc: '1 tournoi gagné', earned: (i) => i.tournamentsWon >= 1 },
  { id: 'first_win', icon: '✅', title: 'Première victoire', desc: '1 victoire de match validée', earned: (i) => i.validatedWins >= 1 },
  { id: 'points_100', icon: '💯', title: 'Cap des 100', desc: '100 points gagnés dans l’app', earned: (i) => i.points >= 100 },
  { id: 'streak_3', icon: '📅', title: 'Régulier', desc: '3 semaines d’affilée avec une partie', earned: (i) => i.weekStreak >= 3 },
  { id: 'social_3', icon: '🤝', title: 'Esprit d’équipe', desc: '3 amis', earned: (i) => i.friendsCount >= 3 },
];

// Catalogue complet, dans l'ordre canonique (du plus facile au plus social).
export const ALL_BADGES: Badge[] = RULES.map(({ id, icon, title, desc }) => ({ id, icon, title, desc }));

// Les badges GAGNÉS, dans l'ordre canonique.
export function earnedBadges(input: BadgeInput): Badge[] {
  return RULES.filter((r) => r.earned(input)).map(({ id, icon, title, desc }) => ({ id, icon, title, desc }));
}

// Tableau d'affichage : TOUS les badges, GAGNÉS D'ABORD (l'ordre canonique est conservé à
// l'intérieur de chaque groupe → aucune carte ne « saute » d'un rendu à l'autre). Dérivé
// d'`earnedBadges` : un seul et même verdict alimente la liste et l'affichage.
export function badgeBoard(input: BadgeInput): { badge: Badge; earned: boolean }[] {
  const won = new Set(earnedBadges(input).map((b) => b.id));
  const board = ALL_BADGES.map((badge) => ({ badge, earned: won.has(badge.id) }));
  return [...board.filter((b) => b.earned), ...board.filter((b) => !b.earned)];
}
