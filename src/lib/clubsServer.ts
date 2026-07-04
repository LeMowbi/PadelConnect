// Couche données « clubs serveur ». Les 9 clubs de base restent embarqués dans l’app
// (rapides, hors-ligne) ; cette table ne contient que les clubs AJOUTÉS via l’app.
// L’opérateur approuve une demande → un club est créé ici et apparaît chez tous les
// joueurs, SANS nouvelle version de l’app.

import { serverRowToClub, type Club, type CustomClub, type PriceTier } from '@/data/clubs';
import { supabase } from './supabase';

// Surcharge de page club, telle que servie/stockée (mêmes champs que le store local clubInfo).
export type ClubOverride = {
  name?: string;
  area?: string;
  blurb?: string;
  type?: Club['type'];
  priceFrom?: number;
  priceTiers?: PriceTier[];
  contactPhone?: string;
  mapsQuery?: string; // position Google Maps (nom + adresse), éditable par le gérant
};

// Toutes les surcharges de page (édités par les gérants) → { clubId: surcharge } pour fusion.
// null = échec réseau (≠ {} = « aucune surcharge ») → l’appelant garde l’existant (convention §8).
export async function fetchClubOverrides(): Promise<Record<string, ClubOverride> | null> {
  const { data, error } = await supabase.from('club_overrides').select('*');
  if (error) return null;
  const out: Record<string, ClubOverride> = {};
  for (const r of (data ?? []) as ClubOverrideRow[]) {
    out[r.club_id] = {
      name: r.name ?? undefined,
      area: r.area ?? undefined,
      blurb: r.blurb ?? undefined,
      type: (['Couvert', 'Extérieur', 'Mixte'] as const).includes(r.type as Club['type']) ? (r.type as Club['type']) : undefined,
      priceFrom: r.price_from ?? undefined,
      priceTiers: r.price_tiers ?? undefined,
      contactPhone: r.contact_phone ?? undefined,
      mapsQuery: r.maps_query ?? undefined,
    };
  }
  return out;
}

// Le gérant pousse sa page modifiée (réservé à son club côté serveur). false si refusé/échec.
export async function upsertClubOverride(clubId: string, o: ClubOverride): Promise<boolean> {
  const { data, error } = await supabase.rpc('upsert_club_override', {
    p_club_id: clubId,
    p_name: o.name ?? null,
    p_area: o.area ?? null,
    p_blurb: o.blurb ?? null,
    p_type: o.type ?? null,
    p_price_from: o.priceFrom ?? null,
    p_price_tiers: o.priceTiers ?? null,
    p_contact_phone: o.contactPhone ?? null,
    p_maps_query: o.mapsQuery ?? null,
  });
  return !error && data === true;
}

// ─── Config de club partagée (horaires, terrains, offres, photos) ──────
// (Les coachs « fiche simple » sans compte ont été retirés — décision porteur : un coach doit
// avoir l'application. Les coachs réservables vivent dans la table `coaches`, cf. coachesServer.)
export type ClubOffer = { id: string; kind: 'offre' | 'actu' | 'evenement'; title: string; detail: string };
export type ClubConfig = {
  slots?: string[]; // grille complète du club — un créneau fermé est préfixé « ! » (cf. src/lib/slots.ts)
  courts?: string[];
  offers?: ClubOffer[];
  photos?: string[]; // photos GÉNÉRALES du club (galerie)
  coverUrl?: string; // photo « de profil » : celle de la carte, avant d’ouvrir la fiche
  courtPhotos?: Record<string, string>; // une photo PAR TERRAIN → { nom du terrain: url }
  // Fermetures RÉCURRENTES par terrain (54) : { 'Terrain 1': ['18:00'] } = jamais réservable
  // à 18:00 sur CE terrain, pour TOUTES les réservations (cours in-app compris) — les autres
  // terrains restent ouverts.
  courtClosed?: Record<string, string[]>;
};

type ClubConfigRow = {
  club_id: string;
  slots: string[] | null;
  courts: string[] | null;
  offers: ClubOffer[] | null;
  photos: string[] | null;
  cover_url: string | null;
  court_photos: Record<string, string> | null;
  court_closed: Record<string, string[]> | null;
};

// Toutes les configs de club → { clubId: config } pour fusion dans le store au chargement.
// null = échec réseau (≠ {} = « aucune config ») → l’appelant garde l’existant (convention §8).
export async function fetchClubConfigs(): Promise<Record<string, ClubConfig> | null> {
  const { data, error } = await supabase.from('club_config').select('*');
  if (error) return null;
  const out: Record<string, ClubConfig> = {};
  for (const r of (data ?? []) as ClubConfigRow[]) {
    out[r.club_id] = {
      slots: r.slots ?? undefined,
      courts: r.courts ?? undefined,
      offers: r.offers ?? undefined,
      photos: r.photos ?? undefined,
      coverUrl: r.cover_url ?? undefined,
      courtPhotos: r.court_photos ?? undefined,
      courtClosed: r.court_closed ?? undefined,
    };
  }
  return out;
}

