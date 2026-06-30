// Retours haptiques (vibration légère) sur les moments clés — pour un ressenti « premium ».
// No-op sur le web et silencieux si l'appareil ne supporte pas (jamais d'erreur visible).

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

// Succès franc (réservation confirmée, invitation acceptée, avis publié…).
export function hapticSuccess(): void {
  if (isNative) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

// Avertissement (créneau déjà pris, action refusée…).
export function hapticWarning(): void {
  if (isNative) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}

// Tap léger (sélection importante, validation discrète).
export function hapticLight(): void {
  if (isNative) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}
