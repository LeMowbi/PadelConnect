import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Linking, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { Confetti } from '@/components/Confetti';
import { PlayerSheet, type PlayerLike } from '@/components/PlayerSheet';
import { PopIn } from '@/components/PopIn';
import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { Button, Card, Divider, EmptyState, Tag, Txt } from '@/components/ui';
import { findClub } from '@/data/clubs';
import {
  americanoPodiumTeams,
  compDateLabel,
  compFill,
  entryFeeLabel,
  formatFee,
  hasEntryFee,
  isCompFinished,
  isTournamentPublic,
  seedCompetitions,
  teamCount,
  teamNameTaken,
  teamsToShow,
  type Competition,
} from '@/data/competitions';
import {
  buildRounds,
  MAX_PLAYERS,
  MIN_PLAYERS,
  normalizePlayers,
  standings,
  type AmericanoRound,
  type AmericanoScore,
  type AmericanoState,
} from '@/lib/americano';
import { confirmAsync } from '@/lib/confirm';
import { openWhatsApp } from '@/lib/contact';
import { fcfa, levelText } from '@/lib/format';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { shareCompetition } from '@/lib/share';
import { useTodayKey } from '@/lib/useTodayKey';
import { useApp, type CompResult, type OfficialResult } from '@/store/AppContext';
import { colors, gradients, radius, shadows, spacing } from '@/theme';

