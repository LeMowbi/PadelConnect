import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { forwardRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Logo } from './Logo';
import { Txt } from './ui';
import { DOWNLOAD_URL } from '@/lib/referrals';
import { colors, gradients, radius, spacing } from '@/theme';

// Carte de résultat PARTAGEABLE (capturée en image via react-native-view-shot puis envoyée sur
// WhatsApp/Instagram). Dégradé signature « luxe sportif » : Équipe A vs Équipe B, score en gros,
// vainqueur mis en avant (🏆), club + date, et le lien de téléchargement (viralité). Rendue
// hors écran (position absolue, opacity 0) dans l'écran appelant ; le `ref` sert à la capturer.
export type ResultCardProps = {
  teamA: string[]; // « mon équipe » (toi + partenaire) — en haut
  teamB: string[]; // adversaires — en bas
  aWon: boolean; // true = équipe A gagnante (oriente le 🏆)
  score: string; // score vu du vainqueur, ex. « 6-3 · 6-4 »
  clubName: string;
  dateLabel: string;
};

export const ResultCard = forwardRef<View, ResultCardProps>(function ResultCard({ teamA, teamB, aWon, score, clubName, dateLabel }, ref) {
  const team = (names: string[], winner: boolean) => (
    <View style={styles.teamRow}>
      <View style={{ flex: 1 }}>
        {names.map((n, i) => (
          <Txt key={i} variant="h3" color={colors.white} numberOfLines={1} style={styles.player}>
            {n}
          </Txt>
        ))}
      </View>
      {winner ? <Ionicons name="trophy" size={22} color={colors.amber} /> : null}
    </View>
  );

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
          <Txt variant="small" color={colors.amber} style={{ fontWeight: '700' }}>
            padelconnectci.com
          </Txt>
        </View>
        {/* Lien complet en pied discret (source du partage — la page /get route vers les stores). */}
        <Txt variant="small" color={colors.onPhotoSoft} numberOfLines={1} style={{ marginTop: 2 }}>
          {DOWNLOAD_URL}
        </Txt>
      </LinearGradient>
    </View>
  );
});

const styles = StyleSheet.create({
  // Largeur fixe (capturée à la densité de l'écran → image nette). Hors écran chez l'appelant.
  wrap: { width: 340, backgroundColor: colors.signatureDark, borderRadius: radius.xl, overflow: 'hidden' },
  card: { padding: spacing.xl, gap: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  player: { fontSize: 19 },
  scoreWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  scoreLine: { flex: 1, height: 1, backgroundColor: colors.onPhotoSoft },
  score: { fontSize: 30, letterSpacing: 0.5 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
});
