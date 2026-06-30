import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { ClubCard } from '@/components/ClubCard';
import { Screen } from '@/components/Screen';
import { EmptyState, Txt } from '@/components/ui';
import { activeClubs } from '@/data/clubs';
import { usePullToRefresh } from '@/lib/usePullToRefresh';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing } from '@/theme';

const FILTERS = ['Tous', 'Favoris', 'Couvert', 'Extérieur', 'Mixte'];

// Recherche tolérante : sans accents ni majuscules.
function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export default function ClubsScreen() {
  const { state } = useApp();
  const { refreshControl } = usePullToRefresh();
  const [filter, setFilter] = useState('Tous');
  const [query, setQuery] = useState('');

  const all = useMemo(() => activeClubs(state.customClubs, state.clubInfo), [state.customClubs, state.clubInfo]);
  const list = useMemo(() => {
    let base = all;
    const q = norm(query.trim());
    if (q) base = base.filter((c) => norm(`${c.name} ${c.area}`).includes(q));
    if (filter === 'Favoris') base = base.filter((c) => state.favoriteClubIds.includes(c.id));
    else if (filter === 'Couvert' || filter === 'Extérieur' || filter === 'Mixte') base = base.filter((c) => c.type === filter);
    const boosted = state.boostedClubIds;
    // Clubs sponsorisés d'abord (signalés par un badge), le reste en ordre alphabétique.
    return [...base].sort((a, b) => Number(boosted.includes(b.id)) - Number(boosted.includes(a.id)));
  }, [all, query, filter, state.favoriteClubIds, state.boostedClubIds]);

  return (
    <Screen
      back
      title="Clubs"
      subtitle={`${all.length} clubs de padel à Abidjan`}
      refreshControl={state.serverUserId ? refreshControl : undefined}
    >
      {/* Recherche par nom ou quartier */}
      <View style={styles.search}>
        <Ionicons name="search" size={17} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Rechercher un club ou un quartier…"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          style={styles.searchInput}
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={17} color={colors.textFaint} />
          </Pressable>
        ) : null}
      </View>

      <Pressable style={styles.mapBtn} onPress={() => Linking.openURL('https://www.google.com/maps/search/?api=1&query=padel+Abidjan')}>
        <Ionicons name="map" size={20} color={colors.blue} />
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
        query.trim() ? (
          <EmptyState icon="search-outline" title="Aucun résultat" text={`Aucun club ne correspond à « ${query.trim()} ».`} />
        ) : filter === 'Favoris' ? (
          <EmptyState icon="heart-outline" title="Aucun favori" text="Touche le cœur sur un club pour l’ajouter ici." />
        ) : (
          <EmptyState icon="business-outline" title="Aucun club" text={`Aucun club « ${filter} » pour l’instant — change de filtre.`} />
        )
      ) : (
        list.map((c) => <ClubCard key={c.id} club={c} />)
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: spacing.md },
  mapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
});
