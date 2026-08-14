import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Txt } from './ui';
import { levelText } from '@/lib/format';
import { LEVEL_CEIL, LEVEL_FLOOR, levelRangeText, stepLevelRange, type LevelRange } from '@/lib/levelRange';
import { colors, radius, spacing } from '@/theme';

// FOURCHETTE DE NIVEAU d'un match ouvert (81) : deux mini-steppers « Niveau min / Niveau max »
// (pas de 0,5, bornes 1–7), VIDES par défaut = ouvert à tous. Composant CONTRÔLÉ, partagé par le
// tunnel de réservation (reserver/[clubId]) et la réservation rapide (BookingSheet) — un seul
// endroit à faire évoluer. La logique (pas, ancrage, cohérence min ≤ max) vit dans lib/levelRange.
export function LevelRangePicker({
  min,
  max,
  anchor,
  onChange,
}: {
  min: number | null;
  max: number | null;
  anchor: number; // niveau du joueur : valeur posée au PREMIER appui (jamais un 1 ou 7 arbitraire)
  onChange: (range: LevelRange) => void;
}) {
  const step = (edge: 'min' | 'max', dir: 1 | -1) => onChange(stepLevelRange({ min, max }, edge, dir, anchor));
  const empty = min === null && max === null;
  return (
    <View style={{ marginTop: spacing.sm }}>
      <Edge label="Niveau min" value={min} onDec={() => step('min', -1)} onInc={() => step('min', 1)} />
      <Edge label="Niveau max" value={max} onDec={() => step('max', -1)} onInc={() => step('max', 1)} />
      <View style={styles.footer}>
        <Txt variant="small" color={colors.textMuted} style={{ flex: 1 }}>
          {empty
            ? 'Aucune fourchette : tous les niveaux peuvent rejoindre.'
            : `Seuls les joueurs de niveau ${levelRangeText(min, max)} pourront rejoindre.`}
        </Txt>
        <Button
          size="sm"
          variant="ghost"
          label="Effacer"
          icon="close-circle-outline"
          onPress={() => onChange({ min: null, max: null })}
          disabled={empty}
        />
      </View>
    </View>
  );
}

// Une borne : « − valeur + » (même idiome que le sélecteur d'heures de l'Espace Club).
// « — » = borne libre ; les deux boutons posent alors le niveau d'ancrage.
function Edge({ label, value, onDec, onInc }: { label: string; value: number | null; onDec: () => void; onInc: () => void }) {
  const shown = value === null ? '—' : levelText(value);
  const canDec = value === null || value > LEVEL_FLOOR;
  const canInc = value === null || value < LEVEL_CEIL;
  return (
    <View style={styles.row}>
      <Txt variant="body" style={{ flex: 1, fontWeight: '600' }}>
        {label}
      </Txt>
      <Pressable
        onPress={onDec}
        disabled={!canDec}
        hitSlop={6}
        style={[styles.btn, !canDec && styles.btnOff]}
        accessibilityRole="button"
        accessibilityLabel={`${label} : baisser d’un demi-point`}
        accessibilityValue={{ text: value === null ? 'non défini' : shown }}
      >
        <Ionicons name="remove" size={18} color={canDec ? colors.signature : colors.textFaint} />
      </Pressable>
      <Txt variant="h3" style={styles.value}>
        {shown}
      </Txt>
      <Pressable
        onPress={onInc}
        disabled={!canInc}
        hitSlop={6}
        style={[styles.btn, !canInc && styles.btnOff]}
        accessibilityRole="button"
        accessibilityLabel={`${label} : monter d’un demi-point`}
        accessibilityValue={{ text: value === null ? 'non défini' : shown }}
      >
        <Ionicons name="add" size={18} color={canInc ? colors.signature : colors.textFaint} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  btn: {
    width: 44, // cible tactile ≥ 44 pt (accessibilité)
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOff: { opacity: 0.4 },
  value: { minWidth: 48, textAlign: 'center' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
});
