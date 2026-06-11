// Date de naissance → âge + signe astrologique avec un petit message padel.
// La date s'écrit JJ/MM/AAAA (saisie simple, sans calendrier).

export type Zodiac = { name: string; emoji: string; message: string };

const SIGNS: { until: [number, number]; sign: Zodiac }[] = [
  { until: [1, 19], sign: { name: 'Capricorne', emoji: '🐐', message: 'Discipliné — le lob parfait se travaille.' } },
  { until: [2, 18], sign: { name: 'Verseau', emoji: '🏺', message: 'Imprévisible — tes adversaires ne verront rien venir.' } },
  { until: [3, 20], sign: { name: 'Poissons', emoji: '🐟', message: 'Instinctif — tu sens les balles avant tout le monde.' } },
  { until: [4, 19], sign: { name: 'Bélier', emoji: '🐏', message: "Fonceur — la bandeja n'a qu'à bien se tenir." } },
  { until: [5, 20], sign: { name: 'Taureau', emoji: '🐂', message: 'Solide au filet — rien ne passe.' } },
  { until: [6, 20], sign: { name: 'Gémeaux', emoji: '👯', message: 'Le double, c\'est ton élément naturel.' } },
  { until: [7, 22], sign: { name: 'Cancer', emoji: '🦀', message: 'Joueur d\'équipe — ton partenaire a de la chance.' } },
  { until: [8, 22], sign: { name: 'Lion', emoji: '🦁', message: 'Né pour briller au centre du court.' } },
  { until: [9, 22], sign: { name: 'Vierge', emoji: '🌾', message: 'Précis — chaque vitre est calculée.' } },
  { until: [10, 22], sign: { name: 'Balance', emoji: '⚖️', message: 'Élégant — ton jeu est un plaisir à regarder.' } },
  { until: [11, 21], sign: { name: 'Scorpion', emoji: '🦂', message: 'Le smash qui pique — redoutable.' } },
  { until: [12, 21], sign: { name: 'Sagittaire', emoji: '🏹', message: 'Toujours partant pour un match de plus.' } },
  { until: [12, 31], sign: { name: 'Capricorne', emoji: '🐐', message: 'Discipliné — le lob parfait se travaille.' } },
];

// Masque de saisie JJ/MM/AAAA : seuls les chiffres comptent, les « / » s'insèrent
// automatiquement (0 → 0, 01 → 01/, 0101 → 01/01/, 01011999 → 01/01/1999).
// Au backspace, on n'impose pas de slash final (le chiffre s'efface naturellement).
export function maskBirthDate(next: string, prev: string): string {
  const digits = next.replace(/\D/g, '').slice(0, 8);
  const deleting = next.length < prev.length;
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    out += digits[i];
    if ((i === 1 || i === 3) && (i < digits.length - 1 || !deleting)) out += '/';
  }
  return out;
}

// « JJ/MM/AAAA » → Date, ou null si invalide.
export function parseBirthDate(s: string): Date | null {
  const m = s.trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m.map(Number);
  const date = new Date(y, mo - 1, d);
  if (date.getDate() !== d || date.getMonth() !== mo - 1) return null;
  if (y < 1920 || date.getTime() > Date.now()) return null;
  return date;
}

export function zodiacFor(date: Date): Zodiac {
  const mo = date.getMonth() + 1;
  const d = date.getDate();
  for (const { until, sign } of SIGNS) {
    if (mo < until[0] || (mo === until[0] && d <= until[1])) return sign;
  }
  return SIGNS[SIGNS.length - 1].sign;
}

// Vrai si la date de naissance tombe aujourd'hui (jour + mois).
export function isBirthdayToday(birthDate?: string): boolean {
  if (!birthDate) return false;
  const d = parseBirthDate(birthDate);
  if (!d) return false;
  const now = new Date();
  return d.getDate() === now.getDate() && d.getMonth() === now.getMonth();
}

export function ageFrom(date: Date): number {
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const beforeBirthday =
    now.getMonth() < date.getMonth() || (now.getMonth() === date.getMonth() && now.getDate() < date.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export const GENDERS = [
  { id: 'homme', label: 'Homme' },
  { id: 'femme', label: 'Femme' },
  { id: 'nd', label: 'Non défini' },
] as const;

export type Gender = (typeof GENDERS)[number]['id'];

export function genderLabel(g?: Gender): string | null {
  return GENDERS.find((x) => x.id === g)?.label ?? null;
}
