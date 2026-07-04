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

// Grille AFFICHÉE dans l'Espace Club à partir de la config stockée : la config fait FOI.
// On n'unionne PLUS buildSlots ici — l'union ressuscitait les horaires retirés (le scénario
// « ajouter 10:00 après avoir retiré 09:30 » redevenait impossible) et créait des chips
// fantômes à moins de 90 min d'un créneau réel, rouvrables → même terrain vendable deux fois.
// Une config héritée « ouverts seuls » reste correcte : ses horaires s'affichent tous ouverts,
// et un ancien créneau absent se ré-ajoute via « Ajouter un horaire ».
export function deriveGrid(stored: string[]): string[] {
  return [...new Set(stored.map(slotTime))].sort();
}

// ── Grille LIBRE (brique 2 des créneaux modulables) ─────────────────────────────
// Le gérant peut ajouter n'importe quel horaire à sa grille (ex. 10:00 entre 8:00 et 11:30
// impossible, mais 10:00 après avoir retiré 9:30 oui). Fonction PURE : valide qu'un horaire
// peut rejoindre la grille — format correct, session entière avant minuit, pas avant 05:00,
// pas déjà présent, et à AU MOINS une session (90 min) de tout créneau existant (ouvert OU
// fermé) : deux sessions qui se chevauchent rendraient le même terrain vendable deux fois.
export function canAddSlot(grid: string[], time: string): { ok: true } | { ok: false; error: string } {
  const t = slotToMinutes(time);
  if (t === null) return { ok: false, error: 'Heure invalide (format HH:MM, ex. 10:00).' };
  if (t < 5 * 60) return { ok: false, error: 'Pas de créneau avant 05:00.' };
  if (t + SESSION_MIN > 24 * 60) return { ok: false, error: 'La session (1h30) doit finir au plus tard à minuit.' };
  for (const entry of grid) {
    const other = slotToMinutes(slotTime(entry));
    if (other === null) continue;
    if (other === t) return { ok: false, error: `Le créneau ${slotTime(entry)} existe déjà.` };
    if (Math.abs(other - t) < SESSION_MIN) {
      return { ok: false, error: `Trop proche de ${slotTime(entry)} — deux sessions de 1h30 se chevaucheraient.` };
    }
  }
  return { ok: true };
}
