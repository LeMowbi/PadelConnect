// Notifications PUSH (à distance) : on enregistre le jeton Expo de l'appareil sur le profil
// pour que le serveur puisse notifier ce compte (club prévenu d'une réservation, ami qui
// accepte une invitation…). L'envoi se fait côté serveur (Edge Function, cf. docs/PUSH-SETUP.md).
// Web / simulateur / permission refusée → no-op silencieux (l'app marche sans push).

import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

export async function registerPushToken(userId: string): Promise<void> {
  if (!isNative) return;
  try {
    const perm = await Notifications.getPermissionsAsync();
    let granted = perm.granted;
    if (!granted && perm.canAskAgain) granted = (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    if (token) await supabase.from('profiles').update({ expo_push_token: token }).eq('id', userId);
  } catch {
    // pas de push (simulateur, permission refusée, réseau) — sans impact sur le reste de l'app
  }
}
