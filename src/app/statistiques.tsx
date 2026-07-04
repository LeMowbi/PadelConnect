import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BarChart } from '@/components/BarChart';
import { Reveal } from '@/components/Reveal';
import { Screen } from '@/components/Screen';
import { Card, IconCircle, SectionHeader, StatTile, Txt } from '@/components/ui';
import { fetchLeaderboard, fetchMyRank } from '@/lib/leaderboard';
import { isPlayed, useApp } from '@/store/AppContext';
import { colors, radius, spacing } from '@/theme';

// Écran STATISTIQUES JOUEUR (Chantier 6, v2). 100 % réel : parties dérivées des
// réservations passées (miroir local, marche hors-ligne), tournois des résultats
// officiels, points/rang/victoires de match lus du classement serveur (null = échec
// réseau → on affiche « — » sans inventer de chiffre, convention §8).

const MONTHS_FR = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'aoû', 'sep', 'oct', 'nov', 'déc'];

// Activité des 6 derniers mois (UTC, comme tout le projet) : nombre de parties jouées par mois.
function monthlyPlayed(timestamps: number[], now: number): { label: string; value: number }[] {
  const out: { label: string; value: number }[] = [];
  const ref = new Date(now);
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - i, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const value = timestamps.filter((t) => {
      const td = new Date(t);
      return td.getUTCFullYear() === y && td.getUTCMonth() === m;
    }).length;
    out.push({ label: MONTHS_FR[m], value });
  }
  return out;
}

export default function Statistiques() {
  const { state } = useApp();
  // Rang + ligne de classement (points, victoires de match, tournois) : chargés au montage.
  // undefined = pas encore chargé, null = échec réseau, nombre/objet = valeur réelle.
  const [rank, setRank] = useState<number | null | undefined>(undefined);
  const [points, setPoints] = useState<number | null | undefined>(undefined);
  const [matchWins, setMatchWins] = useState<number | null | undefined>(undefined);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    // setState APRÈS await (React Compiler) : pas de setState synchrone dans le corps de l'effet.
    void (async () => {
      const [r, board] = await Promise.all([fetchMyRank(), fetchLeaderboard(100)]);
      if (!alive.current) return;
      setRank(r);
      if (board === null) {
        setPoints(null);
        setMatchWins(null);
        return;
      }
      const mine = state.serverUserId ? board.find((row) => row.userId === state.serverUserId) : undefined;
      setPoints(mine?.points ?? 0);
      setMatchWins(mine?.matchWins ?? 0);
    })();
    return () => {
      alive.current = false;
    };
  }, [state.serverUserId]);

  const now = Date.now();
  const playedTs = state.reservations.filter((r) => isPlayed(r, now)).map((r) => r.startsAt);
  const played = playedTs.length;
  const tournamentsPlayed = state.officialResults.length;
  const tournamentsWon = state.officialResults.filter((o) => o.result === 'win').length;
  const activity = monthlyPlayed(playedTs, now);
  const hasActivity = activity.some((a) => a.value > 0);

  // Affichage d'une valeur serveur : « — » si pas encore chargée ou échec réseau.
  const serverVal = (v: number | null | undefined) => (typeof v === 'number' ? v : '—');

  return (
    <Screen back title="Mes statistiques" subtitle="Ta progression, en vrai">
      {/* Classement — le vrai rang se gagne dans l'app (points), pas le niveau déclaré. */}
      <Reveal>
        <Card style={{ marginTop: spacing.md }}>
          <View style={styles.rankRow}>
            <IconCircle icon="trophy" color={colors.amberDark} bg={colors.amberSoft} size={46} />
            <View style={{ flex: 1 }}>
              <Txt variant="h3">{typeof rank === 'number' && rank > 0 ? `${rank}ᵉ au classement` : 'Pas encore classé'}</Txt>
              <Txt variant="muted">
                {typeof points === 'number'
                  ? `${points} point${points > 1 ? 's' : ''} gagné${points > 1 ? 's' : ''} dans l’app`
                  : 'Joue pour marquer tes premiers points'}
              </Txt>
            </View>
          </View>
        </Card>
      </Reveal>

      {/* Chiffres clés */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Mes chiffres" />
        <View style={styles.grid}>
          <StatTile value={played} label="Parties jouées" color={colors.green} bg={colors.greenSoft} />
          <StatTile value={serverVal(matchWins)} label="Matchs gagnés" color={colors.signature} bg={colors.signatureSoft} />
          <StatTile value={serverVal(points)} label="Points" color={colors.amberDark} bg={colors.amberSoft} />
        </View>
        <View style={[styles.grid, { marginTop: spacing.sm }]}>
          <StatTile value={tournamentsPlayed} label="Tournois joués" color={colors.purple} bg={colors.purpleSoft} />
          <StatTile value={tournamentsWon} label="Tournois gagnés" color={colors.amberDark} bg={colors.amberSoft} />
          <StatTile
            value={typeof rank === 'number' && rank > 0 ? `${rank}ᵉ` : '—'}
            label="Classement"
            color={colors.green}
            bg={colors.greenSoft}
          />
        </View>
      </View>

      {/* Activité mensuelle (6 mois) */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Mon activité" />
        <Card>
          {hasActivity ? (
            <>
              <BarChart data={activity} color={colors.signature} height={100} />
              <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.md, textAlign: 'center' }}>
                Parties jouées sur les 6 derniers mois
              </Txt>
            </>
          ) : (
            <View style={{ alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.sm }}>
              <IconCircle icon="stats-chart" color={colors.textFaint} bg={colors.surfaceAlt} size={44} />
              <Txt variant="muted" style={{ textAlign: 'center' }}>
                Réserve un terrain et joue : ton activité s’affichera ici, mois par mois.
              </Txt>
            </View>
          )}
        </Card>
      </View>

      <View style={styles.note}>
        <Txt variant="small" color={colors.textFaint} style={{ flex: 1 }}>
          Tes points : 100 pour un tournoi officiel gagné, 10 pour un tournoi joué, 3 pour une victoire de match confirmée, 2 par partie
          jouée. Rien n’est inventé — tout se gagne sur le terrain.
        </Txt>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  grid: { flexDirection: 'row', gap: spacing.sm },
  note: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.xl,
  },
});
