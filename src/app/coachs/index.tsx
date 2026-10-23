import { Redirect } from 'expo-router';

// Ancienne adresse de l’annuaire STATIQUE des coachs (fiches « réserve par téléphone », vide au
// lancement) — supprimé (décision porteur, T-19) : un coach doit avoir l’application. On garde la
// route pour les anciens liens et on renvoie vers « Réserver un cours », le seul annuaire : les
// coachs RÉSERVABLES de tous les clubs.
export default function CoachsRoute() {
  return <Redirect href="/cours" />;
}
