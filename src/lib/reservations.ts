// Couche données « réservations serveur ». Le serveur Supabase est la SOURCE DE VÉRITÉ ;
// le store garde un MIROIR local (lectures synchrones rapides + résilience hors-ligne).
// On écrit ici, puis on met à jour le miroir dans AppContext.

import { dayKey, slotTimestamp } from './days';
import type { BlockedRange } from './ranges';
import { supabase } from './supabase';
import type { BlockedSlot, Invited, Reservation } from '@/store/AppContext';

// Borne basse du miroir de réservations : on ne rapatrie que ~6 mois d'historique + le futur.
// Sans borne, le miroir re-télécharge tout l'historique de tous les clubs à chaque retour au
// premier plan (et, au-delà du plafond PostgREST de 1000 lignes, des créneaux futurs
// tomberaient silencieusement → dispo faussée). L'agrégat « depuis le lancement » de l'Espace
// opérateur devra devenir une RPC serveur si l'historique dépasse cette fenêtre.
const MIRROR_WINDOW_MS = 180 * 86400000;

// Occupation d’un créneau (sans identité) — alimente la disponibilité cross-joueur.
export type SlotOccupancy = { clubId: string; dateKey: string; time: string; court: string };

type Row = {
  id: string;
  user_id: string;
  club_id: string;
  club_name: string | null;
  date_key: string | null;
  date_label: string | null;
  time: string | null;
  starts_at: number | string | null;
  court: string | null;
  price: number | null;
  players: number | null;
  invited: Invited[] | null;
  booked_by_name: string | null;
  booked_by_phone: string | null;
  coach_name: string | null; // cours : réservation créée par respond_lesson (acceptation coach)
  club_confirmed: boolean | null;
  open_match: boolean | null; // match ouvert (45) — rejoignable par les autres joueurs
  open_level: string | null;
  created_at: string | null;
};

// Ligne serveur → modèle local.
export function rowToReservation(row: Row): Reservation {
  // startsAt CANONIQUE : recalculé depuis (date_key + time) en heure fixe Abidjan, pour
  // neutraliser un éventuel fuseau erroné de l’appareil qui a créé la résa (le starts_at
  // stocké ne sert que de repli si la date/heure manquent). Repli sûr contre NaN.
  const storedTs = Number(row.starts_at);
  const startsAt = row.date_key && row.time ? slotTimestamp(row.date_key, row.time) : Number.isFinite(storedTs) ? storedTs : 0;
  const createdTs = row.created_at ? new Date(row.created_at).getTime() : NaN;
  return {
    id: row.id,
    userId: row.user_id,
    clubId: row.club_id,
    clubName: row.club_name ?? '',
    court: row.court ?? '',
    date: row.date_label ?? '',
    dateKey: row.date_key ?? '',
    time: row.time ?? '',
    startsAt,
    price: row.price ?? 0,
    players: row.players ?? 1,
    invited: row.invited ?? [],
    bookedBy: row.booked_by_name ? { name: row.booked_by_name, phone: row.booked_by_phone ?? '' } : undefined,
    coachName: row.coach_name ?? undefined,
    clubConfirmed: row.club_confirmed ?? false,
    openMatch: row.open_match ?? false,
    openLevel: row.open_level ?? undefined,
    createdAt: Number.isFinite(createdTs) ? createdTs : Date.now(),
  };
}

// Modèle local (sans id/createdAt) → ligne serveur à insérer.
function reservationToRow(
  r: Omit<Reservation, 'id' | 'createdAt' | 'bookedBy' | 'userId'>,
  userId: string,
  bookedBy?: { name: string; phone: string },
) {
  return {
    user_id: userId,
    club_id: r.clubId,
    club_name: r.clubName,
    date_key: r.dateKey,
    date_label: r.date,
    time: r.time,
    starts_at: r.startsAt,
    court: r.court,
    price: r.price,
    players: r.players,
    invited: r.invited,
    booked_by_name: bookedBy?.name ?? null,
    booked_by_phone: bookedBy?.phone ?? null,
    // Colonnes 45 envoyées SEULEMENT pour un match ouvert : une réservation normale reste
    // insérable même si la migration 45 n'est pas encore collée (colonnes inconnues sinon).
    ...(r.openMatch ? { open_match: true, open_level: r.openLevel ?? '' } : {}),
    status: 'booked',
  };
}

