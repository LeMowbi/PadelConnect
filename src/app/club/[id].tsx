import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { ClubPhoto } from '@/components/ClubPhoto';
import { ContactButtons } from '@/components/ContactButtons';
import { RatingStars } from '@/components/RatingStars';
import { Screen } from '@/components/Screen';
import { Button, Card, Divider, EmptyState, IconCircle, Tag, Txt } from '@/components/ui';
import { clubGallery, defaultCourts, getClub, offersForClub } from '@/data/clubs';
import { coaches } from '@/data/coaches';
import { ratingFor, seedReviews } from '@/data/reviews';
import { useApp } from '@/store/AppContext';
import { fcfa, initials } from '@/lib/format';
import { openMaps } from '@/lib/maps';
import { colors, radius, spacing } from '@/theme';

export default function ClubDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const club = getClub(id);
  const { state, addReview, toggleFavorite } = useApp();

  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null); // photo ouverte en plein écran
  const { width: winW } = useWindowDimensions();

  if (!club) {
    return (
      <Screen back>
        <EmptyState icon="alert-circle-outline" title="Club introuvable" />
      </Screen>
    );
  }

  const fav = state.favoriteClubIds.includes(club.id);
  const boosted = state.boostedClubIds.includes(club.id);
  const gallery = clubGallery(club, state.clubPhotos[club.id] ?? []);
  const offers = offersForClub(club, state.clubOffers[club.id] ?? []);
  const courtCount = (state.clubCourts[club.id] ?? defaultCourts(club)).length;
  const clubCoaches = [
    ...coaches.filter((c) => c.clubId === club.id).map((c) => ({ id: c.id, name: c.name, sub: c.level, phone: c.phone })),
    ...(state.clubCoaches[club.id] ?? []).map((c) => ({ id: c.id, name: c.name, sub: c.specialty, phone: c.phone })),
  ];
  const reviews = [
    ...state.userReviews.filter((r) => r.clubId === club.id),
    ...seedReviews.filter((r) => r.clubId === club.id),
  ];
  const { rating: avgRating, count: ratingCount } = ratingFor(club, state.userReviews);

  const submit = () => {
    if (rating === 0) return;
    addReview(club.id, rating, text);
    setRating(0);
    setText('');
    setSent(true);
  };

  return (
    <Screen back>
      {/* Photo héros — touche pour ouvrir en plein écran */}
      <View>
        <Pressable onPress={() => setViewer(0)}>
          <ClubPhoto
            uri={gallery[0]}
            accent={club.accent}
            initials={initials(club.name)}
            height={220}
            overlay
            caption={club.name}
            subtitle={`${club.area} · ${club.city}`}
          />
        </Pressable>
        <Pressable onPress={() => toggleFavorite(club.id)} hitSlop={8} style={styles.favBtn}>
          <Ionicons name={fav ? 'heart' : 'heart-outline'} size={22} color={fav ? colors.danger : colors.white} />
        </Pressable>
      </View>

      {gallery.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, marginTop: spacing.sm }}>
          {gallery.slice(1).map((uri, i) => (
            <Pressable key={`${uri}-${i}`} onPress={() => setViewer(i + 1)}>
              <ClubPhoto uri={uri} accent={club.accent} height={72} width={104} rounded={radius.md} />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.tags}>
        {boosted ? <Tag label="Sponsorisé" tone="gold" icon="megaphone" /> : null}
        <Tag label={club.type} tone="neutral" />
        <Tag label={`${courtCount} terrain${courtCount > 1 ? 's' : ''}`} tone="neutral" />
        <Tag label={`${avgRating.toFixed(1)} ★ (${ratingCount})`} tone="gold" />
      </View>

      <View style={styles.actions}>
        <View style={{ flex: 1 }}>
          <Button label="Réserver un créneau" icon="calendar" onPress={() => router.push(`/reserver/${club.id}`)} full />
        </View>
        <Button label="Carte" icon="map-outline" variant="secondary" onPress={() => openMaps(club)} />
      </View>

      <Card style={{ marginTop: spacing.lg }}>
        <Txt variant="label" color={colors.textFaint}>
          À propos
        </Txt>
        <Txt variant="body" style={{ marginTop: spacing.sm }}>
          {club.blurb}
        </Txt>
        <View style={styles.amenities}>
          {club.amenities.map((a) => (
            <View key={a} style={styles.amenity}>
              <Ionicons name="checkmark-circle" size={15} color={colors.green} />
              <Txt variant="small" color={colors.textMuted}>
                {a}
              </Txt>
            </View>
          ))}
        </View>
        <Divider style={{ marginVertical: spacing.md }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Txt variant="muted">Tarif indicatif</Txt>
          <Txt variant="price">dès {fcfa(club.priceFrom)} / heure</Txt>
        </View>
        <Txt variant="small" color={colors.textFaint} style={{ marginTop: 4 }}>
          À confirmer auprès du club.
        </Txt>
      </Card>

      {/* Offres & actus (gérées par le club) */}
      <Card style={{ marginTop: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
          <Ionicons name="megaphone-outline" size={18} color={colors.gold} />
          <Txt variant="h3">Offres & actus</Txt>
        </View>
        {offers.map((o, i) => (
          <View key={o.id ?? o.title} style={{ marginTop: i === 0 ? 0 : spacing.md }}>
            <Tag label={o.kind === 'actu' ? 'Actu' : 'Offre'} tone={o.kind === 'actu' ? 'green' : 'gold'} />
            <Txt variant="body" style={{ fontWeight: '700', marginTop: 4 }}>
              {o.title}
            </Txt>
            {o.detail ? <Txt variant="muted">{o.detail}</Txt> : null}
          </View>
        ))}
      </Card>

      {/* Coachs du club */}
      {clubCoaches.length > 0 ? (
        <Card style={{ marginTop: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
            <Ionicons name="school-outline" size={18} color={colors.gold} />
            <Txt variant="h3">Coachs du club</Txt>
          </View>
          <Txt variant="small" color={colors.textFaint}>
            La réservation d'un cours se fait directement avec le coach.
          </Txt>
          {clubCoaches.map((c, i) => (
            <View key={c.id}>
              {i > 0 ? <Divider style={{ marginVertical: spacing.sm }} /> : null}
              <View style={[styles.coachRow, { marginTop: i === 0 ? spacing.md : 0 }]}>
                <IconCircle icon="person" color={colors.gold} bg={colors.goldSoft} size={38} />
                <View style={{ flex: 1 }}>
                  <Txt variant="body" style={{ fontWeight: '600' }}>{c.name}</Txt>
                  <Txt variant="muted">{c.sub}</Txt>
                </View>
              </View>
              {c.phone ? <ContactButtons phone={c.phone} style={{ marginTop: spacing.sm }} /> : null}
            </View>
          ))}
        </Card>
      ) : null}

      {/* Avis */}
      <View style={{ marginTop: spacing.xl }}>
        <Txt variant="h2">Avis des joueurs</Txt>

        {/* Résumé : grande note + répartition des étoiles des avis affichés */}
        <Card style={{ marginTop: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
            <View style={{ alignItems: 'center' }}>
              <Txt variant="display" color={colors.gold}>
                {avgRating.toFixed(1)}
              </Txt>
              <RatingStars value={avgRating} size={13} />
              <Txt variant="small" color={colors.textMuted} style={{ marginTop: 2 }}>
                {ratingCount} avis
              </Txt>
            </View>
            <View style={{ flex: 1, gap: 5 }}>
              {[5, 4, 3, 2, 1].map((s) => {
                const n = reviews.filter((r) => Math.round(r.rating) === s).length;
                const pct = reviews.length ? Math.round((n / reviews.length) * 100) : 0;
                return (
                  <View key={s} style={styles.barRow}>
                    <Txt variant="small" color={colors.textMuted} style={{ width: 10, textAlign: 'center' }}>
                      {s}
                    </Txt>
                    <Ionicons name="star" size={10} color={colors.gold} />
                    <View style={styles.summaryTrack}>
                      <View style={[styles.summaryFill, { width: (`${pct}%` as `${number}%`) }]} />
                    </View>
                    <Txt variant="small" color={colors.textFaint} style={{ width: 18, textAlign: 'right' }}>
                      {n}
                    </Txt>
                  </View>
                );
              })}
            </View>
          </View>
        </Card>

        <Card style={{ marginTop: spacing.md }}>
          {sent ? (
            <View style={{ alignItems: 'center', paddingVertical: spacing.sm }}>
              <Ionicons name="checkmark-circle" size={30} color={colors.green} />
              <Txt variant="h3" style={{ marginTop: spacing.sm }}>
                Merci pour ton avis !
              </Txt>
              <Button label="Ajouter un autre avis" variant="ghost" onPress={() => setSent(false)} />
            </View>
          ) : (
            <>
              <Txt variant="h3">Donner ton avis</Txt>
              <View style={{ marginTop: spacing.sm }}>
                <RatingStars value={rating} size={30} onChange={setRating} />
              </View>
              <TextInput
                placeholder="Partage ton expérience (facultatif)…"
                placeholderTextColor={colors.textFaint}
                value={text}
                onChangeText={setText}
                multiline
                style={styles.input}
              />
              <Button label="Publier l'avis" icon="send" onPress={submit} disabled={rating === 0} />
            </>
          )}
        </Card>

        {reviews.length === 0 ? (
          <Txt variant="muted" style={{ marginTop: spacing.md }}>
            Aucun avis pour l’instant — sois le premier !
          </Txt>
        ) : (
          reviews.map((r) => (
            <Card key={r.id} style={{ marginTop: spacing.md }}>
              <View style={styles.reviewHead}>
                <Txt variant="h3">{r.author}</Txt>
                <Txt variant="small" color={colors.textFaint}>
                  {r.date}
                </Txt>
              </View>
              <View style={{ marginVertical: 6 }}>
                <RatingStars value={r.rating} size={14} />
              </View>
              <Txt variant="body">{r.text}</Txt>
            </Card>
          ))
        )}
      </View>

      {/* Visionneuse photos plein écran (défilement horizontal) */}
      {viewer !== null ? (
        <Modal visible animationType="fade" onRequestClose={() => setViewer(null)}>
          <View style={styles.viewer}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              ref={(r) => r?.scrollTo({ x: viewer * winW, animated: false })}
            >
              {gallery.map((uri, i) => (
                <View key={`${uri}-${i}`} style={{ width: winW, justifyContent: 'center' }}>
                  <Image source={{ uri }} contentFit="contain" transition={150} style={{ width: winW, height: '80%' }} />
                </View>
              ))}
            </ScrollView>
            <Pressable onPress={() => setViewer(null)} hitSlop={10} style={styles.viewerClose}>
              <Ionicons name="close" size={24} color={colors.white} />
            </Pressable>
            <View style={styles.viewerHint}>
              <Txt variant="small" color="rgba(255,255,255,0.85)">
                {gallery.length} photo{gallery.length > 1 ? 's — fais défiler' : ''}
              </Txt>
            </View>
          </View>
        </Modal>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  favBtn: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tags: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, flexWrap: 'wrap' },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, alignItems: 'stretch' },
  amenities: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md },
  amenity: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    padding: spacing.md,
    minHeight: 70,
    textAlignVertical: 'top',
    marginVertical: spacing.md,
    fontSize: 15,
  },
  reviewHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  coachRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  summaryTrack: { flex: 1, height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  summaryFill: { height: 6, borderRadius: radius.pill, backgroundColor: colors.gold },
  viewer: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  viewerClose: {
    position: 'absolute',
    top: 48,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerHint: { position: 'absolute', bottom: 40, alignSelf: 'center' },
});
