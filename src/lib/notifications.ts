// Rappels de match LOCAUX (sans serveur) via expo-notifications : une notification
// programmée ~2 h avant chaque réservation à venir. L'utilisateur active/désactive le tout
// via l'interrupteur « Rappels » du profil. Web : tout est neutralisé (no-op).

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const isNative = Platform.OS === 'ios' || Platform.OS === 'android';
const REMINDER_LEAD_MS = 2 * 60 * 60 * 1000; // 1ᵉʳ rappel : 2 h avant le créneau
// 2ᵉ rappel : 15 min AVANT la limite d'annulation gratuite (5 h avant le match), pour laisser
// le temps d'annuler sans frais si on ne peut plus venir → 5 h 15 min avant le créneau.
const CANCEL_DEADLINE_MS = 5 * 60 * 60 * 1000; // doit rester aligné avec la règle serveur (09_cancel_security)
const CANCEL_WARNING_LEAD_MS = CANCEL_DEADLINE_MS + 15 * 60 * 1000;

// Affichage en premier plan (app ouverte) : bannière + son, sans pastille.
if (isNative) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export type ReminderInput = { id: string; clubName: string; time: string; startsAt: number; court: string };

// Demande la permission (idempotent). Renvoie true si accordée.
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!isNative) return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (current.canAskAgain === false) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

function isMatchReminder(n: Notifications.NotificationRequest): boolean {
  return (n.content.data as { kind?: string } | null)?.kind === 'match-reminder';
}

// Programme un rappel à une date donnée (no-op si la date est déjà passée).
async function scheduleAt(when: number, r: ReminderInput, title: string, body: string): Promise<void> {
  if (when <= Date.now()) return;
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data: { reservationId: r.id, kind: 'match-reminder' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(when) },
  });
}

// Programme les DEUX rappels d'UNE réservation (chacun ignoré si sa date est déjà passée) :
//  1) 5 h 15 min avant → dernière fenêtre pour annuler sans frais ;
//  2) 2 h avant → le match approche.
export async function scheduleMatchReminder(r: ReminderInput): Promise<void> {
  if (!isNative) return;
  await scheduleAt(
    r.startsAt - CANCEL_WARNING_LEAD_MS,
    r,
    'Tu joues toujours ? ⏳',
    `${r.clubName} à ${r.time} · ${r.court}. Dans 15 min, l'annulation gratuite ne sera plus possible.`,
  );
  await scheduleAt(
    r.startsAt - REMINDER_LEAD_MS,
    r,
    'Ton match de padel approche 🎾',
    `${r.clubName} à ${r.time} · ${r.court}. Pense à confirmer ton équipe !`,
  );
}

// Annule le rappel d'une réservation donnée (à l'annulation de la résa).
export async function cancelMatchReminder(reservationId: string): Promise<void> {
  if (!isNative) return;
  const all = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    all
      .filter((n) => isMatchReminder(n) && (n.content.data as { reservationId?: string }).reservationId === reservationId)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

// Resynchronise TOUS les rappels : on efface les nôtres puis on (re)planifie selon l'état.
// Appelé au démarrage, après une réservation, et au basculement de l'interrupteur.
export async function syncMatchReminders(reservations: ReminderInput[], enabled: boolean): Promise<void> {
  if (!isNative) return;
  const all = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(all.filter(isMatchReminder).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
  if (!enabled) return;
  if (!(await ensureNotificationPermission())) return;
  for (const r of reservations) await scheduleMatchReminder(r);
}
