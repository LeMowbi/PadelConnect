import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { BarChart } from '@/components/BarChart';
import { useToast } from '@/components/Toast';
import { Button, Card, Divider, EmptyState, IconCircle, SectionHeader, StatTile, Tag, Txt } from '@/components/ui';
import { LegendDot } from '@/components/club-admin/LegendDot';
import { QuickBlock, type CourtStatus } from '@/components/club-admin/QuickBlock';
import { BlockRangeForm } from '@/components/club-admin/BlockRangeForm';
import { ClubCancelForm } from '@/components/club-admin/ClubCancelForm';
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
import { DAY_MS, dateKeyLabel, nextDays, weekKeyOf, weekLabel } from '@/lib/days';
import { fcfa } from '@/lib/format';
import { openWhatsApp } from '@/lib/contact';
import { confirmAsync } from '@/lib/confirm';
import { hapticLight, hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  fetchCancelledReservations,
  fetchClubBlockedReasons,
  fetchNoShowReservations,
  fetchReliability,
  purgeOldBlockedRanges,
  type Reliability,
} from '@/lib/reservations';
import { isPlayed, useApp, type Reservation } from '@/store/AppContext';
import { colors, radius, shadows, spacing } from '@/theme';

type SelectedCell = { dateKey: string; time: string; durationMin: number; label: string };

