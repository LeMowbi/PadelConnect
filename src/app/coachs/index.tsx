import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Avatar } from '@/components/Avatar';
import { ContactButtons } from '@/components/ContactButtons';
import { Screen } from '@/components/Screen';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Card, Divider, IconCircle, SectionHeader, Tag, Txt } from '@/components/ui';
import { findClub } from '@/data/clubs';
import { coachClubName, coaches, type Coach } from '@/data/coaches';
import { useApp } from '@/store/AppContext';
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
        <Avatar name={coach.name} size={60} />
        <View style={{ flex: 1 }}>
          <Txt variant="h3" numberOfLines={1}>
            {coach.name}
          </Txt>
          <View style={styles.metaRow}>
            <Ionicons name="business-outline" size={13} color={colors.textMuted} />
            <Txt variant="small" color={colors.textMuted} numberOfLines={1} style={{ flex: 1 }}>
              {coachClubName(coach)} · {coach.area}
            </Txt>
          </View>
          <View style={{ marginTop: spacing.sm }}>
            <Tag label={`Niveau ${coach.levelValue.toFixed(1)}`} tone="blue" icon="ribbon" />
          </View>
        </View>
      </View>

      <Divider style={{ marginVertical: spacing.md }} />

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
        <IconCircle icon="information-circle" color={colors.blue} bg={colors.blueSoft} size={34} />
        <Txt variant="small" color={colors.textMuted} style={{ flex: 1 }}>
          La réservation se fait directement avec le coach, par téléphone. Tu trouves ici son numéro et son club.
        </Txt>
      </View>

      <SegmentedControl options={TABS} value={tab} onChange={setTab} />

      {list.map((c) => (
        <CoachRow key={c.id} coach={c} />
      ))}

      {clubCoaches.length > 0 ? (
        <View style={{ marginTop: spacing.xl }}>
          <SectionHeader title="Coachs ajoutés par les clubs" />
          {clubCoaches.map((c) => (
            <Card key={c.id} style={{ marginBottom: spacing.sm }}>
              <View style={styles.row}>
                <IconCircle icon="person" color={colors.blue} bg={colors.blueSoft} size={44} />
                <View style={{ flex: 1 }}>
                  <Txt variant="h3" numberOfLines={1}>
                    {c.name}
                  </Txt>
                  <View style={styles.metaRow}>
                    <Ionicons name="business-outline" size={13} color={colors.textMuted} />
                    <Txt variant="small" color={colors.textMuted} numberOfLines={1} style={{ flex: 1 }}>
                      {c.specialty} · {c.clubName}
                    </Txt>
                  </View>
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
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  specs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
