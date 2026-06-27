import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Chip } from '@/components/Chip';
import { Button, Card, Txt } from '@/components/ui';
import { slotTimestamp } from '@/lib/days';
import { colors, radius, spacing } from '@/theme';

// Motifs de blocage d'un créneau hors app.
const BLOCK_REASONS = ['Résa téléphone/WhatsApp', 'Entretien', 'Privatisé', 'Autre'];

// Mini-formulaire « Bloquer un créneau » : date → heure → terrain → motif.
// Distingue réservé / bloqué / libre, et permet de débloquer (avec confirmation).
export type CourtStatus = { state: 'free' | 'reserved' | 'blocked'; label?: string };

export function QuickBlock({
  days,
  times,
  courts,
  dayHasTournament,
  courtStatus,
  onBlock,
  onUnblock,
}: {
  days: { key: string; label: string; value: number }[];
  times: string[];
  courts: string[];
  dayHasTournament: (dateKey: string) => boolean;
  courtStatus: (dateKey: string, time: string, court: string) => CourtStatus;
  onBlock: (dateKey: string, time: string, court: string, reason: string, ts: number) => boolean;
  onUnblock: (dateKey: string, time: string, court: string) => void;
}) {
  const [day, setDay] = useState(days[0]);
  const [time, setTime] = useState<string | null>(null);
  const [court, setCourt] = useState<string | null>(null);
  const [confirmUnblock, setConfirmUnblock] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tsOf = (t: string) => slotTimestamp(day.value, t);
  const reset = () => { setTime(null); setCourt(null); setError(null); setConfirmUnblock(null); };
  const tournamentDay = dayHasTournament(day.key);

  return (
    <Card style={{ marginTop: spacing.sm, borderColor: colors.coral }}>
      <Txt variant="label" color={colors.textFaint}>Jour</Txt>
      <View style={styles.wrap}>
        {days.map((d) => (
          <Chip key={d.key} label={d.label} active={d.key === day.key} onPress={() => { setDay(d); reset(); }} />
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
          <Txt variant="label" color={colors.textFaint} style={{ marginTop: spacing.md }}>Heure</Txt>
          <View style={styles.wrap}>
            {[...times].sort().map((t) => {
              const past = tsOf(t) <= Date.now();
              return <Chip key={t} label={past ? `${t} · passé` : t} active={t === time} disabled={past} onPress={() => { setTime(t); setCourt(null); setError(null); setConfirmUnblock(null); }} />;
            })}
          </View>

          {time ? (
            <>
              <Txt variant="label" color={colors.textFaint} style={{ marginTop: spacing.md }}>Terrain</Txt>
              <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
                {courts.map((c) => {
                  const st = courtStatus(day.key, time, c);
                  const label =
                    st.state === 'reserved' ? `${c} · réservé (${st.label})` : st.state === 'blocked' ? `${c} · bloqué (${st.label})` : c;
                  const tone = st.state === 'reserved' ? colors.textMuted : st.state === 'blocked' ? colors.coral : colors.text;
                  return (
                    <Pressable
                      key={c}
                      onPress={() => {
                        setError(null);
                        if (st.state === 'reserved') {
                          setError(`Déjà réservé par ${st.label} — vois avec le joueur.`);
                          return;
                        }
                        if (st.state === 'blocked') {
                          setConfirmUnblock(confirmUnblock === c ? null : c);
                          setCourt(null);
                          return;
                        }
                        setCourt(c === court ? null : c);
                        setConfirmUnblock(null);
                      }}
                      style={[styles.courtRow, court === c && styles.courtRowSel, st.state === 'reserved' && { opacity: 0.6 }]}
                    >
                      <Ionicons
                        name={st.state === 'reserved' ? 'person' : st.state === 'blocked' ? 'lock-closed' : court === c ? 'radio-button-on' : 'radio-button-off'}
                        size={16}
                        color={tone}
                      />
                      <Txt variant="small" color={tone} style={{ flex: 1, fontWeight: '600' }}>
                        {label}
                      </Txt>
                      {st.state === 'blocked' ? <Txt variant="small" color={colors.coral}>Débloquer ?</Txt> : null}
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          {/* Confirmation de déblocage */}
          {time && confirmUnblock ? (
            <View style={styles.confirmBox}>
              <Txt variant="small" color={colors.text} style={{ fontWeight: '600' }}>
                Débloquer {confirmUnblock} à {time} ? Il redeviendra réservable.
              </Txt>
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Button size="sm" label="Débloquer" icon="lock-open" onPress={() => { onUnblock(day.key, time, confirmUnblock); setConfirmUnblock(null); }} full />
                </View>
                <Button size="sm" label="Annuler" variant="ghost" onPress={() => setConfirmUnblock(null)} />
              </View>
            </View>
          ) : null}

          {/* Motif de blocage */}
          {time && court ? (
            <>
              <Txt variant="label" color={colors.textFaint} style={{ marginTop: spacing.md }}>Motif</Txt>
              <View style={styles.wrap}>
                {BLOCK_REASONS.map((reason) => (
                  <Chip
                    key={reason}
                    label={reason}
                    onPress={() => {
                      if (!onBlock(day.key, time, court, reason, tsOf(time))) {
                        setError('Impossible de bloquer ce créneau.');
                        return;
                      }
                      reset();
                    }}
                  />
                ))}
              </View>
            </>
          ) : null}
        </>
      )}

      {error ? (
        <Txt variant="small" color={colors.danger} style={{ marginTop: spacing.sm }}>
          {error}
        </Txt>
      ) : null}
      <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
        Un créneau bloqué n'est jamais facturé ni compté — c'est une simple indisponibilité.
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
  courtRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  courtRowSel: { backgroundColor: colors.signatureSoft, borderWidth: 1, borderColor: colors.signature },
  confirmBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.amberSoft,
  },
});
