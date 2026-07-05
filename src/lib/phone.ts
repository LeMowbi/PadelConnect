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
