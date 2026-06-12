// ─── Contrôle d'accès CENTRALISÉ aux espaces sensibles ──────────────────────────
//
// PROTOTYPE (aujourd'hui) : tout est local, mono-appareil — la navigation ne change
// pas. Ce module est le SEUL point d'entrée des décisions d'accès : les écrans ne
// décident jamais eux-mêmes. Ainsi, passer à l'app finale sera un BRANCHEMENT ici
// (remplacer le corps de ces fonctions par des appels serveur), pas une réécriture.
//
// CIBLE VALIDÉE pour l'app finale (Supabase) :
//   (a) Espace opérateur : l'écran reste in-app mais n'est RENDU que si le serveur
//       confirme `role === 'operator'` sur le compte de Moustapha (session Supabase
//       Auth vérifiée côté serveur — jamais un simple flag local).
//   (b) Espaces Club : un compte PAR CLUB (téléphone + OTP) ; les droits de gestion
//       par club sont vérifiés côté serveur (Supabase Auth + Row Level Security) —
//       plus de code à 4 chiffres partagé dans l'app.

/** L'utilisateur peut-il voir l'Espace opérateur ? */
export function canAccessOperator(): boolean {
  // TODO(app finale) : return session?.user.role === 'operator' (vérifié serveur).
  return true; // prototype : accès libre, exactement comme aujourd'hui
}

/** L'utilisateur peut-il gérer CE club ? */
export function canAccessClub(clubId: string, unlockedClubIds: string[]): boolean {
  // PROTOTYPE : code à 4 chiffres saisi une fois, mémorisé sur l'appareil (CodeGate).
  // TODO(app finale) : return session?.user.clubIds.includes(clubId) — droits par
  // club délivrés par le serveur (RLS), suppression du système de codes.
  return unlockedClubIds.includes(clubId);
}
