import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Button, Card, IconCircle, Txt } from '@/components/ui';
import { colors, spacing } from '@/theme';

// Argumentaire pour les GÉRANTS : pourquoi mettre son club sur PadelConnect.
const ARGS: { icon: keyof typeof Ionicons.glyphMap; tint: string; bg: string; title: string; text: string }[] = [
  {
    icon: 'calendar',
    tint: colors.green,
    bg: colors.greenSoft,
    title: 'Des réservations en plus, sans effort',
    text: "Les joueurs de toute la ville voient tes terrains libres et réservent en quelques secondes — même la nuit, même quand personne ne répond au téléphone.",
  },
  {
    icon: 'lock-closed',
    tint: colors.coral,
    bg: colors.coralSoft,
    title: '100% du contrôle de ton planning',
    text: "Les résas prises au téléphone ou sur place se bloquent en deux taps dans ton planning — et elles ne sont jamais facturées. Aucune double-réservation possible.",
  },
  {
    icon: 'wallet',
    tint: colors.amber,
    bg: colors.amberSoft,
    title: 'Un règlement simple, chaque semaine',
    text: "Tu reçois un décompte clair chaque fin de semaine et tu règles par Wave : des petites sommes faciles à suivre, des comptes toujours à jour, zéro mauvaise surprise.",
  },
  {
    icon: 'trophy',
    tint: colors.purple,
    bg: colors.purpleSoft,
    title: 'Tes tournois remplis et gérés',
    text: 'Crée tes tournois, les joueurs s’inscrivent en équipe, tu clôtures en désignant le vainqueur — la communauté revient chez toi.',
  },
  {
    icon: 'megaphone',
    tint: colors.blue,
    bg: colors.blueSoft,
    title: 'Ta vitrine, gérée par toi',
    text: 'Photos, tarifs, offres, événements, coachs : ta page se met à jour en direct depuis ton téléphone.',
  },
];

export default function Pourquoi() {
  const router = useRouter();
  return (
    <Screen back title="Pourquoi rejoindre PadelConnect ?" subtitle="Pour les clubs — simple, contrôlé, payant chaque semaine">
      {ARGS.map((a) => (
        <Card key={a.title} style={styles.row}>
          <IconCircle icon={a.icon} color={a.tint} bg={a.bg} />
          <View style={{ flex: 1 }}>
            <Txt variant="h3">{a.title}</Txt>
            <Txt variant="muted" style={{ marginTop: 2 }}>
              {a.text}
            </Txt>
          </View>
        </Card>
      ))}
      <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm, textAlign: 'center' }}>
        Commission de 10% uniquement sur les parties jouées réservées via l'app. Pas d'abonnement, pas de paiement en ligne.
      </Txt>
      <View style={{ marginTop: spacing.lg }}>
        <Button label="Inscrire mon club" icon="business" onPress={() => router.push('/club-admin')} full />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
});
