import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { ClubPhoto } from './ClubPhoto';
import { RatingStars } from './RatingStars';
import { Card, Tag, Txt } from './ui';
import { clubGallery, defaultCourts, type Club } from '@/data/clubs';
import { ratingFor } from '@/data/reviews';
import { useApp } from '@/store/AppContext';
import { fcfa, initials } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';

export function ClubCard({ club, compact }: { club: Club; compact?: boolean }) {
  const router = useRouter();
  const { state, toggleFavorite } = useApp();
  const fav = state.favoriteClubIds.includes(club.id);
  const boosted = state.boostedClubIds.includes(club.id);
  const photo = clubGallery(club, state.clubPhotos[club.id] ?? [])[0];
  const courtCount = (state.clubCourts[club.id] ?? defaultCourts(club)).length;
  const { rating, count } = ratingFor(club, state.userReviews);
  const go = () => router.push(`/club/${club.id}`);

  const heart = (
    <Pressable onPress={() => toggleFavorite(club.id)} hitSlop={8} style={styles.heart}>
      <Ionicons name={fav ? 'heart' : 'heart-outline'} size={18} color={fav ? colors.danger : colors.white} />
    </Pressable>
  );

  if (compact) {
    return (
      <Card onPress={go} style={styles.compact}>
        <View>
          <ClubPhoto uri={photo} accent={club.accent} initials={initials(club.name)} height={96} rounded={radius.md} />
          {heart}
        </View>
        <Txt variant="h3" numberOfLines={1} style={{ marginTop: spacing.sm }}>
          {club.name}
        </Txt>
        <View style={styles.areaRow}>
          <Ionicons name="location-outline" size={13} color={colors.textMuted} />
          <Txt variant="muted" numberOfLines={1} style={{ flex: 1 }}>
            {club.area}
          </Txt>
        </View>
        <View style={styles.ratingRow}>
          <RatingStars value={rating} size={13} />
          <Txt variant="small" color={colors.textMuted}>
            {rating.toFixed(1)}
          </Txt>
        </View>
      </Card>
    );
  }

  return (
    <Card onPress={go} style={{ padding: spacing.sm, marginBottom: spacing.md }}>
      <View>
        <ClubPhoto uri={photo} accent={club.accent} initials={initials(club.name)} height={140} />
        {heart}
      </View>
      <View style={{ padding: spacing.sm, paddingTop: spacing.md }}>
        <View style={styles.titleRow}>
          <Txt variant="h3" numberOfLines={1} style={{ flex: 1 }}>
            {club.name}
          </Txt>
          {boosted ? <Tag label="Sponsorisé" tone="gold" icon="megaphone" /> : <Tag label={club.type} tone="neutral" />}
        </View>
        <View style={styles.areaRow}>
          <Ionicons name="location-outline" size={14} color={colors.textMuted} />
          <Txt variant="muted">
            {club.area} · {courtCount} terrain{courtCount > 1 ? 's' : ''}
          </Txt>
        </View>
        <View style={styles.footer}>
          <View style={styles.ratingRow}>
            <RatingStars value={rating} size={14} />
            <Txt variant="small" color={colors.textMuted}>
              {rating.toFixed(1)} ({count})
            </Txt>
          </View>
          <Txt variant="small" color={colors.textMuted}>
            dès {fcfa(club.priceFrom)}/h
          </Txt>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  compact: { width: 220, padding: spacing.sm },
  heart: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  areaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
});
