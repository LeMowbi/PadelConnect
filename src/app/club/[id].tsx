import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { ClubPhoto } from '@/components/ClubPhoto';
import { ContactButtons } from '@/components/ContactButtons';
import { RatingStars } from '@/components/RatingStars';
import { Reveal } from '@/components/Reveal';
import { Screen } from '@/components/Screen';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Button, Card, Divider, EmptyState, IconCircle, Tag, Txt } from '@/components/ui';
import { SkeletonLines } from '@/components/Skeleton';
import { StickyBar } from '@/components/StickyBar';
import { clubGallery, defaultCourts, findClub, offersForClub } from '@/data/clubs';
import { coaches } from '@/data/coaches';
import { isTournamentPublic, seedCompetitions } from '@/data/competitions';
import { isPlayed, useApp } from '@/store/AppContext';
import { fetchClubCoaches, type ServerCoach } from '@/lib/coachesServer';
import { deleteMyReview, fetchClubReviews, replyToReview, submitReview, type ServerReview } from '@/lib/reviewsServer';
import { blockUser, fetchBlockedUserIds, reportReview } from '@/lib/moderation';
import { openWhatsApp } from '@/lib/contact';
import { hapticSuccess } from '@/lib/haptics';
import { fcfa, initials } from '@/lib/format';
import { groupTiersByLabel, minPrice, priceTiersFor } from '@/lib/pricing';
import { shareClub } from '@/lib/share';
import { openMaps } from '@/lib/maps';
import { usePullToRefresh } from '@/lib/usePullToRefresh';
import { colors, radius, spacing } from '@/theme';

