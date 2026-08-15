import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Chip } from '@/components/Chip';
import { Button, Card, Txt } from '@/components/ui';
import { durationLabel, openCourtSlots, type CourtSlot } from '@/lib/courtSchedule';
import { dateKeyLabel, recurringDates, slotTimestamp } from '@/lib/days';
import { colors, radius, spacing } from '@/theme';

// Créneau RÉCURRENT (12) : le même créneau réservé chaque semaine par un habitué (payé au club,
// hors app). Le client calcule les N dates (`recurringDates`, PUR), le serveur pose les
// fermetures une à une (block_recurring) et rend un résultat HONNÊTE {posées, conflits} — une
// date déjà réservée par un joueur part en conflit, le reste passe. Même langage visuel que
// QuickBlock / BlockRangeForm (fermetures), avec la grille PROPRE du terrain choisi (68).
const WEEKS = [4, 8, 12, 26];
const DOW = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

export function RecurringForm({
  days,
  courts,
  grid,
  onSubmit,
}: {
  days: { key: string; label: string; value: number }[];
  courts: string[];
  grid: Record<string, CourtSlot[]>; // grille EFFECTIVE de chaque terrain (resolvedGridFor)
  // Rend le détail serveur ({posées, conflits}) ou null (refus global / panne réseau).
  onSubmit: (input: {
    court: string;
    time: string;
    durationMin: 60 | 90;
    dateKeys: string[];
    name: string;
  }) => Promise<{ blocked: string[]; conflicts: string[] } | null>;
}) {
  const [court, setCourt] = useState<string | null>(null);
  // Jour retrouvé par CLÉ (pas l'objet capturé au montage) : après minuit, days[0] change de
  // valeur — un état objet figerait le formulaire sur la veille (motif QuickBlock).
  const [selDayKey, setSelDayKey] = useState<string | null>(null);
  const day = days.find((d) => d.key === selDayKey) ?? days[0];
  const [slot, setSlot] = useState<CourtSlot | null>(null);
  const [weeks, setWeeks] = useState(8);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false); // garde anti double-tap (deux séries posées d'un coup)
  const [error, setError] = useState<string | null>(null);

  // Créneaux OUVERTS du terrain choisi : chaque terrain a SA grille (1h/1h30) — l'heure n'a de
  // sens qu'une fois le terrain connu, et la durée découle du créneau.
  const courtSlots = court ? openCourtSlots(grid, court) : [];
  // Le serveur refuse la série ENTIÈRE si une seule date est passée : quand le créneau du jour
  // choisi est déjà passé aujourd'hui, la série démarre la semaine suivante (annoncé plus bas).
  const startsPast = !!slot && slotTimestamp(day.key, slot.t) <= Date.now();
  const firstKey = startsPast ? (recurringDates(day.key, 2)[1] ?? day.key) : day.key;
  const dateKeys = slot ? recurringDates(firstKey, weeks) : [];
  const dow = DOW[new Date(day.value).getUTCDay()];

  const reset = () => {
    setCourt(null);
    setSlot(null);
    setName('');
    setError(null);
  };

  const canSubmit = !!court && !!slot && name.trim().length >= 2 && dateKeys.length > 0 && !busy;

  const submit = () => {
    if (!court || !slot || !canSubmit) return;
    setBusy(true);
    setError(null);
    void onSubmit({ court, time: slot.t, durationMin: slot.d, dateKeys, name: name.trim() })
      .then((res) => {
        if (!res) {
          setError('Série non posée — réessaie.');
          return;
        }
        // Au moins une date posée = la série existe (le détail des conflits est annoncé par le
        // toast) → formulaire vierge pour l'habitué suivant. Sinon on garde la saisie : le
        // gérant n'a qu'à changer d'heure ou de terrain.
        if (res.blocked.length > 0) reset();
        else setError('Aucune date libre : ce créneau est déjà réservé par un joueur sur toute la série.');
      })
      .finally(() => setBusy(false));
  };

  return (
    <Card style={{ marginTop: spacing.sm, borderColor: colors.coral }}>
      <Txt variant="label">Terrain</Txt>
      <View style={styles.wrap}>
        {courts.map((c) => (
          <Chip
            key={c}
            label={c}
            active={c === court}
            onPress={() => {
              setCourt(c);
              setSlot(null); // la grille change avec le terrain
              setError(null);
            }}
          />
        ))}
      </View>

      <Txt variant="label" style={{ marginTop: spacing.md }}>
        Jour de la semaine
      </Txt>
      <View style={styles.wrap}>
        {days.map((d) => (
          <Chip
            key={d.key}
            label={d.label}
            active={d.key === day.key}
            onPress={() => {
              setSelDayKey(d.key);
              setError(null);
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
            {courtSlots.map((s) => (
              <Chip
                key={s.t}
                label={`${s.t} · ${durationLabel(s.d)}`}
                active={slot?.t === s.t}
                onPress={() => {
                  setSlot(s);
                  setError(null);
                }}
              />
            ))}
          </View>
        </>
      ) : null}

      <Txt variant="label" style={{ marginTop: spacing.md }}>
        Durée de la série
      </Txt>
      <View style={styles.wrap}>
        {WEEKS.map((n) => (
          <Chip key={n} label={`${n} semaines`} active={weeks === n} onPress={() => setWeeks(n)} />
        ))}
      </View>

      <Txt variant="label" style={{ marginTop: spacing.md }}>
        Nom du client
      </Txt>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Nom de l’habitué (ex. M. Koné)"
        placeholderTextColor={colors.textMuted}
        maxLength={40}
        accessibilityLabel="Nom du client de la réservation récurrente"
        style={styles.input}
      />
      <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.xs }}>
        Visible par toi seul — les joueurs voient simplement « Récurrent ».
      </Txt>

      {/* Récapitulatif AVANT envoi : le gérant voit exactement les dates qui vont se fermer. */}
      {slot && dateKeys.length > 0 ? (
        <View style={styles.recap}>
          <Ionicons name="repeat" size={16} color={colors.signature} />
          <Txt variant="small" color={colors.text} style={{ flex: 1 }}>
            Tous les {dow}s à {slot.t} ({durationLabel(slot.d)}) sur {court} — {dateKeys.length} semaine
            {dateKeys.length > 1 ? 's' : ''}, du {dateKeyLabel(dateKeys[0])} au {dateKeyLabel(dateKeys[dateKeys.length - 1])}.
            {startsPast ? ` Le créneau d’aujourd’hui est déjà passé : la série démarre le ${dateKeyLabel(firstKey)}.` : ''}
          </Txt>
        </View>
      ) : null}

      <View style={{ marginTop: spacing.md }}>
        <Button
          label={busy ? 'Enregistrement…' : `Poser la série (${dateKeys.length || weeks} créneaux)`}
          icon="repeat"
          onPress={submit}
          disabled={!canSubmit}
          full
        />
      </View>
      {error ? (
        <Txt variant="small" color={colors.danger} style={{ marginTop: spacing.sm }}>
          {error}
        </Txt>
      ) : null}
      <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
        Un créneau récurrent ferme le terrain comme un blocage hors app : il n’est ni facturé ni compté dans l’app — tu règles directement
        avec ton habitué.
      </Txt>
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  recap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.signatureSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
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
