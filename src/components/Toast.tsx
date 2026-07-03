import { Ionicons } from '@expo/vector-icons';
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt } from './ui';
import { colors, radius, shadows, spacing } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type ToastApi = { show: (message: string, opts?: { icon?: IconName }) => void };

const ToastContext = createContext<ToastApi>({ show: () => {} });

/** Petit message éphémère de confirmation (« c’est fait ✅ »), réutilisable partout. */
export function useToast(): ToastApi {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const [icon, setIcon] = useState<IconName>('checkmark-circle');
  const opacity = useRef(new Animated.Value(0)).current;
  // Glissement vertical (8→0 à l’entrée, 0→6 à la sortie) en parallèle du fondu : même langage
  // que Reveal (fondu + translateY), pour un toast qui « monte » doucement au lieu d’apparaître sec.
  const slide = useRef(new Animated.Value(8)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const show = useCallback<ToastApi['show']>(
    (msg, opts) => {
      setMessage(msg);
      setIcon(opts?.icon ?? 'checkmark-circle');
      // Le toast est le SEUL canal de confirmation/erreur de l'app : on l'annonce aux lecteurs
      // d'écran (VoiceOver/TalkBack), sinon un utilisateur non-voyant ne sait pas si son action
      // a réussi ou échoué (la View d'affichage est en pointerEvents="none", invisible pour eux).
      AccessibilityInfo.announceForAccessibility(msg);
      if (timer.current) clearTimeout(timer.current);
      slide.setValue(8);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(slide, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start();
      timer.current = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
          Animated.timing(slide, { toValue: 6, duration: 220, useNativeDriver: true }),
        ]).start(({ finished }) => {
          if (finished) setMessage(null);
        });
      }, 2400);
    },
    [opacity, slide],
  );

  // 'cloud-offline-outline' porte toujours un ÉCHEC réseau (« Connexion impossible ») :
  // le laisser sur fond vert signature faisait croire au succès d'un coup d'œil.
  const isError = icon === 'alert-circle' || icon === 'cloud-offline-outline';

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {message !== null ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.wrap, { opacity, bottom: insets.bottom + spacing.xl, transform: [{ translateY: slide }] }]}
        >
          <View style={[styles.toast, isError && styles.toastDanger]} accessible accessibilityLiveRegion={isError ? 'assertive' : 'polite'}>
            <Ionicons name={icon} size={18} color={colors.white} />
            <Txt color={colors.white} style={{ flex: 1 }}>
              {message}
            </Txt>
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.lg, right: spacing.lg, alignItems: 'center' },
  toast: {
    ...shadows.e3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: 420,
    backgroundColor: colors.signatureDark,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  // Erreur (icon 'alert-circle' ou 'cloud-offline-outline') : fond corail plutôt que le vert
  // signature des succès — même token que Button variant="danger" / Card.toastError (club/[id].tsx).
  toastDanger: { backgroundColor: colors.danger },
});
