// Notifications PUSH (à distance) : on enregistre le jeton Expo de l’appareil sur le profil
// pour que le serveur puisse notifier ce compte (club prévenu d’une réservation, ami qui
// accepte une invitation…). L’envoi se fait côté serveur (Edge Function, cf. docs/PUSH-SETUP.md).
// Web / simulateur / permission refusée → no-op silencieux (l’app marche sans push).
//
// Ce fichier porte aussi l’UNIQUE point de DEMANDE de la permission (requestPushPermission, E1) :
// la fenêtre système ne s’ouvre plus jamais à froid (connexion, retour au premier plan) — un refus
// iOS est définitif (seuls les Réglages le rouvrent) et prive de TOUTES les notifications.

import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

// Demande la permission — SEUL endroit de l’app qui ouvre la fenêtre système, et uniquement sur un
// geste explicite : « Activer les notifications » (écran Bienvenue, carte Notifications du profil),
// interrupteur « Rappels de match », « Me rappeler » sur un événement de l’agenda. Idempotent :
// déjà accordée → true sans rien ouvrir ; refusée définitivement (canAskAgain=false) → false sans
// rien ouvrir (l’écran mène aux Réglages) ; web → false. Ne rejette jamais.
export async function requestPushPermission(): Promise<boolean> {
  if (!isNative) return false;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (current.canAskAgain === false) return false;
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

// MUET (E1) : enregistre le jeton SEULEMENT si la permission est DÉJÀ accordée — appelé à froid à
// chaque session et à chaque retour au premier plan, il ne demande plus rien. Après un accord via
// requestPushPermission, l’appelant (usePushPermission) enregistre le jeton sans attendre.
export async function registerPushToken(userId: string): Promise<void> {
  if (!isNative) return;
  try {
    if (!(await Notifications.getPermissionsAsync()).granted) return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    if (!token) return;
    // Un jeton = UN APPAREIL : la RPC (53) l'enregistre pour ce compte ET le retire de tout
    // autre profil — après une bascule de compte sur le même téléphone, l'ancien compte ne
    // reçoit plus les push de cet appareil. Repli direct si la 53 n'est pas encore appliquée.
    const { error } = await supabase.rpc('register_push_token', { p_token: token });
    if (error) await supabase.from('profiles').update({ expo_push_token: token }).eq('id', userId);
  } catch {
    // pas de push (simulateur, permission refusée, réseau) — sans impact sur le reste de l’app
  }
}
