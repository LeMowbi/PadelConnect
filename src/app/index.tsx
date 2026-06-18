import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Avatar } from '@/components/Avatar';
import { ClubCard } from '@/components/ClubCard';
import { CompetitionCard } from '@/components/CompetitionCard';
import { Logo } from '@/components/Logo';
import { Reveal } from '@/components/Reveal';
import { Screen } from '@/components/Screen';
import { Card, SectionHeader, Txt } from '@/components/ui';
import { activeClubs } from '@/data/clubs';
import { seedCompetitions } from '@/data/competitions';
import { dayKey } from '@/lib/days';
import { initials } from '@/lib/format';
import { isBirthdayToday, parseBirthDate, zodiacFor } from '@/lib/zodiac';
import { useApp } from '@/store/AppContext';
import { colors, gradients, radius, shadows, spacing } from '@/theme';

// Accès rapide — 4 univers, un accent chacun (maquette Accueil).
type Action = { icon: keyof typeof Ionicons.glyphMap; label: string; route: string; tint: string; bg: string };
const ACTIONS: Action[] = [
  { icon: 'calendar', label: 'Réserver', route: '/reserver', tint: colors.signature, bg: colors.signatureSoft },
  { icon: 'trophy', label: 'Tournois', route: '/competitions', tint: colors.purple, bg: colors.purpleSoft },
  { icon: 'school', label: 'Coachs', route: '/coachs', tint: colors.blue, bg: colors.blueSoft },
  { icon: 'people', label: 'Amis', route: '/amis', tint: colors.coral, bg: colors.coralSoft },
];

const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const AVATAR_TONES = [colors.signature, colors.blue, colors.purple, colors.coral];

