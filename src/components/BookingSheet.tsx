import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Chip } from './Chip';
import { Confetti } from './Confetti';
import { Button, Txt } from './ui';
import type { Club } from '@/data/clubs';
import { seedCompetitions } from '@/data/competitions';
import { freeCourts, type AvailCtx } from '@/lib/availability';
import { slotTimestamp, type DayOption } from '@/lib/days';
import { fcfa } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing } from '@/theme';

// Réservation rapide « en place » : une fiche qui monte du bas, sans changer de page.
// 2 gestes suffisent : ouvrir → Réserver (le 1ᵉʳ terrain libre est présélectionné).
export function BookingSheet({ club, day, time, onClose }: { club: Club; day: DayOption; time: string; onClose: () => void }) {
  const router = useRouter();
  const { state, addReservation } = useApp();

  const ctx: AvailCtx = {
    clubSlots: state.clubSlots,
    clubCourts: state.clubCourts,
    reservations: state.reservations,
    comps: [...seedCompetitions, ...state.myCompetitions],
  };
  const free = useMemo(
    () => freeCourts(club, day.key, time, ctx),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [club.id, day.key, time, state.reservations, state.clubCourts]
  );

  const [court, setCourt] = useState<string | null>(free[0] ?? null);
  const [players, setPlayers] = useState(4);
  const [done, setDone] = useState(false);

  const confirm = () => {
    if (!court) return;
    const ok = addReservation({ clubId: club.id, clubName: club.name, court, date: day.label, dateKey: day.key, time, startsAt: slotTimestamp(day.value, time), players, invited: [] });
    if (ok) setDone(true);
    else setCourt(free.find((c) => c !== court) ?? null); // terrain pris entre-temps : on repropose
  };

  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} />
      {done ? <Confetti /> : null}
      <View style={styles.wrapper} pointerEvents="box-none">
        <View style={styles.sheet}>
          <View style={styles.handle} />

          {done ? (
            <View style={{ alignItems: 'center', paddingVertical: spacing.md }}>
              <Ionicons name="checkmark-circle" size={60} color={colors.green} />
              <Txt variant="h2" style={{ marginTop: spacing.sm }}>
                Terrain réservé 🎾
              </Txt>
              <Txt variant="muted" style={{ marginTop: 4, textAlign: 'center' }}>
                {club.name} · {day.label} à {time}
              </Txt>
              <View style={styles.badge}>
                <Ionicons name="tennisball" size={15} color={colors.gold} />
                <Txt variant="small" color={colors.gold} style={{ fontWeight: '700' }}>
                  {court} · {players} joueurs
                </Txt>
              </View>
              <View style={{ alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.lg }}>
                <Button label="Voir mes réservations" icon="calendar" onPress={() => { onClose(); router.push('/profil'); }} full />
                <Button label="Terminé" variant="ghost" onPress={onClose} full />
              </View>
            </View>
          ) : (
            <>
              <View style={styles.head}>
                <View style={{ flex: 1 }}>
                  <Txt variant="h2" style={{ fontSize: 20 }}>
                    {club.name}
                  </Txt>
                  <Txt variant="muted">
                    {day.label} · {time} · dès {fcfa(club.priceFrom)}/h
                  </Txt>
                </View>
                <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
                  <Ionicons name="close" size={20} color={colors.textMuted} />
                </Pressable>
              </View>

              <Txt variant="label" color={colors.textFaint} style={{ marginTop: spacing.lg }}>
                TERRAIN
              </Txt>
              <View style={styles.row}>
                {free.map((c) => (
                  <Chip key={c} label={c} active={c === court} onPress={() => setCourt(c)} size="lg" />
                ))}
              </View>

              <Txt variant="label" color={colors.textFaint} style={{ marginTop: spacing.lg }}>
                JOUEURS
              </Txt>
              <View style={styles.row}>
                {[2, 3, 4].map((p) => (
                  <Chip key={p} label={`${p}`} active={p === players} onPress={() => setPlayers(p)} size="lg" />
                ))}
              </View>

              <View style={{ marginTop: spacing.xl }}>
                <Button label="Réserver le terrain" icon="checkmark" onPress={confirm} disabled={!court} full />
                <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm, textAlign: 'center' }}>
                  Sans paiement en ligne — réglé au club. Annulation jusqu'à 5h avant.
                </Txt>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.overlay },
  wrapper: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: radius.pill, backgroundColor: colors.border, marginBottom: spacing.md },
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
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.goldSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    marginTop: spacing.md,
  },
});
