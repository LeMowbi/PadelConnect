import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { ClubPhoto } from '@/components/ClubPhoto';
import { RatingStars } from '@/components/RatingStars';
import { Screen } from '@/components/Screen';
import { Button, Card, Divider, EmptyState, Tag, Txt } from '@/components/ui';
import { clubGallery, getClub, offersForClub } from '@/data/clubs';
import { seedReviews } from '@/data/reviews';
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
  const reviews = [
    ...state.userReviews.filter((r) => r.clubId === club.id),
    ...seedReviews.filter((r) => r.clubId === club.id),
  ];

  const submit = () => {
    if (rating === 0) return;
    addReview(club.id, rating, text);
    setRating(0);
    setText('');
    setSent(true);
  };

  return (
    <Screen back>
      {/* Photo héros */}
      <View>
        <ClubPhoto
          uri={gallery[0]}
          accent={club.accent}
          initials={initials(club.name)}
          height={220}
          overlay
          caption={club.name}
          subtitle={`${club.area} · ${club.city}`}
        />
        <Pressable onPress={() => toggleFavorite(club.id)} hitSlop={8} style={styles.favBtn}>
          <Ionicons name={fav ? 'heart' : 'heart-outline'} size={22} color={fav ? colors.danger : colors.white} />
        </Pressable>
      </View>

      {gallery.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, marginTop: spacing.sm }}>
          {gallery.slice(1).map((uri, i) => (
            <ClubPhoto key={`${uri}-${i}`} uri={uri} accent={club.accent} height={72} width={104} rounded={radius.md} />
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.tags}>
        {boosted ? <Tag label="Sponsorisé" tone="gold" icon="megaphone" /> : null}
        <Tag label={club.type} tone="neutral" />
        <Tag label={`${club.courts} terrains`} tone="neutral" />
        <Tag label={`${club.rating.toFixed(1)} ★ (${club.reviewsCount})`} tone="gold" />
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

      {/* Avis */}
      <View style={{ marginTop: spacing.xl }}>
        <Txt variant="h2">Avis des joueurs</Txt>

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
});
