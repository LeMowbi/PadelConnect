// Ajout d’une réservation au calendrier de l’appareil, via la FICHE SYSTÈME « Nouvel
// événement » pré-remplie (createEventInCalendarAsync) : AUCUNE permission requise à partir
// d’iOS 17 — l’ancienne voie programmatique (requestCalendarPermissionsAsync + création
// directe) y échouait, l’accès « complet » au calendrier n’étant plus accordé pareil.
// ⚠️ De iOS 16.4 à 16.7, la fiche système EXIGE encore la permission calendrier (le module natif
// la vérifie et lève sinon) : on la demande d’abord (chaîne déjà déclarée par le config plugin,
// `calendarPermission`) — sans quoi chaque tap affichait « Calendrier indisponible ».
// Indisponible sur le web (`calendarAvailable` = false → l’UI masque le bouton). Renvoie un
// statut pour que l’UI affiche un retour clair.
//
// ⚠️ SDK 56 : l’API historique a été DÉPLACÉE. Importée depuis « expo-calendar » (racine), elle
// LÈVE une erreur (stub de dépréciation) → « Calendrier indisponible » à CHAQUE tap, iPhone
// compris (R-10). La vraie implémentation vit dans « expo-calendar/legacy » (même remède que
// contactsPicker.ts).
import * as Calendar from 'expo-calendar/legacy';
import { Platform } from 'react-native';
import { MINUTE_MS } from './days';
import { logError } from './diagnostics';
import { SESSION_MIN } from './slots';

// Le calendrier ne s’ouvre qu’en natif : sur le web, aucun bouton ne doit le promettre (R-73).
export const calendarAvailable = Platform.OS === 'ios' || Platform.OS === 'android';

// 'added' = enregistré (iOS le dit) ; 'opened' = fiche ouverte sans savoir si elle a été
// enregistrée (Android ne renvoie jamais le choix de l’utilisateur) → message NEUTRE ;
// 'canceled' = fiche refermée (ou permission refusée À L’INSTANT) par l’utilisateur ;
// 'denied' = iOS < 17, permission DÉJÀ refusée : iOS ne réaffiche plus jamais la demande, chaque tap
// serait muet → l’UI dit d’autoriser l’accès dans Réglages ; 'unavailable' = web ou échec.
export type CalendarResult = 'added' | 'opened' | 'canceled' | 'denied' | 'unavailable';

export async function addReservationToCalendar(input: {
  clubName: string;
  startsAt: number;
  court: string;
  area?: string;
  // Durée RÉELLE du créneau réservé (1h ou 1h30, créneaux modulables 68). Défaut 1h30 pour les
  // appelants historiques — l'événement agenda doit refléter la vraie durée (un 1h ≠ un bloc 1h30).
  durationMin?: number;
}): Promise<CalendarResult> {
  if (!calendarAvailable) return 'unavailable';
  try {
    // iOS < 17 : permission préalable (cf. en-tête). Refus DÉJÀ acté (la fenêtre système ne
    // reviendra pas) → 'denied' ; refus tapé à l’instant dans la fenêtre → 'canceled' (silence).
    if (Platform.OS === 'ios' && Number.parseInt(String(Platform.Version), 10) < 17) {
      const current = await Calendar.getCalendarPermissionsAsync();
      if (!current.granted && !current.canAskAgain) return 'denied';
      if (!current.granted && !(await Calendar.requestCalendarPermissionsAsync()).granted) return 'canceled';
    }
    const res = await Calendar.createEventInCalendarAsync({
      title: `Padel · ${input.clubName}`,
      startDate: new Date(input.startsAt),
      endDate: new Date(input.startsAt + (input.durationMin ?? SESSION_MIN) * MINUTE_MS),
      // Les créneaux sont exprimés à l’heure d’Abidjan (Côte d’Ivoire = UTC+0). On ancre
      // l’événement sur ce fuseau pour qu’il s’affiche à la bonne heure même sur un appareil
      // réglé sur un autre fuseau (voyage / testeur hors Abidjan).
      timeZone: 'Africa/Abidjan',
      location: input.area ? `${input.clubName} — ${input.area}` : input.clubName,
      notes: `Terrain : ${input.court}. Réservé via PadelConnect (heure d’Abidjan).`,
      alarms: [{ relativeOffset: -120 }], // rappel 2h avant (pré-rempli, modifiable dans la fiche)
    });
    // Android renvoie TOUJOURS « done » (le calendrier système s’est ouvert pré-rempli, l’OS ne
    // dit pas si l’événement a été enregistré) → 'opened', message neutre. iOS distingue
    // « saved » de « canceled » / « done » (fiche simplement refermée).
    if (Platform.OS === 'android') return 'opened';
    return res.action === 'saved' ? 'added' : 'canceled';
  } catch (e) {
    logError(e, 'calendar.addReservation');
    return 'unavailable';
  }
}
