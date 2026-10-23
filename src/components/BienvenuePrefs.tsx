// Préférences de notification PARTAGÉES par l'écran Bienvenue (E1) et Profil → Notifications :
// un seul code pour lire l'état RÉEL de la permission push de l'appareil, la demander, et régler
// l'alerte « un match à ton niveau » (81) — les deux écrans disent donc toujours la même chose.
//
// Le drapeau « Bienvenue déjà vue » (une fois par COMPTE, sur cet appareil) vit aussi ici : il est
// lu par le routage racine (_layout) et posé par l'écran Bienvenue.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useToast } from './Toast';
import { registerPushToken, requestPushPermission } from '@/lib/push';
import { fetchMatchAlerts, setMatchAlerts } from '@/lib/social';
import { useApp } from '@/store/AppContext';

const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

// ─── Écran Bienvenue : une fois par compte ────────────────────────────────────

const WELCOME_KEY_PREFIX = 'padelco_bienvenue_vue_';

// true = déjà montrée à ce compte sur cet appareil. Stockage illisible (navigation privée,
// données effacées) → false : au pire l'écran revient une fois, jamais un plantage.
export async function hasSeenWelcome(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(WELCOME_KEY_PREFIX + userId)) === '1';
  } catch {
    return false;
  }
}

export async function markWelcomeSeen(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(WELCOME_KEY_PREFIX + userId, '1');
  } catch {
    /* stockage indisponible : sans effet sur le reste de l'app */
  }
}

// ─── Permission des notifications push (état réel de l'appareil) ──────────────

// 'granted' = accordée · 'ask' = jamais demandée (la fenêtre système peut encore s'ouvrir) ·
// 'blocked' = refusée, seuls les Réglages peuvent la rouvrir · 'unsupported' = web (aucun push).
// null = pas encore lue (ou lecture impossible) : l'interface n'affirme alors rien.
export type PushStatus = 'granted' | 'ask' | 'blocked' | 'unsupported';

async function readPushStatus(): Promise<PushStatus | null> {
  try {
    const p = await Notifications.getPermissionsAsync();
    // « Provisoire » (iOS) = livrée en silence dans le centre de notifications : accordée.
    if (p.granted || p.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return 'granted';
    return p.canAskAgain === false ? 'blocked' : 'ask';
  } catch {
    return null;
  }
}

// État relu au montage ET au retour au premier plan (l'utilisateur revient des Réglages).
// `ask()` est le SEUL geste de ces écrans qui ouvre la fenêtre système ; accordée, le jeton de
// l'appareil est aussitôt enregistré sur le compte (sinon les push n'arriveraient qu'au
// prochain retour au premier plan).
export function usePushPermission() {
  const { state } = useApp();
  const userId = state.serverUserId;
  const [status, setStatus] = useState<PushStatus | null>(isNative ? null : 'unsupported');
  const [asking, setAsking] = useState(false);
  const askingRef = useRef(false); // anti double-tap (un drapeau d'état ne suffit pas dans la même frame)

  useEffect(() => {
    if (!isNative) return;
    let alive = true;
    const read = () => {
      void readPushStatus().then((s) => alive && s !== null && setStatus(s));
    };
    read();
    const sub = AppState.addEventListener('change', (st) => st === 'active' && read());
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  const ask = async (): Promise<boolean> => {
    if (!isNative || askingRef.current) return false;
    askingRef.current = true;
    setAsking(true);
    const ok = await requestPushPermission(); // unique point de demande (E1) — ne rejette jamais
    if (ok && userId) await registerPushToken();
    const fresh = await readPushStatus();
    askingRef.current = false;
    setAsking(false);
    if (fresh !== null) setStatus(fresh);
    return ok;
  };

  return { status, asking, ask };
}

// Libellé de l'appareil pour les messages d'état (« sur cet iPhone » / « sur ce téléphone »).
export const deviceLabel = Platform.OS === 'ios' ? 'cet iPhone' : 'ce téléphone';

// ─── Alerte « un match à ton niveau » (81) ────────────────────────────────────

// Préférence SERVEUR (le ciblage — clubs suivis × fourchette de niveau — vit dans notify-club),
// donc réservée aux comptes connectés. Tri-état : null = pas encore lue (ou échec réseau) →
// interrupteur neutre et désactivé ; on ne fait jamais croire à un réglage qu'on ne connaît pas.
// Écriture HONNÊTE : le nouvel état ne s'affiche QUE si le serveur l'a accepté.
// La valeur est rangée AVEC le compte qui l'a lue : après une bascule de compte, l'ancienne
// réponse n'est plus montrée (null → relecture), sans setState synchrone dans l'effet.
export function useMatchAlerts() {
  const { state } = useApp();
  const toast = useToast();
  const userId = state.serverUserId;
  const [read, setRead] = useState<{ userId: string; on: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const on = read && read.userId === userId ? read.on : null;

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void fetchMatchAlerts().then((v) => alive && v != null && setRead({ userId, on: v }));
    return () => {
      alive = false;
    };
  }, [userId]);

  const toggle = async (next: boolean) => {
    if (busyRef.current || on === null || !userId) return; // anti double-tap + état inconnu
    busyRef.current = true;
    setBusy(true);
    const ok = await setMatchAlerts(next);
    busyRef.current = false;
    setBusy(false);
    if (ok) setRead({ userId, on: next });
    else toast.show('Connexion impossible — réessaie', { icon: 'alert-circle' });
  };

  return { on, busy, toggle };
}
