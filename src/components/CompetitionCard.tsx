import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Card, Tag, Txt } from './ui';
import type { Competition } from '@/data/competitions';
import { dayKey } from '@/lib/days';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing } from '@/theme';

export function CompetitionCard({ comp }: { comp: Competition }) {
  const router = useRouter();
  const { state } = useApp();
  const byClub = comp.organizerType === 'club';
  const registered = !!state.compRegistrations[comp.id];
  const teams = comp.registered + (registered ? 1 : 0);
  const left = Math.max(0, comp.slots - teams);
  const full = left === 0;
  const pct = Math.min(100, Math.round((teams / comp.slots) * 100));
  // Tournoi officiel joué mais résultat pas encore déclaré → on guide le joueur.
  const needResult =
    registered &&
    !!comp.official &&
    comp.dateKey <= dayKey(new Date()) &&
    !state.officialResults.some((o) => o.compId === comp.id);

  return (
    <Card onPress={() => router.push(`/competition/${comp.id}`)} style={{ marginBottom: spacing.md }}>
      <View style={styles.top}>
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', flex: 1 }}>
          <Tag label={byClub ? `Club · ${comp.organizer}` : `Joueur · ${comp.organizer}`} tone={byClub ? 'blue' : 'green'} icon={byClub ? 'business' : 'person'} />
          {comp.official ? <Tag label="Officiel" tone="amber" icon="shield-checkmark" /> : null}
        </View>
        <Txt variant="muted">{comp.date}</Txt>
      </View>

      <Txt variant="h3" style={{ marginTop: spacing.sm }}>
        {comp.title}
      </Txt>

      <View style={styles.reward}>
        <Ionicons name="gift-outline" size={16} color={colors.purple} />
        <Txt variant="small" color={colors.purple} style={{ flex: 1, fontWeight: '600' }}>
          {comp.reward}
        </Txt>
      </View>

      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: (`${pct}%` as `${number}%`) }]} />
      </View>

      <View style={styles.footer}>
        <Txt variant="muted">
          {teams}/{comp.slots} équipes · {comp.fee}
        </Txt>
        {needResult ? (
          <Tag label="Résultat à déclarer" tone="gold" icon="alert-circle" />
        ) : registered ? (
          <Tag label="Inscrit ✓" tone="green" />
        ) : full ? (
          <Tag label="Complet" tone="danger" />
        ) : (
          <Tag label={`${left} place${left > 1 ? 's' : ''}`} tone="gold" />
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
  barFill: { height: 6, borderRadius: radius.pill, backgroundColor: colors.gold },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
});
