import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Chip } from '@/components/Chip';
import { MatchCard } from '@/components/MatchCard';
import { Screen } from '@/components/Screen';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Button, Card, EmptyState, IconCircle, Txt } from '@/components/ui';
import { seedMatches } from '@/data/matches';
import { useApp } from '@/store/AppContext';
import { spacing } from '@/theme';

const TABS = ['Tous', 'Publics', 'Amis'] as const;
const LOOKS = ['Tous', 'Partenaire', 'Adversaires'] as const;

export default function MatchsScreen() {
  const router = useRouter();
  const { state } = useApp();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Tous');
  const [look, setLook] = useState<(typeof LOOKS)[number]>('Tous');
  const [myLevel, setMyLevel] = useState(false);

  const list = [...state.myMatches, ...seedMatches].filter((m) => {
    if (m.startsAt <= Date.now()) return false; // matchs passés masqués
    if (tab === 'Publics' && m.visibility !== 'public') return false;
    if (tab === 'Amis' && m.visibility !== 'amis') return false;
    if (look === 'Partenaire' && !(m.looking === 'partenaire' || m.looking === 'les deux')) return false;
    if (look === 'Adversaires' && !(m.looking === 'adversaire' || m.looking === 'les deux')) return false;
    if (myLevel && Math.abs(m.levelValue - state.level) > 1) return false;
    return true;
  });

  return (
    <Screen title="Jouer" subtitle="Trouve des joueurs pour ton match">
      {/* Carte d'accroche + création */}
      <Card style={{ marginTop: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <IconCircle icon="tennisball" />
          <View style={{ flex: 1 }}>
            <Txt variant="h3">Groupe incomplet ou seul ?</Txt>
            <Txt variant="muted">Crée un match : réserve le terrain et ouvre des places pour des partenaires ou des adversaires.</Txt>
          </View>
        </View>
        <View style={{ marginTop: spacing.md }}>
          <Button label="Créer un match" icon="add" onPress={() => router.push('/match/nouveau')} full />
        </View>
      </Card>

      <SegmentedControl options={TABS} value={tab} onChange={setTab} />

      <View style={styles_row}>
        {LOOKS.map((l) => (
          <Chip key={l} label={l} active={l === look} onPress={() => setLook(l)} />
        ))}
        <Chip label={`Mon niveau`} icon="podium-outline" active={myLevel} onPress={() => setMyLevel((v) => !v)} />
      </View>

      {list.length === 0 ? (
        <EmptyState icon="tennisball-outline" title="Aucun match" text="Aucun match ne correspond à ces filtres. Crée le tien !" />
      ) : (
        list.map((m) => <MatchCard key={m.id} match={m} />)
      )}
    </Screen>
  );
}

const styles_row = {
  flexDirection: 'row' as const,
  flexWrap: 'wrap' as const,
  gap: spacing.sm,
  marginBottom: spacing.lg,
};
