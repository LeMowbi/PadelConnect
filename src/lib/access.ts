// ─── Contrôle d'accès CENTRALISÉ aux espaces sensibles ──────────────────────────
//
// La sécurité repose désormais sur le RÔLE vérifié côté serveur (Supabase) :
//   - 'operator' : toi (PadelConnect) — seul à voir l'Espace opérateur ;
//   - 'club'     : un gérant — ne voit QUE l'Espace Club de SON club ;
//   - 'player'   : par défaut — ne voit NI l'opérateur NI l'Espace Club.
//
// Le rôle est posé côté serveur (un trigger empêche un joueur de se promouvoir).
// La vraie barrière est la Row Level Security : même en truquant l'affichage, un
// joueur n'obtient aucune donnée protégée du serveur. Ces fonctions ne pilotent que
// la VISIBILITÉ des entrées dans l'app.

export type Role = 'player' | 'operator' | 'club';

/** Seul l'opérateur voit l'Espace opérateur. */
export function canAccessOperator(role: Role): boolean {
  return role === 'operator';
}

/** L'Espace Club doit-il apparaître ? Jamais pour un joueur normal. */
export function canSeeClubSpace(role: Role): boolean {
  return role === 'club' || role === 'operator';
}

/** Un compte 'club' ne gère que SON club ; l'opérateur peut tout voir. */
export function canAccessClub(role: Role, managedClubId: string | null, clubId: string): boolean {
  if (role === 'operator') return true;
  return role === 'club' && !!managedClubId && managedClubId === clubId;
}
