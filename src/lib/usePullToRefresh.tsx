import { useState } from 'react';
import { RefreshControl } from 'react-native';
import { useApp } from '@/store/AppContext';
import { colors } from '@/theme';

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
  return { refreshing, onRefresh, refreshControl };
}
