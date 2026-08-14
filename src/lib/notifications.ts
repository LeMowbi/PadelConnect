// Rappels de match LOCAUX (sans serveur) via expo-notifications : une notification
// programmée ~2 h avant chaque réservation à venir. L’utilisateur active/désactive le tout
// via l’interrupteur « Rappels » du profil. Web : tout est neutralisé (no-op).
//
// Ce fichier gère aussi le TAP sur une notification (locale OU push serveur) : on route vers
// l’écran concerné plutôt que de rouvrir l’app là où elle en était (cf. useNotificationTapRouter).

import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { CANCEL_DEADLINE_MS } from './reservations';

const isNative = Platform.OS === 'ios' || Platform.OS === 'android';
const REMINDER_LEAD_MS = 2 * 60 * 60 * 1000; // 1ᵉʳ rappel : 2 h avant le créneau
// 2ᵉ rappel : 15 min AVANT la limite d’annulation gratuite (5 h avant le match, CANCEL_DEADLINE_MS
// partagé avec l’écran Réservations), pour laisser le temps d’annuler sans frais si on ne peut plus
// venir → 5 h 15 min avant le créneau.
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
  // Android 8+ : sans canal EXPLICITE, les rappels/push retombent sur un canal d'importance
  // moyenne → pas d'affichage « heads-up ». On crée un canal HIGH pour que les alertes
  // (rappel d'annulation, match qui approche, push du gérant) apparaissent bien en avant-plan.
  if (Platform.OS === 'android') {
    void Notifications.setNotificationChannelAsync('default', {
      name: 'Rappels & alertes',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }
}

// iOS ne conserve que les 64 notifications locales programmées les plus PROCHES et jette le
// reste en silence. On borne donc le nombre de réservations planifiées (2 rappels chacune) pour
// rester bien sous ce plafond — on garde les créneaux les plus proches, ceux qui comptent.
const MAX_SCHEDULED_RESERVATIONS = 28;

// `isOwner` : true si JE suis l’auteur de la réservation (celui qui peut l’annuler). Un ami
// simplement INVITÉ n’a ni bouton « Annuler » ni « équipe » à confirmer — ses rappels doivent
// donc être différents (cf. scheduleMatchReminder). Par défaut true (compat : tous les points
// d’entrée qui planifient MA propre réservation, jamais celle d’un tiers).
export type ReminderInput = { id: string; clubName: string; time: string; startsAt: number; court: string; isOwner?: boolean };

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

// Programme les rappels d’UNE réservation (chacun ignoré si sa date est déjà passée) :
//  1) 5 h 15 min avant → dernière fenêtre pour annuler sans frais (AUTEUR uniquement : un
//     invité n’a pas de bouton « Annuler », ce rappel ne le concerne pas) ;
//  2) 2 h avant → le match approche (tout le monde, texte adapté selon le rôle).
export async function scheduleMatchReminder(r: ReminderInput): Promise<void> {
  if (!isNative) return;
  const isOwner = r.isOwner ?? true;
  if (isOwner) {
    await scheduleAt(
      r.startsAt - CANCEL_WARNING_LEAD_MS,
      r,
      'Tu joues toujours ? ⏳',
      `${r.clubName} à ${r.time} · ${r.court}. Dans 15 min, l’annulation gratuite ne sera plus possible.`,
    );
  }
  await scheduleAt(
    r.startsAt - REMINDER_LEAD_MS,
    r,
    'Ton match de padel approche 🎾',
    isOwner
      ? `${r.clubName} à ${r.time} · ${r.court}. Pense à confirmer ton équipe !`
      : `${r.clubName} à ${r.time} · ${r.court}. Confirme ta présence !`,
  );
}

// Annule le rappel d’une réservation donnée (à l’annulation de la résa).
export async function cancelMatchReminder(reservationId: string): Promise<void> {
  if (!isNative) return;
  const all = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    all
      .filter((n) => isMatchReminder(n) && (n.content.data as { reservationId?: string }).reservationId === reservationId)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

// Resynchronise TOUS les rappels : on efface les nôtres puis on (re)planifie selon l’état.
// Appelé au démarrage, après une réservation, et au basculement de l’interrupteur.
export async function syncMatchReminders(reservations: ReminderInput[], enabled: boolean): Promise<void> {
  if (!isNative) return;
  const all = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(all.filter(isMatchReminder).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
  if (!enabled) return;
  if (!(await ensureNotificationPermission())) return;
  // On ne planifie que les créneaux les PLUS PROCHES (≤ MAX_SCHEDULED_RESERVATIONS), pour rester
  // sous le plafond iOS de 64 notifications locales — sinon les rappels lointains seraient jetés.
  const soonest = [...reservations].sort((a, b) => a.startsAt - b.startsAt).slice(0, MAX_SCHEDULED_RESERVATIONS);
  for (const r of soonest) await scheduleMatchReminder(r);
}

// ─── Tap sur une notification → navigation ────────────────────────────────────
// Route l’utilisateur vers l’écran concerné au lieu de rouvrir l’app là où elle en était.
// `kind` couvre les rappels locaux (match-reminder) ET les push serveur (notify-club) qui
// portent désormais un payload `data` (friend_request / reservation / tournament).
type NotificationData = { kind?: string; id?: string; reservationId?: string; clubId?: string; dateKey?: string; time?: string };

function routeForNotification(data: NotificationData | null | undefined): string | null {
  switch (data?.kind) {
    case 'friend_request':
      return '/amis';
    case 'reservation':
    case 'match-reminder':
      // Pas d’écran par réservation individuelle : on amène à la liste, où elle est visible.
      return '/reservations';
    case 'lesson':
      // Demande de cours reçue → l’Espace Coach (Accepter / Refuser).
      return '/coach-admin';
    case 'club_reservation':
    case 'club_tournament':
      // Push destiné au GÉRANT (nouvelle résa / annulation / demande de tournoi) → un seul
      // tap ouvre l’Espace Club au lieu de laisser naviguer Profil → Espace Club à la main.
      return '/club-admin';
    case 'tournament':
      return data.id ? `/competition/${data.id}` : '/competitions';
    case 'news':
      // Actu publiée par l'opérateur (47) → l'accueil, où le bandeau l'affiche en haut.
      return '/';
    case 'open_match':
      // Match ouvert d'un partenaire suivi / à mon niveau (80-81) → l'onglet Réserver, où la
      // section « Matchs ouverts » l'affiche (pas d'écran par match individuel).
      return '/reserver';
    case 'waitlist':
      // « Un créneau s'est libéré » (81) → tunnel du club pré-rempli jour/heure (mêmes query
      // params que la proposition d'annulation club, 75) — sinon l'onglet Réserver.
      return data.clubId && data.dateKey && data.time
        ? `/reserver/${data.clubId}?dateKey=${data.dateKey}&time=${encodeURIComponent(data.time)}`
        : '/reserver';
    default:
      return null;
  }
}

// Push reçu pendant que l'app est OUVERTE au premier plan : la bannière système s'affiche,
// mais rien ne rechargeait l'écran (seul le retour d'arrière-plan rafraîchit). Ce petit
// abonnement permet à AppContext de resynchroniser le miroir dès réception. No-op sur le web.
export function onPushReceivedInForeground(cb: () => void): () => void {
  if (!isNative) return () => {};
  const sub = Notifications.addNotificationReceivedListener(() => cb());
  return () => sub.remove();
}

// Hook à monter UNE FOIS à la racine (RootNav) : gère le tap en premier plan/arrière-plan
// ET le démarrage « à froid » depuis une notification (getLastNotificationResponseAsync).
export function useNotificationTapRouter(push: (route: string) => void): void {
  useEffect(() => {
    if (!isNative) return;
    let active = true;
    const handle = (response: Notifications.NotificationResponse) => {
      const route = routeForNotification(response.notification.request.content.data as NotificationData);
      if (route && active) push(route);
    };
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    // App lancée directement depuis une notification (froid) : la réponse est déjà disponible.
    void Notifications.getLastNotificationResponseAsync().then((r) => {
      if (r && active) handle(r);
    });
    return () => {
      active = false;
      sub.remove();
    };
  }, [push]);
}
