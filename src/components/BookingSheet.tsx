import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BookingConfirmation } from './BookingConfirmation';
import { Chip } from './Chip';
import { useToast } from './Toast';
import { Button, Txt } from './ui';
import { activeClubs, type Club } from '@/data/clubs';
import { seedCompetitions } from '@/data/competitions';
import { freeCourts, type AvailCtx } from '@/lib/availability';
import { slotTimestamp, type DayOption } from '@/lib/days';
import { fcfa, perPlayer } from '@/lib/format';
import { priceForSlot } from '@/lib/pricing';
import { useApp } from '@/store/AppContext';
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
    comps: [...seedCompetitions, ...state.myCompetitions],
    blocked: state.blockedSlots,
  };
  const free = useMemo(
    () => freeCourts(club, day.key, time, ctx),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [club.id, day.key, time, state.reservations, state.clubCourts],
  );

  const price = priceForSlot(club, time);
  const [court, setCourt] = useState<string | null>(free[0] ?? null);
  // Participants : toi + jusqu'à 3 invités (amis ou nom libre).
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [extraNames, setExtraNames] = useState<string[]>([]);
  const [extraName, setExtraName] = useState('');
  const [done, setDone] = useState(false);

  const participantCount = friendIds.length + extraNames.length;
  const toggleFriend = (id: string) =>
    setFriendIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : participantCount < 3 ? [...cur, id] : cur));
  const addExtra = () => {
    const n = extraName.trim();
    if (n.length < 2 || participantCount >= 3) return;
    if (extraNames.includes(n)) return; // pas de doublon (clé de liste + retrait par nom)
    setExtraNames((cur) => [...cur, n]);
    setExtraName('');
  };

  const confirm = () => {
    if (!court) return;
    const invited = [
      ...state.friends.filter((f) => friendIds.includes(f.id)).map((f) => ({ id: f.id, name: f.name, confirmed: false })),
      ...extraNames.map((n, i) => ({ id: `x-${Date.now()}-${i}`, name: n, confirmed: false })),
    ];
    const ok = addReservation({
      clubId: club.id,
      clubName: club.name,
      court,
      date: day.label,
      dateKey: day.key,
      time,
      startsAt: slotTimestamp(day.value, time),
      price,
      players: 1 + invited.length,
      invited,
    });
    if (ok) {
      setDone(true);
    } else {
      // Terrain pris entre-temps : on repropose un autre terrain libre et on prévient.
      const alt = free.find((c) => c !== court) ?? null;
      setCourt(alt);
      toast.show(alt ? 'Ce terrain vient d’être pris — réessaie' : 'Plus aucun terrain libre à cet horaire', {
        icon: 'alert-circle',
      });
    }
  };

  // Succès → écran de confirmation PLEIN ÉCRAN (handoff refonte).
  if (done) {
    return (
      <BookingConfirmation
        clubName={club.name}
        dayLabel={day.label}
        time={time}
        court={court ?? ''}
        participantCount={participantCount}
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
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        style={styles.wrapper}
        pointerEvents="box-none"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.sheet, { paddingBottom: spacing.xxl + insets.bottom }]}>
          <View style={styles.handle} />

          {
            <>
              <View style={styles.head}>
                <View style={{ flex: 1 }}>
                  <Txt variant="h2" style={{ fontSize: 20 }}>
                    {club.name}
                  </Txt>
                  <Txt variant="muted">
                    {day.label} · {time} · 1h30 · {fcfa(price)} la session
                  </Txt>
                </View>
                <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
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
                  <Chip key={n} label={n} icon="checkmark" active onPress={() => setExtraNames((cur) => cur.filter((x) => x !== n))} />
                ))}
              </View>
              {participantCount < 3 ? (
                <View style={styles.extraRow}>
                  <TextInput
                    value={extraName}
                    onChangeText={setExtraName}
                    placeholder="Ou un autre nom…"
                    placeholderTextColor={colors.textFaint}
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

              <View style={styles.priceLine}>
                <Txt variant="small" color={colors.textMuted}>
                  {fcfa(price)} la session · soit ~{perPlayer(price)}/joueur à 4
                </Txt>
              </View>

              <View style={{ marginTop: spacing.md }}>
                <Button label="Réserver le terrain" icon="checkmark" onPress={confirm} disabled={!court} full />
                <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm, textAlign: 'center' }}>
                  Session de 1h30 · sans paiement en ligne — réglé au club. Annulation jusqu'à 5h avant.
                </Txt>
              </View>
                </>
              )}
            </>
          }
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
  extraRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
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
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.signatureSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    marginTop: spacing.md,
  },
});
