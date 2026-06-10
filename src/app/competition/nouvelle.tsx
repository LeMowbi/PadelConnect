import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { Screen } from '@/components/Screen';
import { Button, Txt } from '@/components/ui';
import { clubs } from '@/data/clubs';
import { COMP_FORMATS } from '@/data/competitions';
import { nextDays, type DayOption } from '@/lib/days';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing } from '@/theme';

const LEVELS = ['Tous niveaux', 'Débutant', 'Intermédiaire', 'Avancé'];
const SLOTS = [4, 8, 16, 24];

function Field({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
}) {
  return (
    <>
      <Txt variant="label" color={colors.textFaint} style={{ marginTop: spacing.lg }}>
        {label}
      </Txt>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        style={styles.input}
      />
    </>
  );
}

export default function NouvelleCompetition() {
  const router = useRouter();
  const params = useLocalSearchParams<{ as?: string; clubId?: string }>();
  const asClub = params.as === 'club';
  const club = asClub ? clubs.find((c) => c.id === params.clubId) : undefined;
  const { state, addCompetition } = useApp();

  const dates = useMemo(() => nextDays(7), []);
  const [title, setTitle] = useState('');
  const [reward, setReward] = useState('');
  const [fee, setFee] = useState('Gratuit');
  const [day, setDay] = useState<DayOption | null>(null);
  const [format, setFormat] = useState(COMP_FORMATS[2]);
  const [level, setLevel] = useState('Tous niveaux');
  const [slots, setSlots] = useState(8);

  const create = () => {
    if (title.trim().length < 2 || reward.trim().length < 2 || !day) return;
    addCompetition({
      title: title.trim(),
      organizerType: asClub ? 'club' : 'joueur',
      organizer: club?.name ?? state.account?.firstName ?? 'Joueur',
      clubId: club?.id,
      clubName: club?.name,
      date: day.label,
      dateKey: day.key,
      format,
      level,
      reward: reward.trim(),
      fee: fee.trim() || 'Gratuit',
      slots,
      registered: 0,
      official: asClub,
    });
    router.replace(asClub ? '/club-admin' : '/competitions');
  };

  const ready = title.trim().length > 1 && reward.trim().length > 1 && !!day;

  return (
    <Screen back title="Créer un tournoi" subtitle={asClub ? `Pour ${club?.name ?? 'votre club'}` : 'En tant que joueur'}>
      <Field label="Titre" value={title} onChangeText={setTitle} placeholder="Ex. Défi entre amis — Riviera" />
      <Field label="Récompense" value={reward} onChangeText={setReward} placeholder="Ex. Cagnotte 30 000 FCFA" />
      <Field label="Frais d'inscription" value={fee} onChangeText={setFee} placeholder="Gratuit / 5 000 FCFA…" />

      <Txt variant="label" color={colors.textFaint} style={{ marginTop: spacing.lg }}>
        Date
      </Txt>
      <View style={styles.wrap}>
        {dates.map((d) => (
          <Chip key={d.key} label={d.label} active={d.key === day?.key} onPress={() => setDay(d)} />
        ))}
      </View>

      <Txt variant="label" color={colors.textFaint} style={{ marginTop: spacing.lg }}>
        Format
      </Txt>
      <View style={styles.wrap}>
        {COMP_FORMATS.map((f) => (
          <Chip key={f} label={f} active={f === format} onPress={() => setFormat(f)} />
        ))}
      </View>

      <Txt variant="label" color={colors.textFaint} style={{ marginTop: spacing.lg }}>
        Niveau
      </Txt>
      <View style={styles.wrap}>
        {LEVELS.map((l) => (
          <Chip key={l} label={l} active={l === level} onPress={() => setLevel(l)} />
        ))}
      </View>

      <Txt variant="label" color={colors.textFaint} style={{ marginTop: spacing.lg }}>
        Nombre d'équipes (places limitées)
      </Txt>
      <View style={styles.wrap}>
        {SLOTS.map((s) => (
          <Chip key={s} label={`${s} équipes`} active={s === slots} onPress={() => setSlots(s)} />
        ))}
      </View>
      <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
        Chaque équipe compte 2 joueurs. L'inscription se ferme une fois toutes les places prises.
      </Txt>

      <View style={{ marginTop: spacing.xl }}>
        <Button label="Publier le tournoi" icon="trophy" onPress={create} disabled={!ready} full />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    padding: spacing.md,
    marginTop: spacing.sm,
    fontSize: 15,
  },
});
