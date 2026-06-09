import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { RatingStars } from '@/components/RatingStars';
import { Screen } from '@/components/Screen';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Card, IconCircle, SectionHeader, Tag, Txt } from '@/components/ui';
import { getClub } from '@/data/clubs';
import { coaches, type Coach } from '@/data/coaches';
import { useApp } from '@/store/AppContext';
import { fcfa, initials } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';

const TABS = ['Tous', 'Débutant', 'Intermédiaire', 'Avancé'] as const;

function inRange(level: number, tab: (typeof TABS)[number]) {
  if (tab === 'Débutant') return level < 2.5;
  if (tab === 'Intermédiaire') return level >= 2.5 && level < 4.5;
  if (tab === 'Avancé') return level >= 4.5;
  return true;
}

function CoachRow({ coach }: { coach: Coach }) {
  const router = useRouter();
  return (
    <Card onPress={() => router.push(`/coachs/${coach.id}`)} style={{ marginBottom: spacing.md }}>
      <View style={styles.row}>
        <View style={[styles.avatar, { backgroundColor: coach.accent + '22', borderColor: coach.accent + '55' }]}>
          <Txt variant="h2" color={coach.accent}>
            {initials(coach.name)}
          </Txt>
        </View>
        <View style={{ flex: 1 }}>
          <Txt variant="h3">{coach.name}</Txt>
          <Txt variant="muted">
            {coach.level} · {coach.area}
          </Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <RatingStars value={coach.rating} size={13} />
            <Txt variant="small" color={colors.textMuted}>
              {coach.rating.toFixed(1)}
            </Txt>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Tag label={`Niv. ${coach.levelValue.toFixed(1)}`} tone="gold" />
          <Txt variant="price" style={{ fontSize: 15 }}>
            {fcfa(coach.pricePerHour)}
          </Txt>
        </View>
      </View>
      <View style={styles.specs}>
        {coach.specialties.map((s) => (
          <Tag key={s} label={s} tone="neutral" />
        ))}
      </View>
    </Card>
  );
}

export default function CoachsScreen() {
  const { state } = useApp();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Tous');

  const list = [...coaches].sort((a, b) => b.levelValue - a.levelValue).filter((c) => inRange(c.levelValue, tab));
  const clubCoaches = Object.entries(state.clubCoaches).flatMap(([clubId, l]) =>
    l.map((c) => ({ ...c, clubName: getClub(clubId)?.name ?? 'Club' }))
  );

  return (
    <Screen back title="Coachs" subtitle="Classés par niveau — trouve le bon entraîneur">
      <View style={{ marginTop: spacing.xs }}>
        <SegmentedControl options={TABS} value={tab} onChange={setTab} />
      </View>

      {list.map((c) => (
        <CoachRow key={c.id} coach={c} />
      ))}

      {clubCoaches.length > 0 ? (
        <View style={{ marginTop: spacing.xl }}>
          <SectionHeader title="Coachs des clubs" />
          {clubCoaches.map((c) => (
            <Card key={c.id} style={{ marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <IconCircle icon="person" color={colors.gold} bg={colors.goldSoft} size={40} />
              <View style={{ flex: 1 }}>
                <Txt variant="h3" style={{ fontSize: 15 }}>
                  {c.name}
                </Txt>
                <Txt variant="muted">
                  {c.specialty} · {c.clubName}
                </Txt>
              </View>
              <Tag label="Club" tone="neutral" />
            </Card>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  specs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
});
