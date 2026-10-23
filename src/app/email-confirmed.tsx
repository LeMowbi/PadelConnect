import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PopIn } from '@/components/PopIn';
import { Button, Txt } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { colors, gradients, radius, spacing } from '@/theme';

// Écran de confirmation d'e-mail DÉDIÉ (remplace le simple toast) : rassure le nouvel inscrit avec
// un vrai « ✅ E-mail validé ! », et surtout NE le renvoie JAMAIS vers l'écran de connexion — la
// session est déjà posée (il est CONNECTÉ), un tap l'amène droit dans l'app. `kind` distingue les
// cas : inscription (joueur ou club) / changement d'e-mail / bascule de compte / adresse confirmée
// sur un AUTRE appareil (session impossible à ouvrir ici) / lien expiré.
type Kind = 'signup' | 'change' | 'switch' | 'elsewhere' | 'error';
type Copy = { icon: keyof typeof Ionicons.glyphMap; title: string; sub: string; cta: string };

const COPY: Record<Kind, Copy> = {
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
  // Lien ouvert sur un autre appareil ou navigateur que celui de l'inscription : l'adresse EST
  // confirmée (le serveur l'a validée avant de rediriger), il ne reste qu'à se connecter.
  elsewhere: {
    icon: 'checkmark-circle',
    title: 'Adresse confirmée ✓',
    sub: 'Ton adresse e-mail est bien confirmée. Connecte-toi avec ton e-mail et ton mot de passe pour entrer dans l’app.',
    cta: 'Se connecter',
  },
  // La connexion d'un compte non confirmé ouvre « Vérifie ta boîte mail » avec « Renvoyer l'e-mail ».
  error: {
    icon: 'alert-circle',
    title: 'Lien expiré',
    sub: 'Ce lien de confirmation n’est plus valide. Connecte-toi : on te proposera de renvoyer un nouveau lien.',
    cta: 'Se connecter',
  },
};

// Compte CLUB tout juste confirmé : aucun terrain à réserver, sa demande attend la validation de
// PadelConnect (le profil affiche « Club en cours de validation » jusque-là).
const CLUB_SIGNUP: Copy = {
  icon: 'checkmark-circle',
  title: 'E-mail validé !',
  sub: 'Ta demande de club est transmise ✓ PadelConnect la vérifie et ouvre ton Espace Club dès la validation.',
  cta: 'Entrer dans l’app',
};

export default function EmailConfirmed() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state } = useApp();
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const k: Kind = kind === 'change' || kind === 'switch' || kind === 'elsewhere' || kind === 'error' ? kind : 'signup';
  const c = k === 'signup' && state.accountType === 'club' ? CLUB_SIGNUP : COPY[k];
  // Succès → accueil (déjà connecté, aucune connexion à refaire) ; sans session ici → connexion.
  const go = () => router.replace(k === 'error' || k === 'elsewhere' ? '/onboarding' : '/');

  return (
    <LinearGradient
      colors={gradients.deepGreen}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.wrap, { paddingTop: insets.top + spacing.xl }]}
    >
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
  // paddingTop posé au rendu (zone sûre + 24) : rien ne passe sous l’encoche / la Dynamic Island.
  wrap: { flex: 1, paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
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
