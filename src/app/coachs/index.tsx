import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ContactButtons } from '@/components/ContactButtons';
import { Screen } from '@/components/Screen';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Card, IconCircle, SectionHeader, Tag, Txt } from '@/components/ui';
import { findClub } from '@/data/clubs';
import { coachClubName, coaches, type Coach } from '@/data/coaches';
import { useApp } from '@/store/AppContext';
import { initials } from '@/lib/format';
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
          <Txt variant="muted">{coach.level}</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <Ionicons name="business-outline" size={13} color={colors.textMuted} />
            <Txt variant="small" color={colors.textMuted}>
              {coachClubName(coach)}
            </Txt>
          </View>
        </View>
        <Tag label={`Niv. ${coach.levelValue.toFixed(1)}`} tone="blue" />
      </View>
      <View style={styles.specs}>
        {coach.specialties.map((s) => (
          <Tag key={s} label={s} tone="neutral" />
        ))}
      </View>
      <ContactButtons phone={coach.phone} primaryCall style={{ marginTop: spacing.md }} />
    </Card>
  );
}

export default function CoachsScreen() {
  const { state } = useApp();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Tous');

  const list = [...coaches]
    .filter((c) => !state.hiddenCoachIds.includes(c.id)) // coachs retirés par leur club
    .sort((a, b) => b.levelValue - a.levelValue)
    .filter((c) => inRange(c.levelValue, tab));
  const clubCoaches = Object.entries(state.clubCoaches).flatMap(([clubId, l]) =>
    l.map((c) => ({ ...c, clubName: findClub(clubId, state.customClubs, state.clubInfo)?.name ?? 'Club' }))
  );

  return (
    <Screen back title="Coachs" subtitle="Classés par niveau — contacte-les directement">
      <View style={styles.note}>
        <Ionicons name="information-circle-outline" size={15} color={colors.textFaint} />
        <Txt variant="small" color={colors.textFaint} style={{ flex: 1 }}>
          La réservation se fait directement avec le coach, par téléphone. Tu trouves ici son numéro et son club.
        </Txt>
      </View>

      <View style={{ marginTop: spacing.xs }}>
        <SegmentedControl options={TABS} value={tab} onChange={setTab} />
      </View>

      {list.map((c) => (
        <CoachRow key={c.id} coach={c} />
      ))}

      {clubCoaches.length > 0 ? (
        <View style={{ marginTop: spacing.xl }}>
          <SectionHeader title="Coachs ajoutés par les clubs" />
          {clubCoaches.map((c) => (
            <Card key={c.id} style={{ marginBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <IconCircle icon="person" color={colors.signature} bg={colors.signatureSoft} size={40} />
                <View style={{ flex: 1 }}>
                  <Txt variant="h3" style={{ fontSize: 15 }}>
                    {c.name}
                  </Txt>
                  <Txt variant="muted">
                    {c.specialty} · {c.clubName}
                  </Txt>
                </View>
                <Tag label="Club" tone="blue" />
              </View>
              {c.phone ? <ContactButtons phone={c.phone} style={{ marginTop: spacing.md }} /> : null}
            </Card>
          ))}
        </View>
      ) : null}

    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
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
