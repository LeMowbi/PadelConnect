import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Card, Tag, Txt } from './ui';
import { compDateLabel, formatFee, teamCount, type Competition } from '@/data/competitions';
import { dayKey } from '@/lib/days';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing } from '@/theme';

export function CompetitionCard({ comp }: { comp: Competition }) {
  const router = useRouter();
  const { state } = useApp();
  const byClub = comp.organizerType === 'club';
  const registered = !!state.compRegistrations[comp.id];
  const teams = teamCount(comp, registered);
  const left = Math.max(0, comp.slots - teams);
  const full = left === 0;
  const pct = Math.min(100, Math.round((teams / comp.slots) * 100));
  // Cycle de vie : à venir → terminé (jour STRICTEMENT passé) → clôturé (vainqueur désigné).
  const finished = comp.dateKey < dayKey(new Date());
  const result = state.compResults[comp.id];
  const mine = state.officialResults.find((o) => o.compId === comp.id);

  return (
    <Card onPress={() => router.push(`/competition/${comp.id}`)} style={{ marginBottom: spacing.md }}>
      <View style={styles.top}>
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', flex: 1 }}>
          <Tag
            label={byClub ? `Club · ${comp.organizer}` : `Joueur · ${comp.organizer}`}
            tone={byClub ? 'blue' : 'green'}
            icon={byClub ? 'business' : 'person'}
          />
          {comp.official ? <Tag label="Officiel" tone="amber" icon="shield-checkmark" /> : null}
          {comp.status === 'pending' ? <Tag label="En attente" tone="coral" icon="hourglass-outline" /> : null}
        </View>
        <Txt variant="muted">{compDateLabel(comp)}</Txt>
      </View>

      <Txt variant="h3" style={{ marginTop: spacing.sm }}>
        {comp.title}
      </Txt>

      {comp.reward.trim() ? (
        <View style={styles.reward}>
          <Ionicons name="gift-outline" size={16} color={colors.purple} />
          <Txt variant="small" color={colors.purple} style={{ flex: 1, fontWeight: '600' }}>
            {formatFee(comp.reward)}
          </Txt>
        </View>
      ) : null}

      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%` as `${number}%` }]} />
      </View>

      <View style={styles.footer}>
        <Txt variant="muted">
          {teams}/{comp.slots} équipes · {formatFee(comp.fee)}
        </Txt>
        {result ? (
          mine?.result === 'win' ? (
            <Tag label="Vainqueur !" tone="amber" icon="trophy" />
          ) : mine?.result === 'last' ? (
            <Tag label="Fin de tableau" tone="coral" icon="arrow-down" />
          ) : registered ? (
            <Tag label="Participé" tone="blue" icon="checkmark" />
          ) : (
            <Tag label={`Vainqueur : ${result.winner}`} tone="neutral" icon="trophy" />
          )
        ) : finished ? (
          <Tag label={registered ? 'Résultats à venir' : 'Terminé'} tone="neutral" icon="hourglass-outline" />
        ) : registered ? (
          <Tag label="Inscrit ✓" tone="green" />
        ) : full ? (
          <Tag label="Complet" tone="danger" />
        ) : left <= 3 ? (
          <Tag label={`Plus que ${left} place${left > 1 ? 's' : ''} !`} tone="coral" icon="flame" />
        ) : (
          <Tag label={`${left} places`} tone="purple" />
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reward: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    backgroundColor: colors.purpleSoft,
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  barTrack: { height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, marginTop: spacing.md, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: radius.pill, backgroundColor: colors.purple },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
});
