import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
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
  const router = useRouter();
  // Filet de sécurité : si le lien n'est pas reconnu (ni code, ni token, ni jetons) ou si le
  // résultat n'arrive jamais, useEmailConfirmLink reste silencieux → sans issue, le spinner
  // tournerait indéfiniment (route publique = pas d'éjection par le garde). Au-delà de 10 s on
  // renvoie vers /onboarding. Le cas nominal a déjà navigué vers /email-confirmed bien avant.
  useEffect(() => {
    const t = setTimeout(() => router.replace('/onboarding'), 10000);
    return () => clearTimeout(t);
  }, [router]);

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
