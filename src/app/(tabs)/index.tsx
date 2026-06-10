import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ClubCard } from '@/components/ClubCard';
import { CompetitionCard } from '@/components/CompetitionCard';
import { Logo } from '@/components/Logo';
import { MatchCard } from '@/components/MatchCard';
import { Reveal } from '@/components/Reveal';
import { Screen } from '@/components/Screen';
import { Button, Card, IconCircle, SectionHeader, Txt } from '@/components/ui';
import { clubsByName } from '@/data/clubs';
import { seedCompetitions } from '@/data/competitions';
import { seedMatches, upcomingMatches } from '@/data/matches';
import { dayKey } from '@/lib/days';
import { initials } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing } from '@/theme';

type Action = { icon: keyof typeof Ionicons.glyphMap; label: string; route: string; tint: string; bg: string };

const ACTIONS: Action[] = [
  { icon: 'tennisball', label: 'Jouer un match', route: '/matchs', tint: colors.gold, bg: colors.goldSoft },
  { icon: 'trophy', label: 'Tournois', route: '/competitions', tint: colors.green, bg: colors.greenSoft },
  { icon: 'school', label: 'Trouver un coach', route: '/coachs', tint: colors.blue, bg: colors.blueSoft },
  { icon: 'book', label: 'Découvrir le padel', route: '/decouvrir', tint: colors.gold, bg: colors.goldSoft },
];

const TAB_ROUTES = new Set(['/reserver', '/matchs', '/competitions']);

function countdown(ts: number): string {
  const diff = ts - Date.now();
  if (diff <= 0) return 'maintenant';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h >= 24) return `dans ${Math.round(h / 24)} j`;
  if (h >= 1) return `dans ${h} h`;
  return `dans ${m} min`;
}

export default function HomeScreen() {
  const router = useRouter();
  const { state } = useApp();
  // Onglets : on bascule l'onglet (navigate) ; écrans empilés : push (pour garder le retour).
  const go = (route: string) => (TAB_ROUTES.has(route) ? router.navigate(route as never) : router.push(route as never));

  // Clubs sponsorisés en tête (badge visible), le reste en ordre alphabétique.
  const nearbyClubs = [...clubsByName].sort(
    (a, b) => Number(state.boostedClubIds.includes(b.id)) - Number(state.boostedClubIds.includes(a.id))
  );
  const now = Date.now();
  const today = dayKey(new Date());
  const matches = upcomingMatches([...state.myMatches, ...seedMatches], now).slice(0, 3);
  // « À venir » : les tournois déjà passés ne s'affichent plus sur l'accueil.
  const competitions = [...state.myCompetitions, ...seedCompetitions].filter((c) => c.dateKey >= today).slice(0, 2);
  const upcoming = [...state.reservations]
    .filter((r) => !r.result && r.startsAt > now)
    .sort((a, b) => a.startsAt - b.startsAt)[0];

  return (
    <Screen>
      <Reveal>
        {/* Hero */}
        <LinearGradient colors={['#E6F1ED', colors.bg]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.hero}>
          <View style={styles.brandRow}>
            <Logo size={30} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <View style={styles.cityChip}>
                <Ionicons name="location-outline" size={13} color={colors.textMuted} />
                <Txt variant="small" color={colors.textMuted}>
                  Abidjan
                </Txt>
              </View>
              {/* Avatar → raccourci vers le Profil */}
              <Pressable onPress={() => router.navigate('/profil' as never)} style={styles.avatarBtn} hitSlop={6}>
                {state.account?.photoUri ? (
                  <Image source={{ uri: state.account.photoUri }} style={styles.avatarImg} contentFit="cover" />
                ) : (
                  <Txt variant="small" color={colors.gold} style={{ fontWeight: '800' }}>
                    {initials(`${state.account?.firstName ?? ''} ${state.account?.lastName ?? ''}`)}
                  </Txt>
                )}
              </Pressable>
            </View>
          </View>
          <Txt variant="display" style={{ marginTop: spacing.md }}>
            Bonjour, {state.account?.firstName ?? ''}
          </Txt>
          <Txt variant="muted" style={{ marginTop: 4 }}>
            Un terrain libre près de toi en quelques secondes.
          </Txt>
          <View style={{ marginTop: spacing.lg }}>
            <Button label="Réserver un terrain" icon="calendar" onPress={() => go('/reserver')} full />
          </View>
        </LinearGradient>

        {/* Rappel de match — touche la carte pour voir tes réservations */}
        {upcoming ? (
          <Pressable onPress={() => router.navigate('/profil' as never)} style={({ pressed }) => pressed && { opacity: 0.9 }}>
            <LinearGradient colors={[colors.gold, colors.goldDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.reminder}>
              <View style={styles.bell}>
                <Ionicons name="notifications" size={20} color={colors.onGold} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt variant="label" color="rgba(255,255,255,0.85)">
                  Rappel de match
                </Txt>
                <Txt variant="h3" color={colors.white} style={{ marginTop: 2 }}>
                  {upcoming.clubName}
                </Txt>
                <Txt variant="small" color="rgba(255,255,255,0.92)">
                  {upcoming.date} à {upcoming.time} · {upcoming.court}
                </Txt>
              </View>
              <View style={styles.countChip}>
                <Txt variant="small" color={colors.onGold} style={{ fontWeight: '700' }}>
                  {countdown(upcoming.startsAt)}
                </Txt>
              </View>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.8)" />
            </LinearGradient>
          </Pressable>
        ) : null}

        {/* Accès rapide */}
        <View style={[styles.grid, { marginTop: spacing.lg }]}>
          {ACTIONS.map((a) => (
            <Card key={a.label} onPress={() => go(a.route)} style={styles.tile}>
              <IconCircle icon={a.icon} color={a.tint} bg={a.bg} />
              <Txt variant="h3" style={{ marginTop: spacing.sm, fontSize: 15 }} numberOfLines={2}>
                {a.label}
              </Txt>
            </Card>
          ))}
        </View>

        {/* Terrains */}
        <View style={styles.section}>
          <SectionHeader title="Terrains près de toi" actionLabel="Voir tout" onAction={() => router.push('/clubs')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md, paddingRight: spacing.lg }}>
            {nearbyClubs.map((c) => (
              <ClubCard key={c.id} club={c} compact />
            ))}
          </ScrollView>
        </View>

        {/* Matchs ouverts */}
        <View style={styles.section}>
          <SectionHeader title="Matchs ouverts" actionLabel="Voir tout" onAction={() => go('/matchs')} />
          {matches.map((m) => (
            <MatchCard key={m.id} match={m} />
          ))}
        </View>

        {/* Tournois */}
        <View style={styles.section}>
          <SectionHeader title="Tournois à venir" actionLabel="Voir tout" onAction={() => go('/competitions')} />
          {competitions.map((c) => (
            <CompetitionCard key={c.id} comp={c} />
          ))}
        </View>
      </Reveal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  avatarBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.goldSoft,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
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
  tile: { width: '47%', flexGrow: 1, minHeight: 104, justifyContent: 'space-between' },
  reminder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
  },
  bell: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countChip: {
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  section: { marginTop: spacing.xl },
});
