import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BarChart } from '@/components/BarChart';
import { Reveal } from '@/components/Reveal';
import { Screen } from '@/components/Screen';
import { SkeletonLines } from '@/components/Skeleton';
import { Card, Divider, IconCircle, SectionHeader, StatTile, Txt } from '@/components/ui';
import { badgeBoard } from '@/lib/badges';
import { dateKeyLabel, dayKey } from '@/lib/days';
import { levelLabel } from '@/lib/format';
import { fetchLeaderboard, fetchMyRank } from '@/lib/leaderboard';
import { fetchMyLevelHistory, type LevelHistoryEntry } from '@/lib/social';
import { isPlayed, useApp } from '@/store/AppContext';
import { colors, radius, shadows, spacing } from '@/theme';

// Écran STATISTIQUES JOUEUR (Chantier 6, v2). 100 % réel : parties dérivées des
// réservations passées (miroir local, marche hors-ligne), tournois des résultats
// officiels, points/rang/victoires de match lus du classement serveur (null = échec
// réseau → on affiche « — » sans inventer de chiffre, convention §8).

const MONTHS_FR = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'aoû', 'sep', 'oct', 'nov', 'déc'];

const LEVEL_HISTORY_LIMIT = 5; // les 5 derniers ajustements de niveau (carte « Évolution du niveau »)

// Ajustement lisible : « +0,20 » / « −0,10 » (virgule décimale française, vrai signe moins).
function deltaLabel(delta: number): string {
  return `${delta >= 0 ? '+' : '−'}${Math.abs(delta).toFixed(2).replace('.', ',')}`;
}

