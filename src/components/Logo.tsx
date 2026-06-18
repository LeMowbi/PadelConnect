import { Image, StyleSheet, Text, View } from 'react-native';
import { colors, font } from '@/theme';

// Logo PadelConnect : symbole (« p » or + balle émeraude) + nom.
export function Logo({ size = 30, tagline }: { size?: number; tagline?: string }) {
  return (
    <View style={styles.row}>
      <Image
        source={require('../../assets/images/brand-mark.png')}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
      <View>
        <Text style={styles.word}>
          Padel<Text style={{ color: colors.signature }}>Connect</Text>
        </Text>
        {tagline ? <Text style={styles.tagline}>{tagline}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  word: {
    color: colors.text,
    fontSize: 20,
    fontWeight: font.weight.heavy,
    letterSpacing: -0.3,
  },
  tagline: {
    color: colors.textFaint,
    fontSize: 10,
    fontWeight: font.weight.semibold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 1,
  },
});
