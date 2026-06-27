import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import { Reveal } from '@/components/Reveal';
import { Screen } from '@/components/Screen';
import { Button, Card, IconCircle, StatTile, Txt } from '@/components/ui';
import { openWhatsApp } from '@/lib/contact';
import { colors, gradients, radius, shadows, spacing } from '@/theme';

const APP_URL = 'https://lemowbi.github.io/PadelConnect/';

// Parrainage : l'invitation WhatsApp FONCTIONNE déjà (partage client). Le compteur
// d'amis ayant rejoint, lui, se synchronisera avec la version connectée (§B serveur).
export default function ParrainageScreen() {
  const invite = () =>
    openWhatsApp(
      '',
      `Rejoins-moi sur PadelConnect 🎾 — on réserve un terrain de padel à Abidjan en 2 minutes.\n${APP_URL}`
    );

  return (
    <Screen back title="Parrainage" subtitle="Invite tes amis à jouer">
      <Reveal>
        <LinearGradient colors={gradients.deepGreen} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="gift-outline" size={26} color={colors.lime} />
          </View>
          <Txt variant="display" color={colors.onSignature} style={{ fontSize: 24, marginTop: spacing.md }}>
            Joue à plusieurs
          </Txt>
          <Txt variant="small" color="rgba(255,255,255,0.85)" style={{ marginTop: 4 }}>
            Le padel, c'est mieux entre amis. Invite-les — tu les retrouves direct sur tes réservations.
          </Txt>
        </LinearGradient>

        <View style={styles.stats}>
          <StatTile value="0" label="Amis rejoints" color={colors.signature} bg={colors.signatureSoft} />
          <StatTile value="∞" label="Invitations" color={colors.blue} bg={colors.blueSoft} />
        </View>

        <View style={{ marginTop: spacing.lg }}>
          <Button label="Inviter par WhatsApp" icon="logo-whatsapp" onPress={invite} full pill />
        </View>

        <Card style={{ marginTop: spacing.lg, flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
          <IconCircle icon="people-outline" color={colors.purple} bg={colors.purpleSoft} />
          <Txt variant="small" color={colors.textMuted} style={{ flex: 1 }}>
            Le compteur d'amis ayant rejoint se synchronisera avec la version connectée. L'invitation WhatsApp, elle, fonctionne déjà.
          </Txt>
        </Card>
      </Reveal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.xl, padding: spacing.lg, marginTop: spacing.sm, ...shadows.e2 },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stats: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
});
