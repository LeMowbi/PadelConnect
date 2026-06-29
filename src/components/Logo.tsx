import { Image, StyleSheet, Text, View } from 'react-native';
import { colors, font } from '@/theme';

// Logo PadelConnect : symbole (« p » + balle) + nom. `tone="light"` pour fond foncé (héro vert).
export function Logo({ size = 30, tagline, tone = 'dark' }: { size?: number; tagline?: string; tone?: 'dark' | 'light' }) {
  const light = tone === 'light';
  return (
    <View style={styles.row}>
      <Image source={require('../../assets/images/brand-mark.png')} style={{ width: size, height: size }} resizeMode="contain" />
      <View>
        <Text style={[styles.word, light && { color: colors.white }]}>
          Padel
          <Text style={{ color: light ? colors.lime : colors.signature, fontFamily: font.family.heavy }}>Connect</Text>
        </Text>
        {tagline ? <Text style={[styles.tagline, light && { color: colors.onPhoto }]}>{tagline}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  word: {
    color: colors.text,
    fontSize: 20,
    fontFamily: font.family.heavy,
    fontWeight: font.weight.heavy,
    letterSpacing: -0.3,
  },
  tagline: {
    color: colors.textFaint,
    fontSize: 10,
    fontFamily: font.family.bodySemi,
    fontWeight: font.weight.semibold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 1,
  },
});
