// Parts Wave des matchs partagés (83) : le CRÉATEUR colle son lien Wave sur sa résa, chaque
// participant accepté déclare « j'ai payé ma part », le créateur confirme la réception (push
// via le webhook share_payments). Le calcul de la part reste `perPlayerOf` (client, existant).
// Convention §8 : null = échec réseau.

import { supabase } from './supabase';

export type SharePayment = { userId: string; name: string; status: 'declared' | 'confirmed' };
export type ShareState = { waveLink: string; shares: SharePayment[] };

// Créateur : enregistre SON lien Wave sur SA résa ('' = effacer). false = refus (pas https,
// pas ma résa, ou match terminé depuis plus de 24 h — fenêtre serveur de la 88, la grâce
// couvre le règlement d'après-match) ou échec réseau.
export async function setReservationWaveLink(reservationId: string, link: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('set_reservation_wave_link', { p_id: reservationId, p_link: link });
  return !error && data === true;
}

// Participant accepté : déclare sa part payée (idempotent — une part déjà confirmée ne
// redescend jamais). Même fenêtre que le lien (jusqu'à 24 h après la fin du match, 88).
// true = pris en compte.
export async function declareSharePaid(reservationId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('declare_share_paid', { p_reservation_id: reservationId });
  return !error && data === true;
}

// Créateur : confirme la part déclarée d'UN joueur. true = confirmée.
export async function confirmSharePaid(reservationId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('confirm_share_paid', { p_reservation_id: reservationId, p_user: userId });
  return !error && data === true;
}

// État des parts d'une résa (créateur OU participant accepté) : lien Wave + statut par joueur.
// null = échec réseau OU accès refusé (pas concerné par cette résa).
export async function fetchSharePayments(reservationId: string): Promise<ShareState | null> {
  const { data, error } = await supabase.rpc('fetch_share_payments', { p_reservation_id: reservationId });
  if (error || !data) return null;
  const raw = data as { wave_link: string | null; shares: { user_id: string; name: string; status: string }[] };
  return {
    waveLink: raw.wave_link ?? '',
    shares: (raw.shares ?? []).map((s) => ({
      userId: s.user_id,
      name: s.name || 'Un joueur',
      status: s.status === 'confirmed' ? 'confirmed' : 'declared',
    })),
  };
}