// Crée la réservation côté serveur. conflict=true si le terrain vient d’être pris
// (violation de la contrainte unique 23505) → l’UI repropose un autre terrain.
export async function insertReservation(
  input: Omit<Reservation, 'id' | 'createdAt' | 'bookedBy' | 'userId'>,
  userId: string,
  bookedBy?: { name: string; phone: string },
): Promise<{ ok: boolean; reservation?: Reservation; conflict?: boolean; past?: boolean; limit?: boolean; closed?: boolean }> {
  const { data, error } = await supabase
    .from('reservations')
    .insert(reservationToRow(input, userId, bookedBy))
    .select()
    .single();
  // 23505 = créneau déjà pris (contrainte unique) ; 23514 = fermé hors app ou réservé à un
  // tournoi (barrière serveur, cf. 27_blocked_slots.sql) ; P0001 = refus des gardes serveur
  // (créneau passé, plafond de résas, créneau '!fermé', terrain retiré, prix hors bornes —
  // cf. 48/53). TOUS ces refus sont des « indisponible/refusé », pas des pannes réseau : les
  // afficher « Connexion impossible » ferait réessayer l'utilisateur en boucle pour rien.
  // Deux refus P0001 ont leur message dédié : créneau passé (horloge du téléphone en retard
  // de +15 min sur le serveur) et plafond de résas à venir (miroir local périmé) — les
  // afficher « terrain pris » inviterait à changer de terrain pour rien.
  if (error) {
    const code = (error as { code?: string }).code;
    const msg = (error as { message?: string }).message ?? '';
    if (code === 'P0001' && msg.includes('must be in the future')) return { ok: false, past: true };
    if (code === 'P0001' && msg.includes('too many upcoming')) return { ok: false, limit: true };
    // « slot closed » (54) = le club vient de fermer ce créneau (période, terrain, grille) :
    // « choisis un autre terrain » serait faux — l'appelant resynchronise plutôt la grille.
    if (code === 'P0001' && msg.includes('slot closed')) return { ok: false, closed: true };
    return { ok: false, conflict: code === '23505' || code === '23514' || code === 'P0001' };
  }
  return { ok: true, reservation: rowToReservation(data as Row) };
}

// ─── Créneaux fermés hors app (blocked_slots serveur) ──────────────────────────
// null = échec réseau → l’appelant garde l’existant. BORNÉ à aujourd'hui-et-après (les
// fermetures passées ne servent plus à l'affichage) et plafonné : la table n'est jamais
// purgée, sans borne le téléchargement grossissait à chaque retour au premier plan.
export async function fetchBlockedSlots(): Promise<BlockedSlot[] | null> {
  const { data, error } = await supabase
    .from('blocked_slots')
    .select('club_id, date_key, time, court, reason')
    .gte('date_key', dayKey(new Date()))
    .order('date_key', { ascending: true })
    .limit(1000);
  if (error) return null;
  return (data ?? []).map((r: { club_id: string; date_key: string; time: string; court: string; reason: string | null }) => ({
    clubId: r.club_id,
    dateKey: r.date_key,
    time: r.time,
    court: r.court,
    reason: r.reason ?? '',
  }));
}

// ─── Fermetures sur PÉRIODE (blocked_ranges serveur, 54) ────────────────────────
// « Terrain 2 fermé du 10 au 24 juillet (travaux) » : terrain précis ou tout le club,
// toute la journée ou certaines heures. Lu par TOUS (la dispo joueur en dépend).
// Le modèle + le prédicat purs vivent dans src/lib/ranges.ts (testés sous node).
export type { BlockedRange } from './ranges';

