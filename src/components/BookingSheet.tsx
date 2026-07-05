import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BookingConfirmation } from './BookingConfirmation';
import { Chip } from './Chip';
import { Reveal } from './Reveal';
import { useToast } from './Toast';
import { Button, IconCircle, Txt } from './ui';
import { hapticWarning } from '@/lib/haptics';
import { activeClubs, type Club } from '@/data/clubs';
import { seedCompetitions } from '@/data/competitions';
import { freeCourts, type AvailCtx } from '@/lib/availability';
import { dateKeyLabel, slotTimestamp, type DayOption } from '@/lib/days';
import { fcfa, perPlayer } from '@/lib/format';
import { priceForSlot } from '@/lib/pricing';
import { MAX_UPCOMING, useApp } from '@/store/AppContext';
import { colors, radius, shadows, spacing } from '@/theme';

// Réservation rapide « en place » : une fiche qui monte du bas, sans changer de page.
// 2 gestes suffisent : ouvrir → Réserver (le 1ᵉʳ terrain libre est présélectionné).
export function BookingSheet({ club, day, time, onClose }: { club: Club; day: DayOption; time: string; onClose: () => void }) {
  const router = useRouter();
  const { state, addReservation } = useApp();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const ctx: AvailCtx = {
    clubs: activeClubs(state.customClubs, state.clubInfo),
    clubSlots: state.clubSlots,
    clubCourts: state.clubCourts,
    reservations: state.reservations,
    occupancy: state.occupancy,
    comps: [...seedCompetitions, ...state.myCompetitions],
    blocked: state.blockedSlots,
    ranges: state.blockedRanges,
    courtClosed: state.clubCourtClosed,
  };
  const free = useMemo(
    () => freeCourts(club, day.key, time, ctx),
    // deps volontairement listées à la main : ctx est reconstruit à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      club.id,
      day.key,
      time,
      state.reservations,
      state.occupancy,
      state.clubCourts,
      state.blockedSlots,
      state.blockedRanges,
      state.clubCourtClosed,
      state.myCompetitions,
    ],
  );

  const price = priceForSlot(club, time);
  const [court, setCourt] = useState<string | null>(free[0] ?? null);
  // Participants : toi + jusqu’à 3 invités (amis ou nom libre).
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [extraNames, setExtraNames] = useState<string[]>([]);
  const [extraName, setExtraName] = useState('');
  // Match OUVERT (45, modèle Playtomic) : le terrain est bloqué normalement, les places restantes
  // deviennent rejoignables (« Matchs ouverts »). Format 4 = 2v2 (défaut), 2 = 1v1. MÊME logique
  // que la fiche club (reserver/[clubId].tsx) — la réservation rapide l'offre désormais aussi.
  const [openMatch, setOpenMatch] = useState(false);
  const [openLevel, setOpenLevel] = useState('');
  const [openFormat, setOpenFormat] = useState<2 | 4>(4);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false); // attente de la confirmation serveur

  const participantCount = friendIds.length + extraNames.length;
  // Type de match affiché en clair (Privé / Ouvert 1v1 / Ouvert 2v2). Le 1v1 n'est proposé que
  // sans invité ; équipe complète (3 invités) → on retombe sur « privé » (aucune place à ouvrir).
  const matchType: 'private' | 'open1v1' | 'open2v2' =
    !openMatch || participantCount >= 3 ? 'private' : openFormat === 2 && participantCount === 0 ? 'open1v1' : 'open2v2';
  const toggleFriend = (id: string) =>
    setFriendIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : participantCount < 3 ? [...cur, id] : cur));
  const addExtra = () => {
    const n = extraName.trim();
    if (n.length < 2 || participantCount >= 3) return;
    if (extraNames.includes(n)) return; // pas de doublon (clé de liste + retrait par nom)
    setExtraNames((cur) => [...cur, n]);
    setExtraName('');
  };

  const confirm = async () => {
    if (!court || submitting) return;
    // Garde-fou : un club « Bientôt » n’est pas réservable (en plus du filtrage des vues).
    if (club.comingSoon) {
      toast.show('Ce club n’est pas encore réservable (Bientôt).', { icon: 'alert-circle' });
      return;
    }
    setSubmitting(true);
    const invited = [
      ...state.friends.filter((f) => friendIds.includes(f.id)).map((f) => ({ id: f.id, name: f.name, confirmed: false })),
      ...extraNames.map((n, i) => ({ id: `x-${Date.now()}-${i}`, name: n, confirmed: false })),
    ];
    // 1v1 (capacité 2) uniquement si personne n'est déjà invité — sinon on retombe sur le 2v2.
    const openCap: 2 | 4 = invited.length >= 1 ? 4 : openFormat;
    const res = await addReservation({
      clubId: club.id,
      clubName: club.name,
      court,
      date: dateKeyLabel(day.key), // libellé ABSOLU (« Lun 8 juin ») : ne devient jamais faux le lendemain
      dateKey: day.key,
      time,
      startsAt: slotTimestamp(day.key, time),
      price,
      players: 1 + invited.length,
      invited,
      // Match ouvert seulement s'il reste au moins une place à prendre (équipe déjà complète = inutile).
      openCapacity: openCap,
      openMatch: openMatch && invited.length < openCap - 1,
      openLevel: openMatch ? openLevel : '',
    });
    setSubmitting(false);
    if (res.ok) {
      setDone(true);
      // Résa créée mais rattachement des amis invités échoué : sans ce toast, la carte
      // affiche « Avec X » alors que X n'a reçu ni push ni la résa chez lui.
      if (res.partnersNotified === false) {
        toast.show('Tes partenaires n’ont pas pu être prévenus dans l’app — envoie-leur le récap WhatsApp.', { icon: 'alert-circle' });
      }
    } else if (res.reason === 'limit') {
      // Même barrière anti-blocage que la fiche club (règle centralisée dans addReservation).
      hapticWarning();
      toast.show(`Tu as déjà ${MAX_UPCOMING} réservations à venir — joue-les d’abord 😊`, { icon: 'alert-circle' });
    } else if (res.reason === 'network') {
      // Échec réseau/serveur : le terrain n’est PAS pris — réessayer suffit, on garde le choix.
      hapticWarning();
      toast.show('Connexion impossible — vérifie ton réseau et réessaie', { icon: 'cloud-offline-outline' });
    } else if (res.reason === 'past') {
      // Le créneau est devenu passé pendant que la feuille restait ouverte : réessayer est vain.
      hapticWarning();
      toast.show('Ce créneau vient de passer — choisis un autre horaire.', { icon: 'alert-circle' });
      onClose();
    } else if (res.reason === 'closed') {
      // Le club vient de FERMER ce créneau (période, terrain, grille — 54) : un autre terrain
      // du même horaire est très probablement fermé aussi → on referme la feuille.
      hapticWarning();
      toast.show('Ce créneau vient d’être fermé par le club — choisis un autre horaire.', { icon: 'alert-circle' });
      onClose();
    } else {
      // Terrain pris entre-temps (autre joueur / conflit serveur) : on repropose un autre
      // terrain libre et on prévient (retour tactile comme sur la fiche club).
      hapticWarning();
      const alt = free.find((c) => c !== court) ?? null;
      setCourt(alt);
      toast.show(alt ? 'Ce terrain vient d’être pris — réessaie' : 'Plus aucun terrain libre à cet horaire', {
        icon: 'alert-circle',
      });
    }
  };

  // Succès → écran de confirmation PLEIN ÉCRAN (handoff refonte).
  if (done) {
    const invitedNames = [...state.friends.filter((f) => friendIds.includes(f.id)).map((f) => f.name), ...extraNames];
    return (
      <BookingConfirmation
        clubName={club.name}
        dayLabel={day.label}
        time={time}
        court={court ?? ''}
        area={club.area}
        startsAt={slotTimestamp(day.key, time)}
        price={price}
        participantCount={participantCount}
        invitedNames={invitedNames}
        onSeeReservations={() => {
          onClose();
          router.push('/reservations');
        }}
        onClose={onClose}
      />
    );
  }

  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose} statusBarTranslucent>
      {/* Scrim masqué des lecteurs d'écran (même règle que BottomSheet) : la fermeture
          accessible passe par le bouton « Fermer » libellé + onRequestClose. */}
      <Pressable style={styles.backdrop} onPress={onClose} accessible={false} importantForAccessibility="no-hide-descendants" />
      <KeyboardAvoidingView style={styles.wrapper} pointerEvents="box-none" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { paddingBottom: spacing.xxl + insets.bottom }]}>
          <View style={styles.handle} />

          {/* Contenu DÉFILABLE (même protection que BottomSheet) : le sélecteur « Type de match »
              allonge la feuille — sans scroll, le haut (terrain, invités) sortirait de l'écran sur
              petit iPhone et le clavier masquerait le bouton. */}
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 520 }} keyboardShouldPersistTaps="handled">
            {
              // Contenu en fondu doux (même langage que Reveal ailleurs) après le slide-up natif.
              <Reveal>
                <View style={styles.head}>
                  <View style={{ flex: 1 }}>
                    <Txt variant="h2" style={{ fontSize: 20 }} numberOfLines={1}>
                      {club.name}
                    </Txt>
                    <Txt variant="muted">
                      {day.label} · {time} · 1h30 · {fcfa(price)} la session
                    </Txt>
                  </View>
                  <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Fermer">
                    <Ionicons name="close" size={20} color={colors.textMuted} />
                  </Pressable>
                </View>

                <Txt variant="label" color={colors.textFaint} style={{ marginTop: spacing.lg }}>
                  TERRAIN
                </Txt>
                {free.length === 0 ? (
                  <View style={styles.empty}>
                    <Ionicons name="time-outline" size={22} color={colors.textMuted} />
                    <Txt variant="muted" style={{ flex: 1 }}>
                      Plus aucun terrain libre à cet horaire. Essaie un autre créneau ou un autre club.
                    </Txt>
                  </View>
                ) : (
                  <View style={styles.row}>
                    {free.map((c) => (
                      <Chip key={c} label={c} active={c === court} onPress={() => setCourt(c)} size="lg" />
                    ))}
                  </View>
                )}

                {free.length === 0 ? (
                  <View style={{ marginTop: spacing.lg }}>
                    <Button label="Voir d’autres créneaux" icon="calendar" variant="secondary" onPress={onClose} full />
                  </View>
                ) : (
                  <>
                    <Txt variant="label" color={colors.textFaint} style={{ marginTop: spacing.lg }}>
                      AVEC QUI ? (TOI + {participantCount}/3)
                    </Txt>
                    <View style={styles.row}>
                      {state.friends.map((f) => (
                        <Chip
                          key={f.id}
                          label={f.name}
                          icon={friendIds.includes(f.id) ? 'checkmark' : 'person-add'}
                          active={friendIds.includes(f.id)}
                          onPress={() => toggleFriend(f.id)}
                        />
                      ))}
                      {extraNames.map((n) => (
                        <Chip
                          key={n}
                          label={n}
                          icon="checkmark"
                          active
                          onPress={() => setExtraNames((cur) => cur.filter((x) => x !== n))}
                        />
                      ))}
                    </View>
                    {/* Tout nouveau joueur (0 ami) : on l’amorce vers l’ajout d’amis au moment le
                      plus pertinent — le padel se joue à 4. */}
                    {state.friends.length === 0 ? (
                      <Pressable
                        onPress={() => {
                          onClose();
                          router.push('/amis');
                        }}
                        style={styles.inviteLink}
                        accessibilityRole="button"
                        accessibilityLabel="Inviter un ami sur PadelConnect"
                      >
                        <Ionicons name="person-add-outline" size={14} color={colors.signature} />
                        <Txt variant="small" color={colors.signature} style={{ fontWeight: '700' }}>
                          Invite tes amis sur PadelConnect pour les ajouter ici
                        </Txt>
                      </Pressable>
                    ) : null}
                    {participantCount < 3 ? (
                      <View style={styles.extraRow}>
                        <TextInput
                          value={extraName}
                          onChangeText={setExtraName}
                          placeholder="Ou un autre nom…"
                          placeholderTextColor={colors.textMuted}
                          style={styles.extraInput}
                          onSubmitEditing={addExtra}
                        />
                        <Button
                          size="sm"
                          label="Ajouter"
                          icon="add"
                          variant="secondary"
                          onPress={addExtra}
                          disabled={extraName.trim().length < 2}
                        />
                      </View>
                    ) : null}

                    {/* TYPE DE MATCH (Privé / Ouvert 1v1 / Ouvert 2v2) — même choix clair que la
                      fiche club. Un match ouvert garde ton terrain bloqué, les places restantes
                      deviennent rejoignables depuis « Matchs ouverts ». */}
                    {state.serverUserId ? (
                      <>
                        <Txt variant="label" color={colors.textFaint} style={{ marginTop: spacing.lg }}>
                          TYPE DE MATCH
                        </Txt>
                        {(
                          [
                            {
                              key: 'private',
                              icon: 'lock-closed' as const,
                              title: 'Match privé',
                              sub: 'Juste toi et tes invités',
                              show: true,
                              set: () => setOpenMatch(false),
                            },
                            {
                              key: 'open1v1',
                              icon: 'person' as const,
                              title: 'Match ouvert · 1v1',
                              sub: 'Un joueur inconnu te rejoint — 2 au total',
                              show: participantCount === 0,
                              set: () => {
                                setOpenMatch(true);
                                setOpenFormat(2);
                              },
                            },
                            {
                              key: 'open2v2',
                              icon: 'people' as const,
                              title: 'Match ouvert · 2v2',
                              sub: `${3 - participantCount} place${3 - participantCount > 1 ? 's' : ''} à prendre — 4 au total`,
                              show: participantCount < 3,
                              set: () => {
                                setOpenMatch(true);
                                setOpenFormat(4);
                              },
                            },
                          ] as const
                        )
                          .filter((o) => o.show)
                          .map((o) => {
                            const active = matchType === o.key;
                            return (
                              <Pressable
                                key={o.key}
                                onPress={o.set}
                                style={[styles.openMatchBox, active && styles.openMatchBoxOn, active && shadows.e1]}
                                accessibilityRole="radio"
                                accessibilityState={{ selected: active }}
                                accessibilityLabel={o.title}
                              >
                                <IconCircle
                                  icon={o.icon}
                                  size={40}
                                  color={active ? colors.signature : colors.textMuted}
                                  bg={active ? colors.signatureSoft : colors.surfaceAlt}
                                />
                                <View style={{ flex: 1 }}>
                                  <Txt variant="body" style={{ fontWeight: '700' }}>
                                    {o.title}
                                  </Txt>
                                  <Txt variant="small" color={colors.textMuted}>
                                    {o.sub}
                                  </Txt>
                                </View>
                                <Ionicons
                                  name={active ? 'radio-button-on' : 'radio-button-off'}
                                  size={20}
                                  color={active ? colors.signature : colors.textFaint}
                                />
                              </Pressable>
                            );
                          })}
                        {matchType !== 'private' ? (
                          <>
                            <Txt variant="label" color={colors.textFaint} style={{ marginTop: spacing.md }}>
                              NIVEAU SOUHAITÉ
                            </Txt>
                            <View style={styles.row}>
                              {['Tous niveaux', '2–3', '3–4', '4–5', '5+'].map((lv) => {
                                const value = lv === 'Tous niveaux' ? '' : lv;
                                return <Chip key={lv} label={lv} active={openLevel === value} onPress={() => setOpenLevel(value)} />;
                              })}
                            </View>
                            <Txt variant="small" color={colors.textMuted} style={{ marginTop: spacing.sm }}>
                              Ton terrain est bloqué quoi qu'il arrive. Les autres rejoignent depuis « Matchs ouverts » (tu es prévenu à
                              chaque arrivée). Le prix du terrain se partage entre les joueurs.
                            </Txt>
                          </>
                        ) : null}
                      </>
                    ) : null}

                    <View style={styles.priceLine}>
                      <Txt variant="small" color={colors.textMuted}>
                        {fcfa(price)} la session · soit ~{perPlayer(price)}/joueur à 4
                      </Txt>
                    </View>

                    <View style={{ marginTop: spacing.md }}>
                      <Button
                        label={submitting ? 'Réservation…' : 'Réserver le terrain'}
                        icon="checkmark"
                        onPress={confirm}
                        disabled={!court || submitting}
                        full
                      />
                      <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm, textAlign: 'center' }}>
                        Session de 1h30 · sans paiement en ligne — réglé au club. Annulation jusqu’à 5h avant.
                      </Txt>
                    </View>
                  </>
                )}
              </Reveal>
            }
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim },
  wrapper: { flex: 1, justifyContent: 'flex-end' },
  empty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  sheet: {
    // Plafond tablette : une feuille pleine largeur d'iPad serait démesurée — 480 pt max,
    // centrée (même règle que BottomSheet.tsx).
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    ...shadows.e3,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  openMatchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  openMatchBoxOn: { borderColor: colors.signature, backgroundColor: colors.signatureSoft },
  extraRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  inviteLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm, paddingVertical: spacing.xs },
  extraInput: {
    flex: 1,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
  },
  priceLine: { alignItems: 'center', marginTop: spacing.lg },
});