export default function HomeScreen() {
  const router = useRouter();
  const { state, dismissNews } = useApp();
  // L'accueil est le hub : tout s'ouvre par-dessus, le retour ramène toujours ici.
  const go = (route: string) => router.push(route as never);

  const fullName = `${state.account?.firstName ?? ''} ${state.account?.lastName ?? ''}`.trim();
  const greeting = new Date().getHours() < 18 ? 'Bonjour' : 'Bonsoir';

  // Clubs sponsorisés en tête (badge visible), le reste en ordre alphabétique.
  const nearbyClubs = activeClubs(state.customClubs, state.clubInfo).sort(
    (a, b) => Number(state.boostedClubIds.includes(b.id)) - Number(state.boostedClubIds.includes(a.id))
  );
  const now = Date.now();
  const today = dayKey(new Date());
  const competitions = [...state.myCompetitions, ...seedCompetitions].filter((c) => c.dateKey >= today).slice(0, 2);
  const upcoming = [...state.reservations].filter((r) => r.startsAt > now).sort((a, b) => a.startsAt - b.startsAt)[0];

  // Clin d'œil anniversaire (ADN de l'app : astro + fun).
  const bd = state.account?.birthDate ? parseBirthDate(state.account.birthDate) : null;
  const birthday = isBirthdayToday(state.account?.birthDate);

  // Résultats de tournoi disponibles ? Le plus récent (closedAt max), clôturé < 7 j.
  const pendingResult = Object.keys(state.compRegistrations)
    .map((id) => ({ id, res: state.compResults[id] }))
    .filter((x) => !!x.res && now - x.res.closedAt < 7 * 86400000)
    .sort((a, b) => b.res!.closedAt - a.res!.closedAt)[0];

  // Actu d'accueil (opérateur) — masquée si le joueur l'a fermée (réapparaît si nouvelle).
  const news = state.operatorNews;
  const showNews = !!news && state.dismissedNewsId !== news.id;

  // Équipe du prochain match (toi + invités) pour la pile d'avatars.
  const matchPlayers = upcoming ? [fullName || 'Toi', ...upcoming.invited.map((i) => i.name)].slice(0, 4) : [];
  const [, mm, dd] = upcoming ? upcoming.dateKey.split('-') : ['', '', ''];

  return (
    <Screen>
      <Reveal>
        {/* En-tête : salutation + avatar (→ profil) */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Txt variant="label" color={colors.textFaint}>{greeting}</Txt>
            <Txt variant="h1" numberOfLines={1} style={{ marginTop: 2 }}>{fullName || 'Bienvenue'}</Txt>
          </View>
          <View style={styles.cityChip}>
            <Ionicons name="location-outline" size={13} color={colors.textMuted} />
            <Txt variant="small" color={colors.textMuted}>Abidjan</Txt>
          </View>
          <Pressable onPress={() => go('/profil')} hitSlop={6}>
            <Avatar uri={state.account?.photoUri} name={fullName} size={46} />
          </Pressable>
        </View>

        {/* Actu opérateur — fermable */}
        {showNews && news ? (
          <View style={styles.newsBanner}>
            <Ionicons name="megaphone" size={18} color={colors.purple} />
            <Pressable style={{ flex: 1 }} disabled={!news.link} onPress={() => news.link && Linking.openURL(news.link)}>
              <Txt variant="body" style={{ fontWeight: '700' }} numberOfLines={2}>{news.title}</Txt>
              {news.subtitle ? <Txt variant="small" color={colors.textMuted} numberOfLines={2}>{news.subtitle}</Txt> : null}
              {news.link ? <Txt variant="small" color={colors.purple} style={{ fontWeight: '600', marginTop: 2 }}>En savoir plus →</Txt> : null}
            </Pressable>
            <Pressable onPress={() => dismissNews(news.id)} hitSlop={8} style={styles.newsClose}>
              <Ionicons name="close" size={16} color={colors.textMuted} />
            </Pressable>
          </View>
        ) : null}

        {/* HERO */}
        <Pressable onPress={() => go('/reserver')}>
          <LinearGradient colors={gradients.heroSoft} start={{ x: 0, y: 0 }} end={{ x: 0.7, y: 1 }} style={styles.hero}>
            <View style={styles.brandRow}>
              <Logo size={26} />
            </View>
            <View style={styles.livePill}>
              <View style={styles.liveDot} />
              <Txt variant="small" color={colors.signatureDark} style={styles.liveText}>
                {nearbyClubs.length} clubs près de toi
              </Txt>
            </View>
            <Txt variant="display" style={{ fontSize: 26, marginTop: spacing.sm, maxWidth: 240 }}>
              Réserve ton prochain match
            </Txt>
            <View style={styles.heroCta}>
              <Txt variant="body" color={colors.onSignature} style={{ fontWeight: '700' }}>
                Trouver un créneau
              </Txt>
              <Ionicons name="arrow-forward" size={16} color={colors.onSignature} />
            </View>
          </LinearGradient>
        </Pressable>

        {/* Accès rapide — 4 univers */}
        <View style={styles.quickRow}>
          {ACTIONS.map((a) => (
            <Pressable key={a.label} onPress={() => go(a.route)} style={styles.quickItem}>
              <View style={[styles.quickIcon, { backgroundColor: a.bg }]}>
                <Ionicons name={a.icon} size={24} color={a.tint} />
              </View>
              <Txt variant="small" style={{ fontWeight: '600' }}>{a.label}</Txt>
            </Pressable>
          ))}
        </View>

        {/* Anniversaire */}
        {birthday && bd ? (
          <View style={[styles.alert, { backgroundColor: colors.purpleSoft }]}>
            <Txt variant="h2">{zodiacFor(bd).emoji}</Txt>
            <Txt variant="small" color={colors.text} style={{ flex: 1, fontWeight: '600' }}>
              Joyeux anniversaire {state.account?.firstName} ! Un·e {zodiacFor(bd).name} en forme, ça se fête sur un terrain.
            </Txt>
          </View>
        ) : null}

        {/* Résultats de tournoi disponibles */}
        {pendingResult ? (
          <Pressable onPress={() => go(`/competition/${pendingResult.id}`)} style={[styles.alert, { backgroundColor: colors.purpleSoft }]}>
            <Ionicons name="medal-outline" size={16} color={colors.purple} />
            <Txt variant="small" color={colors.text} style={{ flex: 1, fontWeight: '600' }}>Résultats du tournoi disponibles</Txt>
            <Ionicons name="chevron-forward" size={15} color={colors.purple} />
          </Pressable>
        ) : null}

        {/* Prochain match */}
        {upcoming && state.remindersOn ? (
          <View style={styles.section}>
            <SectionHeader title="Ton prochain match" />
            <Card onPress={() => go('/reservations')}>
              <View style={styles.matchHead}>
                <View style={styles.dateChip}>
                  <Txt variant="h2" color={colors.onSignature} style={{ fontSize: 18, lineHeight: 20 }}>{dd}</Txt>
                  <Txt variant="small" color="rgba(255,255,255,0.85)" style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.5 }}>
                    {(MONTHS_SHORT[Number(mm) - 1] ?? '').toUpperCase()}
                  </Txt>
                </View>
                <View style={{ flex: 1 }}>
                  <Txt variant="h3" style={{ fontSize: 15 }} numberOfLines={1}>{upcoming.clubName}</Txt>
                  <Txt variant="muted">{upcoming.time} · {upcoming.court} · 1h30</Txt>
                </View>
                <View style={[styles.statusPill, { backgroundColor: upcoming.clubConfirmed ? colors.greenSoft : colors.amberSoft }]}>
                  <Txt variant="small" color={upcoming.clubConfirmed ? colors.green : colors.amber} style={{ fontWeight: '700', fontSize: 11 }}>
                    {upcoming.clubConfirmed ? 'Confirmé' : 'En attente'}
                  </Txt>
                </View>
              </View>
              <View style={{ height: 1, backgroundColor: colors.hairline, marginVertical: spacing.md }} />
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row' }}>
                  {matchPlayers.map((n, i) => (
                    <View key={`${n}-${i}`} style={[styles.miniAvatar, { backgroundColor: AVATAR_TONES[i % AVATAR_TONES.length], marginLeft: i === 0 ? 0 : -9 }]}>
                      <Txt variant="small" color={colors.white} style={{ fontWeight: '700', fontSize: 11 }}>{initials(n)}</Txt>
                    </View>
                  ))}
                  <Txt variant="small" color={colors.textMuted} style={{ marginLeft: spacing.sm, alignSelf: 'center' }}>
                    {upcoming.players} joueur{upcoming.players > 1 ? 's' : ''}
                  </Txt>
                </View>
                <View style={{ flex: 1 }} />
                <Txt variant="small" color={colors.signature} style={{ fontWeight: '700' }}>Voir</Txt>
              </View>
            </Card>
          </View>
        ) : null}

        {/* Clubs près de vous */}
        <View style={styles.section}>
          <SectionHeader title="Clubs près de toi" actionLabel="Tout voir" onAction={() => go('/clubs')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md, paddingRight: spacing.lg }}>
            {nearbyClubs.map((c) => (
              <ClubCard key={c.id} club={c} compact />
            ))}
          </ScrollView>
        </View>

        {/* Tournois */}
        <View style={styles.section}>
          <SectionHeader title="Tournois à venir" actionLabel="Tout voir" onAction={() => go('/competitions')} />
          {competitions.map((c) => (
            <CompetitionCard key={c.id} comp={c} />
          ))}
        </View>
      </Reveal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm, marginBottom: spacing.md },
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
  hero: {
    ...shadows.e2,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: spacing.md },
  liveDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.lime, borderWidth: 4, borderColor: 'rgba(198,242,74,0.35)' },
  liveText: { fontWeight: '700', fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase' },
  heroCta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.lg,
    backgroundColor: colors.signature,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    ...shadows.e2,
  },
  quickRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xl },
  quickItem: { alignItems: 'center', gap: spacing.sm, width: '23%' },
  quickIcon: { width: 56, height: 56, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  alert: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  newsBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.purpleSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  newsClose: { width: 26, height: 26, borderRadius: radius.pill, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  section: { marginTop: spacing.xl },
  matchHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dateChip: { width: 46, height: 46, borderRadius: radius.md, backgroundColor: colors.signature, alignItems: 'center', justifyContent: 'center' },
  statusPill: { paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: radius.pill },
  miniAvatar: { width: 30, height: 30, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' },
});
