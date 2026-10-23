import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { BarChart } from '@/components/BarChart';
import { CalendarPicker } from '@/components/CalendarPicker';
import { useToast } from '@/components/Toast';
import { Button, Card, Divider, EmptyState, IconCircle, SectionHeader, StatTile, Tag, Txt } from '@/components/ui';
import { LegendDot } from '@/components/club-admin/LegendDot';
import { QuickBlock, type CourtStatus } from '@/components/club-admin/QuickBlock';
import { BlockRangeForm } from '@/components/club-admin/BlockRangeForm';
import { ClubCancelForm } from '@/components/club-admin/ClubCancelForm';
import { RecurringForm } from '@/components/club-admin/RecurringForm';
import { type Club } from '@/data/clubs';
import {
  competitionBlockedCourts,
  courtsFor,
  hasFullDayCompetition,
  rangeBlocks,
  resolvedGridFor,
  type ScheduleCtx,
} from '@/lib/availability';
import { durationLabel, overlaps, toMin, type CourtSlot } from '@/lib/courtSchedule';
import { DAY_MS, HOUR_MS, addWeeks, dateKeyLabel, dowOfKey, nextDays, slotTimestamp, weekKeyOf, weekLabel } from '@/lib/days';
import { fcfa } from '@/lib/format';
import { openWhatsApp } from '@/lib/contact';
import { confirmAsync } from '@/lib/confirm';
import { hapticLight, hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useTodayKey } from '@/lib/useTodayKey';
import { clubUsePass, fetchClubPasses, fetchPassUses } from '@/lib/passes';
import {
  blockRecurringRows,
  clubReservationPhone,
  fetchCancelledReservations,
  fetchClubBlockedReasons,
  fetchNoShowReservations,
  fetchReliability,
  mirrorPartialWeek,
  purgeOldBlockedRanges,
  RECURRING_REASON,
  type Reliability,
} from '@/lib/reservations';
import { isPlayed, useApp, type BlockedSlot, type Reservation } from '@/store/AppContext';
import { colors, radius, shadows, spacing } from '@/theme';

type SelectedCell = { dateKey: string; time: string; durationMin: number; label: string };

