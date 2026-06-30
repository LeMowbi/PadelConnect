// Couche données « clubs serveur ». Les 9 clubs de base restent embarqués dans l'app
// (rapides, hors-ligne) ; cette table ne contient que les clubs AJOUTÉS via l'app.
// L'opérateur approuve une demande → un club est créé ici et apparaît chez tous les
// joueurs, SANS nouvelle version de l'app.

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
};

// Toutes les surcharges de page (édités par les gérants) → { clubId: surcharge } pour fusion.
export async function fetchClubOverrides(): Promise<Record<string, ClubOverride>> {
  const { data, error } = await supabase.from('club_overrides').select('*');
  if (error) return {};
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
  });
  return !error && data === true;
}

// ─── Config de club partagée (horaires, terrains, offres, coachs, photos) ──────
export type ClubOffer = { id: string; kind: 'offre' | 'actu' | 'evenement'; title: string; detail: string };
export type ClubCoach = { id: string; name: string; specialty: string; phone?: string };
export type ClubConfig = {
  slots?: string[];
  courts?: string[];
  offers?: ClubOffer[];
  coaches?: ClubCoach[];
  photos?: string[];
};

type ClubConfigRow = {
  club_id: string;
  slots: string[] | null;
  courts: string[] | null;
  offers: ClubOffer[] | null;
  coaches: ClubCoach[] | null;
  photos: string[] | null;
};

// Toutes les configs de club → { clubId: config } pour fusion dans le store au chargement.
export async function fetchClubConfigs(): Promise<Record<string, ClubConfig>> {
  const { data, error } = await supabase.from('club_config').select('*');
  if (error) return {};
  const out: Record<string, ClubConfig> = {};
  for (const r of (data ?? []) as ClubConfigRow[]) {
    out[r.club_id] = {
      slots: r.slots ?? undefined,
      courts: r.courts ?? undefined,
      offers: r.offers ?? undefined,
      coaches: r.coaches ?? undefined,
      photos: r.photos ?? undefined,
    };
  }
  return out;
}

// Le gérant pousse SA config (mise à jour partielle : seuls les champs fournis changent).
// Le serveur refuse si ce n'est pas son club. false si refusé/échec.
export async function upsertClubConfig(clubId: string, c: ClubConfig): Promise<boolean> {
  const { data, error } = await supabase.rpc('upsert_club_config', {
    p_club_id: clubId,
    p_slots: c.slots ?? null,
    p_courts: c.courts ?? null,
    p_offers: c.offers ?? null,
    p_coaches: c.coaches ?? null,
    p_photos: c.photos ?? null,
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
export async function fetchServerClubs(): Promise<CustomClub[]> {
  const { data, error } = await supabase.from('clubs').select('*').in('status', ['active', 'coming_soon']);
  if (error) return [];
  return (data ?? []).map((row) => serverRowToClub(row as ClubRow));
}

// Opérateur : change le statut d'un club (active | coming_soon | hidden).
export async function setClubStatus(clubId: string, status: 'active' | 'coming_soon' | 'hidden'): Promise<boolean> {
  const { data, error } = await supabase.rpc('set_club_status', { p_id: clubId, p_status: status });
  return !error && data === true;
}

// Statut piloté par l'opérateur pour N'IMPORTE QUEL club (y compris les 9 de base) → clubId → statut.
export async function fetchClubStatus(): Promise<Record<string, 'active' | 'coming_soon' | 'hidden'>> {
  const { data, error } = await supabase.from('club_status').select('club_id, status');
  if (error) return {};
  const out: Record<string, 'active' | 'coming_soon' | 'hidden'> = {};
  for (const r of (data ?? []) as { club_id: string; status: 'active' | 'coming_soon' | 'hidden' }[]) out[r.club_id] = r.status;
  return out;
}

// Opérateur : bascule le statut d'un club de base (ou tout club) — visible par tous.
export async function setBaseClubStatus(clubId: string, status: 'active' | 'coming_soon' | 'hidden'): Promise<boolean> {
  const { data, error } = await supabase.rpc('set_base_club_status', { p_club_id: clubId, p_status: status });
  return !error && data === true;
}

// Opérateur : supprime DÉFINITIVEMENT un club serveur (+ ses données liées). false si refusé.
export async function deleteClub(clubId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('delete_club', { p_id: clubId });
  return !error && data === true;
}

// Commission propre à chaque club (lue par l'opérateur) → { clubId: taux } (0.10 = 10 %).
export async function fetchClubCommissions(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from('club_commission').select('club_id, rate');
  if (error) return {};
  const out: Record<string, number> = {};
  for (const r of (data ?? []) as { club_id: string; rate: number }[]) out[r.club_id] = r.rate;
  return out;
}

// Opérateur : fixe la commission (taux 0–1) d'un club. false si refusé/échec.
export async function setClubCommission(clubId: string, rate: number): Promise<boolean> {
  const { data, error } = await supabase.rpc('set_club_commission', { p_club_id: clubId, p_rate: rate });
  return !error && data === true;
}

// Opérateur : donne l'accès « Espace Club » à un joueur (par son numéro) pour un club donné —
// n'importe quel club, y compris les 9 de base. Renvoie le nom du joueur promu si trouvé.
export async function grantClubAccessByPhone(phone: string, clubId: string): Promise<{ ok: boolean; name?: string }> {
  const { data, error } = await supabase.rpc('grant_club_access_by_phone', { p_phone: phone.trim(), p_club_id: clubId });
  if (error || !data) return { ok: false };
  return { ok: true, name: data as string };
}

// Opérateur : retire l'accès gérant d'un joueur (par son numéro). Renvoie son nom si trouvé.
export async function revokeClubAccessByPhone(phone: string): Promise<{ ok: boolean; name?: string }> {
  const { data, error } = await supabase.rpc('revoke_club_access_by_phone', { p_phone: phone.trim() });
  if (error || !data) return { ok: false };
  return { ok: true, name: data as string };
}

// Opérateur : pré-charge un club « Bientôt » sans demande préalable. Renvoie l'id créé.
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

// Approuve une demande de club : crée le club + donne l'accès gérant au demandeur
// (fonction serveur SECURITY DEFINER réservée à l'opérateur). Renvoie l'id du club créé.
export async function approveClubRequest(requestId: string): Promise<{ ok: boolean; clubId?: string }> {
  const { data, error } = await supabase.rpc('approve_club_request', { p_request_id: requestId });
  if (error || !data) return { ok: false };
  return { ok: true, clubId: data as string };
}
