import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import { Avatar } from '@/components/Avatar';
import { BottomSheet } from '@/components/BottomSheet';
import { Chip } from '@/components/Chip';
import { Reveal } from '@/components/Reveal';
import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { Button, Card, Divider, IconCircle, SectionHeader, StatTile, Tag, Txt, type IconName } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { canAccessOperator, canSeeClubSpace } from '@/lib/access';
import { levelLabel } from '@/lib/format';
import { pickImage } from '@/lib/pickImage';
import { usePullToRefresh } from '@/lib/usePullToRefresh';
import { GENDERS, ageFrom, genderLabel, maskBirthDate, parseBirthDate, zodiacFor, type Gender } from '@/lib/zodiac';
import { colors, gradients, radius, spacing } from '@/theme';

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
      ? state.reservations.filter((r) => r.clubId === state.serverManagedClubId && !r.clubConfirmed && r.startsAt > Date.now()).length
      : 0;

  const changePhoto = async () => {
    const uri = await pickImage({ square: true });
    setPhotoSheet(false);
    if (!uri) return;
    const { photoSaved } = await updateAccount({ photoUri: uri });
    if (!photoSaved) toast.show('Photo non enregistrée — vérifie ta connexion', { icon: 'alert-circle' });
  };

  // Trophées ÉVOLUTIFs : chaque trophée monte en paliers (Bronze → Argent → Or → Platine)
  // selon une valeur RÉELLE (parties jouées auto, tournois, victoires, amis, niveau).
  const trophies: Trophy[] = [
    { label: 'Parties jouées', icon: 'tennisball', value: stats.played, steps: [1, 5, 20, 50] },
    { label: 'Tournois joués', icon: 'flag', value: stats.tournamentsPlayed, steps: [1, 3, 10] },
    { label: 'Tournois gagnés', icon: 'trophy', value: stats.tournamentsWon, steps: [1, 3, 5] },
    { label: 'Cercle d’amis', icon: 'people', value: friends.length, steps: [1, 5, 15] },
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
      { label: '5 amis', current: friends.length, target: 5 },
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

      {/* Mon niveau — n’évolue que par les tournois officiels */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Mon niveau" />
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
            <Txt variant="label">Niveau de jeu</Txt>
            <Txt variant="display" color={colors.signature} style={{ fontSize: 28 }}>
              {level.toFixed(2)}
            </Txt>
          </View>
          <View style={styles.gaugeTrack}>
            <View style={[styles.gaugeFill, { width: lvlPct }]} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
            <Txt variant="small" color={colors.textFaint}>
              {lvlLow.toFixed(1)}
            </Txt>
            <Txt variant="small" color={colors.textFaint}>
              {lvlHigh.toFixed(1)}
            </Txt>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm }}>
            <Ionicons name="swap-vertical" size={14} color={colors.textMuted} />
            <Txt variant="small" color={colors.textMuted} style={{ flex: 1 }}>
              {levelLabel(level)} · monte ou descend selon tes résultats en tournoi officiel (+0.50 / −0.25).
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
                    <Tag
                      label={o.result === 'win' ? 'Vainqueur' : o.result === 'last' ? 'Fin de tableau' : 'Participant'}
                      tone={o.result === 'win' ? 'amber' : o.result === 'last' ? 'coral' : 'signature'}
                    />
                    <Txt variant="muted" style={{ flex: 1 }}>
                      {/* Tournoi serveur : delta seul (le « niveau après » serait périmé). Le serveur
                          borne le niveau à [1,7] (close_competition) → on annonce le delta « au plus »,
                          sinon un joueur déjà à 7 (ou 1) verrait un +0.50/−0.25 qui n'a pas bougé. */}
                      {o.levelAfter != null
                        ? `${o.title} → Niveau ${o.levelAfter.toFixed(2)}`
                        : `${o.title}${o.result === 'win' ? ' → +0.50 (plafond 7)' : o.result === 'last' ? ' → −0.25 (plancher 1)' : ''}`}
                    </Txt>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
              Inscris-toi à un tournoi officiel : une victoire fait gagner +0.50.
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
          Les parties jouées se comptent toutes seules : une réservation passée = une partie.
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

      {/* Rappels */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Rappels" />
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <IconCircle icon="notifications" color={colors.coral} bg={colors.coralSoft} />
          <View style={{ flex: 1 }}>
            <Txt variant="body" style={{ fontWeight: '600' }}>
              Rappels de match
            </Txt>
            <Txt variant="small" color={colors.textMuted}>
              Deux rappels par match : avant la fin de l’annulation gratuite, puis ~2 h avant. Désactivable ici.
            </Txt>
          </View>
          <Switch
            value={state.remindersOn}
            onValueChange={setRemindersOn}
            trackColor={{ true: colors.signature, false: colors.border }}
            thumbColor={colors.white}
          />
        </Card>
      </View>

      {/* Espaces pro — affichés UNIQUEMENT selon le rôle vérifié côté serveur (state.role) :
          « club » → Espace Club, « operator » → Espace opérateur. Aucun geste secret ; la
          vraie barrière reste la Row Level Security Supabase. */}
      {showClub || showOperator || showCoach ? (
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
        PadelConnect v{Constants.expoConfig?.version ?? '1.0.0'} · Abidjan 🇨🇮{'\n'}Réserve ton terrain de padel en 2 minutes.
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

      {/* Suppression définitive — irréversible : on prévient clairement avant de confirmer. */}
      <BottomSheet
        visible={deleteSheet}
        title="Supprimer mon compte ?"
        subtitle="Cette action est définitive. Ton profil, tes réservations et tes données seront effacés. On ne peut pas les récupérer."
        onClose={() => {
          if (!deleting) setDeleteSheet(false);
        }}
      >
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
    if (phone.replace(/\D/g, '').length < 8) {
      setError('Numéro invalide — au moins 8 chiffres.');
      return;
    }
    setError(null);
    setSaving(true);
    const { photoSaved, profileSaved } = await updateAccount({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim(),
      photoUri,
      birthDate: parseBirthDate(birth) ? birth.trim() : a.birthDate,
      gender,
    });
    setSaving(false);
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
        style={styles.input}
      />
      <TextInput
        value={lastName}
        onChangeText={setLastName}
        placeholder="Nom"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
      />
      <TextInput
        value={phone}
        onChangeText={setPhone}
        placeholder="Téléphone"
        placeholderTextColor={colors.textMuted}
        keyboardType="phone-pad"
        style={styles.input}
      />
      <TextInput
        value={birth}
        onChangeText={(t) => setBirth(maskBirthDate(t, birth))}
        placeholder="Date de naissance (JJ/MM/AAAA)"
        placeholderTextColor={colors.textMuted}
        keyboardType="phone-pad"
        maxLength={10}
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
