import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Avatar } from '@/components/Avatar';
import { ClubCard } from '@/components/ClubCard';
import { CompetitionCard } from '@/components/CompetitionCard';
import { Logo } from '@/components/Logo';
import { Reveal } from '@/components/Reveal';
import { Screen } from '@/components/Screen';
import { Card, SectionHeader, Txt } from '@/components/ui';
import { activeClubs, findClub } from '@/data/clubs';
import { isTournamentPublic, seedCompetitions } from '@/data/competitions';
import { dayKey } from '@/lib/days';
import { initials, perPlayer } from '@/lib/format';
import { openWhatsApp } from '@/lib/contact';
import { isBirthdayToday, parseBirthDate, zodiacFor } from '@/lib/zodiac';
import { isPlayed, useApp } from '@/store/AppContext';
import { colors, gradients, radius, shadows, spacing } from '@/theme';

// Accès rapide — 4 univers (Réserver / Tournois / Amis / Mes matchs).
// D1 : Coachs retiré du hub (consultés sur chaque fiche club + lien « Voir tous les coachs »)
// pour garder la priorité visuelle sur « Réserver ». Grille 4 items équilibrée, pas de tabbar.
type Action = { icon: keyof typeof Ionicons.glyphMap; label: string; route: string; tint: string; bg: string };
const ACTIONS: Action[] = [
  { icon: 'calendar', label: 'Réserver', route: '/reserver', tint: colors.signature, bg: colors.signatureSoft },
  { icon: 'trophy', label: 'Tournois', route: '/competitions', tint: colors.purple, bg: colors.purpleSoft },
  { icon: 'people', label: 'Amis', route: '/amis', tint: colors.coral, bg: colors.coralSoft },
  { icon: 'list', label: 'Mes matchs', route: '/reservations', tint: colors.green, bg: colors.greenSoft },
];

const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const AVATAR_TONES = [colors.signature, colors.blue, colors.purple, colors.coral];

// ─── Compte à rebours doux ────────────────────────────────────────────────────
// B-R2 : libellé « dans X jours / demain / aujourd'hui » pour la carte prochain match.
function countdownLabel(startsAt: number): string {
  const now = Date.now();
  const diffMs = startsAt - now;
  if (diffMs <= 0) return 'maintenant';
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "aujourd'hui";
  if (diffDays === 1) return 'demain';
  return `dans ${diffDays} jour${diffDays > 1 ? 's' : ''}`;
}

