import { Ionicons } from '@expo/vector-icons';
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Keyboard, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt } from './ui';
import { pushSurface, removeSurface, topSurface } from '@/lib/toastStack';
import { colors, radius, shadows, spacing } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type ToastApi = { show: (message: string, opts?: { icon?: IconName }) => void };

const ToastContext = createContext<ToastApi>({ show: () => {} });

// Pile des surfaces (feuilles modales) qui peuvent dessiner le message — contexte SÉPARÉ de
// `ToastContext` : un changement de pile ou de message ne re-rend que les `ToastOutlet`, jamais
// les dizaines d'écrans qui appellent `useToast()`.
type SurfaceApi = {
  top: string | null;
  register: (id: string) => void;
  unregister: (id: string) => void;
  message: string | null;
  icon: IconName;
  origin: string | null;
  opacity: Animated.Value;
  slide: Animated.Value;
};
const ToastSurfaceContext = createContext<SurfaceApi | null>(null);

/** Petit message éphémère de confirmation (« c’est fait ✅ »), réutilisable partout. */
export function useToast(): ToastApi {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const [icon, setIcon] = useState<IconName>('checkmark-circle');
  // Surface qui dessinait au moment du `show` (null = racine) : seule elle porte la zone
  // d'annonce Android — un message qui CHANGE de surface (feuille qui se ferme) n'est pas relu
  // (natif seulement : sur le web, la zone live est le seul canal, cf. `ToastBubble`).
  const [origin, setOrigin] = useState<string | null>(null);
  // Feuilles ouvertes, de la plus basse à la plus haute. Le ref est la vérité lue par `show`
  // (closure stable) ; l'état ne sert qu'à re-rendre racine et outlets.
  const [surfaces, setSurfaces] = useState<readonly string[]>([]);
  const surfacesRef = useRef<readonly string[]>([]);
  const opacity = useRef(new Animated.Value(0)).current;
  // Glissement vertical (8→0 à l’entrée, 0→6 à la sortie) en parallèle du fondu : même langage
  // que Reveal (fondu + translateY), pour un toast qui « monte » doucement au lieu d’apparaître sec.
  const slide = useRef(new Animated.Value(8)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Génération du message affiché : seul le fondu de sortie du DERNIER `show` l'efface. Un arrêt
  // externe de l'anim (valeurs détachées par React Native lors d'un passage de relais entre
  // surfaces) ne doit jamais laisser un message orphelin figé à l'écran.
  const gen = useRef(0);
  // Nettoyage du timer au démontage (cohérent avec le reste du projet) : pas de setState orphelin.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const register = useCallback((id: string) => {
    surfacesRef.current = pushSurface(surfacesRef.current, id);
    setSurfaces(surfacesRef.current);
  }, []);
  const unregister = useCallback((id: string) => {
    surfacesRef.current = removeSurface(surfacesRef.current, id);
    setSurfaces(surfacesRef.current);
  }, []);

  const show = useCallback<ToastApi['show']>(
    (msg, opts) => {
      const current = ++gen.current;
      setMessage(msg);
      setIcon(opts?.icon ?? 'checkmark-circle');
      setOrigin(topSurface(surfacesRef.current));
      // Le toast est le SEUL canal de confirmation/erreur de l'app : on l'annonce aux lecteurs
      // d'écran (VoiceOver/TalkBack), sinon un utilisateur non-voyant ne sait pas si son action
      // a réussi ou échoué (la View d'affichage est en pointerEvents="none", invisible pour eux).
      // Natif : annonce UNIQUE, ici, quelle que soit la surface qui dessine (racine ou feuille).
      // Web : cet appel ne fait rien (react-native-web) — c'est la zone live de la bulle qui
      // annonce, sur la surface qui dessine (cf. `ToastBubble`).
      AccessibilityInfo.announceForAccessibility(msg);
      if (timer.current) clearTimeout(timer.current);
      slide.setValue(8);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(slide, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start();
      // Durée proportionnelle à la longueur (audit) : 2,4 s ne suffisent pas pour lire un
      // message d'erreur/confirmation de ~120 caractères — ~45 ms par caractère au-delà de 50,
      // plafonné à 7 s pour ne pas coller à l'écran.
      const holdMs = Math.min(7000, Math.max(2400, 2400 + (msg.length - 50) * 45));
      timer.current = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
          Animated.timing(slide, { toValue: 6, duration: 220, useNativeDriver: true }),
        ]).start(() => {
          // Pas de test `finished` : un nouveau `show` (qui interrompt ce fondu) change la
          // génération ; tout autre arrêt doit quand même vider le message.
          if (current === gen.current) setMessage(null);
        });
      }, holdMs);
    },
    [opacity, slide],
  );

  const top = topSurface(surfaces);
  const api = useMemo(() => ({ show }), [show]);
  const surfaceApi = useMemo(
    () => ({ top, register, unregister, message, icon, origin, opacity, slide }),
    [top, register, unregister, message, icon, origin, opacity, slide],
  );

  return (
    <ToastContext.Provider value={api}>
      <ToastSurfaceContext.Provider value={surfaceApi}>
        {children}
        {/* Racine : ne dessine que si AUCUNE feuille n'est ouverte (sinon c'est la plus haute). */}
        {top === null ? <ToastBubble message={message} icon={icon} live={origin === null} opacity={opacity} slide={slide} /> : null}
      </ToastSurfaceContext.Provider>
    </ToastContext.Provider>
  );
}

