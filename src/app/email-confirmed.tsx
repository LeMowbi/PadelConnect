import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { PopIn } from '@/components/PopIn';
import { Button, Txt } from '@/components/ui';
import { colors, gradients, radius, spacing } from '@/theme';

// Écran de confirmation d'e-mail DÉDIÉ (remplace le simple toast) : rassure le nouvel inscrit avec
// un vrai « ✅ E-mail validé ! », et surtout NE le renvoie JAMAIS vers l'écran de connexion — la
// session est déjà posée (il est CONNECTÉ), un tap l'amène droit dans l'app. `kind` distingue les
// cas : inscription / changement d'e-mail / bascule de compte / lien expiré.
type Kind = 'signup' | 'change' | 'switch' | 'error';

const COPY: Record<Kind, { icon: keyof typeof Ionicons.glyphMap; title: string; sub: string; cta: string }> = {
  signup: {
    icon: 'checkmark-circle',
    title: 'E-mail validé !',
    sub: 'Bienvenue sur PadelConnect 🎾 Ton compte est prêt — tu peux réserver ton premier terrain.',
    cta: 'Entrer dans l’app',
  },
  change: {
    icon: 'checkmark-circle',
    title: 'Adresse mise à jour',
    sub: 'Ta nouvelle adresse e-mail est bien confirmée.',
    cta: 'Continuer',
  },
  switch: {
    icon: 'swap-horizontal',
    title: 'Compte changé',
    sub: 'Tu es maintenant connecté avec un autre compte.',
    cta: 'Continuer',
  },
  error: {
    icon: 'alert-circle',
    title: 'Lien expiré',
    sub: 'Ce lien de confirmation n’est plus valide. Reconnecte-toi pour en recevoir un nouveau.',
    cta: 'Se reconnecter',
  },
};

export default function EmailConfirmed() {
  const router = useRouter();
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const k: Kind = kind === 'change' || kind === 'switch' || kind === 'error' ? kind : 'signup';
  const c = COPY[k];
  // Succès → accueil (déjà connecté, aucune connexion à refaire) ; erreur → reconnexion.
  const go = () => router.replace(k === 'error' ? '/onboarding' : '/');

  return (
    <LinearGradient colors={gradients.deepGreen} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.wrap}>
      <View style={styles.center}>
        <PopIn>
          <View style={styles.badge}>
            <Ionicons name={c.icon} size={56} color={colors.white} />
          </View>
        </PopIn>
        <Txt variant="h1" color={colors.white} style={styles.title}>
          {c.title}
        </Txt>
        <Txt variant="body" color={colors.onPhoto} style={styles.sub}>
          {c.sub}
        </Txt>
      </View>
      <Button label={c.cta} onPress={go} variant="secondary" full accessibilityLabel={c.cta} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  badge: {
    width: 108,
    height: 108,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.onPhotoSoft,
  },
  title: { textAlign: 'center', marginTop: spacing.lg },
  sub: { textAlign: 'center', maxWidth: 340 },
});
