// Lien de paiement Wave — module PUR (aucune dépendance React Native), testé par
// tests/waveLink.test.ts. Partagé par les deux saisies de lien de l'app : les parts d'un match
// (SharePayments, créateur de la résa) et les frais des tournois (WaveLink, opérateur).

// Normalise le lien collé AVANT l'appel serveur : '' = effacement ; schéma absent ou `http://`
// → `https://` (un « pay.wave.com/… » collé tel quel cassait « Payer par Wave » chez chaque
// payeur : Linking.openURL refuse une URL sans schéma). ALLOW-LIST de domaine — miroir EXACT de
// la garde serveur des parts (83 : `^https://(pay\.)?wave\.com/`) : ce lien est présenté à des
// INCONNUS derrière « Payer », une URL quelconque serait du phishing tout cuit.
export function normalizeWaveLink(raw: string): { link: string } | { error: string } {
  const v = raw.trim();
  if (v === '') return { link: '' }; // effacement volontaire (le serveur accepte '')
  // Schéma ET host forcés en minuscules : la garde serveur (83) est SENSIBLE à la casse — sans ça
  // un `https://Pay.Wave.com/x` passait ce miroir puis se faisait refuser au serveur (le host,
  // contrairement au chemin, est insensible à la casse côté DNS : la cible du lien ne change pas).
  const link = `https://${v.replace(/^https?:\/\//i, '')}`.replace(/^https:\/\/[^/]+/, (h) => h.toLowerCase());
  if (!/^https:\/\/(pay\.)?wave\.com\//.test(link)) return { error: 'Seuls les liens Wave (pay.wave.com) sont acceptés.' };
  if (link.length > 300) return { error: 'Lien trop long (300 caractères maximum).' };
  return { link };
}
