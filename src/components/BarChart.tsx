import { useEffect, useRef } from 'react';
import { Animated, Easing, View, StyleSheet } from 'react-native';
import { Txt } from './ui';
import { colors, radius, spacing } from '@/theme';

// Mini graphique à barres verticales (tokens uniquement). Remplissage par créneau,
// stats club… Hauteur relative au max ; barre minimale visible même à 0.
export function BarChart({
  data,
  color = colors.signature,
  height = 88,
}: {
  data: { label: string; value: number }[];
  color?: string;
  height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));

  // Une valeur animée par barre (0 → hauteur finale) — « pousse » à l’apparition, léger décalage
  // en vague (i × 35 ms), même esprit que le CountUp des StatTile juste au-dessus. On grandit le
  // tableau de refs au besoin plutôt que de le recréer, pour rester stable si `data` change de
  // longueur d’un rendu à l’autre.
  const heightsRef = useRef<Animated.Value[]>([]);
  while (heightsRef.current.length < data.length) heightsRef.current.push(new Animated.Value(0));
  const heights = heightsRef.current;

  // Clé STABLE dérivée des valeurs : `data` est souvent un tableau recréé à chaque rendu du
  // parent — sans ça, l’animation rejouait à chaque re-render de la section (sélection d’un
  // jour, confirmation…) au lieu de ne rejouer que quand les CHIFFRES changent vraiment.
  const dataKey = data.map((d) => `${d.label}:${d.value}`).join('|');
  useEffect(() => {
    const anim = Animated.parallel(
      data.map((d, i) => {
        const pct = Math.max(Math.round((d.value / max) * 100), 4);
        return Animated.timing(heights[i], {
          toValue: pct,
          duration: 450,
          delay: i * 35,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false, // on anime une hauteur en %, pas un transform/opacity
        });
      }),
    );
    anim.start();
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey]);

  return (
    <View style={styles.row}>
      {data.map((d, i) => (
        // clé = index + label : robuste même si deux libellés coïncidaient (pas de collision de key).
        <View key={`${i}-${d.label}`} style={styles.col}>
          <Txt variant="small" color={colors.textFaint} style={{ fontSize: 10 }}>
            {d.value}
          </Txt>
          <View style={[styles.track, { height }]}>
            <Animated.View
              style={[
                styles.fill,
                {
                  height: heights[i].interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
                  backgroundColor: color,
                },
              ]}
            />
          </View>
          <Txt variant="small" color={colors.textFaint} style={{ fontSize: 9 }} numberOfLines={1}>
            {d.label}
          </Txt>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs },
  col: { flex: 1, alignItems: 'center', gap: 4 },
  track: { width: '100%', borderRadius: radius.sm, backgroundColor: colors.surfaceAlt, justifyContent: 'flex-end', overflow: 'hidden' },
  fill: { width: '100%', borderRadius: radius.sm },
});
