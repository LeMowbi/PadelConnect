import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { Reveal, staggerDelay } from '@/components/Reveal';
import { Screen } from '@/components/Screen';
import { Button, Card, Divider, EmptyState, SectionHeader, Tag, Txt } from '@/components/ui';
import { findClub } from '@/data/clubs';
import { seedCompetitions } from '@/data/competitions';
import { useToast } from '@/components/Toast';
import { isPlayed, useApp, type Reservation } from '@/store/AppContext';
import { addReservationToCalendar } from '@/lib/calendar';
import { openWhatsApp } from '@/lib/contact';
import { hapticSuccess } from '@/lib/haptics';
import { fetchMyMatchScores, leaveOpenMatch, setMatchOpen, submitMatchScore, type MatchScore, type MatchSet } from '@/lib/matchResults';
import { fetchCancelledReservations } from '@/lib/reservations';
import { dateKeyLabel, dayKey } from '@/lib/days';
import { fcfa, perPlayer, perPlayerOf } from '@/lib/format';
import { APP_DOMAIN } from '@/lib/referrals';
import { openMaps } from '@/lib/maps';
import { usePullToRefresh } from '@/lib/usePullToRefresh';
import { colors, radius, spacing } from '@/theme';

const FIVE_H = 5 * 3600000;
const PAST_PREVIEW = 5; // passées : 5 dernières + « Voir tout »
const MONTHS = ['JANV.', 'FÉVR.', 'MARS', 'AVR.', 'MAI', 'JUIN', 'JUIL.', 'AOÛT', 'SEPT.', 'OCT.', 'NOV.', 'DÉC.'];

// Brouillon de saisie du score : 3 sets max, champs texte vides (jamais muté — les mises à
// jour recréent le tableau).
const EMPTY_SETS: { me: string; them: string }[] = [
  { me: '', them: '' },
  { me: '', them: '' },
  { me: '', them: '' },
];

// Transforme le brouillon en sets valides, ou explique ce qui manque (helper pur).
function parseSetDrafts(drafts: { me: string; them: string }[]): { sets: MatchSet[]; error: string | null; iWin: boolean } {
  const sets: MatchSet[] = [];
  for (let i = 0; i < drafts.length; i++) {
    const { me, them } = drafts[i];
    if (me === '' && them === '') continue; // set non joué
    if (me === '' || them === '') return { sets: [], error: `Complète les deux scores du set ${i + 1}.`, iWin: false };
    const m = Number(me);
    const t = Number(them);
    if (m > 30 || t > 30) return { sets: [], error: `Score de set trop grand (set ${i + 1}).`, iWin: false };
    if (m === t) return { sets: [], error: `Un set ne peut pas finir à égalité (set ${i + 1}).`, iWin: false };
    sets.push({ me: m, them: t });
  }
  if (sets.length === 0) return { sets: [], error: 'Saisis au moins un set (ex. 6 – 3).', iWin: false };
  const mine = sets.filter((s) => s.me > s.them).length;
  if (mine * 2 === sets.length) return { sets: [], error: 'Match nul impossible — ajoute le set décisif.', iWin: false };
  return { sets, error: null, iWin: mine * 2 > sets.length };
}

