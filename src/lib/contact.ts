import { Alert, Linking } from 'react-native';

// Lance l'appel téléphonique natif (on retire les espaces du numéro).
export function callNumber(phone: string): void {
  Linking.openURL(`tel:${phone.replace(/\s/g, '')}`).catch(() =>
    Alert.alert('Appel impossible', `Impossible de lancer l'appel. Numéro : ${phone}`),
  );
}

// Ouvre une conversation WhatsApp avec ce numéro (canal n°1 en Côte d'Ivoire).
export function openWhatsApp(phone: string, message?: string): void {
  const digits = phone.replace(/\D/g, '');
  const text = message ? `?text=${encodeURIComponent(message)}` : '';
  Linking.openURL(`https://wa.me/${digits}${text}`).catch(() =>
    Alert.alert('WhatsApp introuvable', `Impossible d'ouvrir WhatsApp. Numéro : ${phone}`),
  );
}
