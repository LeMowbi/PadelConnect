// Recherche d'un joueur par numéro (pour ajouter un ami EN VRAI) et liste d'amis serveur.
// Tout passe par des fonctions SECURITY DEFINER : on n'expose jamais la table des profils.

import { type Friend } from '@/data/user';
import { supabase } from './supabase';

export type FoundPlayer = { name: string; level?: number };

// Renvoie le joueur PadelConnect correspondant au numéro, ou null s'il n'a pas (encore) de compte.
export async function findPlayerByPhone(phone: string): Promise<FoundPlayer | null> {
  const { data, error } = await supabase.rpc('find_player_by_phone', { p_phone: phone.trim() });
  if (error || !data || (Array.isArray(data) && data.length === 0)) return null;
  const row = (Array.isArray(data) ? data[0] : data) as { first_name: string | null; last_name: string | null; level: number | null };
  const name = `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim();
  if (!name) return null;
  return { name, level: row.level != null ? Number(row.level) : undefined };
}

type FriendRow = { friend_id: string; name: string | null; level: number | null; phone?: string | null };

// Ma liste d'amis (synchronisée). null = échec réseau → l'appelant garde l'existant
// (≠ tableau vide = succès « aucun ami »).
export async function fetchFriends(): Promise<Friend[] | null> {
  const { data, error } = await supabase.rpc('fetch_friends');
  if (error) return null;
  return ((data ?? []) as FriendRow[])
    .filter((r) => (r.name ?? '').trim().length > 0)
    .map((r) => ({
      id: r.friend_id,
      name: (r.name ?? '').trim(),
      phone: r.phone ?? undefined,
      level: r.level != null ? Number(r.level) : undefined,
    }));
}

// Résultat d'une demande d'ami. `status` reflète ce qu'a fait le serveur :
//   sent            : demande envoyée, en attente de sa réponse
//   accepted        : la personne m'avait déjà invité → on est amis tout de suite
//   already_friends : on était déjà amis
//   pending         : j'avais déjà une demande en attente vers cette personne
//   not_found       : aucun joueur PadelConnect avec ce numéro
//   error           : échec réseau / serveur
export type FriendRequestResult = {
  status: 'sent' | 'accepted' | 'already_friends' | 'pending' | 'not_found' | 'error';
  friend?: Friend;
};

// Envoie une DEMANDE d'ami par numéro (remplace l'ajout instantané). Le lien n'est créé qu'après
// acceptation de la personne (ou immédiatement si elle m'avait déjà invité → statut 'accepted').
export async function sendFriendRequest(phone: string): Promise<FriendRequestResult> {
  const { data, error } = await supabase.rpc('send_friend_request', { p_phone: phone.trim() });
  if (error) return { status: 'error' };
  const row = (Array.isArray(data) ? data[0] : data) as
    { status: string; friend_id: string | null; name: string | null; level: number | null } | undefined;
  if (!row) return { status: 'error' };
  const status = row.status as FriendRequestResult['status'];
  const friend =
    row.friend_id && (row.name ?? '').trim()
      ? {
          id: row.friend_id,
          name: (row.name ?? '').trim(),
          phone: phone.trim() || undefined,
          level: row.level != null ? Number(row.level) : undefined,
        }
      : undefined;
  return { status, friend };
}

// Une demande d'ami REÇUE, en attente de ma réponse (Accepter / Refuser).
export type IncomingFriendRequest = { requestId: string; fromId: string; name: string; level?: number };

// Mes demandes d'ami reçues (en attente). null = échec réseau → l'appelant garde l'existant.
export async function fetchFriendRequests(): Promise<IncomingFriendRequest[] | null> {
  const { data, error } = await supabase.rpc('fetch_friend_requests');
  if (error) return null;
  type Row = { request_id: string; from_id: string; name: string | null; level: number | null };
  return ((data ?? []) as Row[])
    .filter((r) => (r.name ?? '').trim().length > 0)
    .map((r) => ({
      requestId: r.request_id,
      fromId: r.from_id,
      name: (r.name ?? '').trim(),
      level: r.level != null ? Number(r.level) : undefined,
    }));
}

// Répond à une demande reçue. true si le serveur a bien enregistré la réponse.
export async function respondFriendRequest(requestId: string, accept: boolean): Promise<boolean> {
  const { data, error } = await supabase.rpc('respond_friend_request', { p_request_id: requestId, p_accept: accept });
  return !error && data === true;
}

// Retire un ami côté serveur. false si le réseau a refusé (on ne touche pas au miroir local).
export async function removeFriendOnServer(friendId: string): Promise<boolean> {
  const { error } = await supabase.rpc('remove_friend', { p_friend_id: friendId });
  return !error;
}
