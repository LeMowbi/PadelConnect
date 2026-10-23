import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Txt } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { colors, spacing } from '@/theme';

// Pull-to-refresh standard (glisser vers le bas) : recharge la session serveur — mes
// réservations, la disponibilité, les clubs et leur config. Factorisé pour que chaque écran
// scrollable l’ajoute en une ligne : `const { refreshControl } = usePullToRefresh();`.
// `extra` permet de recharger en plus une donnée propre à l’écran (ex. les avis d’un club).
// `webAuto` (WEB seulement) : rafraîchissement AUTOMATIQUE toutes les `everyMs` ms tant que
// l'onglet est visible — un écran laissé ouvert sur l'ordinateur de l'accueil (Espace Club) ne
// reçoit aucun push et ne se recharge sinon qu'au changement d'onglet. `paused` le suspend
// (envoi en cours, feuille ouverte) : une relecture ne doit pas croiser une écriture du gérant.
export function usePullToRefresh(extra?: () => Promise<void> | void, webAuto?: { everyMs: number; paused: boolean }) {
  const { refreshSession } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  // Verrou « déjà en cours » : un tir automatique ne double jamais un rafraîchissement manuel
  // (ni l'inverse). Ref = verrou synchrone (deux déclenchements dans la même frame).
  const inFlightRef = useRef(false);
  const onRefresh = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setRefreshing(true);
    try {
      await Promise.all([refreshSession(), Promise.resolve(extra?.())]);
    } catch {
      /* rafraîchissement best-effort : un échec (réseau, extra de l'écran) ne doit pas remonter en
         rejet non géré — le spinner s'arrête quand même via le finally. */
    } finally {
      inFlightRef.current = false;
      setRefreshing(false);
    }
  };
  // Dernière version de onRefresh (elle capture `extra`) pour le minuteur, sans le relancer à
  // chaque rendu : mise à jour APRÈS le rendu (jamais pendant), lue au tir.
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  });
  const autoEveryMs = Platform.OS === 'web' && webAuto ? webAuto.everyMs : 0;
  const autoPaused = !!webAuto?.paused;
  useEffect(() => {
    if (!autoEveryMs || autoPaused) return;
    const id = setInterval(() => {
      // Onglet masqué : rien (le retour sur l'onglet relance déjà une relecture via AppState).
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void onRefreshRef.current();
    }, autoEveryMs);
    return () => clearInterval(id);
  }, [autoEveryMs, autoPaused]);
  const refreshControl = (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.signature} colors={[colors.signature]} />
  );
  // Sur le WEB, RefreshControl de react-native-web est un stub inerte (aucun geste, onRefresh
  // ignoré) : le gérant qui laisse l'Espace Club ouvert dans un onglet n'a AUCUN moyen visible
  // de recharger (le resync ne part qu'au changement d'onglet). Ce bouton « Actualiser » (à poser
  // en `headerRight` du Screen) rend le rafraîchissement possible au clic — null en natif.
  const webRefreshButton =
    Platform.OS === 'web' ? (
      <Pressable
        onPress={() => void onRefresh()}
        disabled={refreshing}
        accessibilityRole="button"
        accessibilityLabel="Actualiser les données"
        hitSlop={8}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: spacing.xs, opacity: refreshing ? 0.5 : 1 }}
      >
        <Ionicons name="refresh" size={16} color={colors.signature} />
        <Txt variant="small" color={colors.signature} style={{ fontWeight: '600' }}>
          {refreshing ? 'Actualisation…' : 'Actualiser'}
        </Txt>
      </Pressable>
    ) : null;
  return { refreshing, onRefresh, refreshControl, webRefreshButton };
}
