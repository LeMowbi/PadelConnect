import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { RatingStars } from '@/components/RatingStars';
import { Screen } from '@/components/Screen';
import { Button, Card, Divider, EmptyState, Tag, Txt } from '@/components/ui';
import { getCoach } from '@/data/coaches';
import { fcfa, initials } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';

const DATES = ["Aujourd'hui", 'Demain', 'Samedi', 'Dimanche'];
const TIMES = ['08:00', '10:00', '17:00', '18:00', '19:00'];

export default function CoachDetail() {
  const { id } = useLocalSearchParams();
  const coach = getCoach(id);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [booked, setBooked] = useState(false);

  if (!coach) {
    return (
      <Screen back>
        <EmptyState icon="alert-circle-outline" title="Coach introuvable" />
      </Screen>
    );
  }

  return (
    <Screen back title="Coach">
      <Card>
        <View style={styles.head}>
          <View style={[styles.avatar, { backgroundColor: coach.accent + '22', borderColor: coach.accent + '55' }]}>
            <Txt variant="display" color={coach.accent}>
              {initials(coach.name)}
            </Txt>
          </View>
          <View style={{ flex: 1 }}>
            <Txt variant="h2">{coach.name}</Txt>
            <Txt variant="muted">
              {coach.level} · {coach.area}
            </Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <RatingStars value={coach.rating} size={14} />
              <Txt variant="small" color={colors.textMuted}>
                {coach.rating.toFixed(1)}
              </Txt>
            </View>
          </View>
        </View>
        <Divider style={{ marginVertical: spacing.md }} />
        <Txt variant="body">{coach.bio}</Txt>
        <View style={styles.specs}>
          <Tag label={`Niveau ${coach.levelValue.toFixed(1)}`} tone="gold" />
          {coach.specialties.map((s) => (
            <Tag key={s} label={s} tone="neutral" />
          ))}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md }}>
          <Txt variant="muted">Tarif indicatif</Txt>
          <Txt variant="price">{fcfa(coach.pricePerHour)} / heure</Txt>
        </View>
      </Card>

      {booked ? (
        <Card style={{ alignItems: 'center', paddingVertical: spacing.xl, marginTop: spacing.lg }}>
          <Ionicons name="checkmark-circle" size={48} color={colors.green} />
          <Txt variant="h3" style={{ marginTop: spacing.sm }}>
            Demande envoyée
          </Txt>
          <Txt variant="muted" style={{ textAlign: 'center', marginTop: 4 }}>
            {date} · {time} (démo)
          </Txt>
          <Button label="Choisir un autre créneau" variant="ghost" onPress={() => setBooked(false)} />
        </Card>
      ) : (
        <>
          <Txt variant="label" color={colors.textFaint} style={{ marginTop: spacing.xl }}>
            Choisis une date
          </Txt>
          <View style={styles.wrap}>
            {DATES.map((d) => (
              <Chip key={d} label={d} active={d === date} onPress={() => setDate(d)} size="lg" />
            ))}
          </View>
          <Txt variant="label" color={colors.textFaint} style={{ marginTop: spacing.lg }}>
            Choisis une heure
          </Txt>
          <View style={styles.wrap}>
            {TIMES.map((t) => (
              <Chip key={t} label={t} active={t === time} onPress={() => setTime(t)} size="lg" />
            ))}
          </View>
          <View style={{ marginTop: spacing.xl }}>
            <Button label="Réserver la séance" icon="calendar" onPress={() => setBooked(true)} disabled={!date || !time} full />
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  specs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
});
