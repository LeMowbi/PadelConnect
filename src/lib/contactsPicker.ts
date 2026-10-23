// Sélection d’un contact du téléphone pour ajouter un ami plus vite (au lieu de taper le numéro).
// iOS/Android uniquement, via le sélecteur SYSTÈME : on ne lit jamais tout le carnet,
// l’utilisateur choisit UN contact et on ne récupère que son nom + son numéro.
//
// ⚠️ SDK 56 : `presentContactPickerAsync` a été DÉPLACÉ. Importé depuis « expo-contacts » (racine),
// il LÈVE une erreur (stub de dépréciation) → le picker ne s’ouvrait jamais (« rien ne se passe »).
// La vraie implémentation vit dans le sous-module « expo-contacts/legacy » (chemin officiel).
import * as Contacts from 'expo-contacts/legacy';
import { Platform } from 'react-native';

export type PickedContact = { name: string; phone: string };

// Forme minimale d’un contact renvoyé par le sélecteur (on ne lit que nom + numéros).
type RawContact = { name?: string | null; phoneNumbers?: { number?: string | null }[] | null };

export const contactsSupported = Platform.OS === 'ios' || Platform.OS === 'android';

// Ouvre le sélecteur de contacts natif. Renvoie { name, phone }, 'denied' (Android : accès aux
// contacts refusé → l'écran invite à l'autoriser ou à taper le numéro), ou null (annulation /
// contact sans numéro / plateforme non supportée / échec). Ne lève jamais.
export async function pickContact(): Promise<PickedContact | 'denied' | null> {
  if (!contactsSupported) return null;
  try {
    // iOS : le sélecteur système gère lui-même l’autorisation ponctuelle (accès limité à la
    // sélection choisie), plus respectueux de la vie privée qu’une lecture du carnet entier.
    // Android (R-11) : au retour du sélecteur, le module RELIT le contact choisi dans le carnet —
    // sans READ_CONTACTS accordée, cette lecture lève (plantage probable). On demande donc la
    // permission AVANT d'ouvrir le sélecteur (fenêtre système seulement si jamais accordée).
    if (Platform.OS === 'android' && !(await Contacts.requestPermissionsAsync()).granted) return 'denied';
    const picker = (Contacts as { presentContactPickerAsync?: () => Promise<RawContact | null> }).presentContactPickerAsync;
    if (typeof picker !== 'function') return null;
    const contact = await picker();
    return toPicked(contact);
  } catch {
    return null;
  }
}

function toPicked(contact: RawContact | null): PickedContact | null {
  if (!contact) return null;
  const phone = contact.phoneNumbers?.find((p) => (p.number ?? '').trim().length > 0)?.number ?? '';
  if (!phone.trim()) return null;
  return { name: (contact.name ?? '').trim(), phone: phone.trim() };
}