// Le gérant pousse SA config (mise à jour partielle : seuls les champs fournis changent).
// Le serveur refuse si ce n’est pas son club. false si refusé/échec.
export async function upsertClubConfig(clubId: string, c: ClubConfig): Promise<boolean> {
  // p_coaches (fiches simples, retirées) est omis : le paramètre a un défaut null côté serveur,
  // qui préserve la valeur existante — aucun changement de signature SQL nécessaire.
  // p_court_closed n'est envoyé QUE s'il est fourni (même motif que open_match, reservations.ts) :
  // contre une base où la 54 n'est pas encore collée (signature à 8 paramètres), horaires /
  // terrains / offres / photos restent fonctionnels — seul setCourtClosed échoue proprement.
  const { data, error } = await supabase.rpc('upsert_club_config', {
    p_club_id: clubId,
    p_slots: c.slots ?? null,
    p_courts: c.courts ?? null,
    p_offers: c.offers ?? null,
    p_photos: c.photos ?? null,
    p_cover_url: c.coverUrl ?? null,
    p_court_photos: c.courtPhotos ?? null,
    ...(c.courtClosed !== undefined ? { p_court_closed: c.courtClosed } : {}),
  });
  return !error && data === true;
}

type ClubOverrideRow = {
  club_id: string;
  name: string | null;
  area: string | null;
  blurb: string | null;
  type: string | null;
  price_from: number | null;
  price_tiers: PriceTier[] | null;
  contact_phone: string | null;
  maps_query: string | null;
};

type ClubRow = {
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
};

// Clubs serveur visibles (actifs + « Bientôt ») → modèle local, fusionnés avec les clubs
// de base. Les 'coming_soon' arrivent avec leur badge ; les 'hidden' restent exclus.
// null = échec réseau (≠ [] = « aucun club serveur ») → l’appelant garde l’existant, sinon
// une micro-coupure au premier plan ferait DISPARAÎTRE tous les clubs serveur de l’affichage.
export async function fetchServerClubs(): Promise<CustomClub[] | null> {
  const { data, error } = await supabase.from('clubs').select('*').in('status', ['active', 'coming_soon']);
  if (error) return null;
  return (data ?? []).map((row) => serverRowToClub(row as ClubRow));
}

// Opérateur : change le statut d’un club (active | coming_soon | hidden).
export async function setClubStatus(clubId: string, status: 'active' | 'coming_soon' | 'hidden'): Promise<boolean> {
  const { data, error } = await supabase.rpc('set_club_status', { p_id: clubId, p_status: status });
  return !error && data === true;
}

// Statut piloté par l’opérateur pour N’IMPORTE QUEL club (y compris les 9 de base) → clubId → statut.
export async function fetchClubStatus(): Promise<Record<string, 'active' | 'coming_soon' | 'hidden'> | null> {
  const { data, error } = await supabase.from('club_status').select('club_id, status');
  if (error) return null; // échec réseau ≠ « aucun statut » → l’appelant garde l’existant
  const out: Record<string, 'active' | 'coming_soon' | 'hidden'> = {};
  for (const r of (data ?? []) as { club_id: string; status: 'active' | 'coming_soon' | 'hidden' }[]) out[r.club_id] = r.status;
  return out;
}

// Opérateur : bascule le statut d’un club de base (ou tout club) — visible par tous.
export async function setBaseClubStatus(clubId: string, status: 'active' | 'coming_soon' | 'hidden'): Promise<boolean> {
  const { data, error } = await supabase.rpc('set_base_club_status', { p_club_id: clubId, p_status: status });
  return !error && data === true;
}

// Boosts « Sponsorisé » pilotés par l’opérateur → { clubId: date d’expiration (ms) }. null si
// échec réseau (on garde l’existant). Lu par tous (le club boosté remonte avec son badge).
export async function fetchClubBoosts(): Promise<Record<string, number> | null> {
  const { data, error } = await supabase.from('club_boost').select('club_id, expires_at');
  if (error) return null;
  const out: Record<string, number> = {};
  for (const r of (data ?? []) as { club_id: string; expires_at: string }[]) {
    const t = new Date(r.expires_at).getTime();
    if (Number.isFinite(t)) out[r.club_id] = t;
  }
  return out;
}

// Opérateur : active/prolonge un boost (date d’expiration ISO) ou le retire (null).
export async function setClubBoost(clubId: string, expiresAtMs: number | null): Promise<boolean> {
  const { data, error } = await supabase.rpc('set_club_boost', {
    p_club_id: clubId,
    p_expires_at: expiresAtMs ? new Date(expiresAtMs).toISOString() : null,
  });
  return !error && data === true;
}

// Opérateur : supprime DÉFINITIVEMENT un club serveur (+ ses données liées). false si refusé.
export async function deleteClub(clubId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('delete_club', { p_id: clubId });
  return !error && data === true;
}