const DOW_SHORT = ['DIM', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM'];

// Horizon du planning GÉRANT (D1, décision porteur) : un client qui appelle pour « samedi dans
// 12 jours » se bloque au même endroit que d'habitude — jusqu'à 60 jours après aujourd'hui.
// Les 7 premiers jours restent en pastilles ; au-delà, « Autre date » ou les flèches ‹ ›.
// L'horizon JOUEUR (tunnel de réservation) reste, lui, à 7 jours.
const PLANNING_HORIZON_DAYS = 60;

// « Terrain 1 · 1h30 · Tarif terrain 25 000 FCFA » : durée et prix FIGÉS à la réservation (ce que
// le joueur paiera au comptoir) — le tarif est masqué s'il est absent (0).
export function resaDetailLabel(r: Reservation): string {
  return `${r.court} · ${durationLabel(r.durationMin)}${r.price > 0 ? ` · Tarif terrain ${fcfa(r.price)}` : ''}`;
}

// Message WhatsApp au réservant — n'affirme « confirmée » QUE si elle l'est vraiment côté serveur
// (r.clubConfirmed), sinon on informe sans mentir au joueur. Porte la durée et le tarif figés.
function resaWhatsAppText(r: Reservation, clubName: string): string {
  const hello = r.bookedBy?.name ? `Bonjour ${r.bookedBy.name}` : 'Bonjour';
  const what = `votre réservation du ${dateKeyLabel(r.dateKey)} à ${r.time} (${resaDetailLabel(r)}) à ${clubName}`;
  return r.clubConfirmed
    ? `${hello}, ${what} est bien confirmée ✅`
    : `${hello}, ${what} est bien reçue, je reviens vers vous pour la confirmer.`;
}

// Ouvre WhatsApp vers le réservant. Le numéro d'un créateur de match ouvert n'est PAS stocké sur la
// résa (51) : il est lu dans son profil AU TAP (club_reservation_phone, 96) et jamais mis en miroir.
export async function contactBooker(r: Reservation, clubName: string, toast: ReturnType<typeof useToast>): Promise<void> {
  const phone = r.bookedBy?.phone || (await clubReservationPhone(r.id));
  if (phone === 'unsupported') {
    // Serveur d'avant la 96 : ni la connexion ni le joueur n'y sont pour rien.
    toast.show('Contact du créateur d’un match ouvert bientôt disponible.', { icon: 'information-circle' });
    return;
  }
  if (!phone) {
    toast.show('Numéro du joueur indisponible — vérifie ta connexion, ou il n’a pas renseigné de numéro', {
      icon: 'alert-circle',
    });
    return;
  }
  openWhatsApp(phone, resaWhatsAppText(r, clubName));
}

export type HabitueSeries = {
  court: string;
  time: string;
  // Jour de la semaine de la série (0 = dimanche … 6 = samedi, UTC — même convention que
  // `extract(dow …)` côté SQL) : deux habitués au même terrain et à la même heure, des jours
  // différents (mardi Ali, jeudi Bob), sont DEUX séries distinctes.
  dow: number;
  dateKeys: string[];
  // Miroir tronqué (state.blockedSlotsCoveredUntil) et la série atteint sa limite : d'autres dates
  // peuvent exister au-delà de la dernière connue → « au moins N », jamais un compte ferme.
  maybeMore: boolean;
};

// « 14 semaines à venir » / « au moins 14 semaines à venir » (miroir tronqué) — libellé partagé par
// la liste « Habitués » et la fiche d'un créneau : jamais un chiffre plus petit que la réalité
// présenté comme exact.
export function seriesWeeksLabel(s: HabitueSeries): string {
  const n = s.dateKeys.length;
  return `${s.maybeMore ? 'au moins ' : ''}${n} semaine${n > 1 ? 's' : ''} à venir`;
}

const DOW_LONG = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

// Identifiant d'une série d'habitué : terrain + heure + JOUR DE LA SEMAINE — la clé même
// d'unblock_recurring (97). Sert aussi de marqueur « arrêt en cours » (`stoppingSeries`).
export function habitueSeriesKey(s: Pick<HabitueSeries, 'court' | 'time' | 'dow'>): string {
  return `${s.court}|${s.time}|${s.dow}`;
}

// « les mardis à 18:00 » — dit QUELLE série on montre ou on arrête.
export function seriesWhenLabel(s: Pick<HabitueSeries, 'time' | 'dow'>): string {
  return `les ${DOW_LONG[s.dow]}s à ${s.time}`;
}

// Séries d'HABITUÉS (créneaux « Récurrent ») encore À VENIR, regroupées par terrain + heure + jour
// de la semaine (habitueSeriesKey). Dates triées (la première porte la note privée affichée).
// `coveredUntil` (state.blockedSlotsCoveredUntil) : jour de COUPURE du miroir tronqué — lui-même
// possiblement partiel (le fetch ne trie que par jour). Une série dont la semaine SUIVANT sa
// dernière date tombe ce jour-là ou après peut continuer hors du miroir → `maybeMore`.
export function upcomingSeries(blocked: BlockedSlot[], now: number, coveredUntil: string | null = null): HabitueSeries[] {
  const byKey = new Map<string, { court: string; time: string; dow: number; dateKeys: string[] }>();
  for (const b of blocked) {
    if (b.reason !== RECURRING_REASON || slotTimestamp(b.dateKey, b.time) <= now) continue;
    const dow = dowOfKey(b.dateKey);
    const k = habitueSeriesKey({ court: b.court, time: b.time, dow });
    let s = byKey.get(k);
    if (!s) {
      s = { court: b.court, time: b.time, dow, dateKeys: [] };
      byKey.set(k, s);
    }
    s.dateKeys.push(b.dateKey);
  }
  // Ordre de lecture : terrain, heure, puis jour de la semaine (lundi d'abord).
  return [...byKey.values()]
    .map((s) => {
      const dateKeys = s.dateKeys.sort();
      const maybeMore = coveredUntil !== null && addWeeks(dateKeys[dateKeys.length - 1], 1) >= coveredUntil;
      return { ...s, dateKeys, maybeMore };
    })
    .sort((a, b) => a.court.localeCompare(b.court) || a.time.localeCompare(b.time) || ((a.dow + 6) % 7) - ((b.dow + 6) % 7));
}

export function SectionReservations({
  club,
  comps,
  onSelectCell,
  slotNotes,
  onNotesChanged,
  stoppingSeries,
  onStopSeries,
}: {
  club: Club;
  comps: import('@/data/competitions').Competition[];
  onSelectCell: (cell: SelectedCell) => void;
  // Notes privées des créneaux RÉCURRENTS (83) — source UNIQUE tenue par le parent (la fiche
  // détail du planning les lit aussi) ; `onNotesChanged` la relit après une série posée.
  slotNotes: Record<string, string>;
  onNotesChanged: () => void;
  // « Arrêter la série » d'un habitué — action tenue par le parent (partagée avec la fiche d'un
  // créneau) ; `stoppingSeries` = série en cours d'arrêt (habitueSeriesKey) ou null.
  stoppingSeries: string | null;
  onStopSeries: (court: string, time: string, who: string, dow: number) => void;
}) {
  const {
    state,
    blockSlot,
    unblockSlot,
    blockRange,
    unblockRange,
    confirmReservationByClub,
    markNoShow,
    unmarkNoShow,
    clubCancelReservation,
    refreshSession,
  } = useApp();
  const toast = useToast();
  // Section encore affichée ? Elle est remontée (clé = club) quand le club ACTIF change : une
  // relecture qui révèle un autre club démonte CETTE instance — le parent l'annonce alors lui-même.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const [planDayKey, setPlanDayKey] = useState<string | null>(null);
  // Calendrier « Autre date » du planning du jour (replié par défaut).
  const [showPlanCalendar, setShowPlanCalendar] = useState(false);
  // Résa en cours d'annulation par le club (chevauchement hors app) : id ouvert dans un mini-form.
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [showRangeForm, setShowRangeForm] = useState(false);
  const [showRecurringForm, setShowRecurringForm] = useState(false);
  // Garde anti double-tap du bouton « Rouvrir » d’une période (id en cours, ou null).
  const [unblockingRangeId, setUnblockingRangeId] = useState<string | null>(null);

  // Purge best-effort des fermetures sur période entièrement passées, une fois au montage de
  // la section (même motif que la purge des signalements résolus côté opérateur) — fonction
  // déjà fire-and-forget (void supabase.rpc(...) en interne), pas de setState synchrone ici.
  useEffect(() => {
    purgeOldBlockedRanges();
  }, []);
  // Motifs des périodes fermées : réservés au gérant (RPC 54) — le miroir partagé n'en porte
  // plus (les joueurs ne téléchargent plus ce texte libre). null = échec réseau → libellés neutres.
  const [rangeReasons, setRangeReasons] = useState<Record<string, string>>({});
  const rangeCount = state.blockedRanges.filter((r) => r.clubId === club.id).length;
  useEffect(() => {
    let alive = true;
    void fetchClubBlockedReasons(club.id).then((m) => {
      if (alive && m) setRangeReasons(m);
    });
    return () => {
      alive = false;
    };
  }, [club.id, rangeCount]);
  // Historique paginé par SEMAINES : un club actif accumule vite des centaines de résas —
  // tout rendre d'un coup gèle l'ouverture de l'onglet (même esprit que PAST_PREVIEW joueur).
  const [weeksShown, setWeeksShown] = useState(4);
  // « Réservations à venir » paginé pareil (même motif) : un ScrollView non virtualisé qui
  // rend des centaines de cartes d'un coup fige l'ouverture de l'onglet.
  const [upcomingShown, setUpcomingShown] = useState(15);

  // Annulations récentes du club (serveur) : un joueur a annulé → le créneau a été remis en vente
  // à ce moment-là. On garde la trace (status='cancelled') pour prévenir le club (cf. fonction serveur 09).
  const [cancelled, setCancelled] = useState<Reservation[]>([]);
  // Absences (no-show) marquées par le club : trace conservée (status='no_show').
  const [noShows, setNoShows] = useState<Reservation[]>([]);
  // Échec réseau → null : on GARDE les listes affichées (on n’écrase jamais avec du vide).
  // On EXCLUT les annulations PAR LE CLUB (club_cancelled, 75) de cette liste : ce ne sont pas des
  // annulations JOUEUR et le créneau n'est PAS « de nouveau libre » (il est bloqué car occupé hors
  // app). Les afficher ici avec le texte « annulé par le joueur / libre » serait faux.
  const reloadTraces = () => {
    void fetchCancelledReservations().then((rows) => rows && setCancelled(rows.filter((r) => r.clubId === club.id && !r.cancelledByClub)));
    void fetchNoShowReservations().then((rows) => rows && setNoShows(rows.filter((r) => r.clubId === club.id)));
  };
  useEffect(() => {
    let alive = true;
    void fetchCancelledReservations().then(
      (rows) => alive && rows && setCancelled(rows.filter((r) => r.clubId === club.id && !r.cancelledByClub)),
    );
    void fetchNoShowReservations().then((rows) => alive && rows && setNoShows(rows.filter((r) => r.clubId === club.id)));
    return () => {
      alive = false;
    };
  }, [club.id]);

  // `todayKey` recale le planning après minuit (retour au premier plan) — parité avec
  // AgendaEditor/coach-admin. Le re-rendu qu'il déclenche rafraîchit aussi `now` (Date.now()).
  const todayKey = useTodayKey();
  const now = Date.now();
  const clubRes = state.reservations.filter((r) => r.clubId === club.id);

  // Fiabilité des joueurs (annulations + absences) pour tous ceux présents dans ce club —
  // un joueur peu fiable devient repérable. Rechargé quand la liste des joueurs change.
  const [reliability, setReliability] = useState<Record<string, Reliability>>({});
  const playerIds = [...new Set([...clubRes, ...cancelled, ...noShows].map((r) => r.userId).filter(Boolean))];
  const playerIdsKey = playerIds.slice().sort().join(',');
  useEffect(() => {
    if (!playerIdsKey) return;
    let alive = true;
    // null = échec réseau → on conserve la fiabilité déjà affichée.
    void fetchReliability(playerIdsKey.split(',')).then((rel) => alive && rel && setReliability(rel));
    return () => {
      alive = false;
    };
  }, [playerIdsKey]);

  // Badge d’alerte sous le nom d’un joueur peu fiable (≥1 annulation ou absence). Depuis la 98
  // (décision n° 18), `cancelled` ne compte plus que les annulations faites à MOINS DE 24 H du match.
  // Ce sens n'est garanti QUE sur un serveur à la 98 : son marqueur est la préférence `newsPush`
  // (colonne `profiles.news_push` de la même migration, relue en session — null = serveur d'avant
  // la 98, ou pas encore lue). Sans lui, `cancelled` compte TOUTES les annulations des 14 derniers
  // jours (même faites des jours à l'avance, que la règle des 5 h autorise) → libellé NEUTRE, jamais
  // « tardive » sur un joueur qui a respecté la règle.
  const lateCancelSemantics = state.newsPush !== null;
  const reliabilityNote = (userId?: string) => {
    const rel = userId ? reliability[userId] : undefined;
    if (!rel || (rel.cancelled === 0 && rel.noShow === 0)) return null;
    const parts: string[] = [];
    if (rel.cancelled > 0)
      parts.push(
        lateCancelSemantics
          ? `${rel.cancelled} annulation${rel.cancelled > 1 ? 's tardives' : ' tardive'} (< 24 h)`
          : `${rel.cancelled} annulation${rel.cancelled > 1 ? 's' : ''} (14 j)`,
      );
    if (rel.noShow > 0) parts.push(`${rel.noShow} absence${rel.noShow > 1 ? 's' : ''}`);
    return (
      <View style={styles.relNote}>
        <Ionicons name="warning-outline" size={12} color={colors.coral} />
        <Txt variant="small" color={colors.coral} style={{ fontSize: 11 }}>
          {parts.join(' · ')}
        </Txt>
      </View>
    );
  };

  // ── Carnets de séances (17) ───────────────────────────────────────────────────
  // `passBalance` = séances restantes par joueur dans CE club (somme de ses carnets) : le bouton
  // « Décompter du carnet » n'apparaît que si le joueur en a. `passUsed` = résas déjà décomptées
  // (badge « Décomptée ✓ »). Convention §8 : null = échec réseau → on garde ce qui est affiché.
  const [passBalance, setPassBalance] = useState<Record<string, number>>({});
  const [passUsed, setPassUsed] = useState<Set<string>>(() => new Set());
  const [usingPassId, setUsingPassId] = useState<string | null>(null); // garde anti double-tap
  useEffect(() => {
    let alive = true;
    const load = () =>
      void fetchClubPasses(club.id).then((rows) => {
        if (!alive || !rows) return;
        const byUser: Record<string, number> = {};
        for (const p of rows) byUser[p.userId] = (byUser[p.userId] ?? 0) + p.remaining;
        setPassBalance(byUser);
      });
    load();
    // Retour au premier plan : le solde SERVEUR a pu bouger dans le dos du miroir local — le
    // trigger 85 REND une séance quand une résa décomptée est annulée (joueur ou club). Sans ce
    // rechargement (parité ClubPassCard joueur), le bouton « Décompter » restait masqué à tort
    // et le carnet affichait « Épuisé » alors qu'une séance a été remboursée.
    const sub = AppState.addEventListener('change', (st) => st === 'active' && load());
    return () => {
      alive = false;
      sub.remove();
    };
  }, [club.id]);
  // Re-sync CIBLÉ après une annulation club traitée ICI même (le trigger 85 vient peut-être de
  // rembourser une séance) : on recharge le solde sans attendre un aller-retour premier plan.
  const reloadPassBalance = () =>
    void fetchClubPasses(club.id).then((rows) => {
      if (!rows) return;
      const byUser: Record<string, number> = {};
      for (const p of rows) byUser[p.userId] = (byUser[p.userId] ?? 0) + p.remaining;
      setPassBalance(byUser);
    });

  // Un tap = une séance décomptée (idempotent côté serveur : un double-tap rend 'already').
  // Messages HONNÊTES par motif — « plus de solde » et « déjà décomptée » ne sont pas des pannes.
  const onUsePass = (r: Reservation) => {
    if (usingPassId) return;
    setUsingPassId(r.id);
    void clubUsePass(r.id).then((res) => {
      setUsingPassId(null);
      if (res === 'ok' || res === 'already') {
        // Le badge s'affiche dans les deux cas : la séance EST décomptée sur cette réservation.
        setPassUsed((cur) => new Set(cur).add(r.id));
      }
      if (res === 'ok') {
        hapticSuccess();
        toast.show('Séance décomptée du carnet ✓');
        // Miroir local du solde : la ligne du joueur suit sans attendre un rechargement complet.
        if (r.userId) setPassBalance((cur) => ({ ...cur, [r.userId as string]: Math.max(0, (cur[r.userId as string] ?? 1) - 1) }));
        return;
      }
      hapticWarning();
      if (res === 'already') toast.show('Déjà décomptée', { icon: 'information-circle' });
      else if (res === 'none') toast.show('Ce joueur n’a plus de solde dans ton club', { icon: 'alert-circle' });
      else if (res === 'forbidden') toast.show('Action réservée au gérant du club', { icon: 'alert-circle' });
      else if (res === 'gone') toast.show('Réservation introuvable ou déjà annulée', { icon: 'alert-circle' });
      else toast.show('Action impossible — vérifie ta connexion', { icon: 'cloud-offline-outline' });
    });
  };

  // Le club marque une absence : créneau libéré + absence comptée (même après l’appel tardif).
  // Confirmation obligatoire — l’absence pénalise la fiabilité du joueur, un tap par erreur
  // aurait des conséquences injustes.
  const onMarkNoShow = (r: Reservation) => {
    const who = r.bookedBy?.name ? ` de ${r.bookedBy.name}` : '';
    // confirmAsync : cross-plateforme (Alert.alert est un no-op sur le web = Espace Club navigateur).
    void confirmAsync(
      'Marquer une absence ?',
      `Confirmes-tu que ce joueur n’est pas venu ? Le créneau${who} sera libéré et l’absence comptée dans sa fiabilité.`,
      { confirmLabel: 'Confirmer l’absence', destructive: true },
    ).then((ok) => {
      if (!ok) return;
      void markNoShow(r.id).then((st) => {
        if (st === 'ok') {
          hapticSuccess();
          toast.show('Absence enregistrée');
          reloadTraces();
        } else if (st === 'played') {
          // Refus LÉGITIME et définitif (85 C6) : inutile de retenter → message dédié.
          hapticWarning();
          toast.show('Ce match a déjà été joué et noté — impossible de le marquer « pas venu ».', { icon: 'alert-circle' });
        } else if (st === 'forbidden') {
          hapticWarning();
          toast.show('Tu n’as pas les droits sur cette réservation.', { icon: 'alert-circle' });
        } else if (st === 'gone') {
          hapticWarning();
          toast.show('Cette réservation n’est plus dans un état modifiable.', { icon: 'alert-circle' });
        } else {
          // 'error' (échec réseau/serveur) : là, réessayer a du sens.
          hapticWarning();
          toast.show('Connexion impossible — réessaie', { icon: 'cloud-offline-outline' });
        }
      });
    });
  };

  // Absence marquée par ERREUR : le gérant la retire (le joueur était bien là). Le serveur (87)
  // repasse la résa en 'booked' et l’absence quitte la fiabilité du joueur ; le refus 'taken'
  // (créneau repris entre-temps) est DÉFINITIF → message dédié, jamais « réessaie ».
  const [unmarkingId, setUnmarkingId] = useState<string | null>(null); // garde anti double-tap
  const onUnmarkNoShow = (r: Reservation) => {
    if (unmarkingId) return;
    void confirmAsync(
      'Annuler l’absence ?',
      'Ce joueur était bien présent ? La réservation sera rétablie et l’absence retirée de sa fiabilité.',
      // Pas « Annuler l'absence » comme libellé de confirmation : le bouton d'à côté est « Annuler »
      // (renoncer) — deux « Annuler » côte à côte, c'est un tap de travers assuré.
      { confirmLabel: 'Rétablir la réservation' },
    ).then((ok) => {
      if (!ok) return;
      setUnmarkingId(r.id);
      void unmarkNoShow(r).then((st) => {
        setUnmarkingId(null);
        if (st === 'ok') {
          hapticSuccess();
          toast.show('Absence annulée — réservation rétablie');
          // Retrait OPTIMISTE de la ligne (patron leaveLesson) : le miroir store vient de
          // réintégrer la résa au même rendu — sans ce retrait, elle s'affichait EN DOUBLE
          // (Absences + Historique) le temps de reloadTraces, et pour toujours si la relecture
          // échouait (§8 : un null ne remplace pas la liste).
          setNoShows((cur) => cur.filter((x) => x.id !== r.id));
          reloadTraces();
          // La fiabilité du joueur vient de perdre une absence : re-sync CIBLÉ (la clé de l’effet
          // ne bouge pas, le joueur restant présent par ses autres résas → badge sinon périmé).
          if (r.userId) void fetchReliability([r.userId]).then((rel) => rel && setReliability((cur) => ({ ...cur, ...rel })));
          return;
        }
        hapticWarning();
        if (st === 'taken') toast.show('Impossible : le créneau a été repris entre-temps.', { icon: 'alert-circle' });
        else if (st === 'gone') toast.show('Cette réservation n’est plus dans un état modifiable.', { icon: 'alert-circle' });
        else if (st === 'forbidden') toast.show('Tu n’as pas les droits sur cette réservation.', { icon: 'alert-circle' });
        // 'error' (échec réseau/serveur) : là seulement, réessayer a du sens.
        else toast.show('Connexion impossible — réessaie', { icon: 'cloud-offline-outline' });
      });
    });
  };

  // « Jouée » = heure de fin passée (la même règle que côté joueur — base de la commission).
  const upcomingRes = clubRes.filter((r) => !isPlayed(r, now)).sort((a, b) => a.startsAt - b.startsAt);
  // Résas AFFICHÉES déjà décomptées d'un carnet : requête BORNÉE à la page visible (motif des
  // autres requêtes de cet écran). Fusion (jamais de remplacement) : une ligne pass_uses ne
  // disparaît jamais côté serveur, et le décompte à peine fait reste marqué.
  const shownUpcomingKey = upcomingRes
    .slice(0, upcomingShown)
    .map((r) => r.id)
    .join(',');
  useEffect(() => {
    if (!shownUpcomingKey) return;
    let alive = true;
    void fetchPassUses(shownUpcomingKey.split(',')).then((ids) => alive && ids && setPassUsed((cur) => new Set([...cur, ...ids])));
    return () => {
      alive = false;
    };
  }, [shownUpcomingKey]);
  const pastRes = clubRes.filter((r) => isPlayed(r, now)).sort((a, b) => b.startsAt - a.startsAt);
  // Semaines INCOMPLÈTES du miroir (mirrorPartialWeek) : celle que coupe le bord de la fenêtre de
  // 180 jours, ou — miroir TRONQUÉ au plafond de lignes (reservationsCoveredFrom) — celle du plus
  // ancien créneau reçu, et toutes les précédentes. Leur revenu serait faux (base de la
  // commission) : on ne les affiche pas. La troncature se DIT (bandeau), au lieu de laisser croire
  // à des semaines creuses ; la fenêtre, elle, est annoncée sous l'historique (« 6 derniers mois »).
  const coveredFrom = state.reservationsCoveredFrom;
  const partialWeek = mirrorPartialWeek(coveredFrom, now);
  // Historique regroupé PAR SEMAINE (le décompte de la commission est hebdomadaire). Groupage en
  // O(n) via une Map d'index (au lieu d'un `.find` par item = O(n²)) : un club actif accumule des
  // centaines de résas passées, et cette section se recalcule à chaque tap (confirmer/bloquer).
  const pastByWeek: { week: string; items: Reservation[] }[] = [];
  const weekIndex = new Map<string, { week: string; items: Reservation[] }>();
  for (const r of pastRes) {
    const wk = weekKeyOf(r.startsAt);
    if (wk <= partialWeek) continue; // semaine incomplète (clés AAAA-MM-JJ comparables)
    let g = weekIndex.get(wk);
    if (!g) {
      g = { week: wk, items: [] };
      weekIndex.set(wk, g);
      pastByWeek.push(g); // pastRes déjà trié desc → l'ordre des semaines est préservé
    }
    g.items.push(r);
  }
  const pastShown = pastByWeek.reduce((n, g) => n + g.items.length, 0);
  // Blocages hors app de ce club.
  const clubBlocked = state.blockedSlots.filter((b) => b.clubId === club.id);
  // Séries d'habitués encore à venir (liste « Habitués » : qui, quand, jusqu'à quand). Miroir
  // tronqué (plafond partagé par tous les clubs) → « au moins N » et la liste se dit partielle.
  // La coupure vient du DERNIER fetch complet (jamais déduite de la forme du miroir, que les
  // blocages/déblocages locaux déforment jusqu'à la relecture suivante).
  const blockedCoveredUntil = state.blockedSlotsCoveredUntil;
  const habitues = upcomingSeries(clubBlocked, now, blockedCoveredUntil);
  // Fermetures sur PÉRIODE (54) de ce club, triées par date de début (les plus proches d’abord).
  const clubRanges = state.blockedRanges.filter((r) => r.clubId === club.id).sort((a, b) => a.dateFrom.localeCompare(b.dateFrom));

  // Planning par TERRAIN pour un jour donné — chaque terrain a SA grille (1h/1h30, 68).
  // Recalé après minuit (todayKey) : `horizon` démarre AUJOURD'HUI, il ne doit pas rester sur la
  // veille. Au-delà de la première semaine, le libellé devient ABSOLU (« Sam 3 nov. ») : « Samedi 3 »
  // serait ambigu d'un mois sur l'autre.
  const horizon = useMemo(
    () => nextDays(PLANNING_HORIZON_DAYS + 1).map((d, i) => (i < 7 ? d : { ...d, label: dateKeyLabel(d.key) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todayKey],
  );
  // La SEMAINE (7 j) reste la base des pastilles, des mini-stats, du récurrent et de la
  // proposition d'alternative de ClubCancelForm (inchangés).
  const week = useMemo(() => horizon.slice(0, 7), [horizon]);
  const courts = courtsFor(club, state.clubCourts);
  // Grille EFFECTIVE de chaque terrain (courtSlots par terrain si réglée, sinon dérivée de la
  // grille club unique) : source de vérité unique pour le planning, les stats et QuickBlock/
  // BlockRangeForm — plus de liste `planTimes` partagée entre terrains aux durées différentes.
  const sched: ScheduleCtx = {
    clubSlots: state.clubSlots,
    clubCourts: state.clubCourts,
    courtSlots: state.courtSlots,
    courtClosed: state.clubCourtClosed,
  };
  const grid = resolvedGridFor(club, sched);
  // Jour retrouvé par CLÉ dans l'horizon : après minuit, un jour devenu passé retombe sur aujourd'hui.
  const planIdx = Math.max(
    0,
    horizon.findIndex((d) => d.key === planDayKey),
  );
  const planDay = horizon[planIdx];
  // Jour choisi HORS de la première semaine (8ᵉ pastille « Autre date » active).
  const planFar = planIdx >= 7;
  const goPlanDay = (key: string) => {
    setPlanDayKey(key);
    setShowPlanCalendar(false);
  };
  // Flèches ‹ › : un jour avant/après, bornées à l'horizon (aujourd'hui → J+60).
  const shiftPlanDay = (delta: number) => {
    const next = horizon[planIdx + delta];
    if (next) goPlanDay(next.key);
  };
  // « Jour bloqué entièrement » : seulement un tournoi PUBLIÉ sans terrains/créneaux précis.
  // Un tournoi en attente/refusé, ou qui ne réserve que quelques terrains, ne ferme pas la grille.
  const dayTournament = hasFullDayCompetition(club.id, planDay.key, comps);
  // Statut d’UN terrain à un créneau — réservations app + blocages hors app + créneaux/terrains
  // réellement réservés par un tournoi publié (pas toute la journée par défaut). Calculé en
  // CHEVAUCHEMENT (le créneau candidat [t, t+d) sur ce terrain). Pré-filtré sur LE jour affiché :
  // balayer tout l'historique du club à chaque cellule deviendrait lourd avec les mois.
  const planDayRes = clubRes.filter((r) => r.dateKey === planDay.key);
  const planDayBlocked = clubBlocked.filter((b) => b.dateKey === planDay.key);
  const overlapsAny = (slot: CourtSlot, items: { time: string; durationMin?: number }[]) =>
    items.some((x) => overlaps(slot, { t: x.time, d: (x.durationMin ?? 90) as 60 | 90 }));
  const courtStatusAt = (court: string, slot: CourtSlot): 'reserved' | 'blocked' | 'tournoi' | 'free' => {
    const compBlocked = competitionBlockedCourts(club.id, planDay.key, slot.t, slot.d, comps);
    if (compBlocked === 'all' || compBlocked.includes(court)) return 'tournoi';
    // Un créneau fermé sur la grille du terrain elle-même (x:true, fermeture récurrente repliée
    // ou fermeture manuelle) se montre comme « bloqué » — jamais réservable, comme le voit le serveur.
    if (slot.x) return 'blocked';
    if (
      overlapsAny(
        slot,
        planDayRes.filter((r) => r.court === court),
      )
    )
      return 'reserved';
    if (
      overlapsAny(
        slot,
        planDayBlocked.filter((b) => b.court === court),
      )
    )
      return 'blocked';
    // Fermeture sur période (54) couvrant ce jour/heure/terrain — même rendu qu’un blocage ponctuel.
    if (clubRanges.some((r) => rangeBlocks(r, planDay.key, slot.t, court, slot.d))) return 'blocked';
    return 'free';
  };
  // Variante paramétrée par le JOUR (n'importe quel jour, pas seulement celui affiché) : partagée
  // par QuickBlock ET ClubCancelForm (proposition d'alternative 75) pour n'offrir que des créneaux
  // réellement libres. Mêmes yeux que le planning (tournoi / réservé / bloqué / période).
  const courtStatusFor = (dKey: string, time: string, court: string, durationMin: number): CourtStatus => {
    const d = durationMin as 60 | 90;
    const compBlocked = competitionBlockedCourts(club.id, dKey, time, d, comps);
    if (compBlocked === 'all' || compBlocked.includes(court)) return { state: 'tournoi' };
    const slot: CourtSlot = { t: time, d };
    const resa = clubRes.find((r) => r.dateKey === dKey && r.court === court && overlapsAny(slot, [r]));
    if (resa) return { state: 'reserved', label: resa.bookedBy?.name ?? 'Joueur' };
    // Période AVANT blocage ponctuel : tant qu'une période couvre la case, débloquer le ponctuel
    // ne la rouvrirait pas — QuickBlock renvoie alors vers « Périodes fermées ».
    const rng = clubRanges.find((r) => rangeBlocks(r, dKey, time, court, d));
    if (rng) return { state: 'blocked', label: rangeReasons[rng.id], source: 'range' };
    const blk = clubBlocked.find((b) => b.dateKey === dKey && b.court === court && overlapsAny(slot, [b]));
    // Note privée gérant (récurrent) prioritaire sur le motif public générique.
    if (blk) return { state: 'blocked', label: slotNotes[`${blk.dateKey}|${blk.time}|${blk.court}`] || blk.reason, source: 'slot' };
    return { state: 'free' };
  };

  // Mini-stats de la semaine : taux d’occupation + créneau le plus demandé. Le dénominateur ne
  // compte que les créneaux réellement VENDABLES (ouverts sur LEUR terrain, ni période ni
  // blocage ponctuel dessus) — on itère les créneaux PROPRES de chaque terrain, pas une grille
  // commune (des terrains peuvent offrir des horaires/durées différents).
  const weekKeys = new Set(week.map((d) => d.key));
  const weekRes = clubRes.filter((r) => weekKeys.has(r.dateKey));
  const cellClosed = (dKey: string, slot: CourtSlot, court: string) => {
    if (clubRanges.some((r) => rangeBlocks(r, dKey, slot.t, court, slot.d))) return true;
    if (
      overlapsAny(
        slot,
        clubBlocked.filter((b) => b.dateKey === dKey && b.court === court),
      )
    )
      return true;
    // Cellule retenue par un TOURNOI publié : non réservable (le planning l'affiche « tournoi »)
    // → hors dénominateur, sinon une semaine de tournoi paraissait sous-remplie à tort.
    const cb = competitionBlockedCourts(club.id, dKey, slot.t, slot.d, comps);
    return cb === 'all' || cb.includes(court);
  };
  let sellable = 0;
  for (const d of week) {
    // Raccourci O(terrains×créneaux) : équivalent au `cb === 'all'` de cellClosed, en un test par jour.
    if (hasFullDayCompetition(club.id, d.key, comps)) continue;
    for (const c of courts) for (const s of grid[c] ?? []) if (!s.x && !cellClosed(d.key, s, c)) sellable++;
  }
  const capacity = Math.max(1, sellable);
  const occupancy = Math.min(100, Math.round((weekRes.length / capacity) * 100));
  const byHour = new Map<string, number>();
  for (const r of weekRes) byHour.set(r.time, (byHour.get(r.time) ?? 0) + 1);
  const topHour = [...byHour.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
  // Union des débuts ouverts, tous terrains confondus — base du graphe « remplissage » et des
  // créneaux les plus CREUX (jamais réservés cette semaine parmi les horaires réellement ouverts
  // quelque part) → le gérant sait où pousser une offre pour remplir.
  const allOpenTimes = [...new Set(courts.flatMap((c) => (grid[c] ?? []).filter((s) => !s.x).map((s) => s.t)))].sort();
  const quietHours = allOpenTimes.filter((t) => !byHour.has(t)).slice(0, 3);

  // Revenu = somme des prix RÉELS des réservations (figés à la réservation). On additionne les
  // parties JOUÉES (revenu encaissé) — même base que la commission.
  const revenueOf = (items: Reservation[]) => items.reduce((sum, r) => sum + (r.price ?? 0), 0);
  // Revenu RÉTROSPECTIF sur les 7 DERNIERS jours (≠ occupation ci-dessus, qui est une prévision
  // vers l’avant) : `week` (nextDays) démarre AUJOURD’HUI et va vers J+6, donc `weekRes` ne
  // contient quasiment jamais de parties jouées — on se base ici sur pastRes (déjà jouées).
  const last7DaysRevenue = revenueOf(pastRes.filter((r) => r.startsAt >= now - 7 * DAY_MS));

  return (
    <>
      {/* Vue d’ensemble */}
      <View style={styles.stats}>
        <StatTile value={upcomingRes.length} label="À venir" color={colors.signature} bg={colors.signatureSoft} />
        <StatTile value={pastRes.length} label="Jouées" color={colors.green} bg={colors.greenSoft} />
        <StatTile value={clubRes.length} label="Total" color={colors.amberDark} bg={colors.amberSoft} />
      </View>

      {/* Bloquer un créneau réservé hors app (téléphone, WhatsApp, sur place) */}
      <View style={{ marginTop: spacing.md }}>
        <Button
          size="sm"
          label={showBlockForm ? 'Replier' : '+ Bloquer un créneau (résa hors app)'}
          icon={showBlockForm ? 'chevron-up' : 'lock-closed'}
          variant="secondary"
          onPress={() => setShowBlockForm((v) => !v)}
          full
        />
      </View>
      {showBlockForm ? (
        <QuickBlock
          days={horizon}
          courts={courts}
          grid={grid}
          dayHasTournament={(dKey) => hasFullDayCompetition(club.id, dKey, comps)}
          courtStatus={courtStatusFor}
          onBlock={async (dKey, time, court, durationMin, reason, ts) => {
            // 'taken' : un joueur vient de le réserver — le store a déjà relu le miroir, la case
            // passe d'elle-même en « réservé » et QuickBlock nomme la cause.
            const st = await blockSlot({ clubId: club.id, dateKey: dKey, time, court, reason, durationMin }, ts);
            if (st === 'ok') hapticSuccess();
            else hapticWarning();
            return st;
          }}
          onUnblock={async (dKey, time, court, durationMin) => {
            // Après un changement de grille (bascule 1h/1h30, « Tout en 1h »…), la cellule peut
            // CHEVAUCHER un blocage posé à une autre heure : on débloque l'entrée RÉELLE (son
            // heure à elle) — envoyer l'heure de la cellule ne matchait aucune ligne en base.
            const cell: CourtSlot = { t: time, d: (durationMin === 60 ? 60 : 90) as 60 | 90 };
            const blk = clubBlocked.find((b) => b.dateKey === dKey && b.court === court && overlapsAny(cell, [b]));
            // Aucun blocage ponctuel au miroir : unblock_slot supprimerait 0 ligne mais répondrait
            // true — un faux « débloqué ». On refuse plutôt (QuickBlock affiche l'erreur).
            if (!blk) {
              hapticWarning();
              return false;
            }
            const ok = await unblockSlot(club.id, dKey, blk.time, court);
            if (ok)
              hapticSuccess(); // le créneau redevient réservable
            else hapticWarning();
            return ok;
          }}
        />
      ) : null}

      {/* Fermer sur une période (travaux, événement privé…) — dure plusieurs jours/heures,
          à la différence du blocage ponctuel ci-dessus. */}
      <View style={{ marginTop: spacing.sm }}>
        {/* « Replier » (pas « Fermer ») : le CTA du formulaire, lui, FERME la période — deux
            sens opposés du même verbe côte à côte perdaient le gérant. */}
        <Button
          size="sm"
          label={showRangeForm ? 'Replier' : '+ Fermer sur une période'}
          icon={showRangeForm ? 'chevron-up' : 'calendar-clear-outline'}
          variant="secondary"
          onPress={() => setShowRangeForm((v) => !v)}
          full
        />
      </View>
      {showRangeForm ? (
        <BlockRangeForm
          courts={courts}
          grid={grid}
          onSubmit={async (input) => {
            const status = await blockRange({ clubId: club.id, ...input });
            if (status === 'ok') {
              hapticSuccess();
              toast.show('Période fermée ✓ — plus aucun créneau réservable dessus');
            } else if (status === 'reservations') {
              hapticWarning();
              // Depuis la 75 le gérant PEUT annuler un créneau depuis l'app (« Annuler ce
              // créneau », carte de la résa plus bas) — et le joueur, lui, ne peut PLUS annuler
              // à moins de 5 h : on oriente vers le bon outil, pas vers une impasse.
              toast.show(
                'Une réservation à venir existe sur cette période — annule d’abord son créneau (« Annuler ce créneau » sur sa carte), puis referme la période',
                {
                  icon: 'alert-circle',
                },
              );
            } else if (status === 'competitions') {
              hapticWarning();
              toast.show('Un tournoi validé occupe cette période — choisis d’autres dates ou vois avec PadelConnect', {
                icon: 'alert-circle',
              });
            } else if (status === 'invalid') {
              hapticWarning();
              // 'invalid' couvre AUSSI le plafond serveur de 100 périodes actives (74) : le message
              // nomme les deux causes (un code dédié attendrait un client déjà livré).
              toast.show(
                'Période refusée — dates invalides (1 an maximum) ou trop de périodes de fermeture actives (100) : rouvre-en d’anciennes',
                { icon: 'alert-circle' },
              );
            } else if (status === 'error') {
              hapticWarning();
              toast.show('Enregistrement impossible — vérifie ta connexion', { icon: 'cloud-offline-outline' });
            } else {
              // 'forbidden' : refus de droits, pas un souci réseau.
              hapticWarning();
              toast.show('Action réservée au gérant du club', { icon: 'alert-circle' });
            }
            return status;
          }}
        />
      ) : null}

      {/* Créneau récurrent (12) : le même créneau chaque semaine pour un habitué (payé au club).
          C'est une série de blocages — d'où sa place à côté des deux formulaires ci-dessus. */}
      <View style={{ marginTop: spacing.sm }}>
        <Button
          size="sm"
          label={showRecurringForm ? 'Replier' : '+ Créneau récurrent (habitué)'}
          icon={showRecurringForm ? 'chevron-up' : 'repeat'}
          variant="secondary"
          onPress={() => setShowRecurringForm((v) => !v)}
          full
        />
      </View>
      {showRecurringForm ? (
        <RecurringForm
          days={week}
          courts={courts}
          grid={grid}
          onSubmit={async (input) => {
            const res = await blockRecurringRows({
              clubId: club.id,
              court: input.court,
              time: input.time,
              durationMin: input.durationMin,
              dateKeys: input.dateKeys,
              // Note PRIVÉE gérant (83, blocked_slot_notes — RLS) : le planning public ne
              // montre que « Récurrent », le nom de l'habitué n'est lisible que par le club.
              reason: `Récurrent · ${input.name}`,
            });
            if (!res) {
              hapticWarning();
              toast.show('Série non posée — vérifie ta connexion', { icon: 'cloud-offline-outline' });
              return null;
            }
            // Résultat HONNÊTE : une date déjà prise (réservation joueur ou tournoi publié) part en
            // conflit, une date déjà fermée par une AUTRE fermeture n'est jamais écrasée (97,
            // `taken`), le reste passe. On nomme les dates en conflit (3 max, toast lisible).
            const conflicts = res.conflicts.length
              ? ` · ${res.conflicts.length} en conflit (${res.conflicts.slice(0, 3).map(dateKeyLabel).join(', ')}${
                  res.conflicts.length > 3 ? '…' : ''
                }) — déjà réservé${res.conflicts.length > 1 ? 's' : ''} par un joueur ou un tournoi`
              : '';
            const taken = res.taken.length
              ? ` · ${res.taken.length} déjà bloqué${res.taken.length > 1 ? 's' : ''} par une autre fermeture`
              : '';
            // Série déjà posée à cette heure avec une AUTRE durée (grille du terrain changée — 97,
            // `resized`) : rien n'est écrasé, on dit QUOI faire au lieu d'« une autre fermeture ».
            // Au nom d'un AUTRE habitué (`resizedOther`) : on prévient que l'arrêter retirerait SES
            // créneaux, jamais « arrête la série » comme si c'était celle de ce client.
            const resizedOwn = res.resized.length - res.resizedOther.length;
            const resized =
              (resizedOwn > 0
                ? ` · ${resizedOwn} déjà posé${resizedOwn > 1 ? 's' : ''} avec une autre durée — arrête la série pour la reposer`
                : '') +
              (res.resizedOther.length
                ? ` · ${res.resizedOther.length} déjà fermé${res.resizedOther.length > 1 ? 's' : ''} (autre durée) au nom d’un autre habitué — arrêter cette série retire ses créneaux`
                : '');
            // Dates déjà fermées pour cette série mais au nom d'un AUTRE habitué (97, `renamed`) :
            // la note privée a suivi la saisie — on le DIT, jamais un « posé ✓ » muet.
            const renamed = res.renamed.length
              ? ` · ${res.renamed.length} renommé${res.renamed.length > 1 ? 's' : ''} (${res.renamed.slice(0, 3).map(dateKeyLabel).join(', ')}${
                  res.renamed.length > 3 ? '…' : ''
                }) — ${res.renamed.length > 1 ? 'étaient' : 'était'} au nom d’un autre habitué`
              : '';
            if (res.blocked.length === 0) {
              hapticWarning();
              toast.show(
                `Aucun créneau posé${conflicts || taken || resized ? `${conflicts}${taken}${resized}` : ' — vérifie le terrain et l’heure'}`,
                { icon: 'alert-circle' },
              );
              return res;
            }
            // Habitué remplacé ou série à deux durées : une action du gérant est attendue → avertissement.
            if (renamed || resized) hapticWarning();
            else hapticSuccess();
            toast.show(
              `${res.blocked.length} créneau${res.blocked.length > 1 ? 'x posés' : ' posé'} ✓${conflicts}${taken}${resized}${renamed}`,
              renamed || resized ? { icon: 'alert-circle' } : undefined,
            );
            // Le planning et la dispo lisent le MIROIR des fermetures : on le recharge (le
            // serveur a écrit en direct, aucune action du store n'a mis le miroir à jour).
            await refreshSession();
            // Notes privées relues EXPLICITEMENT : re-poser la même série avec un autre nom ne
            // change pas le NOMBRE de blocages — l'effet indexé sur le compteur ne partirait pas.
            onNotesChanged();
            return res;
          }}
        />
      ) : null}

      {/* Habitués : une ligne par série À VENIR (terrain + heure + jour), arrêtable d'un tap — sans
          elle, une série de 26 semaines ne se retirait que case par case. */}
      {habitues.length > 0 ? (
        <View style={{ marginTop: spacing.xl }}>
          <SectionHeader title={`Habitués · ${habitues.length}`} />
          <Card>
            {habitues.map((s, i) => {
              const n = s.dateKeys.length;
              const first = s.dateKeys[0];
              const last = s.dateKeys[n - 1];
              const who = slotNotes[`${first}|${s.time}|${s.court}`] ?? '';
              const key = habitueSeriesKey(s);
              const busy = stoppingSeries === key;
              const weeks = seriesWeeksLabel(s);
              const when = seriesWhenLabel(s);
              return (
                <View key={key}>
                  {i > 0 ? <Divider style={{ marginVertical: spacing.sm }} /> : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <View style={{ flex: 1 }}>
                      <Txt variant="body" style={{ fontWeight: '600' }} numberOfLines={1}>
                        {who || RECURRING_REASON} · {s.court}, {when}
                        {/* Un terrain retiré depuis : la série reste arrêtable, on le signale. */}
                        {!courts.includes(s.court) ? ' (terrain retiré)' : ''}
                      </Txt>
                      <Txt variant="small" color={colors.textFaint}>
                        {weeks} ·{' '}
                        {s.maybeMore
                          ? `jusqu’au ${dateKeyLabel(last)} ou plus tard`
                          : first === last
                            ? `le ${dateKeyLabel(first)}`
                            : `jusqu’au ${dateKeyLabel(last)}`}
                      </Txt>
                    </View>
                    <Button
                      size="sm"
                      label={busy ? 'Arrêt…' : 'Arrêter'}
                      icon="stop-circle-outline"
                      variant="ghost"
                      disabled={!!stoppingSeries}
                      accessibilityLabel={`Arrêter la série ${who || RECURRING_REASON} sur ${s.court}, ${when} (${weeks})`}
                      onPress={() => onStopSeries(s.court, s.time, who, s.dow)}
                    />
                  </View>
                </View>
              );
            })}
            {blockedCoveredUntil !== null ? (
              <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
                Liste partielle : les créneaux bloqués à partir du {dateKeyLabel(blockedCoveredUntil)} ne sont pas tous chargés.
              </Txt>
            ) : null}
          </Card>
        </View>
      ) : null}

      {/* Périodes fermées actives de ce club — chacune rouvrable d’un tap. */}
      {clubRanges.length > 0 ? (
        <View style={{ marginTop: spacing.xl }}>
          <SectionHeader title={`Périodes fermées · ${clubRanges.length}`} />
          <Card>
            {clubRanges.map((r, i) => (
              <View key={r.id}>
                {i > 0 ? <Divider style={{ marginVertical: spacing.sm }} /> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <Txt variant="body" style={{ fontWeight: '600' }}>
                      {r.court ?? 'Tous les terrains'} ·{' '}
                      {r.dateFrom === r.dateTo
                        ? `le ${dateKeyLabel(r.dateFrom)}`
                        : `du ${dateKeyLabel(r.dateFrom)} au ${dateKeyLabel(r.dateTo)}`}
                      {/* Un terrain retiré depuis : la période reste rouvrable, on le signale. */}
                      {r.court && !courts.includes(r.court) ? ' (terrain retiré)' : ''}
                    </Txt>
                    <Txt variant="small" color={colors.textFaint}>
                      {r.times && r.times.length > 0 ? r.times.join(', ') : 'Toute la journée'}
                    </Txt>
                    {rangeReasons[r.id] ? (
                      <Txt variant="small" color={colors.textMuted}>
                        {rangeReasons[r.id]}
                      </Txt>
                    ) : null}
                  </View>
                  <Button
                    size="sm"
                    label="Rouvrir"
                    icon="lock-open"
                    variant="ghost"
                    accessibilityLabel={`Rouvrir ${r.court ?? 'tous les terrains'} du ${dateKeyLabel(r.dateFrom)} au ${dateKeyLabel(r.dateTo)}`}
                    disabled={unblockingRangeId === r.id}
                    onPress={() => {
                      if (unblockingRangeId) return; // garde anti double-tap
                      setUnblockingRangeId(r.id);
                      void unblockRange(r.id).then((st) => {
                        setUnblockingRangeId(null);
                        if (st === 'ok') {
                          hapticSuccess();
                          toast.show('Période rouverte ✓');
                        } else if (st === 'gone') {
                          // Rouverte entre-temps ailleurs (autre appareil, opérateur) : le but est atteint.
                          toast.show('Période déjà rouverte ✓');
                        } else {
                          hapticWarning();
                          toast.show('Action impossible — réessaie', { icon: 'alert-circle' });
                        }
                      });
                    }}
                  />
                </View>
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      {/* Planning par terrain (jour sélectionné) — maquette Espace Club */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Planning du jour" />
        {/* Sélecteur de jour */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.sm }}
        >
          {week.map((d) => {
            const dd = new Date(d.value);
            const active = d.key === planDay.key;
            return (
              <Pressable
                key={d.key}
                onPress={() => goPlanDay(d.key)}
                style={[styles.dayPill, active && styles.dayPillActive]}
                accessibilityRole="button"
                accessibilityLabel={d.label}
                accessibilityState={{ selected: active }}
              >
                <Txt variant="small" color={active ? colors.onSignature : colors.textFaint} style={{ fontSize: 10, fontWeight: '700' }}>
                  {DOW_SHORT[dd.getUTCDay()]}
                </Txt>
                <Txt variant="h3" color={active ? colors.onSignature : colors.text} style={{ fontSize: 16 }}>
                  {dd.getUTCDate()}
                </Txt>
              </Pressable>
            );
          })}
          {/* 8ᵉ pastille « Autre date » (D1) : ouvre le calendrier jusqu'à J+60. Active, elle montre
              le jour lointain choisi (son libellé complet est sous les pastilles). */}
          <Pressable
            onPress={() => setShowPlanCalendar((v) => !v)}
            style={[styles.dayPill, planFar && styles.dayPillActive]}
            accessibilityRole="button"
            accessibilityLabel={planFar ? `Autre date : ${planDay.label}` : 'Autre date'}
            accessibilityState={{ selected: planFar, expanded: showPlanCalendar }}
          >
            {planFar ? (
              <>
                <Txt variant="small" color={colors.onSignature} style={{ fontSize: 10, fontWeight: '700' }}>
                  {DOW_SHORT[new Date(planDay.value).getUTCDay()]}
                </Txt>
                <Txt variant="h3" color={colors.onSignature} style={{ fontSize: 16 }}>
                  {new Date(planDay.value).getUTCDate()}
                </Txt>
              </>
            ) : (
              <>
                <Txt variant="small" color={colors.textMuted} style={{ fontSize: 10, fontWeight: '700' }}>
                  AUTRE
                </Txt>
                <Ionicons name="calendar-outline" size={18} color={colors.text} style={{ marginTop: 1 }} />
              </>
            )}
          </Pressable>
        </ScrollView>
        {showPlanCalendar ? (
          <CalendarPicker value={planDay.key} minKey={horizon[0].key} maxKey={horizon[horizon.length - 1].key} onSelect={goPlanDay} />
        ) : null}
        {/* Flèches ‹ › : un jour à la fois, de aujourd'hui à J+60 — le libellé COMPLET du jour
            affiché lève toute ambiguïté au-delà de la première semaine. */}
        <View style={styles.dayNav}>
          <Pressable
            onPress={() => shiftPlanDay(-1)}
            disabled={planIdx <= 0}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Jour précédent"
            accessibilityState={{ disabled: planIdx <= 0 }}
          >
            <Ionicons name="chevron-back" size={20} color={planIdx > 0 ? colors.text : colors.textFaint} />
          </Pressable>
          <Txt variant="h3" style={{ flex: 1, textAlign: 'center' }} numberOfLines={1}>
            {planDay.label}
          </Txt>
          <Pressable
            onPress={() => shiftPlanDay(1)}
            disabled={planIdx >= horizon.length - 1}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Jour suivant"
            accessibilityState={{ disabled: planIdx >= horizon.length - 1 }}
          >
            <Ionicons name="chevron-forward" size={20} color={planIdx < horizon.length - 1 ? colors.text : colors.textFaint} />
          </Pressable>
        </View>

        <Card>
          {dayTournament ? (
            <View style={styles.banner}>
              <Ionicons name="trophy" size={16} color={colors.purple} />
              <Txt variant="small" color={colors.text} style={{ flex: 1 }}>
                Jour de tournoi — tous les terrains sont indisponibles.
              </Txt>
            </View>
          ) : null}
          {/* Une LIGNE PAR TERRAIN : chaque terrain montre SA propre grille (créneaux 1h/1h30
              mélangeables), plus lisible qu'une matrice figée dès que les terrains divergent. */}
          <View style={{ gap: spacing.md }}>
            {courts.map((court) => {
              const courtSlots = (grid[court] ?? []).slice().sort((a, b) => (toMin(a.t) ?? 0) - (toMin(b.t) ?? 0));
              return (
                <View key={court}>
                  <Txt variant="small" style={{ fontWeight: '700', marginBottom: spacing.xs }}>
                    {court}
                  </Txt>
                  <View style={styles.wrap}>
                    {courtSlots.map((s) => {
                      const st = courtStatusAt(court, s);
                      const cellStyle =
                        st === 'reserved'
                          ? styles.gcReserved
                          : st === 'blocked'
                            ? styles.gcBlocked
                            : st === 'tournoi'
                              ? styles.gcTournoi
                              : styles.gcFree;
                      // Libellé lu par un lecteur d’écran (les cases libres sont sinon vides).
                      const statusLabel =
                        st === 'reserved' ? 'réservé' : st === 'blocked' ? 'bloqué' : st === 'tournoi' ? 'tournoi' : 'libre';
                      return (
                        <Pressable
                          key={s.t}
                          onPress={() => {
                            hapticLight(); // repère tactile sur une grille dense (terrains × créneaux)
                            onSelectCell({
                              dateKey: planDay.key,
                              time: s.t,
                              durationMin: s.d,
                              label: `${planDay.label} · ${s.t} · ${durationLabel(s.d)}`,
                            });
                          }}
                          style={({ pressed }) => [
                            styles.gridSlotBox,
                            cellStyle,
                            pressed && { opacity: 0.7, transform: [{ scale: 0.96 }] },
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={`${court}, ${s.t}, ${durationLabel(s.d)}, ${statusLabel}`}
                        >
                          {st === 'reserved' ? <Ionicons name="checkmark" size={12} color={colors.onSignature} /> : null}
                          {st === 'blocked' ? <Ionicons name="lock-closed" size={11} color={colors.textFaint} /> : null}
                          {st === 'tournoi' ? <Ionicons name="trophy" size={11} color={colors.onSignature} /> : null}
                          <Txt
                            variant="small"
                            color={st === 'reserved' || st === 'tournoi' ? colors.onSignature : colors.textFaint}
                            style={{ fontSize: 10, fontWeight: '600' }}
                          >
                            {s.t} · {durationLabel(s.d)}
                          </Txt>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </View>
          <View style={styles.planLegend}>
            <LegendDot color={colors.signature} label="Réservé" />
            <LegendDot color={colors.surface} label="Libre" />
            <LegendDot color={colors.surfaceBeige} label="Bloqué" />
            <LegendDot color={colors.purple} label="Tournoi" />
          </View>
          <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
            Touche une case pour voir le détail du créneau ou bloquer un terrain.
          </Txt>
        </Card>

        {/* Mini-stats de la semaine */}
        <View style={[styles.stats, { marginTop: spacing.md }]}>
          <StatTile value={`${occupancy} %`} label="Occupation (7 j)" color={colors.green} bg={colors.greenSoft} />
          <StatTile value={weekRes.length} label="Résas (7 j)" color={colors.green} bg={colors.greenSoft} />
          <StatTile value={topHour} label="Heure phare" color={colors.amberDark} bg={colors.amberSoft} />
        </View>

        {/* Remplissage par créneau sur la semaine (données réelles) */}
        {weekRes.length > 0 ? (
          <Card style={{ marginTop: spacing.md }}>
            <Txt variant="label" style={{ marginBottom: spacing.md }}>
              Remplissage par créneau (7 j)
            </Txt>
            <BarChart data={allOpenTimes.map((t) => ({ label: t, value: weekRes.filter((r) => r.time === t).length }))} />
          </Card>
        ) : null}

        {/* Revenu de la semaine (parties jouées) + créneaux à remplir — insight actionnable. */}
        <Card style={{ marginTop: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <IconCircle icon="cash-outline" color={colors.green} bg={colors.greenSoft} />
            <View style={{ flex: 1 }}>
              <Txt variant="label">REVENU DES PARTIES JOUÉES (7 J)</Txt>
              <Txt variant="h2" color={colors.green}>
                {fcfa(last7DaysRevenue)}
              </Txt>
            </View>
          </View>
          {quietHours.length > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.md }}>
              <Ionicons name="bulb-outline" size={16} color={colors.amber} />
              <Txt variant="small" color={colors.textMuted} style={{ flex: 1 }}>
                Créneaux encore vides cette semaine : {quietHours.join(' · ')}. Une petite offre pourrait les remplir.
              </Txt>
            </View>
          ) : null}
        </Card>
      </View>

      {/* À venir — à confirmer */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title={`Réservations à venir · ${upcomingRes.length}`} />
        {upcomingRes.length === 0 ? (
          <Card>
            <EmptyState
              icon="calendar-outline"
              title="Aucune réservation à venir"
              text={`Dès qu’un joueur réserve chez ${club.name}, sa réservation apparaît ici avec son nom et son numéro.`}
            />
          </Card>
        ) : (
          upcomingRes.slice(0, upcomingShown).map((r) => (
            <Card key={r.id} style={{ marginBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <IconCircle icon="time" color={colors.signature} bg={colors.signatureSoft} size={40} />
                <View style={{ flex: 1 }}>
                  <Txt variant="h3" style={{ fontSize: 15 }}>
                    {dateKeyLabel(r.dateKey)} · {r.time}
                  </Txt>
                  <Txt variant="muted">
                    {resaDetailLabel(r)} · {r.players} joueur{r.players > 1 ? 's' : ''}
                  </Txt>
                  {r.bookedBy ? (
                    <Txt variant="small" color={colors.textMuted}>
                      Réservé par {r.bookedBy.name}
                      {r.bookedBy.phone ? ` · ${r.bookedBy.phone}` : ''}
                    </Txt>
                  ) : null}
                  {r.coachName ? (
                    // Réservation née d’un cours accepté par le coach (double validation).
                    <Txt variant="small" color={colors.purpleDark} style={{ fontWeight: '600' }}>
                      Cours avec {r.coachName}
                    </Txt>
                  ) : null}
                  {reliabilityNote(r.userId)}
                </View>
                {r.clubConfirmed ? <Tag label="Confirmée ✓" tone="green" /> : <Tag label="À confirmer" tone="amber" />}
              </View>
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Button
                    size="sm"
                    label={r.clubConfirmed ? 'Annuler la confirmation' : 'Confirmer la réservation'}
                    icon={r.clubConfirmed ? 'close' : 'checkmark'}
                    variant={r.clubConfirmed ? 'ghost' : 'primary'}
                    onPress={() => {
                      const wasConfirmed = r.clubConfirmed;
                      void confirmReservationByClub(r.id).then(async (ok) => {
                        if (!ok) {
                          hapticWarning();
                          // Refus : on relit la session pour dire la VRAIE cause au lieu d'un
                          // « réessaie » en boucle. Club actif changé ailleurs (web, opérateur) →
                          // cette section est remontée sur l'autre club et le parent l'annonce ;
                          // sinon la résa a pu tomber entre-temps (annulée) ou la connexion a coupé.
                          await refreshSession();
                          if (!mountedRef.current) return;
                          toast.show(
                            'Action impossible — écran actualisé : la réservation a peut-être été annulée, sinon vérifie ta connexion',
                            {
                              icon: 'alert-circle',
                            },
                          );
                          return;
                        }
                        hapticSuccess();
                        // Confirmation posée → on PROPOSE de prévenir le joueur dans la foulée
                        // (boucle fermée « confirmée → joueur prévenu », sans dépendre d’un second
                        // tap que le gérant oublie souvent). Numéro lu au tap si absent (contactBooker).
                        if (!wasConfirmed) {
                          // confirmAsync : cross-plateforme (sur le web l'Alert natif ne s'affiche pas).
                          void confirmAsync('Réservation confirmée ✓', `Prévenir ${r.bookedBy?.name ?? 'le joueur'} par WhatsApp ?`, {
                            confirmLabel: 'Envoyer',
                            cancelLabel: 'Plus tard',
                          }).then((send) => {
                            if (send) void contactBooker({ ...r, clubConfirmed: true }, club.name, toast);
                          });
                        }
                      });
                    }}
                    full
                  />
                </View>
                <Button
                  size="sm"
                  label="WhatsApp"
                  icon="logo-whatsapp"
                  variant="secondary"
                  accessibilityLabel={`Contacter ${r.bookedBy?.name ?? 'le joueur'} sur WhatsApp`}
                  onPress={() => void contactBooker(r, club.name, toast)}
                />
              </View>
              {/* Le joueur n’est pas venu (y c. annulation tardive par téléphone) : libère le
                  créneau et compte l’absence. Proposé seulement une fois le créneau COMMENCÉ —
                  avant, un tap par erreur compterait une absence injuste des jours à l’avance. */}
              {r.startsAt <= now ? (
                <Button size="sm" label="Pas venu" icon="person-remove-outline" variant="ghost" onPress={() => onMarkNoShow(r)} full />
              ) : null}
              {/* Carnet (17) : le joueur a payé d'avance N séances au club — un tap en décompte
                  une. Le bouton n'apparaît que s'il lui reste du solde ICI ; une résa déjà
                  décomptée porte son badge (le serveur refuse de toute façon un second décompte). */}
              {passUsed.has(r.id) ? (
                <View style={{ marginTop: spacing.sm, alignItems: 'flex-start' }}>
                  <Tag label="Décomptée du carnet ✓" tone="green" icon="ticket-outline" />
                </View>
              ) : r.userId && (passBalance[r.userId] ?? 0) > 0 ? (
                <Button
                  size="sm"
                  label={
                    usingPassId === r.id
                      ? 'Décompte…'
                      : `Décompter du carnet (${passBalance[r.userId]} restante${passBalance[r.userId] > 1 ? 's' : ''})`
                  }
                  icon="ticket-outline"
                  variant="secondary"
                  disabled={usingPassId === r.id}
                  accessibilityLabel={`Décompter une séance du carnet de ${r.bookedBy?.name ?? 'ce joueur'}`}
                  onPress={() => onUsePass(r)}
                  full
                />
              ) : null}
              {/* Annulation par le CLUB (75) : réservation prise HORS APP sur ce créneau, pluie,
                  terrain impraticable… On l'annule à tout moment sans pénaliser le joueur, et on
                  lui envoie le motif + une proposition d'alternative (via notify-club). */}
              <Button
                size="sm"
                label="Annuler ce créneau"
                icon="swap-horizontal-outline"
                variant="ghost"
                onPress={() => setCancellingId(cancellingId === r.id ? null : r.id)}
                full
              />
              {cancellingId === r.id ? (
                <ClubCancelForm
                  days={week}
                  courts={courts}
                  grid={grid}
                  courtStatus={courtStatusFor}
                  onCancel={(reason, proposal) =>
                    clubCancelReservation(r.id, reason, proposal).then((ok) => {
                      if (ok) {
                        hapticSuccess();
                        toast.show('Créneau annulé — le joueur est prévenu');
                        setCancellingId(null);
                        reloadTraces();
                        // Le trigger 85 a pu REMBOURSER une séance de carnet décomptée sur cette
                        // résa : re-sync du solde tout de suite (sinon « Épuisé » mensonger).
                        reloadPassBalance();
                      } else {
                        hapticWarning();
                      }
                      return ok;
                    })
                  }
                  onClose={() => setCancellingId(null)}
                />
              ) : null}
            </Card>
          ))
        )}
        {upcomingRes.length > upcomingShown ? (
          <Button
            size="sm"
            variant="ghost"
            label={`Voir plus (${upcomingRes.length - upcomingShown} restantes)`}
            icon="chevron-down"
            onPress={() => setUpcomingShown((n) => n + 15)}
            full
          />
        ) : null}
      </View>

      {/* Annulations récentes — un joueur a libéré son créneau (> 5 h avant le match). */}
      {cancelled.length > 0 ? (
        <View style={{ marginTop: spacing.xl }}>
          <SectionHeader title={`Annulations récentes · ${cancelled.length}`} />
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.sm }}>
              <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
              <Txt variant="small" color={colors.textMuted} style={{ flex: 1 }}>
                Ces créneaux ont été annulés par le joueur : ils ont été remis en vente au moment de l’annulation.
              </Txt>
            </View>
            {cancelled.slice(0, 8).map((r, i) => (
              <View key={r.id}>
                {i > 0 ? <Divider style={{ marginVertical: spacing.sm }} /> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <Txt variant="body" style={{ fontWeight: '600' }}>
                      {dateKeyLabel(r.dateKey)} · {r.time} · {r.court}
                    </Txt>
                    {r.bookedBy ? (
                      <Txt variant="small" color={colors.textFaint}>
                        {r.bookedBy.name}
                      </Txt>
                    ) : null}
                    {reliabilityNote(r.userId)}
                  </View>
                  <Tag label="Annulée" tone="coral" />
                </View>
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      {/* Absences (no-show) — joueurs marqués « pas venu » par le club. */}
      {noShows.length > 0 ? (
        <View style={{ marginTop: spacing.xl }}>
          <SectionHeader title={`Absences · ${noShows.length}`} />
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.sm }}>
              <Ionicons name="warning-outline" size={16} color={colors.coral} />
              <Txt variant="small" color={colors.textMuted} style={{ flex: 1 }}>
                Joueurs qui ne sont pas venus (ou ont annulé trop tard par téléphone). C’est compté dans leur fiabilité.
              </Txt>
            </View>
            {noShows.slice(0, 8).map((r, i) => (
              <View key={r.id}>
                {i > 0 ? <Divider style={{ marginVertical: spacing.sm }} /> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <Txt variant="body" style={{ fontWeight: '600' }}>
                      {dateKeyLabel(r.dateKey)} · {r.time} · {r.court}
                    </Txt>
                    {r.bookedBy ? (
                      <Txt variant="small" color={colors.textFaint}>
                        {r.bookedBy.name}
                      </Txt>
                    ) : null}
                    {reliabilityNote(r.userId)}
                  </View>
                  <Tag label="Absent" tone="coral" />
                </View>
                {/* Marquée par erreur ? Le gérant rétablit la réservation (l’absence quitte la
                    fiabilité du joueur) — discret, aligné à droite sous la ligne. */}
                <View style={{ alignItems: 'flex-end' }}>
                  <Button
                    size="sm"
                    variant="ghost"
                    label={unmarkingId === r.id ? 'Annulation…' : 'Annuler l’absence'}
                    icon="arrow-undo-outline"
                    disabled={unmarkingId === r.id}
                    // Plusieurs boutons partagent ce label : on nomme la ligne pour les lecteurs d'écran.
                    accessibilityLabel={`Annuler l’absence du ${dateKeyLabel(r.dateKey)} à ${r.time}${r.bookedBy ? ` — ${r.bookedBy.name}` : ''}`}
                    onPress={() => onUnmarkNoShow(r)}
                  />
                </View>
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      {/* Historique du club — regroupé par semaine, base de la commission PadelConnect */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title={`Historique · ${pastShown}`} />
        {/* Date = lundi de la première semaine COMPLÈTE : tout ce qui précède peut manquer. */}
        {coveredFrom !== null ? (
          <View style={styles.partialNote}>
            <Ionicons name="information-circle-outline" size={16} color={colors.amberDark} />
            <Txt variant="small" color={colors.amberDark} style={{ flex: 1 }}>
              Historique incomplet avant le {dateKeyLabel(weekKeyOf(coveredFrom + 7 * DAY_MS))} : trop de réservations à charger d’un coup,
              les semaines plus anciennes ne sont pas affichées.
            </Txt>
          </View>
        ) : null}
        {pastShown === 0 && coveredFrom === null ? (
          <Card>
            <EmptyState
              icon="time-outline"
              title="Aucun historique"
              text="Les réservations déjà jouées s’afficheront ici, semaine par semaine."
            />
          </Card>
        ) : (
          pastByWeek.slice(0, weeksShown).map((g) => (
            <Card key={g.week} style={{ marginBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
                <Txt variant="label">Semaine {weekLabel(g.week)}</Txt>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                  <Tag label={fcfa(revenueOf(g.items))} tone="green" icon="cash-outline" />
                  <Tag label={`${g.items.length} jouée${g.items.length > 1 ? 's' : ''}`} tone="neutral" />
                </View>
              </View>
              {g.items.map((r, i) => (
                <View key={r.id}>
                  {i > 0 ? <Divider style={{ marginVertical: spacing.sm }} /> : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <View style={{ flex: 1 }}>
                      <Txt variant="body" style={{ fontWeight: '600' }}>
                        {dateKeyLabel(r.dateKey)} · {r.time} · {r.court}
                      </Txt>
                      {r.bookedBy ? (
                        <Txt variant="small" color={colors.textFaint}>
                          {r.bookedBy.name}
                        </Txt>
                      ) : null}
                    </View>
                    {/* Une absence se traite souvent APRÈS le créneau : on laisse 48 h au gérant
                        pour la signaler depuis l’historique (le serveur accepte une résa passée). */}
                    {now - r.startsAt <= 48 * HOUR_MS ? (
                      <Button size="sm" label="Pas venu" icon="person-remove-outline" variant="ghost" onPress={() => onMarkNoShow(r)} />
                    ) : null}
                  </View>
                </View>
              ))}
            </Card>
          ))
        )}
        {pastByWeek.length > weeksShown ? (
          <Button
            size="sm"
            variant="ghost"
            label={`Voir plus de semaines (${pastByWeek.length - weeksShown} restantes)`}
            icon="chevron-down"
            onPress={() => setWeeksShown((n) => n + 4)}
            full
          />
        ) : null}
        <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
          La commission PadelConnect se calcule sur cet historique (semaines complètes des 6 derniers mois) — décompte transmis chaque fin
          de semaine, règlement par Wave.
        </Txt>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  relNote: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  partialNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.amberSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
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
  // Planning par terrain (maquette) : pastilles de jour + grille terrains × créneaux.
  dayPill: {
    minWidth: 50,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  dayPillActive: { backgroundColor: colors.signature, borderColor: colors.signature, ...shadows.e1 },
  dayNav: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.sm, marginVertical: spacing.sm },
  // Puce de créneau (une par terrain, largeur libre — le libellé porte l'heure ET la durée).
  gridSlotBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 34,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  gcReserved: { backgroundColor: colors.signature, ...shadows.e1 },
  gcFree: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  gcBlocked: { backgroundColor: colors.surfaceBeige, borderWidth: 1, borderColor: colors.border },
  gcTournoi: { backgroundColor: colors.purple, ...shadows.e1 },
  planLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md },
});
