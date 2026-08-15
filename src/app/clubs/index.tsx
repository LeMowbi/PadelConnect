import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { ClubCard } from '@/components/ClubCard';
import { Reveal, staggerDelay } from '@/components/Reveal';
import { Screen } from '@/components/Screen';
import { EmptyState, Txt } from '@/components/ui';
import { activeClubs } from '@/data/clubs';
import type { Club } from '@/data/clubs';
import { usePullToRefresh } from '@/lib/usePullToRefresh';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing } from '@/theme';

// Types de club (valeurs du modèle Club — jamais une liste inventée).
const TYPES: Club['type'][] = ['Couvert', 'Extérieur', 'Mixte'];

// Recherche tolérante : sans accents ni majuscules.
function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Ajoute / retire une valeur d’une sélection multiple (filtres combinables).
function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export default function ClubsScreen() {
  const { state } = useApp();
  const { refreshControl } = usePullToRefresh();
  // Filtres COMBINABLES (11) : favoris, types de club, équipements — état local d’écran.
  const [favOnly, setFavOnly] = useState(false);
  const [types, setTypes] = useState<string[]>([]);
  const [amenities, setAmenities] = useState<string[]>([]);
  const [query, setQuery] = useState('');

  // state.clubStatus est une dépendance RÉELLE (bien qu’indirecte) : activeClubs lit le registre
  // module clubStatusMap, synchronisé depuis state.clubStatus. Sans cette dépendance, un changement
  // de statut opérateur (club masqué / « Bientôt ») ne rafraîchit pas la liste. Le linter ne voit
  // pas la dépendance indirecte → on la conserve volontairement.
  const all = useMemo(
    () => activeClubs(state.customClubs, state.clubInfo),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.customClubs, state.clubInfo, state.clubStatus],
  );

  // Équipements proposés en filtre = ceux RÉELLEMENT présents dans les données (seeds + clubs
  // serveur). Jamais une liste en dur : elle promettrait un équipement qu’aucun club n’a.
  // Les plus répandus d’abord (une puce utile en tête), puis alphabétique.
  const amenityOptions = useMemo(() => {
    const byKey = new Map<string, { label: string; count: number }>();
    for (const c of all) {
      const seen = new Set<string>(); // un club ne compte qu’une fois par équipement
      for (const raw of c.amenities) {
        const label = raw.trim();
        const key = norm(label);
        if (!label || seen.has(key)) continue;
        seen.add(key);
        const cur = byKey.get(key);
        if (cur) cur.count += 1;
        else byKey.set(key, { label, count: 1 });
      }
    }
    return [...byKey.entries()]
      .sort((a, b) => b[1].count - a[1].count || a[1].label.localeCompare(b[1].label))
      .map(([key, v]) => ({ key, label: v.label }));
  }, [all]);

  const list = useMemo(() => {
    let base = all;
    const q = norm(query.trim());
    if (q) base = base.filter((c) => norm(`${c.name} ${c.area}`).includes(q));
    if (favOnly) base = base.filter((c) => state.favoriteClubIds.includes(c.id));
    if (types.length) base = base.filter((c) => types.includes(c.type));
    // Équipements : le club doit porter TOUS ceux cochés (« Vestiaires ET Parking »).
    if (amenities.length)
      base = base.filter((c) => {
        const keys = c.amenities.map(norm);
        return amenities.every((a) => keys.includes(a));
      });
    const boosted = state.boostedClubIds;
    // Clubs sponsorisés d’abord (signalés par un badge), le reste en ordre alphabétique.
    return [...base].sort((a, b) => Number(boosted.includes(b.id)) - Number(boosted.includes(a.id)));
  }, [all, query, favOnly, types, amenities, state.favoriteClubIds, state.boostedClubIds]);

  const filtering = favOnly || types.length > 0 || amenities.length > 0 || query.trim().length > 0;
  const reset = () => {
    setQuery('');
    setFavOnly(false);
    setTypes([]);
    setAmenities([]);
  };
  // Clé d’animation : l’entrée des cartes se rejoue à chaque changement de critère.
  const revealKey = `${favOnly ? 'f' : ''}${types.join('')}${amenities.join('')}`;

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
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          maxLength={60}
          accessibilityLabel="Rechercher un club ou un quartier"
          style={styles.searchInput}
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery('')} hitSlop={14} accessibilityRole="button" accessibilityLabel="Effacer la recherche">
            <Ionicons name="close-circle" size={17} color={colors.textFaint} />
          </Pressable>
        ) : null}
      </View>

      <Pressable
        style={styles.mapBtn}
        onPress={() => Linking.openURL('https://www.google.com/maps/search/?api=1&query=padel+Abidjan')}
        accessibilityRole="button"
        accessibilityLabel="Voir les terrains sur la carte — ouvre Google Maps"
      >
        <Ionicons name="map" size={20} color={colors.signature} />
        <View style={{ flex: 1 }}>
          <Txt variant="h3">Voir les terrains sur la carte</Txt>
          <Txt variant="muted">Ouvre Google Maps autour d’Abidjan</Txt>
        </View>
        <Ionicons name="open-outline" size={18} color={colors.textMuted} />
      </Pressable>

      {/* Favoris + type de club (cumulables : « Favoris » ET « Couvert ») */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        <Chip
          label="Favoris"
          icon="heart"
          active={favOnly}
          onPress={() => setFavOnly((v) => !v)}
          size="lg"
          accessibilityLabel="Filtrer sur mes clubs favoris"
        />
        {TYPES.map((t) => (
          <Chip key={t} label={t} active={types.includes(t)} onPress={() => setTypes((cur) => toggle(cur, t))} size="lg" />
        ))}
      </ScrollView>

      {/* Équipements — puces dérivées des données réelles (masquées si aucun club n’en déclare) */}
      {amenityOptions.length > 0 ? (
        <View>
          <Txt variant="label">Équipements</Txt>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {amenityOptions.map((a) => (
              <Chip
                key={a.key}
                label={a.label}
                active={amenities.includes(a.key)}
                onPress={() => setAmenities((cur) => toggle(cur, a.key))}
                accessibilityLabel={`Équipement ${a.label}`}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Compteur de résultats + retour à la liste complète, dès qu’un critère est actif */}
      {filtering ? (
        <View style={styles.countRow}>
          <Txt variant="small" color={colors.textMuted} style={{ flex: 1 }}>
            {list.length} club{list.length > 1 ? 's' : ''} sur {all.length}
          </Txt>
          <Pressable onPress={reset} hitSlop={10} accessibilityRole="button" accessibilityLabel="Réinitialiser les filtres">
            <Txt variant="small" color={colors.signature} style={{ fontWeight: '700' }}>
              Réinitialiser
            </Txt>
          </Pressable>
        </View>
      ) : null}

      {list.length === 0 ? (
        favOnly && !query.trim() && types.length === 0 && amenities.length === 0 ? (
          <EmptyState icon="heart-outline" title="Aucun favori" text="Touche le cœur sur un club pour l’ajouter ici." />
        ) : (
          <EmptyState
            icon="funnel-outline"
            title="Aucun club ne correspond"
            text="Aucun club ne réunit tous ces critères pour l’instant — enlève-en un ou deux pour élargir la recherche."
            actionLabel="Réinitialiser les filtres"
            onAction={reset}
          />
        )
      ) : (
        list.map((c, i) => (
          // key incluant les filtres → l’entrée se rejoue proprement à chaque changement.
          <Reveal key={`${revealKey}-${c.id}`} delay={staggerDelay(i)}>
            <ClubCard club={c} />
          </Reveal>
        ))
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
  chipRow: { gap: spacing.sm, paddingVertical: spacing.sm },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs, marginBottom: spacing.sm },
});
