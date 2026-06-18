import { Pressable, StyleSheet, View } from 'react-native';
import { Txt } from './ui';
import { colors, radius, shadows, spacing } from '@/theme';

// Sélecteur à segments (onglets de filtre) réutilisable.
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.bar}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <Pressable key={opt} onPress={() => onChange(opt)} style={[styles.btn, active && styles.active]}>
            <Txt
              variant="small"
              color={active ? colors.onSignature : colors.textMuted}
              numberOfLines={1}
              style={{ fontWeight: '600' }}
            >
              {opt}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 4,
    gap: 4,
    marginVertical: spacing.lg,
  },
  btn: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.sm },
  active: { backgroundColor: colors.signature, ...shadows.e1 },
});