/**
 * Point d'affichage du toast DANS une feuille modale (BottomSheet, BookingSheet,
 * BookingConfirmation) : un Modal natif passe au-dessus du toast racine, qui restait invisible
 * au moment le plus sensible (« terrain pris », « pas de réseau »). À placer en DERNIER enfant
 * du Modal ; `active` repasse à false dès que la fermeture COMMENCE (anim de sortie) pour rendre
 * aussitôt la main à la surface d'en dessous. Seule la surface la plus haute dessine.
 */
export function ToastOutlet({ active = true }: { active?: boolean }) {
  const id = useId();
  const surface = useContext(ToastSurfaceContext);
  const register = surface?.register;
  const unregister = surface?.unregister;
  // Enregistrement AVEC nettoyage (démontage ou fermeture commencée) : le setState vit chez le
  // fournisseur, appelé via un callback — pas un setState synchrone de cet effet. Effet de LAYOUT,
  // pas passif : sa mise à jour est vidée de façon synchrone à la fin du commit, si bien que la
  // surface d'en dessous rattache la bulle AVANT que React Native ne détache (en microtâche) les
  // valeurs animées partagées — un détachement arrêterait le fondu en cours. Relais atomique,
  // sans frame vide.
  useLayoutEffect(() => {
    if (!active || !register || !unregister) return;
    register(id);
    return () => unregister(id);
  }, [active, id, register, unregister]);

  // Pas de test sur `active` ici : l'outlet dessine tant qu'il est en tête de pile, et c'est le
  // retrait de la pile (ci-dessus) qui passe la main, dans le même commit que la reprise.
  if (!surface || surface.top !== id) return null;
  return (
    <ToastBubble
      message={surface.message}
      icon={surface.icon}
      live={surface.origin === id}
      opacity={surface.opacity}
      slide={surface.slide}
    />
  );
}

// Bulle partagée par la racine et les outlets : mêmes valeurs animées, le message ne fait que
// changer de fenêtre quand une feuille s'ouvre ou se ferme (pas de nouvelle entrée en fondu).
function ToastBubble({
  message,
  icon,
  live,
  opacity,
  slide,
}: {
  message: string | null;
  icon: IconName;
  live: boolean;
  opacity: Animated.Value;
  slide: Animated.Value;
}) {
  const insets = useSafeAreaInsets();
  // iOS : le clavier recouvre le bas de la fenêtre (racine comme Modal) sans la redimensionner —
  // une erreur montrée après « Envoyer », clavier ouvert, restait cachée dessous. La bulle se pose
  // au-dessus de lui. Hauteur initiale lue tout de suite : la bulle peut se monter (relais entre
  // surfaces) alors que le clavier est déjà ouvert. Android redimensionne déjà la fenêtre (même
  // hypothèse que les KeyboardAvoidingView des feuilles, comportement iOS seulement).
  const [keyboard, setKeyboard] = useState(() => (Platform.OS === 'ios' ? (Keyboard.metrics()?.height ?? 0) : 0));
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const onShow = (e: { endCoordinates: { height: number } }) => setKeyboard(e.endCoordinates.height);
    const onHide = () => setKeyboard(0);
    // Les « Will » suivent le clavier en direct ; les « Did » rattrapent une bulle montée PENDANT
    // une transition (`metrics()` reste sur l'ancienne hauteur jusqu'au « Did ») — sans eux, la
    // bulle flotterait au milieu de l'écran jusqu'au prochain évènement clavier.
    const subs = [
      Keyboard.addListener('keyboardWillShow', onShow),
      Keyboard.addListener('keyboardDidShow', onShow),
      Keyboard.addListener('keyboardWillHide', onHide),
      Keyboard.addListener('keyboardDidHide', onHide),
    ];
    return () => subs.forEach((s) => s.remove());
  }, []);
  if (message === null) return null;
  // 'cloud-offline-outline' porte toujours un ÉCHEC réseau (« Connexion impossible ») :
  // le laisser sur fond vert signature faisait croire au succès d'un coup d'œil.
  const isError = icon === 'alert-circle' || icon === 'cloud-offline-outline';
  // Web : `announceForAccessibility` est sans effet, la zone live est le SEUL canal — elle reste
  // donc sur la surface qui dessine, même pour un message relayé depuis une feuille.
  const liveRegion = live || Platform.OS === 'web';
  // Clavier ouvert : il couvre déjà la zone de l'indicateur d'accueil — sa hauteur remplace l'encart.
  const bottomInset = keyboard || insets.bottom;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.wrap, { opacity, bottom: bottomInset + spacing.xl, transform: [{ translateY: slide }] }]}
    >
      <View
        style={[styles.toast, isError && styles.toastDanger]}
        accessible
        accessibilityLiveRegion={liveRegion ? (isError ? 'assertive' : 'polite') : 'none'}
      >
        <Ionicons name={icon} size={18} color={colors.white} />
        <Txt color={colors.white} style={{ flex: 1 }}>
          {message}
        </Txt>
      </View>
    </Animated.View>
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
