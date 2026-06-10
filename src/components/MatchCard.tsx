import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Tag, Txt, type IconName } from './ui';
import { lookingIcon, lookingLabel, type Match } from '@/data/matches';
import { inviteToMatch } from '@/lib/share';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing } from '@/theme';

export function MatchCard({ match }: { match: Match }) {
  const { state, toggleJoinMatch } = useApp();
  const joined = state.joinedMatchIds.includes(match.id);
  const isPublic = match.visibility === 'public';
  const filled = Math.min(match.total, match.total - match.spotsLeft + (joined ? 1 : 0));
  const left = Math.max(0, match.total - filled);

  return (
    <Card style={{ marginBottom: spacing.md }}>
      <View style={styles.top}>
        <Tag label={lookingLabel(match.looking)} tone="gold" icon={lookingIcon(match.looking) as IconName} />
        <Tag label={isPublic ? 'Public' : 'Amis'} tone={isPublic ? 'green' : 'neutral'} icon={isPublic ? 'earth' : 'people'} />
      </View>

      <View style={styles.headRow}>
        <View style={{ flex: 1 }}>
          <Txt variant="h3">{match.clubName}</Txt>
          <View style={styles.meta}>
            <Ionicons name="calendar-outline" size={13} color={colors.textMuted} />
            <Txt variant="muted">
              {match.date} · {match.time}
            </Txt>
          </View>
        </View>
        <View style={styles.levelBadge}>
          <Txt variant="small" color={colors.onGold} style={{ fontWeight: '800' }}>
            Niv {match.levelValue.toFixed(1)}
          </Txt>
        </View>
      </View>

      {/* Slots de joueurs */}
      <View style={styles.slots}>
        {Array.from({ length: match.total }).map((_, i) => {
          const isFilled = i < filled;
          return (
            <View key={i} style={[styles.slot, isFilled ? styles.slotFilled : styles.slotOpen]}>
              <Ionicons name={isFilled ? 'person' : 'add'} size={16} color={isFilled ? colors.onGold : colors.textMuted} />
            </View>
          );
        })}
        <Txt variant="small" color={left > 0 ? colors.gold : colors.textMuted} style={{ marginLeft: spacing.sm, fontWeight: '700' }}>
          {left > 0 ? `${left} place${left > 1 ? 's' : ''} libre${left > 1 ? 's' : ''}` : 'Complet'}
        </Txt>
      </View>

      <View style={styles.footer}>
        <Txt variant="muted">Hôte : {match.host}</Txt>
        <View style={styles.actions}>
          <Button size="sm" label="Inviter" icon="share-social" variant="secondary" onPress={() => inviteToMatch(match)} />
          <Button
            size="sm"
            label={joined ? 'Inscrit ✓' : 'Rejoindre'}
            variant={joined ? 'secondary' : 'primary'}
            onPress={() => toggleJoinMatch(match.id)}
            disabled={left === 0 && !joined}
          />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  levelBadge: { backgroundColor: colors.gold, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  slots: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' },
  slot: { width: 38, height: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  slotFilled: { backgroundColor: colors.gold },
  slotOpen: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md, gap: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm },
});
