// Sélection d'un contact du téléphone pour ajouter un ami plus vite (au lieu de taper le numéro).
// iOS/Android uniquement, via le sélecteur SYSTÈME (expo-contacts) : on ne lit jamais tout le
// carnet, l'utilisateur choisit UN contact et on ne récupère que son nom + son numéro.

import * as Contacts from 'expo-contacts';
import { Platform } from 'react-native';

export type PickedContact = { name: string; phone: string };

// Forme minimale d'un contact renvoyé par le sélecteur (on ne lit que nom + numéros).
type RawContact = { name?: string | null; phoneNumbers?: { number?: string | null }[] | null };

export const contactsSupported = Platform.OS === 'ios' || Platform.OS === 'android';

// Ouvre le sélecteur de contacts natif. Renvoie { name, phone } ou null (annulation / refus /
// contact sans numéro / plateforme non supportée). Ne lève jamais : tout échec = null.
export async function pickContact(): Promise<PickedContact | null> {
  if (!contactsSupported) return null;
  try {
    // Le sélecteur système gère lui-même l'autorisation ponctuelle sur iOS (accès limité à la
    // sélection choisie), plus respectueux de la vie privée qu'une lecture du carnet entier.
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
