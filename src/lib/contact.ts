import { Linking } from 'react-native';

// Lance l'appel téléphonique natif (on retire les espaces du numéro).
export function callNumber(phone: string): void {
  Linking.openURL(`tel:${phone.replace(/\s/g, '')}`).catch(() => {});
}

// Ouvre une conversation WhatsApp avec ce numéro (canal n°1 en Côte d'Ivoire).
export function openWhatsApp(phone: string, message?: string): void {
  const digits = phone.replace(/\D/g, '');
  const text = message ? `?text=${encodeURIComponent(message)}` : '';
  Linking.openURL(`https://wa.me/${digits}${text}`).catch(() => {});
}
