import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card, IconCircle, Txt } from '@/components/ui';
import { padelIntro, padelSections, padelTips } from '@/data/padel';
import { colors, radius, spacing } from '@/theme';

export default function DecouvrirScreen() {
  return (
    <Screen back title="Découvrir le padel">
      <Card style={{ marginTop: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm }}>
          <IconCircle icon="tennisball" />
          <Txt variant="h2">C’est quoi le padel ?</Txt>
        </View>
        <Txt variant="body">{padelIntro}</Txt>
      </Card>

      {padelSections.map((s, idx) => {
        // Une couleur par thème pour rythmer la lecture.
        const tint = [colors.signature, colors.blue, colors.purple, colors.coral, colors.green][idx % 5];
        return (
          <Card key={s.title} style={{ marginTop: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
              <Ionicons name={s.icon as keyof typeof Ionicons.glyphMap} size={20} color={tint} />
              <Txt variant="h3">{s.title}</Txt>
            </View>
            {s.points.map((p, i) => (
              <View key={i} style={styles.bullet}>
                <View style={[styles.dot, { backgroundColor: tint }]} />
                <Txt variant="body" style={{ flex: 1 }}>
                  {p}
                </Txt>
              </View>
            ))}
          </Card>
        );
      })}

      <Card style={{ marginTop: spacing.md, backgroundColor: colors.greenSoft, borderColor: 'transparent' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
          <Ionicons name="bulb-outline" size={20} color={colors.green} />
          <Txt variant="h3" color={colors.green}>
            3 conseils pour débuter
          </Txt>
        </View>
        {padelTips.map((t, i) => (
          <View key={i} style={styles.bullet}>
            <Txt variant="body" color={colors.green} style={{ fontWeight: '700' }}>
              {i + 1}.
            </Txt>
            <Txt variant="body" style={{ flex: 1 }}>
              {t}
            </Txt>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.sm },
  dot: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: colors.signature, marginTop: 8 },
});