// null = échec réseau → l'appelant garde l'existant (convention §8). Borné aux périodes
// encore actives (une période finie ne sert plus à l'affichage ; purge serveur par ailleurs).
// La colonne `reason` n'est PAS lue : texte libre du gérant, elle n'est plus lisible que par
// lui (grants de colonnes 54 + club_blockedReasons) — la dispo joueur n'en a pas besoin.
export async function fetchBlockedRanges(): Promise<BlockedRange[] | null> {
  const { data, error } = await supabase
    .from('blocked_ranges')
    .select('id, club_id, court, date_from, date_to, times')
    .gte('date_to', dayKey(new Date()))
    .order('date_from', { ascending: true })
    .limit(500);
  if (error) return null;
  return (data ?? []).map(
    (r: { id: string; club_id: string; court: string | null; date_from: string; date_to: string; times: string[] | null }) => ({
      id: r.id,
      clubId: r.club_id,
      court: r.court,
      dateFrom: r.date_from,
      dateTo: r.date_to,
      times: r.times && r.times.length ? r.times : null,
      reason: '',
    }),
  );
}

// Motifs des périodes fermées du club GÉRÉ (RPC 54, réservée au gérant/opérateur) :
// { id → motif }. null = échec réseau (convention §8) — l'UI affiche alors un libellé neutre.
export async function fetchClubBlockedReasons(clubId: string): Promise<Record<string, string> | null> {
  const { data, error } = await supabase.rpc('club_blocked_reasons', { p_club_id: clubId });
  if (error) return null;
  const map: Record<string, string> = {};
  for (const r of (data ?? []) as { id: string; reason: string | null }[]) map[r.id] = r.reason ?? '';
  return map;
}

export type BlockRangeStatus = 'ok' | 'reservations' | 'competitions' | 'forbidden' | 'invalid' | 'error';

// Ferme une période côté serveur. 'reservations' = une résa à venir vit dans la période
// (le gérant l'annule d'abord) ; 'competitions' = un tournoi publié la chevauche ;
// 'error' = échec réseau. Au succès, le serveur renvoie 'ok:<uuid>' → on rend l'id créé
// pour que l'appelant tienne son miroir local même si la relecture réseau échoue.
export async function blockRangeRow(input: Omit<BlockedRange, 'id'>): Promise<{ status: BlockRangeStatus; id?: string }> {
  const { data, error } = await supabase.rpc('block_range', {
    p_club_id: input.clubId,
    p_court: input.court,
    p_date_from: input.dateFrom,
    p_date_to: input.dateTo,
    p_times: input.times,
    p_reason: input.reason,
  });
  if (error) return { status: 'error' };
  if (typeof data === 'string' && data.startsWith('ok:')) return { status: 'ok', id: data.slice(3) };
  return data === 'reservations' || data === 'competitions' || data === 'forbidden' || data === 'invalid'
    ? { status: data }
    : { status: 'error' };
}

// Rouvre une période (gérant du club, ou opérateur). false si refusé/échec.
export async function unblockRangeRow(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('unblock_range', { p_id: id });
  return !error && data === true;
}

// Purge opportuniste des périodes entièrement passées (best-effort, appelée à l'ouverture de
// l'Espace Club — même motif que la purge des signalements résolus côté opérateur).
export function purgeOldBlockedRanges(): void {
  void supabase.rpc('purge_old_blocked_ranges');
}

// Ferme un créneau côté serveur (gérant du club). false si refusé (déjà réservé / droits).
export async function blockSlotRow(b: BlockedSlot): Promise<boolean> {
  const { data, error } = await supabase.rpc('block_slot', {
    p_club_id: b.clubId,
    p_date_key: b.dateKey,
    p_time: b.time,
    p_court: b.court,
    p_reason: b.reason,
  });
  return !error && data === true;
}

export async function unblockSlotRow(clubId: string, dateKey: string, time: string, court: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('unblock_slot', { p_club_id: clubId, p_date_key: dateKey, p_time: time, p_court: court });
  return !error && data === true;
}

