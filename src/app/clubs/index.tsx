import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { ClubCard } from '@/components/ClubCard';
import { Screen } from '@/components/Screen';
import { EmptyState, Txt } from '@/components/ui';
import { clubsByName } from '@/data/clubs';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing } from '@/theme';

const FILTERS = ['Tous', 'Favoris', 'Couvert', 'Extérieur', 'Mixte'];

export default function ClubsScreen() {
  const { state } = useApp();
  const [filter, setFilter] = useState('Tous');

  const list = useMemo(() => {
    let base = clubsByName;
    if (filter === 'Favoris') base = clubsByName.filter((c) => state.favoriteClubIds.includes(c.id));
    else if (filter === 'Couvert' || filter === 'Extérieur' || filter === 'Mixte') base = clubsByName.filter((c) => c.type === filter);
    const boosted = state.boostedClubIds;
    // Clubs sponsorisés d'abord (signalés par un badge), le reste en ordre alphabétique.
    return [...base].sort((a, b) => Number(boosted.includes(b.id)) - Number(boosted.includes(a.id)));
  }, [filter, state.favoriteClubIds, state.boostedClubIds]);

  return (
    <Screen back title="Clubs" subtitle={`${clubsByName.length} clubs de padel à Abidjan`}>
      <Pressable
        style={styles.mapBtn}
        onPress={() => Linking.openURL('https://www.google.com/maps/search/?api=1&query=padel+Abidjan')}
      >
        <Ionicons name="map" size={20} color={colors.gold} />
        <View style={{ flex: 1 }}>
          <Txt variant="h3">Voir les terrains sur la carte</Txt>
          <Txt variant="muted">Ouvre Google Maps autour d’Abidjan</Txt>
        </View>
        <Ionicons name="open-outline" size={18} color={colors.textMuted} />
      </Pressable>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.md }}
      >
        {FILTERS.map((f) => (
          <Chip key={f} label={f} active={f === filter} onPress={() => setFilter(f)} size="lg" />
        ))}
      </ScrollView>

      {list.length === 0 ? (
        <EmptyState icon="heart-outline" title="Aucun favori" text="Touche le cœur sur un club pour l’ajouter ici." />
      ) : (
        list.map((c) => <ClubCard key={c.id} club={c} />)
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  mapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.sm,
  },
});
