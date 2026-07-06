import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { forwardRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Logo } from './Logo';
import { Txt } from './ui';
import { DOWNLOAD_URL } from '@/lib/referrals';
import { colors, gradients, radius, shadows, spacing } from '@/theme';

// Carte de résultat PARTAGEABLE (capturée en image via react-native-view-shot puis envoyée sur
// WhatsApp/Instagram). Dégradé signature « luxe sportif » : Équipe A vs Équipe B, score en gros,
// vainqueur mis en avant (nom doré + 🏆), club + date, et le lien de téléchargement (viralité).
// Affichée en APERÇU dans la feuille de partage (l'utilisateur voit la carte réellement capturée) ;
// le `ref` transmis par l'appelant sert à la capturer telle quelle.
export type ResultCardProps = {
  teamA: string[]; // « mon équipe » (toi + partenaire) — en haut
  teamB: string[]; // adversaires — en bas
  aWon: boolean; // true = équipe A gagnante (oriente le 🏆)
  score: string; // score vu du vainqueur, ex. « 6-3 · 6-4 »
  clubName: string;
  dateLabel: string;
};

export const ResultCard = forwardRef<View, ResultCardProps>(function ResultCard({ teamA, teamB, aWon, score, clubName, dateLabel }, ref) {
  const team = (names: string[], winner: boolean) => {
    // Repli si l'adversaire n'a pas de nom connu (match ouvert, invités non renseignés) : on ne
    // partage jamais une ligne vide (juste un trophée flottant), on affiche « Adversaire ».
    const shown = names.length ? names : ['Adversaire'];
    return (
      <View style={styles.teamRow}>
        <View style={{ flex: 1 }}>
          {shown.map((n, i) => (
            // Nom du camp gagnant en OR (fierté du vainqueur = raison d'être du partage).
            <Txt key={i} variant="h3" color={winner ? colors.amber : colors.white} numberOfLines={1} style={styles.player}>
              {n}
            </Txt>
          ))}
        </View>
        {winner ? <Ionicons name="trophy" size={22} color={colors.amber} /> : null}
      </View>
    );
  };

  return (
    <View ref={ref} collapsable={false} style={styles.wrap}>
      <LinearGradient colors={gradients.deepGreen} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <View style={styles.head}>
          <Logo size={26} tone="light" />
          <Txt variant="label" color={colors.onPhoto} style={{ letterSpacing: 1.5 }}>
            Résultat
          </Txt>
        </View>

        {team(teamA, aWon)}
        <View style={styles.scoreWrap}>
          <View style={styles.scoreLine} />
          <Txt variant="display" color={colors.white} style={styles.score}>
            {score || '—'}
          </Txt>
          <View style={styles.scoreLine} />
        </View>
        {team(teamB, !aWon)}

        <View style={styles.foot}>
          <Txt variant="small" color={colors.onPhoto} numberOfLines={1} style={{ flex: 1 }}>
            {clubName} · {dateLabel}
          </Txt>
        </View>
        {/* Lien de téléchargement en pied — CTA viral, LISIBLE (or gras). La page /get route vers
            l'App Store / Google Play selon l'appareil. Un seul rendu du lien (pas de doublon). */}
        <Txt variant="small" color={colors.amber} numberOfLines={1} style={styles.link}>
          {DOWNLOAD_URL}
        </Txt>
      </LinearGradient>
    </View>
  );
});

const styles = StyleSheet.create({
  // Largeur fixe (capturée à la densité de l'écran → image nette). Élévation e2 : la carte se
  // détache du fond blanc de la feuille de partage où elle s'affiche en aperçu.
  wrap: { width: 340, backgroundColor: colors.signatureDark, borderRadius: radius.xl, overflow: 'hidden', ...shadows.e2 },
  card: { padding: spacing.xl, gap: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  player: { fontSize: 19 },
  scoreWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  scoreLine: { flex: 1, height: 1, backgroundColor: colors.onPhotoSoft },
  score: { fontSize: 30, letterSpacing: 0.5 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  link: { marginTop: 2, fontWeight: '700' },
});