// Annulation : passe par la fonction serveur (SECURITY DEFINER) qui vérifie l’auteur ET le
// délai des 5h (règle non contournable côté serveur) et met la résa en statut 'cancelled'
// (le créneau se libère, mais la trace reste pour que le club voie l’annulation).
export async function cancelReservationRow(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('cancel_reservation', { p_id: id });
  return !error && data === true;
}

export async function setClubConfirmedRow(id: string, value: boolean): Promise<boolean> {
  // Passe par la fonction serveur (SECURITY DEFINER) qui ne modifie QUE club_confirmed
  // après contrôle du rôle — pas d’UPDATE large qui laisserait réécrire prix/terrain.
  const { data, error } = await supabase.rpc('set_club_confirmed', { p_id: id, p_value: value });
  return !error && data === true;
}

// Mes réservations ACTIVES (RLS) — pour un compte club/opérateur, la RLS renvoie aussi
// celles de son club / toutes. On exclut les annulées (status='cancelled') : elles ne
// comptent ni dans la liste joueur ni dans la base de commission. Trié par date de créneau.
export async function fetchReservations(): Promise<{ ok: boolean; reservations: Reservation[] }> {
  // Tri DESCENDANT + plafond explicite : si le périmètre dépasse le cap PostgREST (1000 lignes,
  // possible pour l'opérateur), la troncature retire les plus ANCIENNES — un tri ascendant
  // aurait silencieusement perdu les résas récentes/futures (finances et plannings faussés).
  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('status', 'booked')
    .gte('starts_at', Date.now() - MIRROR_WINDOW_MS) // récent + futur seulement (cf. MIRROR_WINDOW_MS)
    .order('starts_at', { ascending: false })
    .limit(1000);
  if (error) return { ok: false, reservations: [] };
  return { ok: true, reservations: (data ?? []).map((r) => rowToReservation(r as Row)) };
}

// Réservations ANNULÉES du périmètre (RLS) — pour un compte club/opérateur, ce sont les
// annulations de son club. On garde la trace (status='cancelled' posé par cancel_reservation)
// pour que le club soit prévenu qu’un créneau s’est libéré. Trié du plus récent au plus ancien.
// Convention réseau (CLAUDE.md §8) : `null` en cas d’échec (≠ [] = aucune annulation).
export async function fetchCancelledReservations(): Promise<Reservation[] | null> {
  // Fenêtre 180 j + plafond : l'historique complet grossit sans fin et n'est jamais affiché
  // au-delà des entrées récentes — sans borne, tout repasse sur le réseau à chaque ouverture.
  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('status', 'cancelled')
    .gte('starts_at', Date.now() - MIRROR_WINDOW_MS)
    .order('starts_at', { ascending: false })
    .limit(500);
  if (error) return null;
  return (data ?? []).map((r) => rowToReservation(r as Row));
}

// Absences (no-show) du périmètre (RLS) — pour un compte club/opérateur, ce sont les absences
// de son club. Trace conservée (status='no_show' posé par mark_no_show). Plus récent d’abord.
// Convention réseau : `null` en cas d’échec (≠ [] = aucune absence).
export async function fetchNoShowReservations(): Promise<Reservation[] | null> {
  // Même fenêtre/plafond que les annulations (l'écran n'affiche que le récent).
  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('status', 'no_show')
    .gte('starts_at', Date.now() - MIRROR_WINDOW_MS)
    .order('starts_at', { ascending: false })
    .limit(500);
  if (error) return null;
  return (data ?? []).map((r) => rowToReservation(r as Row));
}

// Le club (ou l’opérateur) marque une réservation comme « pas venu » (ou annule l’absence).
// Fonction serveur (SECURITY DEFINER) qui vérifie le rôle/le club. false si refusé/conflit.
export async function markNoShowRow(id: string, value: boolean): Promise<boolean> {
  const { data, error } = await supabase.rpc('mark_no_show', { p_id: id, p_value: value });
  return !error && data === true;
}

