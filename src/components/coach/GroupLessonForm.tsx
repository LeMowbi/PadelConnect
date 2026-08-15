import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { Button, Card, Txt } from '@/components/ui';
import { durationLabel } from '@/lib/courtSchedule';
import { type DayOption } from '@/lib/days';
import { colors, radius, spacing } from '@/theme';

const CAPACITIES = [2, 3, 4, 5, 6, 7, 8]; // places ÉLÈVES (bornes serveur, SQL 83)
const NOTE_MAX = 200; // même borne que la colonne `lessons.note`

// COURS COLLECTIF (19) — formulaire du coach : terrain → jour → créneau (heure + durée RÉELLES
// de la grille du terrain, 68) → places → note. Le créneau devient une RÉSERVATION standard au
// nom du coach : le club la confirme ensuite comme n’importe laquelle (double validation).
// Écriture honnête : le formulaire ne se vide qu’après un vrai succès serveur.
export function GroupLessonForm({
  courts,
  days,
  slotsFor,
  onSubmit,
}: {
  courts: string[];
  days: DayOption[];
  // Créneaux OUVERTS et LIBRES du terrain ce jour-là (heure + durée figée) — calculés par
  // l’écran, qui détient la disponibilité (availability.ts).
  slotsFor: (court: string, dateKey: string) => { time: string; durationMin: 60 | 90 }[];
  onSubmit: (input: {
    court: string;
    dateKey: string;
    time: string;
    durationMin: 60 | 90;
    capacity: number;
    note: string;
  }) => Promise<boolean>;
}) {
  const [court, setCourt] = useState<string | null>(null);
  const [selDayKey, setSelDayKey] = useState<string | null>(null);
  const [selTime, setSelTime] = useState<string | null>(null);
  const [capacity, setCapacity] = useState(4);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  // On ne stocke QUE les clés (terrain, jour, heure) et on dérive le reste à chaque rendu : après
  // une nuit en arrière-plan (`days` recalé par useTodayKey) ou une réservation prise entre-temps,
  // une sélection devenue impossible retombe simplement à « rien de choisi » (motif cours/[coachId]).
  const day = days.find((d) => d.key === selDayKey) ?? null;
  const slots = court && day ? slotsFor(court, day.key) : [];
  const slot = selTime ? (slots.find((s) => s.time === selTime) ?? null) : null;

  const reset = () => {
    setSelTime(null);
    setNote('');
  };

  const submit = () => {
    if (!court || !day || !slot || busy) return;
    setBusy(true);
    void onSubmit({ court, dateKey: day.key, time: slot.time, durationMin: slot.durationMin, capacity, note: note.trim() })
      .then((ok) => {
        if (ok) reset();
      })
      .finally(() => setBusy(false));
  };

  return (
    <Card style={{ marginTop: spacing.sm }}>
      <Txt variant="muted">
        Ouvre une session à plusieurs : le terrain est réservé à ton nom (le club la confirme ensuite) et les élèves s’inscrivent depuis la
        fiche du club.
      </Txt>

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
              setSelTime(null); // la grille change d’un terrain à l’autre (68)
            }}
          />
        ))}
      </View>

      <Txt variant="label" style={{ marginTop: spacing.md }}>
        Jour
      </Txt>
      <View style={styles.wrap}>
        {days.map((d) => (
          <Chip
            key={d.key}
            label={d.label}
            active={d.key === day?.key}
            onPress={() => {
              setSelDayKey(d.key);
              setSelTime(null);
            }}
          />
        ))}
      </View>

      <Txt variant="label" style={{ marginTop: spacing.md }}>
        Créneau {court && day ? '' : '(choisis d’abord un terrain et un jour)'}
      </Txt>
      <View style={styles.wrap}>
        {slots.map((s) => (
          <Chip
            key={s.time}
            label={`${s.time} · ${durationLabel(s.durationMin)}`}
            active={s.time === slot?.time}
            onPress={() => setSelTime(s.time)}
          />
        ))}
      </View>
      {court && day && slots.length === 0 ? (
        <Txt variant="small" color={colors.amberDark} style={{ marginTop: spacing.sm }}>
          Aucun créneau libre sur {court} ce jour-là — essaie un autre terrain ou un autre jour.
        </Txt>
      ) : null}

      <Txt variant="label" style={{ marginTop: spacing.md }}>
        Places (élèves)
      </Txt>
      <View style={styles.wrap}>
        {CAPACITIES.map((n) => (
          <Chip key={n} label={`${n}`} active={n === capacity} onPress={() => setCapacity(n)} accessibilityLabel={`${n} places`} />
        ))}
      </View>

      <Txt variant="label" style={{ marginTop: spacing.md }}>
        Note (optionnelle)
      </Txt>
      <TextInput
        value={note}
        onChangeText={(t) => setNote(t.slice(0, NOTE_MAX))}
        placeholder="Ex. Initiation — apporte de l’eau"
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="Note du cours collectif"
        style={styles.input}
      />

      <View style={{ marginTop: spacing.md }}>
        <Button label={busy ? 'Création…' : 'Créer le cours collectif'} icon="people" onPress={submit} disabled={!slot || busy} full />
      </View>
      <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
        Le tarif du cours se règle avec tes élèves, hors application. Le terrain, lui, se règle au club.
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
