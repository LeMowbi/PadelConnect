// Petites fonctions de formatage.

export function fcfa(n: number): string {
  return `${n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} FCFA`;
}

// Prix par joueur (terrain à 4), arrondi à la centaine — sessions de 1h30.
export function perPlayer(sessionPrice: number): string {
  return fcfa(Math.round(sessionPrice / 4 / 100) * 100);
}

export function initials(name: string): string {
  return name
    .replace(/\(.*?\)/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}
