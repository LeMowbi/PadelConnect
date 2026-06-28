import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { ClubPhoto } from '@/components/ClubPhoto';
import { ContactButtons } from '@/components/ContactButtons';
import { RatingStars } from '@/components/RatingStars';
import { Screen } from '@/components/Screen';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Button, Card, Divider, EmptyState, IconCircle, Tag, Txt } from '@/components/ui';
import { StickyBar } from '@/components/StickyBar';
import { clubGallery, defaultCourts, findClub, offersForClub } from '@/data/clubs';
import { coaches } from '@/data/coaches';
import { isTournamentPublic, seedCompetitions } from '@/data/competitions';
import { ratingFor, reviewsFor } from '@/data/reviews';
import { useApp } from '@/store/AppContext';
import { openWhatsApp } from '@/lib/contact';
import { fcfa, initials } from '@/lib/format';
import { groupTiersByLabel, minPrice, priceTiersFor } from '@/lib/pricing';
import { shareClub } from '@/lib/share';
import { openMaps } from '@/lib/maps';
import { colors, radius, spacing } from '@/theme';

export default function ClubDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { state, addReview, toggleFavorite } = useApp();
  const club = findClub(id, state.customClubs, state.clubInfo);

  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const [noteError, setNoteError] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [viewer, setViewer] = useState<number | null>(null); // photo ouverte en plein écran
  const [tierTab, setTierTab] = useState(0); // onglet de tarifs actif (plages nommées)
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
  const posts = state.clubOffers[club.id] ?? [];
  const offers = offersForClub(
    club,
    posts.filter((o) => o.kind !== 'evenement'),
  );
  // Événements du club : publications « événement » + tournois créés par le club (officiels ou non).
  const events = posts.filter((o) => o.kind === 'evenement');
  // Tournois publics du club (les tournois joueur « en attente » de validation n'apparaissent pas).
  const clubComps = [...state.myCompetitions, ...seedCompetitions].filter((c) => c.clubId === club.id && isTournamentPublic(c));
  const courtCount = (state.clubCourts[club.id] ?? defaultCourts(club)).length;
  const clubCoaches = [
    ...coaches
      .filter((c) => c.clubId === club.id && !state.hiddenCoachIds.includes(c.id))
      .map((c) => ({ id: c.id, name: c.name, sub: c.level, phone: c.phone })),
    ...(state.clubCoaches[club.id] ?? []).map((c) => ({ id: c.id, name: c.name, sub: c.specialty, phone: c.phone })),
  ];
  // Une seule source de vérité : la liste (avis utilisateur en tête + avis générés).
  const reviews = reviewsFor(club, state.userReviews);
  const { rating: avgRating, count: ratingCount } = ratingFor(club, state.userReviews);
  // Plages tarifaires définies par le gérant (vide → tarif unique).
  const tiers = priceTiersFor(club);
  // Plages NOMMÉES → onglets (sinon liste à plat). Purement présentation.
  const tierGroups = groupTiersByLabel(tiers);
  const activeTier = tierGroups.length ? tierGroups[Math.min(tierTab, tierGroups.length - 1)] : null;

  const submit = () => {
    if (rating === 0) {
      setNoteError(true); // plus de tap silencieux : on demande la note
      return;
    }
    setNoteError(false);
    addReview(club.id, rating, text);
    setRating(0);
    setText('');
    setSent(true);
  };

  return (
    <Screen
      back
      contentStyle={{ paddingBottom: 96 }}
      overlay={
        <>
          {/* CTA collant : prix « dès » à gauche, Réserver (pill) à droite */}
          <StickyBar
            label={`dès ${fcfa(minPrice(club))}`}
            hint="la session · 1h30"
            cta="Réserver"
            onPress={() => router.push(`/reserver/${club.id}`)}
          />
          {toast ? (
            // Toast léger (ex. « Lien copié ! » après partage sur ordinateur)
            <View style={styles.toast} pointerEvents="none">
              <Ionicons name="checkmark-circle" size={16} color={colors.white} />
              <Txt variant="small" color={colors.white}>
                {toast}
              </Txt>
            </View>
          ) : null}
        </>
      }
    >
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
        <Pressable
          onPress={async () => {
            const r = await shareClub(club);
            if (r === 'copied') {
              setToast('Lien copié !');
              setTimeout(() => setToast(null), 2200);
            }
          }}
          hitSlop={8}
          style={styles.shareBtn}
        >
          <Ionicons name="share-social-outline" size={20} color={colors.white} />
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
        {boosted ? <Tag label="Sponsorisé" tone="amber" icon="megaphone" /> : null}
        <Tag label={club.type} tone="neutral" />
        <Tag label={`${courtCount} terrain${courtCount > 1 ? 's' : ''}`} tone="neutral" />
        {ratingCount === 0 ? (
          <Tag label="Nouveau" tone="coral" icon="sparkles" />
        ) : (
          <Tag label={`${avgRating.toFixed(1)} ★ (${ratingCount})`} tone="amber" />
        )}
      </View>

      {/* Rangée de 3 « info chips » : note · terrains · localisation */}
      <View style={styles.infoChips}>
        <View style={styles.infoChip}>
          <Ionicons name="star" size={16} color={colors.amber} />
          {ratingCount === 0 ? <Txt variant="h3">Nouveau</Txt> : <Txt variant="h3">{avgRating.toFixed(1)}</Txt>}
          <Txt variant="small" color={colors.textFaint}>
            {ratingCount === 0 ? 'club' : `${ratingCount} avis`}
          </Txt>
        </View>
        <View style={styles.infoChip}>
          <Txt variant="h3">{courtCount}</Txt>
          <Txt variant="small" color={colors.textFaint}>
            terrains
          </Txt>
        </View>
        <View style={styles.infoChip}>
          <Txt variant="body" style={{ fontWeight: '700' }} numberOfLines={1}>
            {club.area}
          </Txt>
          <Txt variant="small" color={colors.textFaint}>
            {club.city}
          </Txt>
        </View>
      </View>

      <View style={styles.actions}>
        <Button label="Voir sur la carte" icon="map-outline" variant="secondary" onPress={() => openMaps(club)} full />
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
      </Card>

      {/* Tarifs par créneau — onglets si plages nommées, sinon lignes (ou tarif unique). */}
      <Txt variant="h3" style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
        Tarifs par créneau
      </Txt>
      {activeTier ? (
        <>
          <SegmentedControl
            options={tierGroups.map((g) => g.label)}
            value={activeTier.label}
            onChange={(label) => setTierTab(tierGroups.findIndex((g) => g.label === label))}
          />
          <Card>
            {activeTier.items.map((t, i) => (
              <View key={`${t.start}-${t.end}`}>
                {i > 0 ? <Divider /> : null}
                <View style={styles.tierRow}>
                  <View style={styles.tierLeft}>
                    <Ionicons name="time-outline" size={16} color={colors.textMuted} />
                    <Txt variant="body">
                      {t.start} – {t.end}
                    </Txt>
                  </View>
                  <Txt variant="body" style={{ fontWeight: '700' }}>
                    {fcfa(t.price)}
                  </Txt>
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : (
        <Card>
          {tiers.length > 0 ? (
            tiers.map((t, i) => (
              <View key={`${t.start}-${t.end}`}>
                {i > 0 ? <Divider /> : null}
                <View style={styles.tierRow}>
                  <View style={styles.tierLeft}>
                    <Ionicons name="time-outline" size={16} color={colors.textMuted} />
                    <Txt variant="body">
                      {t.start} – {t.end}
                    </Txt>
                  </View>
                  <Txt variant="body" style={{ fontWeight: '700' }}>
                    {fcfa(t.price)}
                  </Txt>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.tierRow}>
              <View style={styles.tierLeft}>
                <Ionicons name="time-outline" size={16} color={colors.textMuted} />
                <Txt variant="body">Session · 1h30</Txt>
              </View>
              <Txt variant="body" style={{ fontWeight: '700' }}>
                dès {fcfa(minPrice(club))}
              </Txt>
            </View>
          )}
        </Card>
      )}
      <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
        Tarif à confirmer auprès du club.
      </Txt>

      {/* Offres & actus (gérées par le club) */}
      <Card style={{ marginTop: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
          <Ionicons name="megaphone-outline" size={18} color={colors.signature} />
          <Txt variant="h3">Offres & actus</Txt>
        </View>
        {offers.map((o, i) => (
          <View key={o.id ?? o.title} style={{ marginTop: i === 0 ? 0 : spacing.md }}>
            <Tag label={o.kind === 'actu' ? 'Actu' : 'Offre'} tone={o.kind === 'actu' ? 'green' : 'signature'} />
            <Txt variant="body" style={{ fontWeight: '700', marginTop: 4 }}>
              {o.title}
            </Txt>
            {o.detail ? <Txt variant="muted">{o.detail}</Txt> : null}
          </View>
        ))}
      </Card>

      {/* Événements & tournois du club */}
      {events.length > 0 || clubComps.length > 0 ? (
        <Card style={{ marginTop: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
            <Ionicons name="calendar-outline" size={18} color={colors.purple} />
            <Txt variant="h3">Événements & tournois</Txt>
          </View>
          {events.map((e) => (
            <View key={e.id} style={{ marginBottom: spacing.md }}>
              <Tag label="Événement" tone="purple" icon="sparkles" />
              <Txt variant="body" style={{ fontWeight: '700', marginTop: 4 }}>
                {e.title}
              </Txt>
              {e.detail ? <Txt variant="muted">{e.detail}</Txt> : null}
            </View>
          ))}
          {clubComps.map((c, i) => (
            <Pressable
              key={c.id}
              onPress={() => router.push(`/competition/${c.id}`)}
              style={[styles.eventRow, { marginTop: i === 0 && events.length === 0 ? 0 : spacing.sm }]}
            >
              <IconCircle icon="trophy" color={colors.purple} bg={colors.purpleSoft} size={38} />
              <View style={{ flex: 1 }}>
                <Txt variant="body" style={{ fontWeight: '700' }} numberOfLines={1}>
                  {c.title}
                </Txt>
                <Txt variant="small" color={colors.textMuted}>
                  {c.date} · {c.registered}/{c.slots} équipes{c.official ? '' : ' · amical'}
                </Txt>
              </View>
              {c.official ? <Tag label="Officiel" tone="amber" icon="shield-checkmark" /> : null}
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>
          ))}
        </Card>
      ) : null}

      {/* Coachs du club */}
      {clubCoaches.length > 0 ? (
        <Card style={{ marginTop: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
            <Ionicons name="school-outline" size={18} color={colors.signature} />
            <Txt variant="h3">Coachs du club</Txt>
          </View>
          <Txt variant="small" color={colors.textFaint}>
            La réservation d'un cours se fait directement avec le coach.
          </Txt>
          {clubCoaches.map((c, i) => (
            <View key={c.id}>
              {i > 0 ? <Divider style={{ marginVertical: spacing.sm }} /> : null}
              <View style={[styles.coachRow, { marginTop: i === 0 ? spacing.md : 0 }]}>
                <IconCircle icon="person" color={colors.signature} bg={colors.signatureSoft} size={38} />
                <View style={{ flex: 1 }}>
                  <Txt variant="body" style={{ fontWeight: '600' }}>
                    {c.name}
                  </Txt>
                  <Txt variant="muted">{c.sub}</Txt>
                </View>
              </View>
              {c.phone ? <ContactButtons phone={c.phone} style={{ marginTop: spacing.sm }} /> : null}
            </View>
          ))}
          {/* D1 : accès à l'annuaire global des coachs (la tuile du hub a été retirée). */}
          <Pressable
            onPress={() => router.push('/coachs')}
            hitSlop={6}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.md }}
          >
            <Txt variant="small" color={colors.signature} style={{ fontWeight: '700' }}>
              Voir tous les coachs
            </Txt>
            <Ionicons name="chevron-forward" size={14} color={colors.signature} />
          </Pressable>
        </Card>
      ) : null}

      {/* Avis */}
      <View style={{ marginTop: spacing.xl }}>
        <Txt variant="h2">Avis des joueurs</Txt>

        {/* Résumé : grande note + répartition des étoiles des avis affichés */}
        {ratingCount > 0 ? (
          <Card style={{ marginTop: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
              <View style={{ alignItems: 'center' }}>
                <Txt variant="display" color={colors.signature}>
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
                      <Ionicons name="star" size={10} color={colors.signature} />
                      <View style={styles.summaryTrack}>
                        <View style={[styles.summaryFill, { width: `${pct}%` as `${number}%` }]} />
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
        ) : null}

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
                <RatingStars
                  value={rating}
                  size={30}
                  onChange={(v) => {
                    setRating(v);
                    setNoteError(false);
                  }}
                />
              </View>
              {noteError ? (
                <Txt variant="small" color={colors.danger} style={{ marginTop: spacing.xs }}>
                  Choisis une note d’abord
                </Txt>
              ) : null}
              <TextInput
                placeholder="Partage ton expérience (facultatif)…"
                placeholderTextColor={colors.textFaint}
                value={text}
                onChangeText={setText}
                multiline
                style={styles.input}
              />
              <Button label="Publier l'avis" icon="send" onPress={submit} />
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

      {/* Lien discret tout en bas : question d'info seulement (la réservation passe par l'app).
          Masqué si le club n'a pas renseigné de numéro WhatsApp. */}
      {club.contactPhone ? (
        <Pressable
          onPress={() => openWhatsApp(club.contactPhone!, `Bonjour, j'ai une question à propos de ${club.name}`)}
          style={{ alignItems: 'center', paddingVertical: spacing.xl, marginTop: spacing.sm }}
          hitSlop={6}
        >
          <Txt variant="small" color={colors.textFaint}>
            Une question ? Contacter le club
          </Txt>
        </Pressable>
      ) : null}

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
              <Txt variant="small" color={colors.onPhoto}>
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
  shareBtn: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md + 50,
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tags: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, flexWrap: 'wrap' },
  infoChips: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  infoChip: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  tierRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.md },
  tierLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
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
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  summaryTrack: { flex: 1, height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  summaryFill: { height: 6, borderRadius: radius.pill, backgroundColor: colors.signature },
  viewer: { flex: 1, backgroundColor: colors.viewerBg, justifyContent: 'center' },
  viewerClose: {
    position: 'absolute',
    top: 48,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.onPhotoSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerHint: { position: 'absolute', bottom: 40, alignSelf: 'center' },
  toast: {
    position: 'absolute',
    bottom: 112, // au-dessus de la barre collante « Réserver »
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.signature,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
});
