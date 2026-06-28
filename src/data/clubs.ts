import { ACCENTS } from '@/theme';

// Clubs de padel d'Abidjan — noms et quartiers RÉELS (vérifiés via recherche).
// Les photos sont des placeholders (droits d'auteur) ; les tarifs sont INDICATIFS
// et doivent être confirmés par chaque club. Les positions ouvrent Google Maps.

export type Club = {
  id: string;
  name: string;
  area: string; // quartier / commune
  city: string;
  type: 'Couvert' | 'Extérieur' | 'Mixte';
  courts: number; // nombre de terrains (indicatif)
  blurb: string;
  amenities: string[];
  priceFrom: number; // FCFA / session (1h30) — INDICATIF, « dès » (heures creuses)
  priceTiers?: PriceTier[]; // tarifs par plage horaire (prioritaires sur priceFrom si présents)
  rating: number; // moyenne communautaire (démo)
  reviewsCount: number; // démo
  mapsQuery: string; // requête Google Maps
  accent: string; // couleur du visuel placeholder
  contactPhone?: string; // WhatsApp du club — alimente le lien discret « Contacter le club »
  photos?: string[]; // photos officielles (sinon photos illustratives par défaut)
  offers?: { title: string; detail: string }[];
};

// Tarif d'une plage horaire défini librement par le gérant : [start, end[ → prix FCFA.
// Heures « HH:MM » comparées en chaînes (format fixe). Une plage vide (prix 0) est ignorée.
export type PriceTier = { start: string; end: string; price: number; label?: string };

export const CITY = 'Abidjan';

