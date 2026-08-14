import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Chip } from '@/components/Chip';
import { Button, Card, Txt } from '@/components/ui';
import { durationLabel, openCourtSlots, type CourtSlot } from '@/lib/courtSchedule';
import { slotTimestamp } from '@/lib/days';
import { colors, radius, spacing } from '@/theme';

// Motifs de blocage d’un créneau hors app.
const BLOCK_REASONS = ['Résa téléphone/WhatsApp', 'Entretien', 'Privatisé', 'Autre'];

// Mini-formulaire « Bloquer un créneau » : date → TERRAIN → un de SES créneaux (heure + durée,
// 1h/1h30) → motif. Le terrain est choisi AVANT le créneau (68) : chaque terrain a sa propre
// grille, un horaire n'a de sens qu'une fois le terrain connu.
export type CourtStatus = { state: 'free' | 'reserved' | 'blocked' | 'tournoi'; label?: string };

export function QuickBlock({
  days,
  courts,
  grid,
  dayHasTournament,
  courtStatus,
  onBlock,
  onUnblock,
}: {
  days: { key: string; label: string; value: number }[];
  courts: string[];
  grid: Record<string, CourtSlot[]>; // grille EFFECTIVE de chaque terrain (resolvedGridFor)
  dayHasTournament: (dateKey: string) => boolean;
  courtStatus: (dateKey: string, time: string, court: string, durationMin: number) => CourtStatus;
  onBlock: (dateKey: string, time: string, court: string, durationMin: number, reason: string, ts: number) => Promise<boolean>;
  onUnblock: (dateKey: string, time: string, court: string, durationMin: number) => Promise<boolean>;
}) {
  // Jour retrouvé par CLÉ (pas l'objet capturé au montage) : après minuit, days[0] change de
  // valeur — un état objet figerait le formulaire sur la veille (motif : cours/[coachId].tsx).
  const [selDayKey, setSelDayKey] = useState<string | null>(null);
  const day = days.find((d) => d.key === selDayKey) ?? days[0];
  const [court, setCourt] = useState<string | null>(null);
  const [slot, setSlot] = useState<CourtSlot | null>(null);
  const [confirmUnblock, setConfirmUnblock] = useState<CourtSlot | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Garde anti double-tap (comme ClubCancelForm/ClosePanel) : deux taps rapprochés = deux RPC,
  // et le second « Débloquer » revenait en erreur après un déblocage pourtant réussi.
  const [busy, setBusy] = useState(false);

  const tsOf = (t: string) => slotTimestamp(day.key, t);
  const reset = () => {
    setCourt(null);
    setSlot(null);
    setError(null);
    setConfirmUnblock(null);
  };
  const tournamentDay = dayHasTournament(day.key);
  // Créneaux OUVERTS du terrain sélectionné (les fermés `x:true` ne se bloquent pas — déjà indisponibles).
  const courtSlots = court ? openCourtSlots(grid, court) : [];

  return (
    <Card style={{ marginTop: spacing.sm, borderColor: colors.coral }}>
      <Txt variant="label">Jour</Txt>
      <View style={styles.wrap}>
        {days.map((d) => (
          <Chip
            key={d.key}
            label={d.label}
            active={d.key === day.key}
            onPress={() => {
              setSelDayKey(d.key);
              reset();
            }}
          />
        ))}
      </View>

      {tournamentDay ? (
        <View style={styles.banner}>
          <Ionicons name="trophy" size={16} color={colors.purple} />
          <Txt variant="small" color={colors.text} style={{ flex: 1 }}>
            Jour de tournoi — terrains indisponibles ce jour-là.
          </Txt>
        </View>
      ) : (
        <>
          <Txt variant="label" style={{ marginTop: spacing.md }}>
            Terrain
          </Txt>
          <View style={styles.wrap}>
            {courts.map((c) => (
              <Chip
                key={c}
                label={c}
                active={c === court}
                onPress={() => {
                  setCourt(c);
                  setSlot(null);
                  setError(null);
                  setConfirmUnblock(null);
                }}
              />
            ))}
          </View>

          {court ? (
            <>
              <Txt variant="label" style={{ marginTop: spacing.md }}>
                Créneau
              </Txt>
              <View style={styles.wrap}>
                {courtSlots.map((s) => {
                  const past = tsOf(s.t) <= Date.now();
                  return (
                    <Chip
                      key={s.t}
                      label={past ? `${s.t} · ${durationLabel(s.d)} · passé` : `${s.t} · ${durationLabel(s.d)}`}
                      active={slot?.t === s.t}
                      disabled={past}
                      onPress={() => {
                        setSlot(s);
                        setError(null);
                        setConfirmUnblock(null);
                      }}
                    />
                  );
                })}
              </View>
            </>
          ) : null}

          {court && slot
            ? (() => {
                const st = courtStatus(day.key, slot.t, court, slot.d);
                if (st.state === 'reserved') {
                  return (
                    <View style={styles.statusBox}>
                      <Ionicons name="person" size={16} color={colors.textMuted} />
                      <Txt variant="small" color={colors.textMuted} style={{ flex: 1, fontWeight: '600' }}>
                        Déjà réservé par {st.label} — vois avec le joueur.
                      </Txt>
                    </View>
                  );
                }
                if (st.state === 'tournoi') {
                  return (
                    <View style={styles.statusBox}>
                      <Ionicons name="trophy" size={16} color={colors.purple} />
                      {/* purpleDark : le violet clair échoue AA (~3,6:1) sur surfaceAlt — même token que le planning. */}
                      <Txt variant="small" color={colors.purpleDark} style={{ flex: 1, fontWeight: '600' }}>
                        Terrain retenu par un tournoi — non blocable.
                      </Txt>
                    </View>
                  );
                }
                if (st.state === 'blocked') {
                  return (
                    <>
                      <Pressable
                        onPress={() => setConfirmUnblock(confirmUnblock ? null : slot)}
                        accessibilityRole="button"
                        style={styles.statusBox}
                      >
                        <Ionicons name="lock-closed" size={16} color={colors.coral} />
                        {/* coralDark : le corail nu frôle AA (4,43:1) et ce texte est ACTIONNABLE. */}
                        <Txt variant="small" color={colors.coralDark} style={{ flex: 1, fontWeight: '600' }}>
                          Bloqué · {st.label}
                        </Txt>
                        <Txt variant="small" color={colors.coralDark}>
                          Débloquer ?
                        </Txt>
                      </Pressable>
                      {confirmUnblock ? (
                        <View style={styles.confirmBox}>
                          <Txt variant="small" color={colors.text} style={{ fontWeight: '600' }}>
                            Débloquer {court} à {slot.t} ? Il redeviendra réservable.
                          </Txt>
                          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                            <View style={{ flex: 1 }}>
                              <Button
                                size="sm"
                                label="Débloquer"
                                icon="lock-open"
                                onPress={() => {
                                  if (busy) return;
                                  setBusy(true);
                                  // On ATTEND le serveur : un échec de déblocage affiche une erreur
                                  // (comme le blocage), au lieu de fermer la boîte en silence.
                                  void onUnblock(day.key, slot.t, court, slot.d).then((ok) => {
                                    setBusy(false);
                                    if (!ok) {
                                      setError('Impossible de débloquer ce créneau.');
                                      return;
                                    }
                                    setConfirmUnblock(null);
                                  });
                                }}
                                disabled={busy}
                                full
                              />
                            </View>
                            <Button size="sm" label="Annuler" variant="ghost" onPress={() => setConfirmUnblock(null)} />
                          </View>
                        </View>
                      ) : null}
                    </>
                  );
                }
                // Libre → motif de blocage.
                return (
                  <>
                    <Txt variant="label" style={{ marginTop: spacing.md }}>
                      Motif
                    </Txt>
                    <View style={styles.wrap}>
                      {BLOCK_REASONS.map((reason) => (
                        <Chip
                          key={reason}
                          label={reason}
                          onPress={() => {
                            if (busy) return;
                            setBusy(true);
                            void onBlock(day.key, slot.t, court, slot.d, reason, tsOf(slot.t)).then((ok) => {
                              setBusy(false);
                              if (!ok) {
                                setError('Impossible de bloquer ce créneau.');
                                return;
                              }
                              reset();
                            });
                          }}
                        />
                      ))}
                    </View>
                  </>
                );
              })()
            : null}
        </>
      )}

      {error ? (
        <Txt variant="small" color={colors.danger} style={{ marginTop: spacing.sm }}>
          {error}
        </Txt>
      ) : null}
      <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
        Un créneau bloqué n’est jamais facturé ni compté — c’est une simple indisponibilité.
      </Txt>
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.purpleSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    marginTop: spacing.md,
  },
  confirmBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.amberSoft,
  },
});