export function SectionReservations({
  club,
  comps,
  onSelectCell,
}: {
  club: Club;
  comps: import('@/data/competitions').Competition[];
  onSelectCell: (cell: SelectedCell) => void;
}) {
  const { state, blockSlot, unblockSlot, blockRange, unblockRange, confirmReservationByClub, markNoShow, clubCancelReservation } = useApp();
  const toast = useToast();
  const [planDayKey, setPlanDayKey] = useState<string | null>(null);
  // Résa en cours d'annulation par le club (chevauchement hors app) : id ouvert dans un mini-form.
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [showRangeForm, setShowRangeForm] = useState(false);
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

  // Annulations récentes du club (serveur) : un joueur a annulé → le créneau s’est libéré.
  // On garde la trace (status='cancelled') pour prévenir le club (cf. fonction serveur 09).
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

  // Badge d’alerte sous le nom d’un joueur peu fiable (≥1 annulation ou absence).
  const reliabilityNote = (userId?: string) => {
    const rel = userId ? reliability[userId] : undefined;
    if (!rel || (rel.cancelled === 0 && rel.noShow === 0)) return null;
    const parts: string[] = [];
    if (rel.cancelled > 0) parts.push(`${rel.cancelled} annulation${rel.cancelled > 1 ? 's' : ''}`);
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
      void markNoShow(r.id).then((done) => {
        if (done) {
          hapticSuccess();
          toast.show('Absence enregistrée');
          reloadTraces();
        } else {
          hapticWarning();
          toast.show('Action impossible — réessaie', { icon: 'alert-circle' });
        }
      });
    });
  };
  // « Jouée » = heure de fin passée (la même règle que côté joueur — base de la commission).
  const upcomingRes = clubRes.filter((r) => !isPlayed(r, now)).sort((a, b) => a.startsAt - b.startsAt);
  const pastRes = clubRes.filter((r) => isPlayed(r, now)).sort((a, b) => b.startsAt - a.startsAt);
  // Historique regroupé PAR SEMAINE (le décompte de la commission est hebdomadaire). Groupage en
  // O(n) via une Map d'index (au lieu d'un `.find` par item = O(n²)) : un club actif accumule des
  // centaines de résas passées, et cette section se recalcule à chaque tap (confirmer/bloquer).
  const pastByWeek: { week: string; items: Reservation[] }[] = [];
  const weekIndex = new Map<string, { week: string; items: Reservation[] }>();
  for (const r of pastRes) {
    const wk = weekKeyOf(r.startsAt);
    let g = weekIndex.get(wk);
    if (!g) {
      g = { week: wk, items: [] };
      weekIndex.set(wk, g);
      pastByWeek.push(g); // pastRes déjà trié desc → l'ordre des semaines est préservé
    }
    g.items.push(r);
  }
  // Blocages hors app de ce club.
  const clubBlocked = state.blockedSlots.filter((b) => b.clubId === club.id);
  // Fermetures sur PÉRIODE (54) de ce club, triées par date de début (les plus proches d’abord).
  const clubRanges = state.blockedRanges.filter((r) => r.clubId === club.id).sort((a, b) => a.dateFrom.localeCompare(b.dateFrom));

  // Planning par TERRAIN pour un jour donné — chaque terrain a SA grille (1h/1h30, 68).
  const week = nextDays(7);
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
  const planDay = week.find((d) => d.key === planDayKey) ?? week[0];
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
    const blk = clubBlocked.find((b) => b.dateKey === dKey && b.court === court && overlapsAny(slot, [b]));
    if (blk) return { state: 'blocked', label: blk.reason };
    const rng = clubRanges.find((r) => rangeBlocks(r, dKey, time, court, d));
    if (rng) return { state: 'blocked', label: rangeReasons[rng.id] || 'Fermé sur période' };
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
    if (hasFullDayCompetition(club.id, d.key, comps)) continue; // journée entière au tournoi
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
          days={week}
          courts={courts}
          grid={grid}
          dayHasTournament={(dKey) => hasFullDayCompetition(club.id, dKey, comps)}
          courtStatus={courtStatusFor}
          onBlock={async (dKey, time, court, durationMin, reason, ts) => {
            const ok = await blockSlot({ clubId: club.id, dateKey: dKey, time, court, reason, durationMin }, ts);
            if (ok) hapticSuccess();
            else hapticWarning();
            return ok;
          }}
          onUnblock={async (dKey, time, court, durationMin) => {
            // Après un changement de grille (bascule 1h/1h30, « Tout en 1h »…), la cellule peut
            // CHEVAUCHER un blocage posé à une autre heure : on débloque l'entrée RÉELLE (son
            // heure à elle) — envoyer l'heure de la cellule ne matchait aucune ligne en base.
            const cell: CourtSlot = { t: time, d: (durationMin === 60 ? 60 : 90) as 60 | 90 };
            const blk = clubBlocked.find((b) => b.dateKey === dKey && b.court === court && overlapsAny(cell, [b]));
            const ok = await unblockSlot(club.id, dKey, blk?.time ?? time, court);
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
              toast.show('Dates invalides — vérifie la période (1 an maximum)', { icon: 'alert-circle' });
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
                      void unblockRange(r.id).then((ok) => {
                        setUnblockingRangeId(null);
                        if (ok) {
                          hapticSuccess();
                          toast.show('Période rouverte ✓');
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
                onPress={() => setPlanDayKey(d.key)}
                style={[styles.dayPill, active && styles.dayPillActive]}
                accessibilityRole="button"
                accessibilityLabel={d.label}
                accessibilityState={{ selected: active }}
              >
                <Txt variant="small" color={active ? colors.onSignature : colors.textFaint} style={{ fontSize: 10, fontWeight: '700' }}>
                  {['DIM', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM'][dd.getUTCDay()]}
                </Txt>
                <Txt variant="h3" color={active ? colors.onSignature : colors.text} style={{ fontSize: 16 }}>
                  {dd.getUTCDate()}
                </Txt>
              </Pressable>
            );
          })}
        </ScrollView>

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
          <StatTile value={`${occupancy}%`} label="Occupation (7 j)" color={colors.green} bg={colors.greenSoft} />
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
                    {r.court} · {r.players} joueur{r.players > 1 ? 's' : ''}
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
                      void confirmReservationByClub(r.id).then((ok) => {
                        if (!ok) {
                          hapticWarning();
                          toast.show('Action impossible — réessaie', { icon: 'alert-circle' });
                          return;
                        }
                        hapticSuccess();
                        // Confirmation posée + numéro connu → on PROPOSE de prévenir le joueur
                        // dans la foulée (boucle fermée « confirmée → joueur prévenu », sans
                        // dépendre d’un second tap que le gérant oublie souvent).
                        if (!wasConfirmed && r.bookedBy?.phone) {
                          // confirmAsync : cross-plateforme (sur le web l'Alert natif ne s'affiche pas).
                          void confirmAsync('Réservation confirmée ✓', `Prévenir ${r.bookedBy.name} par WhatsApp ?`, {
                            confirmLabel: 'Envoyer',
                            cancelLabel: 'Plus tard',
                          }).then((send) => {
                            if (send)
                              openWhatsApp(
                                r.bookedBy!.phone,
                                `Bonjour ${r.bookedBy!.name}, votre réservation du ${dateKeyLabel(r.dateKey)} à ${r.time} (${r.court}) à ${club.name} est bien confirmée ✅`,
                              );
                          });
                        }
                      });
                    }}
                    full
                  />
                </View>
                {r.bookedBy?.phone ? (
                  <Button
                    size="sm"
                    label="WhatsApp"
                    icon="logo-whatsapp"
                    variant="secondary"
                    onPress={() =>
                      openWhatsApp(
                        r.bookedBy!.phone,
                        // Le message ne doit affirmer « confirmée » QUE si elle l’est vraiment
                        // côté serveur (r.clubConfirmed) — sinon on informe sans mentir au joueur.
                        r.clubConfirmed
                          ? `Bonjour ${r.bookedBy!.name}, votre réservation du ${dateKeyLabel(r.dateKey)} à ${r.time} (${r.court}) à ${club.name} est bien confirmée ✅`
                          : `Bonjour ${r.bookedBy!.name}, votre réservation du ${dateKeyLabel(r.dateKey)} à ${r.time} (${r.court}) à ${club.name} est bien reçue, je reviens vers vous pour la confirmer.`,
                      )
                    }
                  />
                ) : null}
              </View>
              {/* Le joueur n’est pas venu (y c. annulation tardive par téléphone) : libère le
                  créneau et compte l’absence. Proposé seulement une fois le créneau COMMENCÉ —
                  avant, un tap par erreur compterait une absence injuste des jours à l’avance. */}
              {r.startsAt <= now ? (
                <Button size="sm" label="Pas venu" icon="person-remove-outline" variant="ghost" onPress={() => onMarkNoShow(r)} full />
              ) : null}
              {/* Annulation par le CLUB (75) : ce créneau chevauche une réservation prise HORS APP
                  (téléphone / sur place). On l'annule à tout moment sans pénaliser le joueur, et on
                  lui envoie un message + une proposition d'alternative (via notify-club). */}
              <Button
                size="sm"
                label="Annuler ce créneau (chevauchement)"
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
                Ces créneaux ont été annulés par le joueur et sont de nouveau libres à la réservation.
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
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      {/* Historique du club — regroupé par semaine, base de la commission PadelConnect */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title={`Historique · ${pastRes.length}`} />
        {pastRes.length === 0 ? (
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
                    {now - r.startsAt <= 48 * 3600 * 1000 ? (
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
          La commission PadelConnect se calcule sur cet historique — décompte transmis chaque fin de semaine, règlement par Wave.
        </Txt>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  relNote: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
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