export default function ReservationsScreen() {
  const router = useRouter();
  const { state, myReservations, cancelReservation, respondInvitation, cancelMyLesson, refreshLessons, refreshSession } = useApp();
  const toast = useToast();
  // Passées : pagination INCRÉMENTALE (+20) — « tout » d'un coup monterait des centaines de
  // lignes animées dans un ScrollView non virtualisé chez un joueur assidu.
  const [pastShownCount, setPastShownCount] = useState(PAST_PREVIEW);
  const [cancelTarget, setCancelTarget] = useState<Reservation | null>(null); // confirmation avant annulation
  const [cancellingLesson, setCancellingLesson] = useState<string | null>(null); // garde anti double-tap

  // SCORE DE MATCH (46) : chaque joueur saisit les sets de SON point de vue, l'app désigne
  // le vainqueur automatiquement dès que deux saisies concordent (+3 pts au classement).
  const [scores, setScores] = useState<Record<string, MatchScore>>({}); // par id de réservation
  const [scoreTarget, setScoreTarget] = useState<Reservation | null>(null); // fiche « Le score du match »
  // 3 sets max, chaque champ saisi en texte (clavier numérique) — '' = set non joué.
  const [setDrafts, setSetDrafts] = useState<{ me: string; them: string }[]>(EMPTY_SETS);
  const [scoreSending, setScoreSending] = useState(false); // garde anti double-tap

  // MATCHS OUVERTS (48) : quitter un match rejoint, ou (créateur) le fermer/rouvrir aux
  // nouveaux. Le serveur fait foi (retour au premier plan) ; ici on reflète l'action
  // immédiatement en local : `leftIds` masque un match quitté, `openOverride` bascule le libellé.
  const [leftIds, setLeftIds] = useState<string[]>([]);
  const [openOverride, setOpenOverride] = useState<Record<string, boolean>>({});
  const [matchBusy, setMatchBusy] = useState<string | null>(null);

  // ANNULÉES : une réservation annulée reste VISIBLE ici (section dédiée, badge « Annulée »)
  // au lieu de disparaître en silence (demande porteur). Le serveur garde la trace
  // (status='cancelled') ; on ne montre que MON périmètre (créateur ou participant) — un
  // gérant-joueur ne voit pas ici les annulations des autres clients de son club.
  const [cancelled, setCancelled] = useState<Reservation[]>([]);
  const inMyPerimeter = (r: Reservation) => r.userId === state.serverUserId || state.participantReservationIds.includes(r.id);

  const loadScores = async () => {
    const list = await fetchMyMatchScores();
    if (list) setScores(Object.fromEntries(list.map((m) => [m.reservationId, m])));
  };
  const loadCancelled = async () => {
    const rows = await fetchCancelledReservations();
    if (rows) setCancelled(rows.filter(inMyPerimeter)); // null = échec réseau → on garde l'existant (§8)
  };
  useEffect(() => {
    if (!state.serverUserId) return;
    let alive = true;
    void fetchMyMatchScores().then((list) => {
      if (!alive || !list) return;
      setScores(Object.fromEntries(list.map((m) => [m.reservationId, m])));
    });
    void fetchCancelledReservations().then((rows) => {
      if (!alive || !rows) return;
      setCancelled(rows.filter((r) => r.userId === state.serverUserId || state.participantReservationIds.includes(r.id)));
    });
    return () => {
      alive = false;
    };
    // participantReservationIds ne doit pas re-déclencher le chargement (seul le compte compte).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.serverUserId]);

  // Tirer pour rafraîchir : resynchronise mes réservations, mes cours, les scores ET les annulées.
  const { refreshControl } = usePullToRefresh(async () => {
    await Promise.all([refreshLessons(), loadScores(), loadCancelled()]);
  });

  const now = Date.now();
  // « Mes réservations » = celles que j’ai créées + celles où un ami m’a invité (résa
  // PARTAGÉE). La source unique est `myReservations` (cf. AppContext) : un compte
  // club/opérateur ne voit donc pas le périmètre RLS de son club sur cet écran joueur.
  const mine = myReservations;
  // Suis-je l’AUTEUR de la résa ? (sinon je suis invité → pas d’annulation, RLS = auteur).
  // Une résa avec un bookedBy mais sans mon user_id = je suis invité, même hors session :
  // on ne propose donc PAS « Annuler » à un invité.
  const isOwner = (r: Reservation) => (state.serverUserId ? !r.userId || r.userId === state.serverUserId : !r.bookedBy);
  // Invitations à confirmer (résa partagée) : on les sort de « À venir » tant qu’elles sont
  // en attente, pour les présenter à part avec Accepter / Refuser.
  const isPending = (r: Reservation) => state.pendingInvitationIds.includes(r.id);
  const upcomingAll = mine.filter((r) => !isPlayed(r, now)).sort((a, b) => a.startsAt - b.startsAt);
  const pendingInvites = upcomingAll.filter(isPending);
  const upcoming = upcomingAll.filter((r) => !isPending(r) && !leftIds.includes(r.id));
  const past = mine.filter((r) => isPlayed(r, now)).sort((a, b) => b.startsAt - a.startsAt);
  const pastShown = past.slice(0, pastShownCount);

  // Mes demandes de COURS (coach) encore vivantes : en attente de réponse du coach, ou refusées
  // à venir (pour que le refus laisse une trace ici, pas seulement une notification). Un cours
  // ACCEPTÉ devient une réservation normale — il apparaît déjà dans « À venir » (badge coach).
  const lessonRequests = state.myLessons
    .filter((l) => (l.status === 'pending' || l.status === 'declined') && l.startsAt > now)
    .sort((a, b) => a.startsAt - b.startsAt);

  const cancelLesson = async (id: string) => {
    if (cancellingLesson) return;
    setCancellingLesson(id);
    const ok = await cancelMyLesson(id);
    setCancellingLesson(null);
    toast.show(ok ? 'Demande de cours annulée' : 'Annulation impossible — réessaie', ok ? undefined : { icon: 'alert-circle' });
  };

  // Mes tournois : ceux où mon équipe est inscrite ET ceux que J’AI créés (dédupliqués),
  // pour qu’un défi créé sans s’y inscrire reste retrouvable ici (et clôturable).
  const today = dayKey(new Date());
  const myCompIds = new Set([
    ...Object.keys(state.compRegistrations),
    ...state.myCompetitions.filter((c) => c.createdByMe).map((c) => c.id),
  ]);
  const myComps = [...myCompIds]
    .map((id) => [...state.myCompetitions, ...seedCompetitions].find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => !!c)
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey));

  // Récap envoyé aux partenaires (WhatsApp s’ouvre avec le message, tu choisis le destinataire).
  // La part se calcule sur le PRIX RÉEL du créneau et l'EFFECTIF RÉEL du match (créateur +
  // invités) : « /4 » sur une résa à 2 annoncerait la moitié de la vraie part à payer au club.
  const notifyPartners = (r: Reservation) => {
    const who = r.invited.length ? `\nÉquipe : ${r.invited.map((i) => i.name).join(', ')}` : '';
    const share = r.price ? `\nPrévois ${perPlayerOf(r.price, 1 + r.invited.length)} chacun.` : '';
    openWhatsApp(
      '',
      `On joue au padel ! 🎾\n${r.clubName} — ${dateKeyLabel(r.dateKey)} à ${r.time} (session 1h30)\n${r.court}${who}${share}\nRéservé via PadelConnect.`,
    );
  };

  // Il manque des joueurs : appel à recrues sur WhatsApp (groupe/contact au choix), avec le
  // lien Universal du club — un padel se joue à 4 et l'app démarre sans réseau d'amis (le
  // message circule là où les joueurs d'Abidjan sont déjà : leurs groupes WhatsApp).
  const findPlayers = (r: Reservation) => {
    const missing = Math.max(1, 3 - r.invited.length);
    openWhatsApp(
      '',
      `Il me manque ${missing} joueur${missing > 1 ? 's' : ''} au padel ! 🎾\n` +
        `${r.clubName} — ${dateKeyLabel(r.dateKey)} à ${r.time} (session 1h30)${r.price ? ` · ~${perPlayer(r.price)}/joueur` : ''}\n` +
        `Qui vient ? ${APP_DOMAIN}/club/${r.clubId}`,
    );
  };

  const respond = async (r: Reservation, accept: boolean) => {
    const ok = await respondInvitation(r.id, accept);
    if (ok) {
      if (accept) hapticSuccess();
      toast.show(accept ? 'Invitation acceptée ✓' : 'Invitation refusée');
    } else toast.show('Action impossible — réessaie', { icon: 'alert-circle' });
  };

  // Synchronise une résa À VENIR dans le calendrier du téléphone (même helper que l’écran de
  // succès — l’habitué réserve plusieurs jours à l’avance et veut la retrouver dans son agenda).
  const addToCalendar = async (r: Reservation) => {
    const club = findClub(r.clubId, state.customClubs, state.clubInfo);
    const res = await addReservationToCalendar({ clubName: r.clubName, startsAt: r.startsAt, court: r.court, area: club?.area ?? '' });
    // « canceled » = l'utilisateur a refermé la fiche système lui-même : pas de toast d'erreur.
    if (res === 'canceled') return;
    toast.show(
      res === 'added' ? 'Ajouté à ton calendrier ✓' : 'Calendrier indisponible sur cet appareil.',
      res === 'added' ? undefined : { icon: 'alert-circle' },
    );
  };

  // Ouvre la fiche « Le score du match » (saisie vierge à chaque ouverture).
  const openScore = (r: Reservation) => {
    setScoreTarget(r);
    setSetDrafts(EMPTY_SETS);
  };

  const parsed = parseSetDrafts(setDrafts);
  const sendScore = async () => {
    if (!scoreTarget || parsed.error || scoreSending) return;
    setScoreSending(true);
    const res = await submitMatchScore(scoreTarget.id, parsed.sets);
    setScoreSending(false);
    setScoreTarget(null);
    if (res === 'validated') {
      hapticSuccess();
      toast.show('Score validé ✓ — le match compte au classement');
    } else if (res === 'waiting') {
      // Règle 49 réelle : seule une saisie GAGNANTE restée SEULE est auto-validée à 48 h ;
      // sinon il faut qu'un joueur du camp perdant confirme. Promesse honnête selon le cas.
      toast.show(
        parsed.iWin
          ? 'Score enregistré — validé dès qu’un adversaire confirme (ou automatiquement sous 48 h si ta saisie reste la seule).'
          : 'Score enregistré — validé dès qu’un joueur du camp gagnant saisit le même score.',
      );
    } else if (res === 'conflict') {
      toast.show('Ton score ne correspond pas à celui déjà saisi — vérifiez ensemble.', { icon: 'alert-circle' });
    } else if (res === 'no_players') {
      toast.show('Ajoute un partenaire (compte PadelConnect) à la réservation pour compter le score.', { icon: 'alert-circle' });
      return;
    } else {
      toast.show('Enregistrement impossible — réessaie', { icon: 'alert-circle' });
      return;
    }
    void loadScores();
  };

  // Quitter un match ouvert qu'on a rejoint : place réellement libérée côté serveur (48).
  const leaveMatch = async (r: Reservation) => {
    if (matchBusy) return;
    setMatchBusy(r.id);
    const ok = await leaveOpenMatch(r.id);
    setMatchBusy(null);
    if (ok) {
      setLeftIds((cur) => [...cur, r.id]);
      toast.show('Tu as quitté le match — ta place est libérée.');
      // Propage au miroir global (participations + réservations) : sans ça, au retour sur
      // l'écran (leftIds réinitialisé) le match réapparaissait et un 2ᵉ départ échouait.
      void refreshSession();
    } else toast.show('Impossible de quitter — réessaie', { icon: 'alert-circle' });
  };
  // Le créateur ferme / rouvre son match aux nouveaux joueurs (les places prises restent).
  const toggleMatchOpen = async (r: Reservation) => {
    if (matchBusy) return;
    const current = openOverride[r.id] ?? !!r.openMatch;
    setMatchBusy(r.id);
    const ok = await setMatchOpen(r.id, !current);
    setMatchBusy(null);
    if (ok) {
      setOpenOverride((cur) => ({ ...cur, [r.id]: !current }));
      toast.show(!current ? 'Match rouvert aux joueurs' : 'Match fermé aux nouveaux joueurs');
    } else toast.show('Action impossible — réessaie', { icon: 'alert-circle' });
  };

  // Matchs où un AUTRE joueur a saisi son score et pas moi → invitation à saisir. Pas de coupe
  // à 14 jours ici : dès qu'une saisie existe (donc `s` défini), la contestation reste ouverte
  // côté serveur (48) — la fenêtre de 14 j ne borne que la toute PREMIÈRE saisie.
  const scorePrompts = past.filter((r) => {
    const s = scores[r.id];
    return !!s && !s.mine && !s.validated;
  });

  return (
    <Screen
      back
      title="Mes réservations"
      subtitle="À venir, statut du club, passées"
      refreshControl={state.serverUserId ? refreshControl : undefined}
    >
      {/* Invitations à confirmer — un ami t’a ajouté à sa réservation partagée. */}
      {pendingInvites.length > 0 ? (
        <View style={{ marginTop: spacing.sm }}>
          <SectionHeader title={`Invitations · ${pendingInvites.length}`} />
          {pendingInvites.map((r) => (
            <Card key={r.id} style={{ marginBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Txt variant="h3" style={{ fontSize: 15 }} numberOfLines={1}>
                    {r.clubName}
                  </Txt>
                  <Txt variant="muted">
                    {dateKeyLabel(r.dateKey)} · {r.time} · {r.court}
                  </Txt>
                  {r.bookedBy ? (
                    <Txt variant="small" color={colors.textFaint} style={{ marginTop: 2 }}>
                      Invité par {r.bookedBy.name}
                    </Txt>
                  ) : null}
                </View>
                <Tag label="À confirmer" tone="purple" icon="mail-unread" />
              </View>
              <Divider style={{ marginVertical: spacing.md }} />
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Button size="sm" label="J’accepte" icon="checkmark" onPress={() => respond(r, true)} full />
                </View>
                <Button size="sm" label="Refuser" icon="close" variant="ghost" onPress={() => respond(r, false)} />
              </View>
            </Card>
          ))}
        </View>
      ) : null}

      {/* Scores à saisir — un autre joueur du match a mis son score, il manque le mien
          (dès que deux saisies concordent, l'app valide le match automatiquement). */}
      {scorePrompts.length > 0 ? (
        <View style={{ marginTop: spacing.sm }}>
          <SectionHeader title={`Scores à saisir · ${scorePrompts.length}`} />
          {scorePrompts.map((r) => {
            const s = scores[r.id];
            return (
              <Card key={r.id} style={{ marginBottom: spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <Txt variant="h3" style={{ fontSize: 15 }} numberOfLines={1}>
                      {r.clubName}
                    </Txt>
                    <Txt variant="muted">
                      {dateKeyLabel(r.dateKey)} · {r.time} · {r.court}
                    </Txt>
                  </View>
                  <Tag label="Score" tone="amber" icon="trophy-outline" />
                </View>
                <Txt variant="small" color={colors.textMuted} style={{ marginTop: spacing.sm }}>
                  {s.conflict
                    ? 'Les scores déjà saisis ne correspondent pas — demandez à celui qui s’est trompé de corriger sa saisie.'
                    : `${s.enteredNames || 'Un joueur'} a mis ${s.score}. Si tu as perdu, saisis ton score pour valider tout de suite.`}
                </Txt>
                <Divider style={{ marginVertical: spacing.md }} />
                <Button size="sm" label="Mettre mon score" icon="trophy-outline" onPress={() => openScore(r)} full />
                <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
                  Le match ne compte que si un joueur du camp perdant confirme le score (ou si la saisie du vainqueur reste la seule pendant
                  48 h).
                </Txt>
              </Card>
            );
          })}
        </View>
      ) : null}

      {/* Mes cours — demandes envoyées aux coachs (le terrain n’est réservé qu’à l’acceptation) */}
      {lessonRequests.length > 0 ? (
        <View style={{ marginTop: spacing.sm }}>
          <SectionHeader title={`Mes cours · ${lessonRequests.length}`} />
          {lessonRequests.map((l, i) => (
            <Reveal key={l.id} delay={staggerDelay(i)}>
              <Card style={{ marginBottom: spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <Txt variant="h3" style={{ fontSize: 15 }} numberOfLines={1}>
                      Cours avec {l.coachName}
                    </Txt>
                    <Txt variant="muted">
                      {l.clubName} · {l.dateLabel} à {l.time} · {l.court}
                    </Txt>
                  </View>
                  {l.status === 'pending' ? (
                    <Tag label="Attente coach" tone="purple" icon="hourglass-outline" />
                  ) : (
                    <Tag label="Refusé" tone="coral" icon="close-circle" />
                  )}
                </View>
                {l.status === 'pending' ? (
                  <>
                    <Txt variant="small" color={colors.textMuted} style={{ marginTop: spacing.sm }}>
                      Le terrain sera réservé dès que {l.coachName} accepte — tu recevras une notification.
                    </Txt>
                    <View style={{ marginTop: spacing.sm, alignSelf: 'flex-start' }}>
                      <Button
                        size="sm"
                        label={cancellingLesson === l.id ? 'Annulation…' : 'Annuler ma demande'}
                        icon="close"
                        variant="ghost"
                        onPress={() => void cancelLesson(l.id)}
                        disabled={cancellingLesson !== null}
                      />
                    </View>
                  </>
                ) : (
                  <Txt variant="small" color={colors.textMuted} style={{ marginTop: spacing.sm }}>
                    {l.coachName} n’était pas disponible sur ce créneau — tu peux redemander un autre horaire.
                  </Txt>
                )}
              </Card>
            </Reveal>
          ))}
        </View>
      ) : null}

      {/* À venir */}
      <View style={{ marginTop: spacing.sm }}>
        <SectionHeader title={`À venir · ${upcoming.length}`} />
        {upcoming.length === 0 ? (
          <Card>
            <EmptyState
              icon="calendar-outline"
              title="Aucune réservation à venir"
              text="Réserve un terrain : il apparaîtra ici avec son statut."
              actionLabel="Réserver un terrain"
              onAction={() => router.push('/reserver')}
            />
          </Card>
        ) : (
          upcoming.map((r, idx) => {
            const owner = isOwner(r);
            const canCancel = owner && r.startsAt - now > FIVE_H;
            const [, mm, dd] = r.dateKey.split('-');
            // Sans zéro initial pour rester cohérent avec dateKeyLabel (« 1 juil. », pas « 01 »).
            const day = dd ? String(Number(dd)) : '';
            const month = MONTHS[Number(mm) - 1] ?? '';
            return (
              <Reveal key={r.id} delay={staggerDelay(idx)}>
                <Card style={{ marginBottom: spacing.md }}>
                  <View style={styles.row}>
                    <View style={styles.dateChip}>
                      <Txt variant="h2" color={colors.onSignature} style={styles.dateDay}>
                        {day}
                      </Txt>
                      <Txt variant="small" color={colors.onSignature} style={styles.dateMonth}>
                        {month}
                      </Txt>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Txt variant="h3" style={{ fontSize: 15 }} numberOfLines={1}>
                        {r.clubName}
                      </Txt>
                      <Txt variant="muted">
                        {r.time} · {r.court} · 1h30
                      </Txt>
                      {r.price ? (
                        <Txt variant="small" color={colors.signature} style={{ fontWeight: '700' }}>
                          {fcfa(r.price)} · ~{perPlayer(r.price)}/joueur à 4
                        </Txt>
                      ) : null}
                    </View>
                    {r.clubConfirmed ? (
                      <Tag label="Confirmé" tone="green" icon="checkmark-circle" />
                    ) : (
                      // « En attente » faisait douter (« mon terrain est-il tenu ? ») — le
                      // terrain EST bloqué dès la réservation, seul l'accusé du club manque.
                      <Tag label="Le club confirme…" tone="amber" icon="hourglass-outline" />
                    )}
                  </View>
                  {!r.clubConfirmed ? (
                    <Txt variant="small" color={colors.textMuted} style={{ marginTop: spacing.xs }}>
                      Ton terrain est bien bloqué — le club valide simplement de son côté.
                    </Txt>
                  ) : null}

                  {r.coachName ? (
                    // Réservation née d’un COURS accepté par le coach (respond_lesson).
                    <View style={styles.participants}>
                      <Ionicons name="school-outline" size={14} color={colors.purple} />
                      <Txt variant="small" color={colors.textMuted} style={{ flex: 1 }}>
                        Cours avec {r.coachName}
                      </Txt>
                    </View>
                  ) : null}
                  {!owner && r.bookedBy?.name ? (
                    <View style={styles.participants}>
                      <Ionicons name="person-circle-outline" size={14} color={colors.signature} />
                      <Txt variant="small" color={colors.textMuted} style={{ flex: 1 }}>
                        Réservé par {r.bookedBy.name} — tu es invité
                      </Txt>
                    </View>
                  ) : r.invited.length > 0 ? (
                    <View style={styles.participants}>
                      <Ionicons name="people-outline" size={14} color={colors.textMuted} />
                      <Txt variant="small" color={colors.textMuted} style={{ flex: 1 }}>
                        Avec {r.invited.map((i) => i.name).join(', ')}
                      </Txt>
                    </View>
                  ) : null}

                  <Divider style={{ marginVertical: spacing.md }} />
                  {/* Raccourcis contextuels : club + itinéraire + calendrier — chacun dans un
                      flex:1 pour que la rangée tienne toujours dans la largeur (petits écrans). */}
                  <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
                    <View style={{ flex: 1 }}>
                      <Button
                        size="sm"
                        label="Voir le club"
                        icon="business-outline"
                        variant="secondary"
                        onPress={() => router.push(`/club/${r.clubId}`)}
                        pill
                        full
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button
                        size="sm"
                        label="Itinéraire"
                        icon="navigate-outline"
                        variant="secondary"
                        onPress={() => {
                          const club = findClub(r.clubId, state.customClubs, state.clubInfo);
                          if (club) openMaps(club);
                        }}
                        pill
                        full
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button
                        size="sm"
                        label="Calendrier"
                        icon="calendar-outline"
                        variant="secondary"
                        onPress={() => void addToCalendar(r)}
                        pill
                        full
                      />
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <View style={{ flex: 1 }}>
                      <Button
                        size="sm"
                        label={r.invited.length < 3 && owner && !r.coachName ? 'Chercher des joueurs' : 'Prévenir mes partenaires'}
                        icon="logo-whatsapp"
                        variant="secondary"
                        onPress={() => (r.invited.length < 3 && owner && !r.coachName ? findPlayers(r) : notifyPartners(r))}
                        pill
                        full
                      />
                    </View>
                    {canCancel ? (
                      <Button size="sm" label="Annuler" icon="close" variant="danger" onPress={() => setCancelTarget(r)} pill />
                    ) : null}
                  </View>
                  {/* Matchs ouverts (48) : le créateur ferme/rouvre aux nouveaux ; un joueur qui a
                      rejoint peut quitter (sa place se libère). Les contrôles ne sont PAS gatés
                      sur l'état ouvert/fermé courant (sinon fermer faisait disparaître « Rouvrir »
                      après resynchro) : le créateur les voit tant qu'il reste des places, le
                      joueur inscrit tant qu'il est un participant accepté. Un COURS de coach
                      (r.coachName) ne s'ouvre jamais : des inconnus rejoindraient un cours que le
                      coach n'a pas accepté de donner à 4 (le serveur le refuse aussi, SQL 53). */}
                  {owner && !r.coachName && r.invited.length < 3 ? (
                    <View style={{ marginTop: spacing.sm, alignSelf: 'flex-start' }}>
                      <Button
                        size="sm"
                        variant="ghost"
                        label={
                          matchBusy === r.id
                            ? '…'
                            : (openOverride[r.id] ?? !!r.openMatch)
                              ? 'Fermer aux nouveaux joueurs'
                              : 'Ouvrir le match aux joueurs'
                        }
                        icon={(openOverride[r.id] ?? !!r.openMatch) ? 'lock-closed-outline' : 'lock-open-outline'}
                        onPress={() => void toggleMatchOpen(r)}
                        disabled={matchBusy !== null}
                      />
                    </View>
                  ) : !owner && r.bookedBy && state.participantReservationIds.includes(r.id) ? (
                    <View style={{ marginTop: spacing.sm, alignSelf: 'flex-start' }}>
                      <Button
                        size="sm"
                        variant="ghost"
                        label={matchBusy === r.id ? '…' : 'Je ne peux plus venir'}
                        icon="exit-outline"
                        onPress={() => void leaveMatch(r)}
                        disabled={matchBusy !== null}
                      />
                    </View>
                  ) : null}
                  {owner && !canCancel
                    ? (() => {
                        // À moins de 5 h, l'annulation passe par le club (décision porteur) :
                        // message ACTIONNABLE — un tap ouvre WhatsApp si le club a un numéro.
                        const clubPhone = findClub(r.clubId, state.customClubs, state.clubInfo)?.contactPhone;
                        const note = (
                          <Txt variant="small" color={colors.textFaint} style={{ flexShrink: 1, textAlign: 'center' }}>
                            Annulation impossible (moins de 5h avant) — à voir directement avec le club.
                          </Txt>
                        );
                        return clubPhone ? (
                          <Pressable
                            onPress={() =>
                              openWhatsApp(
                                clubPhone,
                                `Bonjour, je dois annuler ma réservation du ${dateKeyLabel(r.dateKey)} à ${r.time} (${r.court}) — désolé pour le contretemps.`,
                              )
                            }
                            style={{ marginTop: spacing.sm, alignItems: 'center', gap: 2 }}
                            accessibilityRole="button"
                            accessibilityLabel="Contacter le club sur WhatsApp pour annuler"
                          >
                            {note}
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <Ionicons name="logo-whatsapp" size={13} color={colors.signature} />
                              <Txt variant="small" color={colors.signature} style={{ fontWeight: '600' }}>
                                Contacter le club
                              </Txt>
                            </View>
                          </Pressable>
                        ) : (
                          <View style={{ marginTop: spacing.sm, alignItems: 'center' }}>{note}</View>
                        );
                      })()
                    : null}
                </Card>
              </Reveal>
            );
          })
        )}
      </View>

      {/* Mes tournois */}
      {myComps.length > 0 ? (
        <View style={{ marginTop: spacing.xl }}>
          <SectionHeader title={`Mes tournois · ${myComps.length}`} />
          <Card>
            {myComps.map((c, i) => {
              const result = state.compResults[c.id];
              const myResult = state.officialResults.find((o) => o.compId === c.id);
              // Fin de plage incluse : un tournoi multi-jours EN COURS reste « À venir ».
              const finished = (c.endDateKey ?? c.dateKey) < today;
              // Inscrit → « avec {partenaire} » ; créé sans s’y inscrire → « organisé par toi ».
              const reg = state.compRegistrations[c.id];
              const subtitle = reg ? `${c.date} · avec ${reg.partner}` : `${c.date} · organisé par toi`;
              return (
                <Reveal key={c.id} delay={staggerDelay(i)}>
                  <View>
                    {i > 0 ? <Divider style={{ marginVertical: spacing.sm }} /> : null}
                    <Card onPress={() => router.push(`/competition/${c.id}`)} style={styles.compRow}>
                      <View style={{ flex: 1 }}>
                        <Txt variant="body" style={{ fontWeight: '600' }} numberOfLines={1}>
                          {c.title}
                        </Txt>
                        <Txt variant="small" color={colors.textMuted}>
                          {subtitle}
                        </Txt>
                      </View>
                      {result ? (
                        myResult?.result === 'win' ? (
                          <Tag label="Vainqueur !" tone="amber" icon="trophy" />
                        ) : myResult?.result === 'last' ? (
                          <Tag label="Fin de tableau" tone="coral" icon="arrow-down" />
                        ) : !reg ? (
                          // Organisateur non inscrit à son propre tournoi : « Participé » serait faux.
                          <Tag label="Terminé" tone="neutral" />
                        ) : (
                          <Tag label="Participé" tone="blue" />
                        )
                      ) : finished ? (
                        <Tag label="Résultats à venir" tone="neutral" />
                      ) : (
                        <Tag label="À venir" tone="purple" />
                      )}
                    </Card>
                  </View>
                </Reveal>
              );
            })}
          </Card>
        </View>
      ) : null}

      {/* Passées */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title={`Passées · ${past.length}`} />
        {past.length === 0 ? (
          <Card>
            <EmptyState
              icon="time-outline"
              title="Aucune partie jouée pour l’instant"
              text="Tes parties jouées s’afficheront ici, comptées automatiquement."
            />
          </Card>
        ) : (
          <Card>
            {pastShown.map((r, i) => (
              // L'entrée n'est animée QUE pour l'aperçu initial : les lignes dépliées via
              // « Voir plus » arrivent sans Reveal (pas de rafale d'animations au tap).
              <Reveal key={r.id} delay={i < PAST_PREVIEW ? staggerDelay(i) : 0} disabled={i >= PAST_PREVIEW}>
                <View>
                  {i > 0 ? <Divider style={{ marginVertical: spacing.sm }} /> : null}
                  <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Txt variant="body" style={{ fontWeight: '600' }}>
                        {r.clubName}
                      </Txt>
                      <Txt variant="muted">
                        {dateKeyLabel(r.dateKey)} · {r.time} · {r.court}
                        {scores[r.id]?.score ? ` · ${scores[r.id].score}` : ''}
                      </Txt>
                    </View>
                    {(() => {
                      // Badge résultat (46) : Victoire (score validé) / en attente / discordant — sinon « Jouée ».
                      const s = scores[r.id];
                      if (s?.validated && s.mine && s.iWon) return <Tag label="Victoire" tone="amber" icon="trophy" />;
                      if (s?.conflict) return <Tag label="Scores différents" tone="coral" />;
                      if (s && !s.validated) return <Tag label="Score en attente" tone="purple" icon="hourglass-outline" />;
                      return <Tag label="Jouée" tone="blue" />;
                    })()}
                  </View>
                  {/* A-R7 : « Rejouer ici » → réservation du club, avec l’HEURE habituelle
                      pré-remplie (l’habitué rejoue souvent au même créneau — il ne reste que
                      le jour et le terrain à choisir). */}
                  <View style={{ flexDirection: 'row', gap: spacing.lg }}>
                    <Pressable
                      onPress={() => router.push(`/reserver/${r.clubId}?time=${encodeURIComponent(r.time)}`)}
                      style={styles.replayBtn}
                    >
                      <Ionicons name="refresh-outline" size={13} color={colors.signature} />
                      <Txt variant="small" color={colors.signature} style={{ fontWeight: '600' }}>
                        Rejouer ici
                      </Txt>
                    </Pressable>
                    {/* Saisie du score (46) : matchs récents (≤ 14 jours, fenêtre serveur) —
                        je peux saisir mon score, ou le corriger tant que rien n'est validé. */}
                    {state.serverUserId &&
                    (r.startsAt > now - 14 * 86400000 || !!scores[r.id]) &&
                    (!scores[r.id]?.mine || !scores[r.id].validated) ? (
                      <Pressable onPress={() => openScore(r)} style={styles.replayBtn}>
                        <Ionicons name="trophy-outline" size={13} color={colors.signature} />
                        <Txt variant="small" color={colors.signature} style={{ fontWeight: '600' }}>
                          {scores[r.id]?.mine ? 'Corriger mon score' : 'Mettre le score'}
                        </Txt>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              </Reveal>
            ))}
            {past.length > PAST_PREVIEW ? (
              <Button
                size="sm"
                label={pastShownCount < past.length ? `Voir plus (${past.length - pastShownCount} restantes)` : 'Réduire'}
                variant="ghost"
                onPress={() => setPastShownCount((n) => (n < past.length ? n + 20 : PAST_PREVIEW))}
              />
            ) : null}
          </Card>
        )}
      </View>

      {/* Annulées — la trace reste visible (au lieu de disparaître en silence) : mes annulations
          ET celles d'un créateur dont j'avais rejoint le match. Les 5 plus récentes. */}
      {cancelled.length > 0 ? (
        <View style={{ marginTop: spacing.xl }}>
          <SectionHeader title={`Annulées · ${cancelled.length}`} />
          <Card>
            {cancelled.slice(0, PAST_PREVIEW).map((r, i) => (
              <View key={r.id}>
                {i > 0 ? <Divider style={{ marginVertical: spacing.sm }} /> : null}
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Txt variant="body" color={colors.textMuted} style={{ fontWeight: '600' }}>
                      {r.clubName}
                    </Txt>
                    <Txt variant="small" color={colors.textFaint}>
                      {dateKeyLabel(r.dateKey)} · {r.time} · {r.court}
                      {!isOwner(r) && r.bookedBy?.name ? ` · annulée par ${r.bookedBy.name}` : ''}
                    </Txt>
                  </View>
                  <Tag label="Annulée" tone="coral" icon="close-circle" />
                </View>
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      {/* Confirmation avant annulation — plus de suppression en un seul tap */}
      <BottomSheet
        visible={cancelTarget !== null}
        title="Annuler cette réservation ?"
        subtitle={
          cancelTarget
            ? `${cancelTarget.clubName} — ${dateKeyLabel(cancelTarget.dateKey)} à ${cancelTarget.time} · ${cancelTarget.court}`
            : undefined
        }
        onClose={() => setCancelTarget(null)}
      >
        <Txt variant="body" color={colors.textMuted}>
          Le créneau sera libéré et de nouveau réservable. Le club est prévenu et l’annulation reste visible dans son espace.
        </Txt>
        <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
          <Button
            label="Oui, annuler"
            icon="close-circle"
            variant="danger"
            onPress={() => {
              const target = cancelTarget;
              setCancelTarget(null);
              if (target) {
                void cancelReservation(target.id).then((ok) => {
                  // La résa annulée reste visible (section « Annulées ») au lieu de disparaître.
                  if (ok) setCancelled((cur) => [target, ...cur.filter((x) => x.id !== target.id)]);
                  toast.show(ok ? 'Réservation annulée' : 'Annulation impossible — réessaie', ok ? undefined : { icon: 'alert-circle' });
                });
              }
            }}
            full
          />
          <Button label="Garder ma réservation" variant="secondary" onPress={() => setCancelTarget(null)} full />
        </View>
      </BottomSheet>

      {/* Saisie du score (46) : chaque joueur saisit les sets de SON point de vue — l'app
          désigne le vainqueur automatiquement dès que deux saisies concordent. */}
      <BottomSheet
        visible={scoreTarget !== null}
        title="Le score du match"
        subtitle={scoreTarget ? `${scoreTarget.clubName} — ${dateKeyLabel(scoreTarget.dateKey)} à ${scoreTarget.time}` : undefined}
        onClose={() => setScoreTarget(null)}
      >
        <Txt variant="body" color={colors.textMuted}>
          Saisis les sets de TON point de vue (ton équipe d’abord). Le match est validé quand un joueur du camp PERDANT confirme le même
          score ; une saisie de victoire restée seule 48 h est validée automatiquement — une victoire vaut +3 pts au classement.
        </Txt>
        {scoreTarget && scores[scoreTarget.id] && !scores[scoreTarget.id].mine && scores[scoreTarget.id].score ? (
          <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
            Déjà saisi par {scores[scoreTarget.id].enteredNames || 'un joueur'} : {scores[scoreTarget.id].score} (vu du vainqueur).
          </Txt>
        ) : null}
        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          {setDrafts.map((d, i) => (
            <View key={i} style={styles.setRow}>
              <Txt variant="body" style={{ fontWeight: '600', width: 52 }}>
                Set {i + 1}
              </Txt>
              <TextInput
                value={d.me}
                onChangeText={(t) => setSetDrafts((cur) => cur.map((s, j) => (j === i ? { ...s, me: t.replace(/\D/g, '') } : s)))}
                placeholder="—"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                maxLength={2}
                style={styles.setInput}
                accessibilityLabel={`Set ${i + 1}, jeux de ton équipe`}
              />
              <Txt variant="body" color={colors.textMuted}>
                –
              </Txt>
              <TextInput
                value={d.them}
                onChangeText={(t) => setSetDrafts((cur) => cur.map((s, j) => (j === i ? { ...s, them: t.replace(/\D/g, '') } : s)))}
                placeholder="—"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                maxLength={2}
                style={styles.setInput}
                accessibilityLabel={`Set ${i + 1}, jeux des adversaires`}
              />
              {i === 0 ? (
                <Txt variant="small" color={colors.textFaint} style={{ flex: 1 }}>
                  nous – eux
                </Txt>
              ) : (
                <Txt variant="small" color={colors.textFaint} style={{ flex: 1 }}>
                  optionnel
                </Txt>
              )}
            </View>
          ))}
        </View>
        {/* Verdict EN DIRECT : le joueur voit ce que sa saisie veut dire avant d'envoyer. */}
        <Txt
          variant="small"
          color={parsed.error ? colors.textMuted : parsed.iWin ? colors.signature : colors.coral}
          style={{ marginTop: spacing.sm, fontWeight: '600' }}
        >
          {parsed.error ?? (parsed.iWin ? '→ Victoire de ton équipe 🏆' : '→ Défaite de ton équipe')}
        </Txt>
        <View style={{ marginTop: spacing.lg }}>
          <Button
            label={scoreSending ? 'Enregistrement…' : 'Enregistrer mon score'}
            icon="trophy"
            onPress={() => void sendScore()}
            disabled={parsed.error !== null || scoreSending}
            full
          />
        </View>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dateChip: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.signature,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateDay: { lineHeight: 24 },
  dateMonth: { fontSize: 9, letterSpacing: 0.5, opacity: 0.85 },
  compRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: 0,
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
    backgroundColor: 'transparent',
  },
  participants: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  replayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
    paddingVertical: 2,
  },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  setInput: {
    width: 56,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
  },
});