export default function CompetitionDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { state, registerCompetition, unregisterCompetition, closeCompetition, deleteCompetition, cancelCompetition, saveAmericano } =
    useApp();
  // Toast GLOBAL pour l'annulation : il survit au retour arrière (succès) et à la fiche qui devient
  // « introuvable » quand le tournoi quitte le miroir (déjà annulé ailleurs).
  const appToast = useToast();

  const key = Array.isArray(id) ? id[0] : id;
  const comp = [...state.myCompetitions, ...seedCompetitions].find((c) => c.id === key);

  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [partnerName, setPartnerName] = useState('');
  // Podium de clôture : null = l’organisateur n’a rien choisi lui-même → on affiche la
  // suggestion de l’americano auto-géré (82). '' = choix explicitement effacé (2ᵉ/3ᵉ place).
  const [winnerPick, setWinnerPick] = useState<string | null>(null);
  const [loserName, setLoserName] = useState(''); // équipe classée dernière (facultatif)
  const [secondPick, setSecondPick] = useState<string | null>(null); // americano : 2ᵉ place (facultatif)
  const [thirdPick, setThirdPick] = useState<string | null>(null); // americano : 3ᵉ place (facultatif)
  // Americano auto-géré (82) — état LOCAL = saisie en cours seulement (liste en composition,
  // terrains choisis, scores tapés). La source de vérité reste `comp.americano` (serveur),
  // relue à chaque rendu : un retour de fetch ne se fait jamais écraser par l’écran.
  const [playersDraft, setPlayersDraft] = useState<string[] | null>(null); // null = liste enregistrée/roster
  const [newPlayer, setNewPlayer] = useState(''); // champ d’ajout manuel d’un joueur
  const [courtsDraft, setCourtsDraft] = useState<number | null>(null); // null = terrains enregistrés
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, { a: string; b: string }>>({}); // clé « ronde#terrain »
  const [savingAm, setSavingAm] = useState(false); // anti double-tap + libellés honnêtes
  const [pickingLoser, setPickingLoser] = useState(false); // 2ᵉ étape de clôture
  const [confirmCancel, setConfirmCancel] = useState(false); // annulation d’un tournoi sans inscrit
  // Annulation d’un tournoi PUBLIÉ à venir (97) : champ motif ouvert, motif saisi, envoi en cours.
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
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

  // `today` RÉACTIF (recalé au passage de minuit / retour au premier plan) — parité avec l'accueil
  // et le tunnel de résa : `played`/`started` ne restent plus figés sur la veille au réveil de
  // l'app. Hook appelé AVANT tout `return` anticipé (règle des hooks).
  const today = useTodayKey();

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
        <EmptyState
          icon="alert-circle-outline"
          title="Tournoi introuvable"
          text="Il a peut-être été annulé par le club ou supprimé par son organisateur."
        />
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
  const played = isCompFinished(comp, today);
  // Dès le JOUR MÊME du tournoi, le serveur refuse la désinscription (53) : on ne montre plus
  // le bouton — un « réessaie » en boucle sur un refus définitif serait mensonger.
  const started = today >= comp.dateKey;
  const result = state.compResults[comp.id];
  const mine = state.officialResults.find((o) => o.compId === comp.id);
  const myTeam = registered ? `${state.account?.firstName ?? 'Toi'} & ${reg.partner}` : '';
  // Un défi AMICAL créé par un joueur se clôture ici, par son créateur. Un tournoi OFFICIEL
  // ne se clôture JAMAIS depuis cette fiche (réservé à l’Espace Club) — sinon un joueur
  // pourrait s’auto-attribuer des points de niveau. Seul un tournoi PUBLIÉ a pu se jouer : un
  // tournoi en attente ou refusé dont la date est passée garde son propre bandeau (Supprimer).
  const canClose = !!comp.createdByMe && !comp.official && played && !result && isTournamentPublic(comp);
  // Frais d’organisation PadelConnect d’un tournoi joueur validé par le club. Tant qu’ils sont dus,
  // le serveur refuse à l’organisateur la suppression du tournoi publié (73/M5) : la carte « sans
  // inscrit » n’offre donc pas un « Annuler » voué au refus.
  const orgFeeApplies = !!comp.createdByMe && comp.organizerType === 'joueur' && (comp.commission ?? 0) > 0 && comp.status === 'approved';
  const feeDue = orgFeeApplies && comp.paymentStatus !== 'paid';
  const teams = teamCount(comp, registered);
  const teamList = teamsToShow(comp, registered ? myTeam : undefined);
  // Frais d’inscription à régler → contacter l’organisateur : le club (tournoi club) ou le
  // joueur organisateur (tournoi joueur). WhatsApp, canal n°1 en Côte d’Ivoire.
  const feeContactPhone = comp.organizerType === 'club' ? hostClub?.contactPhone : comp.organizerPhone;
  const payee = feePayee(comp.organizerType);
  const contactForFee = () =>
    feeContactPhone
      ? openWhatsApp(
          feeContactPhone,
          `Bonjour, je viens de m’inscrire au tournoi « ${comp.title} » sur PadelConnect — comment régler les frais d’inscription (${entryFeeLabel(comp.fee)}) ?`,
        )
      : undefined;
  const { left, pct } = compFill(comp, teams);
  const full = left === 0 && !registered;

  // ANNULATION d’un tournoi PUBLIÉ à venir (97 — pluie, club indisponible…), le jour même compris :
  // le club hôte et l’opérateur peuvent toujours (miroir de `can_manage_club`) ; l’organisateur
  // seulement tant qu’aucune équipe n’est inscrite (sinon le serveur répond 'forbidden'). Inscrits et
  // organisateur sont prévenus par push, motif joint ; les terrains redeviennent réservables.
  const managesHost = !!comp.clubId && (state.role === 'operator' || (state.role === 'club' && state.serverManagedClubId === comp.clubId));
  const cancellable = !!comp.server && comp.status === 'approved' && !comp.closed && !result && !played;
  const showCancel = cancellable && (managesHost || !!comp.createdByMe);
  // Organisateur (non gérant) : des inscrits → c’est au club d’annuler ; frais PadelConnect dus → même
  // règle que la suppression (73/M5) : régler ou passer par PadelConnect.
  const cancelLockedByTeams = !managesHost && teams > 0;
  const cancelLockedByFee = !managesHost && feeDue;
  const doCancel = async () => {
    if (cancelling) return;
    const reason = cancelReason.trim();
    if (!reason) {
      hapticWarning();
      appToast.show('Indique un motif : il est montré aux inscrits.', { icon: 'alert-circle' });
      return;
    }
    setCancelling(true);
    const res = await cancelCompetition(comp.id, reason);
    setCancelling(false);
    if (res === 'ok') {
      hapticSuccess();
      appToast.show(
        teams > 0
          ? 'Tournoi annulé — les inscrits et l’organisateur sont prévenus.'
          : 'Tournoi annulé — ses terrains redeviennent réservables.',
      );
      router.back();
      return;
    }
    hapticWarning();
    // Un message PAR CODE : « réessaie » seulement sur un échec réseau (null).
    appToast.show(
      res === 'gone'
        ? 'Ce tournoi n’est plus publié (déjà annulé ou supprimé).'
        : res === 'played'
          ? 'Ce tournoi est terminé ou clôturé : il ne peut plus être annulé.'
          : res === 'forbidden'
            ? managesHost
              ? 'Tu n’as pas les droits pour annuler ce tournoi.'
              : 'Des équipes se sont inscrites : seul le club hôte peut maintenant annuler ce tournoi.'
            : res === 'reason'
              ? 'Indique un motif : il est montré aux inscrits.'
              : res === 'fees'
                ? 'Règle d’abord les frais PadelConnect, ou demande au club d’annuler.'
                : res === 'unsupported'
                  ? 'L’annulation en ligne arrive avec la prochaine mise à jour — contacte PadelConnect pour annuler ce tournoi.'
                  : 'Annulation impossible — vérifie ta connexion puis réessaie.',
      { icon: 'alert-circle' },
    );
    if (res === 'gone' || res === 'played' || res === 'forbidden' || res === 'fees' || res === 'unsupported') setCancelOpen(false);
  };

  const byClub = comp.organizerType === 'club';
  const partner = (partnerId ? state.friends.find((f) => f.id === partnerId)?.name : partnerName.trim()) ?? '';
  const canRegister = !full && partner.length > 0;

  const pickFriend = (fid: string) => {
    setPartnerId((cur) => (cur === fid ? null : fid));
    setPartnerName('');
  };

  // Americano : tournoi par rotation → on clôture par un PODIUM (1ʳᵉ/2ᵉ/3ᵉ) plutôt qu’un
  // unique vainqueur + dernier. La détection se fait sur le format choisi à la création.
  const isAmericano = comp.format.toLowerCase().includes('americano');

  // ── Americano auto-géré (82) ───────────────────────────────────────────────────────────
  // Source de vérité = `comp.americano` (serveur, relu à CHAQUE rendu). L’app ne fait que
  // générer les rondes (rotation PURE) et tenir le classement individuel ; la clôture
  // officielle reste `close_competition`.
  const am = comp.americano;
  const amRounds = am?.rounds ?? [];
  const amLive = amRounds.length > 0; // rondes générées → étape « en cours »
  // Liste de départ : chaque équipe inscrite « A & B » donne 2 joueurs (roster réel, éditable).
  const rosterPlayers = normalizePlayers(teamList.flatMap((t) => t.split(' & ')));
  const amPlayers = normalizePlayers(playersDraft ?? am?.players ?? rosterPlayers);
  const amCourts = courtsDraft ?? am?.courts ?? 1;
  const canGenerate = amPlayers.length >= MIN_PLAYERS && amPlayers.length <= MAX_PLAYERS;
  // Aperçu de la grille AVANT enregistrement (fonction pure : même entrée = même sortie).
  const amPreview = !amLive && canGenerate ? buildRounds(amPlayers, amCourts) : [];
  const amTable = am && amLive ? standings(am.players, amRounds, am.scores) : [];
  const amScored = (am?.scores.length ?? 0) > 0;
  // Section réservée à l’ORGANISATEUR d’un tournoi americano SERVEUR publié et non clôturé —
  // exactement le périmètre qu’accepte `save_americano_state` (pas de bouton qui échouerait).
  const canManageAmericano = !!comp.createdByMe && !!comp.server && isAmericano && isTournamentPublic(comp) && !comp.closed;

  // Podium suggéré par l’americano (traduit en noms d’ÉQUIPE) : pré-remplit la clôture tant
  // que l’organisateur n’a pas choisi lui-même. Il garde le dernier mot (tout reste modifiable).
  const amPodium = americanoPodiumTeams(comp, registered ? myTeam : undefined);
  // Une place déjà prise (vainqueur, ou 2ᵉ pour la 3ᵉ) n’est ni cochée ni envoyée : choisir comme
  // vainqueur l’équipe pré-remplie en 2ᵉ/3ᵉ ne la fait plus partir aussi sur le podium.
  const winnerName = winnerPick ?? amPodium.first ?? '';
  const secondRaw = secondPick ?? amPodium.second ?? '';
  const secondName = secondRaw !== winnerName ? secondRaw : '';
  const thirdRaw = thirdPick ?? amPodium.third ?? '';
  const thirdName = thirdRaw !== winnerName && thirdRaw !== secondName ? thirdRaw : '';

  // Enregistrement HONNÊTE de l’état americano : on attend le serveur, la section ne bascule
  // qu’au OK (le store ne met à jour son miroir que dans ce cas), sinon toast d’échec — un
  // tournoi CLÔTURÉ entre-temps a son propre message (réessayer serait vain).
  const saveAm = async (next: AmericanoState, okText: string): Promise<boolean> => {
    if (savingAm) return false;
    setSavingAm(true);
    const res = await saveAmericano(comp.id, next);
    setSavingAm(false);
    if (res === 'ok') hapticSuccess();
    else hapticWarning();
    showToast(
      res === 'ok'
        ? okText
        : res === 'gone'
          ? 'Ce tournoi vient d’être clôturé — le résultat ne peut plus changer.'
          : 'Enregistrement impossible — vérifie ta connexion et réessaie.',
      res === 'ok' ? 'success' : 'error',
    );
    return res === 'ok';
  };

  const addPlayer = () => {
    const name = newPlayer.trim();
    if (!name || amPlayers.length >= MAX_PLAYERS) return;
    setPlayersDraft(normalizePlayers([...amPlayers, name])); // doublon (même prénom) ignoré par la lib
    setNewPlayer('');
  };
  const removePlayer = (name: string) => setPlayersDraft(amPlayers.filter((p) => p !== name));

  const generateRounds = async () => {
    const rounds = buildRounds(amPlayers, amCourts);
    if (rounds.length === 0) return; // effectif hors [4,16] : le bouton est déjà désactivé
    const ok = await saveAm({ players: amPlayers, courts: amCourts, rounds, scores: [] }, 'Rondes générées ✓');
    if (!ok) return;
    // La saisie locale a rempli son rôle : on repasse sur l’état serveur (source de vérité).
    setPlayersDraft(null);
    setCourtsDraft(null);
    setScoreDrafts({});
  };

  // Score déjà ENREGISTRÉ d’un match (sert de valeur affichée tant que rien n’est tapé).
  const savedScore = (round: number, courtIndex: number): AmericanoScore | undefined =>
    am?.scores.find((s) => s.round === round && s.courtIndex === courtIndex);
  const scoreValue = (round: number, courtIndex: number, side: 'a' | 'b'): string => {
    const draft = scoreDrafts[`${round}#${courtIndex}`];
    if (draft) return draft[side];
    const saved = savedScore(round, courtIndex);
    return saved ? String(side === 'a' ? saved.scoreA : saved.scoreB) : '';
  };
  const setScoreValue = (round: number, courtIndex: number, side: 'a' | 'b', text: string) => {
    const clean = text.replace(/\D/g, '').slice(0, 2); // 0-99 : deux chiffres, rien d’autre
    const key = `${round}#${courtIndex}`;
    const saved = savedScore(round, courtIndex);
    setScoreDrafts((cur) => {
      const base = cur[key] ?? { a: saved ? String(saved.scoreA) : '', b: saved ? String(saved.scoreB) : '' };
      return { ...cur, [key]: { ...base, [side]: clean } };
    });
  };

  // Enregistre les scores TAPÉS de la ronde (les deux champs remplis) : une re-saisie REMPLACE
  // le score du match (comportement de `standings` — corriger ne double jamais les points).
  const saveRound = async (round: AmericanoRound) => {
    if (!am) return;
    const fresh: AmericanoScore[] = [];
    for (const match of round.matches) {
      const draft = scoreDrafts[`${round.round}#${match.courtIndex}`];
      if (!draft || !draft.a || !draft.b) continue;
      fresh.push({ round: round.round, courtIndex: match.courtIndex, scoreA: Number(draft.a), scoreB: Number(draft.b) });
    }
    if (fresh.length === 0) {
      hapticWarning();
      showToast('Saisis les deux scores d’au moins un match.', 'error');
      return;
    }
    const keys = new Set(fresh.map((s) => `${s.round}#${s.courtIndex}`));
    const scores = [...am.scores.filter((s) => !keys.has(`${s.round}#${s.courtIndex}`)), ...fresh];
    const ok = await saveAm({ players: am.players, courts: am.courts, rounds: am.rounds, scores }, `Ronde ${round.round} enregistrée ✓`);
    if (!ok) return;
    setScoreDrafts((cur) => {
      const next = { ...cur };
      for (const k of keys) delete next[k];
      return next;
    });
  };

  // Recommencer : on efface rondes ET scores, on GARDE la liste des joueurs (l’écran repasse
  // à l’étape « composition »). Confirmation destructive, cross-plateforme (app + web).
  const restartAmericano = async () => {
    if (!am || savingAm) return;
    const sure = await confirmAsync(
      'Recommencer l’americano ?',
      'Les rondes et les scores saisis seront effacés. La liste des joueurs est conservée.',
      { confirmLabel: 'Recommencer', destructive: true },
    );
    if (!sure) return;
    const ok = await saveAm({ players: am.players, courts: am.courts, rounds: [], scores: [] }, 'Americano réinitialisé');
    if (ok) setScoreDrafts({});
  };

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
  // Clôture americano (amical, non officiel) : vainqueur + 2ᵉ/3ᵉ place — aucun niveau en jeu.
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
            style={[styles.toast, toast.tone === 'error' && styles.toastError]}
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
            <Txt variant="label" color={colors.purpleDark} style={styles.heroPillText}>
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
          {/* Même règle que ClosePanel : la fin de tableau (−0,25) n'existe qu'à l'élimination. */}
          {comp.official
            ? isAmericano
              ? 'Tournoi officiel : le joueur qui a inscrit l’équipe vainqueure gagne +0,50 de niveau.'
              : 'Tournoi officiel : le joueur qui a inscrit l’équipe vainqueure gagne +0,50 de niveau, celui de la fin de tableau perd 0,25.'
            : 'Tournoi entre joueurs : amical — le résultat ne change pas ton niveau.'}
        </Txt>
      </LinearGradient>

      {/* Chips d’info sous le héros */}
      <View style={styles.chipsRow}>
        {comp.reward.trim() ? (
          <View style={[styles.infoChip, styles.infoChipReward]}>
            <Txt variant="label" color={colors.purpleDark}>
              Récompense
            </Txt>
            <Txt variant="h3" color={colors.purpleDark} numberOfLines={2} style={{ marginTop: 2 }}>
              {formatFee(comp.reward)}
            </Txt>
          </View>
        ) : null}
        <View style={styles.infoChip}>
          <Txt variant="label">Date</Txt>
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
              {played
                ? `La date est passée sans validation par ${comp.clubName ?? 'le club hôte'}.`
                : `En attente de validation par ${comp.clubName ?? 'le club hôte'}. Ton tournoi sera visible une fois accepté.`}
            </Txt>
          </View>
          {/* Date passée : faire valider n’a plus de sens — l’organisateur peut seulement le supprimer
              (la carte « Tournoi terminé » est réservée aux tournois publiés). */}
          {comp.createdByMe && played ? (
            <View style={{ marginTop: spacing.sm }}>
              <Button
                label="Supprimer ce tournoi"
                icon="trash-outline"
                variant="danger"
                onPress={() => void removeCompetition()}
                disabled={deleting}
                full
              />
            </View>
          ) : comp.createdByMe && hostClub?.contactPhone ? (
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
      {orgFeeApplies ? (
        !feeDue ? (
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
                Frais à régler : {fcfa(comp.commission ?? 0)}
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
        <Info icon="cash-outline" label="Inscription" value={entryFeeLabel(comp.fee)} />
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
              {/* Clé `libellé#rang` : deux équipes homonymes ne partagent jamais la même clé. */}
              {teamList.map((t, i) => (
                <Pressable
                  key={`${t}#${i}`}
                  onPress={() => setOpenPlayer({ id: `team:${comp.id}:${t}#${i}`, name: t, isTeam: true })}
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

      {/* Americano auto-géré (82) — outil de l’ORGANISATEUR pendant le tournoi : composition de
          la liste, génération des rondes (rotation pure), saisie des scores, classement live.
          L’état vit côté serveur (`comp.americano`) : il suit l’organisateur d’un appareil à
          l’autre et alimente le podium de la clôture. */}
      {canManageAmericano ? (
        <Card style={{ marginTop: spacing.lg, borderColor: colors.signature }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Ionicons name="shuffle" size={18} color={colors.signature} />
            <Txt variant="h3" style={{ flex: 1 }}>
              Gérer l’americano
            </Txt>
          </View>

          {!amLive ? (
            // ── Étape 1 : composer la liste des joueurs présents + les terrains utilisés ──
            <>
              <Txt variant="small" color={colors.textMuted} style={{ marginTop: 2 }}>
                À chaque ronde les paires changent et les points sont individuels. Compose la liste des joueurs présents, choisis le nombre
                de terrains, puis génère les rondes.
              </Txt>
              <Txt variant="label" style={{ marginTop: spacing.md }}>
                JOUEURS · {amPlayers.length}
              </Txt>
              {amPlayers.length > 0 ? (
                <View style={styles.wrap}>
                  {amPlayers.map((p) => (
                    <Chip key={p} label={p} icon="close" onPress={() => removePlayer(p)} accessibilityLabel={`Retirer ${p} de la liste`} />
                  ))}
                </View>
              ) : (
                <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
                  Aucun joueur pour l’instant — ajoute-les ci-dessous.
                </Txt>
              )}
              <View style={styles.addRow}>
                <TextInput
                  value={newPlayer}
                  onChangeText={setNewPlayer}
                  onSubmitEditing={addPlayer}
                  returnKeyType="done"
                  placeholder="Prénom du joueur"
                  placeholderTextColor={colors.textMuted}
                  maxLength={20}
                  autoCapitalize="words"
                  accessibilityLabel="Prénom du joueur à ajouter"
                  style={[styles.input, styles.addInput]}
                />
                <Button
                  label="Ajouter"
                  icon="add"
                  variant="secondary"
                  onPress={addPlayer}
                  disabled={!newPlayer.trim() || amPlayers.length >= MAX_PLAYERS}
                />
              </View>
              <Txt variant="label" style={{ marginTop: spacing.md }}>
                TERRAINS UTILISÉS
              </Txt>
              <View style={styles.wrap}>
                {[1, 2, 3, 4].map((n) => (
                  <Chip
                    key={n}
                    label={n > 1 ? `${n} terrains` : '1 terrain'}
                    active={amCourts === n}
                    onPress={() => setCourtsDraft(n)}
                    accessibilityLabel={`${n} terrain${n > 1 ? 's' : ''} utilisé${n > 1 ? 's' : ''}`}
                  />
                ))}
              </View>
              <View style={{ marginTop: spacing.md }}>
                <Button
                  label={savingAm ? 'Enregistrement…' : 'Générer les rondes'}
                  icon="shuffle"
                  onPress={() => void generateRounds()}
                  disabled={!canGenerate || savingAm}
                  full
                />
              </View>
              <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
                {amPlayers.length < MIN_PLAYERS
                  ? `Il faut au moins ${MIN_PLAYERS} joueurs (un terrain = 4 joueurs).`
                  : amPlayers.length > MAX_PLAYERS
                    ? `${MAX_PLAYERS} joueurs maximum — au-delà, fais deux sessions.`
                    : `${amPreview.length} ronde${amPreview.length > 1 ? 's' : ''} · ${amPreview[0]?.matches.length ?? 0} match${
                        (amPreview[0]?.matches.length ?? 0) > 1 ? 's' : ''
                      } par ronde${amPreview[0]?.resting.length ? ` · ${amPreview[0].resting.length} au repos à tour de rôle` : ''}.`}
              </Txt>
            </>
          ) : (
            // ── Étape 2 : rondes, saisie des scores, classement live ──
            <>
              {/* Récapitulatif de la grille ENREGISTRÉE (jamais de la saisie locale). */}
              <Txt variant="small" color={colors.textMuted} style={{ marginTop: 2 }}>
                {am?.players.length ?? 0} joueurs · {amRounds.length} ronde{amRounds.length > 1 ? 's' : ''} · {am?.courts ?? 1} terrain
                {(am?.courts ?? 1) > 1 ? 's' : ''}. Saisis les scores ronde par ronde : le classement se met à jour aussitôt.
              </Txt>
              {amRounds.map((round) => (
                <View key={round.round} style={styles.roundBox}>
                  <Txt variant="label">
                    RONDE {round.round}/{amRounds.length}
                  </Txt>
                  {round.matches.map((match) => (
                    <View key={match.courtIndex} style={styles.matchBox}>
                      <Txt variant="small" color={colors.textFaint}>
                        Terrain {match.courtIndex + 1}
                      </Txt>
                      {([match.teamA, match.teamB] as const).map((team, side) => (
                        <View key={side} style={styles.sideRow}>
                          <Txt variant="body" style={{ flex: 1 }} numberOfLines={1}>
                            {team[0]} + {team[1]}
                          </Txt>
                          <TextInput
                            value={scoreValue(round.round, match.courtIndex, side === 0 ? 'a' : 'b')}
                            onChangeText={(t) => setScoreValue(round.round, match.courtIndex, side === 0 ? 'a' : 'b', t)}
                            placeholder="—"
                            placeholderTextColor={colors.textMuted}
                            keyboardType="number-pad"
                            maxLength={2}
                            accessibilityLabel={`Points de ${team[0]} et ${team[1]}, ronde ${round.round}, terrain ${match.courtIndex + 1}`}
                            style={styles.scoreInput}
                          />
                        </View>
                      ))}
                    </View>
                  ))}
                  {round.resting.length > 0 ? (
                    <Txt variant="small" color={colors.textFaint}>
                      Repos : {round.resting.join(', ')}
                    </Txt>
                  ) : null}
                  <Button
                    size="sm"
                    label={savingAm ? 'Enregistrement…' : 'Enregistrer la ronde'}
                    icon="checkmark"
                    variant="secondary"
                    onPress={() => void saveRound(round)}
                    disabled={savingAm}
                    full
                  />
                </View>
              ))}

              <Divider style={{ marginVertical: spacing.md }} />
              <Txt variant="label">CLASSEMENT</Txt>
              {amScored ? (
                <View style={{ marginTop: spacing.sm, gap: 6 }}>
                  {amTable.map((row, i) => (
                    <View key={row.player} style={styles.rankRow}>
                      <Txt variant="body" color={i === 0 ? colors.amberDark : colors.textMuted} style={styles.rankNum}>
                        {i + 1}
                      </Txt>
                      <Txt variant="body" style={{ flex: 1, fontWeight: i === 0 ? '700' : '400' }} numberOfLines={1}>
                        {row.player}
                      </Txt>
                      <Txt variant="small" color={colors.textMuted}>
                        {row.played} match{row.played > 1 ? 's' : ''}
                      </Txt>
                      <Txt variant="body" style={{ fontWeight: '700' }}>
                        {row.points} pts
                      </Txt>
                    </View>
                  ))}
                </View>
              ) : (
                <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
                  Le classement s’affiche dès le premier score enregistré.
                </Txt>
              )}
              <View style={{ marginTop: spacing.md }}>
                <Button
                  label="Recommencer"
                  icon="refresh"
                  variant="danger"
                  onPress={() => void restartAmericano()}
                  disabled={savingAm}
                  full
                />
              </View>
            </>
          )}
        </Card>
      ) : null}

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
            {feeDue ? (
              <Txt variant="small" color={colors.amberDark}>
                Règle d’abord les frais d’organisation (ci-dessus) ou contacte PadelConnect pour annuler ce tournoi.
              </Txt>
            ) : confirmCancel ? (
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
              {/* Americano auto-géré : le podium est PRÉ-REMPLI d’après le classement calculé
                  (l’organisateur reste libre de le corriger avant de clôturer). */}
              {amPodium.first ? (
                <Txt variant="small" color={colors.signature} style={{ marginTop: spacing.sm }}>
                  Pré-rempli d’après le classement de l’americano — tu peux corriger.
                </Txt>
              ) : null}
              <View style={{ marginTop: spacing.sm, gap: 6 }} accessibilityRole="radiogroup">
                {teamList.map((t, i) => {
                  const sel = winnerName === t;
                  return (
                    <Pressable
                      key={`${t}#${i}`}
                      onPress={() => setWinnerPick(t)}
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
                  .map((t, i) => {
                    const sel = secondName === t;
                    return (
                      <Pressable
                        key={`${t}#${i}`}
                        onPress={() => {
                          setSecondPick(secondName === t ? '' : t);
                          if (thirdName === t) setThirdPick('');
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
                  .map((t, i) => {
                    const sel = thirdName === t;
                    return (
                      <Pressable
                        key={`${t}#${i}`}
                        onPress={() => setThirdPick(thirdName === t ? '' : t)}
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
                Facultatif. Tu peux passer.
              </Txt>
              <View style={{ marginTop: spacing.sm, gap: 6 }} accessibilityRole="radiogroup">
                {teamList
                  .filter((t) => t !== winnerName)
                  .map((t, i) => {
                    const sel = loserName === t;
                    return (
                      <Pressable
                        key={`${t}#${i}`}
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
                Frais d’inscription : <Txt style={{ fontWeight: '600' }}>{entryFeeLabel(comp.fee)}</Txt>. Règle-les directement avec
                l’organisateur.
              </Txt>
              <View style={{ marginTop: spacing.sm }}>
                <Button
                  size="sm"
                  label={`Contacter ${payee.name} (règlement)`}
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
      ) : started ? (
        // Inscription fermée dès le jour J (`started = today >= dateKey`), miroir de la garde serveur
        // de register_competition (91) : la DÉSINSCRIPTION est refusée dès le jour J (53), une
        // inscription ce jour-là récolterait les +10 pts « officiel joué » sans pouvoir se retirer.
        <Card style={{ marginTop: spacing.lg }}>
          <Txt variant="small" color={colors.textFaint}>
            Le tournoi a commencé — les inscriptions sont fermées.
          </Txt>
        </Card>
      ) : (
        <View style={{ marginTop: spacing.lg }}>
          <Txt variant="h3">S’inscrire en équipe</Txt>
          <Txt variant="muted" style={{ marginTop: 2 }}>
            Le padel se joue à 2 : choisis ton coéquipier.
          </Txt>
          {/* Seul le compte qui inscrit est crédité (points, niveau, palmarès) : le partenaire n'est
              qu'un nom — dit avant l'inscription plutôt que découvert à la clôture (R-37). */}
          <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.xs }}>
            Seul ton compte est inscrit : ton partenaire n’apparaît que par son nom.
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
                // Deux équipes au MÊME libellé « Prénom & Partenaire » rendraient la clôture
                // inattribuable (ni niveau ni points) : on demande de préciser AVANT l'envoi.
                if (teamNameTaken(comp, `${state.account?.firstName ?? ''} & ${partner}`)) {
                  hapticWarning();
                  showToast('Une équipe porte déjà ce nom — précise le nom de ton partenaire.', 'error');
                  return;
                }
                setRegistering(true);
                const res = await registerCompetition(comp.id, partner);
                setRegistering(false);
                if (res === 'ok') hapticSuccess();
                else hapticWarning();
                // Refus DÉFINITIF (complet, plus publié, jour J) : jamais « réessaie » — le store relit
                // les tournois et la fiche bascule d’elle-même (« Complet »…).
                showToast(
                  res === 'ok'
                    ? 'Inscription enregistrée ✓'
                    : res === 'refused'
                      ? 'Ce tournoi est complet ou n’accepte plus d’inscriptions.'
                      : 'Inscription impossible — vérifie ta connexion et réessaie.',
                  res === 'ok' ? 'success' : 'error',
                );
              }}
              disabled={!canRegister || registering}
              full
            />
          </View>
          <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm, textAlign: 'center' }}>
            {comp.server ? 'Inscription enregistrée et visible par le club.' : 'Inscription enregistrée sur cet appareil.'}
            {hasEntryFee(comp.fee) ? ` Le règlement se fait ${payee.near}.` : ''}
          </Txt>
        </View>
      )}

      {/* Annulation d’un tournoi publié à venir (97) — motif OBLIGATOIRE, montré aux inscrits. */}
      {showCancel ? (
        <Card style={{ marginTop: spacing.lg, borderColor: colors.danger }}>
          <Txt variant="h3">Annuler le tournoi</Txt>
          {cancelLockedByTeams ? (
            <Txt variant="small" color={colors.textMuted} style={{ marginTop: 2 }}>
              Des équipes sont inscrites : seul {comp.clubName ?? 'le club hôte'} peut annuler ce tournoi. Contacte-le si besoin.
            </Txt>
          ) : cancelLockedByFee ? (
            <Txt variant="small" color={colors.amberDark} style={{ marginTop: 2 }}>
              Règle d’abord les frais d’organisation (ci-dessus) ou contacte PadelConnect pour annuler ce tournoi.
            </Txt>
          ) : cancelOpen ? (
            <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
              <TextInput
                value={cancelReason}
                onChangeText={setCancelReason}
                editable={!cancelling}
                placeholder="Motif (ex. terrains inondés — tournoi reporté, on vous recontacte)"
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={300}
                accessibilityLabel="Motif de l’annulation, montré aux inscrits"
                style={styles.input}
              />
              <Txt variant="small" color={colors.textFaint}>
                {teams > 0
                  ? 'Le motif est envoyé aux équipes inscrites et à l’organisateur. Le tournoi disparaît des listes et ses terrains redeviennent réservables.'
                  : 'Le tournoi disparaît des listes et ses terrains redeviennent réservables.'}
              </Txt>
              <Button
                label={cancelling ? 'Annulation…' : 'Confirmer l’annulation'}
                icon="close-circle-outline"
                variant="danger"
                onPress={() => void doCancel()}
                disabled={cancelling || !cancelReason.trim()}
                full
              />
              <Button
                label="Garder le tournoi"
                variant="secondary"
                onPress={() => {
                  setCancelOpen(false);
                  setCancelReason('');
                }}
                disabled={cancelling}
                full
              />
            </View>
          ) : (
            <View style={{ marginTop: spacing.sm }}>
              <Button
                label="Annuler ce tournoi"
                icon="close-circle-outline"
                variant="ghost"
                onPress={() => {
                  setCancelOpen(true);
                  setCancelReason('');
                }}
                full
              />
            </View>
          )}
        </Card>
      ) : null}

      <PlayerSheet player={openPlayer} onClose={() => setOpenPlayer(null)} />
    </Screen>
  );
}

// Card « Résultats » — extraite pour pouvoir l’envelopper d’un PopIn quand mine?.result === 'win'
// (le moment le plus fort du produit : victoire d’un tournoi OFFICIEL) sans dupliquer le JSX.
function ResultCard({ result, mine, official }: { result: CompResult; mine?: OfficialResult; official?: boolean }) {
  // `won` couvre aussi un tournoi AMICAL gagné (`result` reste 'played' : aucun niveau en jeu) ;
  // repli sur `result` pour un palmarès persisté avant ce champ.
  const won = !!mine && (mine.won ?? mine.result === 'win');
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
            label={won ? 'Vainqueur !' : mine.result === 'last' ? 'Fin de tableau' : 'Participé'}
            tone={won ? 'amber' : mine.result === 'last' ? 'coral' : 'signature'}
            icon={won ? 'trophy' : mine.result === 'last' ? 'arrow-down' : 'checkmark'}
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
            ? `Tournoi officiel gagné : ton niveau passe à ${levelText(mine.levelAfter, 2)} (+0,50).`
            : 'Tournoi officiel gagné : ton niveau gagne 0,50 🎉'}
        </Txt>
      ) : null}
      {mine?.result === 'last' && official ? (
        <Txt variant="small" color={colors.textMuted} style={{ marginTop: spacing.sm }}>
          {mine.levelAfter != null
            ? `Fin de tableau : ton niveau passe à ${levelText(mine.levelAfter, 2)} (−0,25).`
            : 'Fin de tableau : ton niveau perd 0,25.'}
        </Txt>
      ) : null}
    </Card>
  );
}

// À qui se règlent les frais d’inscription : le club, PadelConnect (tournoi officiel PadelConnect)
// ou le joueur organisateur — une seule règle pour le bouton de contact et le texte d’aide.
function feePayee(type: Competition['organizerType']): { name: string; near: string } {
  return type === 'club'
    ? { name: 'le club', near: 'au club' }
    : type === 'operator'
      ? { name: 'PadelConnect', near: 'auprès de PadelConnect' }
      : { name: 'l’organisateur', near: 'auprès de l’organisateur' };
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
  heroPillText: { color: colors.purpleDark },
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
  // Americano : ligne d’ajout d’un joueur, blocs ronde/match, champ de score, ligne de classement.
  addRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  addInput: { flex: 1, marginTop: 0 },
  roundBox: {
    marginTop: spacing.md,
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  matchBox: { gap: 4, padding: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.surface },
  sideRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  scoreInput: {
    width: 56,
    minHeight: 44,
    textAlign: 'center',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    color: colors.text,
    paddingHorizontal: spacing.sm,
    fontSize: 15,
  },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rankNum: { width: 24, fontWeight: '700' },
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
  toastError: { backgroundColor: colors.danger },
});
