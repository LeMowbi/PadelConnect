import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import { Avatar } from '@/components/Avatar';
import { deviceLabel, useMatchAlerts, usePushPermission } from '@/components/BienvenuePrefs';
import { BottomSheet } from '@/components/BottomSheet';
import { Chip } from '@/components/Chip';
import { PopIn } from '@/components/PopIn';
import { Reveal } from '@/components/Reveal';
import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { Button, Card, Divider, IconCircle, SectionHeader, StatTile, Tag, Txt, type IconName } from '@/components/ui';
import { isPlayed, useApp } from '@/store/AppContext';
import { findClub } from '@/data/clubs';
import { canAccessOperator, canSeeClubSpace } from '@/lib/access';
import { FRIENDS_GOAL } from '@/lib/badges';
import { fcfa, levelLabel, levelText } from '@/lib/format';
import { hapticSuccess } from '@/lib/haptics';
import { LOYALTY_CYCLE, loyaltyProgress } from '@/lib/loyalty';
import { PHONE_INCOMPLETE, isValidPhone } from '@/lib/phone';
import { pickImage } from '@/lib/pickImage';
import { claimLoyalty, fetchMyLoyaltyClaims, type MyLoyaltyClaim } from '@/lib/social';
import { usePullToRefresh } from '@/lib/usePullToRefresh';
import { GENDERS, ageFrom, genderLabel, maskBirthDate, parseBirthDate, zodiacFor, type Gender } from '@/lib/zodiac';
import { colors, gradients, radius, spacing } from '@/theme';

// « Noter PadelConnect » (E3) : lien DIRECT vers l'écriture d'un avis sur la fiche App Store
// (aucun module natif). iOS seulement : sur Android et le web, la fiche Apple n'a pas de sens.
const APP_STORE_REVIEW_URL = 'https://apps.apple.com/app/id6785261310?action=write-review';

// Âge minimal des CGU — même règle qu’à l’inscription (onboarding) : une date saisie sous ce seuil est refusée.
const MIN_AGE = 13;

// Un trophée évolue par paliers : chaque seuil franchi monte d’un rang.
type Trophy = { label: string; icon: IconName; value: number; steps: number[] };
const TIER_NAMES = ['Bronze', 'Argent', 'Or', 'Platine'];

// Rang atteint (0 = pas encore débloqué) + prochain seuil à viser + seuil du palier COURANT
// (`floor`) pour que la barre se remplisse sur le segment [palier courant → prochain], pas [0 → prochain].
function trophyTier(t: Trophy): { tier: number; name: string | null; next: number | null; floor: number } {
  let tier = 0;
  for (const s of t.steps) if (t.value >= s) tier++;
  const name = tier > 0 ? TIER_NAMES[Math.min(tier - 1, TIER_NAMES.length - 1)] : null;
  const next = tier < t.steps.length ? t.steps[tier] : null;
  const floor = tier > 0 ? t.steps[tier - 1] : 0;
  return { tier, name, next, floor };
}

