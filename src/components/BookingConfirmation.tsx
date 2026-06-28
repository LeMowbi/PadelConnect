import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Confetti } from './Confetti';
import { Button, Txt } from './ui';
import { colors, gradients, radius, spacing } from '@/theme';

// Écran de confirmation PLEIN ÉCRAN (handoff refonte) : dégradé vert, cercle blanc
// avec coche qui « pop », anneau qui se dilate, confettis, puis CTA. Apparition en cascade.
export function BookingConfirmation({
  clubName,
  dayLabel,
  time,
  court,
  participantCount,
  onSeeReservations,
  onClose,
}: {
  clubName: string;
  dayLabel: string;
  time: string;
  court: string;
  participantCount: number;
  onSeeReservations: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const check = useRef(new Animated.Value(0)).current; // 0 → 1 : pop de la coche
  const ring = useRef(new Animated.Value(0)).current; // anneau qui se dilate
  const fade = useRef(new Animated.Value(0)).current; // cascade texte/boutons

  useEffect(() => {
    Animated.sequence([
      Animated.spring(check, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 450, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
    Animated.loop(
      Animated.timing(ring, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ).start();
  }, [check, fade, ring]);

  const ringScale = ring.interpolate({ inputRange: [0, 1], outputRange: [0.8, 2.2] });
  const ringOpacity = ring.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.45, 0] });

  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <LinearGradient colors={gradients.deepGreen} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.root}>
        <Confetti />
        <View style={styles.center}>
          {/* Anneau qui se dilate */}
          <Animated.View style={[styles.ring, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />
          {/* Cercle blanc + coche */}
          <Animated.View style={[styles.circle, { transform: [{ scale: check }] }]}>
            <Ionicons name="checkmark" size={64} color={colors.signature} />
          </Animated.View>

          <Animated.View style={{ opacity: fade, alignItems: 'center' }}>
            <Txt variant="display" color={colors.white} style={{ marginTop: spacing.xl, textAlign: 'center' }}>
              Terrain réservé !
            </Txt>
            <Txt color={colors.onPhoto} style={{ marginTop: spacing.sm, textAlign: 'center' }}>
              {clubName} · {dayLabel} à {time}
            </Txt>
            <View style={styles.badge}>
              <Ionicons name="tennisball" size={15} color={colors.white} />
              <Txt variant="small" color={colors.white} style={{ fontWeight: '700' }}>
                {court} · toi{participantCount > 0 ? ` + ${participantCount}` : ''}
              </Txt>
            </View>
          </Animated.View>
        </View>

        <Animated.View style={[styles.actions, { opacity: fade, paddingBottom: insets.bottom + spacing.xl }]}>
          <Button label="Voir mes réservations" icon="calendar" variant="secondary" onPress={onSeeReservations} full />
          <Button label="Terminé" variant="ghost" onPress={onClose} full />
        </Animated.View>
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: spacing.lg, justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  ring: { position: 'absolute', width: 120, height: 120, borderRadius: radius.pill, borderWidth: 3, borderColor: colors.white },
  circle: {
    width: 120,
    height: 120,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.onPhotoSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    marginTop: spacing.lg,
  },
  actions: { gap: spacing.sm },
});
