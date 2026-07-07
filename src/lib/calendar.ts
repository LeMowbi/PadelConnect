// Ajout d’une réservation au calendrier de l’appareil, via la FICHE SYSTÈME « Nouvel
// événement » pré-remplie (createEventInCalendarAsync) : AUCUNE permission requise — sur
// iOS 17+, l’ancienne voie programmatique (requestCalendarPermissionsAsync + création
// directe) échouait, l’accès « complet » au calendrier n’étant plus accordé pareil.
// No-op silencieux sur le web. Renvoie un statut pour que l’UI affiche un retour clair.

import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';
import { SESSION_MIN } from './slots';

const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

export type CalendarResult = 'added' | 'canceled' | 'unavailable';

export async function addReservationToCalendar(input: {
  clubName: string;
  startsAt: number;
  court: string;
  area?: string;
  // Durée RÉELLE du créneau réservé (1h ou 1h30, créneaux modulables 68). Défaut 1h30 pour les
  // appelants historiques — l'événement agenda doit refléter la vraie durée (un 1h ≠ un bloc 1h30).
  durationMin?: number;
}): Promise<CalendarResult> {
  if (!isNative) return 'unavailable';
  try {
    const res = await Calendar.createEventInCalendarAsync({
      title: `Padel · ${input.clubName}`,
      startDate: new Date(input.startsAt),
      endDate: new Date(input.startsAt + (input.durationMin ?? SESSION_MIN) * 60000),
      // Les créneaux sont exprimés à l’heure d’Abidjan (Côte d’Ivoire = UTC+0). On ancre
      // l’événement sur ce fuseau pour qu’il s’affiche à la bonne heure même sur un appareil
      // réglé sur un autre fuseau (voyage / testeur hors Abidjan).
      timeZone: 'Africa/Abidjan',
      location: input.area ? `${input.clubName} — ${input.area}` : input.clubName,
      notes: `Terrain : ${input.court}. Réservé via PadelConnect (heure d’Abidjan).`,
      alarms: [{ relativeOffset: -120 }], // rappel 2h avant (pré-rempli, modifiable dans la fiche)
    });
    // iOS distingue « saved »/« canceled » ; Android renvoie « done » sans détail (le calendrier
    // système s’est ouvert pré-rempli — l’utilisateur a enregistré ou non, on reste neutre).
    if (res.action === 'canceled') return 'canceled';
    return 'added';
  } catch {
    return 'unavailable';
  }
}
