import { useEffect, useRef } from 'react';
import { Animated, Dimensions, StyleSheet, View } from 'react-native';
import { colors } from '@/theme';

const W = Dimensions.get('window').width;
// Confettis refonte : or / violet / vert / corail.
const PALETTE = [colors.amber, colors.purple, colors.green, colors.coral, colors.lime];
const PIECES = Array.from({ length: 26 }, (_, i) => ({
  left: Math.random() * W,
  size: 6 + Math.random() * 8,
  color: PALETTE[i % PALETTE.length],
  delay: Math.random() * 250,
  rotate: Math.random() * 360,
}));

// Confettis de célébration (sans dépendance). Se joue au montage puis appelle onDone.
export function Confetti({ onDone }: { onDone?: () => void }) {
  const progress = useRef(PIECES.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.parallel(
      PIECES.map((p, i) => Animated.timing(progress[i], { toValue: 1, duration: 1300, delay: p.delay, useNativeDriver: true })),
    ).start();
    const t = setTimeout(() => onDone?.(), 1700);
    return () => clearTimeout(t);
  }, [onDone, progress]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {PIECES.map((p, i) => {
        const translateY = progress[i].interpolate({ inputRange: [0, 1], outputRange: [-40, 620] });
        const opacity = progress[i].interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] });
        const rotate = progress[i].interpolate({ inputRange: [0, 1], outputRange: [`${p.rotate}deg`, `${p.rotate + 320}deg`] });
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              top: 0,
              left: p.left,
              width: p.size,
              height: p.size * 1.4,
              borderRadius: 2,
              backgroundColor: p.color,
              opacity,
              transform: [{ translateY }, { rotate }],
            }}
          />
        );
      })}
    </View>
  );
}
