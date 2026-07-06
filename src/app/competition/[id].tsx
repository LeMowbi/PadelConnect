import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Linking, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { Confetti } from '@/components/Confetti';
import { PlayerSheet, type PlayerLike } from '@/components/PlayerSheet';
import { PopIn } from '@/components/PopIn';
import { Screen } from '@/components/Screen';
import { Button, Card, Divider, EmptyState, Tag, Txt } from '@/components/ui';
import { findClub } from '@/data/clubs';
import { compDateLabel, formatFee, hasEntryFee, isTournamentPublic, seedCompetitions, teamCount, teamsToShow } from '@/data/competitions';
import { openWhatsApp } from '@/lib/contact';
import { dayKey } from '@/lib/days';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { shareCompetition } from '@/lib/share';
import { useApp, type CompResult, type OfficialResult } from '@/store/AppContext';
import { colors, gradients, radius, shadows, spacing } from '@/theme';

export default function CompetitionDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { state, registerCompetition, unregisterCompetition, closeCompetition, deleteCompetition } = useApp();

  const key = Array.isArray(id) ? id[0] : id;
  const comp = [...state.myCompetitions, ...seedCompetitions].find((c) => c.id === key);

  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [partnerName, setPartnerName] = useState('');
  const [winnerName, setWinnerName] = useState('');
  const [loserName, setLoserName] = useState(''); // équipe classée dernière (facultatif)
  const [secondName, setSecondName] = useState(''); // americano : 2ᵉ place (facultatif)
  const [thirdName, setThirdName] = useState(''); // americano : 3ᵉ place (facultatif)
  const [pickingLoser, setPickingLoser] = useState(false); // 2ᵉ étape de clôture
  const [confirmCancel, setConfirmCancel] = useState(false); // annulation d’un tournoi sans inscrit
  // tone distingue succès (coche) et échec (alerte) — l'icône suivait avant toujours « succès ».
  const [toast, setToast] = useState<{ text: string; tone: 'success' | 'error' } | null>(null);
  const [openPlayer, setOpenPlayer] = useState<PlayerLike | null>(null);
  const [registering, setRegistering] = useState(false); // évite double-clic + toast menteur si échec serveur
  const [closing, setClosing] = useState(false); // évite double-clic sur la clôture + retour d’échec
  const [deleting, setDeleting] = useState(false); // évite double-clic sur la suppression du tournoi
  const [celebrate, setCelebrate] = useState(false); // confettis quand MON équipe remporte le tournoi (motif amis.tsx)

  // Affiche le toast + l'ANNONCE aux lecteurs d'écran (seul canal de confirmation/erreur de ces
  // actions — même motif que components/Toast.tsx) + auto-disparition (timer précédent remplacé).
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (text: string, tone: 'success' | 'error' = 'success') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text, tone });
    AccessibilityInfo.announceForAccessibility(text);
    toastTimer.current = setTimeout(() => setToast(null), tone === 'error' ? 2400 : 2200);
  };
  // Au démontage uniquement : pas de setToast orphelin après avoir quitté la fiche.
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  // Suppression / annulation du tournoi : on ATTEND le serveur avant de quitter l'écran —
  // un échec (hors-ligne, droits) était avant silencieux et le tournoi « réapparaissait ».
  const removeCompetition = async () => {
    if (!comp || deleting) return;
    setDeleting(true);
    const ok = await deleteCompetition(comp.id);
    setDeleting(false);
    if (!ok) {
      hapticWarning();
      showToast('Suppression impossible — réessaie.', 'error');
      return;
    }
    router.back();
  };

  if (!comp) {
    return (
      <Screen back>
        <EmptyState icon="alert-circle-outline" title="Tournoi introuvable" />
      </Screen>
    );
  }

  const reg = state.compRegistrations[comp.id];
  const registered = !!reg;
  // Club hôte (pour que l’organisateur d’un tournoi en attente puisse le contacter et le faire valider).
  const hostClub = comp.clubId ? findClub(comp.clubId, state.customClubs, state.clubInfo) : undefined;
  const contactClub = () =>
    hostClub?.contactPhone
      ? openWhatsApp(
          hostClub.contactPhone,
          `Bonjour ${hostClub.name}, je souhaite organiser le tournoi « ${comp.title} » chez vous — pouvez-vous le valider sur PadelConnect ?`,
        )
      : undefined;
  // Cycle de vie : à venir → terminé (jour STRICTEMENT passé) → clôturé (vainqueur désigné).
  // Le jour même = en cours, pas encore « terminé » (on ne clôture pas avant que ça se joue).
  // Pour un tournoi multi-jours, c’est la date de FIN qui fait foi.
  const played = (comp.endDateKey ?? comp.dateKey) < dayKey(new Date());
  // Dès le JOUR MÊME du tournoi, le serveur refuse la désinscription (53) : on ne montre plus
  // le bouton — un « réessaie » en boucle sur un refus définitif serait mensonger.
  const started = dayKey(new Date()) >= comp.dateKey;
  const result = state.compResults[comp.id];
  const mine = state.officialResults.find((o) => o.compId === comp.id);
  const myTeam = registered ? `${state.account?.firstName ?? 'Toi'} & ${reg.partner}` : '';
  // Un défi AMICAL créé par un joueur se clôture ici, par son créateur. Un tournoi OFFICIEL
  // ne se clôture JAMAIS depuis cette fiche (réservé à l’Espace Club) — sinon un joueur
  // pourrait s’auto-attribuer des points de niveau.
  const canClose = !!comp.createdByMe && !comp.official && played && !result;
  const teams = teamCount(comp, registered);
  const teamList = teamsToShow(comp, registered ? myTeam : undefined);
  // Frais d’inscription à régler → contacter l’organisateur : le club (tournoi club) ou le
  // joueur organisateur (tournoi joueur). WhatsApp, canal n°1 en Côte d’Ivoire.
  const feeContactPhone = comp.organizerType === 'club' ? hostClub?.contactPhone : comp.organizerPhone;
  const contactForFee = () =>
    feeContactPhone
      ? openWhatsApp(
          feeContactPhone,
          `Bonjour, je viens de m’inscrire au tournoi « ${comp.title} » sur PadelConnect — comment régler les frais d’inscription (${formatFee(comp.fee)}) ?`,
        )
      : undefined;
  const left = Math.max(0, comp.slots - teams);
  const full = left === 0 && !registered;
  const pct = Math.min(100, Math.round((teams / Math.max(1, comp.slots)) * 100)); // Math.max(1,…) : jamais de NaN si slots=0

  const byClub = comp.organizerType === 'club';
  const partner = (partnerId ? state.friends.find((f) => f.id === partnerId)?.name : partnerName.trim()) ?? '';
  const canRegister = !full && partner.length > 0;

  const pickFriend = (fid: string) => {
    setPartnerId((cur) => (cur === fid ? null : fid));
    setPartnerName('');
  };

  // Americano : tournoi par rotation → on clôture par un PODIUM (1ᵉ/2ᵉ/3ᵉ) plutôt qu’un
  // unique vainqueur + dernier. La détection se fait sur le format choisi à la création.
  const isAmericano = comp.format.toLowerCase().includes('americano');

  // Clôture effective : vainqueur + (option) dernière équipe. Gardée (anti double-tap) + retour
  // d’échec par toast, aligné sur le flux d’inscription de cet écran.
  const doClose = async (loser?: string) => {
    if (closing) return;
    setClosing(true);
    const ok = await closeCompetition(
      comp,
      winnerName,
      winnerName === myTeam && registered,
      loser,
      !!loser && loser === myTeam && registered,
    );
    setClosing(false);
    if (ok) {
      hapticSuccess();
      // Confettis seulement si le vainqueur désigné, c’est MOI (sinon simple toast, sans fêter
      // un résultat qui n’est pas le sien — cf. audit).
      if (winnerName === myTeam && registered) setCelebrate(true);
    } else hapticWarning();
    showToast(ok ? 'Tournoi clôturé ✓' : 'Clôture impossible — réessaie.', ok ? 'success' : 'error');
  };
  // Clôture americano : vainqueur + 2ᵉ/3ᵉ place (le niveau ne bouge que pour le 1ᵉ, comme ailleurs).
  const doClosePodium = async () => {
    if (closing) return;
    setClosing(true);
    const ok = await closeCompetition(comp, winnerName, winnerName === myTeam && registered, undefined, false, {
      second: secondName || undefined,
      third: thirdName || undefined,
    });
    setClosing(false);
    if (ok) {
      hapticSuccess();
      if (winnerName === myTeam && registered) setCelebrate(true);
    } else hapticWarning();
    showToast(ok ? 'Tournoi clôturé ✓' : 'Clôture impossible — réessaie.', ok ? 'success' : 'error');
  };

  return (
    <Screen
      back
      title="Tournoi"
      overlay={
        toast ? (
          // Toast léger (succès ex. « Lien copié ! » ou échec ex. « Inscription impossible »)
          <View
            style={styles.toast}
            pointerEvents="none"
            accessible
            accessibilityLiveRegion={toast.tone === 'error' ? 'assertive' : 'polite'}
          >
            <Ionicons name={toast.tone === 'error' ? 'alert-circle' : 'checkmark-circle'} size={16} color={colors.white} />
            <Txt variant="small" color={colors.white}>
              {toast.text}
            </Txt>
          </View>
        ) : null
      }
    >
      {/* En-tête héros violet (univers Tournois) — dégradé deepPurple */}
      <LinearGradient colors={gradients.deepPurple} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroTopRow}>
          <View style={styles.heroPill}>
            <Txt variant="label" color={colors.purple} style={styles.heroPillText}>
              Tournoi · {comp.level}
            </Txt>
          </View>
          {comp.official ? <Tag label="Officiel" tone="amber" icon="shield-checkmark" /> : null}
        </View>
        <Txt variant="display" color={colors.white} style={styles.heroTitle}>
          {comp.title}
        </Txt>
        <View style={styles.heroMetaRow}>
          <Ionicons name="calendar-outline" size={14} color={colors.white} style={{ opacity: 0.85 }} />
          <Txt variant="small" color={colors.white} style={styles.heroMeta}>
            {compDateLabel(comp)}
            {comp.clubName ? ` · ${comp.clubName}` : ''}
          </Txt>
        </View>
        <View style={styles.heroOrg}>
          <Tag
            label={
              byClub
                ? `Organisé par ${comp.organizer}`
                : comp.organizerType === 'operator'
                  ? 'Organisé par PadelConnect'
                  : `Créé par ${comp.organizer} (joueur)`
            }
            tone={byClub ? 'signature' : comp.organizerType === 'operator' ? 'amber' : 'green'}
            icon={byClub ? 'business' : comp.organizerType === 'operator' ? 'star' : 'person'}
          />
        </View>
        {/* Ce que « Officiel » veut dire, en clair — sinon le badge reste abstrait pour le joueur. */}
        <Txt variant="small" color={colors.white} style={{ marginTop: spacing.sm, opacity: 0.85 }}>
          {comp.official
            ? 'Tournoi officiel : le résultat compte pour ton niveau PadelConnect.'
            : 'Tournoi entre joueurs : amical — le résultat ne change pas ton niveau.'}
        </Txt>
      </LinearGradient>

      {/* Chips d’info sous le héros */}
      <View style={styles.chipsRow}>
        {comp.reward.trim() ? (
          <View style={[styles.infoChip, styles.infoChipReward]}>
            <Txt variant="label" color={colors.purple}>
              Récompense
            </Txt>
            <Txt variant="h3" color={colors.purple} numberOfLines={2} style={{ marginTop: 2 }}>
              {formatFee(comp.reward)}
            </Txt>
          </View>
        ) : null}
        <View style={styles.infoChip}>
          <Txt variant="label">{played ? 'Date' : 'Clôture'}</Txt>
          <Txt variant="h3" style={{ marginTop: 2 }}>
            {compDateLabel(comp)}
          </Txt>
        </View>
      </View>

      {comp.status === 'pending' ? (
        <>
          <View style={styles.pendingBanner}>
            <Ionicons name="hourglass-outline" size={16} color={colors.coral} />
            <Txt variant="small" color={colors.text} style={{ flex: 1 }}>
              En attente de validation par {comp.clubName ?? 'le club hôte'}. Ton tournoi sera visible une fois accepté.
            </Txt>
          </View>
          {comp.createdByMe && hostClub?.contactPhone ? (
            <View style={{ marginTop: spacing.sm }}>
              <Button label={`Contacter ${hostClub.name}`} icon="logo-whatsapp" variant="secondary" onPress={contactClub} full />
            </View>
          ) : null}
        </>
      ) : comp.status === 'rejected' ? (
        <>
          <View style={styles.pendingBanner}>
            <Ionicons name="close-circle-outline" size={16} color={colors.danger} />
            <Txt variant="small" color={colors.text} style={{ flex: 1 }}>
              Ce tournoi n’a pas été retenu par {comp.clubName ?? 'le club hôte'}.
              {comp.rejectReason ? ` Motif : « ${comp.rejectReason} »` : ''}
            </Txt>
          </View>
          {/* L’organisateur supprime son tournoi refusé (et peut le recréer en tenant compte du
              motif — ex. d’autres dates/créneaux proposés par le club). */}
          {comp.createdByMe ? (
            <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
              {comp.rejectReason ? (
                <Button
                  label="Recréer en tenant compte du motif"
                  icon="refresh"
                  variant="secondary"
                  onPress={() => router.push(comp.clubId ? `/competition/nouvelle?clubId=${comp.clubId}` : '/competition/nouvelle')}
                  full
                />
              ) : null}
              <Button
                label="Supprimer ce tournoi"
                icon="trash-outline"
                variant="danger"
                onPress={() => void removeCompetition()}
                disabled={deleting}
                full
              />
            </View>
          ) : null}
        </>
      ) : null}

      {/* Frais PadelConnect (Wave, v2) — visible par l’ORGANISATEUR d’un tournoi joueur, UNE FOIS
          le club validé (approved). Payé → confirmé ✓. Non payé → bouton Wave (lien de l’opérateur)
          + rappel d’envoyer la preuve, l’opérateur confirme la réception dans son espace. */}
      {comp.createdByMe && comp.organizerType === 'joueur' && (comp.commission ?? 0) > 0 && comp.status === 'approved' ? (
        comp.paymentStatus === 'paid' ? (
          <View style={[styles.pendingBanner, { backgroundColor: colors.greenSoft }]}>
            <Ionicons name="checkmark-circle" size={16} color={colors.green} />
            <Txt variant="small" color={colors.text} style={{ flex: 1 }}>
              Frais d’organisation PadelConnect réglés — merci ! Ton tournoi est en règle.
            </Txt>
          </View>
        ) : (
          <Card style={{ marginTop: spacing.md, backgroundColor: colors.amberSoft, gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Ionicons name="cash-outline" size={18} color={colors.amberDark} />
              <Txt variant="h3" style={{ flex: 1 }}>
                Frais à régler : {formatFee(`${comp.commission} FCFA`)}
              </Txt>
            </View>
            <Txt variant="small" color={colors.textMuted}>
              Ton club a validé le tournoi. Règle les frais d’organisation PadelConnect par Wave, puis envoie la preuve — l’opérateur
              confirme la réception.
            </Txt>
            {state.waveLink ? (
              <Button
                label="Payer par Wave"
                icon="card-outline"
                onPress={() =>
                  void Linking.openURL(state.waveLink!).catch(() =>
                    showToast('Lien de paiement invalide — préviens PadelConnect.', 'error'),
                  )
                }
                full
              />
            ) : (
              <Txt variant="small" color={colors.amberDark}>
                PadelConnect t’enverra le lien de paiement très vite.
              </Txt>
            )}
          </Card>
        )
      ) : null}

      <Card style={{ marginTop: spacing.md }}>
        <Info icon="calendar-outline" label="Date" value={compDateLabel(comp)} />
        <Info icon="git-network-outline" label="Format" value={comp.format} />
        <Info icon="podium-outline" label="Niveau" value={comp.level} />
        <Info icon="cash-outline" label="Inscription" value={formatFee(comp.fee)} />
      </Card>

      {/* Places — limitées, en équipes */}
      <Card style={{ marginTop: spacing.md }}>
        <View style={styles.placesHead}>
          <Txt variant="label">ÉQUIPES INSCRITES</Txt>
          <Txt variant="h3">
            {teams}/{comp.slots}
          </Txt>
        </View>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${pct}%` as `${number}%` }]} />
        </View>
        <Txt variant="small" color={full ? colors.danger : colors.textMuted} style={{ marginTop: spacing.sm }}>
          {registered
            ? 'Ton équipe est inscrite.'
            : full
              ? 'Complet — toutes les places sont prises.'
              : `Il reste ${left} place${left > 1 ? 's' : ''}.`}
        </Txt>
        {teamList.length > 0 ? (
          <>
            <Divider style={{ marginVertical: spacing.md }} />
            <View style={styles.teamsWrap}>
              {teamList.map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setOpenPlayer({ id: `team:${comp.id}:${t}`, name: t, isTeam: true })}
                  accessibilityRole="button"
                  accessibilityLabel={`Voir l’équipe ${t}`}
                  hitSlop={8}
                >
                  <Tag label={t} tone={t === myTeam && registered ? 'signature' : 'neutral'} icon="people" />
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
      </Card>

      <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
        {byClub && comp.clubId ? (
          <Button
            label={`Voir ${comp.clubName}`}
            icon="location-outline"
            variant="secondary"
            onPress={() => router.push(`/club/${comp.clubId}`)}
          />
        ) : null}
        <Button
          label="Partager le tournoi"
          icon="share-social-outline"
          variant="ghost"
          onPress={async () => {
            const r = await shareCompetition(comp);
            if (r === 'copied') {
              showToast('Lien copié !');
            }
          }}
        />
      </View>

      {/* Résultats (tournoi clôturé) — PopIn si c’est MA victoire (le moment le plus fort du
          produit : le niveau ne bouge que via un tournoi officiel). */}
      {result ? (
        mine?.result === 'win' ? (
          <PopIn>
            <ResultCard result={result} mine={mine} official={comp.official} />
          </PopIn>
        ) : (
          <ResultCard result={result} mine={mine} official={comp.official} />
        )
      ) : null}
      {celebrate ? <Confetti onDone={() => setCelebrate(false)} /> : null}

      {/* Tournoi terminé SANS inscrit : rien à clôturer — le créateur peut l’annuler. */}
      {canClose && teamList.length === 0 ? (
        <Card style={{ marginTop: spacing.lg, borderColor: colors.danger }}>
          <Txt variant="h3">Tournoi terminé sans inscrit</Txt>
          <Txt variant="small" color={colors.textMuted} style={{ marginTop: 2 }}>
            Aucune équipe ne s’est inscrite : il n’y a pas de vainqueur à désigner.
          </Txt>
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            {confirmCancel ? (
              <>
                <Txt variant="small" color={colors.textMuted}>
                  Annuler définitivement ce tournoi ? Il disparaîtra des listes.
                </Txt>
                <Button
                  label="Oui, annuler le tournoi"
                  icon="trash-outline"
                  variant="danger"
                  onPress={() => void removeCompetition()}
                  disabled={deleting}
                  full
                />
                <Button label="Le garder" variant="secondary" onPress={() => setConfirmCancel(false)} full />
              </>
            ) : (
              <Button label="Annuler ce tournoi" icon="trash-outline" variant="danger" onPress={() => setConfirmCancel(true)} full />
            )}
          </View>
        </Card>
      ) : null}

      {/* Clôture — réservée au créateur du défi : vainqueur (puis, en option, dernière place) */}
      {canClose && teamList.length > 0 ? (
        <Card style={{ marginTop: spacing.lg, borderColor: colors.purple }}>
          {!pickingLoser ? (
            <>
              <Txt variant="h3">Clôturer & désigner le vainqueur</Txt>
              <Txt variant="small" color={colors.textMuted} style={{ marginTop: 2 }}>
                Le tournoi est terminé : sélectionne l’équipe qui a gagné. C’est toi (l’organisateur) qui décides.
              </Txt>
              <View style={{ marginTop: spacing.sm, gap: 6 }} accessibilityRole="radiogroup">
                {teamList.map((t) => {
                  const sel = winnerName === t;
                  return (
                    <Pressable
                      key={t}
                      onPress={() => setWinnerName(t)}
                      style={[styles.teamRow, sel && styles.teamRowSel]}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: sel }}
                    >
                      <Ionicons
                        name={sel ? 'radio-button-on' : 'radio-button-off'}
                        size={18}
                        color={sel ? colors.signature : colors.textMuted}
                      />
                      <Txt variant="body" style={{ flex: 1, fontWeight: sel ? '700' : '400' }}>
                        {t}
                      </Txt>
                      {registered && t === myTeam ? <Tag label="Ton équipe" tone="signature" /> : null}
                    </Pressable>
                  );
                })}
              </View>
              <View style={{ marginTop: spacing.md }}>
                <Button
                  label={isAmericano ? 'Suite : podium →' : winnerName ? `Vainqueur : ${winnerName}` : 'Valider le vainqueur'}
                  icon="flag"
                  onPress={() => setPickingLoser(true)}
                  disabled={!winnerName}
                  full
                />
              </View>
              {comp.official ? (
                <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
                  Tournoi officiel : l’équipe vainqueure gagne +0.50 de niveau.
                </Txt>
              ) : null}
            </>
          ) : isAmericano ? (
            <>
              <Txt variant="h3">Podium de l’americano</Txt>
              <Txt variant="small" color={colors.textMuted} style={{ marginTop: 2 }}>
                1ʳᵉ place : <Txt style={{ fontWeight: '700' }}>{winnerName}</Txt>. Ajoute la 2ᵉ et la 3ᵉ place (facultatif).
              </Txt>
              <Txt variant="label" style={{ marginTop: spacing.md }}>
                🥈 2ᵉ place
              </Txt>
              <View style={{ marginTop: 6, gap: 6 }} accessibilityRole="radiogroup">
                {teamList
                  .filter((t) => t !== winnerName)
                  .map((t) => {
                    const sel = secondName === t;
                    return (
                      <Pressable
                        key={t}
                        onPress={() => {
                          setSecondName((cur) => (cur === t ? '' : t));
                          if (thirdName === t) setThirdName('');
                        }}
                        style={[styles.teamRow, sel && styles.teamRowSel]}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: sel }}
                      >
                        <Ionicons
                          name={sel ? 'radio-button-on' : 'radio-button-off'}
                          size={18}
                          color={sel ? colors.amber : colors.textMuted}
                        />
                        <Txt variant="body" style={{ flex: 1, fontWeight: sel ? '700' : '400' }}>
                          {t}
                        </Txt>
                        {registered && t === myTeam ? <Tag label="Ton équipe" tone="signature" /> : null}
                      </Pressable>
                    );
                  })}
              </View>
              <Txt variant="label" style={{ marginTop: spacing.md }}>
                🥉 3ᵉ place
              </Txt>
              <View style={{ marginTop: 6, gap: 6 }} accessibilityRole="radiogroup">
                {teamList
                  .filter((t) => t !== winnerName && t !== secondName)
                  .map((t) => {
                    const sel = thirdName === t;
                    return (
                      <Pressable
                        key={t}
                        onPress={() => setThirdName((cur) => (cur === t ? '' : t))}
                        style={[styles.teamRow, sel && styles.teamRowSel]}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: sel }}
                      >
                        <Ionicons
                          name={sel ? 'radio-button-on' : 'radio-button-off'}
                          size={18}
                          color={sel ? colors.coral : colors.textMuted}
                        />
                        <Txt variant="body" style={{ flex: 1, fontWeight: sel ? '700' : '400' }}>
                          {t}
                        </Txt>
                        {registered && t === myTeam ? <Tag label="Ton équipe" tone="signature" /> : null}
                      </Pressable>
                    );
                  })}
              </View>
              <View style={{ marginTop: spacing.md }}>
                <Button
                  label={closing ? 'Clôture…' : 'Clôturer le tournoi'}
                  icon="trophy"
                  onPress={doClosePodium}
                  disabled={closing}
                  full
                />
              </View>
            </>
          ) : (
            <>
              <Txt variant="h3">Fin de tableau ?</Txt>
              <Txt variant="small" color={colors.textMuted} style={{ marginTop: 2 }}>
                Facultatif. {comp.official ? 'L’équipe désignée perd −0.25 de niveau. ' : ''}Tu peux passer.
              </Txt>
              <View style={{ marginTop: spacing.sm, gap: 6 }} accessibilityRole="radiogroup">
                {teamList
                  .filter((t) => t !== winnerName)
                  .map((t) => {
                    const sel = loserName === t;
                    return (
                      <Pressable
                        key={t}
                        onPress={() => setLoserName(t)}
                        style={[styles.teamRow, sel && styles.teamRowSel]}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: sel }}
                      >
                        <Ionicons
                          name={sel ? 'radio-button-on' : 'radio-button-off'}
                          size={18}
                          color={sel ? colors.coral : colors.textMuted}
                        />
                        <Txt variant="body" style={{ flex: 1, fontWeight: sel ? '700' : '400' }}>
                          {t}
                        </Txt>
                        {registered && t === myTeam ? <Tag label="Ton équipe" tone="signature" /> : null}
                      </Pressable>
                    );
                  })}
              </View>
              <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
                <Button
                  label={closing ? 'Clôture…' : loserName ? `Clôturer (fin de tableau : ${loserName})` : 'Clôturer'}
                  icon="flag"
                  onPress={() => doClose(loserName || undefined)}
                  disabled={!loserName || closing}
                  full
                />
                <Button label="Passer (pas de fin de tableau)" variant="ghost" onPress={() => doClose(undefined)} disabled={closing} full />
              </View>
            </>
          )}
        </Card>
      ) : null}

      {/* Inscription en équipe */}
      {registered ? (
        <Card style={{ marginTop: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Ionicons name="checkmark-circle" size={24} color={colors.green} />
            <View style={{ flex: 1 }}>
              <Txt variant="h3">Inscrit en équipe</Txt>
              <Txt variant="muted">Avec {reg.partner}</Txt>
            </View>
            {played && !result ? <Tag label="Résultats à venir" tone="neutral" icon="hourglass-outline" /> : null}
          </View>
          {/* Frais d’inscription à régler → on propose de contacter l’organisateur (WhatsApp). */}
          {!played && hasEntryFee(comp.fee) && feeContactPhone ? (
            <View style={{ marginTop: spacing.md }}>
              <Txt variant="small" color={colors.textMuted}>
                Frais d’inscription : <Txt style={{ fontWeight: '600' }}>{formatFee(comp.fee)}</Txt>. Règle-les directement avec
                l’organisateur.
              </Txt>
              <View style={{ marginTop: spacing.sm }}>
                <Button
                  size="sm"
                  label={
                    comp.organizerType === 'club'
                      ? 'Contacter le club (règlement)'
                      : comp.organizerType === 'operator'
                        ? 'Contacter PadelConnect (règlement)'
                        : 'Contacter l’organisateur (règlement)'
                  }
                  icon="logo-whatsapp"
                  variant="secondary"
                  onPress={contactForFee}
                  full
                />
              </View>
            </View>
          ) : null}
          {played && !result && !comp.createdByMe ? (
            <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
              L’organisateur désignera l’équipe vainqueure — tes stats se mettront à jour automatiquement.
            </Txt>
          ) : null}
          {!played && !started ? (
            <View style={{ marginTop: spacing.md }}>
              <Button
                label="Se désinscrire"
                icon="close"
                variant="danger"
                disabled={registering}
                onPress={async () => {
                  if (registering) return;
                  setRegistering(true);
                  const ok = await unregisterCompetition(comp.id);
                  setRegistering(false);
                  if (ok) hapticSuccess();
                  else hapticWarning();
                  // Le bouton n'existe plus dès le jour J : un échec ici est un vrai souci
                  // réseau/serveur, « réessaie » redevient honnête.
                  showToast(ok ? 'Désinscription effectuée' : 'Action impossible — réessaie.', ok ? 'success' : 'error');
                }}
                full
              />
            </View>
          ) : !played && started ? (
            <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
              Le tournoi a commencé — la désinscription n’est plus possible. Un empêchement ? Contacte l’organisateur.
            </Txt>
          ) : null}
        </Card>
      ) : played ? null : full ? (
        // Tournoi complet : badge inactif — plus de formulaire ni de bouton estompé.
        <Card style={{ marginTop: spacing.lg, alignItems: 'center' }}>
          <Tag label="Complet" tone="coral" icon="lock-closed" />
          <Txt variant="muted" style={{ marginTop: spacing.sm, textAlign: 'center' }}>
            Toutes les places sont prises — les inscriptions sont fermées.
          </Txt>
        </Card>
      ) : !isTournamentPublic(comp) ? (
        // register_competition exige status='published' côté serveur : le formulaire n'a pas
        // sa place tant que le club n'a pas validé le tournoi (pending). Pour 'rejected', la
        // fiche propose déjà Supprimer/Recréer plus haut — rien de plus à afficher ici.
        comp.status !== 'rejected' ? (
          <Card style={{ marginTop: spacing.lg }}>
            <Txt variant="small" color={colors.textFaint}>
              Les inscriptions ouvriront une fois le tournoi validé par le club.
            </Txt>
          </Card>
        ) : null
      ) : (
        <View style={{ marginTop: spacing.lg }}>
          <Txt variant="h3">S’inscrire en équipe</Txt>
          <Txt variant="muted" style={{ marginTop: 2 }}>
            Le padel se joue à 2 : choisis ton coéquipier.
          </Txt>

          {state.friends.length > 0 ? (
            <>
              <Txt variant="label" style={{ marginTop: spacing.md }}>
                PARMI TES AMIS
              </Txt>
              <View style={styles.wrap}>
                {state.friends.map((f) => (
                  <Chip
                    key={f.id}
                    label={f.name}
                    icon={partnerId === f.id ? 'checkmark' : 'person-add'}
                    active={partnerId === f.id}
                    onPress={() => pickFriend(f.id)}
                  />
                ))}
              </View>
            </>
          ) : null}

          <Txt variant="label" style={{ marginTop: spacing.md }}>
            OU UN AUTRE NOM
          </Txt>
          <TextInput
            value={partnerName}
            onChangeText={(t) => {
              setPartnerName(t);
              setPartnerId(null);
            }}
            placeholder="Nom du coéquipier"
            placeholderTextColor={colors.textMuted}
            maxLength={40}
            accessibilityLabel="Nom du coéquipier"
            style={styles.input}
          />

          <View style={{ marginTop: spacing.lg }}>
            <Button
              label="S’inscrire en équipe"
              icon="add"
              onPress={async () => {
                if (!canRegister || registering) return;
                setRegistering(true);
                const ok = await registerCompetition(comp.id, partner);
                setRegistering(false);
                if (ok) hapticSuccess();
                else hapticWarning();
                showToast(ok ? 'Inscription enregistrée ✓' : 'Inscription impossible — réessaie.', ok ? 'success' : 'error');
              }}
              disabled={!canRegister || registering}
              full
            />
          </View>
          <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm, textAlign: 'center' }}>
            {comp.server
              ? 'Inscription enregistrée et visible par le club. Le règlement se fait au club.'
              : 'Inscription enregistrée sur cet appareil. Le règlement se fait au club.'}
          </Txt>
        </View>
      )}

      <PlayerSheet player={openPlayer} onClose={() => setOpenPlayer(null)} />
    </Screen>
  );
}

// Card « Résultats » — extraite pour pouvoir l’envelopper d’un PopIn quand mine?.result === 'win'
// (le moment le plus fort du produit : victoire d’un tournoi OFFICIEL) sans dupliquer le JSX.
function ResultCard({ result, mine, official }: { result: CompResult; mine?: OfficialResult; official?: boolean }) {
  return (
    <Card style={{ marginTop: spacing.lg, borderColor: colors.amber }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Ionicons name="trophy" size={24} color={colors.amber} />
        <View style={{ flex: 1 }}>
          <Txt variant="label">Vainqueur</Txt>
          <Txt variant="h3" color={colors.amberDark}>
            {result.winner}
          </Txt>
        </View>
        {mine ? (
          <Tag
            label={mine.result === 'win' ? 'Vainqueur !' : mine.result === 'last' ? 'Fin de tableau' : 'Participé'}
            tone={mine.result === 'win' ? 'amber' : mine.result === 'last' ? 'coral' : 'signature'}
            icon={mine.result === 'win' ? 'trophy' : mine.result === 'last' ? 'arrow-down' : 'checkmark'}
          />
        ) : null}
      </View>
      {/* Podium americano : 2ᵉ / 3ᵉ place si renseignées. */}
      {result.second || result.third ? (
        <View style={{ marginTop: spacing.sm, gap: 2 }}>
          {result.second ? (
            <Txt variant="small" color={colors.textMuted}>
              🥈 2ᵉ place : <Txt style={{ fontWeight: '600' }}>{result.second}</Txt>
            </Txt>
          ) : null}
          {result.third ? (
            <Txt variant="small" color={colors.textMuted}>
              🥉 3ᵉ place : <Txt style={{ fontWeight: '600' }}>{result.third}</Txt>
            </Txt>
          ) : null}
        </View>
      ) : null}
      {result.loser ? (
        <Txt variant="small" color={colors.textFaint} style={{ marginTop: 4 }}>
          Fin de tableau : {result.loser}
        </Txt>
      ) : null}
      {/* levelAfter n’existe que pour les défis locaux ; pour un tournoi serveur on annonce
          le DELTA (toujours juste) — jamais un « niveau après » potentiellement périmé. */}
      {mine?.result === 'win' && official ? (
        <Txt variant="small" color={colors.textMuted} style={{ marginTop: spacing.sm }}>
          {mine.levelAfter != null
            ? `Tournoi officiel gagné : ton niveau passe à ${mine.levelAfter.toFixed(2)} (+0.50).`
            : 'Tournoi officiel gagné : ton niveau gagne +0.50 🎉'}
        </Txt>
      ) : null}
      {mine?.result === 'last' && official ? (
        <Txt variant="small" color={colors.textMuted} style={{ marginTop: spacing.sm }}>
          {mine.levelAfter != null
            ? `Fin de tableau : ton niveau passe à ${mine.levelAfter.toFixed(2)} (−0.25).`
            : 'Fin de tableau : ton niveau perd −0.25.'}
        </Txt>
      ) : null}
    </Card>
  );
}

function Info({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.info}>
      <Ionicons name={icon} size={18} color={colors.textMuted} />
      <Txt variant="muted" style={{ width: 90 }}>
        {label}
      </Txt>
      <Txt variant="body" style={{ flex: 1, fontWeight: '600' }}>
        {value}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.purple,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.e2,
  },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  heroPill: {
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  heroPillText: { color: colors.purple },
  heroTitle: { fontSize: 26, marginTop: spacing.md },
  heroMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm },
  heroMeta: { opacity: 0.9 },
  heroOrg: { flexDirection: 'row', marginTop: spacing.md },
  chipsRow: { flexDirection: 'row', gap: spacing.sm },
  infoChip: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    ...shadows.e1,
  },
  infoChipReward: { backgroundColor: colors.purpleSoft, borderColor: colors.purpleSoft },
  info: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
  placesHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  barTrack: { height: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, marginTop: spacing.sm, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: radius.pill, backgroundColor: colors.purple },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  teamsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
  },
  teamRowSel: { backgroundColor: colors.signatureSoft, borderWidth: 1, borderColor: colors.signature },
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
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.coralSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  toast: {
    position: 'absolute',
    bottom: 28,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.signature,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
});
