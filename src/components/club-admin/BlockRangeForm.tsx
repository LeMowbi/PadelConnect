import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { CalendarPicker } from '@/components/CalendarPicker';
import { Chip } from '@/components/Chip';
import { Button, Card, Txt } from '@/components/ui';
import { DAY_MS, dateKeyLabel, dayKey } from '@/lib/days';
import type { BlockRangeStatus } from '@/lib/reservations';
import { colors, radius, spacing } from '@/theme';

// Mini-formulaire « Fermer sur une période » : terrain (ou tous) → Du/Au → heures (ou journée
// entière) → motif. Même langage visuel que QuickBlock (créneau unique), pour une fermeture
// qui DURE (travaux, événement privé) plutôt qu'un blocage ponctuel.
export function BlockRangeForm({
  courts,
  times,
  onSubmit,
}: {
  courts: string[];
  times: string[]; // horaires ouverts du club
  onSubmit: (input: {
    court: string | null;
    dateFrom: string;
    dateTo: string;
    times: string[] | null;
    reason: string;
  }) => Promise<BlockRangeStatus>;
}) {
  const todayKey = dayKey(new Date());
  // Fenêtre de sélection alignée sur la borne serveur (message 'invalid' = « 1 an maximum »).
  const maxKey = dayKey(new Date(Date.now() + 365 * DAY_MS));

  const [court, setCourt] = useState<string | null>(null); // null = tous les terrains
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [allDay, setAllDay] = useState(true);
  const [selTimes, setSelTimes] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setCourt(null);
    setDateFrom(null);
    setDateTo(null);
    setAllDay(true);
    setSelTimes([]);
    setReason('');
  };

  // Multi-sélection des heures : désélectionner la dernière heure retombe sur « toute la journée ».
  const toggleTime = (t: string) => {
    const next = selTimes.includes(t) ? selTimes.filter((x) => x !== t) : [...selTimes, t].sort();
    setAllDay(next.length === 0);
    setSelTimes(next);
  };

  const canSubmit = !!dateFrom && !!dateTo && !busy;

  return (
    <Card style={{ marginTop: spacing.sm, borderColor: colors.coral }}>
      <Txt variant="label">
        Terrain
      </Txt>
      <View style={styles.wrap}>
        <Chip label="Tous les terrains" active={court === null} onPress={() => setCourt(null)} />
        {courts.map((c) => (
          <Chip key={c} label={c} active={court === c} onPress={() => setCourt(c)} />
        ))}
      </View>

      <Txt variant="label" style={{ marginTop: spacing.md }}>
        Du {dateFrom ? `— ${dateKeyLabel(dateFrom)}` : ''}
      </Txt>
      <CalendarPicker
        value={dateFrom}
        minKey={todayKey}
        maxKey={maxKey}
        onSelect={(key) => {
          setDateFrom(key);
          // La fin doit rester ≥ au début — on la recale si le nouveau début la dépasse.
          if (dateTo && dateTo < key) setDateTo(key);
        }}
      />

      <Txt variant="label" style={{ marginTop: spacing.md }}>
        Au {dateTo ? `— ${dateKeyLabel(dateTo)}` : ''}
      </Txt>
      <CalendarPicker value={dateTo} minKey={dateFrom ?? todayKey} maxKey={maxKey} onSelect={(key) => setDateTo(key)} />

      <Txt variant="label" style={{ marginTop: spacing.md }}>
        Heures
      </Txt>
      <View style={styles.wrap}>
        <Chip
          label="Toute la journée"
          active={allDay}
          onPress={() => {
            setAllDay(true);
            setSelTimes([]);
          }}
        />
        {[...times].sort().map((t) => (
          <Chip key={t} label={t} active={!allDay && selTimes.includes(t)} onPress={() => toggleTime(t)} />
        ))}
      </View>

      <Txt variant="label" style={{ marginTop: spacing.md }}>
        Motif
      </Txt>
      {/* Promesse tenable depuis les grants de colonnes (54) : les joueurs ne téléchargent
          plus le motif — seul l'Espace Club le lit (club_blocked_reasons). */}
      <TextInput
        value={reason}
        onChangeText={setReason}
        placeholder="Motif (ex. travaux, tournoi privé) — visible dans ton Espace Club uniquement"
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="Motif de la fermeture"
        style={styles.input}
      />

      <View style={{ marginTop: spacing.md }}>
        <Button
          label="Fermer cette période"
          icon="lock-closed"
          disabled={!canSubmit}
          onPress={() => {
            if (!dateFrom || !dateTo || busy) return;
            setBusy(true);
            void onSubmit({ court, dateFrom, dateTo, times: allDay ? null : selTimes, reason: reason.trim() })
              .then((status) => {
                if (status === 'ok') reset();
              })
              .finally(() => setBusy(false));
          }}
          full
        />
      </View>
      <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
        Un créneau fermé n’est jamais facturé ni compté — c’est une simple indisponibilité.
      </Txt>
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  input: {
    marginTop: spacing.sm,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
  },
});