// Commission propre à chaque club (lue par l’opérateur) → { clubId: taux } (0.10 = 10 %).
export async function fetchClubCommissions(): Promise<Record<string, number> | null> {
  const { data, error } = await supabase.from('club_commission').select('club_id, rate');
  if (error) return null; // échec réseau ≠ « aucune commission » → l’appelant garde l’existant
  const out: Record<string, number> = {};
  for (const r of (data ?? []) as { club_id: string; rate: number }[]) out[r.club_id] = r.rate;
  return out;
}

// Opérateur : fixe la commission (taux 0–1) d’un club. false si refusé/échec.
export async function setClubCommission(clubId: string, rate: number): Promise<boolean> {
  const { data, error } = await supabase.rpc('set_club_commission', { p_club_id: clubId, p_rate: rate });
  return !error && data === true;
}

// Suivi des règlements opérateur (persistant serveur) → { key: 'sent' | 'paid' }. null = échec
// réseau (l’appelant garde l’existant). Vide pour les non-opérateurs (RLS).
export async function fetchOperatorPayments(): Promise<Record<string, 'sent' | 'paid'> | null> {
  const { data, error } = await supabase.from('operator_payments').select('key, status');
  if (error) return null;
  const out: Record<string, 'sent' | 'paid'> = {};
  for (const r of (data ?? []) as { key: string; status: 'sent' | 'paid' }[]) out[r.key] = r.status;
  return out;
}

// Opérateur : fixe (ou retire, avec 'tofacture') le statut de règlement d’une clé. false si refusé.
export async function setOperatorPayment(key: string, status: 'sent' | 'paid' | 'tofacture'): Promise<boolean> {
  const { data, error } = await supabase.rpc('set_operator_payment', { p_key: key, p_status: status });
  return !error && data === true;
}

// Opérateur : donne l’accès « Espace Club » à un joueur (par son numéro) pour un club donné —
// n’importe quel club, y compris les 9 de base. Renvoie le nom du joueur promu si trouvé.
// `error: true` = échec RÉSEAU (≠ ok:false seul = numéro vraiment inconnu, convention §8).
export async function grantClubAccessByPhone(phone: string, clubId: string): Promise<{ ok: boolean; name?: string; error?: boolean }> {
  const { data, error } = await supabase.rpc('grant_club_access_by_phone', { p_phone: phone.trim(), p_club_id: clubId });
  if (error) return { ok: false, error: true };
  if (!data) return { ok: false };
  return { ok: true, name: data as string };
}

// ─── Multi-clubs (55) : un compte peut gérer plusieurs clubs ─────────────────────
// La liste de MES clubs autorisés (RLS : chacun ne lit que les siens). Le club ACTIF reste
// profiles.managed_club_id — tous les contrôles serveur continuent de porter sur lui.
// null = échec réseau (≠ [] = aucun club), convention §8.
export async function fetchMyManagedClubs(): Promise<string[] | null> {
  const { data, error } = await supabase.from('manager_clubs').select('club_id').order('created_at', { ascending: true });
  if (error) return null;
  return (data ?? []).map((r: { club_id: string }) => r.club_id);
}

// Bascule le club ACTIF (doit être dans ma liste autorisée). false si refusé/échec —
// l'appelant recharge ensuite la session (le périmètre RLS des réservations change).
export async function switchManagedClub(clubId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('switch_managed_club', { p_club_id: clubId });
  return !error && data === true;
}

// Opérateur : retire l’accès gérant d’un joueur (par son numéro). Renvoie son nom si trouvé.
export async function revokeClubAccessByPhone(phone: string): Promise<{ ok: boolean; name?: string; error?: boolean }> {
  const { data, error } = await supabase.rpc('revoke_club_access_by_phone', { p_phone: phone.trim() });
  if (error) return { ok: false, error: true };
  if (!data) return { ok: false };
  return { ok: true, name: data as string };
}

// Opérateur : pré-charge un club « Bientôt » sans demande préalable. Renvoie l’id créé.
export async function createClub(input: {
  name: string;
  area: string;
  type: string;
  courts: number;
  priceFrom: number;
}): Promise<{ ok: boolean; clubId?: string }> {
  const { data, error } = await supabase.rpc('create_club', {
    p_name: input.name,
    p_area: input.area,
    p_type: input.type,
    p_courts: input.courts,
    p_price_from: input.priceFrom,
  });
  if (error || !data) return { ok: false };
  return { ok: true, clubId: data as string };
}

// Approuve une demande de club : crée le club + donne l’accès gérant au demandeur
// (fonction serveur SECURITY DEFINER réservée à l’opérateur). Renvoie l’id du club créé.
export async function approveClubRequest(requestId: string): Promise<{ ok: boolean; clubId?: string }> {
  const { data, error } = await supabase.rpc('approve_club_request', { p_request_id: requestId });
  if (error || !data) return { ok: false };
  return { ok: true, clubId: data as string };
}
