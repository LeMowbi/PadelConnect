// Normalisation du numéro (Côte d'Ivoire) — module PUR (aucun effet de bord), extrait de
// supabase.ts pour être testable directement (tests/phone.test.ts).
// Un même numéro peut être saisi de plusieurs façons : « 0707070707 »,
// « +225 07 07 07 07 07 », « 00225 0707070707 »… Sans canonicalisation, chaque
// variante crée un compte DIFFÉRENT (ou pire, deux numéros se confondent). On
// ramène tout à une forme unique « 225 + numéro local 10 chiffres ».
// Numéros mobiles ivoiriens : 10 chiffres locaux (le 0 de tête fait partie du
// numéro), indicatif pays 225. On NE retire JAMAIS le 0 local (il porte le préfixe
// opérateur 07/05/01…). On ne touche pas aux numéros étrangers (autre indicatif).
export function normalizePhone(phone: string): string {
  let d = phone.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2); // préfixe international « 00 » → retiré
  if (d.startsWith('225') && d.length === 13) return d; // déjà 225 + 10 chiffres
  if (d.length === 10) return `225${d}`; // numéro local → on préfixe l'indicatif
  return d; // tout le reste (étranger, format inhabituel) : laissé tel quel
}

// Un numéro saisi est-il exploitable ? Règle UNIQUE de l'app : au moins 8 chiffres significatifs
// (les indicatifs/espaces ne comptent pas). Centralisé ici pour ne pas re-coder « length >= 8 »
// dans chaque écran (onboarding, amis, profil, inscription club…) — un seul endroit à ajuster.
export function isValidPhone(phone: string): boolean {
  return phone.replace(/\D/g, '').length >= 8;
}

// Deux numéros désignent-ils la même personne ? On compare les 10 DERNIERS chiffres (règle
// serveur « 10 derniers chiffres », CLAUDE.md §8) ; en-dessous de 8 chiffres significatifs on
// refuse le rapprochement (numéro incomplet). Helper partagé pour la déduplication d'amis.
export function samePhone(a: string | undefined, b: string | undefined): boolean {
  const da = (a ?? '').replace(/\D/g, '').slice(-10);
  const db = (b ?? '').replace(/\D/g, '').slice(-10);
  return da.length >= 8 && da === db;
}
