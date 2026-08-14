import { useState } from 'react';
import { Platform, Pressable, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Txt } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { colors, spacing } from '@/theme';

// Pull-to-refresh standard (glisser vers le bas) : recharge la session serveur — mes
// réservations, la disponibilité, les clubs et leur config. Factorisé pour que chaque écran
// scrollable l’ajoute en une ligne : `const { refreshControl } = usePullToRefresh();`.
// `extra` permet de recharger en plus une donnée propre à l’écran (ex. les avis d’un club).
export function usePullToRefresh(extra?: () => Promise<void> | void) {
  const { refreshSession } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refreshSession(), Promise.resolve(extra?.())]);
    } catch {
      /* rafraîchissement best-effort : un échec (réseau, extra de l'écran) ne doit pas remonter en
         rejet non géré — le spinner s'arrête quand même via le finally. */
    } finally {
      setRefreshing(false);
    }
  };
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
