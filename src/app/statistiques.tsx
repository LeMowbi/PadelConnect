import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BarChart } from '@/components/BarChart';
import { Reveal } from '@/components/Reveal';
import { Screen } from '@/components/Screen';
import { Card, IconCircle, SectionHeader, StatTile, Txt } from '@/components/ui';
import { fetchLeaderboard, fetchMyRank } from '@/lib/leaderboard';
import { isPlayed, useApp } from '@/store/AppContext';
import { colors, radius, shadows, spacing } from '@/theme';

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
  const { state, myReservations } = useApp();
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
      // `fetchLeaderboard(100)` ne renvoie que le TOP 100. Trois cas pour un joueur ABSENT du lot :
      //  • rang 0 (serveur : « non classé ») → il a réellement 0 point / 0 victoire → on affiche 0 ;
      //  • rang > 0 (classé au-delà du top 100) → valeur INCONNUE → « — » (on n'invente pas) ;
      //  • rang null (échec réseau) → « — » aussi.
      const mine = state.serverUserId ? board.find((row) => row.userId === state.serverUserId) : undefined;
      setPoints(mine ? mine.points : r === 0 ? 0 : null);
      setMatchWins(mine ? mine.matchWins : r === 0 ? 0 : null);
    })();
    return () => {
      alive.current = false;
    };
  }, [state.serverUserId]);

  const now = Date.now();
  // MES parties seulement : `state.reservations` contient, pour un compte club/opérateur, TOUTES
  // les résas de son périmètre (RLS) → on part de `myReservations` (comme Profil) pour ne pas
  // gonfler « parties jouées » et le graphe d'activité avec les résas des autres joueurs.
  const playedTs = myReservations.filter((r) => isPlayed(r, now)).map((r) => r.startsAt);
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
        <Card style={{ marginTop: spacing.md, ...shadows.e2 }}>
          <View style={styles.rankRow}>
            {/* Rang classé → pastille pleine signature (même « hero » que /classement) ; sinon
                trophée ambré (non classé / indisponible), pour ne pas afficher un chiffre inventé. */}
            {typeof rank === 'number' && rank > 0 ? (
              <View style={styles.rankBadge}>
                <Txt variant="h2" color={colors.onSignature}>
                  {rank}
                </Txt>
              </View>
            ) : (
              <IconCircle icon="trophy" color={colors.amberDark} bg={colors.amberSoft} size={46} />
            )}
            <View style={{ flex: 1 }}>
              {/* On ne dit « Pas encore classé » QUE si le serveur a répondu rang 0 : un null/undefined
                  (échec réseau ou chargement) ne doit pas faire mentir un joueur réellement classé (§8). */}
              <Txt variant="h3">
                {typeof rank === 'number' && rank > 0
                  ? `${rank}ᵉ au classement`
                  : rank === 0
                    ? 'Pas encore classé'
                    : 'Classement indisponible'}
              </Txt>
              <Txt variant="muted">
                {typeof points === 'number'
                  ? `${points} point${points > 1 ? 's' : ''} gagné${points > 1 ? 's' : ''} dans l’app`
                  : typeof rank === 'number' && rank > 0
                    ? 'Tu es dans le classement'
                    : rank === 0
                      ? 'Joue pour marquer tes premiers points'
                      : 'Reviens quand tu es en ligne'}
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
        <Txt variant="small" color={colors.textMuted} style={{ flex: 1 }}>
          Tes points : 100 pour un tournoi officiel gagné, 10 pour un tournoi joué, 3 pour une victoire de match confirmée, 2 par partie
          jouée. Rien n’est inventé — tout se gagne sur le terrain.
        </Txt>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rankBadge: {
    minWidth: 46,
    height: 46,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.signature,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