// Lien Google Maps fiable (n'invente pas de coordonnées : recherche par nom).
export function mapsUrl(club: Club): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(club.mapsQuery)}`;
}

// Liste volontairement triée par ORDRE ALPHABÉTIQUE — aucun classement, aucun
// « meilleur club » : tous les terrains sont présentés à parts égales.
export const clubs: Club[] = [
  {
    id: 'abidjan-padel',
    name: 'Abidjan Padel',
    area: 'Cocody Danga / Riviera',
    city: CITY,
    type: 'Mixte',
    courts: 4,
    blurb:
      'Club proposant la réservation de créneaux et la création de matchs entre joueurs, situé du côté de Cocody Danga / Riviera Golf.',
    amenities: ['Réservation en ligne', 'Vestiaires', 'Location de raquettes'],
    priceFrom: 15000,
    rating: 4.6,
    reviewsCount: 38,
    mapsQuery: 'Abidjan Padel Cocody',
    contactPhone: '+225 07 00 00 04 04',
    accent: ACCENTS[0],
  },
  {
    id: 'district-club',
    name: 'District Club',
    area: 'Abidjan',
    city: CITY,
    type: 'Extérieur',
    courts: 4,
    blurb: 'Destination sport & lifestyle avec terrains de padel en extérieur, café et restaurant. Réservation via application.',
    amenities: ['Café & restaurant', 'Terrasse', 'Vestiaires'],
    priceFrom: 14000,
    rating: 4.7,
    reviewsCount: 52,
    mapsQuery: 'District Club Padel Abidjan',
    contactPhone: '+225 07 00 00 02 02',
    accent: ACCENTS[1],
  },
  {
    id: 'elite-club',
    name: 'Elite Club',
    area: 'Marcory',
    city: CITY,
    type: 'Mixte',
    courts: 3,
    blurb: 'Club de padel à Marcory, au carrefour de Marcory (derrière CAP SUD). Ambiance conviviale pour joueurs de tous niveaux.',
    amenities: ['Vestiaires', 'Parking', 'Buvette'],
    priceFrom: 12000,
    rating: 4.4,
    reviewsCount: 21,
    mapsQuery: 'Elite Club Marcory Abidjan',
    accent: ACCENTS[2],
  },
  {
    id: 'ivoire-padel',
    name: 'Ivoire Padel Club',
    area: 'Marcory Résidentiel',
    city: CITY,
    type: 'Mixte',
    courts: 4,
    blurb: 'Quatre terrains à Marcory Résidentiel (Rue Zéphirs). Idéal pour matchs entre amis et entraînements.',
    amenities: ['Vestiaires', 'Location de raquettes', 'Parking'],
    priceFrom: 13000,
    rating: 4.5,
    reviewsCount: 29,
    mapsQuery: 'Ivoire Padel Club Marcory Abidjan',
    accent: ACCENTS[0],
  },
  {
    id: 'padel-magic',
    name: 'Padel Magic',
    area: 'Cocody (Hôtel Ivoire)',
    city: CITY,
    type: 'Extérieur',
    courts: 4,
    blurb: "Parmi les premiers terrains de padel du pays, installés du côté de l'Hôtel Ivoire à Cocody.",
    amenities: ['Vestiaires', 'Cadre arboré', 'Buvette'],
    priceFrom: 16000,
    rating: 4.6,
    reviewsCount: 47,
    mapsQuery: 'Padel Magic Hotel Ivoire Cocody Abidjan',
    accent: ACCENTS[1],
  },
  {
    id: 'padel-palmeraie',
    name: 'Padel Palmeraie',
    area: 'Faya / Bingerville',
    city: CITY,
    type: 'Extérieur',
    courts: 2,
    blurb: 'Terrain de padel desservant Faya et ses environs, vers Bingerville. Accueil familial et détendu.',
    amenities: ['Parking', 'Buvette'],
    priceFrom: 10000,
    rating: 4.3,
    reviewsCount: 12,
    mapsQuery: 'Padel Palmeraie Faya Bingerville',
    accent: ACCENTS[4],
  },
  {
    id: 'padel-zone-4',
    name: 'Padel Zone 4',
    area: 'Marcory, Zone 4',
    city: CITY,
    type: 'Mixte',
    courts: 4,
    blurb: 'Quatre terrains au cœur de la Zone 4 (Rue du Dr Blanchard), à Marcory. Très accessible depuis le Plateau.',
    amenities: ['Vestiaires', 'Bar', 'Location de raquettes'],
    priceFrom: 15000,
    rating: 4.5,
    reviewsCount: 41,
    mapsQuery: 'Padel Zone 4 Rue du Docteur Blanchard Marcory Abidjan',
    contactPhone: '+225 07 00 00 03 03',
    accent: ACCENTS[2],
  },
  {
    id: 'padelta',
    name: 'Padelta',
    area: 'Cocody Danga',
    city: CITY,
    type: 'Couvert',
    courts: 5,
    blurb: 'Club indoor à Cocody Danga avec terrains couverts homologués, salle de sport et café. À 5 min du Plateau et de la Riviera.',
    amenities: ['Terrains couverts', 'Café La Pausa', 'Salle de sport', 'Vestiaires'],
    priceFrom: 10000,
    // Tarifs réels Padelta : heures creuses, prime time, fin de soirée.
    // La fin de plage est EXCLUSIVE → « 24:00 » couvre la soirée jusqu'à minuit inclus.
    priceTiers: [
      { start: '07:00', end: '16:00', price: 10000, label: 'Journée' },
      { start: '16:00', end: '20:30', price: 30000, label: 'Soirée' },
      { start: '20:30', end: '24:00', price: 15000, label: 'Fin de soirée' },
    ],
    rating: 4.8,
    reviewsCount: 73,
    mapsQuery: 'Padelta Cocody Danga Abidjan',
    contactPhone: '+225 07 00 00 01 01',
    accent: ACCENTS[1],
  },
  {
    id: 'padelhouse',
    name: 'PadelHouse',
    area: 'Zone 3',
    city: CITY,
    type: 'Extérieur',
    courts: 3,
    blurb: 'Club de padel outdoor en Zone 3, avec sa propre application de réservation. Bonne ambiance après le travail.',
    amenities: ['Réservation en ligne', 'Vestiaires', 'Buvette'],
    priceFrom: 12000,
    rating: 4.5,
    reviewsCount: 34,
    mapsQuery: 'PadelHouse Zone 3 Abidjan',
    accent: ACCENTS[0],
  },
];

// Clubs triés par nom — réutilisé tel quel (ordre alphabétique, aucun classement).
export const clubsByName = [...clubs].sort((a, b) => a.name.localeCompare(b.name));

export function getClub(id?: string | string[]): Club | undefined {
  const key = Array.isArray(id) ? id[0] : id;
  return clubs.find((c) => c.id === key);
}

// ——— Clubs inscrits via l'app (validés par l'opérateur PadelConnect) ———

export type CustomClub = Club & {
  status: 'pending' | 'active'; // « pending » = en attente d'activation par l'opérateur
  contactPhone?: string;
  createdAt: number;
};

// Surcharges du gérant (nom, quartier, description, type, tarif, plages, WhatsApp).
export type ClubOverrides = Record<
  string,
  Partial<Pick<Club, 'name' | 'area' | 'blurb' | 'type' | 'priceFrom' | 'priceTiers'>> & { contactPhone?: string }
>;

function applyInfo(club: Club, overrides?: ClubOverrides): Club & { contactPhone?: string } {
  const patch = overrides?.[club.id];
  return patch ? { ...club, ...patch } : club;
}

// Clubs visibles par les JOUEURS : clubs de base + clubs inscrits ACTIVÉS.
export function activeClubs(custom: CustomClub[], overrides?: ClubOverrides): Club[] {
  return [...clubs, ...custom.filter((c) => c.status === 'active')]
    .map((c) => applyInfo(c, overrides))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Clubs gérables dans l'Espace Club : tous, y compris en attente (le gérant prépare sa page).
export function manageableClubs(custom: CustomClub[], overrides?: ClubOverrides): Club[] {
  return [...clubs, ...custom].map((c) => applyInfo(c, overrides)).sort((a, b) => a.name.localeCompare(b.name));
}

// Recherche d'un club par id, clubs inscrits inclus.
export function findClub(
  id: string | string[] | undefined,
  custom: CustomClub[],
  overrides?: ClubOverrides,
): (Club & { contactPhone?: string }) | undefined {
  const key = Array.isArray(id) ? id[0] : id;
  if (!key) return undefined;
  const base = clubs.find((c) => c.id === key) ?? custom.find((c) => c.id === key);
  return base ? applyInfo(base, overrides) : undefined;
}

// Créneaux types proposés (démo) — sessions de 1h30, non chevauchantes.
// Une vraie version lirait les disponibilités du club.
export const SAMPLE_SLOTS = ['07:30', '09:00', '10:30', '12:00', '16:30', '18:00', '19:30', '21:00'];

// Terrains (courts) par défaut d'un club : « Terrain 1 … N » selon son nombre de courts.
// Les clubs peuvent ensuite les renommer / ajouter / retirer depuis l'Espace Club.
export function defaultCourts(club: Club): string[] {
  return Array.from({ length: Math.max(1, club.courts) }, (_, i) => `Terrain ${i + 1}`);
}

export const DEFAULT_OFFERS = [
  { title: 'Happy hour', detail: '-20% en semaine de 12h à 15h.' },
  { title: 'Initiation offerte', detail: '1ʳᵉ séance découverte gratuite.' },
];

// Publication d'un club (offre ou actualité) — texte libre géré par le club.
export type ClubPost = { id?: string; kind: 'offre' | 'actu' | 'evenement'; title: string; detail: string };

// Offres/actus à afficher : celles publiées par le club (store) EN PLUS de ses offres
// de base — les offres génériques par défaut ne servent que si tout est vide.
export function offersForClub(club: Club, managed: ClubPost[] = []): ClubPost[] {
  const seeds = (club.offers ?? []).map((o) => ({ kind: 'offre' as const, title: o.title, detail: o.detail }));
  if (managed.length || seeds.length) return [...managed, ...seeds];
  return DEFAULT_OFFERS.map((o) => ({ kind: 'offre' as const, title: o.title, detail: o.detail }));
}

// Galerie d'un club = UNIQUEMENT ses vraies photos (celles ajoutées par le gérant via
// `extra`, puis ses photos officielles `club.photos`). Aucune photo « stock » par défaut :
// si un club n'a pas de photo, la galerie est vide → l'UI affiche le repli doré maison
// (PhotoPlaceholder), jamais une image générique qui n'appartient pas au club.
export function clubGallery(club: Club, extra: string[] = []): string[] {
  const base = club.photos && club.photos.length ? club.photos : [];
  return [...extra, ...base];
}
