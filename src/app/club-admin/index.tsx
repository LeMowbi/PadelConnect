import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { Screen } from '@/components/Screen';
import { BottomSheet } from '@/components/BottomSheet';
import { SegmentedControl } from '@/components/SegmentedControl';
import { useToast } from '@/components/Toast';
import { Button, Card, Divider, SectionHeader, Tag, Txt } from '@/components/ui';
import { ClosePanel } from '@/components/club-admin/ClosePanel';
import { SectionMonClub } from '@/components/club-admin/SectionMonClub';
import {
  contactBooker,
  habitueSeriesKey,
  resaDetailLabel,
  SectionReservations,
  seriesWeeksLabel,
  seriesWhenLabel,
  upcomingSeries,
} from '@/components/club-admin/SectionReservations';
import { SectionTournois } from '@/components/club-admin/SectionTournois';
import { clubsByName, findClub, manageableClubs, type Club } from '@/data/clubs';
import { canSeeClubSpace } from '@/lib/access';
import { BLOCK_REASONS, CLUB_TYPES } from '@/lib/clubConstants';
import { fetchMyManagedClubs } from '@/lib/clubsServer';
import { americanoPodiumTeams, seedCompetitions } from '@/data/competitions';
import { competitionBlockedCourts, courtsFor, hasFullDayCompetition, rangeBlocks, resolvedGridFor } from '@/lib/availability';
import { durationLabel, overlaps, slotDurationAt, toMin } from '@/lib/courtSchedule';
import { confirmAsync } from '@/lib/confirm';
import { slotTimestamp } from '@/lib/days';
import { fetchBlockedSlotNotes, RECURRING_REASON } from '@/lib/reservations';
import { usePullToRefresh } from '@/lib/usePullToRefresh';
import { useTodayKey } from '@/lib/useTodayKey';
import { isPlayed, useApp } from '@/store/AppContext';
import { colors, radius, spacing } from '@/theme';

const SECTIONS = ['Réservations', 'Mon club', 'Tournois'] as const;
// Guide de démarrage fermé (drapeau local persistant — pas une donnée serveur).
const GUIDE_SEEN_KEY = 'padelco_club_guide_seen';
// Les 4 gestes essentiels d'un gérant — un club non rodé qui les ignore crée des doublons
// (résas téléphone non bloquées) et des joueurs inquiets (résas jamais confirmées).
const GUIDE_STEPS: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
  { icon: 'time-outline', text: 'Renseigne tes créneaux et tes terrains (onglet « Mon club »)' },
  { icon: 'checkmark-circle-outline', text: 'Confirme chaque réservation reçue — le joueur est rassuré' },
  { icon: 'lock-closed-outline', text: 'Un créneau pris par téléphone/WhatsApp ? Bloque-le pour éviter les doublons' },
  { icon: 'alert-circle-outline', text: 'Un joueur absent ? Marque « pas venu » — sa fiabilité en tient compte' },
];

// Rafraîchissement automatique de l'Espace Club WEB (ordinateur de l'accueil, aucun push) : le
// planning doit refléter une résa prise dans l'app quelques minutes plus tôt.
const WEB_AUTO_REFRESH_MS = 120_000;

