import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ClubCard } from '@/components/ClubCard';
import { CompetitionCard } from '@/components/CompetitionCard';
import { Logo } from '@/components/Logo';
import { Reveal } from '@/components/Reveal';
import { Screen } from '@/components/Screen';
import { Button, Card, IconCircle, SectionHeader, Txt } from '@/components/ui';
import { activeClubs } from '@/data/clubs';
import { seedCompetitions } from '@/data/competitions';
import { dayKey } from '@/lib/days';
import { initials } from '@/lib/format';
import { isBirthdayToday, parseBirthDate, zodiacFor } from '@/lib/zodiac';
import { useApp } from '@/store/AppContext';
import { colors, gradients, radius, spacing } from '@/theme';

type Action = { icon: keyof typeof Ionicons.glyphMap; label: string; route: string; tint: string; bg: string };

const ACTIONS: Action[] = [
  { icon: 'calendar', label: 'Mes réservations', route: '/reservations', tint: colors.green, bg: colors.greenSoft },
  { icon: 'trophy', label: 'Tournois', route: '/competitions', tint: colors.purple, bg: colors.purpleSoft },
  { icon: 'school', label: 'Trouver un coach', route: '/coachs', tint: colors.blue, bg: colors.blueSoft },
  { icon: 'book', label: 'Découvrir le padel', route: '/decouvrir', tint: colors.coral, bg: colors.coralSoft },
];

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
  // L'accueil est le hub : tout s'ouvre par-dessus, le retour ramène toujours ici.
  const go = (route: string) => router.push(route as never);

  // Clubs sponsorisés en tête (badge visible), le reste en ordre alphabétique.
  const nearbyClubs = activeClubs(state.customClubs).sort(
    (a, b) => Number(state.boostedClubIds.includes(b.id)) - Number(state.boostedClubIds.includes(a.id))
  );
  const now = Date.now();
  const today = dayKey(new Date());
  // « À venir » : les tournois déjà passés ne s'affichent plus sur l'accueil.
  const competitions = [...state.myCompetitions, ...seedCompetitions].filter((c) => c.dateKey >= today).slice(0, 2);
  const upcoming = [...state.reservations]
    .filter((r) => r.startsAt > now)
    .sort((a, b) => a.startsAt - b.startsAt)[0];

  // Clin d'œil anniversaire (ADN de l'app : astro + fun).
  const bd = state.account?.birthDate ? parseBirthDate(state.account.birthDate) : null;
  const birthday = isBirthdayToday(state.account?.birthDate);

  // Résultats de tournoi disponibles ? (un tournoi où tu étais inscrit a été clôturé récemment)
  const pendingComps = Object.keys(state.compRegistrations).filter((id) => {
    const r = state.compResults[id];
    return !!r && now - r.closedAt < 7 * 86400000;
  }).length;

  return (
    <Screen>
      <Reveal>
        {/* Hero */}
        <LinearGradient colors={gradients.heroSoft} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }} style={styles.hero}>
          <View style={styles.brandRow}>
            <Logo size={30} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <View style={styles.cityChip}>
                <Ionicons name="location-outline" size={13} color={colors.textMuted} />
                <Txt variant="small" color={colors.textMuted}>
                  Abidjan
                </Txt>
              </View>
              {/* Avatar → raccourci vers le Profil (point rouge si un résultat t'attend) */}
              <Pressable onPress={() => go('/profil')} hitSlop={6}>
                <View style={styles.avatarBtn}>
                  {state.account?.photoUri ? (
                    <Image source={{ uri: state.account.photoUri }} style={styles.avatarImg} contentFit="cover" />
                  ) : (
                    <Txt variant="small" color={colors.gold} style={{ fontWeight: '800' }}>
                      {initials(`${state.account?.firstName ?? ''} ${state.account?.lastName ?? ''}`)}
                    </Txt>
                  )}
                </View>
              </Pressable>
            </View>
          </View>
          <Txt variant="display" style={{ marginTop: spacing.md }}>
            Bonjour, {state.account?.firstName ?? ''}
          </Txt>
          <Txt variant="muted" style={{ marginTop: 4 }}>
            Un terrain libre près de toi — sessions de 1h30.
          </Txt>
          <View style={{ marginTop: spacing.lg }}>
            <Button label="Réserver un terrain" icon="calendar" onPress={() => go('/reserver')} full />
          </View>
        </LinearGradient>

        {/* Mon profil — accès direct, bien visible */}
        <Card onPress={() => go('/profil')} style={styles.profileCard}>
          <View style={styles.profileAvatar}>
            {state.account?.photoUri ? (
              <Image source={{ uri: state.account.photoUri }} style={styles.avatarImg} contentFit="cover" />
            ) : (
              <Txt variant="h3" color={colors.gold}>
                {initials(`${state.account?.firstName ?? ''} ${state.account?.lastName ?? ''}`)}
              </Txt>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Txt variant="h3">
              {state.account?.firstName} {state.account?.lastName}
            </Txt>
            <Txt variant="small" color={colors.textMuted}>
              Niveau {state.level.toFixed(2)} · mon profil, mes réservations, mes stats
            </Txt>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Card>

        {/* Joyeux anniversaire — petit clin d'œil le jour J (ADN astro de l'app) */}
        {birthday && bd ? (
          <View style={[styles.alert, { backgroundColor: colors.purpleSoft }]}>
            <Txt variant="h2">{zodiacFor(bd).emoji}</Txt>
            <Txt variant="small" color={colors.text} style={{ flex: 1, fontWeight: '600' }}>
              Joyeux anniversaire {state.account?.firstName} ! Un·e {zodiacFor(bd).name} en forme, ça se fête sur un terrain.
            </Txt>
          </View>
        ) : null}

        {/* Rappel de match — touche la carte pour voir tes réservations */}
        {upcoming && state.remindersOn ? (
          <Pressable onPress={() => go('/reservations')} style={({ pressed }) => pressed && { opacity: 0.9 }}>
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
                <Txt variant="small" color="rgba(255,255,255,0.85)" style={{ fontWeight: '600' }}>
                  {upcoming.clubConfirmed ? '✓ Confirmée par le club' : 'En attente de confirmation'}
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

        {/* Résultats de tournoi disponibles */}
        {pendingComps > 0 ? (
          <Pressable onPress={() => go('/competitions')} style={[styles.alert, { backgroundColor: colors.purpleSoft }]}>
            <Ionicons name="medal-outline" size={16} color={colors.purple} />
            <Txt variant="small" color={colors.text} style={{ flex: 1, fontWeight: '600' }}>
              Résultats du tournoi disponibles
            </Txt>
            <Ionicons name="chevron-forward" size={15} color={colors.purple} />
          </Pressable>
        ) : null}

        {/* Accès rapide */}
        <View style={[styles.grid, { marginTop: spacing.lg }]}>
          {ACTIONS.map((a) => (
            <Card key={a.label} onPress={() => go(a.route)} style={[styles.tile, { backgroundColor: a.bg, borderColor: 'transparent' }]}>
              <IconCircle icon={a.icon} color={a.tint} bg={colors.white} />
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
  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  profileAvatar: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    backgroundColor: colors.goldSoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
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
