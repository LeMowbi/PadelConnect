import { Linking } from 'react-native';
import { alertAsync } from './confirm';

// Ouvre une conversation WhatsApp avec ce numéro (canal n°1 en Côte d’Ivoire). alertAsync
// (≠ Alert.alert) : le message d’échec de repli s’affiche AUSSI sur le web (Espace Club navigateur).
export function openWhatsApp(phone: string, message?: string): void {
  const digits = phone.replace(/\D/g, '');
  const text = message ? `?text=${encodeURIComponent(message)}` : '';
  Linking.openURL(`https://wa.me/${digits}${text}`).catch(() =>
    alertAsync('WhatsApp introuvable', `Impossible d’ouvrir WhatsApp. Numéro : ${phone}`),
  );
}