// « HH:MM » d'un instant — heure d'Abidjan (UTC), convention de toute l'app.
function clockLabel(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export default function ClubAdmin() {
  const {
    state,
    setManagedClub,
    switchManagedClub,
    submitClubRequest,
    closeCompetition,
    deleteCompetition,
    blockSlot,
    unblockSlot,
    unblockRecurring,
  } = useApp();
  const toast = useToast();
  const navigation = useNavigation();
  // Push GÉRANT (nouvelle réservation, annulation, demande de tournoi) d'un gérant multi-clubs :
  // `clubId` = club concerné (peut ne pas être le club ACTIF → bandeau « Basculer » plus bas) ;
  // `section=Tournois` = demande de tournoi (le bon onglet s'ouvre). Absents d'un ancien push : rien
  // ne change. `dismissedPushClubId` = push TRAITÉ (croix, ou club atteint) : le bandeau ne revient pas.
  const { clubId: pushClubId, section: pushSection } = useLocalSearchParams<{ clubId?: string; section?: string }>();
  const pushIsTournament = pushSection === 'Tournois';
  const [dismissedPushClubId, setDismissedPushClubId] = useState<string | null>(null);

  const [section, setSection] = useState<(typeof SECTIONS)[number]>(() => (pushIsTournament ? 'Tournois' : 'Réservations'));
  // Guide de démarrage : null = drapeau pas encore lu (on n'affiche rien pour éviter un flash).
  const [guideSeen, setGuideSeen] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void AsyncStorage.getItem(GUIDE_SEEN_KEY).then((v) => alive && setGuideSeen(v === '1'));
    return () => {
      alive = false;
    };
  }, []);
  const dismissGuide = () => {
    setGuideSeen(true);
    void AsyncStorage.setItem(GUIDE_SEEN_KEY, '1');
  };
  // Multi-clubs (55) : la liste de MES clubs autorisés — le sélecteur n'apparaît qu'à 2+.
  // Convention §8 : null = échec réseau → on garde la liste déjà affichée.
  // Relue aussi quand le club ACTIF change (bascule ailleurs, 2ᵉ club accordé pendant que l'écran
  // est ouvert) et à chaque rafraîchissement (`reloadMyClubs`, plus bas) : sinon le sélecteur
  // restait invisible jusqu'à la réouverture de l'Espace Club.
  const [myClubIds, setMyClubIds] = useState<string[]>([]);
  const [switching, setSwitching] = useState(false);
  const connectedManager = !!state.serverUserId && state.role === 'club';
  useEffect(() => {
    if (!connectedManager) return;
    let alive = true;
    void fetchMyManagedClubs().then((ids) => alive && ids && setMyClubIds(ids));
    return () => {
      alive = false;
    };
  }, [connectedManager, state.serverManagedClubId]);
  const reloadMyClubs = async () => {
    if (!connectedManager) return;
    const ids = await fetchMyManagedClubs();
    if (ids) setMyClubIds(ids);
  };
  // Club actif changé DANS LE DOS de cet écran (bascule sur le web, accès retiré/accordé par
  // l'opérateur) : la session relue montre un autre club — on le DIT, au lieu de laisser le gérant
  // croire à une panne (« réessaie » en boucle sur des actions refusées par le serveur). Une
  // bascule faite ICI (`selfSwitchRef`) a déjà son propre message.
  const selfSwitchRef = useRef(false);
  const prevManagedRef = useRef(state.serverManagedClubId);
  useEffect(() => {
    const prev = prevManagedRef.current;
    prevManagedRef.current = state.serverManagedClubId;
    if (selfSwitchRef.current || !prev || !state.serverManagedClubId || prev === state.serverManagedClubId) return;
    toast.show('Ton club actif a changé — écran actualisé', { icon: 'information-circle' });
  }, [state.serverManagedClubId, toast]);
  // Bascule de club ACTIF (multi-clubs, 55) : l'action du store change le club côté serveur PUIS
  // recharge la session dans une nouvelle époque (une relecture partie avant ne remet plus
  // l'ancien club). Écriture honnête : le message n'arrive qu'après le serveur.
  const switchTo = (id: string) => {
    if (switching) return;
    setSwitching(true);
    selfSwitchRef.current = true;
    void switchManagedClub(id)
      .then((ok) =>
        toast.show(
          ok
            ? `Tu gères maintenant ${findClub(id, state.customClubs, state.clubInfo)?.name ?? 'ce club'} ✓`
            : 'Changement de club impossible — vérifie ta connexion',
          ok ? undefined : { icon: 'alert-circle' },
        ),
      )
      .finally(() => {
        selfSwitchRef.current = false;
        setSwitching(false);
      });
  };

  const [closingId, setClosingId] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ dateKey: string; time: string; durationMin: number; label: string } | null>(null);
  const [blockingCourt, setBlockingCourt] = useState<string | null>(null);
  // Série d'habitué en cours d'arrêt (habitueSeriesKey : terrain|heure|jour) — garde anti double-tap.
  const [stoppingSeries, setStoppingSeries] = useState<string | null>(null);

  // Inscription d’un nouveau club (validée ensuite par l’opérateur PadelConnect).
  const [showSignup, setShowSignup] = useState(false);
  const [ncName, setNcName] = useState('');
  const [ncArea, setNcArea] = useState('');
  const [ncType, setNcType] = useState<Club['type']>('Extérieur');
  const [ncCourts, setNcCourts] = useState(2);
  const [ncPrice, setNcPrice] = useState('');
  const [ncPhone, setNcPhone] = useState('');

  const manageable = manageableClubs(state.customClubs, state.clubInfo);
  // Un compte 'club' gère UNIQUEMENT le club que le serveur lui a attribué
  // (serverManagedClubId). L’opérateur, lui, peut basculer librement.
  const isOperator = state.role === 'operator';
  const managedId = isOperator ? state.managedClubId : (state.serverManagedClubId ?? undefined);
  // `resolved` distingue « club géré vraiment chargé » d'un repli : pour un gérant d'un club
  // SERVEUR dont le fetch a échoué, on n'affiche PAS la config publique d'un club fondateur
  // arbitraire dans un formulaire éditable (trompeur) — on montre un état « indisponible » (plus bas).
  const resolvedClub = findClub(managedId, state.customClubs, state.clubInfo);
  const club = resolvedClub ?? clubsByName[0];

  const comps = [...state.myCompetitions.filter((c) => c.clubId === club.id), ...seedCompetitions.filter((c) => c.clubId === club.id)];
  const closingComp = comps.find((c) => c.id === closingId);
  // Mon équipe dans le tournoi en cours de clôture (le gérant peut y être inscrit) — sert au
  // marquage « Ton équipe » ET à traduire le podium de l’americano auto-géré en noms d’équipe.
  const closingMyTeam =
    closingComp && state.compRegistrations[closingComp.id]
      ? `${state.account?.firstName ?? 'Toi'} & ${state.compRegistrations[closingComp.id].partner}`
      : undefined;

  // Données du bottom sheet de détail créneau. useTodayKey force un re-rendu au passage de minuit
  // (retour au premier plan) → `now` (compteur « à confirmer », gardes de créneau passé) ne reste
  // pas figé sur la veille — parité avec le planning (SectionReservations).
  useTodayKey();
  const now = Date.now();
  const clubRes = state.reservations.filter((r) => r.clubId === club.id);
  // Réservations à venir en attente de confirmation → rappel visible depuis tous les onglets.
  // MÊME règle que la liste de l'onglet Réservations (!isPlayed) : une partie en cours non
  // confirmée reste confirmable — la pastille doit la compter comme la liste l'affiche.
  const pendingConfirm = clubRes.filter((r) => !r.clubConfirmed && !isPlayed(r, now)).length;
  // WEB : titre d'onglet « (N) à confirmer » — repérable même quand l'onglet est en arrière-plan.
  // Passé par les options d'écran (le titre du document suit les options de la navigation, qui
  // réécrirait un `document.title` posé à la main).
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    navigation.setOptions({ title: pendingConfirm > 0 ? `(${pendingConfirm}) à confirmer · Espace Club` : 'Espace Club' });
  }, [navigation, pendingConfirm]);
  // « Mis à jour à HH:MM » (web) : instant où le miroir des réservations a changé pour la dernière
  // fois — une relecture RÉUSSIE en livre un neuf, un échec réseau garde l'ancien (donc l'ancienne
  // heure : l'affichage ne ment pas). Mémorisation au rendu (motif « valeur du rendu précédent »).
  const [seenReservations, setSeenReservations] = useState(state.reservations);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  if (seenReservations !== state.reservations) {
    setSeenReservations(state.reservations);
    setUpdatedAt(now);
  }
  const clubBlocked = state.blockedSlots.filter((b) => b.clubId === club.id);
  // Notes privées des créneaux RÉCURRENTS (83, RLS gérant) : le miroir partagé ne porte que le
  // générique « Récurrent » — le nom du client s'incruste ici (clé dateKey|time|court). Source
  // UNIQUE (fiche détail + planning/QuickBlock de SectionReservations), rechargée quand le nombre
  // de blocages bouge — et relue EXPLICITEMENT après une série re-posée sous un autre nom (même
  // nombre de blocages : l'effet ne repartirait pas). null = échec réseau → on garde l'existant.
  // Les clés ne portent pas le club (« Terrain 1 » est commun à tous) : les notes sont ATTACHÉES à
  // leur club, et celles d'un autre club (bascule, relecture partie avant elle) ne s'affichent pas.
  // La relecture explicite passe par l'effet (`notesTick`) : une seule voie de lecture, et seule la
  // DERNIÈRE émise s'applique — une relecture de A revenue après la bascule vers B n'écrase rien.
  const [notesOf, setNotesOf] = useState<{ clubId: string; map: Record<string, string> }>({ clubId: '', map: {} });
  const [notesTick, setNotesTick] = useState(0);
  const slotNotes = notesOf.clubId === club.id ? notesOf.map : {};
  const reloadSlotNotes = () => setNotesTick((t) => t + 1);
  useEffect(() => {
    let alive = true;
    const clubId = club.id;
    void fetchBlockedSlotNotes(clubId).then((m) => {
      if (alive && m) setNotesOf({ clubId, map: m });
    });
    return () => {
      alive = false;
    };
  }, [club.id, clubBlocked.length, notesTick]);
  // Fermetures sur période + récurrentes par terrain (54) : le détail d'un créneau doit les
  // montrer — une case « Libre » avec un bouton « Bloquer » sur un créneau que le serveur
  // refuse serait un mensonge.
  const clubRanges = state.blockedRanges.filter((r) => r.clubId === club.id);
  const closedByCourt = state.clubCourtClosed[club.id] ?? {};
  // Repli sur les terrains par défaut : la fiche détail d’un créneau doit lister les terrains
  // même si le gérant n’a pas encore personnalisé sa configuration.
  const courts = courtsFor(club, state.clubCourts);
  // Grille EFFECTIVE par terrain (créneaux 1h/1h30) : la fiche détail d'un créneau lit la durée
  // RÉELLE de chaque terrain à cette heure pour raisonner en chevauchement (pas d'égalité d'heure).
  const grid = resolvedGridFor(club, {
    clubSlots: state.clubSlots,
    clubCourts: state.clubCourts,
    courtSlots: state.courtSlots,
    courtClosed: state.clubCourtClosed,
  });

  const signupReady = ncName.trim().length >= 2 && ncArea.trim().length >= 2 && Number(ncPrice) > 0;
  const [sendingSignup, setSendingSignup] = useState(false);
  const submitSignup = async () => {
    if (!signupReady || sendingSignup) return;
    setSendingSignup(true);
    // La demande part sur le SERVEUR (club_requests) — seule voie : l’opérateur la voit dans son
    // espace, et c’est l’activation (approve_club_request) qui crée le vrai club.
    const res = await submitClubRequest({
      name: ncName,
      area: ncArea,
      type: ncType,
      courts: ncCourts,
      priceFrom: Number(ncPrice),
      contactPhone: ncPhone,
    });
    setSendingSignup(false);
    if (!res.ok) {
      toast.show(res.error ?? 'Envoi impossible — réessaie', { icon: 'alert-circle' });
      return;
    }
    setShowSignup(false);
    setNcName('');
    setNcArea('');
    setNcPrice('');
    setNcPhone('');
    toast.show('Demande envoyée à PadelConnect ✅');
  };

  // Tirer-pour-rafraîchir (+ bouton web) et rafraîchissement AUTOMATIQUE web toutes les 2 min,
  // suspendu pendant les envois tenus PAR CET ÉCRAN (bascule, inscription, arrêt de série) et quand
  // une feuille est ouverte. Les écritures lancées depuis une section sont couvertes par les
  // compteurs d'écriture du store : une relecture partie AVANT elles jette sa tranche au retour —
  // `reservationsWriteRef` (confirmer, « pas venu », annulation club) et `blocksWriteRef` pour les
  // BLOCAGES (bloquer/débloquer un créneau, fermer/rouvrir une période, arrêter une série). Sans ce
  // dernier, une période fraîchement fermée pouvait disparaître de l'écran et être recréée :
  // block_range INSÈRE une ligne à chaque appel (doublon serveur). La pose d'une série d'habitué
  // (RPC directe + relecture) reste hors compteur : la reposer est sans doublon (97, « déjà bloqué »).
  const { refreshControl, webRefreshButton } = usePullToRefresh(reloadMyClubs, {
    everyMs: WEB_AUTO_REFRESH_MS,
    paused: switching || sendingSignup || !!stoppingSeries || !!selectedCell || !!closingId,
  });

  // « Arrêter la série » d'un habitué (97) : retire les créneaux « Récurrent » À VENIR de ce
  // terrain, à cette heure, CE jour de la semaine (jamais le passé). Écriture qui attend le serveur ; les notes privées
  // (nom de l'habitué) sont relues ensuite. Partagée par la fiche d'un créneau et « Habitués ».
  // Confirmation SANS chiffre : le miroir des blocages (plafonné, tous clubs) peut ne pas porter les
  // dates lointaines, alors que le serveur retire TOUTES les dates à venir — le toast final donne le
  // nombre réel renvoyé par le serveur.
  const stopSeries = (court: string, time: string, who: string, dow: number) => {
    if (stoppingSeries) return;
    void confirmAsync(
      'Arrêter la série ?',
      `Toutes les dates à venir de cette série${who ? ` (${who})` : ''} sur ${court}, ${seriesWhenLabel({ time, dow })}, redeviendront réservables. Les autres jours et les dates passées ne changent pas.`,
      { confirmLabel: 'Arrêter la série', destructive: true },
    ).then(async (ok) => {
      if (!ok) return;
      setStoppingSeries(habitueSeriesKey({ court, time, dow }));
      const n = await unblockRecurring(club.id, court, time, dow);
      setStoppingSeries(null);
      if (n === 'unsupported') {
        toast.show('Arrêt de série bientôt disponible — la base n’est pas encore à jour', { icon: 'alert-circle' });
        return;
      }
      if (n === null) {
        toast.show('Série non arrêtée — vérifie ta connexion', { icon: 'cloud-offline-outline' });
        return;
      }
      reloadSlotNotes();
      toast.show(n > 0 ? `Série arrêtée — ${n} créneau${n > 1 ? 'x rouverts' : ' rouvert'} ✓` : 'Cette série était déjà arrêtée ✓');
    });
  };

  // Push d'un club que je gère mais qui n'est pas le club ACTIF (multi-clubs) : la réservation n'est
  // pas visible ici tant que je ne bascule pas — on le dit, avec la bascule en un tap.
  const pushTarget =
    pushClubId &&
    pushClubId !== club.id &&
    pushClubId !== dismissedPushClubId &&
    (isOperator ? manageable.some((c) => c.id === pushClubId) : myClubIds.includes(pushClubId))
      ? pushClubId
      : null;
  const pushClubName = pushTarget ? (findClub(pushTarget, state.customClubs, state.clubInfo)?.name ?? 'un autre club') : '';
  // Club du push ATTEINT (bandeau « Basculer », puces « Club géré », ou déjà actif à l'ouverture) :
  // le push est traité — le bandeau ne revient plus quand le gérant repasse sur un autre club, et une
  // demande de tournoi ouvre l'onglet Tournois. Mise à jour pendant le rendu (motif « valeur du
  // rendu précédent », comme `seenReservations`), sur le club VRAIMENT chargé (jamais le repli).
  if (pushClubId && resolvedClub?.id === pushClubId && dismissedPushClubId !== pushClubId) {
    setDismissedPushClubId(pushClubId);
    if (pushIsTournament) setSection('Tournois');
  }

  const header = (
    <View style={styles.note}>
      <Ionicons name="business" size={15} color={colors.textFaint} />
      <Txt variant="small" color={colors.textFaint} style={{ flex: 1 }}>
        {club.name} — Espace Club.
      </Txt>
      {Platform.OS === 'web' && updatedAt !== null ? (
        <Txt variant="small" color={colors.textFaint}>
          Mis à jour à {clockLabel(updatedAt)}
        </Txt>
      ) : null}
    </View>
  );

  // Espace réservé aux comptes CLUB (et à l’opérateur). Un joueur normal est bloqué —
  // l’entrée n’apparaît déjà pas dans son profil, et un accès direct est refusé ici.
  if (!canSeeClubSpace(state.role)) {
    return (
      <Screen back title="Espace Club">
        <Card style={{ marginTop: spacing.md, alignItems: 'center', paddingVertical: spacing.xl }}>
          <Ionicons name="lock-closed-outline" size={28} color={colors.textFaint} />
          <Txt variant="h3" style={{ marginTop: spacing.sm }}>
            Réservé aux clubs
          </Txt>
          <Txt variant="muted" style={{ marginTop: 4, textAlign: 'center' }}>
            Cet espace est réservé aux clubs partenaires. Tu gères un club ? Inscris-le depuis ton profil.
          </Txt>
        </Card>
      </Screen>
    );
  }

  // Compte 'club' sans club rattaché (serverManagedClubId nul) : on NE retombe PAS sur
  // un club réel par défaut — on bloque proprement (sinon il éditerait le club d’un autre).
  if (!isOperator && !state.serverManagedClubId) {
    return (
      <Screen back title="Espace Club">
        <Card style={{ marginTop: spacing.md, alignItems: 'center', paddingVertical: spacing.xl }}>
          <Ionicons name="business-outline" size={28} color={colors.textFaint} />
          <Txt variant="h3" style={{ marginTop: spacing.sm }}>
            Aucun club rattaché
          </Txt>
          <Txt variant="muted" style={{ marginTop: 4, textAlign: 'center' }}>
            Ton compte n’est rattaché à aucun club pour l’instant. Contacte PadelConnect pour activer ton club.
          </Txt>
        </Card>
      </Screen>
    );
  }

  // Club géré RATTACHÉ mais pas encore chargé (club serveur + fetch échoué au démarrage) : on
  // n'affiche PAS la config d'un club fondateur arbitraire (repli clubsByName[0]) dans un
  // formulaire éditable — on montre un état « indisponible / réessaie » (tiré vers le bas rafraîchit).
  if (!isOperator && !resolvedClub) {
    return (
      <Screen back title="Espace Club" refreshControl={refreshControl} headerRight={webRefreshButton}>
        <Card style={{ marginTop: spacing.md, alignItems: 'center', paddingVertical: spacing.xl }}>
          <Ionicons name="cloud-offline-outline" size={28} color={colors.textFaint} />
          <Txt variant="h3" style={{ marginTop: spacing.sm }}>
            Club momentanément indisponible
          </Txt>
          <Txt variant="muted" style={{ marginTop: 4, textAlign: 'center' }}>
            Ton club se charge… Tire vers le bas pour réessayer si rien n’apparaît.
          </Txt>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen back title="Espace Club" subtitle="Gère ton club" refreshControl={refreshControl} headerRight={webRefreshButton}>
      {header}

      {pushTarget ? (
        <View style={styles.switchBanner}>
          <Ionicons name="swap-horizontal" size={16} color={colors.amberDark} />
          <Txt variant="small" color={colors.amberDark} style={{ flex: 1, fontWeight: '600' }}>
            {pushIsTournament ? 'Cette demande de tournoi concerne' : 'Cette notification concerne'} {pushClubName}.
          </Txt>
          <Button
            size="sm"
            label={switching ? 'Bascule…' : 'Basculer'}
            icon="swap-horizontal"
            variant="secondary"
            disabled={switching}
            accessibilityLabel={`Basculer sur ${pushClubName}`}
            onPress={() => (isOperator ? setManagedClub(pushTarget) : switchTo(pushTarget))}
          />
          <Pressable
            onPress={() => setDismissedPushClubId(pushTarget)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Masquer ce message"
          >
            <Ionicons name="close" size={18} color={colors.amberDark} />
          </Pressable>
        </View>
      ) : null}

      {/* Guide de démarrage — les 4 gestes essentiels, fermable une fois assimilé. */}
      {guideSeen === false ? (
        <Card style={{ borderColor: colors.signature, marginBottom: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Txt variant="h3" style={{ flex: 1 }}>
              Bien démarrer en 4 gestes 🎾
            </Txt>
            <Pressable onPress={dismissGuide} hitSlop={8} accessibilityRole="button" accessibilityLabel="Fermer le guide">
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </Pressable>
          </View>
          <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
            {GUIDE_STEPS.map((s, i) => (
              <View key={s.text} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
                <Txt variant="small" color={colors.signature} style={{ fontWeight: '700', width: 14 }}>
                  {i + 1}
                </Txt>
                <Ionicons name={s.icon} size={16} color={colors.signature} style={{ marginTop: 1 }} />
                <Txt variant="small" color={colors.text} style={{ flex: 1 }}>
                  {s.text}
                </Txt>
              </View>
            ))}
          </View>
          <View style={{ marginTop: spacing.md }}>
            <Button size="sm" label="C’est compris" icon="checkmark" variant="secondary" onPress={dismissGuide} full />
          </View>
        </Card>
      ) : null}

      {/* Mode HORS-LIGNE uniquement : sans session serveur, les modifs restent locales. Connecté,
          tout (config, photos, offres, coachs, confirmations) est enregistré côté serveur. */}
      {!state.serverUserId ? (
        <View style={styles.demoBanner}>
          <Ionicons name="information-circle" size={16} color={colors.signatureDark} />
          <Txt variant="small" color={colors.signatureDark} style={{ flex: 1 }}>
            Tu n’es pas connecté : tes modifications restent sur cet appareil. Connecte-toi pour qu’elles soient enregistrées et visibles
            par les joueurs.
          </Txt>
        </View>
      ) : null}

      {/* Club géré — l’opérateur peut basculer entre clubs ; un compte club voit le sien. */}
      <View style={{ marginTop: spacing.lg }}>
        <SectionHeader title="Club géré" />
        {isOperator ? (
          <View style={styles.wrap}>
            {manageable.map((c) => {
              const isPending = state.customClubs.find((x) => x.id === c.id)?.status === 'pending';
              return (
                <Chip
                  key={c.id}
                  label={isPending ? `${c.name} · en attente` : c.name}
                  active={c.id === club.id}
                  onPress={() => setManagedClub(c.id)}
                />
              );
            })}
          </View>
        ) : myClubIds.length > 1 ? (
          // Multi-clubs (55) : basculer change le club ACTIF côté serveur (le périmètre des
          // réservations/écritures suit), puis on recharge toute la session — écriture honnête.
          <View style={styles.wrap}>
            {myClubIds.map((id) => {
              const c = findClub(id, state.customClubs, state.clubInfo);
              return (
                <Chip
                  key={id}
                  label={switching && id !== club.id ? '…' : (c?.name ?? id)}
                  active={id === club.id}
                  onPress={() => {
                    if (id !== club.id) switchTo(id);
                  }}
                />
              );
            })}
          </View>
        ) : (
          <View style={styles.wrap}>
            <Chip label={club.name} active onPress={() => {}} />
          </View>
        )}

        {/* Inscription d’un nouveau club — validée par PadelConnect */}
        <Pressable
          onPress={() => setShowSignup((v) => !v)}
          style={styles.signupLink}
          accessibilityRole="button"
          accessibilityLabel="Inscrire un club qui n’est pas dans la liste"
          accessibilityState={{ expanded: showSignup }}
          hitSlop={8}
        >
          <Ionicons name={showSignup ? 'chevron-down' : 'add-circle-outline'} size={16} color={colors.signature} />
          <Txt variant="small" color={colors.signature} style={{ fontWeight: '700' }}>
            Ton club n’est pas dans la liste ? Inscris-le
          </Txt>
        </Pressable>

        {showSignup ? (
          <Card style={{ marginTop: spacing.sm, borderColor: colors.signature }}>
            <Txt variant="h3">Inscrire mon club</Txt>
            <Txt variant="small" color={colors.textMuted} style={{ marginTop: 2 }}>
              Ta demande part chez PadelConnect : dès l’activation, ton club apparaît ici et tu pourras préparer sa page.
            </Txt>
            <TextInput
              value={ncName}
              onChangeText={setNcName}
              placeholder="Nom du club"
              placeholderTextColor={colors.textMuted}
              maxLength={60}
              accessibilityLabel="Nom du club à inscrire"
              style={styles.input}
            />
            <TextInput
              value={ncArea}
              onChangeText={setNcArea}
              placeholder="Quartier / commune (ex. Cocody)"
              placeholderTextColor={colors.textMuted}
              maxLength={60}
              accessibilityLabel="Quartier ou commune du club"
              style={styles.input}
            />
            <View style={[styles.wrap, { marginTop: spacing.md }]}>
              {CLUB_TYPES.map((t) => (
                <Chip key={t} label={t} active={ncType === t} onPress={() => setNcType(t)} />
              ))}
            </View>
            <View style={[styles.wrap, { marginTop: spacing.md }]}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Chip key={n} label={`${n} terrain${n > 1 ? 's' : ''}`} active={ncCourts === n} onPress={() => setNcCourts(n)} />
              ))}
            </View>
            <TextInput
              value={ncPrice}
              onChangeText={setNcPrice}
              placeholder="Tarif de la session 1h30 (FCFA, ex. 15000)"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              maxLength={7}
              accessibilityLabel="Tarif de la session, en FCFA"
              style={styles.input}
            />
            <TextInput
              value={ncPhone}
              onChangeText={setNcPhone}
              placeholder="Téléphone du club (optionnel)"
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
              maxLength={20}
              accessibilityLabel="Téléphone du club (optionnel)"
              style={styles.input}
            />
            <View style={{ marginTop: spacing.md }}>
              <Button label="Envoyer la demande à PadelConnect" icon="paper-plane" onPress={submitSignup} disabled={!signupReady} full />
            </View>
          </Card>
        ) : null}
      </View>

      <SegmentedControl options={SECTIONS} value={section} onChange={setSection} />

      {/* Rappel visible depuis les AUTRES onglets : des réservations attendent la confirmation
          du gérant (un tap ramène à l’onglet Réservations). */}
      {section !== 'Réservations' && pendingConfirm > 0 ? (
        <Pressable
          onPress={() => setSection('Réservations')}
          style={styles.pendingConfirm}
          accessibilityRole="button"
          accessibilityLabel={`${pendingConfirm} réservation${pendingConfirm > 1 ? 's' : ''} à confirmer`}
        >
          <Ionicons name="hourglass-outline" size={14} color={colors.amberDark} />
          <Txt variant="small" color={colors.amberDark} style={{ fontWeight: '700', flex: 1 }}>
            {pendingConfirm} réservation{pendingConfirm > 1 ? 's' : ''} à confirmer
          </Txt>
          <Ionicons name="chevron-forward" size={14} color={colors.amberDark} />
        </Pressable>
      ) : null}

      {section === 'Réservations' ? (
        <SectionReservations
          key={club.id}
          club={club}
          comps={comps}
          onSelectCell={setSelectedCell}
          slotNotes={slotNotes}
          onNotesChanged={reloadSlotNotes}
          stoppingSeries={stoppingSeries}
          onStopSeries={stopSeries}
        />
      ) : null}

      {section === 'Mon club' ? <SectionMonClub key={club.id} club={club} /> : null}

      {section === 'Tournois' ? <SectionTournois key={club.id} club={club} comps={comps} onCloseComp={setClosingId} /> : null}

      {/* Détail d’un créneau (bottom sheet) — état de chaque terrain + Bloquer / Débloquer */}
      <BottomSheet
        visible={!!selectedCell}
        title={selectedCell?.label ?? ''}
        subtitle="Touche « Bloquer » pour fermer un terrain (résa hors app)."
        onClose={() => {
          setSelectedCell(null);
          setBlockingCourt(null);
        }}
      >
        {selectedCell ? (
          hasFullDayCompetition(club.id, selectedCell.dateKey, comps) ? (
            <View style={styles.banner}>
              <Ionicons name="trophy" size={16} color={colors.purple} />
              <Txt variant="small" color={colors.text} style={{ flex: 1 }}>
                Jour de tournoi — tous les terrains sont indisponibles ce jour-là.
              </Txt>
            </View>
          ) : (
            (() => {
              const cellTs = slotTimestamp(selectedCell.dateKey, selectedCell.time);
              const cellMin = toMin(selectedCell.time); // instant touché, en minutes (repli `covering`)
              const isPast = cellTs <= now;
              // Terrains retenus par un tournoi PARTIEL (certains terrains/créneaux seulement —
              // la journée entière est déjà couverte par hasFullDayCompetition ci-dessus).
              const compBlocked = competitionBlockedCourts(
                club.id,
                selectedCell.dateKey,
                selectedCell.time,
                selectedCell.durationMin,
                comps,
              );
              return courts.map((c, i) => {
                const isTournoi = compBlocked === 'all' || compBlocked.includes(c);
                // Durée du créneau OUVERT de CE terrain qui COMMENCE à cette heure (égalité d'heure ;
                // null = aucun). Les résas/blocages se détectent ensuite en CHEVAUCHEMENT d'intervalle
                // (créneaux 1h/1h30) : un 08:00·1h30 « occupe » aussi la cellule 09:00 du même terrain.
                const courtDur = slotDurationAt(grid, c, selectedCell.time);
                const cellDur = courtDur ?? selectedCell.durationMin;
                const overlapsCell = (x: { time: string; durationMin: number }) =>
                  overlaps({ t: selectedCell.time, d: cellDur as 60 | 90 }, { t: x.time, d: x.durationMin as 60 | 90 });
                const resa = clubRes.find((r) => r.dateKey === selectedCell.dateKey && r.court === c && overlapsCell(r));
                const blk = clubBlocked.find((b) => b.dateKey === selectedCell.dateKey && b.court === c && overlapsCell(b));
                const rng = clubRanges.find((r) => rangeBlocks(r, selectedCell.dateKey, selectedCell.time, c, cellDur));
                // Aucun créneau ouvert ne COMMENCE ici : repli sur le créneau de ce terrain qui COUVRE
                // la cellule (fermés compris) — un terrain aux horaires décalés n'est pas « fermé ».
                // Priorité au créneau qui CONTIENT l'instant touché (`[s, s+d)`), puis au premier qui
                // chevauche la cellule (un créneau suivant ne doit pas masquer celui en cours).
                const covering =
                  courtDur === null
                    ? ((grid[c] ?? []).find((sl) => {
                        const s = toMin(sl.t);
                        return cellMin !== null && s !== null && s <= cellMin && cellMin < s + sl.d;
                      }) ?? (grid[c] ?? []).find((sl) => overlaps({ t: selectedCell.time, d: cellDur as 60 | 90 }, sl)))
                    : undefined;
                // Fermé : créneau `x:true` OU ancienne map court_closed héritée — rien à bloquer ici.
                const closedHere =
                  courtDur === null
                    ? !!covering && (!!covering.x || (closedByCourt[c] ?? []).includes(covering.t))
                    : (closedByCourt[c] ?? []).includes(selectedCell.time);
                const isBlocking = blockingCourt === c;
                return (
                  <View key={c} style={{ marginTop: spacing.sm }}>
                    {i > 0 ? <Divider style={{ marginBottom: spacing.sm }} /> : null}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <Tag label={c} tone="neutral" />
                      {isTournoi ? (
                        <>
                          <Ionicons name="trophy" size={14} color={colors.purple} />
                          <Txt variant="small" color={colors.purpleDark} style={{ flex: 1, fontWeight: '600' }}>
                            Retenu par un tournoi
                          </Txt>
                        </>
                      ) : resa ? (
                        <>
                          <View style={{ flex: 1 }}>
                            <Txt variant="small" color={colors.text} style={{ fontWeight: '600' }} numberOfLines={1}>
                              Réservé via PadelConnect · {resa.bookedBy?.name ?? 'Joueur'}
                            </Txt>
                            {/* Durée et tarif FIGÉS à la réservation : ce que le joueur paiera. */}
                            <Txt variant="small" color={colors.textMuted} numberOfLines={1}>
                              {resaDetailLabel(resa)}
                            </Txt>
                          </View>
                          {resa.clubConfirmed ? <Tag label="Confirmée ✓" tone="green" /> : <Tag label="À confirmer" tone="amber" />}
                          {/* Contact direct depuis le planning — même message que la liste « À confirmer »
                              (on n'affirme « confirmée » que si c'est vrai). Le numéro d'un créateur de
                              match ouvert n'est pas stocké sur la résa : lu au tap (contactBooker). */}
                          <Pressable
                            onPress={() => void contactBooker(resa, club.name, toast)}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel={`Contacter ${resa.bookedBy?.name ?? 'le joueur'} sur WhatsApp`}
                          >
                            <Ionicons name="logo-whatsapp" size={18} color={colors.green} />
                          </Pressable>
                        </>
                      ) : blk ? (
                        <>
                          <Txt variant="small" color={colors.coral} style={{ flex: 1, fontWeight: '600' }} numberOfLines={1}>
                            {/* Note privée gérant (récurrent) prioritaire sur le motif public. */}
                            Bloqué · {slotNotes[`${blk.dateKey}|${blk.time}|${blk.court}`] || blk.reason}
                          </Txt>
                          <Button
                            size="sm"
                            label="Débloquer"
                            icon="lock-open"
                            variant="secondary"
                            onPress={() => {
                              // blk.time (pas selectedCell.time) : le créneau bloqué peut débuter à
                              // une autre heure et seulement CHEVAUCHER la cellule affichée.
                              void unblockSlot(club.id, selectedCell.dateKey, blk.time, c).then((ok) =>
                                toast.show(
                                  ok ? 'Créneau rouvert' : 'Impossible de rouvrir — réessaie',
                                  ok ? undefined : { icon: 'alert-circle' },
                                ),
                              );
                            }}
                          />
                        </>
                      ) : rng || closedHere ? (
                        // Pas de « Débloquer » ponctuel ici : une période se rouvre dans
                        // « Périodes fermées » (onglet Réservations), un créneau fermé dans
                        // « Horaires d’ouverture » (onglet Mon club — titre présent dans les deux modes).
                        <Txt variant="small" color={colors.coral} style={{ flex: 1, fontWeight: '600' }} numberOfLines={2}>
                          {rng
                            ? 'Fermé sur période — rouvrable dans « Périodes fermées »'
                            : 'Fermé sur ce terrain — voir « Horaires d’ouverture » (Mon club)'}
                        </Txt>
                      ) : courtDur === null ? (
                        // Pas de « Bloquer » ici : la fiche est intitulée par l'heure touchée, bloquer
                        // le créneau couvrant (autre heure, autre durée) se fait depuis SA case.
                        <Txt variant="small" color={colors.textMuted} style={{ flex: 1, fontWeight: '600' }} numberOfLines={2}>
                          {covering
                            ? `Créneau ${covering.t} · ${durationLabel(covering.d)} — touche sa case dans le planning`
                            : 'Pas de créneau à cette heure sur ce terrain'}
                        </Txt>
                      ) : (
                        <>
                          <Txt variant="small" color={colors.green} style={{ flex: 1, fontWeight: '600' }}>
                            Libre
                          </Txt>
                          {!isPast ? (
                            <Button
                              size="sm"
                              label="Bloquer"
                              icon="lock-closed"
                              variant="ghost"
                              onPress={() => setBlockingCourt(isBlocking ? null : c)}
                            />
                          ) : (
                            <Txt variant="small" color={colors.textFaint}>
                              passé
                            </Txt>
                          )}
                        </>
                      )}
                    </View>
                    {isBlocking && !isTournoi && !resa && !blk && !isPast ? (
                      <View style={[styles.wrap, { marginTop: spacing.sm }]}>
                        {BLOCK_REASONS.map((reason) => (
                          <Chip
                            key={reason}
                            label={reason}
                            onPress={() => {
                              setBlockingCourt(null);
                              void blockSlot(
                                {
                                  clubId: club.id,
                                  dateKey: selectedCell.dateKey,
                                  time: selectedCell.time,
                                  court: c,
                                  reason,
                                  // durée RÉELLE du créneau de CE terrain (aligne le miroir local
                                  // sur ce que block_slot re-dérive côté serveur).
                                  durationMin: cellDur,
                                },
                                cellTs,
                              ).then((st) =>
                                // 'taken' : un joueur vient de le prendre — le store a relu le miroir,
                                // la fiche montre déjà sa réservation (cause dite, jamais « réessaie »).
                                toast.show(
                                  st === 'ok'
                                    ? 'Créneau bloqué'
                                    : st === 'taken'
                                      ? 'Ce créneau vient d’être réservé par un joueur'
                                      : 'Impossible de bloquer ce créneau',
                                  st === 'ok' ? undefined : { icon: 'alert-circle' },
                                ),
                              );
                            }}
                          />
                        ))}
                      </View>
                    ) : null}
                    {/* Case d'une série d'HABITUÉ : l'arrêter d'ici (toutes ses dates À VENIR). */}
                    {!isTournoi && !resa && blk?.reason === RECURRING_REASON
                      ? (() => {
                          const series = upcomingSeries(clubBlocked, now, state.blockedSlotsCoveredUntil).find(
                            (s) => s.court === c && s.time === blk.time && s.dateKeys.includes(blk.dateKey),
                          );
                          if (!series) return null;
                          const busy = stoppingSeries === habitueSeriesKey(series);
                          return (
                            <View style={{ marginTop: spacing.sm, alignItems: 'flex-start' }}>
                              <Button
                                size="sm"
                                label={busy ? 'Arrêt…' : `Arrêter la série (${seriesWeeksLabel(series)})`}
                                icon="stop-circle-outline"
                                variant="ghost"
                                disabled={!!stoppingSeries}
                                onPress={() =>
                                  stopSeries(c, blk.time, slotNotes[`${series.dateKeys[0]}|${blk.time}|${c}`] ?? '', series.dow)
                                }
                              />
                            </View>
                          );
                        })()
                      : null}
                  </View>
                );
              });
            })()
          )
        ) : null}
        <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.md }}>
          Un créneau bloqué n’est jamais facturé ni compté — c’est une simple indisponibilité.
        </Txt>
      </BottomSheet>

      {/* Clôture d’un tournoi (bottom sheet) — désignation du vainqueur par l’organisateur */}
      <BottomSheet visible={!!closingComp} title="Clôturer le tournoi" subtitle={closingComp?.title} onClose={() => setClosingId(null)}>
        {closingComp ? (
          <ClosePanel
            comp={closingComp}
            myTeam={closingMyTeam}
            // Americano auto-géré (82) : podium PRÉ-SÉLECTIONNÉ d’après le classement calculé
            // par l’app (vide tant qu’aucun score n’a été saisi) — modifiable avant de clôturer.
            initialPodium={americanoPodiumTeams(closingComp, closingMyTeam)}
            onClose={(winner, isMe, loser, loserIsMe, podium) =>
              // Promesse RENDUE au panneau : sur un échec (sheet laissée ouverte), il dégèle son
              // bouton « Clôture… » pour permettre le réessai annoncé par le toast.
              closeCompetition(closingComp, winner, isMe, loser, loserIsMe, podium).then((ok) => {
                toast.show(ok ? 'Tournoi clôturé' : 'Clôture impossible — réessaie.', ok ? undefined : { icon: 'alert-circle' });
                if (ok) setClosingId(null);
                return ok;
              })
            }
            onCancel={() => setClosingId(null)}
            onDelete={
              closingComp.createdByMe
                ? () =>
                    // Écriture honnête : on attend le serveur avant de fermer la feuille. Promesse
                    // RENDUE au panneau (comme onClose) : il ne dégèle son bouton qu'en cas d'échec.
                    deleteCompetition(closingComp.id).then((ok) => {
                      toast.show(ok ? 'Tournoi annulé' : 'Annulation impossible — réessaie.', ok ? undefined : { icon: 'alert-circle' });
                      if (ok) setClosingId(null);
                      return ok;
                    })
                : undefined
            }
          />
        ) : null}
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  demoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.greenSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.purpleSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  switchBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.amberSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  signupLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md, paddingVertical: spacing.xs },
  pendingConfirm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.amberSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    marginTop: spacing.sm,
    flex: 1,
  },
});
