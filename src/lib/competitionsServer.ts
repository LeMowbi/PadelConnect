// Couche données « tournois serveur ». Un tournoi vit désormais sur Supabase (visible par
// tous, synchronisé d'un appareil à l'autre) au lieu de rester dans un seul téléphone.
// Règles métier appliquées côté serveur (RPC SECURITY DEFINER) : club → publié direct ;
// joueur → en attente de validation du club hôte ; frais fixe figé à la création.

import { type Competition } from '@/data/competitions';
import { dateKeyLabel } from '@/lib/days';
import { supabase } from './supabase';

type CompetitionRow = {
  id: string;
  organizer_id: string;
  organizer_type: 'club' | 'joueur';
  organizer_name: string;
  organizer_phone: string | null;
  club_id: string | null;
  club_name: string | null;
  title: string;
  format: string;
  level: string;
  date_key: string;
  end_date_key: string | null;
  courts: string[] | null;
  slots: string[] | null;
  capacity: number;
  fee: string;
  reward: string;
  official: boolean;
  status: 'pending' | 'published' | 'closed' | 'rejected';
  commission: number;
  winner: string | null;
  second: string | null;
  third: string | null;
  loser: string | null;
  registered: number;
  teams: string[] | null;
};

// Résultat de clôture figé côté serveur (rejoué dans le store sous compResults).
export type CompClose = { winner?: string; second?: string; third?: string; loser?: string };

// Ligne serveur → modèle local Competition. `status` serveur (published/closed) devient
// « approved » (visible) ; pending/rejected gardent leur sens pour la modération.
function rowToCompetition(r: CompetitionRow, myUserId: string): Competition {
  const status: Competition['status'] = r.status === 'pending' ? 'pending' : r.status === 'rejected' ? 'rejected' : 'approved';
  return {
    id: r.id,
    title: r.title,
    organizerType: r.organizer_type,
    organizer: r.organizer_name,
    organizerId: r.organizer_id,
    organizerPhone: r.organizer_phone ?? undefined,
    clubId: r.club_id ?? undefined,
    clubName: r.club_name ?? undefined,
    date: dateKeyLabel(r.date_key),
    dateKey: r.date_key,
    endDate: r.end_date_key ? dateKeyLabel(r.end_date_key) : undefined,
    endDateKey: r.end_date_key ?? undefined,
    format: r.format,
    level: r.level,
    reward: r.reward,
    fee: r.fee,
    slots: r.capacity,
    registered: r.registered,
    official: r.official,
    createdByMe: r.organizer_id === myUserId,
    server: true,
    courtNames: r.courts ?? undefined,
    timeSlots: r.slots ?? undefined,
    teamNames: r.teams ?? undefined,
    commission: r.commission,
    status,
  };
}

export type ServerCompetitions = { comps: Competition[]; closes: Record<string, CompClose> };

// Tous les tournois visibles + l'état de clôture des tournois terminés. null = échec réseau
// (l'appelant garde l'existant).
export async function fetchCompetitions(myUserId: string): Promise<ServerCompetitions | null> {
  const { data, error } = await supabase.rpc('fetch_competitions');
  if (error) return null;
  const rows = (data ?? []) as CompetitionRow[];
  const comps: Competition[] = [];
  const closes: Record<string, CompClose> = {};
  for (const r of rows) {
    comps.push(rowToCompetition(r, myUserId));
    if (r.status === 'closed') {
      closes[r.id] = {
        winner: r.winner ?? undefined,
        second: r.second ?? undefined,
        third: r.third ?? undefined,
        loser: r.loser ?? undefined,
      };
    }
  }
  return { comps, closes };
}

// Mes inscriptions (équipe = moi + partenaire) → { compId: partner }. null = échec réseau.
export async function fetchMyCompRegistrations(): Promise<Record<string, string> | null> {
  const { data, error } = await supabase.rpc('fetch_my_registrations');
  if (error) return null;
  const out: Record<string, string> = {};
  for (const r of (data ?? []) as { competition_id: string; partner: string }[]) out[r.competition_id] = r.partner;
  return out;
}

export type CreateCompetitionInput = {
  title: string;
  organizerType: 'club' | 'joueur';
  organizerName: string;
  organizerPhone?: string;
  clubId?: string;
  clubName?: string;
  dateKey: string;
  endDateKey?: string;
  courts: string[];
  slots: string[];
  capacity: number;
  fee: string;
  reward: string;
  format: string;
  level: string;
};

// Crée un tournoi côté serveur. Renvoie l'id créé, ou null si refusé (droits) / échec.
export async function createCompetition(input: CreateCompetitionInput): Promise<string | null> {
  const { data, error } = await supabase.rpc('create_competition', {
    p_title: input.title,
    p_organizer_type: input.organizerType,
    p_organizer_name: input.organizerName,
    p_organizer_phone: input.organizerPhone ?? null,
    p_club_id: input.clubId ?? null,
    p_club_name: input.clubName ?? null,
    p_date_key: input.dateKey,
    p_end_date_key: input.endDateKey ?? null,
    p_courts: input.courts,
    p_slots: input.slots,
    p_capacity: input.capacity,
    p_fee: input.fee,
    p_reward: input.reward,
    p_format: input.format,
    p_level: input.level,
  });
  if (error || !data) return null;
  return data as string;
}

export async function approveCompetition(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('approve_competition', { p_id: id });
  return !error && data === true;
}

export async function rejectCompetition(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('reject_competition', { p_id: id });
  return !error && data === true;
}

export async function registerCompetition(id: string, partner: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('register_competition', { p_id: id, p_partner: partner });
  return !error && data === true;
}

export async function unregisterCompetition(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('unregister_competition', { p_id: id });
  return !error && data === true;
}

export async function closeCompetition(id: string, close: CompClose): Promise<boolean> {
  const { data, error } = await supabase.rpc('close_competition', {
    p_id: id,
    p_winner: close.winner ?? null,
    p_second: close.second ?? null,
    p_third: close.third ?? null,
    p_loser: close.loser ?? null,
  });
  return !error && data === true;
}

export async function deleteCompetition(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('delete_competition', { p_id: id });
  return !error && data === true;
}

// Frais fixe (FCFA) appliqué aux tournois joueurs — lu à la création (affichage) et réglé
// par l'opérateur. null = échec réseau.
export async function fetchTournamentFee(): Promise<number | null> {
  const { data, error } = await supabase.from('tournament_config').select('player_fee').maybeSingle();
  if (error || !data) return null;
  return Number((data as { player_fee: number }).player_fee);
}

export async function setTournamentFee(amount: number): Promise<boolean> {
  const { data, error } = await supabase.rpc('set_tournament_fee', { p_amount: Math.max(0, Math.round(amount)) });
  return !error && data === true;
}
