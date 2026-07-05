import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { Txt } from './ui';
import { colors, radius, spacing } from '@/theme';

// Visuel PROVISOIRE pour un club / coach (les photos réelles sont protégées).
// Stylisé volontairement — ce n’est pas une fausse photo.
export function PhotoPlaceholder({
  accent,
  initials,
  height = 150,
  rounded = radius.lg,
  showBadge = true,
}: {
  accent: string;
  initials?: string;
  height?: number;
  rounded?: number;
  showBadge?: boolean;
}) {
  return (
    <View style={[styles.box, { height, borderRadius: rounded }]}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: accent, opacity: 0.16 }]} />
      <View style={[styles.blob, { backgroundColor: accent, opacity: 0.22, top: -30, right: -20 }]} />
      <View style={[styles.blob, { backgroundColor: accent, opacity: 0.14, bottom: -40, left: -10, width: 120, height: 120 }]} />
      <Ionicons name="tennisball-outline" size={height * 0.34} color={accent} style={{ opacity: 0.55 }} />
      {initials ? (
        <Txt variant="display" style={{ position: 'absolute', left: spacing.md, bottom: spacing.sm, opacity: 0.9 }} color={colors.text}>
          {initials}
        </Txt>
      ) : null}
      {showBadge ? (
        <View style={styles.badge}>
          {/* onPhoto (et non textMuted) : le badge est posé sur un scrim sombre — textMuted y
              serait quasi invisible (~1:1). Cohérent avec tout texte sur overlay ailleurs. */}
          <Txt variant="label" color={colors.onPhoto}>
            Visuel provisoire
          </Txt>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  blob: { position: 'absolute', width: 90, height: 90, borderRadius: radius.pill },
  badge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: colors.overlay,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
});
