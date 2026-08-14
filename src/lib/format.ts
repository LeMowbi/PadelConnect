// Petites fonctions de formatage.

export function fcfa(n: number): string {
  return `${n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} FCFA`;
}

// Prix par joueur estimé « à 4 », arrondi à la centaine (le prix de session est déjà figé pour
// la durée réelle du créneau, 1h ou 1h30 — cette estimation divise simplement par 4).
export function perPlayer(sessionPrice: number): string {
  return fcfa(Math.round(sessionPrice / 4 / 100) * 100);
}

// Part par joueur sur l'EFFECTIF RÉEL du match (2, 3 ou 4 joueurs), arrondie à la centaine.
// À utiliser dans les messages envoyés aux partenaires (« Prévois X chacun ») : diviser par 4
// une session jouée à 2 annoncerait la moitié de la vraie part. perPlayer reste pour les
// libellés explicitement « à 4 » (fiche club, estimation avant d'avoir l'équipe).
export function perPlayerOf(sessionPrice: number, playerCount: number): string {
  return fcfa(Math.round(sessionPrice / Math.max(1, playerCount) / 100) * 100);
}

// Pourcentage d'une commission (0–1) en libellé exact : entier sans décimale, sinon une
// décimale à la virgule (« 12,5 »). Évite l'incohérence d'un taux affiché arrondi (Math.round)
// alors que le MONTANT est calculé au taux réel — décompte WhatsApp et export CSV compris.
export function pctLabel(rate: number): string {
  // Arrondi à 1 décimale AVANT le test d'entier : sinon l'imprécision flottante (0.07*100 =
  // 7.0000000000000001) fait échouer Number.isInteger → « 7,0 » au lieu de « 7 » (visible dans le
  // décompte WhatsApp au club et l'export CSV pour des taux courants : 7, 14, 28 %…).
  const p = Math.round(rate * 1000) / 10;
  return Number.isInteger(p) ? `${p}` : p.toFixed(1).replace('.', ',');
}

// Niveau CHIFFRÉ en toutes lettres, sans zéro inutile : 3 → « 3 », 3.5 → « 3,5 » (virgule
// française, comme pctLabel). Sert partout où un niveau est montré au demi-point : quiz
// d'inscription, fourchettes des matchs ouverts (81).
export function levelText(n: number): string {
  return Number.isInteger(n) ? `${n}` : n.toFixed(1).replace('.', ',');
}

// Libellé du niveau de jeu (1.0 → 7.0).
export function levelLabel(n: number): string {
  if (n < 2.5) return 'Débutant';
  if (n < 4) return 'Intermédiaire';
  if (n < 5.5) return 'Avancé';
  return 'Confirmé';
}

export function initials(name: string): string {
  const out = name
    .replace(/\(.*?\)/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    // Array.from → première UNITÉ de graphème (un emoji n'est pas coupé au milieu d'une paire UTF-16).
    .map((w) => Array.from(w)[0]?.toUpperCase() ?? '')
    .join('');
  // Nom vide / entièrement entre parenthèses → au moins un caractère, jamais un avatar « blanc ».
  return out || '?';
}