export default function HomeScreen() {
  const router = useRouter();
  const { state, dismissNews, stats } = useApp();
  const go = (route: string) => router.push(route as never);

  const fullName = `${state.account?.firstName ?? ''} ${state.account?.lastName ?? ''}`.trim();
  const greeting = new Date().getHours() < 18 ? 'Bonjour' : 'Bonsoir';

  // Clubs sponsorisés en tête (badge visible), le reste en ordre alphabétique.
  const nearbyClubs = activeClubs(state.customClubs, state.clubInfo).sort(
    (a, b) => Number(state.boostedClubIds.includes(b.id)) - Number(state.boostedClubIds.includes(a.id)),
  );
  const now = Date.now();
  const today = dayKey(new Date());
  const competitions = [...state.myCompetitions, ...seedCompetitions]
    .filter((c) => isTournamentPublic(c) && c.dateKey >= today)
    .slice(0, 2);
  const upcoming = [...state.reservations].filter((r) => r.startsAt > now).sort((a, b) => a.startsAt - b.startsAt)[0];

  // A-L1 : dernier club joué/réservé (la réservation passée la plus récente).
  // N'apparaît QUE s'il n'y a AUCUNE réservation à venir.
  const lastPlayed = !upcoming
    ? ([...state.reservations].filter((r) => isPlayed(r, now)).sort((a, b) => b.startsAt - a.startsAt)[0] ?? null)
    : null;
  const lastPlayedClub = lastPlayed ? findClub(lastPlayed.clubId, state.customClubs, state.clubInfo) : null;

  // B-R5 : tournoi inscrit à venir (≤ 7 jours).
  const upcomingTournament =
    Object.keys(state.compRegistrations)
      .map((id) => [...state.myCompetitions, ...seedCompetitions].find((c) => c.id === id))
      .filter((c): c is NonNullable<typeof c> => {
        if (!c) return false;
        if (c.dateKey < today) return false;
        const [y, m, d] = c.dateKey.split('-').map(Number);
        const compTs = new Date(y, m - 1, d).getTime();
        return compTs - now <= 7 * 86400000;
      })
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey))[0] ?? null;

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

  // ── Nudge unique (priorité décroissante) ─────────────────────────────────
  // Règle : un seul nudge affiché à la fois ; mutuellement exclusifs par priorité.
  //   a) 0 partie jouée → carte « Nouveau au padel ? » (C-S2)
  //   b) profil incomplet → bandeau « Complète ton profil » (B-R4)
  //   c) trophée proche → « Plus qu'X partie(s)… » (B-R1)
  // La carte contextuelle (prochain match / rejouer) et la carte tournoi (B-R5) sont séparées du nudge.

  // B-R4 : profil incomplet si birthDate / photo / genre manquent.
  const profileIncomplete =
    !state.account?.birthDate || !state.account?.photoUri || !state.account?.gender || state.account.gender === 'nd';

  // B-R4 : bandeau fermable (état local, pas persisté).
  const [profileNudgeDismissed, setProfileNudgeDismissed] = useState(false);
  const showProfileNudge = profileIncomplete && !profileNudgeDismissed;

  // Champ manquant le plus visible pour le libellé personnalisé.
  const missingField = !state.account?.birthDate ? 'date de naissance' : !state.account?.photoUri ? 'photo de profil' : 'genre';

  // B-R1 : trophée le plus proche du palier (excluant Vainqueur de tournoi et Niveau 4+).
  // Trophées éligibles, ordonnés par proximité (1 ou 2 unités du palier).
  type NudgeTrophy = { label: string; current: number; target: number; cta: 'reserve' | 'invite' };
  const trophyNudge: NudgeTrophy | null = (() => {
    const played = stats.played;
    const friendsCount = state.friends.length;
    const tournamentsPlayed = stats.tournamentsPlayed;

    const candidates: NudgeTrophy[] = [
      { label: 'Première partie', current: played, target: 1, cta: 'reserve' },
      { label: '5 parties', current: played, target: 5, cta: 'reserve' },
      { label: '20 parties', current: played, target: 20, cta: 'reserve' },
      { label: 'Premier tournoi', current: tournamentsPlayed, target: 1, cta: 'reserve' },
      { label: '5 amis', current: friendsCount, target: 5, cta: 'invite' },
    ];

    // Garder ceux où il manque exactement 1 ou 2 unités et qui ne sont pas encore atteints.
    const close = candidates.filter((t) => {
      const remaining = t.target - t.current;
      return remaining === 1 || remaining === 2;
    });

    if (close.length === 0) return null;
    // Le plus proche du palier (remaining le plus petit, à égalité on prend le premier).
    return close.sort((a, b) => a.target - a.current - (b.target - b.current))[0];
  })();

  // C-S2 : 0 partie jouée = débutant → nudge prioritaire.
  const isNovice = stats.played === 0;
  const [noviceNudgeDismissed, setNoviceNudgeDismissed] = useState(false);
  // D2 : nudge parrainage (croissance) — le plus bas en priorité, seulement si 0 ami,
  // fermable, et SANS aucune récompense chiffrée (simple partage WhatsApp).
  const [referralNudgeDismissed, setReferralNudgeDismissed] = useState(false);

  // Décision du nudge unique affiché :
  let activeNudge: 'novice' | 'profile' | 'trophy' | 'referral' | null = null;
  if (isNovice && !noviceNudgeDismissed) activeNudge = 'novice';
  else if (showProfileNudge) activeNudge = 'profile';
  else if (trophyNudge) activeNudge = 'trophy';
  else if (state.friends.length === 0 && !referralNudgeDismissed) activeNudge = 'referral';

  // B-R2 : notifier les partenaires depuis la carte prochain match.
  const notifyPartners = () => {
    if (!upcoming) return;
    const who = upcoming.invited.length ? `\nÉquipe : ${upcoming.invited.map((i) => i.name).join(', ')}` : '';
    const share = upcoming.price ? `\nPrévois ${perPlayer(upcoming.price)} chacun.` : '';
    openWhatsApp(
      '',
      `On joue au padel ! 🎾\n${upcoming.clubName} — ${upcoming.date} à ${upcoming.time} (session 1h30)\n${upcoming.court}${who}${share}\nRéservé via PadelConnect.`,
    );
  };

  // B-R2 : équipe incomplète si toi + moins de 3 invités.
  const teamIncomplete = upcoming ? upcoming.invited.length < 3 : false;

  return (
    <Screen>
      <Reveal>
        {/* En-tête : salutation + avatar (→ profil) */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Txt variant="label" color={colors.textFaint}>
              {greeting}
            </Txt>
            <Txt variant="h1" numberOfLines={1} style={{ marginTop: 2 }}>
              {fullName || 'Bienvenue'}
            </Txt>
          </View>
          <View style={styles.cityChip}>
            <Ionicons name="location-outline" size={13} color={colors.textMuted} />
            <Txt variant="small" color={colors.textMuted}>
              Abidjan
            </Txt>
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
              <Txt variant="body" style={{ fontWeight: '700' }} numberOfLines={2}>
                {news.title}
              </Txt>
              {news.subtitle ? (
                <Txt variant="small" color={colors.textMuted} numberOfLines={2}>
                  {news.subtitle}
                </Txt>
              ) : null}
              {news.link ? (
                <Txt variant="small" color={colors.purple} style={{ fontWeight: '600', marginTop: 2 }}>
                  En savoir plus →
                </Txt>
              ) : null}
            </Pressable>
            <Pressable onPress={() => dismissNews(news.id)} hitSlop={8} style={styles.newsClose}>
              <Ionicons name="close" size={16} color={colors.textMuted} />
            </Pressable>
          </View>
        ) : null}

        {/* HERO — CTA principal unique */}
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

        {/* Accès rapide — 4 univers (D1 : Coachs retiré, accessible par fiche club) */}
        <View style={styles.quickRow}>
          {ACTIONS.map((a) => (
            <Pressable key={a.label} onPress={() => go(a.route)} style={styles.quickItem}>
              <View style={[styles.quickIcon, { backgroundColor: a.bg }]}>
                <Ionicons name={a.icon} size={22} color={a.tint} />
              </View>
              <Txt variant="small" style={{ fontWeight: '600', textAlign: 'center' }}>
                {a.label}
              </Txt>
            </Pressable>
          ))}
        </View>

        {/* ── Nudge unique (a / b / c — mutuellement exclusifs) ─────────── */}

        {/* a) C-S2 : carte « Nouveau au padel ? » (0 partie jouée) */}
        {activeNudge === 'novice' ? (
          <Pressable onPress={() => go('/decouvrir')} style={[styles.nudge, { backgroundColor: colors.coralSoft }]}>
            <View style={[styles.nudgeIcon, { backgroundColor: colors.coral }]}>
              <Ionicons name="help-circle" size={20} color={colors.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="body" style={{ fontWeight: '700' }}>
                Nouveau au padel ?
              </Txt>
              <Txt variant="small" color={colors.textMuted}>
                Découvrir les règles en 2 minutes →
              </Txt>
            </View>
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                setNoviceNudgeDismissed(true);
              }}
              hitSlop={8}
              style={styles.nudgeClose}
            >
              <Ionicons name="close" size={15} color={colors.textMuted} />
            </Pressable>
          </Pressable>
        ) : null}

        {/* b) B-R4 : bandeau « Complète ton profil » */}
        {activeNudge === 'profile' ? (
          <Pressable onPress={() => go('/profil')} style={[styles.nudge, { backgroundColor: colors.amberSoft }]}>
            <View style={[styles.nudgeIcon, { backgroundColor: colors.amber }]}>
              <Ionicons name="person-circle" size={20} color={colors.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="body" style={{ fontWeight: '700' }}>
                Complète ton profil
              </Txt>
              <Txt variant="small" color={colors.textMuted}>
                Ajoute ta {missingField} pour ton signe astro →
              </Txt>
            </View>
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                setProfileNudgeDismissed(true);
              }}
              hitSlop={8}
              style={styles.nudgeClose}
            >
              <Ionicons name="close" size={15} color={colors.textMuted} />
            </Pressable>
          </Pressable>
        ) : null}

        {/* c) B-R1 : trophée proche */}
        {activeNudge === 'trophy' && trophyNudge ? (
          <Pressable
            onPress={() => go(trophyNudge.cta === 'reserve' ? '/reserver' : '/amis')}
            style={[styles.nudge, { backgroundColor: colors.amberSoft }]}
          >
            <View style={[styles.nudgeIcon, { backgroundColor: colors.amber }]}>
              <Ionicons name="trophy" size={20} color={colors.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="body" style={{ fontWeight: '700' }}>
                Plus que {trophyNudge.target - trophyNudge.current} {trophyNudge.cta === 'invite' ? 'ami(s)' : 'partie(s)'} pour le trophée
              </Txt>
              <View style={styles.trophyGaugeTrack}>
                <View
                  style={[
                    styles.trophyGaugeFill,
                    { width: `${Math.round((trophyNudge.current / trophyNudge.target) * 100)}%` as `${number}%` },
                  ]}
                />
              </View>
              <Txt variant="small" color={colors.textMuted}>
                « {trophyNudge.label} » · {trophyNudge.current}/{trophyNudge.target}
              </Txt>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.amber} />
          </Pressable>
        ) : null}

        {/* d) D2 : invitation au parrainage (si 0 ami) — sobre, fermable, sans récompense */}
        {activeNudge === 'referral' ? (
          <Pressable onPress={() => go('/parrainage')} style={[styles.nudge, { backgroundColor: colors.signatureSoft }]}>
            <View style={[styles.nudgeIcon, { backgroundColor: colors.signature }]}>
              <Ionicons name="share-social" size={20} color={colors.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="body" style={{ fontWeight: '700' }}>
                Tu connais des padelistes ?
              </Txt>
              <Txt variant="small" color={colors.textMuted}>
                Invite-les sur PadelConnect — on joue mieux à plusieurs →
              </Txt>
            </View>
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                setReferralNudgeDismissed(true);
              }}
              hitSlop={8}
              style={styles.nudgeClose}
            >
              <Ionicons name="close" size={15} color={colors.textMuted} />
            </Pressable>
          </Pressable>
        ) : null}

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
            <Txt variant="small" color={colors.text} style={{ flex: 1, fontWeight: '600' }}>
              Résultats du tournoi disponibles
            </Txt>
            <Ionicons name="chevron-forward" size={15} color={colors.purple} />
          </Pressable>
        ) : null}

        {/* ── Carte contextuelle « continuer » ──────────────────────────────
            Prochain match (B-R2) si à venir, sinon Rejouer dernier club (A-L1).
            Ces deux cartes sont SÉPARÉES du nudge unique. */}

        {/* B-R2 : Ton prochain match — enrichi (compte à rebours + inviter + prévenir) */}
        {upcoming ? (
          <View style={styles.section}>
            <SectionHeader title="Ton prochain match" />
            <Card>
              <View style={styles.matchHead}>
                <View style={styles.dateChip}>
                  <Txt variant="h2" color={colors.onSignature} style={{ fontSize: 18, lineHeight: 20 }}>
                    {dd}
                  </Txt>
                  <Txt variant="small" color={colors.onPhoto} style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.5 }}>
                    {(MONTHS_SHORT[Number(mm) - 1] ?? '').toUpperCase()}
                  </Txt>
                </View>
                <View style={{ flex: 1 }}>
                  <Txt variant="h3" style={{ fontSize: 15 }} numberOfLines={1}>
                    {upcoming.clubName}
                  </Txt>
                  <Txt variant="muted">
                    {upcoming.time} · {upcoming.court} · 1h30
                  </Txt>
                  {/* Compte à rebours doux */}
                  <View style={styles.countdownRow}>
                    <Ionicons name="time-outline" size={13} color={colors.signature} />
                    <Txt variant="small" color={colors.signature} style={{ fontWeight: '700' }}>
                      {countdownLabel(upcoming.startsAt)}
                    </Txt>
                  </View>
                </View>
                <View style={[styles.statusPill, { backgroundColor: upcoming.clubConfirmed ? colors.greenSoft : colors.amberSoft }]}>
                  <Txt
                    variant="small"
                    color={upcoming.clubConfirmed ? colors.green : colors.amber}
                    style={{ fontWeight: '700', fontSize: 11 }}
                  >
                    {upcoming.clubConfirmed ? 'Confirmé' : 'En attente'}
                  </Txt>
                </View>
              </View>
              <View style={{ height: 1, backgroundColor: colors.hairline, marginVertical: spacing.md }} />
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row' }}>
                  {matchPlayers.map((n, i) => (
                    <View
                      key={`${n}-${i}`}
                      style={[styles.miniAvatar, { backgroundColor: AVATAR_TONES[i % AVATAR_TONES.length], marginLeft: i === 0 ? 0 : -9 }]}
                    >
                      <Txt variant="small" color={colors.white} style={{ fontWeight: '700', fontSize: 11 }}>
                        {initials(n)}
                      </Txt>
                    </View>
                  ))}
                  <Txt variant="small" color={colors.textMuted} style={{ marginLeft: spacing.sm, alignSelf: 'center' }}>
                    {upcoming.players} joueur{upcoming.players > 1 ? 's' : ''}
                  </Txt>
                </View>
                <View style={{ flex: 1 }} />
                <Pressable onPress={() => go('/reservations')} hitSlop={6}>
                  <Txt variant="small" color={colors.signature} style={{ fontWeight: '700' }}>
                    Voir
                  </Txt>
                </Pressable>
              </View>
              {/* B-R2 : équipe incomplète → actions contextuelles */}
              {teamIncomplete ? (
                <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
                  <View style={[styles.incompleteHint, { backgroundColor: colors.signatureSoft }]}>
                    <Ionicons name="people-outline" size={14} color={colors.signature} />
                    <Txt variant="small" color={colors.signature} style={{ flex: 1 }}>
                      Équipe incomplète ({matchPlayers.length}/4)
                    </Txt>
                  </View>
                  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <Pressable onPress={() => go('/amis')} style={[styles.matchAction, { backgroundColor: colors.signatureSoft }]}>
                      <Ionicons name="person-add-outline" size={14} color={colors.signature} />
                      <Txt variant="small" color={colors.signature} style={{ fontWeight: '700' }}>
                        Inviter un ami
                      </Txt>
                    </Pressable>
                    <Pressable onPress={notifyPartners} style={[styles.matchAction, { backgroundColor: colors.greenSoft }]}>
                      <Ionicons name="logo-whatsapp" size={14} color={colors.green} />
                      <Txt variant="small" color={colors.green} style={{ fontWeight: '700' }}>
                        Prévenir mes partenaires
                      </Txt>
                    </Pressable>
                  </View>
                </View>
              ) : (
                /* Équipe complète : on peut quand même prévenir */
                <View style={{ marginTop: spacing.md }}>
                  <Pressable onPress={notifyPartners} style={[styles.matchAction, { backgroundColor: colors.greenSoft }]}>
                    <Ionicons name="logo-whatsapp" size={14} color={colors.green} />
                    <Txt variant="small" color={colors.green} style={{ fontWeight: '700' }}>
                      Prévenir mes partenaires
                    </Txt>
                  </Pressable>
                </View>
              )}
            </Card>
          </View>
        ) : lastPlayedClub ? (
          /* A-L1 : Rejouer au dernier club (seulement si 0 réservation à venir) */
          <View style={styles.section}>
            <Card onPress={() => go(`/reserver/${lastPlayedClub.id}`)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <View style={[styles.replayIcon, { backgroundColor: colors.signatureSoft }]}>
                  <Ionicons name="refresh" size={22} color={colors.signature} />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt variant="h3">Rejouer à {lastPlayedClub.name} ?</Txt>
                  <Txt variant="muted">Réserver un créneau →</Txt>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.signature} />
              </View>
            </Card>
          </View>
        ) : null}

        {/* B-R5 : carte tournoi à venir (≤ 7 jours) — séparée du nudge */}
        {upcomingTournament ? (
          <View style={styles.section}>
            <Card onPress={() => go(`/competition/${upcomingTournament.id}`)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <View style={[styles.replayIcon, { backgroundColor: colors.purpleSoft }]}>
                  <Ionicons name="trophy-outline" size={22} color={colors.purple} />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt variant="h3" numberOfLines={1}>
                    Ton tournoi à {upcomingTournament.clubName ?? upcomingTournament.organizer}
                  </Txt>
                  <Txt variant="muted">
                    {(() => {
                      const [y, m, d] = upcomingTournament.dateKey.split('-').map(Number);
                      const compTs = new Date(y, m - 1, d).getTime();
                      const diffDays = Math.ceil((compTs - now) / 86400000);
                      if (diffDays <= 0) return "aujourd'hui !";
                      if (diffDays === 1) return 'demain !';
                      return `dans ${diffDays} jour${diffDays > 1 ? 's' : ''}`;
                    })()}
                  </Txt>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.purple} />
              </View>
            </Card>
          </View>
        ) : null}

        {/* Clubs près de vous (C-S4 : carrousel en lecture seule, lien « Tout voir » discret en SectionHeader) */}
        <View style={styles.section}>
          <SectionHeader title="Clubs près de toi" actionLabel="Explorer" onAction={() => go('/clubs')} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.md, paddingRight: spacing.lg }}
          >
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
  liveDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.lime, borderWidth: 4, borderColor: colors.limeGlow },
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
  // 4 univers en ligne, équilibrés
  quickRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xl },
  quickItem: { alignItems: 'center', gap: spacing.sm, width: '22%' },
  quickIcon: { width: 54, height: 54, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  newsBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.purpleSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  newsClose: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: { marginTop: spacing.xl },
  matchHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dateChip: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.signature,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPill: { paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: radius.pill },
  miniAvatar: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  incompleteHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  matchAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  nudge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  nudgeIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nudgeClose: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trophyGaugeTrack: {
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    overflow: 'hidden',
    marginVertical: spacing.xs,
  },
  trophyGaugeFill: {
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.amber,
  },
  replayIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
