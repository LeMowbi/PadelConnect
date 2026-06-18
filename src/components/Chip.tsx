import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';
import { Txt, type IconName } from './ui';
import { colors, radius, spacing } from '@/theme';

// Puce de sélection réutilisable (filtres, dates, créneaux, niveaux…).
export function Chip({
  label,
  active,
  onPress,
  size = 'md',
  icon,
  disabled,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  size?: 'md' | 'lg';
  icon?: IconName;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={[styles.base, size === 'lg' && styles.lg, active && styles.active, disabled && styles.disabled]}
    >
      {icon ? <Ionicons name={icon} size={13} color={active ? colors.onSignature : colors.textMuted} /> : null}
      <Txt variant="small" color={active ? colors.onSignature : colors.text} style={{ fontWeight: '600' }}>
        {label}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  lg: { paddingHorizontal: spacing.lg },
  active: { backgroundColor: colors.signature, borderColor: colors.signature },
  disabled: { backgroundColor: colors.surfaceAlt, borderColor: colors.border, opacity: 0.6 },
});
