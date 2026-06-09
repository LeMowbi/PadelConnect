import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Tag, Txt } from './ui';
import type { Competition } from '@/data/competitions';
import { colors, radius, spacing } from '@/theme';

export function CompetitionCard({ comp }: { comp: Competition }) {
  const router = useRouter();
  const [registered, setRegistered] = useState(false);
  const byClub = comp.organizerType === 'club';

  return (
    <Card onPress={() => router.push(`/competition/${comp.id}`)} style={{ marginBottom: spacing.md }}>
      <View style={styles.topRow}>
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', flex: 1 }}>
          <Tag
            label={byClub ? `Club · ${comp.organizer}` : `Joueur · ${comp.organizer}`}
            tone={byClub ? 'neutral' : 'green'}
            icon={byClub ? 'business' : 'person'}
          />
          {comp.official ? <Tag label="Officielle" tone="gold" icon="shield-checkmark" /> : null}
        </View>
        <Txt variant="muted">{comp.date}</Txt>
      </View>

      <Txt variant="h3" style={{ marginTop: spacing.sm }}>
        {comp.title}
      </Txt>

      <View style={styles.reward}>
        <Ionicons name="gift-outline" size={16} color={colors.gold} />
        <Txt variant="small" color={colors.gold} style={{ flex: 1, fontWeight: '600' }}>
          {comp.reward}
        </Txt>
      </View>

      <View style={styles.metaRow}>
        <Txt variant="muted">{comp.format}</Txt>
        <Txt variant="muted">·</Txt>
        <Txt variant="muted">{comp.level}</Txt>
      </View>

      <View style={styles.footer}>
        <Txt variant="muted">
          {comp.registered}/{comp.slots} inscrits · {comp.fee}
        </Txt>
        <Button
          size="sm"
          label={registered ? 'Inscrit ✓' : "S'inscrire"}
          variant={registered ? 'secondary' : 'primary'}
          onPress={() => setRegistered((v) => !v)}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reward: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    backgroundColor: colors.goldSoft,
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  metaRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
});
