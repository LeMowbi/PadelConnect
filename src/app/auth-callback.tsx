import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { Logo } from '@/components/Logo';
import { Txt } from '@/components/ui';
import { colors, gradients, spacing } from '@/theme';

// Écran affiché PENDANT le traitement du lien de confirmation d'e-mail : useEmailConfirmLink
// (_layout) établit la session à partir du lien, puis redirige vers /email-confirmed. On NE
// redirige PAS vers « / » ici — à froid, un compte pas encore posé rebondirait une fraction de
// seconde vers /onboarding (l'écran de connexion). Route PUBLIQUE (cf. _layout) → on reste sur ce
// visuel « Validation… » jusqu'à ce que la confirmation aboutisse. Plus de passage par la connexion.
export default function AuthCallback() {
  return (
    <LinearGradient colors={gradients.deepGreen} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.wrap}>
      <Logo size={52} tone="light" />
      <ActivityIndicator color={colors.white} style={{ marginTop: spacing.xl }} />
      <Txt variant="body" color={colors.onPhoto} style={{ marginTop: spacing.md }}>
        Validation de ton e-mail…
      </Txt>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
});
