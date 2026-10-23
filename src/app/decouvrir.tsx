import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Button, Card, Txt } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { colors, gradients, radius, shadows, spacing } from '@/theme';

// Les 3 règles essentielles présentées dans la maquette (éditorial débutants).
const RULES = [
  'Le service se fait à la cuillère, sous la hanche, en diagonale.',
  'Les vitres font partie du jeu : la balle peut rebondir dessus.',
  'Comptage comme au tennis : 15, 30, 40, jeu.',
];

export default function DecouvrirScreen() {
  const router = useRouter();
  const { state } = useApp();
  // Même définition que la garde du RootNav : une session OU un profil = connecté.
  const signedIn = !!state.account || !!state.serverUserId;

  return (
    <Screen back title="Découvrir le padel">
      {/* Héros dégradé vert signature */}
      <LinearGradient colors={gradients.deepGreen} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroBlob} />
        <Txt variant="label" color={colors.lime}>
          En 2 minutes
        </Txt>
        <Txt variant="h1" color={colors.white} style={styles.heroTitle}>
          Le padel, c’est quoi ?
        </Txt>
      </LinearGradient>

      {/* Paragraphe d’intro */}
      <Txt variant="body" color={colors.textMuted} style={styles.intro}>
        Un mélange de tennis et de squash, joué à 4 sur un terrain vitré. Facile à prendre en main, fun dès la première partie — parfait
        entre amis.
      </Txt>

      {/* Les 3 règles à connaître */}
      <Txt variant="label" style={styles.rulesLabel}>
        3 règles à connaître
      </Txt>
      <Card>
        {RULES.map((rule, i) => (
          <View key={rule} style={[styles.rule, i > 0 && styles.ruleSpaced]}>
            <View style={styles.numberBox}>
              <Txt variant="body" color={colors.signature} style={styles.number}>
                {i + 1}
              </Txt>
            </View>
            <Txt variant="body" style={styles.ruleText}>
              {rule}
            </Txt>
          </View>
        ))}
      </Card>

      {/* CTA principal (aucune géolocalisation : on ne promet pas « près de moi »). Page PUBLIQUE ouverte
          depuis l'onboarding : sans compte, /reserver (protégé) renverrait aussitôt à l'onboarding sans
          rien montrer — on dit donc la vérité et on y retourne ; connecté → écran de réservation. */}
      <View style={styles.cta}>
        {signedIn ? (
          <Button label="Voir les clubs d’Abidjan" icon="business-outline" pill full onPress={() => router.push('/reserver')} />
        ) : (
          <Button
            label="Créer mon compte pour réserver"
            icon="person-add-outline"
            pill
            full
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/onboarding'))}
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    marginTop: spacing.sm,
    borderRadius: radius.xl,
    padding: spacing.lg,
    overflow: 'hidden',
    ...shadows.e2,
  },
  heroBlob: {
    position: 'absolute',
    top: -spacing.xl,
    right: -spacing.lg,
    width: 96,
    height: 96,
    borderRadius: radius.pill,
    backgroundColor: colors.lime,
    opacity: 0.18,
  },
  heroTitle: { marginTop: spacing.sm },
  intro: { marginTop: spacing.lg },
  rulesLabel: { marginTop: spacing.xl, marginBottom: spacing.sm },
  rule: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  ruleSpaced: { marginTop: spacing.md },
  numberBox: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.signatureSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  number: { fontWeight: '700' },
  ruleText: { flex: 1, paddingTop: spacing.xs },
  cta: { marginTop: spacing.xl },
});
