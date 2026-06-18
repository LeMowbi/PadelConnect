import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { Txt } from './ui';
import { colors, radius, spacing } from '@/theme';

// Réglage du niveau de jeu (1.0 → 7.0, pas de 0.5).
export function LevelStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const round = (n: number) => Math.round(n * 10) / 10;
  return (
    <View style={styles.row}>
      <Pressable onPress={() => onChange(Math.max(1, round(value - 0.5)))} style={styles.btn} hitSlop={8}>
        <Ionicons name="remove" size={20} color={colors.text} />
      </Pressable>
      <View style={styles.value}>
        <Txt variant="h2" color={colors.signature}>{value.toFixed(1)}</Txt>
      </View>
      <Pressable onPress={() => onChange(Math.min(7, round(value + 0.5)))} style={styles.btn} hitSlop={8}>
        <Ionicons name="add" size={20} color={colors.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  btn: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { minWidth: 64, alignItems: 'center' },
});
