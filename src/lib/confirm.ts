// Boîtes de dialogue CROSS-PLATEFORME. ⚠️ `Alert.alert` de react-native est un NO-OP sous
// react-native-web : or l'Espace Club / opérateur tourne AUSSI sur le web (club.padelconnectci.com).
// Sans ces helpers, un gérant sur ordinateur tapait « Pas venu » / « Prévenir par WhatsApp ? » sans
// aucun effet (le dialogue ne s'affichait jamais → l'action n'était jamais confirmée).
// Sur le WEB on retombe sur les dialogues natifs du navigateur (window.confirm / window.alert) ;
// en NATIF on garde Alert.alert. API unique (Promise) pour les deux.

import { Alert, Platform } from 'react-native';

export function confirmAsync(
  title: string,
  message: string,
  opts?: { confirmLabel?: string; cancelLabel?: string; destructive?: boolean },
): Promise<boolean> {
  const confirmLabel = opts?.confirmLabel ?? 'Confirmer';
  const cancelLabel = opts?.cancelLabel ?? 'Annuler';
  if (Platform.OS === 'web') {
    const ok = typeof window !== 'undefined' && typeof window.confirm === 'function' ? window.confirm(`${title}\n\n${message}`) : false;
    return Promise.resolve(ok);
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: opts?.destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

// Alerte simple (information / erreur) — window.alert sur le web, Alert.alert en natif.
export function alertAsync(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && typeof window.alert === 'function') window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}