// Fiabilité des joueurs (annulations + absences) par id de compte — club/opérateur seulement.
// Convention réseau : `null` en cas d’échec ({} = aucun joueur demandé / aucun résultat).
export type Reliability = { cancelled: number; noShow: number };
export async function fetchReliability(userIds: string[]): Promise<Record<string, Reliability> | null> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return {};
  const { data, error } = await supabase.rpc('player_reliability', { p_user_ids: ids });
  if (error) return null;
  const out: Record<string, Reliability> = {};
  for (const r of (data ?? []) as { user_id: string; cancelled: number; no_show: number }[]) {
    out[r.user_id] = { cancelled: r.cancelled ?? 0, noShow: r.no_show ?? 0 };
  }
  return out;
}

// Réservation PARTAGÉE : rattache les amis invités (par leur numéro) à la réservation.
// La résolution numéro → compte se fait côté serveur (fonction SECURITY DEFINER), donc on
// n’expose jamais les profils. Les non-inscrits sont simplement ignorés.
// false = le rattachement a échoué (réseau) : les invités ne recevront ni push ni la résa
// chez eux — l'appelant doit le dire (la réservation elle-même, elle, reste valide).
export async function linkParticipants(reservationId: string, phones: string[]): Promise<boolean> {
  const clean = phones.map((p) => p.trim()).filter((p) => p.replace(/\D/g, '').length >= 8);
  if (clean.length === 0) return true;
  const { error } = await supabase.rpc('link_participants', { p_reservation_id: reservationId, p_phones: clean });
  return !error;
}

// Les réservations où JE suis invité (participant), AVEC le statut de mon invitation.
// 'invited' = à confirmer (Accepter/Refuser), 'accepted' = je viens, 'declined' = j’ai refusé.
export type MyParticipation = { reservationId: string; status: 'invited' | 'accepted' | 'declined' };
// null = échec réseau (≠ tableau vide = « aucune invitation ») → l’appelant garde l’existant et
// n’efface pas les invitations en cours au retour au premier plan.
export async function fetchMyParticipations(userId: string): Promise<MyParticipation[] | null> {
  const { data, error } = await supabase.from('reservation_participants').select('reservation_id, status').eq('user_id', userId);
  if (error) return null;
  return (data ?? []).map((r: { reservation_id: string; status: string | null }) => ({
    reservationId: r.reservation_id,
    status: (r.status as MyParticipation['status']) ?? 'invited',
  }));
}

// L’invité répond à une invitation (Accepter / Refuser) — fonction serveur (SECURITY DEFINER).
export async function respondInvitation(reservationId: string, accept: boolean): Promise<boolean> {
  const { data, error } = await supabase.rpc('respond_invitation', { p_reservation_id: reservationId, p_accept: accept });
  return !error && data === true;
}

// Occupation de TOUS les créneaux pris (vue publique sans identité). Renvoie null en cas
// d’échec réseau (≠ tableau vide = « aucun créneau pris ») → l’appelant garde l’occupation
// connue au lieu de la vider et d’afficher de fausses dispos.
export async function fetchOccupancy(): Promise<SlotOccupancy[] | null> {
  // Seuls les jours À VENIR intéressent la disponibilité (l'app ne lit l'occupation que pour
  // les 7 prochains jours) : on borne à aujourd'hui pour ne pas rapatrier tout le passé — et
  // ne pas heurter le plafond de 1000 lignes qui, atteint, fausserait les dispos.
  // Ordre EXPLICITE + plafond : au cap PostgREST (1000 lignes), une troncature silencieuse
  // sans ordre pourrait retirer n'importe quels jours — on garde les plus PROCHES (ceux que
  // l'app affiche), les jours lointains tronqués n'étant pas montrés.
  const { data, error } = await supabase
    .from('slot_occupancy')
    .select('*')
    .gte('date_key', dayKey(new Date()))
    .order('date_key', { ascending: true })
    .limit(1000);
  if (error) return null;
  return (data ?? []).map((o: { club_id: string; date_key: string; time: string; court: string }) => ({
    clubId: o.club_id,
    dateKey: o.date_key,
    time: o.time,
    court: o.court,
  }));
}
