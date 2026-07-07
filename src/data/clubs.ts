import { ACCENTS } from '@/theme';

// Clubs de padel d’Abidjan — noms et quartiers RÉELS (vérifiés via recherche).
// Les photos sont des placeholders (droits d’auteur) ; les tarifs sont INDICATIFS
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
  // La note affichée vient EXCLUSIVEMENT des avis serveur vérifiés (cf. club/[id].tsx) — pas de
  // champ ici, pour ne jamais risquer d’afficher un chiffre inventé.
  mapsQuery: string; // requête Google Maps
  accent: string; // couleur du visuel placeholder
  contactPhone?: string; // WhatsApp du club — alimente le lien discret « Contacter le club »
  photos?: string[]; // photos officielles (sinon photos illustratives par défaut)
  offers?: { title: string; detail: string }[];
  // « Bientôt » : club référencé mais pas encore réservable (pré-chargé par l’opérateur en
  // attendant qu’il finalise son inscription). Visible dans la liste, badge « Bientôt »,
  // bouton Réserver désactivé. Les clubs de base ne le sont jamais.
  comingSoon?: boolean;
  // Club FONDATEUR de PadelConnect (partenaire officiel) → badge « Partenaire ». Réservé aux
  // 9 clubs de lancement ; les clubs inscrits ensuite ne le portent pas.
  partner?: boolean;
};

// Tarif d’une plage horaire défini librement par le gérant : [start, end[ → prix FCFA.
// Heures « HH:MM » comparées en chaînes (format fixe). Une plage vide (prix 0) est ignorée.
// `price` = prix d’une session 1h30 (base) ; `price60` = prix d’une session 1h (optionnel, dérivé
// si absent — cf. pricing.ts). On garde `price` comme base plutôt que renommer en `price90` : ça
// évite de réécrire toutes les données de tarif déjà en base.
export type PriceTier = { start: string; end: string; price: number; price60?: number; label?: string };

export const CITY = 'Abidjan';

// Lien Google Maps fiable (n’invente pas de coordonnées : recherche par nom).
// Ceinture de sécurité : si mapsQuery manque (vieille surcharge serveur sans la colonne),
// on recherche « nom + quartier » plutôt que d’ouvrir Maps sur une requête vide.
export function mapsUrl(club: Club): string {
  const q = club.mapsQuery || `${club.name} ${club.area} Abidjan`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

// Liste volontairement triée par ORDRE ALPHABÉTIQUE — aucun classement, aucun
// « meilleur club » : tous les terrains sont présentés à parts égales.
// Les 9 clubs de lancement sont les PARTENAIRES fondateurs (badge « Partenaire »), appliqué en
// bloc plus bas — inutile de le répéter sur chaque entrée.
const FOUNDER_CLUBS: Club[] = [
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
    mapsQuery: 'Abidjan Padel Cocody',
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
    mapsQuery: 'District Club Padel Abidjan',
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
    blurb: 'Parmi les premiers terrains de padel du pays, installés du côté de l’Hôtel Ivoire à Cocody.',
    amenities: ['Vestiaires', 'Cadre arboré', 'Buvette'],
    priceFrom: 16000,
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
    mapsQuery: 'Padel Zone 4 Rue du Docteur Blanchard Marcory Abidjan',
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
    // La fin de plage est EXCLUSIVE → « 24:00 » couvre la soirée jusqu’à minuit inclus.
    priceTiers: [
      { start: '07:00', end: '16:00', price: 10000, label: 'Journée' },
      { start: '16:00', end: '20:30', price: 30000, label: 'Soirée' },
      { start: '20:30', end: '24:00', price: 15000, label: 'Fin de soirée' },
    ],
    mapsQuery: 'Padelta Cocody Danga Abidjan',
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
    mapsQuery: 'PadelHouse Zone 3 Abidjan',
    accent: ACCENTS[0],
  },
];

