import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { RatingStars } from '@/components/RatingStars';
import { Screen } from '@/components/Screen';
import { Button, Card, Divider, EmptyState, Tag, Txt } from '@/components/ui';
import { getClub } from '@/data/clubs';
import { coachClubName, getCoach } from '@/data/coaches';
import { callNumber, openWhatsApp } from '@/lib/contact';
import { fcfa, initials } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';

export default function CoachDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const coach = getCoach(id);

  if (!coach) {
    return (
      <Screen back>
        <EmptyState icon="alert-circle-outline" title="Coach introuvable" />
      </Screen>
    );
  }

  const club = getClub(coach.clubId);

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
            <Txt variant="muted">{coach.level}</Txt>
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
        <Divider style={{ marginVertical: spacing.md }} />
        <Info icon="business-outline" label="Club" value={coachClubName(coach)} />
        <Info icon="call-outline" label="Téléphone" value={coach.phone} />
        <Info icon="cash-outline" label="Tarif indicatif" value={`${fcfa(coach.pricePerHour)} / heure`} />
      </Card>

      <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button label="Appeler" icon="call" onPress={() => callNumber(coach.phone)} full />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="WhatsApp" icon="logo-whatsapp" variant="secondary" onPress={() => openWhatsApp(coach.phone)} full />
          </View>
        </View>
        {club ? (
          <Button label={`Voir ${club.name}`} icon="location-outline" variant="secondary" onPress={() => router.push(`/club/${club.id}`)} full />
        ) : null}
      </View>

      <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.md, textAlign: 'center' }}>
        La réservation d'un cours se fait directement avec le coach (appel / WhatsApp).
      </Txt>
    </Screen>
  );
}

function Info({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.info}>
      <Ionicons name={icon} size={18} color={colors.textMuted} />
      <Txt variant="muted" style={{ width: 110 }}>
        {label}
      </Txt>
      <Txt variant="body" style={{ flex: 1, fontWeight: '600' }}>
        {value}
      </Txt>
    </View>
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
  info: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
});
