import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { colors, font } from '@/theme';

// Splash animée jouée une fois au lancement : le symbole « P » apparaît et grossit, puis le
// mot « PadelConnect » se déploie à sa droite, courte pause, puis fondu de sortie qui révèle
// l'app. Animations sur le natif (useNativeDriver) → fluides, sans bloquer le JS.
export function AnimatedSplash({ onDone }: { onDone: () => void }) {
  const markScale = useRef(new Animated.Value(0.4)).current;
  const markOpacity = useRef(new Animated.Value(0)).current;
  const wordOpacity = useRef(new Animated.Value(0)).current;
  const wordShift = useRef(new Animated.Value(-18)).current;
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.sequence([
      // 1) le « P » entre en scène et grossit.
      Animated.parallel([
        Animated.timing(markOpacity, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(markScale, { toValue: 1, friction: 6, tension: 55, useNativeDriver: true }),
      ]),
      // 2) « PadelConnect » se déploie depuis le P (glisse + apparaît).
      Animated.parallel([
        Animated.timing(wordOpacity, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(wordShift, { toValue: 0, duration: 460, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }),
      ]),
      Animated.delay(520),
      // 3) fondu de sortie → l'app apparaît derrière.
      Animated.timing(fade, { toValue: 0, duration: 420, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]);
    anim.start(({ finished }) => {
      if (finished) onDone();
    });
    return () => anim.stop();
  }, [fade, markOpacity, markScale, onDone, wordOpacity, wordShift]);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.container, { opacity: fade }]} pointerEvents="none">
      <View style={styles.row}>
        <Animated.Image
          source={require('../../assets/images/brand-mark.png')}
          style={{ width: 54, height: 54, opacity: markOpacity, transform: [{ scale: markScale }] }}
          resizeMode="contain"
        />
        <Animated.Text style={[styles.word, { opacity: wordOpacity, transform: [{ translateX: wordShift }] }]} numberOfLines={1}>
          Padel<Text style={styles.connect}>Connect</Text>
        </Animated.Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  word: {
    color: colors.text,
    fontSize: 32,
    fontFamily: font.family.heavy,
    fontWeight: font.weight.heavy,
    letterSpacing: -0.5,
  },
  connect: { color: colors.signature, fontFamily: font.family.heavy },
});