// Les 9 fondateurs portent le badge « Partenaire » (partner: true), appliqué en une fois.
export const clubs: Club[] = FOUNDER_CLUBS.map((c) => ({ ...c, partner: true }));

// Clubs triés par nom — réutilisé tel quel (ordre alphabétique, aucun classement).
export const clubsByName = [...clubs].sort((a, b) => a.name.localeCompare(b.name));

export function getClub(id?: string | string[]): Club | undefined {
  const key = Array.isArray(id) ? id[0] : id;
  return clubs.find((c) => c.id === key);
}

// ——— Clubs inscrits via l’app (validés par l’opérateur PadelConnect) ———

export type CustomClub = Club & {
  // « pending » = demande locale en attente d’activation par l’opérateur ;
  // « coming_soon » = pré-chargé côté serveur, visible mais pas encore réservable ;
  // « active » = visible ET réservable.
  status: 'pending' | 'coming_soon' | 'active';
  contactPhone?: string;
  createdAt: number;
  fromServer?: boolean; // true = club venu du serveur (table clubs), pas un club démo local
};

// Ligne serveur (table public.clubs) → club « custom » prêt à fusionner dans la liste.
// Les clubs venus du serveur sont toujours actifs (l’opérateur les a déjà approuvés).
export function serverRowToClub(row: {
  id: string;
  name: string;
  area: string | null;
  city: string | null;
  type: string | null;
  courts: number | null;
  price_from: number | null;
  contact_phone: string | null;
  blurb: string | null;
  amenities: string[] | null;
  status: string | null;
  created_at: string | null;
}): CustomClub {
  const type = (['Couvert', 'Extérieur', 'Mixte'] as const).includes(row.type as Club['type']) ? (row.type as Club['type']) : 'Mixte';
  const comingSoon = row.status === 'coming_soon';
  // Accent stable dérivé de l’id (déterministe, pas de couleur qui « saute » au rechargement).
  const accentIdx = Math.abs([...row.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % ACCENTS.length;
  return {
    id: row.id,
    name: row.name,
    area: row.area ?? row.city ?? CITY,
    city: row.city ?? CITY,
    type,
    courts: Math.max(1, row.courts ?? 1),
    blurb: row.blurb ?? '',
    amenities: row.amenities ?? [],
    priceFrom: row.price_from ?? 10000,
    mapsQuery: `${row.name} ${row.city ?? CITY}`,
    accent: ACCENTS[accentIdx],
    contactPhone: row.contact_phone ?? undefined,
    comingSoon, // « Bientôt » → badge + réservation désactivée
    // fetchServerClubs renvoie les clubs 'active' ET 'coming_soon' ; on garde le statut tel quel.
    status: comingSoon ? 'coming_soon' : 'active',
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    fromServer: true,
  };
}

// Surcharges du gérant (nom, quartier, description, type, tarif, plages, WhatsApp, position Maps).
export type ClubOverrides = Record<
  string,
  Partial<Pick<Club, 'name' | 'area' | 'blurb' | 'type' | 'priceFrom' | 'priceTiers' | 'mapsQuery'>> & { contactPhone?: string }
>;

// Statut piloté par l’OPÉRATEUR (côté serveur, club_status), appliqué à N’IMPORTE QUEL club —
// y compris les 9 de base. Registre module mis à jour par AppContext au chargement ; lu ici
// dans applyInfo. Un changement déclenche un re-rendu via state.clubStatus (cf. AppContext).
let clubStatusMap: Record<string, 'active' | 'coming_soon' | 'hidden'> = {};
export function setClubStatusMap(m: Record<string, 'active' | 'coming_soon' | 'hidden'>): void {
  clubStatusMap = m;
}

function applyInfo(club: Club, overrides?: ClubOverrides): Club & { contactPhone?: string } {
  const patch = overrides?.[club.id];
  // Un champ ABSENT côté serveur (undefined) ne doit JAMAIS écraser la valeur de base : un
  // spread avec { mapsQuery: undefined } remplacerait la position seed par undefined (« Voir
  // sur la carte » chercherait littéralement « undefined » dans Google Maps).
  const clean = patch ? (Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as typeof patch) : undefined;
  const merged = clean ? { ...club, ...clean } : club;
  // Statut opérateur : 'coming_soon' → « Bientôt » (non réservable) ; 'active' force réservable.
  const status = clubStatusMap[club.id];
  if (status === 'coming_soon') return { ...merged, comingSoon: true };
  if (status === 'active') return { ...merged, comingSoon: false };
  return merged;
}

// Club mis en avant : Padelta s’affiche EN PREMIER partout où les joueurs voient les clubs
// (décision du porteur). Les tris « sponsorisé d’abord » des écrans restent prioritaires —
// ils sont stables, donc l’ordre ci-dessous est préservé à égalité de boost.
const FEATURED_CLUB_ID = 'padelta';
// Les écrans qui re-trient (favoris en tête…) peuvent garder le club mis en avant devant.
export const isFeaturedClub = (id: string) => id === FEATURED_CLUB_ID;
export function compareClubs(a: Club, b: Club): number {
  if (a.id !== b.id) {
    if (a.id === FEATURED_CLUB_ID) return -1;
    if (b.id === FEATURED_CLUB_ID) return 1;
  }
  return a.name.localeCompare(b.name);
}

// Clubs visibles par les JOUEURS : clubs de base + clubs serveur activés OU « Bientôt »
// (ces derniers s’affichent avec un badge et ne sont pas réservables). On exclut les demandes
// locales « pending » ET les clubs que l’opérateur a masqués (statut 'hidden').
export function activeClubs(custom: CustomClub[], overrides?: ClubOverrides): Club[] {
  return [...clubs, ...custom.filter((c) => c.status === 'active' || c.status === 'coming_soon')]
    .filter((c) => clubStatusMap[c.id] !== 'hidden')
    .map((c) => applyInfo(c, overrides))
    .sort(compareClubs);
}

// Clubs gérables dans l’Espace Club : tous, y compris en attente (le gérant prépare sa page).
export function manageableClubs(custom: CustomClub[], overrides?: ClubOverrides): Club[] {
  return [...clubs, ...custom].map((c) => applyInfo(c, overrides)).sort((a, b) => a.name.localeCompare(b.name));
}

// Recherche d’un club par id, clubs inscrits inclus.
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

// Terrains (courts) par défaut d’un club : « Terrain 1 … N » selon son nombre de courts.
// Les clubs peuvent ensuite les renommer / ajouter / retirer depuis l’Espace Club.
export function defaultCourts(club: Club): string[] {
  return Array.from({ length: Math.max(1, club.courts) }, (_, i) => `Terrain ${i + 1}`);
}

// Publication d’un club (offre ou actualité) — texte libre géré par le club.
export type ClubPost = { id?: string; kind: 'offre' | 'actu' | 'evenement'; title: string; detail: string };

// Offres/actus à afficher : celles publiées par le club (store) EN PLUS de ses offres de base.
// AUCUNE offre générique par défaut : une promo que le club n’a jamais accordée serait une
// donnée factice (règle du projet) — sans offre réelle, la fiche n’affiche pas la carte.
export function offersForClub(club: Club, managed: ClubPost[] = []): ClubPost[] {
  const seeds = (club.offers ?? []).map((o) => ({ kind: 'offre' as const, title: o.title, detail: o.detail }));
  return [...managed, ...seeds];
}

// Galerie d’un club = UNIQUEMENT ses vraies photos (celles ajoutées par le gérant via
// `extra`, puis ses photos officielles `club.photos`). Aucune photo « stock » par défaut :
// si un club n’a pas de photo, la galerie est vide → l’UI affiche le repli doré maison
// (PhotoPlaceholder), jamais une image générique qui n’appartient pas au club.
export function clubGallery(club: Club, extra: string[] = []): string[] {
  const base = club.photos && club.photos.length ? club.photos : [];
  return [...extra, ...base];
}
