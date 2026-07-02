import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Txt } from './ui';
import { DAY_MS, dayKey } from '@/lib/days';
import { colors, radius, spacing } from '@/theme';

// Mini-calendrier mensuel (pur JS, aucun module natif) : navigation ‹ mois ›, jours hors
// plage grisés, jour choisi en vert signature. Tout est calculé en UTC (jour d'Abidjan),
// comme le reste de la logique « jours » du projet. Utilisé pour choisir la date d'un
// tournoi (demande porteur : « liste déroulante ou style calendrier » plutôt que 42 chips).
const MONTHS_FULL = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];
const DOW = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

// « AAAA-MM-JJ » → timestamp UTC midi (repère stable, même convention que nextDays).
function keyToTs(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d, 12);
}

export function CalendarPicker({
  value,
  onSelect,
  minKey,
  maxKey,
}: {
  value: string | null; // clé AAAA-MM-JJ du jour choisi
  onSelect: (key: string) => void;
  minKey: string; // premier jour sélectionnable (inclus)
  maxKey: string; // dernier jour sélectionnable (inclus)
}) {
  // Mois affiché : celui du jour choisi, sinon celui du premier jour sélectionnable.
  const startKey = value ?? minKey;
  const [year, setYear] = useState(() => Number(startKey.slice(0, 4)));
  const [month, setMonth] = useState(() => Number(startKey.slice(5, 7)) - 1); // 0-11

  const monthStart = Date.UTC(year, month, 1, 12);
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0, 12)).getUTCDate();
  // Lundi = colonne 0 (semaine française).
  const firstDow = (new Date(monthStart).getUTCDay() + 6) % 7;

  const canPrev = dayKey(new Date(Date.UTC(year, month, 0, 12))) >= minKey.slice(0, 8) + '01';
  const canNext = dayKey(new Date(Date.UTC(year, month + 1, 1, 12))) <= maxKey;
  const goMonth = (delta: number) => {
    const d = new Date(Date.UTC(year, month + delta, 1, 12));
    setYear(d.getUTCFullYear());
    setMonth(d.getUTCMonth());
  };

  // Cellules : cases vides avant le 1er, puis les jours du mois.
  const cells: (string | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => dayKey(new Date(monthStart + i * DAY_MS))),
  ];

  return (
    <View style={styles.box}>
      <View style={styles.header}>
        <Pressable onPress={() => goMonth(-1)} disabled={!canPrev} hitSlop={8} accessibilityLabel="Mois précédent">
          <Ionicons name="chevron-back" size={20} color={canPrev ? colors.text : colors.textFaint} />
        </Pressable>
        <Txt variant="h3">
          {MONTHS_FULL[month]} {year}
        </Txt>
        <Pressable onPress={() => goMonth(1)} disabled={!canNext} hitSlop={8} accessibilityLabel="Mois suivant">
          <Ionicons name="chevron-forward" size={20} color={canNext ? colors.text : colors.textFaint} />
        </Pressable>
      </View>
      <View style={styles.grid}>
        {DOW.map((d, i) => (
          <View key={`dow-${i}`} style={styles.cell}>
            <Txt variant="small" color={colors.textFaint} style={{ fontWeight: '700' }}>
              {d}
            </Txt>
          </View>
        ))}
        {cells.map((key, i) =>
          key === null ? (
            <View key={`empty-${i}`} style={styles.cell} />
          ) : (
            (() => {
              const disabled = key < minKey || key > maxKey;
              const selected = key === value;
              const today = key === minKey && minKey === dayKey(new Date());
              return (
                <View key={key} style={styles.cell}>
                  <Pressable
                    onPress={() => onSelect(key)}
                    disabled={disabled}
                    style={[styles.day, selected && styles.daySelected, !selected && today && styles.dayToday]}
                    accessibilityRole="button"
                    accessibilityState={{ selected, disabled }}
                    accessibilityLabel={`${Number(key.slice(8, 10))} ${MONTHS_FULL[month]}`}
                  >
                    <Txt
                      variant="body"
                      color={selected ? colors.onSignature : disabled ? colors.textFaint : colors.text}
                      style={{ fontWeight: selected ? '800' : '500' }}
                    >
                      {Number(key.slice(8, 10))}
                    </Txt>
                  </Pressable>
                </View>
              );
            })()
          ),
        )}
      </View>
    </View>
  );
}

// keyToTs est exporté pour construire un DayOption depuis la clé choisie.
export { keyToTs };

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.xs,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 2 },
  day: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  daySelected: { backgroundColor: colors.signature },
  dayToday: { borderWidth: 1, borderColor: colors.signature },
});
