import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BookingSheet } from '@/components/BookingSheet';
import { Chip } from '@/components/Chip';
import { Screen } from '@/components/Screen';
import { Button, Card, EmptyState, Txt } from '@/components/ui';
import type { Club } from '@/data/clubs';
import { seedCompetitions } from '@/data/competitions';
import { clubsFreeAt, slotGrid, type AvailCtx } from '@/lib/availability';
import { nextDays, slotTimestamp } from '@/lib/days';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing } from '@/theme';

export default function ReserverScreen() {
  const router = useRouter();
  const { state } = useApp();

  const days = useMemo(() => nextDays(7), []);
  const [day, setDay] = useState(days[0]);
  const [sheet, setSheet] = useState<{ club: Club; time: string } | null>(null);

  const ctx: AvailCtx = {
    clubSlots: state.clubSlots,
    clubCourts: state.clubCourts,
    reservations: state.reservations,
    comps: [...seedCompetitions, ...state.myCompetitions],
  };

  const grid = useMemo(() => slotGrid(state.clubSlots), [state.clubSlots]);
  const rows = grid
    .map((time) => {
      const ts = slotTimestamp(day.value, time);
      return { time, ts, clubs: clubsFreeAt(day.key, time, ts, ctx) };
    })
    .filter((r) => r.ts > Date.now()); // on masque les heures déjà passées

  const open = (club: Club, time: string) => setSheet({ club, time });

  return (
    <Screen title="Réserver" subtitle="Choisis un créneau — on te montre les terrains libres">
      {/* Jour */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.sm }}>
        {days.map((d) => (
          <Chip key={d.label} label={d.label} active={d.label === day.label} onPress={() => setDay(d)} size="lg" />
        ))}
      </ScrollView>

      <View style={styles.legend}>
        <Ionicons name="hand-left-outline" size={15} color={colors.textFaint} />
        <Txt variant="small" color={colors.textFaint} style={{ flex: 1 }}>
          Touche un club libre pour choisir ton terrain et réserver.
        </Txt>
      </View>

      {rows.length === 0 ? (
        <EmptyState icon="time-outline" title="Plus de créneaux" text="Aucun horaire à venir ce jour. Choisis un autre jour." />
      ) : (
        rows.map((row) => (
          <Card key={row.time} style={styles.slot}>
            <View style={styles.timeCol}>
              <Ionicons name="time" size={16} color={colors.gold} />
              <Txt variant="h3" style={{ fontSize: 16 }}>
                {row.time}
              </Txt>
            </View>
            <View style={styles.clubsCol}>
              {row.clubs.length === 0 ? (
                <Txt variant="small" color={colors.textFaint}>
                  Aucun terrain libre
                </Txt>
              ) : (
                row.clubs.map(({ club, free }) => (
                  <Pressable key={club.id} onPress={() => open(club, row.time)} style={styles.clubChip}>
                    <Txt variant="small" color={colors.text} style={{ fontWeight: '700' }}>
                      {club.name}
                    </Txt>
                    <View style={styles.freeDot}>
                      <Txt variant="small" color={colors.green} style={{ fontWeight: '700' }}>
                        {free} libre{free > 1 ? 's' : ''}
                      </Txt>
                    </View>
                  </Pressable>
                ))
              )}
            </View>
          </Card>
        ))
      )}

      <View style={{ marginTop: spacing.lg }}>
        <Button label="Parcourir les clubs (carte, photos, avis)" icon="business-outline" variant="secondary" onPress={() => router.push('/clubs')} full />
      </View>

      {sheet ? <BookingSheet club={sheet.club} day={day} time={sheet.time} onClose={() => setSheet(null)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md, paddingHorizontal: spacing.xs },
  slot: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.md },
  timeCol: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 64, paddingTop: 6 },
  clubsCol: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  clubChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  freeDot: { backgroundColor: colors.greenSoft, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
});
