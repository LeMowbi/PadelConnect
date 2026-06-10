import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BookingSheet } from '@/components/BookingSheet';
import { Chip } from '@/components/Chip';
import { Screen } from '@/components/Screen';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Button, Card, EmptyState, Txt } from '@/components/ui';
import { activeClubs, type Club } from '@/data/clubs';
import { seedCompetitions } from '@/data/competitions';
import { clubsFreeAt, freeCourts, openSlotsFor, slotGrid, type AvailCtx } from '@/lib/availability';
import { nextDays, slotTimestamp } from '@/lib/days';
import { fcfa } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing } from '@/theme';

const VIEWS = ['Par heure', 'Par club'] as const;
// Créneaux très demandés en sortie de bureau (indicateur « heure chargée »).
const PRIME_TIMES = new Set(['16:30', '18:00', '19:30']);

export default function ReserverScreen() {
  const router = useRouter();
  const { state, setReserverView } = useApp();

  const days = useMemo(() => nextDays(7), []);
  const [day, setDay] = useState(days[0]);
  // La dernière vue utilisée est mémorisée (l'écran rouvre comme tu l'avais laissé).
  const view = state.reserverView;
  const setView = setReserverView;
  const [sheet, setSheet] = useState<{ club: Club; time: string } | null>(null);

  const visibleClubs = useMemo(() => activeClubs(state.customClubs), [state.customClubs]);
  const ctx: AvailCtx = {
    clubs: visibleClubs,
    clubSlots: state.clubSlots,
    clubCourts: state.clubCourts,
    reservations: state.reservations,
    comps: [...seedCompetitions, ...state.myCompetitions],
  };

  const grid = useMemo(() => slotGrid({ clubs: visibleClubs, clubSlots: state.clubSlots }), [visibleClubs, state.clubSlots]);
  const rows = grid
    .map((time) => {
      const ts = slotTimestamp(day.value, time);
      return { time, ts, clubs: clubsFreeAt(day.key, time, ts, ctx) };
    })
    .filter((r) => r.ts > Date.now()); // on masque les heures déjà passées

  // Vue « Par club » : pour chaque club, ses créneaux encore libres ce jour.
  const byClub = visibleClubs.map((club) => ({
    club,
    slots: openSlotsFor(club, state.clubSlots)
      .map((time) => ({ time, ts: slotTimestamp(day.value, time) }))
      .filter((s) => s.ts > Date.now() && freeCourts(club, day.key, s.time, ctx).length > 0),
  }));

  const open = (club: Club, time: string) => setSheet({ club, time });

  return (
    <Screen back title="Réserver" subtitle="Sessions de 1h30 — on te montre les terrains libres">
      {/* Jour */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.sm }}>
        {days.map((d) => (
          <Chip key={d.label} label={d.label} active={d.label === day.label} onPress={() => setDay(d)} size="lg" />
        ))}
      </ScrollView>

      <SegmentedControl options={VIEWS} value={view} onChange={setView} />

      <View style={styles.legend}>
        <Ionicons name="hand-left-outline" size={15} color={colors.textFaint} />
        <Txt variant="small" color={colors.textFaint} style={{ flex: 1 }}>
          {view === 'Par heure'
            ? 'Touche un club libre pour choisir ton terrain et réserver.'
            : 'Touche une heure libre pour réserver dans ce club.'}
        </Txt>
      </View>

      {view === 'Par heure' ? (
        rows.length === 0 ? (
          <EmptyState icon="time-outline" title="Plus de créneaux" text="Aucun horaire à venir ce jour. Choisis un autre jour." />
        ) : (
          rows.map((row) => (
            <View key={row.time} style={styles.hourBlock}>
              <View style={styles.hourHead}>
                <Ionicons name="time" size={15} color={colors.gold} />
                <Txt variant="h3" style={{ fontSize: 15 }}>
                  {row.time}
                </Txt>
                <Txt variant="small" color={colors.textFaint}>
                  · 1h30
                </Txt>
                {PRIME_TIMES.has(row.time) ? (
                  <View style={styles.primePill}>
                    <Ionicons name="flame" size={11} color={colors.coral} />
                    <Txt variant="small" color={colors.coral} style={{ fontSize: 11, fontWeight: '700' }}>
                      heure chargée
                    </Txt>
                  </View>
                ) : null}
              </View>
              {row.clubs.length === 0 ? (
                <Txt variant="small" color={colors.textFaint} style={{ paddingLeft: spacing.xs }}>
                  Aucun terrain libre à cet horaire.
                </Txt>
              ) : (
                row.clubs.map(({ club, free }) => (
                  <Pressable key={club.id} onPress={() => open(club, row.time)} style={styles.clubMini}>
                    <View style={{ flex: 1 }}>
                      <Txt variant="body" style={{ fontWeight: '700' }} numberOfLines={1}>
                        {club.name}
                      </Txt>
                      <Txt variant="small" color={colors.textMuted} numberOfLines={1}>
                        {club.area}
                      </Txt>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 3 }}>
                      <View style={styles.freeDot}>
                        <Txt variant="small" color={colors.green} style={{ fontWeight: '700' }}>
                          {free} libre{free > 1 ? 's' : ''}
                        </Txt>
                      </View>
                      <Txt variant="small" color={colors.gold} style={{ fontWeight: '700' }}>
                        dès {fcfa(club.priceFrom)}
                      </Txt>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </Pressable>
                ))
              )}
            </View>
          ))
        )
      ) : (
        byClub.map(({ club, slots }) => (
          <Card key={club.id} style={{ marginBottom: spacing.md }}>
            <View style={styles.clubHead}>
              <View style={{ flex: 1 }}>
                <Txt variant="h3">{club.name}</Txt>
                <Txt variant="small" color={colors.textMuted}>
                  {club.area}
                </Txt>
              </View>
              <Txt variant="small" color={colors.gold} style={{ fontWeight: '700' }}>
                dès {fcfa(club.priceFrom)}
              </Txt>
            </View>
            {slots.length === 0 ? (
              <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
                Aucun créneau libre ce jour.
              </Txt>
            ) : (
              <View style={styles.slotWrap}>
                {slots.map((s) => (
                  <Chip key={s.time} label={s.time} icon={PRIME_TIMES.has(s.time) ? 'flame' : undefined} onPress={() => open(club, s.time)} />
                ))}
              </View>
            )}
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
  hourBlock: { marginBottom: spacing.lg },
  hourHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm, paddingLeft: spacing.xs },
  primePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.coralSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginLeft: 4,
  },
  clubMini: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  freeDot: { backgroundColor: colors.greenSoft, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  clubHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  slotWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
});
