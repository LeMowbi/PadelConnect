import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { ClubPhoto } from '@/components/ClubPhoto';
import { useToast } from '@/components/Toast';
import { Button, Card, IconCircle, SectionHeader, Tag, Txt } from '@/components/ui';
import { ClubInfoCard } from '@/components/club-admin/ClubInfoCard';
import { type Club } from '@/data/clubs';
import { courtsFor, openSlotsFor } from '@/lib/availability';
import { MAX_CLUB_PHOTOS, useApp } from '@/store/AppContext';
import { fcfa, initials } from '@/lib/format';
import { pickImage } from '@/lib/pickImage';
import { colors, radius, spacing } from '@/theme';

// Sessions de 1h30 — la grille complète que le club peut ouvrir/fermer.
const ALL_TIMES = ['06:00', '07:30', '09:00', '10:30', '12:00', '13:30', '15:00', '16:30', '18:00', '19:30', '21:00', '22:30'];

export function SectionMonClub({ club }: { club: Club }) {
  const {
    state,
    setClubSlots,
    setClubCourts,
    addClubPhoto,
    removeClubPhoto,
    addClubOffer,
    removeClubOffer,
    addClubCoach,
    removeClubCoach,
    setClubInfo,
  } = useApp();
  const toast = useToast();

  const [url, setUrl] = useState('');
  const [offerKind, setOfferKind] = useState<'offre' | 'actu' | 'evenement'>('offre');
  const [offerTitle, setOfferTitle] = useState('');
  const [offerDetail, setOfferDetail] = useState('');
  const [coachName, setCoachName] = useState('');
  const [coachSpec, setCoachSpec] = useState('');
  const [coachPhone, setCoachPhone] = useState('');
  const [courtName, setCourtName] = useState('');

  // Mêmes valeurs par défaut que côté joueur (créneaux standards, « Terrain 1…N ») tant que le
  // gérant n'a rien personnalisé → cohérence avec le planning et ce que les joueurs voient.
  const openSlots = openSlotsFor(club, state.clubSlots);
  const courts = courtsFor(club, state.clubCourts);
  const photos = state.clubPhotos[club.id] ?? [];
  const offers = state.clubOffers[club.id] ?? [];
  const coaches = state.clubCoaches[club.id] ?? [];
  const boosted = state.boostedClubIds.includes(club.id);

  const toggleSlot = (t: string) => {
    const set = new Set(openSlots);
    if (set.has(t)) set.delete(t);
    else set.add(t);
    setClubSlots(club.id, [...set]);
  };
  const addCourt = () => {
    const n = courtName.trim();
    if (n.length < 1 || courts.includes(n)) return;
    setClubCourts(club.id, [...courts, n]);
    setCourtName('');
  };
  const removeCourt = (n: string) => {
    if (courts.length <= 1) return; // garder au moins un terrain
    setClubCourts(
      club.id,
      courts.filter((c) => c !== n),
    );
  };

  const shareBoost = () =>
    Share.share({ message: `Bonjour PadelConnect, je souhaite booster le profil de ${club.name} (paiement par Wave).` }).catch(() => {});

  const photosFull = photos.length >= MAX_CLUB_PHOTOS;
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const addPhotoFromDevice = async () => {
    if (photosFull) {
      toast.show(`Maximum ${MAX_CLUB_PHOTOS} photos par club`, { icon: 'alert-circle' });
      return;
    }
    const uri = await pickImage();
    if (!uri) return;
    // La photo est envoyée au serveur (visible par tous) : court délai → on signale l'envoi.
    setUploadingPhoto(true);
    await addClubPhoto(club.id, uri);
    setUploadingPhoto(false);
  };
  const addPhotoFromUrl = () => {
    if (photosFull) {
      toast.show(`Maximum ${MAX_CLUB_PHOTOS} photos par club`, { icon: 'alert-circle' });
      return;
    }
    if (/^https?:\/\//.test(url.trim())) {
      addClubPhoto(club.id, url.trim());
      setUrl('');
    }
  };
  const submitOffer = () => {
    if (offerTitle.trim().length < 2) return;
    addClubOffer(club.id, offerKind, offerTitle, offerDetail);
    setOfferTitle('');
    setOfferDetail('');
  };
  const submitCoach = () => {
    if (coachName.trim().length < 2) return;
    addClubCoach(club.id, coachName, coachSpec, coachPhone);
    setCoachName('');
    setCoachSpec('');
    setCoachPhone('');
  };

  return (
    <>
      {/* Infos du club — éditables par le gérant */}
      <SectionHeader title="Infos du club" />
      <ClubInfoCard key={club.id} club={club} onSave={(patch) => setClubInfo(club.id, patch)} />

      {/* Booster le profil */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Booster mon profil" />
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <IconCircle icon="megaphone" color={colors.signature} bg={colors.greenSoft} />
            <View style={{ flex: 1 }}>
              <Txt variant="h3">Mettre {club.name} en avant</Txt>
              <Txt variant="muted">
                Apparais en tête de liste avec un badge « Sponsorisé ». Paiement par Wave auprès de PadelConnect, qui active le boost.
              </Txt>
            </View>
            {boosted ? <Tag label="Actif" tone="amber" icon="megaphone" /> : null}
          </View>
          <View style={{ marginTop: spacing.md }}>
            <Button size="sm" label="Contacter PadelConnect" icon="paper-plane" onPress={shareBoost} full />
          </View>
        </Card>
      </View>

      {/* Photos du terrain */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Photos du terrain" />
        <Card>
          <Txt variant="muted">Ajoute les vraies photos de ton club (visibles par les joueurs). Jusqu'à {MAX_CLUB_PHOTOS} photos.</Txt>
          {state.storageFull ? (
            <View style={styles.storageWarn}>
              <Ionicons name="warning-outline" size={16} color={colors.danger} />
              <Txt variant="small" color={colors.danger} style={{ flex: 1 }}>
                Stockage plein — certaines photos n'ont pas pu être enregistrées. Retire-en quelques-unes.
              </Txt>
            </View>
          ) : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, marginTop: spacing.md }}>
            {photos.map((uri) => (
              <View key={uri}>
                <ClubPhoto uri={uri} accent={club.accent} initials={initials(club.name)} height={90} width={120} rounded={radius.md} />
                <Pressable
                  onPress={() => removeClubPhoto(club.id, uri)}
                  style={styles.removeBadge}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Retirer cette photo"
                >
                  <Ionicons name="close" size={14} color={colors.white} />
                </Pressable>
              </View>
            ))}
            {photosFull ? null : (
              <Pressable onPress={addPhotoFromDevice} style={styles.addTile} disabled={uploadingPhoto}>
                <Ionicons name={uploadingPhoto ? 'cloud-upload-outline' : 'camera-outline'} size={22} color={colors.signature} />
                <Txt variant="small" color={colors.signature} style={{ marginTop: 4 }}>
                  {uploadingPhoto ? 'Envoi…' : 'Ajouter'}
                </Txt>
              </Pressable>
            )}
          </ScrollView>
          <View style={styles.inlineRow}>
            <TextInput
              value={url}
              onChangeText={setUrl}
              placeholder="…ou coller un lien d'image (https://)"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              style={styles.input}
            />
            <Button size="sm" label="Ajouter" icon="add" onPress={addPhotoFromUrl} />
          </View>
        </Card>
      </View>

      {/* Offres, actus & événements */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Offres, actus & événements" />
        <Card>
          <Txt variant="muted">
            Publie ce que tu veux : promotions, infos du club, soirées, animations… Les événements s'affichent dans la section « Événements
            & tournois » de ta page.
          </Txt>
          <View style={[styles.wrap, { marginTop: spacing.md }]}>
            <Chip label="Offre" active={offerKind === 'offre'} onPress={() => setOfferKind('offre')} />
            <Chip label="Actu" active={offerKind === 'actu'} onPress={() => setOfferKind('actu')} />
            <Chip label="Événement" active={offerKind === 'evenement'} onPress={() => setOfferKind('evenement')} />
          </View>
          <TextInput
            value={offerTitle}
            onChangeText={setOfferTitle}
            placeholder={offerKind === 'evenement' ? 'Titre (ex. Soirée Americano vendredi 20h)' : 'Titre (ex. -20% le mardi)'}
            placeholderTextColor={colors.textFaint}
            style={styles.input}
          />
          <TextInput
            value={offerDetail}
            onChangeText={setOfferDetail}
            placeholder="Détail (optionnel)"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
          />
          <View style={{ marginTop: spacing.sm }}>
            <Button size="sm" label="Publier" icon="add" onPress={submitOffer} />
          </View>
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            {offers.length === 0 ? (
              <Txt variant="small" color={colors.textFaint}>
                Aucune publication — les offres par défaut sont affichées aux joueurs.
              </Txt>
            ) : (
              offers.map((o) => (
                <View key={o.id} style={styles.listRow}>
                  <Tag
                    label={o.kind === 'actu' ? 'Actu' : o.kind === 'evenement' ? 'Événement' : 'Offre'}
                    tone={o.kind === 'actu' ? 'green' : o.kind === 'evenement' ? 'purple' : 'signature'}
                  />
                  <View style={{ flex: 1 }}>
                    <Txt variant="body" style={{ fontWeight: '600' }}>
                      {o.title}
                    </Txt>
                    {o.detail ? <Txt variant="muted">{o.detail}</Txt> : null}
                  </View>
                  <Pressable onPress={() => removeClubOffer(club.id, o.id)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </Pressable>
                </View>
              ))
            )}
          </View>
        </Card>
      </View>

      {/* Coachs du club */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Coachs du club" />
        <Card>
          <Txt variant="muted">Ajoute les coachs de ton club.</Txt>
          <TextInput
            value={coachName}
            onChangeText={setCoachName}
            placeholder="Nom du coach"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
          />
          <TextInput
            value={coachSpec}
            onChangeText={setCoachSpec}
            placeholder="Spécialité (ex. Initiation, Compétition)"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
          />
          <TextInput
            value={coachPhone}
            onChangeText={setCoachPhone}
            placeholder="Téléphone (+225…)"
            placeholderTextColor={colors.textFaint}
            keyboardType="phone-pad"
            style={styles.input}
          />
          <View style={{ marginTop: spacing.sm }}>
            <Button size="sm" label="Ajouter le coach" icon="add" onPress={submitCoach} />
          </View>
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            {coaches.map((c) => (
              <View key={c.id} style={styles.listRow}>
                <IconCircle icon="person" color={colors.signature} bg={colors.greenSoft} size={36} />
                <View style={{ flex: 1 }}>
                  <Txt variant="body" style={{ fontWeight: '600' }}>
                    {c.name}
                  </Txt>
                  <Txt variant="muted">
                    {c.specialty}
                    {c.phone ? ` · ${c.phone}` : ''}
                  </Txt>
                </View>
                <Pressable onPress={() => removeClubCoach(club.id, c.id)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </Pressable>
              </View>
            ))}
          </View>
        </Card>
      </View>

      {/* Terrains (courts) */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title={`Terrains · ${courts.length}`} />
        <Card>
          <Txt variant="muted">Ajoute ou retire les terrains de ton club. La disponibilité se calcule terrain par terrain.</Txt>
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            {courts.map((c) => (
              <View key={c} style={styles.listRow}>
                <IconCircle icon="tennisball" color={colors.green} bg={colors.greenSoft} size={36} />
                <Txt variant="body" style={{ flex: 1, fontWeight: '600' }}>
                  {c}
                </Txt>
                {courts.length > 1 ? (
                  <Pressable onPress={() => removeCourt(c)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
          <View style={styles.inlineRow}>
            <TextInput
              value={courtName}
              onChangeText={setCourtName}
              placeholder="Nom du terrain (ex. Terrain 4, Central…)"
              placeholderTextColor={colors.textFaint}
              style={styles.input}
            />
            <Button size="sm" label="Ajouter" icon="add" onPress={addCourt} />
          </View>
        </Card>
      </View>

      {/* Disponibilités */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Disponibilités" />
        <Card>
          <Txt variant="muted">Touche un horaire pour l'ouvrir ou le fermer à la réservation.</Txt>
          <View style={styles.wrap}>
            {ALL_TIMES.map((t) => (
              <Chip key={t} label={t} active={openSlots.includes(t)} onPress={() => toggleSlot(t)} />
            ))}
          </View>
          <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
            Les créneaux actifs (verts) sont réservables par les joueurs ; les autres sont fermés.
          </Txt>
        </Card>
      </View>

      <Card style={{ marginTop: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <IconCircle icon="cash" color={colors.amberDark} bg={colors.amberSoft} size={40} />
        <Txt variant="small" color={colors.textMuted} style={{ flex: 1 }}>
          Tarif affiché aux joueurs :{' '}
          <Txt variant="small" style={{ fontWeight: '700' }}>
            dès {fcfa(club.priceFrom)} la session (1h30)
          </Txt>{' '}
          — le règlement se fait directement au club.
        </Txt>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  storageWarn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  removeBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTile: {
    width: 120,
    height: 90,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    marginTop: spacing.sm,
    flex: 1,
  },
});
