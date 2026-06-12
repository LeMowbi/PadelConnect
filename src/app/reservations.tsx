import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { Screen } from '@/components/Screen';
import { Button, Card, Divider, EmptyState, IconCircle, SectionHeader, Tag, Txt } from '@/components/ui';
import { seedCompetitions } from '@/data/competitions';
import { isPlayed, useApp, type Reservation } from '@/store/AppContext';
import { openWhatsApp } from '@/lib/contact';
import { dayKey } from '@/lib/days';
import { fcfa, perPlayer } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';

const FIVE_H = 5 * 3600000;
const PAST_PREVIEW = 5; // passées : 5 dernières + « Voir tout »

export default function ReservationsScreen() {
  const router = useRouter();
  const { state, cancelReservation } = useApp();
  const [showAllPast, setShowAllPast] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Reservation | null>(null); // confirmation avant annulation

  const now = Date.now();
  const upcoming = state.reservations.filter((r) => !isPlayed(r, now)).sort((a, b) => a.startsAt - b.startsAt);
  const past = state.reservations.filter((r) => isPlayed(r, now)).sort((a, b) => b.startsAt - a.startsAt);
  const pastShown = showAllPast ? past : past.slice(0, PAST_PREVIEW);

  // Mes tournois : ceux où mon équipe est inscrite (à venir / résultats).
  const today = dayKey(new Date());
  const myComps = Object.keys(state.compRegistrations)
    .map((id) => [...state.myCompetitions, ...seedCompetitions].find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => !!c)
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey));

  // Récap envoyé aux partenaires (WhatsApp s'ouvre avec le message, tu choisis le destinataire).
  // La part par joueur se calcule sur le PRIX RÉEL du créneau (terrain à 4).
  const notifyPartners = (r: Reservation) => {
    const who = r.invited.length ? `\nÉquipe : ${r.invited.map((i) => i.name).join(', ')}` : '';
    const share = r.price ? `\nPrévois ${perPlayer(r.price)} chacun.` : '';
    openWhatsApp(
      '',
      `On joue au padel ! 🎾\n${r.clubName} — ${r.date} à ${r.time} (session 1h30)\n${r.court}${who}${share}\nRéservé via PadelConnect.`
    );
  };

  return (
    <Screen back title="Mes réservations" subtitle="À venir, statut du club, passées">
      {/* À venir */}
      <View style={{ marginTop: spacing.sm }}>
        <SectionHeader title={`À venir · ${upcoming.length}`} />
        {upcoming.length === 0 ? (
          <Card>
            <EmptyState icon="calendar-outline" title="Aucune réservation à venir" text="Réserve un terrain : il apparaîtra ici avec son statut." />
            <Button label="Réserver un terrain" icon="calendar" onPress={() => router.push('/reserver')} full />
          </Card>
        ) : (
          upcoming.map((r) => {
            const canCancel = r.startsAt - now > FIVE_H;
            return (
              <Card key={r.id} style={{ marginBottom: spacing.md }}>
                <View style={styles.row}>
                  <IconCircle icon="tennisball" color={colors.green} bg={colors.greenSoft} size={40} />
                  <View style={{ flex: 1 }}>
                    <Txt variant="h3" style={{ fontSize: 15 }}>
                      {r.clubName}
                    </Txt>
                    <Txt variant="muted">
                      {r.date} · {r.time} · {r.court} · 1h30
                    </Txt>
                    {r.price ? (
                      <Txt variant="small" color={colors.gold} style={{ fontWeight: '700' }}>
                        {fcfa(r.price)} · ~{perPlayer(r.price)}/joueur
                      </Txt>
                    ) : null}
                  </View>
                  {r.clubConfirmed ? (
                    <Tag label="Confirmée ✓" tone="green" icon="checkmark-circle" />
                  ) : (
                    <Tag label="En attente" tone="neutral" icon="hourglass-outline" />
                  )}
                </View>

                {r.invited.length > 0 ? (
                  <View style={styles.participants}>
                    <Ionicons name="people-outline" size={14} color={colors.textMuted} />
                    <Txt variant="small" color={colors.textMuted} style={{ flex: 1 }}>
                      Avec {r.invited.map((i) => i.name).join(', ')}
                    </Txt>
                  </View>
                ) : null}

                <Divider style={{ marginVertical: spacing.md }} />
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      size="sm"
                      label="Prévenir mes partenaires"
                      icon="logo-whatsapp"
                      variant="secondary"
                      onPress={() => notifyPartners(r)}
                      full
                    />
                  </View>
                  {canCancel ? (
                    <Button size="sm" label="Annuler" icon="close" variant="danger" onPress={() => setCancelTarget(r)} />
                  ) : null}
                </View>
                {!canCancel ? (
                  <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm, textAlign: 'center' }}>
                    Annulation impossible (moins de 5h avant) — à voir directement avec le club.
                  </Txt>
                ) : null}
              </Card>
            );
          })
        )}
      </View>

      {/* Mes tournois */}
      {myComps.length > 0 ? (
        <View style={{ marginTop: spacing.xl }}>
          <SectionHeader title={`Mes tournois · ${myComps.length}`} />
          <Card>
            {myComps.map((c, i) => {
              const result = state.compResults[c.id];
              const mine = state.officialResults.find((o) => o.compId === c.id);
              const finished = c.dateKey <= today;
              return (
                <View key={c.id}>
                  {i > 0 ? <Divider style={{ marginVertical: spacing.sm }} /> : null}
                  <Card onPress={() => router.push(`/competition/${c.id}`)} style={styles.compRow}>
                    <View style={{ flex: 1 }}>
                      <Txt variant="body" style={{ fontWeight: '600' }} numberOfLines={1}>
                        {c.title}
                      </Txt>
                      <Txt variant="small" color={colors.textMuted}>
                        {c.date} · avec {state.compRegistrations[c.id].partner}
                      </Txt>
                    </View>
                    {result ? (
                      mine?.result === 'win' ? (
                        <Tag label="Vainqueur !" tone="amber" icon="trophy" />
                      ) : mine?.result === 'last' ? (
                        <Tag label="Dernière place" tone="coral" icon="arrow-down" />
                      ) : (
                        <Tag label="Participé" tone="blue" />
                      )
                    ) : finished ? (
                      <Tag label="Résultats à venir" tone="neutral" />
                    ) : (
                      <Tag label="À venir" tone="purple" />
                    )}
                  </Card>
                </View>
              );
            })}
          </Card>
        </View>
      ) : null}

      {/* Passées */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title={`Passées · ${past.length}`} />
        {past.length === 0 ? (
          <Card>
            <Txt variant="muted">Tes parties jouées s'afficheront ici, comptées automatiquement.</Txt>
          </Card>
        ) : (
          <Card>
            {pastShown.map((r, i) => (
              <View key={r.id}>
                {i > 0 ? <Divider style={{ marginVertical: spacing.sm }} /> : null}
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Txt variant="body" style={{ fontWeight: '600' }}>
                      {r.clubName}
                    </Txt>
                    <Txt variant="muted">
                      {r.date} · {r.time} · {r.court}
                    </Txt>
                  </View>
                  <Tag label="Jouée" tone="blue" />
                </View>
              </View>
            ))}
            {past.length > PAST_PREVIEW ? (
              <Button
                size="sm"
                label={showAllPast ? 'Réduire' : `Voir tout (${past.length})`}
                variant="ghost"
                onPress={() => setShowAllPast((v) => !v)}
              />
            ) : null}
          </Card>
        )}
      </View>

      {/* Confirmation avant annulation — plus de suppression en un seul tap */}
      <BottomSheet
        visible={cancelTarget !== null}
        title="Annuler cette réservation ?"
        subtitle={cancelTarget ? `${cancelTarget.clubName} — ${cancelTarget.date} à ${cancelTarget.time} · ${cancelTarget.court}` : undefined}
        onClose={() => setCancelTarget(null)}
      >
        <Txt variant="body" color={colors.textMuted}>
          Le créneau sera libéré et le club ne la verra plus.
        </Txt>
        <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
          <Button
            label="Oui, annuler"
            icon="close-circle"
            variant="danger"
            onPress={() => {
              if (cancelTarget) cancelReservation(cancelTarget.id);
              setCancelTarget(null);
            }}
            full
          />
          <Button label="Garder ma réservation" variant="secondary" onPress={() => setCancelTarget(null)} full />
        </View>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  compRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: 0, borderWidth: 0, shadowOpacity: 0, elevation: 0, backgroundColor: 'transparent' },
  participants: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
});