// Date d’un avis serveur (ISO) → libellé court FR ; repli silencieux si la date est invalide.
function reviewDate(iso: string): string {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

// Barre de répartition des notes (5→1 étoiles) : se remplit de 0 % à `pct` au premier montage
// du bloc « Avis vérifiés » (pas à chaque re-render de `reviews` — effet à dépendances vides,
// volontairement, pour ne pas rejouer l’anim à chaque nouvel avis publié).
function RatingBar({ pct, delay }: { pct: number; delay: number }) {
  const width = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(width, { toValue: pct, duration: 500, delay, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Animated.View style={[styles.summaryFill, { width: width.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }]} />
  );
}

export default function ClubDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { state, toggleFavorite, myReservations, refreshClubRatings } = useApp();
  const club = findClub(id, state.customClubs, state.clubInfo);

  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const [noteError, setNoteError] = useState(false);
  // tone distingue succès (coche verte) et échec (icône d’alerte rouge) — même overlay pour les deux.
  const [toast, setToast] = useState<{ text: string; tone: 'success' | 'error' } | null>(null);
  const [viewer, setViewer] = useState<number | null>(null); // photo ouverte en plein écran
  const [tierTab, setTierTab] = useState(0); // onglet de tarifs actif (plages nommées)
  const [showAllReviews, setShowAllReviews] = useState(false); // liste d’avis repliée par défaut
  const [serverReviews, setServerReviews] = useState<ServerReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true); // 1er chargement → squelette (≠ « 0 avis »)
  const [reviewsError, setReviewsError] = useState(false); // échec réseau au 1er chargement (≠ « aucun avis »)
  const [replyTarget, setReplyTarget] = useState<string | null>(null); // avis auquel le gérant répond
  const [replyDraft, setReplyDraft] = useState('');
  const [submitting, setSubmitting] = useState(false); // garde anti double-tap : publier l’avis
  const [replying, setReplying] = useState(false); // garde anti double-tap : publier la réponse
  const [removing, setRemoving] = useState(false); // garde anti double-tap : supprimer mon avis
  const [serverCoaches, setServerCoaches] = useState<ServerCoach[]>([]); // coachs réservables (serveur)
  const [blockedIds, setBlockedIds] = useState<string[]>([]); // comptes que j'ai bloqués → avis masqués
  const { width: winW } = useWindowDimensions();

  // Avis VÉRIFIÉS du serveur : chargés à l’ouverture (effet) et rechargés après chaque action
  // via loadReviews (fonction simple, utilisée seulement dans des handlers → pas de mémo).
  const clubId = club?.id;
  const loadReviews = () => {
    // Échec réseau → fetchClubReviews renvoie null : on garde les avis déjà affichés (pas d’écrasement).
    if (clubId)
      void fetchClubReviews(clubId).then((r) => {
        if (r) {
          setServerReviews(r);
          setReviewsError(false);
        }
      });
    // Coachs réservables (comptes promus par le club) — même convention (null = on garde).
    if (clubId) void fetchClubCoaches(clubId).then((cs) => cs && setServerCoaches(cs));
  };
  // Réessayer après un échec réseau au 1er chargement (bouton dédié, avec squelette pendant l’attente).
  const retryReviews = () => {
    if (!clubId) return;
    setReviewsLoading(true);
    void fetchClubReviews(clubId).then((r) => {
      if (r) {
        setServerReviews(r);
        setReviewsError(false);
      } else {
        setReviewsError(true);
      }
      setReviewsLoading(false);
    });
  };
  const { refreshControl } = usePullToRefresh(loadReviews);
  useEffect(() => {
    let alive = true;
    if (clubId)
      void fetchClubReviews(clubId).then((r) => {
        if (!alive) return;
        if (r)
          setServerReviews(r); // null = échec réseau → on ne vide pas la liste
        else setReviewsError(true); // 1er chargement en échec → distinct de « club sans avis »
        setReviewsLoading(false);
      });
    // Coachs réservables du club (serveur) : chargés à l’ouverture, comme les avis.
    if (clubId) void fetchClubCoaches(clubId).then((cs) => alive && cs && setServerCoaches(cs));
    // Ma liste de comptes bloqués → les avis de ces joueurs sont masqués (modération UGC).
    if (state.serverUserId) void fetchBlockedUserIds().then((ids) => alive && ids && setBlockedIds(ids));
    return () => {
      alive = false;
    };
  }, [clubId, state.serverUserId]);

  // Signaler un avis (envoi à la modération) ou bloquer son auteur (ses avis disparaissent
  // aussitôt de ma vue) — actions requises par l'App Store (Guideline 1.2) sur tout contenu UGC.
  const reportReviewItem = async (reviewId: string) => {
    const ok = await reportReview(reviewId);
    setToast({ text: ok ? 'Avis signalé — merci, on le vérifie.' : 'Signalement impossible — réessaie.', tone: ok ? 'success' : 'error' });
  };
  const blockReviewAuthor = async (userId: string, author: string) => {
    const ok = await blockUser(userId);
    if (ok) {
      setBlockedIds((cur) => (cur.includes(userId) ? cur : [...cur, userId]));
      setToast({ text: `${author} bloqué — tu ne verras plus ses avis.`, tone: 'success' });
    } else {
      setToast({ text: 'Blocage impossible — réessaie.', tone: 'error' });
    }
  };

  if (!club) {
    return (
      <Screen back>
        <EmptyState icon="alert-circle-outline" title="Club introuvable" />
      </Screen>
    );
  }

  const fav = state.favoriteClubIds.includes(club.id);
  const boosted = state.boostedClubIds.includes(club.id);
  // La photo « de profil » choisie par le club ouvre la galerie (héros) ; les photos par
  // terrain la complètent en fin de visionneuse (chaque vignette porte le nom du terrain).
  const cover = state.clubCovers[club.id];
  const baseGallery = clubGallery(club, state.clubPhotos[club.id] ?? []);
  const gallery = cover ? [cover, ...baseGallery.filter((u) => u !== cover)] : baseGallery;
  const courtPhotoMap = state.clubCourtPhotos[club.id] ?? {};
  const courtsWithPhoto = (state.clubCourts[club.id] ?? defaultCourts(club)).filter((c) => courtPhotoMap[c]);
  const viewerPhotos = [...gallery, ...courtsWithPhoto.map((c) => courtPhotoMap[c])];
  const posts = state.clubOffers[club.id] ?? [];
  const offers = offersForClub(
    club,
    posts.filter((o) => o.kind !== 'evenement'),
  );
  // Événements du club : publications « événement » + tournois créés par le club (officiels ou non).
  const events = posts.filter((o) => o.kind === 'evenement');
  // Tournois publics du club (les tournois joueur « en attente » de validation n’apparaissent pas).
  const clubComps = [...state.myCompetitions, ...seedCompetitions].filter((c) => c.clubId === club.id && isTournamentPublic(c));
  const courtCount = (state.clubCourts[club.id] ?? defaultCourts(club)).length;
  const clubCoaches = [
    ...coaches
      .filter((c) => c.clubId === club.id && !state.hiddenCoachIds.includes(c.id))
      .map((c) => ({ id: c.id, name: c.name, sub: c.level, phone: c.phone })),
    ...(state.clubCoaches[club.id] ?? []).map((c) => ({ id: c.id, name: c.name, sub: c.specialty, phone: c.phone })),
  ];
  // Source de vérité : les avis VÉRIFIÉS du serveur (un joueur ne peut noter qu’après avoir joué),
  // MOINS ceux des comptes que j’ai bloqués (modération UGC — ils n’apparaissent plus chez moi).
  const reviews = serverReviews.filter((r) => !blockedIds.includes(r.userId));
  // Liste repliée : on n’affiche que les premiers avis, avec un bouton « Voir tout ».
  const REVIEWS_PREVIEW = 3;
  const reviewsShown = showAllReviews ? reviews : reviews.slice(0, REVIEWS_PREVIEW);
  const ratingCount = reviews.length;
  const avgRating = ratingCount ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / ratingCount) * 10) / 10 : 0;
  // « Nouveau » = vraiment 0 avis. En cas d’échec réseau, on ne sait pas encore → repli neutre.
  const showAsNew = ratingCount === 0 && !reviewsError;
  // Mon avis (modifiable / supprimable) et mon rôle de gérant de CE club (pour répondre).
  const myReview = state.serverUserId ? reviews.find((r) => r.userId === state.serverUserId) : undefined;
  const isManager = state.serverManagedClubId === club.id || state.role === 'operator';
  // Plages tarifaires définies par le gérant (vide → tarif unique).
  const tiers = priceTiersFor(club);
  // Plages NOMMÉES → onglets (sinon liste à plat). Purement présentation.
  const tierGroups = groupTiersByLabel(tiers);
  const activeTier = tierGroups.length ? tierGroups[Math.min(tierTab, tierGroups.length - 1)] : null;

  // Avis VÉRIFIÉ : on ne peut noter un club qu’après Y AVOIR SOI-MÊME joué (une de MES
  // résas passées à ce club). Sinon, le formulaire laisse place à une invitation à jouer.
  const hasPlayedHere = myReservations.some((r) => r.clubId === club.id && isPlayed(r));

  const submit = async () => {
    if (submitting) return; // garde anti double-tap (le RPC est un upsert, mais on évite 2 allers-retours)
    if (!hasPlayedHere) return; // garde-fou : pas de note sans partie jouée
    if (rating === 0) {
      setNoteError(true); // plus de tap silencieux : on demande la note
      return;
    }
    setNoteError(false);
    setSubmitting(true);
    const res = await submitReview(club.id, rating, text);
    setSubmitting(false);
    if (!res.ok) {
      setToast({
        text: res.reason === 'not_played' ? 'Avis réservé à ceux qui ont joué ici.' : 'Envoi impossible — réessaie.',
        tone: 'error',
      });
      setTimeout(() => setToast(null), 2400);
      return;
    }
    setRating(0);
    setText('');
    setSent(true);
    hapticSuccess();
    loadReviews();
    // La note moyenne des CARTES (listes) vient de l'agrégat serveur : on le rafraîchit
    // aussi, sinon elle resterait périmée jusqu'au prochain retour au premier plan.
    void refreshClubRatings();
  };

  // Modifier mon avis : on repré-remplit le formulaire avec ma note/mon texte, hors champ de vision
  // (le formulaire est en haut de la section, le bouton « Modifier » en bas) → toast d’orientation.
  const editMyReview = () => {
    if (!myReview) return;
    setRating(myReview.rating);
    setText(myReview.text);
    setSent(false);
    setToast({ text: 'Modifie ton avis ci-dessus ↑', tone: 'success' });
    setTimeout(() => setToast(null), 2200);
  };
  const removeMyReview = async () => {
    if (removing || !state.serverUserId) return; // garde anti double-tap
    setRemoving(true);
    const ok = await deleteMyReview(club.id, state.serverUserId);
    setRemoving(false);
    if (ok) {
      loadReviews();
      void refreshClubRatings(); // même raison qu'au dépôt : moyenne des cartes à jour
      setToast({ text: 'Avis supprimé', tone: 'success' });
    } else {
      setToast({ text: 'Suppression impossible — réessaie.', tone: 'error' });
    }
    setTimeout(() => setToast(null), 2200);
  };
  // Gérant : publier / retirer une réponse à un avis.
  const sendReply = async (reviewId: string) => {
    if (replying || !replyDraft.trim()) return; // garde anti double-tap + pas d’envoi d’une réponse vide
    setReplying(true);
    const ok = await replyToReview(reviewId, replyDraft);
    setReplying(false);
    if (ok) {
      setReplyTarget(null);
      setReplyDraft('');
      loadReviews();
      setToast({ text: 'Réponse publiée', tone: 'success' });
      setTimeout(() => setToast(null), 2200);
    } else {
      setToast({ text: 'Réponse impossible — réessaie.', tone: 'error' });
      setTimeout(() => setToast(null), 2400);
    }
  };

  return (
    <Screen
      back
      refreshControl={refreshControl}
      contentStyle={{ paddingBottom: 96 }}
      overlay={
        <>
          {/* CTA collant : prix « dès » à gauche, Réserver (pill) à droite. Un club « Bientôt »
              n’est pas encore réservable → bouton désactivé + libellé explicite. */}
          <StickyBar
            label={club.comingSoon ? 'Bientôt sur PadelConnect' : `dès ${fcfa(minPrice(club))}`}
            hint={club.comingSoon ? 'réservation à venir' : 'la session · 1h30'}
            cta={club.comingSoon ? 'Bientôt' : 'Réserver'}
            disabled={!!club.comingSoon}
            onPress={() => router.push(`/reserver/${club.id}`)}
          />
          {toast ? (
            // Toast léger (succès ex. « Lien copié ! » ou échec ex. « Envoi impossible »).
            <View style={[styles.toast, toast.tone === 'error' && styles.toastError]} pointerEvents="none">
              <Ionicons name={toast.tone === 'error' ? 'alert-circle' : 'checkmark-circle'} size={16} color={colors.white} />
              <Txt variant="small" color={colors.white}>
                {toast.text}
              </Txt>
            </View>
          ) : null}
        </>
      }
    >
      {/* Photo héros — touche pour ouvrir en plein écran */}
      <View>
        <Pressable onPress={() => setViewer(0)} accessibilityRole="button" accessibilityLabel="Voir la photo en plein écran">
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
        <Pressable
          onPress={() => toggleFavorite(club.id)}
          hitSlop={8}
          style={styles.favBtn}
          accessibilityRole="button"
          accessibilityLabel={fav ? `Retirer ${club.name} des favoris` : `Ajouter ${club.name} aux favoris`}
        >
          <Ionicons name={fav ? 'heart' : 'heart-outline'} size={22} color={fav ? colors.danger : colors.white} />
        </Pressable>
        <Pressable
          onPress={async () => {
            const r = await shareClub(club);
            if (r === 'copied') {
              setToast({ text: 'Lien copié !', tone: 'success' });
              setTimeout(() => setToast(null), 2200);
            }
          }}
          hitSlop={8}
          style={styles.shareBtn}
          accessibilityRole="button"
          accessibilityLabel="Partager ce club"
        >
          <Ionicons name="share-social-outline" size={20} color={colors.white} />
        </Pressable>
      </View>

      {gallery.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, marginTop: spacing.sm }}>
          {gallery.slice(1).map((uri, i) => (
            <Reveal key={`${uri}-${i}`} delay={Math.min(i * 40, 200)}>
              <Pressable onPress={() => setViewer(i + 1)} accessibilityRole="button" accessibilityLabel={`Voir la photo ${i + 2}`}>
                <ClubPhoto uri={uri} accent={club.accent} height={72} width={104} rounded={radius.md} />
              </Pressable>
            </Reveal>
          ))}
        </ScrollView>
      ) : null}

      {/* Les terrains en photo — une vignette étiquetée par terrain (choisies par le club) */}
      {courtsWithPhoto.length > 0 ? (
        <View style={{ marginTop: spacing.md }}>
          <Txt variant="label" color={colors.textFaint}>
            Les terrains en photo
          </Txt>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, marginTop: spacing.sm }}>
            {courtsWithPhoto.map((c, i) => (
              <Reveal key={c} delay={Math.min(i * 40, 200)}>
                <Pressable onPress={() => setViewer(gallery.length + i)} accessibilityLabel={`Photo du ${c}`}>
                  <ClubPhoto uri={courtPhotoMap[c]} accent={club.accent} height={84} width={128} rounded={radius.md} />
                  <Txt variant="small" color={colors.textMuted} style={{ marginTop: 4, textAlign: 'center' }} numberOfLines={1}>
                    {c}
                  </Txt>
                </Pressable>
              </Reveal>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.tags}>
        {club.partner && !club.comingSoon ? <Tag label="Club partenaire" tone="green" icon="shield-checkmark" /> : null}
        {boosted ? <Tag label="Sponsorisé" tone="amber" icon="megaphone" /> : null}
        <Tag label={club.type} tone="neutral" />
        <Tag label={`${courtCount} terrain${courtCount > 1 ? 's' : ''}`} tone="neutral" />
        {showAsNew ? (
          <Tag label="Nouveau" tone="coral" icon="sparkles" />
        ) : ratingCount === 0 ? (
          <Tag label="Note indisponible" tone="neutral" icon="cloud-offline-outline" />
        ) : (
          <Tag label={`${avgRating.toFixed(1)} ★ (${ratingCount})`} tone="amber" />
        )}
      </View>

      {/* Rangée de 3 « info chips » : note · terrains · localisation */}
      <View style={styles.infoChips}>
        <View style={styles.infoChip}>
          <Ionicons name="star" size={16} color={colors.amber} />
          {showAsNew ? (
            <Txt variant="h3">Nouveau</Txt>
          ) : ratingCount === 0 ? (
            <Txt variant="h3">—</Txt>
          ) : (
            <Txt variant="h3">{avgRating.toFixed(1)}</Txt>
          )}
          <Txt variant="small" color={colors.textFaint}>
            {showAsNew ? 'club' : ratingCount === 0 ? 'indisponible' : `${ratingCount} avis`}
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
          {/* key = onglet actif → re-montage → fondu doux à chaque changement d’onglet tarifaire. */}
          <Reveal key={activeTier.label}>
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
          </Reveal>
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

      {/* Offres & actus (gérées par le club) — la carte n’apparaît que s’il y a du VRAI contenu. */}
      {offers.length > 0 ? (
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
      ) : null}

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

      {/* Coachs du club — les coachs SERVEUR (comptes promus par le club) sont réservables
          dans l’app ; les fiches saisies à la main restent joignables par téléphone/WhatsApp. */}
      {serverCoaches.length > 0 || clubCoaches.length > 0 ? (
        <Card style={{ marginTop: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
            <Ionicons name="school-outline" size={18} color={colors.signature} />
            <Txt variant="h3">Coachs du club</Txt>
          </View>
          <Txt variant="small" color={colors.textFaint}>
            {serverCoaches.length > 0
              ? 'Réserve ton cours dans l’app : le coach accepte, le terrain est réservé, le club confirme.'
              : 'La réservation d’un cours se fait directement avec le coach.'}
          </Txt>
          {serverCoaches.map((c, i) => (
            <View key={c.userId}>
              {i > 0 ? <Divider style={{ marginVertical: spacing.sm }} /> : null}
              <View style={[styles.coachRow, { marginTop: i === 0 ? spacing.md : 0 }]}>
                <IconCircle icon="school" color={colors.purple} bg={colors.purpleSoft} size={38} />
                <View style={{ flex: 1 }}>
                  <Txt variant="body" numberOfLines={1} style={{ fontWeight: '600' }}>
                    {c.name}
                  </Txt>
                  <Txt variant="muted" numberOfLines={1}>
                    {c.specialty || 'Coach du club'}
                    {c.price ? ` · cours ${fcfa(c.price)}` : ''}
                  </Txt>
                </View>
                <Button
                  size="sm"
                  label="Réserver un cours"
                  icon="calendar-outline"
                  onPress={() => router.push(`/cours/${c.userId}?clubId=${club.id}`)}
                />
              </View>
            </View>
          ))}
          {serverCoaches.length > 0 && clubCoaches.length > 0 ? <Divider style={{ marginVertical: spacing.sm }} /> : null}
          {clubCoaches.map((c, i) => (
            <View key={c.id}>
              {i > 0 ? <Divider style={{ marginVertical: spacing.sm }} /> : null}
              <View style={[styles.coachRow, { marginTop: i === 0 && serverCoaches.length === 0 ? spacing.md : 0 }]}>
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
          {/* D1 : accès à l’annuaire global des coachs (la tuile du hub a été retirée). */}
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
                {[5, 4, 3, 2, 1].map((s, i) => {
                  const n = reviews.filter((r) => Math.round(r.rating) === s).length;
                  const pct = reviews.length ? Math.round((n / reviews.length) * 100) : 0;
                  return (
                    <View key={s} style={styles.barRow}>
                      <Txt variant="small" color={colors.textMuted} style={{ width: 10, textAlign: 'center' }}>
                        {s}
                      </Txt>
                      <Ionicons name="star" size={10} color={colors.amber} />
                      <View style={styles.summaryTrack}>
                        <RatingBar pct={pct} delay={i * 60} />
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
              <Button label="Modifier mon avis" variant="ghost" onPress={() => setSent(false)} />
            </View>
          ) : !hasPlayedHere ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <IconCircle icon="shield-checkmark" color={colors.green} bg={colors.greenSoft} />
              <View style={{ flex: 1 }}>
                <Txt variant="h3" style={{ fontSize: 15 }}>
                  Avis vérifiés
                </Txt>
                <Txt variant="muted">Joue une première fois ici pour pouvoir laisser ton avis.</Txt>
              </View>
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
                placeholderTextColor={colors.textMuted}
                value={text}
                onChangeText={setText}
                multiline
                style={styles.input}
              />
              <Button
                label={submitting ? 'Envoi…' : myReview ? 'Mettre à jour mon avis' : 'Publier l’avis'}
                icon="send"
                onPress={submit}
                disabled={submitting}
              />
            </>
          )}
        </Card>

        {reviewsLoading && reviews.length === 0 ? (
          // 1er chargement : squelettes plutôt qu’un vide (on ne sait pas encore s’il y a des avis).
          <Card style={{ marginTop: spacing.md, gap: spacing.md }}>
            <SkeletonLines lines={2} />
            <SkeletonLines lines={2} />
          </Card>
        ) : reviewsError && reviews.length === 0 ? (
          // Échec réseau au 1er chargement : à ne pas confondre avec un club réellement sans
          // avis. Même motif « hors-ligne + Réessayer » que l’Espace Coach / la demande de cours.
          <Card style={{ marginTop: spacing.md, alignItems: 'center' }}>
            <Ionicons name="cloud-offline-outline" size={24} color={colors.textFaint} />
            <Txt variant="muted" style={{ marginTop: spacing.xs, textAlign: 'center' }}>
              Impossible de charger les avis.
            </Txt>
            <View style={{ marginTop: spacing.xs }}>
              <Button size="sm" label="Réessayer" variant="secondary" icon="refresh" onPress={retryReviews} />
            </View>
          </Card>
        ) : reviews.length === 0 ? (
          <Txt variant="muted" style={{ marginTop: spacing.md }}>
            Aucun avis pour l’instant — sois le premier à en laisser un après avoir joué ici !
          </Txt>
        ) : (
          <>
            {reviewsShown.map((r) => (
              <Card key={r.id} style={{ marginTop: spacing.md }}>
                <View style={styles.reviewHead}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                    <Txt variant="h3" numberOfLines={1} style={{ flexShrink: 1 }}>
                      {r.author}
                    </Txt>
                    <Tag label="Vérifié" tone="green" icon="shield-checkmark" />
                  </View>
                  <Txt variant="small" color={colors.textFaint}>
                    {reviewDate(r.createdAt)}
                  </Txt>
                </View>
                <View style={{ marginVertical: 6 }}>
                  <RatingStars value={r.rating} size={14} />
                </View>
                {r.text ? <Txt variant="body">{r.text}</Txt> : null}

                {/* Réponse publique du club */}
                {r.reply ? (
                  <View style={styles.replyBox}>
                    <Txt variant="small" color={colors.signature} style={{ fontWeight: '700' }}>
                      Réponse du club
                    </Txt>
                    <Txt variant="small" color={colors.textMuted} style={{ marginTop: 2 }}>
                      {r.reply}
                    </Txt>
                  </View>
                ) : null}

                {/* Mon avis : le modifier / le supprimer (#85) */}
                {state.serverUserId === r.userId ? (
                  <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                    <Button size="sm" label="Modifier" variant="ghost" icon="create-outline" onPress={editMyReview} />
                    <Button
                      size="sm"
                      label={removing ? 'Suppression…' : 'Supprimer'}
                      variant="ghost"
                      icon="trash-outline"
                      onPress={removeMyReview}
                      disabled={removing}
                    />
                  </View>
                ) : null}

                {/* Gérant du club : répondre à l’avis (#85) */}
                {isManager && state.serverUserId !== r.userId ? (
                  replyTarget === r.id ? (
                    <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
                      <TextInput
                        value={replyDraft}
                        onChangeText={setReplyDraft}
                        placeholder="Ta réponse en tant que club…"
                        placeholderTextColor={colors.textMuted}
                        multiline
                        style={styles.input}
                      />
                      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                        <Button
                          size="sm"
                          label={replying ? 'Envoi…' : 'Publier la réponse'}
                          icon="send"
                          onPress={() => sendReply(r.id)}
                          disabled={replying || !replyDraft.trim()}
                        />
                        <Button
                          size="sm"
                          label="Annuler"
                          variant="ghost"
                          onPress={() => {
                            setReplyTarget(null);
                            setReplyDraft('');
                          }}
                        />
                      </View>
                    </View>
                  ) : (
                    <View style={{ marginTop: spacing.sm }}>
                      <Button
                        size="sm"
                        label={r.reply ? 'Modifier la réponse' : 'Répondre'}
                        variant="ghost"
                        icon="chatbubble-outline"
                        onPress={() => {
                          setReplyTarget(r.id);
                          setReplyDraft(r.reply ?? '');
                        }}
                      />
                    </View>
                  )
                ) : null}

                {/* Modération UGC (App Store 1.2) : signaler l'avis ou bloquer son auteur —
                    proposé sur les avis des AUTRES joueurs, à tout compte connecté. */}
                {state.serverUserId && state.serverUserId !== r.userId ? (
                  <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                    <Button size="sm" label="Signaler" variant="ghost" icon="flag-outline" onPress={() => void reportReviewItem(r.id)} />
                    <Button
                      size="sm"
                      label="Bloquer"
                      variant="ghost"
                      icon="ban-outline"
                      onPress={() => void blockReviewAuthor(r.userId, r.author)}
                    />
                  </View>
                ) : null}
              </Card>
            ))}
            {reviews.length > REVIEWS_PREVIEW ? (
              <View style={{ marginTop: spacing.sm }}>
                <Button
                  size="sm"
                  label={showAllReviews ? 'Réduire' : `Voir tous les avis (${reviews.length})`}
                  variant="ghost"
                  onPress={() => setShowAllReviews((v) => !v)}
                />
              </View>
            ) : null}
          </>
        )}
      </View>

      {/* Lien discret tout en bas : question d’info seulement (la réservation passe par l’app).
          Masqué si le club n’a pas renseigné de numéro WhatsApp. */}
      {club.contactPhone ? (
        <Pressable
          onPress={() => openWhatsApp(club.contactPhone!, `Bonjour, j’ai une question à propos de ${club.name}`)}
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
              // Position initiale sur la photo ouverte via contentOffset (une seule fois) : un ref
              // callback inline re-scrollait à chaque rendu et empêchait de faire défiler.
              contentOffset={{ x: viewer * winW, y: 0 }}
            >
              {viewerPhotos.map((uri, i) => (
                <View key={`${uri}-${i}`} style={{ width: winW, justifyContent: 'center' }}>
                  <Image source={{ uri }} contentFit="contain" transition={150} style={{ width: winW, height: '80%' }} />
                </View>
              ))}
            </ScrollView>
            <Pressable
              onPress={() => setViewer(null)}
              hitSlop={10}
              style={styles.viewerClose}
              accessibilityRole="button"
              accessibilityLabel="Fermer la visionneuse"
            >
              <Ionicons name="close" size={24} color={colors.white} />
            </Pressable>
            <View style={styles.viewerHint}>
              <Txt variant="small" color={colors.onPhoto}>
                {viewerPhotos.length} photo{viewerPhotos.length > 1 ? 's — fais défiler' : ''}
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
  reviewHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  replyBox: {
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.signature,
  },
  coachRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  summaryTrack: { flex: 1, height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  summaryFill: { height: 6, borderRadius: radius.pill, backgroundColor: colors.amber },
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
  toastError: { backgroundColor: colors.danger },
});
