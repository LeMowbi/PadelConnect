import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { SkeletonLines } from '@/components/Skeleton';
import { Button, Card, Divider, Tag, Txt } from '@/components/ui';
import { fetchLeaderboard, fetchMyRank, type LeaderboardRow } from '@/lib/leaderboard';
import { usePullToRefresh } from '@/lib/usePullToRefresh';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing } from '@/theme';

// CLASSEMENT GÉNÉRAL par POINTS (modèle « Race » FIP, 46) : le niveau est plafonné à 7 et
// déclaré à l'inscription — il ne peut pas servir de rang. Les points, eux, se GAGNENT dans
// l'app (100 = tournoi officiel gagné · 10 = tournoi officiel joué · 3 = victoire de match
// confirmée · 2 = partie jouée) : infalsifiables, sans plafond. Top 50 + MA position
// toujours affichée, même hors du top.
const MEDALS = ['🥇', '🥈', '🥉'];

export default function ClassementScreen() {
  const { state } = useApp();
  // undefined = chargement ; null = échec réseau (≠ [] = classement vide), convention §8.
  const [rows, setRows] = useState<LeaderboardRow[] | null | undefined>(undefined);
  const [myRank, setMyRank] = useState<number | null>(null);
  // rank : null = échec réseau (on garde la valeur affichée) ; 0 = non classé (on masque la
  // carte « Ta position ») ; sinon = rang réel. Les vieux serveurs (avant la 49) renvoient
  // encore null pour « non classé » — dans ce cas on garde simplement l'existant, comme avant.
  const applyRank = (rank: number | null) => {
    if (rank === null) return; // échec réseau (ou vieux serveur « non classé ») → inchangé
    setMyRank(rank === 0 ? null : rank);
  };
  const load = async () => {
    const [list, rank] = await Promise.all([fetchLeaderboard(50), fetchMyRank()]);
    setRows((cur) => list ?? (cur === undefined ? null : cur)); // échec → on garde l'existant
    applyRank(rank);
  };
  const { refreshControl } = usePullToRefresh(load);
  useEffect(() => {
    let alive = true;
    void Promise.all([fetchLeaderboard(50), fetchMyRank()]).then(([list, rank]) => {
      if (!alive) return;
      setRows(list);
      applyRank(rank);
    });
    return () => {
      alive = false;
    };
  }, []);

  const me = state.serverUserId;
  const myRow = (rows ?? []).find((r) => r.userId === me);

  return (
    <Screen back title="Classement" subtitle="Les joueurs PadelConnect, par points" refreshControl={refreshControl}>
      {/* Ma position — toujours visible, même 137ᵉ (objectif personnel avant tout). */}
      {me && (myRank != null || myRow) ? (
        <Card style={styles.meCard}>
          <View style={styles.meRank}>
            <Txt variant="h2" color={colors.onSignature}>
              {myRank ?? (rows ?? []).findIndex((r) => r.userId === me) + 1}
            </Txt>
          </View>
          <View style={{ flex: 1 }}>
            <Txt variant="h3">Ta position</Txt>
            <Txt variant="small" color={colors.textMuted}>
              Joue (+2 pts), gagne tes matchs (+3), fais les tournois officiels (+10), gagne-les (+100).
            </Txt>
          </View>
          {/* Points affichés seulement si je suis dans le top chargé (sinon on ne les connaît pas). */}
          {myRow ? <Tag label={`${myRow.points} pts`} tone="green" /> : null}
        </Card>
      ) : null}

      {rows === undefined ? (
        <Card style={{ marginTop: spacing.lg }}>
          <SkeletonLines lines={6} />
        </Card>
      ) : rows === null ? (
        <Card style={{ marginTop: spacing.lg, alignItems: 'center', paddingVertical: spacing.lg }}>
          <Ionicons name="cloud-offline-outline" size={24} color={colors.textFaint} />
          <Txt variant="muted" style={{ marginTop: spacing.sm, textAlign: 'center' }}>
            Impossible de charger le classement — vérifie ta connexion.
          </Txt>
          <View style={{ marginTop: spacing.md }}>
            <Button size="sm" label="Réessayer" icon="refresh" variant="secondary" onPress={() => void load()} />
          </View>
        </Card>
      ) : (
        <Card style={{ marginTop: spacing.lg }}>
          {rows.map((r, i) => {
            const isMe = r.userId === me;
            return (
              <View key={r.userId}>
                {i > 0 ? <Divider style={{ marginVertical: spacing.sm }} /> : null}
                <View style={[styles.row, isMe && styles.rowMe]}>
                  <Txt variant="h3" style={styles.rank}>
                    {MEDALS[i] ?? `${i + 1}`}
                  </Txt>
                  <View style={{ flex: 1 }}>
                    <Txt variant="body" numberOfLines={1} style={{ fontWeight: isMe ? '800' : '600' }}>
                      {r.name}
                      {isMe ? ' (toi)' : ''}
                    </Txt>
                    <Txt variant="small" color={colors.textMuted} numberOfLines={1}>
                      {r.wins > 0 ? `🏆 ${r.wins} tournoi${r.wins > 1 ? 's' : ''} gagné${r.wins > 1 ? 's' : ''} · ` : ''}
                      {r.offPlayed > 0 ? `${r.offPlayed} officiel${r.offPlayed > 1 ? 's' : ''} joué${r.offPlayed > 1 ? 's' : ''} · ` : ''}
                      {r.matchWins > 0 ? `${r.matchWins} victoire${r.matchWins > 1 ? 's' : ''} · ` : ''}
                      {r.played} partie{r.played > 1 ? 's' : ''} · niv. {r.level.toFixed(1)}
                    </Txt>
                  </View>
                  <Tag label={`${r.points} pts`} tone={i < 3 ? 'amber' : 'neutral'} />
                </View>
              </View>
            );
          })}
        </Card>
      )}
      <Txt variant="small" color={colors.textMuted} style={{ marginTop: spacing.md }}>
        Les points se gagnent en JOUANT : 100 pour un tournoi officiel gagné (badge doré), 10 pour y participer, 3 par match gagné (chaque
        joueur saisit le score dans « Mes réservations », l’app valide dès que les saisies concordent), 2 par partie jouée. Tout est vérifié
        — rien ne se déclare tout seul.
      </Txt>
    </Screen>
  );
}

const styles = StyleSheet.create({
  meCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  meRank: {
    minWidth: 46,
    height: 46,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    backgroundColor: colors.signature,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowMe: { backgroundColor: colors.signatureSoft, borderRadius: radius.md, padding: spacing.xs, margin: -spacing.xs },
  rank: { minWidth: 30, textAlign: 'center' },
});
