import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ClubCard } from '@/components/ClubCard';
import { CompetitionCard } from '@/components/CompetitionCard';
import { Logo } from '@/components/Logo';
import { MatchCard } from '@/components/MatchCard';
import { Reveal } from '@/components/Reveal';
import { Screen } from '@/components/Screen';
import { Card, IconCircle, SectionHeader, Txt } from '@/components/ui';
import { clubsByName } from '@/data/clubs';
import { seedCompetitions } from '@/data/competitions';
import { seedMatches } from '@/data/matches';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing } from '@/theme';

type Action = { icon: keyof typeof Ionicons.glyphMap; label: string; route: string; tint: string; bg: string };

const ACTIONS: Action[] = [
  { icon: 'calendar', label: 'Réserver un terrain', route: '/terrains', tint: colors.gold, bg: colors.goldSoft },
  { icon: 'tennisball', label: 'Trouver un match', route: '/matchs', tint: colors.green, bg: colors.greenSoft },
  { icon: 'school', label: 'Trouver un coach', route: '/coachs', tint: colors.gold, bg: colors.goldSoft },
  { icon: 'book', label: 'Découvrir le padel', route: '/decouvrir', tint: colors.green, bg: colors.greenSoft },
];

export default function HomeScreen() {
  const router = useRouter();
  const { state } = useApp();

  const nearbyClubs = clubsByName;
  const matches = [...state.myMatches, ...seedMatches]
    .filter((m) => m.visibility === 'public' || m.visibility === 'amis')
    .slice(0, 3);
  const competitions = [...state.myCompetitions, ...seedCompetitions].slice(0, 2);
  const nextReservation = state.reservations[0];

  return (
    <Screen>
      <Reveal>
      {/* Hero */}
      <LinearGradient colors={['#1B1812', colors.bg]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.hero}>
        <View style={styles.brandRow}>
          <Logo size={30} />
          <View style={styles.cityChip}>
            <Ionicons name="location-outline" size={13} color={colors.textMuted} />
            <Txt variant="small" color={colors.textMuted}>
              Abidjan
            </Txt>
          </View>
        </View>
        <Txt variant="display" style={{ marginTop: spacing.sm }}>
          Bonjour, {state.account?.firstName ?? ''}
        </Txt>
        <Txt variant="muted" style={{ marginTop: 4 }}>
          Réserve un terrain, trouve un partenaire ou un coach — partout à Abidjan.
        </Txt>
      </LinearGradient>

      {/* Actions rapides */}
      <View style={styles.grid}>
        {ACTIONS.map((a) => (
          <Card key={a.label} onPress={() => router.push(a.route as never)} style={styles.tile}>
            <IconCircle icon={a.icon} color={a.tint} bg={a.bg} />
            <Txt variant="h3" style={{ marginTop: spacing.sm }} numberOfLines={2}>
              {a.label}
            </Txt>
          </Card>
        ))}
      </View>

      {/* Prochaine réservation */}
      {nextReservation ? (
        <Card style={styles.resa}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <IconCircle icon="calendar" color={colors.green} bg={colors.greenSoft} />
            <View style={{ flex: 1 }}>
              <Txt variant="label" color={colors.textFaint}>
                Prochaine réservation
              </Txt>
              <Txt variant="h3" style={{ marginTop: 2 }}>
                {nextReservation.clubName}
              </Txt>
              <Txt variant="muted">
                {nextReservation.date} · {nextReservation.time} · {nextReservation.players} joueurs
              </Txt>
            </View>
          </View>
        </Card>
      ) : null}

      {/* Terrains */}
      <View style={styles.section}>
        <SectionHeader title="Terrains près de toi" actionLabel="Voir tout" onAction={() => router.push('/terrains')} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md, paddingRight: spacing.lg }}>
          {nearbyClubs.map((c) => (
            <ClubCard key={c.id} club={c} compact />
          ))}
        </ScrollView>
      </View>

      {/* Matchs ouverts */}
      <View style={styles.section}>
        <SectionHeader title="Matchs ouverts" actionLabel="Voir tout" onAction={() => router.push('/matchs')} />
        {matches.map((m) => (
          <MatchCard key={m.id} match={m} />
        ))}
      </View>

      {/* Compétitions */}
      <View style={styles.section}>
        <SectionHeader title="Compétitions à venir" actionLabel="Voir tout" onAction={() => router.push('/competitions')} />
        {competitions.map((c) => (
          <CompetitionCard key={c.id} comp={c} />
        ))}
      </View>

      {/* Note d'égalité (pas de classement) */}
      <View style={styles.note}>
        <Ionicons name="heart-outline" size={15} color={colors.textFaint} />
        <Txt variant="small" color={colors.textFaint} style={{ flex: 1 }}>
          Tous les clubs sont présentés à égalité, sans classement ni hiérarchie.
        </Txt>
      </View>
      </Reveal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: { width: '47%', flexGrow: 1, minHeight: 110, justifyContent: 'space-between' },
  resa: { marginTop: spacing.lg },
  section: { marginTop: spacing.xl },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xs,
  },
});
