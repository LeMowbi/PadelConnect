// Capture d'une vue React en image PNG (react-native-view-shot) puis partage système
// (expo-sharing) — WhatsApp, Instagram, etc. Utilisé pour la carte de résultat partageable.
// Web : la capture native n'existe pas → 'unavailable' (l'appelant masque le bouton sur web).

import { Platform, type View } from 'react-native';

export type ShareImageResult = 'shared' | 'unavailable' | 'error';

export async function shareViewAsImage(ref: React.RefObject<View | null>): Promise<ShareImageResult> {
  if (Platform.OS === 'web' || !ref.current) return 'unavailable';
  try {
    // Imports dynamiques : modules natifs, jamais chargés côté web (garde ci-dessus).
    const { captureRef } = await import('react-native-view-shot');
    const Sharing = await import('expo-sharing');
    const uri = await captureRef(ref, { format: 'png', quality: 1 });
    if (!(await Sharing.isAvailableAsync())) return 'unavailable';
    await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Partager le résultat' });
    return 'shared';
  } catch {
    return 'error';
  }
}
