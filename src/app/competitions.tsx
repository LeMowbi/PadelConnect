import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { CompetitionCard } from '@/components/CompetitionCard';
import { Screen } from '@/components/Screen';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Button, EmptyState, SectionHeader } from '@/components/ui';
import { isTournamentPublic, seedCompetitions } from '@/data/competitions';
import { dayKey } from '@/lib/days';
import { usePullToRefresh } from '@/lib/usePullToRefresh';
import { useApp } from '@/store/AppContext';
import { spacing } from '@/theme';

const TABS = ['Tous', 'Par les clubs', 'Par les joueurs'] as const;

export default function CompetitionsScreen() {
  const router = useRouter();
  const { state } = useApp();
  const { refreshControl } = usePullToRefresh();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Tous');

  const list = [...state.myCompetitions, ...seedCompetitions]
    // Un tournoi « en attente » n'est visible que par son créateur (sinon masqué jusqu'à validation du club).
    .filter((c) => isTournamentPublic(c) || c.createdByMe)
    .filter((c) => {
      if (tab === 'Par les clubs') return c.organizerType === 'club';
      if (tab === 'Par les joueurs') return c.organizerType === 'joueur';
      return true;
    });
  // À venir d'abord ; les tournois passés restent accessibles (déclaration du résultat).
  const today = dayKey(new Date());
  const upcoming = list.filter((c) => c.dateKey >= today);
  const past = list.filter((c) => c.dateKey < today);

  return (
    <Screen back title="Tournois" subtitle="Défis avec récompenses — par les clubs ou les joueurs" refreshControl={refreshControl}>
      <View style={{ marginTop: spacing.sm }}>
        <Button label="Créer un tournoi" icon="add" onPress={() => router.push('/competition/nouvelle')} full />
      </View>

      <SegmentedControl options={TABS} value={tab} onChange={setTab} />

      {upcoming.length === 0 ? (
        <EmptyState icon="trophy-outline" title="Aucun tournoi à venir" text="Lance ton propre tournoi ou défi entre amis." />
      ) : (
        upcoming.map((c) => <CompetitionCard key={c.id} comp={c} />)
      )}

      {past.length > 0 ? (
        <View style={{ marginTop: spacing.xl }}>
          <SectionHeader title="Terminés" />
          {past.map((c) => (
            <CompetitionCard key={c.id} comp={c} />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}