// Motif de l'ajustement : les tournois officiels (±0,50) restent distincts des matchs validés.
function reasonLabel(entry: LevelHistoryEntry): string {
  return entry.reason === 'tournament' ? 'tournoi' : entry.delta >= 0 ? 'victoire' : 'défaite';
}

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
  const { state, stats, myReservations } = useApp();
  // Rang + ligne de classement (points, victoires de match, tournois) : chargés au montage.
  // undefined = pas encore chargé, null = échec réseau, nombre/objet = valeur réelle.
  const [rank, setRank] = useState<number | null | undefined>(undefined);
  const [points, setPoints] = useState<number | null | undefined>(undefined);
  const [matchWins, setMatchWins] = useState<number | null | undefined>(undefined);
  // Historique des ajustements de niveau (80) : undefined = chargement, null = échec réseau,
  // [] = aucun ajustement pour l'instant (convention §8).
  const [levelHistory, setLevelHistory] = useState<LevelHistoryEntry[] | null | undefined>(undefined);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    // setState APRÈS await (React Compiler) : pas de setState synchrone dans le corps de l'effet.
    void (async () => {
      const [r, board, history] = await Promise.all([fetchMyRank(), fetchLeaderboard(100), fetchMyLevelHistory(LEVEL_HISTORY_LIMIT)]);
      if (!alive.current) return;
      setLevelHistory(history);
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

  // Badges : AUCUN nouveau fetch — tout se dérive de ce que l'écran (ou le store) a déjà.
  // Points et victoires de match viennent du classement serveur : inconnus (chargement ou échec
  // réseau, §8), on passe 0 → les deux badges concernés restent « à débloquer » et une ligne le
  // dit honnêtement, plutôt que de laisser croire que le joueur ne les a pas mérités.
  const serverUnknown = typeof points !== 'number' || typeof matchWins !== 'number';
  const board = badgeBoard({
    playedCount: played,
    tournamentsPlayed,
    tournamentsWon,
    points: typeof points === 'number' ? points : 0,
    validatedWins: typeof matchWins === 'number' ? matchWins : 0,
    weekStreak: stats.streakWeeks, // série calculée sur MES parties (computeStats, store)
    friendsCount: state.friends.length,
  });
  const earned = board.filter((b) => b.earned).length;

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
                  ? `${rank === 1 ? '1ᵉʳ' : `${rank}ᵉ`} au classement`
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
            value={typeof rank === 'number' && rank > 0 ? (rank === 1 ? '1ᵉʳ' : `${rank}ᵉ`) : '—'}
            label="Classement"
            color={colors.green}
            bg={colors.greenSoft}
          />
        </View>
      </View>

      {/* Badges — gamification DOUCE : un simple miroir de ce que le joueur a fait (rien n'est
          offert, rien n'est mémorisé). Les badges non gagnés restent visibles, grisés, pour
          montrer l'objectif suivant. */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Badges" />
        <Card>
          <Txt variant="muted">
            {earned === 0
              ? 'Aucun badge pour l’instant — joue une partie pour décrocher le premier.'
              : `${earned} badge${earned > 1 ? 's' : ''} sur ${board.length} débloqué${earned > 1 ? 's' : ''}.`}
          </Txt>
          <View style={styles.badgeGrid}>
            {board.map(({ badge, earned: got }) => (
              <View
                key={badge.id}
                style={[styles.badge, got ? styles.badgeOn : styles.badgeOff]}
                accessible
                accessibilityLabel={got ? `${badge.title}, badge gagné : ${badge.desc}` : `${badge.title}, à débloquer : ${badge.desc}`}
              >
                {/* L'emoji d'un badge verrouillé est ATTÉNUÉ (on ne peut pas le désaturer en RN). */}
                <Txt variant="h2" style={got ? undefined : styles.badgeIconOff}>
                  {badge.icon}
                </Txt>
                <Txt variant="small" color={got ? colors.text : colors.textMuted} style={styles.badgeTitle}>
                  {badge.title}
                </Txt>
                <Txt variant="small" color={colors.textMuted} style={{ textAlign: 'center' }}>
                  {got ? badge.desc : `À débloquer — ${badge.desc}`}
                </Txt>
              </View>
            ))}
          </View>
          {serverUnknown ? (
            <Txt variant="small" color={colors.textMuted} style={{ marginTop: spacing.md }}>
              Points et victoires de match indisponibles : deux badges peuvent manquer tant que tu n’es pas en ligne.
            </Txt>
          ) : null}
        </Card>
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

      {/* Évolution du niveau (80) : le niveau s'ajuste tout seul quand un match est VALIDÉ
          (un perdant reconnaît le score) et aux tournois officiels — rien n'est déclaratif. */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Évolution du niveau" />
        <Card>
          <View style={styles.levelRow}>
            <IconCircle icon="trending-up" color={colors.signature} bg={colors.signatureSoft} size={46} />
            <View style={{ flex: 1 }}>
              <Txt variant="h3">Niveau {state.level.toFixed(2)}</Txt>
              <Txt variant="muted">{levelLabel(state.level)}</Txt>
            </View>
          </View>
          <Divider style={{ marginVertical: spacing.md }} />
          {levelHistory === undefined ? (
            <SkeletonLines lines={3} />
          ) : levelHistory === null ? (
            <Txt variant="muted">Historique indisponible — reviens quand tu es en ligne.</Txt>
          ) : levelHistory.length === 0 ? (
            <Txt variant="muted">Ton niveau s’ajustera automatiquement après tes premiers matchs validés.</Txt>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {levelHistory.map((h) => {
                const up = h.delta >= 0;
                return (
                  <View key={h.id} style={styles.levelEntry}>
                    <Ionicons name={up ? 'arrow-up' : 'arrow-down'} size={16} color={up ? colors.green : colors.coral} />
                    <Txt variant="body" color={up ? colors.green : colors.coral} style={{ fontWeight: '700' }}>
                      {deltaLabel(h.delta)}
                    </Txt>
                    <Txt variant="small" color={colors.textMuted} style={{ flex: 1 }} numberOfLines={1}>
                      · {reasonLabel(h)}
                    </Txt>
                    <Txt variant="small" color={colors.textFaint}>
                      {dateKeyLabel(dayKey(new Date(h.at)))}
                    </Txt>
                  </View>
                );
              })}
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
  // Grille de badges : deux par ligne sur téléphone, les cartes s'étirent pour remplir la ligne.
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  badge: { flexBasis: '47%', flexGrow: 1, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', gap: 2 },
  // Bordure TRANSPARENTE sur le badge gagné : même géométrie que le verrouillé (bordé), donc
  // aucune carte plus haute que sa voisine sur une même ligne.
  badgeOn: { backgroundColor: colors.signatureSoft, borderWidth: 1, borderColor: 'transparent' },
  badgeOff: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.hairline },
  badgeTitle: { fontWeight: '700', textAlign: 'center' },
  badgeIconOff: { opacity: 0.4 },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  levelEntry: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  note: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.xl,
  },
});
