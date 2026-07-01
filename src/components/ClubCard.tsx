import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { ClubPhoto } from './ClubPhoto';
import { PopIn } from './PopIn';
import { Card, Tag, Txt } from './ui';
import { clubGallery, defaultCourts, type Club } from '@/data/clubs';
import { useApp } from '@/store/AppContext';
import { hapticLight } from '@/lib/haptics';
import { minPrice } from '@/lib/pricing';
import { fcfa, initials } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';

export function ClubCard({ club, compact }: { club: Club; compact?: boolean }) {
  const router = useRouter();
  const { state, toggleFavorite } = useApp();
  const fav = state.favoriteClubIds.includes(club.id);
  const boosted = state.boostedClubIds.includes(club.id);
  const photo = clubGallery(club, state.clubPhotos[club.id] ?? [])[0];
  const courtCount = (state.clubCourts[club.id] ?? defaultCourts(club)).length;
  // Les avis sont VÉRIFIÉS et serveur (affichés sur la fiche club). Tant qu'un club n'en a pas,
  // la carte affiche « Nouveau » — jamais de note fabriquée (cohérent avec la fiche).
  const comingSoon = !!club.comingSoon; // club pré-chargé, pas encore réservable
  const partner = !!club.partner && !comingSoon; // club fondateur (partenaire officiel)
  const go = () => router.push(`/club/${club.id}`);

  // Petit « pop » élastique du cœur au (dé)favori — micro-interaction satisfaisante.
  const heartScale = useRef(new Animated.Value(1)).current;
  const onHeart = () => {
    hapticLight();
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1.35, useNativeDriver: true, speed: 50, bounciness: 14 }),
      Animated.spring(heartScale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 10 }),
    ]).start();
    toggleFavorite(club.id);
  };

  const heart = (
    <Pressable
      onPress={onHeart}
      hitSlop={8}
      style={styles.heart}
      accessibilityRole="button"
      accessibilityLabel={fav ? `Retirer ${club.name} des favoris` : `Ajouter ${club.name} aux favoris`}
    >
      <Animated.View style={{ transform: [{ scale: heartScale }] }}>
        <Ionicons name={fav ? 'heart' : 'heart-outline'} size={18} color={fav ? colors.danger : colors.white} />
      </Animated.View>
    </Pressable>
  );

  if (compact) {
    return (
      <Card onPress={go} style={styles.compact}>
        <View>
          <ClubPhoto
            uri={photo}
            accent={club.accent}
            initials={initials(club.name)}
            height={150}
            rounded={radius.md}
            overlay
            caption={club.name}
            subtitle={club.area}
          />
          {heart}
          {comingSoon ? (
            <View style={styles.boostBadge}>
              <PopIn delay={150}>
                <Tag label="Bientôt" tone="purple" icon="time" />
              </PopIn>
            </View>
          ) : boosted ? (
            <View style={styles.boostBadge}>
              <PopIn delay={150}>
                <Tag label="Sponsorisé" tone="amber" icon="megaphone" />
              </PopIn>
            </View>
          ) : partner ? (
            <View style={styles.boostBadge}>
              <PopIn delay={150}>
                <Tag label="Partenaire" tone="green" icon="shield-checkmark" />
              </PopIn>
            </View>
          ) : null}
        </View>
        <View style={styles.compactFooter}>
          {comingSoon ? <Tag label="Pas encore réservable" tone="neutral" /> : <Tag label="Nouveau" tone="coral" icon="sparkles" />}
          {/* Prix tronqué + flexShrink : sur une carte étroite (250px), il ne se colle plus à
              la note et ne déborde plus (« …· session » coupé). */}
          {comingSoon ? null : (
            <Txt
              variant="small"
              color={colors.signature}
              numberOfLines={1}
              style={{ fontWeight: '700', flexShrink: 1, marginLeft: spacing.sm }}
            >
              dès {fcfa(minPrice(club))}
            </Txt>
          )}
        </View>
      </Card>
    );
  }

  return (
    <Card onPress={go} style={{ padding: spacing.sm, marginBottom: spacing.md }}>
      <View>
        <ClubPhoto uri={photo} accent={club.accent} initials={initials(club.name)} height={140} />
        {heart}
        {partner ? (
          <View style={styles.boostBadge}>
            <PopIn delay={150}>
              <Tag label="Partenaire" tone="green" icon="shield-checkmark" />
            </PopIn>
          </View>
        ) : null}
      </View>
      <View style={{ padding: spacing.sm, paddingTop: spacing.md }}>
        <View style={styles.titleRow}>
          <Txt variant="h3" numberOfLines={1} style={{ flex: 1 }}>
            {club.name}
          </Txt>
          {comingSoon ? (
            <Tag label="Bientôt" tone="purple" icon="time" />
          ) : boosted ? (
            <Tag label="Sponsorisé" tone="amber" icon="megaphone" />
          ) : (
            <Tag label={club.type} tone="neutral" />
          )}
        </View>
        <View style={styles.areaRow}>
          <Ionicons name="location-outline" size={14} color={colors.textMuted} />
          <Txt variant="muted">
            {club.area} · {courtCount} terrain{courtCount > 1 ? 's' : ''}
          </Txt>
        </View>
        <View style={styles.footer}>
          <Tag label="Nouveau" tone="coral" icon="sparkles" />
          {comingSoon ? (
            <Txt variant="small" color={colors.purple} style={{ fontWeight: '700' }}>
              Pas encore réservable
            </Txt>
          ) : (
            <Txt variant="small" color={colors.signature} style={{ fontWeight: '700' }}>
              dès {fcfa(minPrice(club))} · session
            </Txt>
          )}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  compact: { width: 250, padding: spacing.sm },
  compactFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingHorizontal: 2,
  },
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
  boostBadge: { position: 'absolute', top: spacing.sm, left: spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  areaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
});
