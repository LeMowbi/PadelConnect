import { Ionicons } from '@expo/vector-icons';
import { useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { Txt, type IconName } from './ui';
import { hapticLight } from '@/lib/haptics';
import { colors, radius, spacing } from '@/theme';

// Puce de sélection réutilisable (filtres, dates, créneaux, niveaux…).
// Micro-interaction commune à ~tous les écrans : ressort d’appui (scale) + tap haptique léger
// à la sélection — cohérent avec le cœur favori de ClubCard, sans toucher chaque écran.
export function Chip({
  label,
  active,
  onPress,
  size = 'md',
  icon,
  disabled,
  accessibilityLabel,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  size?: 'md' | 'lg';
  icon?: IconName;
  disabled?: boolean;
  // Libellé lecteur d'écran quand le label visuel ne suffit pas (ex. « Retirer l'horaire 12:30 »
  // en mode retrait, ou « Terrain 1, 18:00, fermé » dans les grilles par terrain).
  accessibilityLabel?: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const springTo = (to: number, bounciness: number) =>
    Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 40, bounciness }).start();
  const handlePress = () => {
    if (disabled || !onPress) return;
    hapticLight(); // tap léger : une sélection (date, créneau, filtre…) est un choix engageant
    onPress();
  };
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={disabled ? undefined : handlePress}
        onPressIn={disabled ? undefined : () => springTo(0.94, 0)}
        onPressOut={disabled ? undefined : () => springTo(1, 6)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ selected: !!active, disabled: !!disabled }}
        accessibilityLabel={accessibilityLabel ?? label}
        // La puce mesure ~32-34 px de haut : hitSlop pour atteindre la cible tactile de 44 pt
        // (HIG Apple / 48 dp Android) sans changer le rendu visuel.
        hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
        style={[styles.base, size === 'lg' && styles.lg, active && styles.active, disabled && styles.disabled]}
      >
        {icon ? <Ionicons name={icon} size={13} color={active && !disabled ? colors.onSignature : colors.textMuted} /> : null}
        {/* Tronque un libellé long (nom de club personnalisable) au lieu de casser le pill en 2
            lignes — même garde que Button/Tag. flexShrink borne la largeur dans la rangée wrap. */}
        <Txt
          variant="small"
          // `active && disabled` : le fond désactivé (clair) gagne sur le fond signature → un
          // texte blanc y devenait illisible (ratio ~1). On repasse au texte sombre dans ce cas.
          color={active && !disabled ? colors.onSignature : colors.text}
          style={{ fontWeight: '600', flexShrink: 1 }}
          numberOfLines={1}
        >
          {label}
        </Txt>
      </Pressable>
    </Animated.View>
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
