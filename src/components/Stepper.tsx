import { View, StyleSheet } from 'react-native';
import { Txt } from './ui';
import { colors, radius, spacing } from '@/theme';

// Barre de progression à N segments : « Étape X/N · {libellé} ». Les segments
// franchis sont en signature, les suivants en surfaceAlt. Purement visuel.
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  const safe = Math.max(0, Math.min(current, steps.length - 1));
  return (
    <View style={{ marginTop: spacing.sm }}>
      <View style={styles.track}>
        {steps.map((s, i) => (
          <View key={s} style={[styles.seg, { backgroundColor: i <= safe ? colors.signature : colors.surfaceAlt }]} />
        ))}
      </View>
      <Txt variant="small" color={colors.textMuted} style={{ marginTop: spacing.xs }}>
        Étape {safe + 1}/{steps.length} · {steps[safe]}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', gap: 4 },
  seg: { flex: 1, height: 5, borderRadius: radius.pill },
});
