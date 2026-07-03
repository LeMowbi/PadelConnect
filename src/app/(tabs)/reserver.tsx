import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BookingSheet } from '@/components/BookingSheet';
import { Chip } from '@/components/Chip';
import { OpenMatches } from '@/components/OpenMatches';
import { Reveal } from '@/components/Reveal';
import { Screen } from '@/components/Screen';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Button, Card, EmptyState, Txt } from '@/components/ui';
import { activeClubs, isFeaturedClub, type Club } from '@/data/clubs';
import { seedCompetitions } from '@/data/competitions';
import { clubsFreeAt, freeCourts, openSlotsFor, slotGrid, type AvailCtx } from '@/lib/availability';
import { nextDays, slotTimestamp, type DayOption } from '@/lib/days';
import { hapticLight } from '@/lib/haptics';
import { fcfa, perPlayer } from '@/lib/format';
import { minPrice, priceForSlot } from '@/lib/pricing';
import { usePullToRefresh } from '@/lib/usePullToRefresh';
import { useTodayKey } from '@/lib/useTodayKey';
import { useApp } from '@/store/AppContext';
import { colors, radius, shadows, spacing } from '@/theme';

const VIEWS = ['Par heure', 'Par club'] as const;
const DOW = ['DIM', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM'];
// Créneaux très demandés en sortie de bureau (indicateur « heure chargée »).
const PRIME_TIMES = new Set(['16:30', '18:00', '19:30']);

export default function ReserverScreen() {
  const router = useRouter();
  const { state, setReserverView } = useApp();
  // Tirer pour rafraîchir : resynchronise la session ET les matchs ouverts. `refreshToken` est
  // juste passé en prop (PAS en `key`) : remonter OpenMatches réinitialiserait son état à
  // `undefined` et ferait disparaître la section hors-ligne (échec réseau → null → rien affiché,
  // en violation de la convention §8) et clignoter la section à chaque pull en ligne.
  const [refreshToken, setRefreshToken] = useState(0);
  const { refreshControl } = usePullToRefresh(async () => setRefreshToken((n) => n + 1));

  // todayKey : recalcule la liste après minuit (retour premier plan) — sinon « AUJ. »
  // resterait collé à la veille et la journée paraîtrait terminée au réveil.
  const todayKey = useTodayKey();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const days = useMemo(() => nextDays(7), [todayKey]);
  const visibleClubs = useMemo(
    () => activeClubs(state.customClubs, state.clubInfo),
    // state.clubStatus : dépendance indirecte (activeClubs lit clubStatusMap) — cf. clubs/index.tsx.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.customClubs, state.clubInfo, state.clubStatus],
  );
  // Grille = union des créneaux RÉELLEMENT ouverts par les clubs visibles (peut dépasser SAMPLE_SLOTS).
  const grid = useMemo(() => slotGrid({ clubs: visibleClubs, clubSlots: state.clubSlots }), [visibleClubs, state.clubSlots]);
  // Le soir, quand TOUS les créneaux réellement proposés du jour sont passés, on ouvre sur Demain.
  const todayOver = useMemo(() => !grid.some((t) => slotTimestamp(days[0].key, t) > Date.now()), [grid, days]);
  // On ne stocke QUE la clé du jour choisi et on dérive l’objet à chaque rendu (motif
  // SectionReservations.tsx) : sinon, après une nuit en arrière-plan, `days` est recalé par
  // useTodayKey mais `day` reste figé sur l’ancien objet (veille) → plus aucune pastille
  // sélectionnée et un EmptyState « Plus de créneaux » affiché à tort.
  const [selDayKey, setSelDayKey] = useState<string | null>(null);
  const day = days.find((d) => d.key === selDayKey) ?? (todayOver ? days[1] : days[0]);
  const [slot, setSlot] = useState<string | null>(null); // créneau choisi (vue « Par heure » guidée)
  // La dernière vue utilisée est mémorisée (l’écran rouvre comme tu l’avais laissé).
  const view = state.reserverView;
  const setView = setReserverView;
  const [sheet, setSheet] = useState<{ club: Club; time: string } | null>(null);
  const pickDay = (d: DayOption) => {
    hapticLight(); // tap léger à chaque étape du tunnel (jour → créneau → terrain)
    setSelDayKey(d.key);
    setSlot(null);
  };
  const pickSlot = (time: string) => {
    hapticLight();
    setSlot(time);
  };

  // Contexte de disponibilité mémoïsé (balayé par les deux vues ci-dessous, pour tous les
  // clubs × créneaux) : sans ça, il était recréé à chaque rendu, invalidant toute mémoïsation
  // en aval — motif déjà appliqué dans reserver/[clubId].tsx.
  const ctx = useMemo<AvailCtx>(
    () => ({
      clubs: visibleClubs,
      clubSlots: state.clubSlots,
      clubCourts: state.clubCourts,
      reservations: state.reservations,
      occupancy: state.occupancy,
      comps: [...seedCompetitions, ...state.myCompetitions],
      blocked: state.blockedSlots,
    }),
    [visibleClubs, state.clubSlots, state.clubCourts, state.reservations, state.occupancy, state.myCompetitions, state.blockedSlots],
  );

  // Priorité d’affichage des clubs : Padelta (règle porteur) → mes FAVORIS (l’habitué
  // re-réserve en un geste) → le reste en ordre alphabétique (ordre d’activeClubs).
  const favIds = state.favoriteClubIds;
  const clubRank = (c: Club) => (isFeaturedClub(c.id) ? 0 : favIds.includes(c.id) ? 1 : 2);

  // Vue « Par heure » : mémoïsée et calculée SEULEMENT quand elle est active (coûteux — balaye
  // tous les clubs par créneau) ; recalculée si le contexte de dispo, le jour ou la grille bougent.
  const rows = useMemo(() => {
    if (view !== 'Par heure') return [];
    return grid
      .map((time) => {
        const ts = slotTimestamp(day.key, time);
        return { time, ts, clubs: clubsFreeAt(day.key, time, ts, ctx) };
      })
      .filter((r) => r.ts > Date.now()); // on masque les heures déjà passées
  }, [view, grid, day.key, ctx]);
  const selectedRow = rows.find((r) => r.time === slot) ?? null;

  // Vue « Par club » : pour chaque club, ses créneaux encore libres ce jour. Les clubs
  // « Bientôt » (pas encore réservables) sont exclus, comme dans la vue « Par heure ».
  // Mémoïsée et calculée SEULEMENT quand elle est active, même motif que `rows` ci-dessus.
  const byClub = useMemo(() => {
    if (view !== 'Par club') return [];
    return (
      visibleClubs
        .filter((club) => !club.comingSoon)
        .map((club) => ({
          club,
          slots: openSlotsFor(club, state.clubSlots)
            .map((time) => ({ time, ts: slotTimestamp(day.key, time) }))
            .filter((s) => s.ts > Date.now() && freeCourts(club, day.key, s.time, ctx).length > 0),
        }))
        // Tri STABLE par priorité : à rang égal, l’ordre alphabétique de visibleClubs est conservé.
        .sort((a, b) => clubRank(a.club) - clubRank(b.club))
    );
    // clubRank est une fonction pure de favIds (isFeaturedClub est stable) : favIds suffit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, visibleClubs, state.clubSlots, day.key, ctx, favIds]);

  const open = (club: Club, time: string) => {
    hapticLight(); // aligné sur pickDay/pickSlot : tout le tunnel « Réserver » émet un tap léger
    setSheet({ club, time });
  };

  const isToday = day.key === days[0].key;
  const goTomorrow = () => setSelDayKey(days[1].key);
  const noSlotsByClub = !byClub.some((b) => b.slots.length > 0);

  return (
    <Screen title="Réserver" subtitle="Sessions de 1h30 — on te montre les terrains libres" refreshControl={refreshControl}>
      <Reveal>
        {/* Jour — pastilles (maquette) : jour abrégé + numéro, signature si actif */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.sm }}
        >
          {days.map((d, i) => {
            const dd = new Date(d.value);
            const active = d.key === day.key;
            return (
              <Pressable
                key={d.key}
                onPress={() => pickDay(d)}
                style={[styles.dayPill, active && styles.dayPillActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${i === 0 ? 'Aujourd’hui' : DOW[dd.getUTCDay()]} ${dd.getUTCDate()}`}
              >
                <Txt variant="small" color={active ? colors.onSignature : colors.textFaint} style={{ fontSize: 10, fontWeight: '700' }}>
                  {i === 0 ? 'AUJ.' : DOW[dd.getUTCDay()]}
                </Txt>
                <Txt variant="h3" color={active ? colors.onSignature : colors.text} style={{ fontSize: 18 }}>
                  {dd.getUTCDate()}
                </Txt>
              </Pressable>
            );
          })}
        </ScrollView>

        {todayOver && day.key === days[1].key ? (
          <View style={styles.autoHint}>
            <Ionicons name="moon-outline" size={13} color={colors.textMuted} />
            <Txt variant="small" color={colors.textMuted}>
              Plus de créneaux aujourd’hui — voici demain.
            </Txt>
          </View>
        ) : null}

        <SegmentedControl options={VIEWS} value={view} onChange={setView} />

        <View style={styles.legend}>
          <Ionicons name="hand-left-outline" size={15} color={colors.textMuted} />
          <Txt variant="small" color={colors.textMuted} style={{ flex: 1 }}>
            {view === 'Par heure' ? 'Choisis un créneau, puis le club où réserver.' : 'Touche une heure libre pour réserver dans ce club.'}
          </Txt>
        </View>

        {view === 'Par heure' ? (
          rows.length === 0 ? (
            <View>
              <EmptyState
                icon="time-outline"
                title={isToday ? 'Plus de créneaux aujourd’hui' : 'Plus de créneaux'}
                text={isToday ? 'La journée est terminée.' : 'Aucun horaire à venir ce jour. Choisis un autre jour.'}
              />
              {isToday ? <Button label="Voir demain" icon="arrow-forward" onPress={goTomorrow} /> : null}
            </View>
          ) : (
            <>
              {/* Grille de créneaux (maquette) : on choisit d’abord l’heure */}
              <Txt variant="label" color={colors.textFaint} style={{ marginBottom: spacing.sm }}>
                Choisis un créneau · 1h30
              </Txt>
              <View style={styles.slotGrid}>
                {rows.map((row) => {
                  const sel = slot === row.time;
                  const none = row.clubs.length === 0;
                  return (
                    <Pressable
                      key={row.time}
                      disabled={none}
                      onPress={() => pickSlot(row.time)}
                      style={[styles.slotTile, sel ? styles.slotTileSel : none ? styles.slotTileOff : styles.slotTileFree]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: sel, disabled: none }}
                      accessibilityLabel={`${row.time}, ${none ? 'complet' : `${row.clubs.length} club${row.clubs.length > 1 ? 's' : ''} libre${row.clubs.length > 1 ? 's' : ''}`}`}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Txt variant="h3" color={sel ? colors.onSignature : colors.text} style={{ fontSize: 18 }}>
                          {row.time}
                        </Txt>
                        {PRIME_TIMES.has(row.time) && !sel ? <Ionicons name="flame" size={12} color={colors.coral} /> : null}
                      </View>
                      <Txt
                        variant="small"
                        color={sel ? colors.onSignature : none ? colors.textFaint : colors.green}
                        style={{ fontWeight: '700', fontSize: 11 }}
                      >
                        {none
                          ? 'Complet'
                          : `${row.clubs.length} club${row.clubs.length > 1 ? 's' : ''} libre${row.clubs.length > 1 ? 's' : ''}`}
                      </Txt>
                    </Pressable>
                  );
                })}
              </View>

              {/* Clubs disponibles pour le créneau choisi */}
              {selectedRow ? (
                <View style={{ marginTop: spacing.lg }}>
                  <View style={styles.infoPill}>
                    <Ionicons name="business-outline" size={15} color={colors.blue} />
                    <Txt variant="small" color={colors.text} style={{ flex: 1 }}>
                      {selectedRow.clubs.length} club{selectedRow.clubs.length > 1 ? 's ont' : ' a'} ce créneau libre · {slot}
                    </Txt>
                  </View>
                  {/* Même priorité que « Par club » : Padelta, puis mes favoris, puis le reste. */}
                  {[...selectedRow.clubs]
                    .sort((a, b) => clubRank(a.club) - clubRank(b.club))
                    .map(({ club, free }) => (
                      <Pressable
                        key={club.id}
                        onPress={() => open(club, selectedRow.time)}
                        style={styles.clubMini}
                        accessibilityRole="button"
                        accessibilityLabel={`${club.name}, ${free} terrain${free > 1 ? 's' : ''} libre${free > 1 ? 's' : ''}, ${fcfa(priceForSlot(club, selectedRow.time))}`}
                      >
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
                          <Txt variant="small" color={colors.signature} style={{ fontWeight: '700' }}>
                            {fcfa(priceForSlot(club, selectedRow.time))}
                          </Txt>
                          <Txt variant="small" color={colors.textFaint} style={{ fontSize: 11 }}>
                            ~{perPlayer(priceForSlot(club, selectedRow.time))}/joueur à 4
                          </Txt>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                      </Pressable>
                    ))}
                </View>
              ) : (
                <View style={[styles.infoPill, { marginTop: spacing.lg }]}>
                  <Ionicons name="hand-left-outline" size={15} color={colors.textMuted} />
                  <Txt variant="small" color={colors.textMuted} style={{ flex: 1 }}>
                    Choisis un créneau ci-dessus pour voir les clubs libres.
                  </Txt>
                </View>
              )}
            </>
          )
        ) : noSlotsByClub ? (
          <View>
            <EmptyState
              icon="time-outline"
              title={isToday ? 'Plus de créneaux aujourd’hui' : 'Aucun créneau libre'}
              text={isToday ? 'La journée est terminée.' : 'Choisis un autre jour.'}
            />
            {isToday ? <Button label="Voir demain" icon="arrow-forward" onPress={goTomorrow} /> : null}
          </View>
        ) : (
          byClub
            .filter((b) => b.slots.length > 0)
            .map(({ club, slots }) => (
              <Card key={club.id} style={{ marginBottom: spacing.md }}>
                <View style={styles.clubHead}>
                  <View style={{ flex: 1 }}>
                    <Txt variant="h3">{club.name}</Txt>
                    <Txt variant="small" color={colors.textMuted}>
                      {club.area}
                    </Txt>
                  </View>
                  <Txt variant="small" color={colors.signature} style={{ fontWeight: '700' }}>
                    dès {fcfa(minPrice(club))}
                  </Txt>
                </View>
                <View style={styles.slotWrap}>
                  {slots.map((s) => (
                    <Chip
                      key={s.time}
                      label={`${s.time} · ${fcfa(priceForSlot(club, s.time))}`}
                      icon={PRIME_TIMES.has(s.time) ? 'flame' : undefined}
                      onPress={() => open(club, s.time)}
                    />
                  ))}
                </View>
              </Card>
            ))
        )}

        {/* Matchs ouverts : des joueurs cherchent du monde (le prix du terrain se partage). */}
        {state.serverUserId ? <OpenMatches refreshToken={refreshToken} /> : null}

        <View style={{ marginTop: spacing.lg }}>
          <Button
            label="Parcourir les clubs (carte, photos, avis)"
            icon="business-outline"
            variant="secondary"
            onPress={() => router.push('/clubs')}
            full
          />
        </View>

        {sheet ? <BookingSheet club={sheet.club} day={day} time={sheet.time} onClose={() => setSheet(null)} /> : null}
      </Reveal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  dayPill: {
    minWidth: 54,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  dayPillActive: { backgroundColor: colors.signature, borderColor: colors.signature, ...shadows.e1 },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  slotTile: { width: '47.5%', flexGrow: 1, borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.md, gap: 4 },
  slotTileFree: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  slotTileSel: { backgroundColor: colors.signature, ...shadows.e2 },
  slotTileOff: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, opacity: 0.6 },
  infoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.blueSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  legend: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md, paddingHorizontal: spacing.xs },
  autoHint: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.xs },
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
