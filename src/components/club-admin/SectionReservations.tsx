import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { BarChart } from '@/components/BarChart';
import { Button, Card, Divider, IconCircle, SectionHeader, StatTile, Tag, Txt } from '@/components/ui';
import { LegendDot } from '@/components/club-admin/LegendDot';
import { QuickBlock } from '@/components/club-admin/QuickBlock';
import { type Club } from '@/data/clubs';
import { hasCompetition } from '@/lib/availability';
import { nextDays, weekKeyOf, weekLabel } from '@/lib/days';
import { openWhatsApp } from '@/lib/contact';
import { isPlayed, useApp, type Reservation } from '@/store/AppContext';
import { colors, radius, shadows, spacing } from '@/theme';

type SelectedCell = { dateKey: string; time: string; label: string; value: number };

export function SectionReservations({
  club,
  comps,
  onSelectCell,
}: {
  club: Club;
  comps: import('@/data/competitions').Competition[];
  onSelectCell: (cell: SelectedCell) => void;
}) {
  const { state, blockSlot, unblockSlot, confirmReservationByClub } = useApp();
  const [planDayKey, setPlanDayKey] = useState<string | null>(null);
  const [showBlockForm, setShowBlockForm] = useState(false);

  const now = Date.now();
  const clubRes = state.reservations.filter((r) => r.clubId === club.id);
  // « Jouée » = heure de fin passée (la même règle que côté joueur — base de la commission).
  const upcomingRes = clubRes.filter((r) => !isPlayed(r, now)).sort((a, b) => a.startsAt - b.startsAt);
  const pastRes = clubRes.filter((r) => isPlayed(r, now)).sort((a, b) => b.startsAt - a.startsAt);
  // Historique regroupé PAR SEMAINE (le décompte de la commission est hebdomadaire).
  const pastByWeek: { week: string; items: Reservation[] }[] = [];
  for (const r of pastRes) {
    const wk = weekKeyOf(r.startsAt);
    const g = pastByWeek.find((x) => x.week === wk);
    if (g) g.items.push(r);
    else pastByWeek.push({ week: wk, items: [r] });
  }
  // Blocages hors app de ce club.
  const clubBlocked = state.blockedSlots.filter((b) => b.clubId === club.id);

  // Planning par TERRAIN pour un jour donné (maquette Espace Club · planning).
  const week = nextDays(7);
  const openSlots = state.clubSlots[club.id] ?? [];
  const courts = state.clubCourts[club.id] ?? [];
  const planTimes = [...openSlots].sort();
  const planDay = week.find((d) => d.key === planDayKey) ?? week[0];
  const dayTournament = hasCompetition(club.id, planDay.key, comps);
  // Statut d'UN terrain à un créneau — calculé depuis les données existantes (réservations
  // app + blocages hors app), aucune logique de disponibilité nouvelle.
  const courtStatusAt = (court: string, time: string): 'reserved' | 'blocked' | 'tournoi' | 'free' => {
    if (dayTournament) return 'tournoi';
    if (clubRes.some((r) => r.dateKey === planDay.key && r.time === time && r.court === court)) return 'reserved';
    if (clubBlocked.some((b) => b.dateKey === planDay.key && b.time === time && b.court === court)) return 'blocked';
    return 'free';
  };

  // Mini-stats de la semaine : taux d'occupation + créneau le plus demandé.
  const weekKeys = new Set(week.map((d) => d.key));
  const weekRes = clubRes.filter((r) => weekKeys.has(r.dateKey));
  const capacity = Math.max(1, planTimes.length * courts.length * 7);
  const occupancy = Math.round((weekRes.length / capacity) * 100);
  const byHour = new Map<string, number>();
  for (const r of weekRes) byHour.set(r.time, (byHour.get(r.time) ?? 0) + 1);
  const topHour = [...byHour.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

  return (
    <>
      {/* Vue d'ensemble */}
      <View style={styles.stats}>
        <StatTile value={upcomingRes.length} label="À venir" color={colors.signature} bg={colors.signatureSoft} />
        <StatTile value={pastRes.length} label="Jouées" color={colors.blue} bg={colors.blueSoft} />
        <StatTile value={clubRes.length} label="Total" color={colors.green} bg={colors.greenSoft} />
      </View>

      {/* Bloquer un créneau réservé hors app (téléphone, WhatsApp, sur place) */}
      <View style={{ marginTop: spacing.md }}>
        <Button
          size="sm"
          label={showBlockForm ? 'Fermer' : '+ Bloquer un créneau (résa hors app)'}
          icon={showBlockForm ? 'chevron-up' : 'lock-closed'}
          variant="secondary"
          onPress={() => setShowBlockForm((v) => !v)}
          full
        />
      </View>
      {showBlockForm ? (
        <QuickBlock
          days={week}
          times={openSlots}
          courts={courts}
          dayHasTournament={(dKey) => hasCompetition(club.id, dKey, comps)}
          courtStatus={(dKey, time, court) => {
            const resa = clubRes.find((r) => r.dateKey === dKey && r.time === time && r.court === court);
            if (resa) return { state: 'reserved', label: resa.bookedBy?.name ?? 'Joueur' };
            const blk = clubBlocked.find((b) => b.dateKey === dKey && b.time === time && b.court === court);
            if (blk) return { state: 'blocked', label: blk.reason };
            return { state: 'free' };
          }}
          onBlock={(dKey, time, court, reason, ts) => blockSlot({ clubId: club.id, dateKey: dKey, time, court, reason }, ts)}
          onUnblock={(dKey, time, court) => unblockSlot(club.id, dKey, time, court)}
        />
      ) : null}

      {/* Planning par terrain (jour sélectionné) — maquette Espace Club */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Planning du jour" />
        {/* Sélecteur de jour */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.sm }}>
          {week.map((d) => {
            const dd = new Date(d.value);
            const active = d.key === planDay.key;
            return (
              <Pressable key={d.key} onPress={() => setPlanDayKey(d.key)} style={[styles.dayPill, active && styles.dayPillActive]}>
                <Txt variant="small" color={active ? colors.onSignature : colors.textFaint} style={{ fontSize: 10, fontWeight: '700' }}>
                  {['DIM', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM'][dd.getDay()]}
                </Txt>
                <Txt variant="h3" color={active ? colors.onSignature : colors.text} style={{ fontSize: 16 }}>
                  {dd.getDate()}
                </Txt>
              </Pressable>
            );
          })}
        </ScrollView>

        <Card>
          {dayTournament ? (
            <View style={styles.banner}>
              <Ionicons name="trophy" size={16} color={colors.purple} />
              <Txt variant="small" color={colors.text} style={{ flex: 1 }}>
                Jour de tournoi — tous les terrains sont indisponibles.
              </Txt>
            </View>
          ) : null}
          {/* Grille terrains × créneaux (défilement horizontal) */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              {/* En-tête : créneaux */}
              <View style={styles.gridRow}>
                <View style={styles.gridCourtName} />
                {planTimes.map((t) => (
                  <View key={t} style={styles.gridCell}>
                    <Txt variant="small" color={colors.textFaint} style={{ fontSize: 10 }}>{t}</Txt>
                  </View>
                ))}
              </View>
              {courts.map((court) => (
                <View key={court} style={styles.gridRow}>
                  <View style={styles.gridCourtName}>
                    <Txt variant="small" style={{ fontWeight: '700', fontSize: 12 }} numberOfLines={1}>{court}</Txt>
                  </View>
                  {planTimes.map((t) => {
                    const st = courtStatusAt(court, t);
                    const cellStyle =
                      st === 'reserved' ? styles.gcReserved : st === 'blocked' ? styles.gcBlocked : st === 'tournoi' ? styles.gcTournoi : styles.gcFree;
                    return (
                      <Pressable
                        key={t}
                        onPress={() => onSelectCell({ dateKey: planDay.key, time: t, label: `${planDay.label} · ${t}`, value: planDay.value })}
                        style={[styles.gridCellBox, cellStyle]}
                      >
                        {st === 'reserved' ? <Ionicons name="checkmark" size={12} color={colors.onSignature} /> : null}
                        {st === 'blocked' ? <Ionicons name="lock-closed" size={11} color={colors.textFaint} /> : null}
                        {st === 'tournoi' ? <Ionicons name="trophy" size={11} color={colors.onSignature} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          </ScrollView>
          <View style={styles.planLegend}>
            <LegendDot color={colors.signature} label="Réservé" />
            <LegendDot color={colors.surface} label="Libre" />
            <LegendDot color={colors.surfaceAlt} label="Bloqué" />
          </View>
          <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
            Touche une case pour voir le détail du créneau ou bloquer un terrain.
          </Txt>
        </Card>

        {/* Mini-stats de la semaine */}
        <View style={[styles.stats, { marginTop: spacing.md }]}>
          <StatTile value={`${occupancy}%`} label="Occupation (7 j)" color={colors.green} bg={colors.greenSoft} />
          <StatTile value={weekRes.length} label="Résas (7 j)" color={colors.blue} bg={colors.blueSoft} />
          <StatTile value={topHour} label="Heure phare" color={colors.purple} bg={colors.purpleSoft} />
        </View>

        {/* Remplissage par créneau sur la semaine (données réelles) */}
        {weekRes.length > 0 ? (
          <Card style={{ marginTop: spacing.md }}>
            <Txt variant="label" color={colors.textFaint} style={{ marginBottom: spacing.md }}>
              Remplissage par créneau (7 j)
            </Txt>
            <BarChart data={planTimes.map((t) => ({ label: t, value: weekRes.filter((r) => r.time === t).length }))} />
          </Card>
        ) : null}
      </View>

      {/* À venir — à confirmer */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title={`Réservations à venir · ${upcomingRes.length}`} />
        {upcomingRes.length === 0 ? (
          <Card>
            <Txt variant="muted">
              Aucune réservation à venir pour {club.name}. Dès qu'un joueur réserve, elle apparaît ici avec son nom et son numéro.
            </Txt>
          </Card>
        ) : (
          upcomingRes.map((r) => (
            <Card key={r.id} style={{ marginBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <IconCircle icon="time" color={colors.signature} bg={colors.signatureSoft} size={40} />
                <View style={{ flex: 1 }}>
                  <Txt variant="h3" style={{ fontSize: 15 }}>
                    {r.date} · {r.time}
                  </Txt>
                  <Txt variant="muted">{r.court} · {r.players} joueur{r.players > 1 ? 's' : ''}</Txt>
                  {r.bookedBy ? (
                    <Txt variant="small" color={colors.textMuted}>
                      Réservé par {r.bookedBy.name}{r.bookedBy.phone ? ` · ${r.bookedBy.phone}` : ''}
                    </Txt>
                  ) : null}
                </View>
                {r.clubConfirmed ? <Tag label="Confirmée ✓" tone="green" /> : <Tag label="À confirmer" tone="coral" />}
              </View>
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Button
                    size="sm"
                    label={r.clubConfirmed ? 'Annuler la confirmation' : 'Confirmer la réservation'}
                    icon={r.clubConfirmed ? 'close' : 'checkmark'}
                    variant={r.clubConfirmed ? 'ghost' : 'primary'}
                    onPress={() => confirmReservationByClub(r.id)}
                    full
                  />
                </View>
                {r.bookedBy?.phone ? (
                  <Button
                    size="sm"
                    label="WhatsApp"
                    icon="logo-whatsapp"
                    variant="secondary"
                    onPress={() =>
                      openWhatsApp(
                        r.bookedBy!.phone,
                        `Bonjour ${r.bookedBy!.name}, votre réservation du ${r.date} à ${r.time} (${r.court}) à ${club.name} est bien confirmée ✅`
                      )
                    }
                  />
                ) : null}
              </View>
            </Card>
          ))
        )}
      </View>

      {/* Historique du club — regroupé par semaine, base de la commission PadelConnect */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title={`Historique · ${pastRes.length}`} />
        {pastRes.length === 0 ? (
          <Card>
            <Txt variant="muted">Les réservations déjà jouées s'afficheront ici, semaine par semaine.</Txt>
          </Card>
        ) : (
          pastByWeek.map((g) => (
            <Card key={g.week} style={{ marginBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
                <Txt variant="label" color={colors.textFaint}>
                  Semaine {weekLabel(g.week)}
                </Txt>
                <Tag label={`${g.items.length} jouée${g.items.length > 1 ? 's' : ''}`} tone="blue" />
              </View>
              {g.items.map((r, i) => (
                <View key={r.id}>
                  {i > 0 ? <Divider style={{ marginVertical: spacing.sm }} /> : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <View style={{ flex: 1 }}>
                      <Txt variant="body" style={{ fontWeight: '600' }}>
                        {r.date} · {r.time} · {r.court}
                      </Txt>
                      {r.bookedBy ? (
                        <Txt variant="small" color={colors.textFaint}>
                          {r.bookedBy.name}
                        </Txt>
                      ) : null}
                    </View>
                  </View>
                </View>
              ))}
            </Card>
          ))
        )}
        <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
          La commission PadelConnect se calcule sur cet historique — décompte transmis chaque fin de
          semaine, règlement par Wave.
        </Txt>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: spacing.sm },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.purpleSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  // Planning par terrain (maquette) : pastilles de jour + grille terrains × créneaux.
  dayPill: {
    minWidth: 50,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  dayPillActive: { backgroundColor: colors.signature, borderColor: colors.signature, ...shadows.e1 },
  gridRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  gridCourtName: { width: 70, paddingRight: spacing.sm },
  gridCell: { width: 50, alignItems: 'center', justifyContent: 'center', marginHorizontal: 2 },
  gridCellBox: { width: 50, height: 38, borderRadius: radius.sm, marginHorizontal: 2, alignItems: 'center', justifyContent: 'center' },
  gcReserved: { backgroundColor: colors.signature, ...shadows.e1 },
  gcFree: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  gcBlocked: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  gcTournoi: { backgroundColor: colors.purple, ...shadows.e1 },
  planLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md },
});
