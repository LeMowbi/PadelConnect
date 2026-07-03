// Génération des créneaux de réservation d’un club à partir de ses heures d’ouverture.
// Le gérant choisit UNE heure d’ouverture et UNE heure de fermeture ; l’app découpe la plage
// en sessions de 1h30 (SESSION_MIN), sans chevauchement. Un créneau n’est gardé que s’il TIENT
// ENTIÈREMENT avant la fermeture (début + durée ≤ fermeture). Fonctions PURES et testables
// (aucun accès réseau/état) — chaque club a ainsi ses propres horaires, différents des autres.
//
// STOCKAGE (club_config.slots) : la grille COMPLÈTE du club, un créneau fermé étant préfixé
// « ! » (ex. '!12:30' = pause déjeuner). Les heures d’ouverture/fermeture se déduisent ainsi
// de la grille stockée — rien à mémoriser côté écran, rien ne se « réinitialise » — et un
// créneau fermé reste rouvrable. Côté serveur, '!12:30' ne matche jamais un vrai horaire
// ('12:30'), donc les gardes `= any(slots)` refusent d’office les créneaux fermés.

export const SESSION_MIN = 90; // durée d’une session (1h30), comme partout dans l’app

const CLOSED_PREFIX = '!';

// Un créneau stocké est-il marqué fermé ?
export function isClosedSlot(entry: string): boolean {
  return entry.startsWith(CLOSED_PREFIX);
}

// 'HH:MM' d’un créneau stocké, marque « fermé » retirée le cas échéant.
export function slotTime(entry: string): string {
  return isClosedSlot(entry) ? entry.slice(CLOSED_PREFIX.length) : entry;
}

// Marque un horaire comme fermé (pour le stockage).
export function closedSlot(time: string): string {
  return CLOSED_PREFIX + time;
}

// Bornes par défaut quand un club n’a pas encore d’horaires personnalisés (pré-remplissage).
export const DEFAULT_OPEN = '08:00';
export const DEFAULT_CLOSE = '23:00';

// « HH:MM » → minutes depuis minuit (24:00 = 1440). Renvoie null si le format est invalide.
export function slotToMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min !== 0)) return null;
  return h * 60 + min;
}

// minutes → « HH:MM » (borné à [00:00, 24:00]).
export function minutesToSlot(min: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(min)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Découpe [open, close[ en créneaux de sessionMin, chacun tenant entièrement avant la fermeture.
export function buildSlots(open: string, close: string, sessionMin = SESSION_MIN): string[] {
  const start = slotToMinutes(open);
  const end = slotToMinutes(close);
  if (start === null || end === null || start >= end) return [];
  const out: string[] = [];
  for (let t = start; t + sessionMin <= end; t += sessionMin) out.push(minutesToSlot(t));
  return out;
}

// Déduit l’heure d’ouverture/fermeture À PARTIR de créneaux actifs (pour pré-remplir les
// sélecteurs). Ouverture = 1er créneau ; fermeture = dernier créneau + une session.
export function inferOpenClose(slots: string[], sessionMin = SESSION_MIN): { open: string; close: string } {
  const mins = slots
    .map(slotToMinutes)
    .filter((m): m is number => m !== null)
    .sort((a, b) => a - b);
  if (mins.length === 0) return { open: DEFAULT_OPEN, close: DEFAULT_CLOSE };
  return { open: minutesToSlot(mins[0]), close: minutesToSlot(mins[mins.length - 1] + sessionMin) };
}
