// Tarification par plage horaire. Chaque gérant définit librement jusqu'à 3 plages
// (heure de début, heure de fin, prix). Sans plage, le club garde son tarif unique
// (priceFrom) — rétro-compatible. Le prix RÉEL d'un créneau est stocké sur la
// réservation au moment de la création (cf. addReservation), pour que la commission
// opérateur et la répartition « par joueur » soient exactes même si le tarif change.

import type { Club, PriceTier } from '@/data/clubs';

// Plages valides d'un club (prix > 0 et bornes renseignées).
export function priceTiersFor(club: Club): PriceTier[] {
  return (club.priceTiers ?? []).filter((t) => t.price > 0 && t.start && t.end);
}

// Prix « dès » affiché : le minimum des plages, sinon le tarif unique.
export function minPrice(club: Club): number {
  const tiers = priceTiersFor(club);
  return tiers.length ? Math.min(...tiers.map((t) => t.price)) : club.priceFrom;
}

// Prix d'un créneau « HH:MM » : la plage qui le contient, sinon le tarif unique.
export function priceForSlot(club: Club, time: string): number {
  const tiers = priceTiersFor(club);
  if (tiers.length) {
    const match = tiers.find((t) => time >= t.start && time < t.end);
    return match ? match.price : minPrice(club);
  }
  return club.priceFrom;
}
