import { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { OpenMatches } from '@/components/OpenMatches';
import { Card, Txt } from '@/components/ui';
import { usePullToRefresh } from '@/lib/usePullToRefresh';
import { useApp } from '@/store/AppContext';
import { colors, spacing } from '@/theme';

// Écran DÉDIÉ aux matchs ouverts (accès rapide depuis l'accueil) : la liste complète, pas un
// aperçu. Réutilise le composant OpenMatches en mode `full` (mêmes cartes « Rejoindre », même
// convention réseau §8). Tirer pour rafraîchir relance le chargement via un jeton.
export default function MatchsOuvertsScreen() {
  const { state } = useApp();
  const [token, setToken] = useState(0);
  const { refreshControl } = usePullToRefresh(async () => setToken((n) => n + 1));

  return (
    <Screen
      back
      title="Matchs ouverts"
      subtitle="Rejoins une partie près de chez toi — le terrain se partage entre joueurs"
      refreshControl={state.serverUserId ? refreshControl : undefined}
    >
      {state.serverUserId ? (
        <OpenMatches full refreshToken={token} />
      ) : (
        <Card style={{ marginTop: spacing.lg, alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm }}>
          <View style={{ marginBottom: spacing.xs }}>
            <Ionicons name="people-outline" size={28} color={colors.textFaint} />
          </View>
          <Txt variant="h3">Connecte-toi pour jouer</Txt>
          <Txt variant="muted" style={{ textAlign: 'center' }}>
            Les matchs ouverts te permettent de rejoindre des joueurs qui cherchent du monde. Crée ton compte ou connecte-toi pour les voir
            et les rejoindre.
          </Txt>
        </Card>
      )}
    </Screen>
  );
}
