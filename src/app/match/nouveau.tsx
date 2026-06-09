import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { LevelStepper } from '@/components/LevelStepper';
import { Screen } from '@/components/Screen';
import { Button, Card, Txt, type IconName } from '@/components/ui';
import { clubsByName } from '@/data/clubs';
import { MATCH_TYPES, levelLabel, type Visibility } from '@/data/matches';
import { useApp } from '@/store/AppContext';
import { colors, spacing } from '@/theme';

const DATES = ["Aujourd'hui", 'Demain', 'Samedi', 'Dimanche'];
const TIMES = ['08:00', '10:00', '17:00', '18:00', '19:00', '20:00'];

export default function NouveauMatch() {
  const router = useRouter();
  const { state, addMatch } = useApp();

  const [clubId, setClubId] = useState<string | null>(null);
  const [type, setType] = useState<(typeof MATCH_TYPES)[number]>('Cherche partenaire');
  const [levelValue, setLevelValue] = useState(state.level);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<Visibility>(state.defaultVisibility);

  const ready = !!clubId && !!date && !!time;

  const create = () => {
    if (!clubId || !date || !time) return;
    const club = clubsByName.find((c) => c.id === clubId)!;
    addMatch({
      clubId: club.id,
      clubName: club.name,
      date,
      time,
      levelValue,
      type,
      spotsLeft: 1,
      visibility,
      host: state.account?.firstName ?? 'Joueur',
    });
    router.replace('/matchs');
  };

  return (
    <Screen back title="Créer un match">
      <Label text="Type de recherche" />
      <View style={styles.wrap}>
        {MATCH_TYPES.map((t) => (
          <Chip key={t} label={t} active={t === type} onPress={() => setType(t)} />
        ))}
      </View>

      <Label text="Terrain" />
      <View style={styles.wrap}>
        {clubsByName.map((c) => (
          <Chip key={c.id} label={c.name} active={c.id === clubId} onPress={() => setClubId(c.id)} />
        ))}
      </View>

      <Label text="Niveau du match" />
      <View style={{ alignItems: 'center', marginTop: spacing.sm }}>
        <LevelStepper value={levelValue} onChange={setLevelValue} />
        <Txt variant="small" color={colors.textMuted} style={{ marginTop: spacing.sm }}>
          {levelLabel(levelValue)}
        </Txt>
      </View>

      <Label text="Date" />
      <View style={styles.wrap}>
        {DATES.map((d) => (
          <Chip key={d} label={d} active={d === date} onPress={() => setDate(d)} />
        ))}
      </View>

      <Label text="Heure" />
      <View style={styles.wrap}>
        {TIMES.map((t) => (
          <Chip key={t} label={t} active={t === time} onPress={() => setTime(t)} />
        ))}
      </View>

      <Label text="Qui peut voir ce match ?" />
      <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
        <VisibilityOption active={visibility === 'public'} onPress={() => setVisibility('public')} icon="earth" title="Public" desc="Visible par tous les joueurs de PadelConnect." />
        <VisibilityOption active={visibility === 'amis'} onPress={() => setVisibility('amis')} icon="people" title="Amis uniquement" desc="Visible seulement par tes amis." />
      </View>

      <View style={{ marginTop: spacing.xl }}>
        <Button label="Publier le match" icon="checkmark" onPress={create} disabled={!ready} full />
      </View>
    </Screen>
  );
}

function Label({ text }: { text: string }) {
  return (
    <Txt variant="label" color={colors.textFaint} style={{ marginTop: spacing.lg }}>
      {text}
    </Txt>
  );
}

function VisibilityOption({
  active,
  onPress,
  icon,
  title,
  desc,
}: {
  active: boolean;
  onPress: () => void;
  icon: IconName;
  title: string;
  desc: string;
}) {
  return (
    <Card onPress={onPress} style={[styles.visOpt, active && styles.visActive]}>
      <Ionicons name={icon} size={22} color={active ? colors.gold : colors.textMuted} />
      <View style={{ flex: 1 }}>
        <Txt variant="h3">{title}</Txt>
        <Txt variant="muted">{desc}</Txt>
      </View>
      <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={22} color={active ? colors.gold : colors.textFaint} />
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  visOpt: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  visActive: { borderColor: colors.gold },
});
