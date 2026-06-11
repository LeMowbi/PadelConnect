// Jours sélectionnables. IMPORTANT : on sépare l'AFFICHAGE (label, qui change selon « aujourd'hui »)
// de l'IDENTITÉ stable du jour (key = AAAA-MM-JJ). Toute la logique (disponibilités, anti
// double-réservation, blocage compétition) se base sur `key` — jamais sur le libellé — pour
// rester correcte d'un jour à l'autre.

const DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

export type DayOption = { label: string; value: number; key: string };

export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function nextDays(n: number): DayOption[] {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    d.setHours(0, 0, 0, 0);
    const label = i === 0 ? "Aujourd'hui" : i === 1 ? 'Demain' : `${DAYS[d.getDay()]} ${d.getDate()}`;
    return { label, value: d.getTime(), key: dayKey(d) };
  });
}

// Horodatage réel d'un créneau « HH:MM » pour un jour donné (minuit du jour).
export function slotTimestamp(dayValue: number, slot: string): number {
  const [h, m] = slot.split(':').map(Number);
  return dayValue + h * 3600000 + m * 60000;
}

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const DAYS_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

// Libellé ABSOLU d'un jour à partir de sa clé AAAA-MM-JJ : « Lun 8 juin ».
// (Jamais relatif — pour les documents de facturation.)
export function dateKeyLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${DAYS_SHORT[date.getDay()]} ${d} ${MONTHS[m - 1]}`;
}

// ——— Semaine calendaire (lundi → dimanche) — base de la facturation hebdomadaire ———

// Clé stable d'une semaine = la date de son LUNDI (AAAA-MM-JJ).
export function weekKeyOf(ts: number): string {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7; // lundi = 0
  d.setDate(d.getDate() - dow);
  return dayKey(d);
}

function weekStart(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Libellé lisible : « du 8 au 14 juin » (ou « du 29 juin au 5 juil. » à cheval).
export function weekLabel(key: string): string {
  const start = weekStart(key);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  if (start.getMonth() === end.getMonth()) return `du ${start.getDate()} au ${end.getDate()} ${MONTHS[end.getMonth()]}`;
  return `du ${start.getDate()} ${MONTHS[start.getMonth()]} au ${end.getDate()} ${MONTHS[end.getMonth()]}`;
}

// Semaine précédente / suivante.
export function addWeeks(key: string, n: number): string {
  const d = weekStart(key);
  d.setDate(d.getDate() + 7 * n);
  return dayKey(d);
}
