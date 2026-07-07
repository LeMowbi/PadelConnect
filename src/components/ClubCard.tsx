import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { ClubPhoto } from './ClubPhoto';
import { PopIn } from './PopIn';
import { Card, Tag, Txt } from './ui';
import { clubGallery, defaultCourts, type Club } from '@/data/clubs';
import { useApp } from '@/store/AppContext';
import { courtsFor, resolvedGridFor } from '@/lib/availability';
import { offeredDurations } from '@/lib/courtSchedule';
import { hapticLight } from '@/lib/haptics';
import { minPrice } from '@/lib/pricing';
import { fcfa, initials } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';

export function ClubCard({ club, compact }: { club: Club; compact?: boolean }) {
  const router = useRouter();
  const { state, toggleFavorite } = useApp();
  const fav = state.favoriteClubIds.includes(club.id);
  const boosted = state.boostedClubIds.includes(club.id);
  // Galerie complète du club (photo « de profil » en priorité, sinon la 1ʳᵉ de la galerie) —
  // sert aussi à afficher un badge « N photos » si le club en a plusieurs (déjà chargées, aucun
  // appel réseau supplémentaire).
  const gallery = clubGallery(club, state.clubPhotos[club.id] ?? []);
  const photo = state.clubCovers[club.id] ?? gallery[0];
  const courtCount = (state.clubCourts[club.id] ?? defaultCourts(club)).length;
  // « dès X » = plus petit prix RÉELLEMENT offert (créneaux 1h/1h30, 68) : un club tout en 1h
  // n'annonce pas le prix 1h30 (durée qu'il ne vend pas, et plus cher). On dérive les durées
  // proposées depuis la grille par terrain (défaut {90} pour un club sans grille = comportement
  // d'avant). Vide (tous créneaux fermés) → repli {90} pour ne pas afficher un prix nul.
  const offered = offeredDurations(
    resolvedGridFor(club, {
      clubSlots: state.clubSlots,
      clubCourts: state.clubCourts,
      courtSlots: state.courtSlots,
      courtClosed: state.clubCourtClosed,
    }),
    courtsFor(club, state.clubCourts),
  );
  const priceFrom = minPrice(club, offered.size ? offered : undefined);
  // Note RÉELLE (avis vérifiés, agrégat serveur state.clubRatings — un seul appel pour tous
  // les clubs). Absente tant qu’un club n’a aucun avis : on n’affiche alors rien (jamais de
  // note inventée). Même donnée que la fiche club → liste et détail restent cohérents.
  const rating = state.clubRatings[club.id];
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
          {gallery.length > 1 ? (
            <View style={styles.photosBadge}>
              <Tag label={String(gallery.length)} icon="images" tone="neutral" />
            </View>
          ) : null}
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
          {comingSoon ? (
            <Tag label="Pas encore réservable" tone="neutral" />
          ) : rating ? (
            // Note RÉELLE (mêmes avis vérifiés que la fiche) — rien tant qu’il n’y a aucun avis.
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={12} color={colors.amber} />
              <Txt variant="small" style={{ fontWeight: '700' }}>
                {rating.avg.toFixed(1)}
              </Txt>
              <Txt variant="small" color={colors.textMuted}>
                ({rating.count})
              </Txt>
            </View>
          ) : (
            <View />
          )}
          {/* Prix tronqué + flexShrink : sur une carte étroite (250px), il ne se colle plus à
              la note et ne déborde plus (« …· session » coupé). */}
          {comingSoon ? null : (
            <Txt
              variant="small"
              color={colors.signature}
              numberOfLines={1}
              style={{ fontWeight: '700', flexShrink: 1, marginLeft: spacing.sm }}
            >
              dès {fcfa(priceFrom)}
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
        {gallery.length > 1 ? (
          <View style={styles.photosBadge}>
            <Tag label={String(gallery.length)} icon="images" tone="neutral" />
          </View>
        ) : null}
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
          {comingSoon ? (
            <Txt variant="small" color={colors.purpleDark} style={{ fontWeight: '700' }}>
              Pas encore réservable
            </Txt>
          ) : (
            <Txt variant="small" color={colors.signature} style={{ fontWeight: '700' }}>
              dès {fcfa(priceFrom)} · session
            </Txt>
          )}
          {!comingSoon && rating ? (
            // Note RÉELLE (mêmes avis vérifiés que la fiche) — rien tant qu’il n’y a aucun avis.
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={12} color={colors.amber} />
              <Txt variant="small" style={{ fontWeight: '700' }}>
                {rating.avg.toFixed(1)}
              </Txt>
              <Txt variant="small" color={colors.textMuted}>
                ({rating.count})
              </Txt>
            </View>
          ) : null}
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
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  photosBadge: { position: 'absolute', bottom: spacing.sm, right: spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  areaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
});
