import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MAX_CONTENT_WIDTH } from './Screen';
import { Button, Txt } from './ui';
import { colors, shadows, spacing } from '@/theme';

// Barre d’action collante en bas d’écran : info à gauche (prix…), CTA pill à droite.
// À placer via la prop `overlay` du composant Screen ; prévoir un paddingBottom sur
// le contenu pour qu’il ne soit pas masqué (≈ 92 + insets). Le fond reste pleine largeur, mais
// prix et CTA tiennent dans la colonne centrée de Screen (640 pt) : sur ordinateur ou iPad, ils ne
// partent plus aux deux bords de l'écran, loin du contenu.
export function StickyBar({
  label,
  hint,
  cta,
  onPress,
  disabled,
}: {
  label: string;
  hint?: string;
  cta: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: spacing.md + insets.bottom }]}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Txt variant="price" numberOfLines={1}>
            {label}
          </Txt>
          {hint ? (
            <Txt variant="small" color={colors.textMuted} numberOfLines={1}>
              {hint}
            </Txt>
          ) : null}
        </View>
        <Button label={cta} icon="arrow-forward" onPress={onPress} disabled={disabled} pill />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bgElevated,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    // ombre montante
    shadowColor: shadows.e2.shadowColor,
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -6 },
    elevation: 12,
  },
  row: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg, // mêmes marges que le contenu de Screen → bords alignés
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
});
