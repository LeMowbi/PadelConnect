import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt } from './ui';
import { colors, radius, shadows, spacing } from '@/theme';

// Décalage de sortie de la feuille : la hauteur de l’écran garantit qu’elle est toujours
// entièrement hors-champ, quelle que soit la taille de son contenu (pas besoin de mesurer).
const SHEET_OFFSET = Dimensions.get('window').height;

// Feuille modale qui monte du bas — overlay sombre, poignée, titre, contenu défilable.
// Fondu du scrim + glissement de la feuille pilotés à la main (motif Toast.tsx : fade+translateY),
// avec une sortie symétrique : le Modal natif reste affiché (contenu monté) le temps de l’anim
// de sortie, et ne se démonte qu’une fois celle-ci terminée.
export function BottomSheet({
  visible,
  title,
  subtitle,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const backdropOpacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const sheetY = useRef(new Animated.Value(visible ? 0 : SHEET_OFFSET)).current;
  // Le Modal natif reste monté tant que `mounted` est vrai — y compris pendant l’anim de sortie
  // (le contenu doit rester visible pendant que la feuille glisse hors champ).
  const [mounted, setMounted] = useState(visible);
  // Ouverture : ajustement d’état pendant le rendu (pas dans un effet — pattern React standard
  // pour synchroniser un state sur un prop, sans le souci de setState synchrone dans un effet).
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(sheetY, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(sheetY, { toValue: SHEET_OFFSET, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start(({ finished }) => {
        // setState dans le callback de fin d’anim (asynchrone) — pas un setState synchrone d’effet.
        if (finished) setMounted(false);
      });
    }
  }, [visible, mounted, backdropOpacity, sheetY]);

  if (!mounted) return null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        {/* Scrim MASQUÉ des lecteurs d'écran : sinon le premier balayage VoiceOver tombe sur un
            bouton anonyme plein écran qui ferme la feuille (et perd la saisie). La fermeture
            accessible passe par le bouton « Fermer » libellé + onRequestClose. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} importantForAccessibility="no-hide-descendants" />
      </Animated.View>
      <KeyboardAvoidingView style={styles.wrapper} pointerEvents="box-none" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* accessibilityViewIsModal : le lecteur d'écran reste PIÉGÉ dans la feuille (il ne
            balaye pas le contenu d'arrière-plan derrière elle). Le titre porte le rôle « header ». */}
        <Animated.View
          accessibilityViewIsModal
          style={[styles.sheet, { paddingBottom: spacing.xxl + insets.bottom, transform: [{ translateY: sheetY }] }]}
        >
          <View style={styles.handle} />
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Txt variant="h2" accessibilityRole="header" style={{ fontSize: 19 }}>
                {title}
              </Txt>
              {subtitle ? (
                <Txt variant="muted" style={{ marginTop: 2 }}>
                  {subtitle}
                </Txt>
              ) : null}
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Fermer">
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim },
  wrapper: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    ...shadows.e3,
    // Plafond tablette : une feuille pleine largeur d'iPad serait démesurée — 480 pt max, centrée.
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.sm },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
