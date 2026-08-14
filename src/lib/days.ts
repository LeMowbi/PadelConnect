// Jours sélectionnables. IMPORTANT : on sépare l’AFFICHAGE (label, qui change selon « aujourd’hui »)
// de l’IDENTITÉ stable du jour (key = AAAA-MM-JJ). Toute la logique (disponibilités, anti
// double-réservation, blocage compétition) se base sur `key` — jamais sur le libellé — pour
// rester correcte d’un jour à l’autre.

const DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

// Durées en millisecondes — nommées pour la lisibilité (plus de « 86400000 » en dur).
export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

export type DayOption = { label: string; value: number; key: string };

// Clé du jour EN HEURE D’ABIDJAN (UTC+0), pas dans le fuseau de l’appareil — pour rester
// cohérent avec slotTimestamp (heure des créneaux). Ainsi « aujourd’hui » est toujours le
// bon jour calendaire d’Abidjan, même si le téléphone est réglé sur un autre fuseau.
export function dayKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// `from` permet d’injecter une date de référence (tests déterministes) ; par défaut,
// maintenant. Génère n jours consécutifs SANS trou — les deux premiers portent un
// libellé amical AVEC le numéro du jour (« Aujourd’hui 12 », « Demain 13 »), les suivants
// leur nom de jour. Tout est calculé en heure d’Abidjan (midi UTC = repère stable d’affichage).
export function nextDays(n: number, from: Date = new Date()): DayOption[] {
  const base = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 12, 0, 0);
  return Array.from({ length: n }, (_, i) => {
    const ts = base + i * DAY_MS;
    const d = new Date(ts);
    const label =
      i === 0 ? `Aujourd’hui ${d.getUTCDate()}` : i === 1 ? `Demain ${d.getUTCDate()}` : `${DAYS[d.getUTCDay()]} ${d.getUTCDate()}`;
    return { label, value: ts, key: dayKey(d) };
  });
}

// Horodatage CANONIQUE d’un créneau, à partir de la clé du jour (AAAA-MM-JJ) + « HH:MM ».
// Abidjan = UTC+0 : on interprète (jour + heure) comme une heure UTC FIXE, indépendante du
// fuseau réglé sur le téléphone. Ainsi startsAt, les rappels, le passage en « jouée » et la
// facturation hebdomadaire tombent juste même si l’horloge de l’appareil est à un autre fuseau.
export function slotTimestamp(dateKey: string, slot: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [h, min] = slot.split(':').map(Number);
  return Date.UTC(y, m - 1, d, h, min);
}

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const DAYS_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

// Libellé ABSOLU d’un jour à partir de sa clé AAAA-MM-JJ : « Lun 8 juin ».
// (Jamais relatif — pour les documents de facturation.)
export function dateKeyLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return `${DAYS_SHORT[date.getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
}

// ——— Semaine calendaire (lundi → dimanche) — base de la facturation hebdomadaire ———

// Clé stable d’une semaine = la date de son LUNDI (AAAA-MM-JJ).
export function weekKeyOf(ts: number): string {
  const d = new Date(ts);
  const dow = (d.getUTCDay() + 6) % 7; // lundi = 0
  const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow, 12);
  return dayKey(new Date(monday));
}

function weekStart(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

// Libellé lisible : « du 8 au 14 juin » (ou « du 29 juin au 5 juil. » à cheval).
export function weekLabel(key: string): string {
  const start = weekStart(key);
  const end = new Date(start.getTime() + 6 * DAY_MS);
  if (start.getUTCMonth() === end.getUTCMonth()) return `du ${start.getUTCDate()} au ${end.getUTCDate()} ${MONTHS[end.getUTCMonth()]}`;
  return `du ${start.getUTCDate()} ${MONTHS[start.getUTCMonth()]} au ${end.getUTCDate()} ${MONTHS[end.getUTCMonth()]}`;
}

// Semaine précédente / suivante.
export function addWeeks(key: string, n: number): string {
  const d = weekStart(key);
  return dayKey(new Date(d.getTime() + 7 * n * DAY_MS));
}

// ——— Réservation récurrente (83) : les N mêmes jours de semaine à venir ———

// Les `weeks` prochaines occurrences du jour de semaine de `firstDateKey` (INCLUSE) : la brique
// PURE du « créneau récurrent » de l'Espace Club (le serveur reçoit la liste de dates, le client
// la calcule). weeks borné [1, 26] (6 mois — même plafond que block_recurring côté serveur).
export function recurringDates(firstDateKey: string, weeks: number): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDateKey)) return [];
  const n = Math.max(1, Math.min(26, Math.floor(weeks)));
  const [y, m, d] = firstDateKey.split('-').map(Number);
  const start = Date.UTC(y, m - 1, d, 12); // midi UTC : insensible aux bascules d'heure
  return Array.from({ length: n }, (_, i) => dayKey(new Date(start + i * 7 * DAY_MS)));
}