export default function ProfilScreen() {
  const router = useRouter();
  const { state, stats, setRemindersOn, signOut, updateAccount, deleteAccount, updateEmail } = useApp();
  const toast = useToast();
  const { refreshControl } = usePullToRefresh();
  const { account, level, friends, officialResults } = state;
  // Les comptes créés par TÉLÉPHONE ont un e-mail technique « …@phone.padelconnect.app » : on
  // le traite comme « aucun e-mail » pour proposer d’en ajouter un vrai.
  const realEmail = account?.email && !account.email.endsWith('@phone.padelconnect.app') ? account.email : undefined;

  const [editing, setEditing] = useState(false);
  const [photoSheet, setPhotoSheet] = useState(false);
  const [deleteSheet, setDeleteSheet] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [signOutSheet, setSignOutSheet] = useState(false);
  // Ajout / changement d’e-mail (confirmation par lien).
  const [emailSheet, setEmailSheet] = useState(false);
  const [emailDraft, setEmailDraft] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const submitEmail = async () => {
    if (emailBusy) return;
    setEmailBusy(true);
    setEmailMsg(null);
    const res = await updateEmail(emailDraft);
    setEmailBusy(false);
    if (res.ok) setEmailMsg(`Lien de confirmation envoyé à ${emailDraft.trim().toLowerCase()}. Ouvre-le pour valider.`);
    else setEmailMsg(res.error ?? 'Impossible — réessaie.');
  };

  // Alerte « un match à ton niveau vient d’ouvrir » (81) : préférence SERVEUR, donc réservée aux
  // comptes connectés — tri-état et écriture honnête partagés avec l’écran Bienvenue (E1).
  const connected = !!state.serverUserId;
  const alerts = useMatchAlerts();
  // Permission push RÉELLE de l’appareil (relue au retour des Réglages) — même source que Bienvenue.
  const push = usePushPermission();

  const confirmDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    const res = await deleteAccount();
    setDeleting(false);
    if (res.ok) {
      setDeleteSheet(false); // compte = null → _layout renvoie vers l’onboarding
    } else setDeleteError(res.error ?? 'Suppression impossible — réessaie.');
  };

  if (!account) return null;

  // Visibilité des espaces pro = RÔLE vérifié côté serveur (helpers centralisés dans lib/access).
  // Un joueur normal ne voit NI l’opérateur NI l’Espace Club. (Plus de geste secret ni de code
  // PIN : c’est le compte lui-même, validé par le serveur, qui fait foi.)
  const showOperator = canAccessOperator(state.role);
  const showClub = canSeeClubSpace(state.role);
  // Compte CLUB inscrit mais PAS ENCORE validé par l’opérateur (Chantier 1) : on affiche
  // « en cours de validation » à la place de l’Espace Club, tant que le rôle n’est pas 'club'.
  const showClubPending = state.accountType === 'club' && !showClub;
  // Espace Coach : visible dès qu’un club a déclaré ce compte comme coach (fiche serveur).
  const showCoach = !!state.coachProfile;
  // Pastille gérant : réservations à venir de SON club en attente de confirmation (un compte
  // opérateur voit trop de clubs pour qu’un total ait du sens — réservé au rôle club).
  const clubPending =
    state.role === 'club' && state.serverManagedClubId
      ? state.reservations.filter(
          // MÊME prédicat que la liste de l'Espace Club (!isPlayed) : une partie EN COURS non
          // confirmée reste à confirmer → la pastille doit la compter comme l'écran l'affiche.
          (r) => r.clubId === state.serverManagedClubId && !r.clubConfirmed && !isPlayed(r, Date.now()),
        ).length
      : 0;

  const changePhoto = async () => {
    const uri = await pickImage({ square: true });
    setPhotoSheet(false);
    if (!uri) return;
    const { photoSaved } = await updateAccount({ photoUri: uri });
    if (!photoSaved) toast.show('Photo non enregistrée — vérifie ta connexion', { icon: 'alert-circle' });
  };

  // Trophées ÉVOLUTIFs : chaque trophée monte en paliers (Bronze → Argent → Or → Platine)
  // selon une valeur RÉELLE (parties jouées auto — hors cours de coach —, tournois, victoires,
  // amis, niveau). Palier Argent des amis = FRIENDS_GOAL, le seuil du badge « Esprit d’équipe ».
  const trophies: Trophy[] = [
    { label: 'Parties jouées', icon: 'tennisball', value: stats.played, steps: [1, 5, 20, 50] },
    { label: 'Tournois joués', icon: 'flag', value: stats.tournamentsPlayed, steps: [1, 3, 10] },
    { label: 'Tournois gagnés', icon: 'trophy', value: stats.tournamentsWon, steps: [1, 3, 5] },
    { label: 'Cercle d’amis', icon: 'people', value: friends.length, steps: [1, FRIENDS_GOAL, 15] },
    { label: 'Niveau de jeu', icon: 'trending-up', value: Math.floor(level), steps: [3, 4, 5, 6] },
  ];

  // B-R6 : prochain trophée le plus proche (excluant Vainqueur de tournoi et Niveau 4+).
  type NextTrophy = { label: string; current: number; target: number };
  const nextTrophy: NextTrophy | null = (() => {
    const candidates: NextTrophy[] = [
      { label: 'Première partie', current: stats.played, target: 1 },
      { label: '5 parties', current: stats.played, target: 5 },
      { label: '20 parties', current: stats.played, target: 20 },
      { label: 'Premier tournoi', current: stats.tournamentsPlayed, target: 1 },
      { label: `${FRIENDS_GOAL} amis`, current: friends.length, target: FRIENDS_GOAL },
    ];
    const pending = candidates.filter((t) => t.current < t.target);
    if (pending.length === 0) return null;
    return pending.sort((a, b) => a.target - a.current - (b.target - b.current))[0];
  })();

  const bd = account.birthDate ? parseBirthDate(account.birthDate) : null;
  const zod = bd ? zodiacFor(bd) : null;
  // « Non défini » ne s’affiche pas — on ne montre le sexe que s’il est renseigné.
  const g = account.gender && account.gender !== 'nd' ? genderLabel(account.gender) : null;

  // Jauge de niveau : progression dans la tranche entière en cours (bornes basse/haute).
  const lvlLow = Math.floor(level);
  const lvlHigh = Math.min(7, lvlLow + 1);
  const lvlPct = `${Math.round(Math.max(0, Math.min(1, level - lvlLow)) * 100)}%` as `${number}%`;

  return (
    <Screen refreshControl={refreshControl}>
      {editing ? (
        <EditAccount onDone={() => setEditing(false)} />
      ) : (
        <>
          {/* Bandeau signature — avatar (anneau dégradé) + identité (maquette Profil) */}
          <LinearGradient colors={gradients.deepGreen} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.band}>
            <View style={styles.head}>
              <Pressable onPress={() => setPhotoSheet(true)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Photo de profil">
                <Avatar uri={account.photoUri} name={`${account.firstName} ${account.lastName}`} size={76} />
              </Pressable>
              <View style={{ flex: 1 }}>
                <Txt variant="h2" color={colors.white}>
                  {account.firstName} {account.lastName}
                </Txt>
                {bd && zod ? (
                  <Txt variant="small" color={colors.onPhoto} style={{ marginTop: 2, fontWeight: '600' }}>
                    {zod.emoji} {zod.name} · {ageFrom(bd)} ans{g ? ` · ${g}` : ''}
                  </Txt>
                ) : (
                  <Txt variant="small" color={colors.onPhoto} style={{ marginTop: 2 }}>
                    {g ? `${g} · ` : ''}
                    {account.phone}
                  </Txt>
                )}
              </View>
              <Pressable
                onPress={() => setEditing(true)}
                hitSlop={8}
                style={styles.editBtn}
                accessibilityRole="button"
                accessibilityLabel="Modifier le profil"
              >
                <Ionicons name="create-outline" size={18} color={colors.white} />
              </Pressable>
            </View>
          </LinearGradient>
        </>
      )}

      {/* Mon niveau — ajusté côté serveur : moteur de niveau (80, matchs validés) + tournois officiels */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Mon niveau" />
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs }}>
            <Txt variant="label">Niveau de jeu</Txt>
            <Txt variant="display" color={colors.signature} style={{ fontSize: 28 }}>
              {levelText(level, 2)}
            </Txt>
          </View>
          {/* Niveau calculé (80) : plus rien à déclarer, il suit les résultats réels. */}
          <Txt variant="small" color={colors.textFaint} style={{ marginBottom: spacing.md }}>
            Ajusté automatiquement après tes matchs validés
          </Txt>
          <View style={styles.gaugeTrack}>
            <View style={[styles.gaugeFill, { width: lvlPct }]} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
            <Txt variant="small" color={colors.textFaint}>
              {levelText(lvlLow, 1)}
            </Txt>
            <Txt variant="small" color={colors.textFaint}>
              {levelText(lvlHigh, 1)}
            </Txt>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm }}>
            <Ionicons name="swap-vertical" size={14} color={colors.textMuted} />
            <Txt variant="small" color={colors.textMuted} style={{ flex: 1 }}>
              {levelLabel(level)} · évolue avec tes matchs validés (au plus ±0,50 sur 7 jours) ; un tournoi officiel compte aussi (+0,50
              victoire / −0,25 dernière place).
            </Txt>
          </View>
          {/* B-R6 : prochain trophée le plus proche (hors Vainqueur / Niveau 4+) */}
          {nextTrophy ? (
            <>
              <Divider style={{ marginVertical: spacing.md }} />
              <View style={{ gap: spacing.xs }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Txt variant="small" color={colors.textMuted}>
                    Prochain trophée : « {nextTrophy.label} »
                  </Txt>
                  <Txt variant="small" color={colors.amberDark} style={{ fontWeight: '700' }}>
                    {nextTrophy.current}/{nextTrophy.target}
                  </Txt>
                </View>
                <View style={styles.nextTrophyTrack}>
                  <View
                    style={[
                      styles.nextTrophyFill,
                      { width: `${Math.round((nextTrophy.current / nextTrophy.target) * 100)}%` as `${number}%` },
                    ]}
                  />
                </View>
              </View>
            </>
          ) : null}
          {officialResults.length > 0 ? (
            <>
              <Divider style={{ marginVertical: spacing.md }} />
              <View style={{ gap: 6 }}>
                {officialResults.slice(0, 3).map((o) => (
                  <View key={o.id} style={styles.row}>
                    {/* « Vainqueur » amical compris (`won`) ; le delta de niveau, lui, ne suit que `result` (officiels). */}
                    <Tag
                      label={(o.won ?? o.result === 'win') ? 'Vainqueur' : o.result === 'last' ? 'Fin de tableau' : 'Participant'}
                      tone={(o.won ?? o.result === 'win') ? 'amber' : o.result === 'last' ? 'coral' : 'signature'}
                    />
                    <Txt variant="muted" style={{ flex: 1 }}>
                      {/* Tournoi serveur : delta seul (le « niveau après » serait périmé). Le serveur
                          borne le niveau à [1,7] (close_competition) → on annonce le delta « au plus »,
                          sinon un joueur déjà à 7 (ou 1) verrait un +0,50/−0,25 qui n'a pas bougé. */}
                      {o.levelAfter != null
                        ? `${o.title} → Niveau ${levelText(o.levelAfter, 2)}`
                        : `${o.title}${o.result === 'win' ? ' → +0,50 (plafond 7)' : o.result === 'last' ? ' → −0,25 (plancher 1)' : ''}`}
                    </Txt>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
              Inscris-toi à un tournoi officiel : une victoire fait gagner +0,50.
            </Txt>
          )}
        </Card>
      </View>

      {/* 3 stats, pas plus — comptées automatiquement */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Mes statistiques" />
        <View style={styles.stats}>
          <StatTile value={stats.played} label="Parties jouées" color={colors.green} bg={colors.greenSoft} />
          <StatTile value={stats.tournamentsPlayed} label="Tournois joués" color={colors.purple} bg={colors.purpleSoft} />
          <StatTile value={stats.tournamentsWon} label="Tournois gagnés" color={colors.amberDark} bg={colors.amberSoft} />
        </View>
        {/* Série en cours 🔥 : rétention douce — visible dès 2 semaines d'affilée avec ≥ 1 partie. */}
        {stats.streakWeeks >= 2 ? (
          <View style={styles.streak}>
            <Txt variant="body" style={{ fontWeight: '700' }}>
              🔥 En feu !
            </Txt>
            <Txt variant="small" color={colors.textMuted} style={{ flex: 1 }}>
              {stats.streakWeeks} semaines d’affilée avec au moins une partie — continue la série.
            </Txt>
          </View>
        ) : null}
        <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
          Les parties jouées se comptent toutes seules : une réservation passée = une partie (un cours avec un coach n’en est pas une).
        </Txt>
        {/* Détail complet : points, rang, victoires de match, activité mensuelle (Chantier 6). */}
        <Card onPress={() => router.push('/statistiques')} style={styles.statsLink}>
          <IconCircle icon="stats-chart" color={colors.signature} bg={colors.signatureSoft} size={38} />
          <View style={{ flex: 1 }}>
            <Txt variant="h3">Voir mes statistiques</Txt>
            <Txt variant="muted">Points, classement, victoires et activité.</Txt>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Card>
      </View>

      {/* Trophées évolutifs — chaque trophée monte en paliers (Bronze → Platine) */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Trophées" />
        <Card>
          {trophies.map((t, i) => {
            const { tier, name, next, floor } = trophyTier(t);
            const unlocked = tier > 0;
            // Progression DANS le palier courant : (valeur − seuil courant) / (prochain − seuil courant).
            const pct = next ? `${Math.round(((t.value - floor) / (next - floor)) * 100)}%` : '100%';
            return (
              <Reveal key={t.label} delay={i * 50}>
                <View>
                  {i > 0 ? <Divider style={{ marginVertical: spacing.md }} /> : null}
                  <View style={styles.trophyRow}>
                    <IconCircle
                      icon={t.icon}
                      color={unlocked ? colors.amber : colors.textFaint}
                      bg={unlocked ? colors.amberSoft : colors.surfaceAlt}
                      size={38}
                    />
                    <View style={{ flex: 1 }}>
                      <View style={styles.trophyHead}>
                        <Txt variant="body" style={{ fontWeight: '600', flexShrink: 1 }} numberOfLines={1}>
                          {t.label}
                        </Txt>
                        <Tag
                          label={name ?? 'À débloquer'}
                          tone={unlocked ? 'amber' : 'neutral'}
                          icon={unlocked ? 'trophy' : 'lock-closed'}
                        />
                      </View>
                      {next ? (
                        <>
                          <View style={styles.trophyTrack}>
                            <View style={[styles.trophyFill, { width: pct as `${number}%` }]} />
                          </View>
                          <Txt variant="small" color={colors.textFaint} style={{ marginTop: 4 }}>
                            {t.value}/{next} vers {TIER_NAMES[tier]}
                          </Txt>
                        </>
                      ) : (
                        <Txt variant="small" color={colors.amberDark} style={{ marginTop: 4, fontWeight: '600' }}>
                          Palier maximal atteint 🏆
                        </Txt>
                      )}
                    </View>
                  </View>
                </View>
              </Reveal>
            );
          })}
        </Card>
      </View>

      {/* Fidélité « 10 réservations jouées = −50 % » (82 → 92) — compteur SERVEUR, donc réservé
          aux comptes connectés (un compte local n’a rien à compter côté récompenses). */}
      {connected ? (
        <View style={{ marginTop: spacing.xl }}>
          <SectionHeader title="Fidélité" />
          <LoyaltyCard />
        </View>
      ) : null}

      {/* Raccourcis */}
      <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
        <Card onPress={() => router.push('/reservations')} style={styles.cta}>
          <IconCircle icon="calendar" color={colors.green} bg={colors.greenSoft} />
          <View style={{ flex: 1 }}>
            <Txt variant="h3">Mes réservations</Txt>
            <Txt variant="muted">À venir, statut du club, passées.</Txt>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Card>
        <Card onPress={() => router.push('/amis')} style={styles.cta}>
          <IconCircle icon="people" color={colors.signature} bg={colors.signatureSoft} />
          <View style={{ flex: 1 }}>
            <Txt variant="h3">Mes amis · {friends.length}</Txt>
            <Txt variant="muted">Tes partenaires de jeu.</Txt>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Card>
      </View>

      {/* Notifications */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Notifications" />
        {/* État RÉEL de la permission (E1). Refusée : seuls les Réglages peuvent la rouvrir — on le
            dit et on y emmène. Jamais demandée (compte inscrit avant l’écran Bienvenue) : la
            fenêtre système s’ouvre une fois, depuis ce bouton. Accordée / web : rien à dire. */}
        {push.status === 'blocked' || push.status === 'ask' ? (
          <Card style={[styles.cta, { marginBottom: spacing.sm }]}>
            <IconCircle icon="notifications-off-outline" color={colors.coralDark} bg={colors.coralSoft} />
            <View style={{ flex: 1, gap: spacing.sm }}>
              <View>
                <Txt variant="body" style={{ fontWeight: '600' }}>
                  {push.status === 'blocked' ? `Notifications désactivées sur ${deviceLabel}` : 'Notifications pas encore activées'}
                </Txt>
                <Txt variant="small" color={colors.textMuted}>
                  Confirmations du club, places libérées, rappels : sans elles, tu ne reçois rien.
                </Txt>
              </View>
              {push.status === 'blocked' ? (
                <Button
                  label="Ouvrir les Réglages"
                  icon="settings-outline"
                  variant="secondary"
                  size="sm"
                  onPress={() => void Linking.openSettings()}
                />
              ) : (
                <Button
                  label={push.asking ? 'Un instant…' : 'Activer les notifications'}
                  icon="notifications"
                  size="sm"
                  onPress={() => void push.ask()}
                  disabled={push.asking}
                />
              )}
            </View>
          </Card>
        ) : null}
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <IconCircle icon="notifications" color={colors.coral} bg={colors.coralSoft} />
          <View style={{ flex: 1 }}>
            <Txt variant="body" style={{ fontWeight: '600' }}>
              Rappels de match
            </Txt>
            {/* Web : aucune notification locale n’existe dans le navigateur — on ne promet rien
                (pas d’interrupteur trompeur), on dit où les rappels fonctionnent. */}
            <Txt variant="small" color={colors.textMuted}>
              {push.status === 'unsupported'
                ? 'Disponibles dans l’app mobile (iPhone et Android) : avant la fin de l’annulation gratuite, ~2 h avant le match, puis pour saisir le score.'
                : 'Avant la fin de l’annulation gratuite, ~2 h avant, puis 20 min après la fin pour saisir le score. Désactivable ici.'}
            </Txt>
          </View>
          {/* L’interrupteur montre l’état RÉEL : ON seulement si des rappels peuvent vraiment partir
              (permission accordée). Jamais demandée / pas encore lue : OFF — le basculer ouvre la
              fenêtre. Bloquée : verrouillé, la carte ci-dessus mène aux Réglages. La préférence,
              elle, est gardée. */}
          {push.status === 'unsupported' ? null : (
            <Switch
              value={state.remindersOn && push.status === 'granted'}
              onValueChange={(v) => {
                if (!v) {
                  setRemindersOn(false);
                  return;
                }
                // La permission D'ABORD (syncMatchReminders est muet : sans accord, rien ne serait posé),
                // puis la préférence — l'interrupteur ne reste ON qu'avec de vrais rappels armés. Refus
                // iOS/Android : sans ce mot, il restait ON en promettant des rappels qui ne partiront jamais.
                void push.ask().then((ok) => {
                  if (ok) setRemindersOn(true);
                  else toast.show('Autorise les notifications dans les réglages pour recevoir tes rappels.', { icon: 'alert-circle' });
                });
              }}
              disabled={push.status === 'blocked' || push.asking}
              trackColor={{ true: colors.signature, false: colors.border }}
              thumbColor={colors.white}
              accessibilityRole="switch"
              accessibilityLabel="Rappels de match"
            />
          )}
        </Card>
        {/* Alerte « un match à ton niveau vient d’ouvrir » (81) — préférence serveur : visible
            seulement une fois connecté (un compte local n’a rien à régler côté ciblage). */}
        {connected ? (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm }}>
            <IconCircle icon="flash" color={colors.purple} bg={colors.purpleSoft} />
            <View style={{ flex: 1 }}>
              <Txt variant="body" style={{ fontWeight: '600' }}>
                Matchs à mon niveau
              </Txt>
              <Txt variant="small" color={colors.textMuted}>
                Reçois une notification quand un match ouvert compatible se crée dans un club que tu suis (cœur ♥).
              </Txt>
            </View>
            {/* Réglage pas encore connu : on le dit, plutôt que de montrer un faux « désactivé ». */}
            {alerts.on === null ? (
              <Txt variant="small" color={colors.textMuted}>
                …
              </Txt>
            ) : null}
            <Switch
              value={alerts.on === true}
              onValueChange={(v) => void alerts.toggle(v)}
              disabled={alerts.on === null || alerts.busy}
              trackColor={{ true: colors.signature, false: colors.border }}
              thumbColor={colors.white}
              accessibilityRole="switch"
              accessibilityLabel="Matchs à mon niveau"
            />
          </Card>
        ) : null}
        <NewsPushCard />
      </View>

      {/* Espaces pro — affichés UNIQUEMENT selon le rôle vérifié côté serveur (state.role) :
          « club » → Espace Club, « operator » → Espace opérateur. Aucun geste secret ; la
          vraie barrière reste la Row Level Security Supabase. */}
      {showClub || showOperator || showCoach || showClubPending ? (
        <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
          {showCoach ? (
            <Card onPress={() => router.push('/coach-admin')} style={styles.cta}>
              <IconCircle icon="school" color={colors.purple} bg={colors.purpleSoft} />
              <View style={{ flex: 1 }}>
                <Txt variant="h3">Espace Coach</Txt>
                <Txt variant="muted">Demandes de cours, cours à venir, ta fiche.</Txt>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </Card>
          ) : null}
          {showClubPending ? (
            <Card style={styles.cta}>
              <IconCircle icon="hourglass-outline" color={colors.amberDark} bg={colors.amberSoft} />
              <View style={{ flex: 1 }}>
                <Txt variant="h3">Club en cours de validation</Txt>
                <Txt variant="muted">PadelConnect vérifie ton club. Ton Espace Club s’ouvrira dès l’activation.</Txt>
              </View>
              <Tag label="En attente" tone="amber" icon="time-outline" />
            </Card>
          ) : null}
          {showClub ? (
            <Card onPress={() => router.push('/club-admin')} style={styles.cta}>
              <IconCircle icon="business" />
              <View style={{ flex: 1 }}>
                <Txt variant="h3">Tu gères un club ?</Txt>
                <Txt variant="muted">Espace Club : réservations, page, créneaux, tournois.</Txt>
              </View>
              {/* Pastille : réservations à venir en attente de confirmation du gérant. */}
              {clubPending > 0 ? <Tag label={`${clubPending} à confirmer`} tone="amber" icon="hourglass-outline" /> : null}
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </Card>
          ) : null}
          {showOperator ? (
            <Card onPress={() => router.push('/operateur')} style={styles.cta}>
              <IconCircle icon="stats-chart" color={colors.green} bg={colors.greenSoft} />
              <View style={{ flex: 1 }}>
                <Txt variant="h3">Espace opérateur (PadelConnect)</Txt>
                <Txt variant="muted">Décomptes, commissions, demandes de clubs.</Txt>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </Card>
          ) : null}
        </View>
      ) : null}

      {/* Inscrire son club — ouvert à TOUT joueur (ne donne aucun accès gérant :
          la demande part à PadelConnect, qui recontacte puis active). On masque
          l’entrée aux comptes qui gèrent déjà un club (club/opérateur). */}
      {!showClub ? (
        <View style={{ marginTop: spacing.xl }}>
          <Card onPress={() => router.push('/inscrire-club')} style={styles.cta}>
            <IconCircle icon="business" color={colors.amberDark} bg={colors.amberSoft} />
            <View style={{ flex: 1 }}>
              <Txt variant="h3">Inscrire mon club</Txt>
              <Txt variant="muted">Ton club n’est pas dans la liste ? On te recontacte.</Txt>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </Card>
        </View>
      ) : null}

      {/* Parrainage + Aide */}
      <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
        <Card onPress={() => router.push('/parrainage')} style={styles.cta}>
          <IconCircle icon="gift-outline" color={colors.green} bg={colors.greenSoft} />
          <View style={{ flex: 1 }}>
            <Txt variant="h3">Parrainage</Txt>
            <Txt variant="muted">Invite tes amis et suis tes filleuls.</Txt>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Card>
        <Card onPress={() => router.push('/support')} style={styles.cta}>
          <IconCircle icon="help-buoy-outline" color={colors.purple} bg={colors.purpleSoft} />
          <View style={{ flex: 1 }}>
            <Txt variant="h3">Aide & support</Txt>
            <Txt variant="muted">Un souci ? Signale-le ou inscris ton club.</Txt>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Card>
        {Platform.OS === 'ios' ? (
          <Card
            onPress={() =>
              void Linking.openURL(APP_STORE_REVIEW_URL).catch(() =>
                toast.show('Impossible d’ouvrir l’App Store — réessaie', { icon: 'alert-circle' }),
              )
            }
            style={styles.cta}
            accessibilityLabel="Noter PadelConnect sur l’App Store"
          >
            <IconCircle icon="star" color={colors.amberDark} bg={colors.amberSoft} />
            <View style={{ flex: 1 }}>
              <Txt variant="h3">Noter PadelConnect ⭐</Txt>
              <Txt variant="muted">Ton avis aide d’autres joueurs à nous trouver.</Txt>
            </View>
            <Ionicons name="open-outline" size={20} color={colors.textMuted} />
          </Card>
        ) : null}
      </View>

      {/* Adresse e-mail du compte — ajout/changement (confirmation par lien). */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Mon compte" />
        <Card
          onPress={() => {
            setEmailDraft(realEmail ?? '');
            setEmailMsg(null);
            setEmailSheet(true);
          }}
          style={styles.cta}
        >
          <IconCircle icon="mail-outline" color={colors.purple} bg={colors.purpleSoft} />
          <View style={{ flex: 1 }}>
            <Txt variant="h3">Adresse e-mail</Txt>
            <Txt variant="muted" numberOfLines={1}>
              {realEmail ? realEmail : 'Aucune — touche pour en ajouter une'}
            </Txt>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Card>
      </View>

      <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
        <Button label="Mentions légales & CGU" icon="document-text-outline" variant="ghost" onPress={() => router.push('/legal')} />
        <Button label="Se déconnecter" icon="log-out-outline" variant="secondary" onPress={() => setSignOutSheet(true)} />
        {/* Suppression de compte — exigence App Store / Google Play (accessible depuis l’app). */}
        <Button label="Supprimer mon compte" icon="trash-outline" variant="ghost" onPress={() => setDeleteSheet(true)} />
      </View>

      {/* À propos — version de l’app (utile pour le support et les stores). */}
      <Txt variant="small" color={colors.textFaint} style={{ textAlign: 'center', marginTop: spacing.lg }}>
        PadelConnect v{Constants.expoConfig?.version ?? '1.0.0'} · Abidjan 🇨🇮{'\n'}Réserve ton terrain de padel en quelques gestes.
      </Txt>

      {/* Photo de profil : changer (recadrée + compressée) ou revenir aux initiales */}
      <BottomSheet visible={photoSheet} title="Photo de profil" onClose={() => setPhotoSheet(false)}>
        <View style={{ gap: spacing.sm }}>
          <Button label="Changer la photo" icon="image-outline" onPress={changePhoto} full />
          {account.photoUri ? (
            <Button
              label="Retirer la photo"
              icon="trash-outline"
              variant="danger"
              onPress={async () => {
                setPhotoSheet(false);
                // On ATTEND le serveur (≠ fire-and-forget) : un retrait échoué hors-ligne ne doit
                // pas faire croire à la suppression, sinon la photo réapparaît au prochain lancement.
                const { photoSaved } = await updateAccount({ photoUri: undefined });
                if (!photoSaved) toast.show('Retrait non enregistré — vérifie ta connexion', { icon: 'alert-circle' });
              }}
              full
            />
          ) : null}
          <Button label="Annuler" variant="ghost" onPress={() => setPhotoSheet(false)} full />
        </View>
      </BottomSheet>

      {/* Déconnexion : confirmation pour éviter le tap accidentel (re-saisie du mot de passe ensuite). */}
      <BottomSheet visible={signOutSheet} title="Se déconnecter ?" onClose={() => setSignOutSheet(false)}>
        <Txt variant="body" color={colors.textMuted}>
          Tu devras ressaisir ton e-mail et ton mot de passe pour te reconnecter.
        </Txt>
        <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
          <Button
            label="Se déconnecter"
            icon="log-out-outline"
            variant="danger"
            onPress={() => {
              setSignOutSheet(false);
              signOut(); // _layout renvoie automatiquement vers l’onboarding (compte = null)
            }}
            full
          />
          <Button label="Annuler" variant="ghost" onPress={() => setSignOutSheet(false)} full />
        </View>
      </BottomSheet>

      {/* Suppression définitive — irréversible : on prévient clairement avant de confirmer. Le compte
          OPÉRATEUR, lui, est refusé par le serveur (l’Espace opérateur resterait sans propriétaire) :
          on le dit d’emblée au lieu d’offrir un bouton voué à l’échec. Les matchs PASSÉS restent chez
          les partenaires, auteur anonymisé (décision porteur n° 9, R-30) : on le dit aussi. */}
      <BottomSheet
        visible={deleteSheet}
        title={showOperator ? 'Compte opérateur' : 'Supprimer mon compte ?'}
        subtitle={
          showOperator
            ? 'Le compte opérateur ne peut pas être supprimé depuis l’app : il porte l’Espace opérateur de PadelConnect. Contacte le support.'
            : 'Cette action est définitive. Ton profil et tes données seront effacés, tes réservations à venir annulées. Tes matchs passés restent seulement dans l’historique de tes partenaires (ta place y apparaît « Ancien joueur », sans ton nom). On ne peut rien récupérer.'
        }
        onClose={() => {
          if (!deleting) setDeleteSheet(false);
        }}
      >
        {showOperator ? (
          <View style={{ gap: spacing.sm }}>
            <Button
              label="Aide & support"
              icon="help-buoy-outline"
              onPress={() => {
                setDeleteSheet(false);
                router.push('/support');
              }}
              full
            />
            <Button label="Fermer" variant="ghost" onPress={() => setDeleteSheet(false)} full />
          </View>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {deleteError ? (
              <Txt variant="small" color={colors.danger}>
                {deleteError}
              </Txt>
            ) : null}
            <Button
              label={deleting ? 'Suppression…' : 'Supprimer définitivement'}
              icon="trash-outline"
              variant="danger"
              onPress={confirmDelete}
              disabled={deleting}
              full
            />
            <Button label="Annuler" variant="ghost" onPress={() => setDeleteSheet(false)} disabled={deleting} full />
          </View>
        )}
      </BottomSheet>

      {/* Ajouter / changer l’e-mail — un lien de confirmation est envoyé à la nouvelle adresse. */}
      <BottomSheet
        visible={emailSheet}
        title={realEmail ? 'Changer mon e-mail' : 'Ajouter un e-mail'}
        subtitle="On envoie un lien de confirmation à cette adresse. Le changement s’applique après le clic."
        onClose={() => {
          if (!emailBusy) setEmailSheet(false);
        }}
      >
        <View style={{ gap: spacing.sm }}>
          <TextInput
            value={emailDraft}
            onChangeText={setEmailDraft}
            placeholder="ton.nom@email.com"
            placeholderTextColor={colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="emailAddress"
            autoComplete="email"
            maxLength={120}
            accessibilityLabel="Nouvelle adresse e-mail"
            style={styles.input}
          />
          {emailMsg ? (
            <Txt variant="small" color={colors.textMuted}>
              {emailMsg}
            </Txt>
          ) : null}
          <Button
            label={emailBusy ? 'Envoi…' : 'Envoyer le lien de confirmation'}
            icon="mail"
            onPress={submitEmail}
            disabled={emailBusy}
            full
          />
          <Button label="Fermer" variant="ghost" onPress={() => setEmailSheet(false)} disabled={emailBusy} full />
        </View>
      </BottomSheet>
    </Screen>
  );
}

// CARTE À TAMPONS (82 → règle cible 92) — « 10 réservations CRÉÉES par le joueur et JOUÉES =
// −50 % sur son prochain match, plafonné, offert par PadelConnect ». Le compteur (`played` : ses
// réservations passées, encore 'booked', dont il est l’auteur) et les cycles déjà réclamés
// (`claimed`) viennent du SERVEUR — rien n’est compté côté client, donc rien ne se perd à la
// réinstallation et rien ne se triche. Le CLUB sert la remise sur présentation de cet écran.
function LoyaltyCard() {
  const toast = useToast();
  // Compteur = tranche du STORE (chargée en session + premier plan) — null = pas encore chargé
  // (ou échec réseau), jamais inventé (§8).
  const { state, refreshLoyalty } = useApp();
  const loyalty = state.loyalty;
  // Serveur d’avant la 92 (cap null) : ni règle cible ni service des codes — « bientôt disponible »,
  // jamais une règle chiffrée ni un bouton « Réclamer » qu’aucun club ne peut servir.
  const legacy = loyalty !== null && loyalty.cap === null;
  const [claiming, setClaiming] = useState(false); // libellé « Envoi… » + bouton grisé
  const claimingRef = useRef(false); // garde anti double-tap (même frame : l’état n’est pas encore rendu)
  // Mes cycles réclamés, lus du SERVEUR : le justificatif « montre cet écran au club » doit
  // SURVIVRE au démontage de l’onglet (le lendemain au club, il est encore là). null = inconnu.
  const [myClaims, setMyClaims] = useState<MyLoyaltyClaim[] | null>(null);

  // Chargement au montage ET au retour au premier plan (le club a pu servir une remise entre-temps).
  useEffect(() => {
    let alive = true;
    const load = () => {
      void fetchMyLoyaltyClaims().then((c) => alive && c && setMyClaims(c));
    };
    load();
    const sub = AppState.addEventListener('change', (st) => st === 'active' && load());
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  // Cycles complets NON réclamés + pastilles pleines — exactement la règle du serveur
  // (`claim_loyalty`), logique pure partagée (lib/loyalty).
  const { pending, filled } = loyaltyProgress(loyalty);
  // Plafond RÉEL (réglé par l’opérateur, lu avec le compteur). Tant qu’il n’est pas lu (ou
  // échec réseau), la règle s’affiche SANS montant : jamais un plafond inventé (§8).
  const reward =
    loyalty === null || loyalty.cap === null
      ? '−50 % sur ton prochain match (plafonné), offert par PadelConnect'
      : `−50 % sur ton prochain match (jusqu’à ${fcfa(loyalty.cap)}), offert par PadelConnect`;
  const lastServed = myClaims?.find((c) => c.served) ?? null;

  const claim = async () => {
    if (claimingRef.current) return;
    claimingRef.current = true;
    setClaiming(true);
    const res = await claimLoyalty();
    // Dans tous les cas on relit le compteur serveur : il fait foi (une partie a pu être
    // annulée entre-temps, ou la récompense déjà réclamée depuis un autre appareil).
    const [, freshClaims] = await Promise.all([refreshLoyalty(), fetchMyLoyaltyClaims()]);
    claimingRef.current = false;
    setClaiming(false);
    if (freshClaims) setMyClaims(freshClaims);
    if (res === 'ok') {
      hapticSuccess();
    } else if (res === 'not_yet') {
      toast.show(`Pas encore : il faut ${LOYALTY_CYCLE} réservations jouées depuis ta dernière récompense.`, {
        icon: 'information-circle',
      });
    } else {
      toast.show('Connexion impossible — réessaie', { icon: 'alert-circle' });
    }
  };

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <IconCircle icon="gift" color={colors.amberDark} bg={colors.amberSoft} />
        <View style={{ flex: 1 }}>
          <Txt variant="h3">{LOYALTY_CYCLE} réservations = −50 %</Txt>
          <Txt variant="muted">
            {loyalty === null
              ? 'Chargement de ton compteur…'
              : legacy
                ? 'Fidélité bientôt disponible — ta carte s’activera dès la mise à jour du serveur.'
                : pending > 0
                  ? 'Carte complète 🎉 — ta remise t’attend.'
                  : `${filled}/${LOYALTY_CYCLE} réservations jouées vers ta prochaine remise.`}
          </Txt>
        </View>
      </View>

      {/* Serveur d’avant la 92 : ni tampons ni règle chiffrée — le compte de la 82 inclut
          invitations et cours, il ne correspond pas à la règle annoncée. */}
      {legacy ? null : (
        <>
          {/* Les 10 tampons : une pastille pleine = une réservation créée par toi et jouée, comptée par le serveur. */}
          <View
            style={styles.stamps}
            accessible
            accessibilityLabel={loyalty === null ? 'Carte de fidélité en cours de chargement' : `${filled} tampons sur ${LOYALTY_CYCLE}`}
          >
            {Array.from({ length: LOYALTY_CYCLE }, (_, i) => (
              <View key={i} style={[styles.stamp, i < filled ? styles.stampOn : null]}>
                <Ionicons name="tennisball" size={13} color={i < filled ? colors.amberDark : colors.textFaint} />
              </View>
            ))}
          </View>

          {/* Règle cible (décision porteur) : seules TES réservations comptent, pas les invitations ni
              les cours (décision n° 3 : un cours n’est pas une partie). */}
          <Txt variant="small" color={colors.textMuted} style={{ marginTop: spacing.md }}>
            🎁 {LOYALTY_CYCLE} réservations créées et jouées (hors cours de coach) = {reward}.
          </Txt>
        </>
      )}

      {/* Cycles réclamés PAS ENCORE SERVIS (état serveur, permanent) : le justificatif reste
          affiché tant que le club n’a pas marqué la remise « servie ». */}
      {(myClaims ?? [])
        .filter((c) => !c.served)
        .map((c) => (
          <PopIn key={c.cycle}>
            <View style={styles.rewardBox}>
              <Ionicons name="gift" size={20} color={colors.amberDark} />
              <View style={{ flex: 1 }}>
                <Txt variant="body" style={{ fontWeight: '700' }}>
                  Remise n°{c.cycle} à utiliser
                </Txt>
                {/* Justificatif (92) : code court que le gérant saisit dans son Espace Club. Lu
                    lettre par lettre par le lecteur d’écran (sinon prononcé comme un mot). Absent
                    (serveur d’avant la 92) : consigne honnête à la place, jamais « code undefined ». */}
                {c.code ? (
                  <>
                    <View accessible accessibilityLabel={`Code ${c.code.split('').join(' ')}`}>
                      <Txt variant="h2" color={colors.amberDark} style={styles.claimCode}>
                        {c.code}
                      </Txt>
                    </View>
                    <Txt variant="small" color={colors.textMuted}>
                      Montre ce code au club en réglant ton prochain match : il applique la remise.
                    </Txt>
                  </>
                ) : (
                  <Txt variant="small" color={colors.textMuted}>
                    Le service des remises arrive avec la prochaine mise à jour du serveur.
                  </Txt>
                )}
              </View>
            </View>
          </PopIn>
        ))}

      {/* Dernière remise SERVIE (cycles triés du plus récent au plus ancien côté serveur) : la preuve
          que le club l’a bien appliquée — montant réel et club (null = remise en secours par PadelConnect). */}
      {lastServed ? (
        <Txt variant="small" color={colors.textMuted} style={{ marginTop: spacing.sm }}>
          ✓{' '}
          {lastServed.amount && lastServed.clubId
            ? `Remise de ${fcfa(lastServed.amount)} servie chez ${findClub(lastServed.clubId, state.customClubs, state.clubInfo)?.name ?? 'ton club'}`
            : `Remise n°${lastServed.cycle} servie par PadelConnect`}
          .
        </Txt>
      ) : null}

      {pending > 0 && !legacy ? (
        <View style={{ marginTop: spacing.md }}>
          <Button label={claiming ? 'Envoi…' : 'Réclamer ma remise 🎁'} onPress={claim} disabled={claiming} full />
          {pending > 1 ? (
            <Txt variant="small" color={colors.textMuted} style={{ marginTop: spacing.xs }}>
              {pending} remises en attente — réclame-les une par une.
            </Txt>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

// Push « Actus et agenda PadelConnect » (98, décision porteur n° 17 — Apple 4.5.4) : préférence
// SERVEUR (`profiles.news_push`), ACTIVÉE par défaut, désactivable ici. Tant qu’elle n’est pas lue
// (chargement, hors session, serveur d’avant la 98), la carte ne s’affiche pas : jamais une valeur
// inventée sous l’interrupteur (§8). Écriture honnête : le miroir ne bouge qu’au succès serveur.
function NewsPushCard() {
  const { state, setNewsPush } = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false); // garde anti double-tap (même frame : l’état n’est pas encore rendu)
  if (state.newsPush === null) return null;

  const toggle = async (next: boolean) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const ok = await setNewsPush(next);
    busyRef.current = false;
    setBusy(false);
    // Refus (hors-ligne) : rien d’enregistré, le miroir garde sa valeur → l’interrupteur y revient.
    if (!ok) toast.show('Réglage non enregistré — vérifie ta connexion', { icon: 'alert-circle' });
  };

  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm }}>
      <IconCircle icon="megaphone" color={colors.green} bg={colors.greenSoft} />
      <View style={{ flex: 1 }}>
        <Txt variant="body" style={{ fontWeight: '600' }}>
          Actus et agenda PadelConnect
        </Txt>
        <Txt variant="small" color={colors.textMuted}>
          Les actus de PadelConnect et l’agenda du padel (événements, tournois). Activées par défaut, désactivables ici.
        </Txt>
      </View>
      <Switch
        value={state.newsPush}
        onValueChange={(v) => void toggle(v)}
        disabled={busy}
        trackColor={{ true: colors.signature, false: colors.border }}
        thumbColor={colors.white}
        accessibilityRole="switch"
        accessibilityLabel="Actus et agenda PadelConnect"
      />
    </Card>
  );
}

function EditAccount({ onDone }: { onDone: () => void }) {
  const { state, updateAccount } = useApp();
  const toast = useToast();
  const a = state.account!;
  const [firstName, setFirstName] = useState(a.firstName);
  const [lastName, setLastName] = useState(a.lastName);
  const [phone, setPhone] = useState(a.phone);
  const [birth, setBirth] = useState(a.birthDate ?? '');
  const [gender, setGender] = useState<Gender | undefined>(a.gender);
  const [photoUri, setPhotoUri] = useState<string | undefined>(a.photoUri);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const choose = async () => {
    const uri = await pickImage({ square: true });
    if (uri) setPhotoUri(uri);
  };
  const save = async () => {
    if (saving) return; // garde anti double-tap : sinon deux updateAccount → deux uploads photo
    // Mêmes règles qu’à l’inscription : on refuse d’écraser prénom/nom/téléphone par du vide
    // (le téléphone sert d’ailleurs à l’appariement des amis/participants aux 10 derniers chiffres).
    if (firstName.trim().length < 2) {
      setError('Indique ton prénom (2 lettres minimum).');
      return;
    }
    if (lastName.trim().length < 1) {
      setError('Indique ton nom.');
      return;
    }
    if (!isValidPhone(phone)) {
      setError(PHONE_INCOMPLETE);
      return;
    }
    // Date facultative : vide = retrait ('' → null côté serveur) ; saisie invalide = refus avec le
    // même message qu'à l'inscription (avant, elle était ignorée puis « Profil mis à jour ✓ »).
    const bd = birth.trim() ? parseBirthDate(birth) : null;
    if (birth.trim() && !bd) {
      setError('Date invalide — vérifie le jour, le mois et l’année.');
      return;
    }
    if (bd && ageFrom(bd) < MIN_AGE) {
      setError(`PadelConnect est réservé aux ${MIN_AGE} ans et plus.`);
      return;
    }
    setError(null);
    setSaving(true);
    const { photoSaved, profileSaved, phoneTaken } = await updateAccount({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim(),
      photoUri,
      birthDate: birth.trim(),
      gender,
    });
    setSaving(false);
    // Numéro déjà porté par un autre compte (unicité serveur) : message net, pas « vérifie ta connexion ».
    if (phoneTaken) {
      setError('Ce numéro est déjà utilisé par un autre compte.');
      return;
    }
    // On ne ment plus : si les champs texte n'ont pas atteint le serveur (réseau), le formulaire
    // RESTE OUVERT — sinon l'ancien prénom/numéro serveur revenait en silence au prochain
    // lancement (et le numéro sert aux clubs + à l'appariement amis/coachs).
    if (!profileSaved) {
      setError('Modifications non enregistrées — vérifie ta connexion et réessaie.');
      return;
    }
    // La photo, elle, peut échouer seule (upload) : profil à jour mais photo non enregistrée.
    toast.show(
      photoSaved ? 'Profil mis à jour ✓' : 'Profil mis à jour, mais la photo non enregistrée — vérifie ta connexion',
      photoSaved ? undefined : { icon: 'alert-circle' },
    );
    onDone();
  };

  return (
    <Card style={{ marginTop: spacing.sm }}>
      <View style={{ alignItems: 'center' }}>
        <Pressable
          onPress={choose}
          style={styles.avatar}
          accessibilityRole="button"
          accessibilityLabel={photoUri ? 'Changer la photo de profil' : 'Ajouter une photo de profil'}
        >
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.avatarImg} contentFit="cover" />
          ) : (
            <Ionicons name="camera-outline" size={26} color={colors.textMuted} />
          )}
        </Pressable>
      </View>
      <TextInput
        value={firstName}
        onChangeText={setFirstName}
        placeholder="Prénom"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={40}
        accessibilityLabel="Prénom"
        style={styles.input}
      />
      <TextInput
        value={lastName}
        onChangeText={setLastName}
        placeholder="Nom"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={40}
        accessibilityLabel="Nom"
        style={styles.input}
      />
      <TextInput
        value={phone}
        onChangeText={setPhone}
        placeholder="Téléphone"
        placeholderTextColor={colors.textMuted}
        keyboardType="phone-pad"
        autoCorrect={false}
        textContentType="telephoneNumber"
        autoComplete="tel"
        maxLength={20}
        accessibilityLabel="Numéro de téléphone"
        style={styles.input}
      />
      <TextInput
        value={birth}
        onChangeText={(t) => setBirth(maskBirthDate(t, birth))}
        placeholder="Date de naissance (JJ/MM/AAAA)"
        placeholderTextColor={colors.textMuted}
        keyboardType="phone-pad"
        maxLength={10}
        accessibilityLabel="Date de naissance, format jour mois année"
        style={styles.input}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }}>
        {GENDERS.map((gd) => (
          <Chip key={gd.id} label={gd.label} active={gender === gd.id} onPress={() => setGender(gd.id)} />
        ))}
      </View>
      {error ? (
        <Txt variant="small" color={colors.danger} style={{ marginTop: spacing.md }}>
          {error}
        </Txt>
      ) : null}
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Button label={saving ? 'Enregistrement…' : 'Enregistrer'} icon="checkmark" onPress={save} disabled={saving} full />
        </View>
        <Button label="Annuler" variant="ghost" onPress={onDone} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  band: { borderRadius: radius.xl, padding: spacing.lg, marginTop: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  editBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.onPhotoSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gaugeTrack: { height: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  gaugeFill: { height: 8, borderRadius: radius.pill, backgroundColor: colors.signature },
  nextTrophyTrack: { height: 5, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  nextTrophyFill: { height: 5, borderRadius: radius.pill, backgroundColor: colors.amber },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.signatureSoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  stats: { flexDirection: 'row', gap: spacing.sm },
  streak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.amberSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  trophyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  trophyHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  trophyTrack: { height: 5, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden', marginTop: 6 },
  trophyFill: { height: 5, borderRadius: radius.pill, backgroundColor: colors.amber },
  // Carte à tampons : 10 pastilles qui se partagent la largeur (flex + aspectRatio) — elles
  // rétrécissent sur petit écran plutôt que de passer à la ligne.
  stamps: { flexDirection: 'row', gap: 5, marginTop: spacing.md },
  stamp: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stampOn: { backgroundColor: colors.amberSoft, borderColor: colors.amber },
  rewardBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.amberSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  // Code de remise : espacé pour se lire d’un coup d’œil au comptoir (alphabet sans 0/O ni 1/I).
  claimCode: { letterSpacing: 4, marginVertical: spacing.xs },
  cta: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  statsLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    padding: spacing.md,
    marginTop: spacing.sm,
    fontSize: 15,
  },
});
