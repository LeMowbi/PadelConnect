// Coachs partenaires. La réservation ne se fait PAS dans l’app : on affiche le numéro du coach
// et son club. Liste vide au lancement (aucun profil fictif) — à remplir avec de vrais coachs.

import { findClub, getClub, type ClubOverrides, type CustomClub } from './clubs';

export type Coach = {
  id: string;
  name: string;
  level: string;
  levelValue: number; // niveau enseigné (1.0 → 7.0) — tri et filtre de la liste des coachs
  area: string;
  clubId: string; // club où le coach exerce
  phone: string; // numéro direct (appel / WhatsApp)
  specialties: string[];
  bio: string;
  accent: string;
};

// Vidé pour la mise en ligne : aucun coach fictif (les numéros de démo déclenchaient de
// vrais appels/WhatsApp). À remplir avec de VRAIS coachs partenaires validés, même format.
export const coaches: Coach[] = [];

export function getCoach(id?: string | string[]): Coach | undefined {
  const key = Array.isArray(id) ? id[0] : id;
  return coaches.find((c) => c.id === key);
}

// Nom du club où exerce le coach (sinon son quartier). Si l'état est fourni (clubs inscrits +
// surcharges gérant), on résout via findClub → un club fondateur RENOMMÉ par son gérant affiche
// son nouveau nom (comme partout ailleurs) ; sans état, repli sur le nom seed (getClub).
export function coachClubName(coach: Coach, custom?: CustomClub[], overrides?: ClubOverrides): string {
  const name = custom ? findClub(coach.clubId, custom, overrides)?.name : getClub(coach.clubId)?.name;
  return name ?? coach.area;
}
