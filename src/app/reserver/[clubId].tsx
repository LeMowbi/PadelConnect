import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { Confetti } from '@/components/Confetti';
import { LevelRangePicker } from '@/components/LevelRangePicker';
import { PopIn } from '@/components/PopIn';
import { Reveal } from '@/components/Reveal';
import { Screen } from '@/components/Screen';
import { StickyBar } from '@/components/StickyBar';
import { Stepper } from '@/components/Stepper';
import { useToast } from '@/components/Toast';
import { Button, Card, EmptyState, IconCircle, Txt, type IconName } from '@/components/ui';
import { activeClubs, findClub } from '@/data/clubs';
import { seedCompetitions } from '@/data/competitions';
import { addReservationToCalendar } from '@/lib/calendar';
import { openWhatsApp } from '@/lib/contact';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  courtsFor,
  freeCourts,
  freeCourtSlotsAt,
  hasFullDayCompetition,
  openSlotsFor,
  resolvedGridFor,
  type AvailCtx,
} from '@/lib/availability';
import { durationLabel, offeredDurations, slotDurationAt } from '@/lib/courtSchedule';
import { dateKeyLabel, nextDays, slotTimestamp } from '@/lib/days';
import { fcfa, perPlayerOf } from '@/lib/format';
import { snapLevel, type LevelRange } from '@/lib/levelRange';
import { minPrice, priceForSlot, priceTiersFor } from '@/lib/pricing';
import { fetchMySlotWaitlist, joinSlotWaitlist, leaveSlotWaitlist } from '@/lib/social';
import { useTodayKey } from '@/lib/useTodayKey';
import { useApp } from '@/store/AppContext';
import { colors, gradients, radius, shadows, spacing } from '@/theme';

export default function ReserverScreen() {
  const params = useLocalSearchParams<{ clubId: string; dateKey?: string; time?: string; durationMin?: string; court?: string }>();
  const router = useRouter();
  const { state, addReservation } = useApp();
  const toast = useToast();
  // Mémoïsé : `applyInfo` (findClub) crée un NOUVEL objet dès qu'un club a une surcharge gérant ou
  // un statut explicite. Sans ce useMemo, `club` changeait de référence à chaque rendu (ex. frappe
  // dans « Ou un autre nom… ») et défaisait la mémoïsation de `slotsByTime` → re-balayage inutile
  // de l'occupation de tous les créneaux à chaque frappe pour ces clubs.
  const club = useMemo(
    () => findClub(params.clubId, state.customClubs, state.clubInfo),
    [params.clubId, state.customClubs, state.clubInfo],
  );

  // todayKey : la liste se recale après minuit (retour premier plan) — cf. reserver/index.tsx.
  const todayKey = useTodayKey();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const dates = useMemo(() => nextDays(7), [todayKey]);
  // « Rejouer » passe l’heure habituelle SANS jour (?time=…) : on pré-sélectionne le premier
  // jour où ce créneau est encore à venir (aujourd’hui, sinon demain) — sans ça, le choix du
  // jour remettait le créneau à zéro et la pré-sélection promise n’était jamais tenue.
  const presetTime = typeof params.time === 'string' && params.time ? params.time : undefined;
  // « Rejouer ici » (54.8.4) porte aussi la DURÉE du créneau habituel — sans garantie qu'elle
  // existe encore dans la grille actuelle (le club a pu la retirer) : simple pré-remplissage,
  // revalidé comme le terrain via `free`/`freeCourtSlotsAt` (jamais imposé aveuglément).
  const presetDurationRaw = typeof params.durationMin === 'string' ? Number(params.durationMin) : null;
  const presetDuration: 60 | 90 | null = presetDurationRaw === 60 || presetDurationRaw === 90 ? presetDurationRaw : null;
  // « Accepter la proposition » (75) porte AUSSI le terrain proposé par le club : on le pré-choisit
  // s'il est réellement libre au créneau résolu (sinon repli sur le 1er libre, jamais imposé aveuglément).
  const presetCourt = typeof params.court === 'string' && params.court ? params.court : undefined;
  // On ne stocke QUE la clé du jour choisi et on dérive l’objet à chaque rendu (motif
  // SectionReservations.tsx / reserver/index.tsx) : sinon, après une nuit en arrière-plan,
  // `dates` est recalé par useTodayKey mais `day` resterait figé sur l’ancien objet (veille).
  const [selDayKey, setSelDayKey] = useState<string | null>(
    (
      dates.find((d) => d.key === params.dateKey) ??
      (presetTime ? (dates.find((d) => slotTimestamp(d.key, presetTime) > Date.now()) ?? null) : null)
    )?.key ?? null,
  );
  const day = dates.find((d) => d.key === selDayKey) ?? null;
  const [slot, setSlot] = useState<string | null>(presetTime ?? null);
  const [duration, setDuration] = useState<60 | 90 | null>(presetDuration);
  const [court, setCourt] = useState<string | null>(null);
  // Participants : toi + jusqu’à 3 invités (amis ou nom libre).
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [extraNames, setExtraNames] = useState<string[]>([]);
  const [extraName, setExtraName] = useState('');
  // Match OUVERT (45, modèle Playtomic) : le terrain est bloqué normalement, et les places
  // restantes deviennent rejoignables par les autres joueurs (« Matchs ouverts »).
  const [openMatch, setOpenMatch] = useState(false);
  // FOURCHETTE de niveau du match ouvert (81) — remplace l'ancien champ texte libre `openLevel` :
  // vide des deux côtés = ouvert à tous. Le refus d'un joueur hors fourchette est SERVEUR.
  const [openRange, setOpenRange] = useState<LevelRange>({ min: null, max: null });
  // FORMAT du match, indépendant de la visibilité : 4 = 2v2 (défaut), 2 = 1v1. Un 1v1 comme un
  // 2v2 peut rester PRIVÉ (toi + tes invités) ou être OUVERT (les places libres se rejoignent).
  // Le format borne le nombre d'invités (1v1 = 1 invité max, 2v2 = 3).
  const [format, setFormat] = useState<2 | 4>(4);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [celebrate, setCelebrate] = useState(false); // confettis à l’écran de succès (motif amis.tsx)
  // Instantané FIGÉ de la résa réellement créée (terrain/durée/prix), capturé au moment du succès :
  // l'écran « done » NE DOIT PAS relire les valeurs dérivées (effectiveCourt/effectiveDuration/
  // slotPrice), car addReservation vient d'occuper le terrain → la dispo change et ces dérivations
  // basculeraient sur un AUTRE terrain / une AUTRE durée (récap, calendrier et WhatsApp faux).
  const [booked, setBooked] = useState<{
    court: string;
    durationMin: 60 | 90;
    price: number;
    dayLabel: string;
    time: string;
    startsAt: number;
  } | null>(null);

  // Contexte de disponibilité + terrains libres PAR créneau du jour choisi, mémoïsés (hooks
  // avant les `return` anticipés — règle React Compiler). Sans ça, chaque frappe dans le champ
  // « Ou un autre nom… » re-déroulait freeCourts sur TOUS les créneaux, chacun re-balayant
  // l'occupation non bornée de tous les clubs.
  const ctx = useMemo<AvailCtx>(
    () => ({
      clubs: activeClubs(state.customClubs, state.clubInfo),
      clubSlots: state.clubSlots,
      clubCourts: state.clubCourts,
      courtSlots: state.courtSlots,
      reservations: state.reservations,
      occupancy: state.occupancy,
      comps: [...seedCompetitions, ...state.myCompetitions],
      blocked: state.blockedSlots,
      ranges: state.blockedRanges,
      courtClosed: state.clubCourtClosed,
    }),
    [
      state.customClubs,
      state.clubInfo,
      state.clubSlots,
      state.clubCourts,
      state.courtSlots,
      state.reservations,
      state.occupancy,
      state.myCompetitions,
      state.blockedSlots,
      state.blockedRanges,
      state.clubCourtClosed,
    ],
  );
  // Pour CHAQUE créneau ouvert du jour : les terrains libres ET leur durée réelle (un même
  // horaire peut offrir 1h sur un terrain et 1h30 sur un autre, 68) — cœur du choix (heure →
  // durée → terrain).
  const slotsByTime = useMemo(() => {
    if (!club || !day) return null;
    return new Map(openSlotsFor(club, ctx).map((s) => [s, freeCourtSlotsAt(club, day.key, s, ctx)]));
  }, [club, day, ctx]);

  // LISTE D'ATTENTE (81) : mes alertes « préviens-moi si ça se libère », chargées au montage.
  // null = pas encore chargé OU échec réseau (convention §8) : on n'affiche jamais « Alerte
  // posée » sur la foi d'un état inventé, et un échec n'efface pas ce qu'on sait déjà.
  const [waitlist, setWaitlist] = useState<{ clubId: string; dateKey: string; time: string }[] | null>(null);
  const [waitBusy, setWaitBusy] = useState(false); // garde anti double-tap (pose/retrait)
  useEffect(() => {
    let alive = true;
    // setState APRÈS await (règle React Compiler) — jamais de setState synchrone dans l'effet.
    void fetchMySlotWaitlist().then((rows) => {
      if (alive && rows) setWaitlist(rows);
    });
    return () => {
      alive = false;
    };
  }, [state.serverUserId]);

  // Anneau qui se dilate autour du badge de succès (même anim que BookingConfirmation.tsx),
  // démarré seulement une fois l’écran de succès affiché et arrêté à la sortie (règle React
  // Compiler : hooks toujours appelés, avant tout `return` anticipé — donc déclarés ici).
  const ring = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!done) return;
    const ringLoop = Animated.loop(
      Animated.timing(ring, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    ringLoop.start();
    return () => ringLoop.stop();
  }, [done, ring]);

  if (!club) {
    return (
      <Screen back>
        <EmptyState icon="alert-circle-outline" title="Club introuvable" />
      </Screen>
    );
  }

  // Un club « Bientôt » est référencé mais pas encore réservable (garde aussi le lien direct).
  if (club.comingSoon) {
    return (
      <Screen back title={club.name}>
        <EmptyState
          icon="time-outline"
          title="Bientôt sur PadelConnect"
          text="Ce club arrive très vite. La réservation en ligne ouvrira dès qu’il aura finalisé son inscription."
        />
      </Screen>
    );
  }

  const openSlots = openSlotsFor(club, ctx);
  const allCourts = courtsFor(club, state.clubCourts);
  // Bannière « journée fermée » seulement si un tournoi bloque TOUT le club ; un tournoi sur
  // des terrains/créneaux précis laisse les autres réservables (géré créneau par créneau).
  const compToday = !!day && hasFullDayCompetition(club.id, day.key, ctx.comps);

  // Durées offertes AU CRÉNEAU choisi (un même horaire peut offrir 1h sur un terrain et 1h30
  // sur un autre, 68) : si une seule durée est proposée, elle est retenue automatiquement ;
  // sinon le joueur choisit via les puces « Durée » (cf. rendu plus bas).
  const durationsAtSlot = day && slot ? [...new Set((slotsByTime?.get(slot) ?? []).map((x) => x.durationMin))].sort((a, b) => a - b) : [];
  // On IGNORE une durée choisie/préréglée qui n'est plus offerte à ce créneau (ex. deep-link
  // « Rejouer ici ?durationMin=90 » alors que le club est passé ce créneau en 1h-seulement) :
  // sinon `free` serait vide sans qu'aucune puce de durée ne s'affiche (cul-de-sac). Dérivation
  // PURE (pas de setState en effet) : la durée invalide retombe sur l'auto-choix / le sélecteur.
  const validDuration = duration && durationsAtSlot.includes(duration) ? duration : null;
  const effectiveDuration = validDuration ?? (durationsAtSlot.length === 1 ? durationsAtSlot[0] : null);
  const free = day && slot && effectiveDuration ? freeCourts(club, day.key, slot, effectiveDuration, ctx) : [];

  // A-L2 : pré-sélectionner le 1er terrain libre dès que jour + créneau + durée sont choisis.
  // Valeur dérivée : si l’utilisateur n’a pas encore choisi manuellement (court === null)
  // ET qu’un terrain libre existe, on propose le premier. L’utilisateur peut toujours
  // cliquer sur un autre chip pour le remplacer (setCourt(c)). Pur UX, pas de setState
  // dans le rendu ni d’effet — la dispo ne change pas.
  const effectiveCourt =
    court ??
    (day && slot && effectiveDuration && free.length > 0 ? (presetCourt && free.includes(presetCourt) ? presetCourt : free[0]) : null);
  // Durée utilisée pour les AFFICHAGES DE PRIX avant confirmation complète (créneau choisi mais
  // pas encore de durée explicite) : la plus petite durée offerte à ce créneau, sinon la plus
  // petite durée offerte par le club (jamais une durée codée en dur).
  const priceDuration =
    effectiveDuration ?? durationsAtSlot[0] ?? [...offeredDurations(resolvedGridFor(club, ctx), allCourts)].sort((a, b) => a - b)[0] ?? 90;
  // Prix minimum RÉEL d'un créneau (parmi les durées qu'il offre) — pour l'aperçu avant le
  // choix de la durée (puce de créneau, « dès »).
  const minPriceAtSlot = (s: string): number => {
    const durs = (slotsByTime?.get(s) ?? []).map((x) => x.durationMin);
    return durs.length ? Math.min(...durs.map((d) => priceForSlot(club, s, d))) : priceForSlot(club, s, 90);
  };

  const participantCount = friendIds.length + extraNames.length;
  // Nombre d'invités possible selon le format (1v1 = 1, 2v2 = 3) et places encore ouvrables.
  const maxGuests = format === 2 ? 1 : 3;
  const openable = participantCount < maxGuests; // reste au moins une place à faire rejoindre
  // Un match n'est réellement « ouvert » que s'il reste une place : équipe complète → privé
  // pour l'affichage ET la confirmation, sans effacer l'intention `openMatch` (retirer un
  // invité, ou repasser en 2v2, rouvre le choix « ouvert »).
  const effectiveOpen = openMatch && openable;
  const toggleFriend = (id: string) =>
    setFriendIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : participantCount < maxGuests ? [...cur, id] : cur));
  const addExtra = () => {
    const n = extraName.trim();
    if (n.length < 2 || participantCount >= maxGuests) return;
    if (extraNames.includes(n)) return; // pas de doublon (clé de liste + retrait par nom)
    setExtraNames((cur) => [...cur, n]);
    setExtraName('');
  };
  // Choix du format : passer en 1v1 ne laisse qu'un invité — on garde le premier (ami en
  // priorité) et on retire le surplus pour rester cohérent avec la capacité.
  const selectFormat = (f: 2 | 4) => {
    setFormat(f);
    if (f === 2 && participantCount > 1) {
      if (friendIds.length > 0) {
        setFriendIds((cur) => cur.slice(0, 1));
        setExtraNames([]);
      } else {
        setExtraNames((cur) => cur.slice(0, 1));
      }
    }
  };

  // Étiquette HONNÊTE d'un terrain non sélectionnable à (heure, durée) choisies : « pris » est
  // réservé au terrain réellement occupé — un terrain offert à une AUTRE durée (« · en 1h ») ou
  // fermé à cette heure (« · fermé ») n'est pas « pris » (le joueur croyait le club plus plein
  // qu'il ne l'est et renonçait à réserver).
  const atSlot = slot ? (slotsByTime?.get(slot) ?? []) : [];
  const courtChipLabel = (c: string): string => {
    if (free.includes(c)) return c;
    const alt = atSlot.find((x) => x.court === c); // libre à cette heure, mais à une autre durée
    if (alt) return `${c} · en ${durationLabel(alt.durationMin)}`;
    const grid = resolvedGridFor(club, ctx);
    const hasSlot = slot ? slotDurationAt(grid, c, slot) !== null : false;
    if (hasSlot) return `${c} · pris`;
    // Pas de créneau à CETTE heure : « autre horaire » si le terrain ouvre ailleurs dans la
    // journée (grilles décalées), « fermé » s'il n'ouvre nulle part.
    return (grid[c] ?? []).some((x) => !x.x) ? `${c} · autre horaire` : `${c} · fermé`;
  };

  // CRÉNEAU COMPLET (81) : le créneau EXISTE bien dans la grille ouverte du club (un horaire
  // fermé ou hérité d'un deep-link périmé n'a rien à attendre) et est encore À VENIR, mais plus
  // AUCUN couple (terrain, durée) n'y est libre. ⚠️ PAS `free.length === 0` : `free` est aussi
  // vide quand le créneau offre DEUX durées et que le joueur n'a pas encore choisi
  // (`effectiveDuration` null) — on afficherait « Complet » sur un créneau libre.
  const slotFull =
    !!day &&
    !!slot &&
    !compToday &&
    openSlots.includes(slot) &&
    slotTimestamp(day.key, slot) > Date.now() &&
    (slotsByTime?.get(slot)?.length ?? 0) === 0;
  // Ai-je DÉJÀ posé mon alerte sur ce (club, jour, heure) ? (miroir serveur, jamais deviné)
  const alerted = !!day && !!slot && (waitlist ?? []).some((w) => w.clubId === club.id && w.dateKey === day.key && w.time === slot);

  // Pose / retrait de l'alerte. Écriture HONNÊTE : le miroir local ne bouge qu'au retour serveur.
  const toggleWaitlist = async () => {
    if (!day || !slot || waitBusy) return;
    setWaitBusy(true);
    if (alerted) {
      const ok = await leaveSlotWaitlist(club.id, day.key, slot);
      setWaitBusy(false);
      if (!ok) {
        toast.show('Retrait impossible — vérifie ton réseau et réessaie', { icon: 'cloud-offline-outline' });
        return;
      }
      setWaitlist((cur) => (cur ?? []).filter((w) => !(w.clubId === club.id && w.dateKey === day.key && w.time === slot)));
      toast.show('Alerte retirée.');
      return;
    }
    // Durée envoyée = celle du créneau. Sur un créneau COMPLET, `effectiveDuration` est null
    // (aucun couple libre) → on la dérive de la GRILLE (plus petite durée offerte à cette heure,
    // fenêtre la plus précise) : un club « tout en 1h » attendrait sinon sur [t, t+90) et serait
    // alerté par la libération du créneau SUIVANT (t+60), jamais demandé.
    const grid = resolvedGridFor(club, ctx);
    const waitDur: 60 | 90 =
      effectiveDuration === 60 || effectiveDuration === 90
        ? effectiveDuration
        : allCourts.some((c) => slotDurationAt(grid, c, slot) === 60)
          ? 60
          : 90;
    const res = await joinSlotWaitlist(club.id, day.key, slot, waitDur);
    setWaitBusy(false);
    if (res === 'ok') {
      setWaitlist((cur) => [...(cur ?? []), { clubId: club.id, dateKey: day.key, time: slot }]);
      hapticSuccess();
      toast.show('Alerte posée ✓ — on te prévient dès qu’un terrain se libère.');
    } else if (res === 'past') {
      // Le créneau est devenu passé pendant que l'écran restait ouvert : réessayer est vain.
      hapticWarning();
      setSlot(null);
      setDuration(null);
      toast.show('Ce créneau vient de passer — choisis-en un autre.', { icon: 'alert-circle' });
    } else {
      hapticWarning();
      toast.show('Connexion impossible — vérifie ton réseau et réessaie', { icon: 'cloud-offline-outline' });
    }
  };

  const ready = !!day && !!slot && !!effectiveDuration && !!effectiveCourt && !compToday;
  const hasTiers = priceTiersFor(club).length > 0;
  const slotPrice = slot
    ? priceForSlot(club, slot, priceDuration)
    : minPrice(club, offeredDurations(resolvedGridFor(club, ctx), allCourts));

  const confirm = async () => {
    if (!day || !slot || !effectiveDuration || !effectiveCourt || submitting) return;
    const startsAt = slotTimestamp(day.key, slot);
    // Le créneau choisi est devenu passé pendant que l’écran restait ouvert : on prévient au lieu
    // d’un bouton silencieusement inopérant, et on désélectionne pour forcer un nouveau choix.
    if (startsAt <= Date.now()) {
      toast.show('Ce créneau vient de passer — choisis-en un autre.', { icon: 'alert-circle' });
      setSlot(null);
      setDuration(null);
      return;
    }
    setSubmitting(true);
    const invited = [
      ...state.friends.filter((f) => friendIds.includes(f.id)).map((f) => ({ id: f.id, name: f.name, confirmed: false })),
      ...extraNames.map((n, i) => ({ id: `x-${Date.now()}-${i}`, name: n, confirmed: false })),
    ];
    const bookedPrice = priceForSlot(club, slot, effectiveDuration);
    const res = await addReservation({
      clubId: club.id,
      clubName: club.name,
      court: effectiveCourt,
      date: dateKeyLabel(day.key), // libellé ABSOLU (« Lun 8 juin ») : ne devient jamais faux le lendemain
      dateKey: day.key,
      time: slot,
      startsAt,
      price: bookedPrice,
      durationMin: effectiveDuration,
      players: 1 + invited.length,
      invited,
      // Capacité = format choisi (2 = 1v1, 4 = 2v2). Match ouvert seulement s'il reste au
      // moins une place à prendre (équipe déjà complète = inutile).
      openCapacity: format,
      openMatch: openMatch && invited.length < format - 1,
      // `openLevel` (texte libre) n'est plus alimenté : la fourchette CHIFFRÉE la remplace (81).
      // La colonne reste envoyée vide pour ne rien casser en aval (cartes, notify-club).
      openLevel: '',
      openLevelMin: openMatch ? openRange.min : null,
      openLevelMax: openMatch ? openRange.max : null,
    });
    setSubmitting(false);
    if (res.ok) {
      hapticSuccess();
      // J'avais une ALERTE de liste d'attente sur ce créneau et je viens de le réserver : on la
      // retire (best-effort) — sinon la prochaine annulation d'un voisin me pousserait « un
      // créneau s'est libéré » pour un créneau que j'occupe déjà.
      if (alerted) {
        void leaveSlotWaitlist(club.id, day.key, slot);
        setWaitlist((cur) => (cur ?? []).filter((w) => !(w.clubId === club.id && w.dateKey === day.key && w.time === slot)));
      }
      // Fige l'instantané AVANT le re-rendu de succès (la dispo va muter — cf. déclaration de `booked`).
      // On fige AUSSI le jour (libellé absolu), l'heure et startsAt : l'écran de succès ne doit plus
      // lire `day!`/`slot!` — après une nuit en arrière-plan, useTodayKey recale `dates`, l'ancien
      // « aujourd'hui » sort de la fenêtre → `day = null` → crash (TypeError) au rendu du récap.
      setBooked({
        court: effectiveCourt,
        durationMin: effectiveDuration,
        price: bookedPrice,
        dayLabel: dateKeyLabel(day.key),
        time: slot,
        startsAt,
      });
      setDone(true);
      setCelebrate(true);
      // Résa créée mais rattachement des amis invités échoué : sans ce toast, la carte
      // affiche « Avec X » alors que X n'a reçu ni push ni la résa chez lui.
      if (res.partnersNotified === false) {
        toast.show('Tes partenaires n’ont pas pu être prévenus dans l’app — envoie-leur le récap WhatsApp.', { icon: 'alert-circle' });
      }
    } else if (res.reason === 'limit') {
      // Limite anti-blocage (appliquée dans addReservation) : trop de créneaux à venir.
      hapticWarning();
      toast.show('Tu as déjà trop de réservations à venir — joue-les d’abord 😊', { icon: 'alert-circle' });
    } else if (res.reason === 'network') {
      // Échec réseau/serveur : le terrain n’est PAS pris — on invite à réessayer, sans toucher au choix.
      hapticWarning();
      toast.show('Connexion impossible — vérifie ton réseau et réessaie', { icon: 'cloud-offline-outline' });
    } else if (res.reason === 'past') {
      // Le créneau est devenu passé pendant que l’écran restait ouvert.
      hapticWarning();
      setSlot(null);
      setDuration(null);
      toast.show('Ce créneau vient de passer — choisis-en un autre.', { icon: 'alert-circle' });
    } else if (res.reason === 'closed') {
      // Le club vient de FERMER ce créneau (période, terrain, grille — 54) : changer de terrain
      // ne servirait à rien, la grille se resynchronise (addReservation recharge les fermetures).
      hapticWarning();
      setSlot(null);
      setDuration(null);
      toast.show('Ce créneau vient d’être fermé par le club — choisis un autre horaire.', { icon: 'alert-circle' });
    } else {
      // Terrain pris entre-temps (autre joueur / conflit serveur) : on prévient et on
      // réinitialise la pré-sélection pour en choisir un autre.
      hapticWarning();
      setCourt(null);
      toast.show('Ce terrain vient d’être pris — choisis-en un autre', { icon: 'alert-circle' });
    }
  };

  if (done && booked) {
    const ringScale = ring.interpolate({ inputRange: [0, 1], outputRange: [0.8, 2.2] });
    const ringOpacity = ring.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.45, 0] });
    return (
      <Screen back title="Réservation">
        {/* En-tête de succès — dégradé signature pour un retour premium et clair. Parité avec
            BookingConfirmation.tsx (voie rapide) : anneau qui se dilate + confettis. */}
        <LinearGradient colors={gradients.deepGreen} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.successHero}>
          <View style={styles.successBadgeWrap}>
            <Animated.View pointerEvents="none" style={[styles.successRing, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />
            <PopIn>
              <View style={styles.successBadge}>
                <Ionicons name="checkmark" size={36} color={colors.onSignature} />
              </View>
            </PopIn>
          </View>
          <Txt variant="h2" color={colors.onSignature} style={{ marginTop: spacing.md }}>
            Terrain réservé !
          </Txt>
          <Txt variant="small" color={colors.onPhoto} style={{ marginTop: 4, textAlign: 'center' }}>
            Le club la reçoit dans son Espace Club et la confirme. Retrouve-la dans « Mes réservations ».
          </Txt>
        </LinearGradient>
        {celebrate ? <Confetti onDone={() => setCelebrate(false)} /> : null}
        <Card style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
          <View style={styles.summary}>
            <Row label="Club" value={club.name} />
            <Row label="Terrain" value={booked.court} />
            <Row label="Jour" value={booked.dayLabel} />
            <Row label="Heure" value={booked.time} />
            <Row label="Durée" value={durationLabel(booked.durationMin)} />
            <Row label="Participants" value={`Toi${participantCount > 0 ? ` + ${participantCount}` : ''}`} />
            <Row label={`Tarif (session ${durationLabel(booked.durationMin)})`} value={fcfa(booked.price)} />
            <Row label={`≈ par joueur (à ${format})`} value={perPlayerOf(booked.price, format)} />
          </View>
          <View style={{ alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.lg }}>
            <Button label="Voir mes réservations" icon="calendar" onPress={() => router.push('/reservations')} full />
            <Button
              label="Ajouter à mon calendrier"
              icon="calendar-outline"
              variant="secondary"
              onPress={async () => {
                const res = await addReservationToCalendar({
                  clubName: club.name,
                  startsAt: booked.startsAt,
                  court: booked.court,
                  area: club.area,
                  durationMin: booked.durationMin, // durée réellement réservée (instantané figé)
                });
                // « canceled » = fiche système refermée par l'utilisateur : pas de toast d'erreur.
                if (res === 'canceled') return;
                toast.show(
                  res === 'added' ? 'Ajouté à ton calendrier ✓' : 'Calendrier indisponible sur cet appareil.',
                  res === 'added' ? undefined : { icon: 'alert-circle' },
                );
              }}
              full
            />
            {participantCount > 0 ? (
              <Button
                label="Prévenir mes partenaires"
                icon="logo-whatsapp"
                variant="secondary"
                onPress={() => {
                  const invitedNames = [...state.friends.filter((f) => friendIds.includes(f.id)).map((f) => f.name), ...extraNames];
                  const who = invitedNames.length ? `\nÉquipe : ${invitedNames.join(', ')}` : '';
                  // Part calculée sur l'effectif RÉEL (toi + invités) : « /4 » sur un match à 2
                  // annoncerait la moitié de la vraie part à payer au club.
                  const share = booked.price ? `\nPrévois ${perPlayerOf(booked.price, 1 + invitedNames.length)} chacun.` : '';
                  openWhatsApp(
                    '',
                    `On joue au padel ! 🎾\n${club.name} — ${booked.dayLabel} à ${booked.time} (session ${durationLabel(booked.durationMin)})\n${booked.court}${who}${share}\nRéservé via PadelConnect.`,
                  );
                }}
                full
              />
            ) : null}
            <Button
              label="Réserver un autre créneau"
              variant="ghost"
              onPress={() => {
                setDone(false);
                setBooked(null); // l'instantané de succès ne survit pas à un nouveau tunnel
                setSlot(null);
                setDuration(null);
                setCourt(null);
                setFriendIds([]);
                setExtraNames([]);
                // Remise à zéro du format/visibilité : sans ça, la résa suivante repartait
                // silencieusement en 1v1 ouvert (maxGuests=1) sans re-choix explicite.
                setFormat(4);
                setOpenMatch(false);
                setOpenRange({ min: null, max: null });
              }}
              full
            />
          </View>
        </Card>
      </Screen>
    );
  }

  // Progression du parcours guidé (après le choix Par heure/Par club, fait en amont).
  // A-L2 : le step 2 (terrain) est considéré complété dès qu’effectiveCourt est défini.
  const step = !day ? 0 : !slot ? 1 : !effectiveCourt ? 2 : 3;

  return (
    <Screen
      back
      title="Réserver"
      subtitle={club.name}
      contentStyle={{ paddingBottom: 96 }}
      overlay={
        <StickyBar
          label={slot ? fcfa(slotPrice) : `dès ${fcfa(slotPrice)}`}
          hint={`session · ${durationLabel(priceDuration)}`}
          cta={submitting ? 'Réservation…' : 'Réserver le terrain'}
          onPress={confirm}
          disabled={!ready || submitting}
        />
      }
    >
      <Reveal>
        <Stepper steps={['Jour', 'Créneau', 'Terrain', 'Confirmer']} current={step} />
        <Label text="Jour" />
        <View style={styles.wrap}>
          {dates.map((d) => (
            <Chip
              key={d.key}
              label={d.label}
              active={d.key === day?.key}
              onPress={() => {
                setSelDayKey(d.key);
                setSlot(null);
                setDuration(null);
                setCourt(null);
              }}
              size="lg"
            />
          ))}
        </View>

        {compToday ? (
          <Reveal>
            <View style={styles.banner}>
              <Ionicons name="trophy" size={16} color={colors.coral} />
              <Txt variant="small" color={colors.text} style={{ flex: 1 }}>
                Un tournoi a lieu ce jour à {club.name} — le terrain n’est pas réservable.
              </Txt>
            </View>
          </Reveal>
        ) : null}

        <Label text={day ? 'Créneau' : 'Créneau (choisis d’abord un jour)'} />
        {SLOT_PERIODS.map((period) => {
          const periodSlots = openSlots.filter((s) => periodOf(s) === period.id);
          if (periodSlots.length === 0) return null;
          return (
            <View key={period.id}>
              {/* Pas de prix dans l’en-tête de période : une période peut chevaucher plusieurs
                  plages tarifaires (ex. Padelta) → le prix exact est porté par chaque créneau. */}
              <View style={styles.periodHeader}>
                <Ionicons name={period.icon} size={15} color={period.color} />
                <Txt variant="label" color={colors.textMuted}>
                  {period.label}
                </Txt>
              </View>
              <View style={styles.wrap}>
                {periodSlots.map((s) => {
                  const isPast = !!day && slotTimestamp(day.key, s) <= Date.now();
                  const noCourt = !!day && (slotsByTime?.get(s)?.length ?? 0) === 0;
                  // Un créneau COMPLET reste SÉLECTIONNABLE (81) : c'est là qu'on propose la liste
                  // d'attente (« me prévenir si ça se libère »). Seuls le passé et une journée de
                  // tournoi restent inaccessibles — eux n'ont rien à attendre.
                  const blocked = !day || compToday || isPast;
                  // Avec des plages tarifaires, on montre le prix MINIMUM réellement offert à ce
                  // créneau (une durée peut être moins chère qu'une autre sur le même horaire).
                  const label = isPast
                    ? `${s} · passé`
                    : noCourt
                      ? `${s} · complet`
                      : hasTiers
                        ? `${s} · dès ${fcfa(minPriceAtSlot(s))}`
                        : s;
                  return (
                    <Chip
                      key={s}
                      label={label}
                      active={s === slot}
                      disabled={blocked}
                      onPress={() => {
                        setSlot(s);
                        setDuration(null);
                        setCourt(null);
                      }}
                      size="lg"
                    />
                  );
                })}
              </View>
            </View>
          );
        })}
        {openSlots.length === 0 ? (
          <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
            Aucun créneau ouvert par le club pour le moment.
          </Txt>
        ) : null}

        {/* Durée — n'apparaît que si CE créneau offre plusieurs durées selon le terrain (68) ;
            sinon la durée unique est retenue automatiquement (effectiveDuration). */}
        {day && slot && durationsAtSlot.length > 1 ? (
          <Reveal>
            <Label text="Durée" />
            <View style={styles.wrap}>
              {durationsAtSlot.map((d) => (
                <Chip
                  key={d}
                  label={`${durationLabel(d)} · ${fcfa(priceForSlot(club, slot, d))}`}
                  active={d === effectiveDuration}
                  onPress={() => {
                    setDuration(d);
                    setCourt(null);
                  }}
                  size="lg"
                />
              ))}
            </View>
          </Reveal>
        ) : null}

        {/* Créneau COMPLET (81) : plus aucun terrain libre → liste d'attente au lieu des chips
            (l'alerte est une écriture serveur : réservée aux comptes connectés). */}
        {slotFull ? (
          <Reveal>
            <Label text="Terrain" />
            <View style={styles.fullBox}>
              <Ionicons name="people" size={18} color={colors.coral} />
              <View style={{ flex: 1 }}>
                <Txt variant="body" style={{ fontWeight: '700' }}>
                  Complet à {slot}
                </Txt>
                <Txt variant="small" color={colors.textMuted}>
                  Tous les terrains sont pris à cet horaire. Choisis un autre créneau — ou pose une alerte : on te prévient dès qu’une place
                  se libère (premier arrivé, premier servi).
                </Txt>
              </View>
            </View>
            {state.serverUserId ? (
              <View style={{ marginTop: spacing.sm }}>
                <Button
                  label={waitBusy ? '…' : alerted ? 'Alerte posée ✓ (toucher pour retirer)' : '🔔 Me prévenir si ça se libère'}
                  variant={alerted ? 'secondary' : 'primary'}
                  onPress={() => void toggleWaitlist()}
                  disabled={waitBusy}
                  accessibilityLabel={
                    alerted ? 'Retirer mon alerte sur ce créneau' : 'Me prévenir par notification si un terrain se libère à ce créneau'
                  }
                  full
                />
              </View>
            ) : null}
          </Reveal>
        ) : day && slot && effectiveDuration ? (
          <Reveal>
            <Label text="Terrain" />
            <View style={styles.wrap}>
              {allCourts.map((c) => {
                const isFree = free.includes(c);
                return (
                  <Chip
                    key={c}
                    label={courtChipLabel(c)}
                    active={c === effectiveCourt}
                    disabled={!isFree}
                    onPress={() => setCourt(c)}
                    size="lg"
                  />
                );
              })}
            </View>
          </Reveal>
        ) : null}

        <Label text={`Avec qui ? (toi + ${participantCount}/${maxGuests} — optionnel)`} />
        <View style={styles.wrap}>
          {state.friends.map((f) => (
            <Chip
              key={f.id}
              label={f.name}
              icon={friendIds.includes(f.id) ? 'checkmark' : 'person-add'}
              active={friendIds.includes(f.id)}
              onPress={() => toggleFriend(f.id)}
            />
          ))}
          {extraNames.map((n) => (
            <Chip key={n} label={n} icon="checkmark" active onPress={() => setExtraNames((cur) => cur.filter((x) => x !== n))} />
          ))}
        </View>
        {/* Tout nouveau joueur (0 ami) : on l’amorce vers l’ajout d’amis au moment le plus
            pertinent — le padel se joue à 4 (même lien que la réservation rapide). */}
        {state.friends.length === 0 ? (
          <Pressable
            onPress={() => router.push('/amis')}
            style={styles.inviteLink}
            accessibilityRole="button"
            accessibilityLabel="Inviter un ami sur PadelConnect"
          >
            <Ionicons name="person-add-outline" size={14} color={colors.signature} />
            <Txt variant="small" color={colors.signature} style={{ fontWeight: '700' }}>
              Invite tes amis sur PadelConnect pour les ajouter ici
            </Txt>
          </Pressable>
        ) : null}
        {participantCount < maxGuests ? (
          <View style={styles.extraRow}>
            <TextInput
              value={extraName}
              onChangeText={setExtraName}
              placeholder="Ou un autre nom…"
              placeholderTextColor={colors.textMuted}
              maxLength={40}
              accessibilityLabel="Nom d’un invité"
              style={styles.extraInput}
              onSubmitEditing={addExtra}
            />
            <Button size="sm" label="Ajouter" icon="add" variant="secondary" onPress={addExtra} disabled={extraName.trim().length < 2} />
          </View>
        ) : null}

        {/* FORMAT (1v1 = 2 joueurs / 2v2 = 4) puis TYPE (Privé / Ouvert), choisis séparément :
            un 1v1 comme un 2v2 peut rester PRIVÉ (toi + tes invités) ou être OUVERT (modèle
            Playtomic — ton terrain reste bloqué, les places restantes se rejoignent depuis
            « Matchs ouverts »). L'option « Ouvert » disparaît quand l'équipe est déjà complète. */}
        {state.serverUserId ? (
          <>
            <Txt variant="label" style={{ marginTop: spacing.md }}>
              Format
            </Txt>
            <View style={[styles.wrap, { marginTop: spacing.sm }]} accessibilityRole="radiogroup" accessibilityLabel="Format du match">
              {(
                [
                  { f: 2, label: '1v1 · 2 joueurs' },
                  { f: 4, label: '2v2 · 4 joueurs' },
                ] as const
              ).map((o) => (
                <Chip key={o.f} label={o.label} active={format === o.f} onPress={() => selectFormat(o.f)} size="lg" />
              ))}
            </View>

            <Txt variant="label" style={{ marginTop: spacing.md }}>
              Type de match
            </Txt>
            <View accessibilityRole="radiogroup" accessibilityLabel="Type de match">
              {(
                [
                  {
                    key: 'private',
                    icon: 'lock-closed' as const,
                    title: 'Match privé',
                    sub: 'Juste toi et tes invités',
                    show: true,
                    active: !effectiveOpen,
                    set: () => setOpenMatch(false),
                  },
                  {
                    key: 'open',
                    icon: 'people' as const,
                    title: 'Match ouvert',
                    sub:
                      format === 2
                        ? 'Un joueur inconnu te rejoint — 2 au total'
                        : `${maxGuests - participantCount} place${maxGuests - participantCount > 1 ? 's' : ''} à prendre — 4 au total`,
                    show: openable,
                    active: effectiveOpen,
                    set: () => setOpenMatch(true),
                  },
                ] as const
              )
                .filter((o) => o.show)
                .map((o) => (
                  <Pressable
                    key={o.key}
                    onPress={o.set}
                    style={[styles.openMatchBox, o.active && styles.openMatchBoxOn, o.active && shadows.e1]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: o.active }}
                    accessibilityLabel={`${o.title}. ${o.sub}`}
                  >
                    <IconCircle
                      icon={o.icon}
                      size={40}
                      color={o.active ? colors.signature : colors.textMuted}
                      bg={o.active ? colors.signatureSoft : colors.surfaceAlt}
                    />
                    <View style={{ flex: 1 }}>
                      <Txt variant="body" style={{ fontWeight: '700' }}>
                        {o.title}
                      </Txt>
                      <Txt variant="small" color={colors.textMuted}>
                        {o.sub}
                      </Txt>
                    </View>
                    <Ionicons
                      name={o.active ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={o.active ? colors.signature : colors.textFaint}
                    />
                  </Pressable>
                ))}
            </View>
            {effectiveOpen ? (
              <>
                <Txt variant="label" style={{ marginTop: spacing.md }}>
                  Niveau souhaité
                </Txt>
                <LevelRangePicker min={openRange.min} max={openRange.max} anchor={snapLevel(state.level)} onChange={setOpenRange} />
                <Txt variant="small" color={colors.textMuted} style={{ marginTop: spacing.sm }}>
                  Ton terrain est bloqué quoi qu’il arrive. Les autres rejoignent depuis « Matchs ouverts » (tu es prévenu à chaque
                  arrivée). Le prix du terrain se partage entre les joueurs.
                </Txt>
              </>
            ) : null}
          </>
        ) : null}

        <Card style={styles.priceRow}>
          <View>
            <Txt variant="muted">Tarif (session {durationLabel(priceDuration)})</Txt>
            <Txt variant="small" color={colors.textMuted}>
              soit ~{perPlayerOf(slotPrice, format)} / joueur à {format}
            </Txt>
          </View>
          <Txt variant="price">{slot ? fcfa(slotPrice) : `dès ${fcfa(slotPrice)}`}</Txt>
        </Card>

        <View style={{ marginTop: spacing.lg }}>
          <Txt variant="small" color={colors.textMuted} style={{ marginTop: spacing.sm, textAlign: 'center' }}>
            Session de {durationLabel(priceDuration)}, sans paiement en ligne. Le tarif se règle directement au club. Annulation jusqu’à 5h
            avant.
          </Txt>
        </View>
      </Reveal>
    </Screen>
  );
}

// Regroupement des créneaux par moment de journée (maquette « Réserver · B »).
const SLOT_PERIODS: { id: 'morning' | 'afternoon' | 'evening'; label: string; icon: IconName; color: string }[] = [
  { id: 'morning', label: 'Matin', icon: 'partly-sunny-outline', color: colors.amber },
  { id: 'afternoon', label: 'Après-midi', icon: 'sunny-outline', color: colors.amber },
  { id: 'evening', label: 'Soirée', icon: 'moon-outline', color: colors.purple },
];

function periodOf(slot: string): 'morning' | 'afternoon' | 'evening' {
  const hour = parseInt(slot.slice(0, 2), 10);
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

function Label({ text }: { text: string }) {
  return (
    <Txt variant="label" style={{ marginTop: spacing.lg }}>
      {text}
    </Txt>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Txt variant="muted">{label}</Txt>
      <Txt variant="h3" style={{ fontSize: 15 }}>
        {value}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  periodHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md },
  extraRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  inviteLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm, paddingVertical: spacing.xs },
  openMatchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  openMatchBoxOn: { borderColor: colors.signature, backgroundColor: colors.signatureSoft },
  extraInput: {
    flex: 1,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.coralSoft,
    borderWidth: 1,
    borderColor: colors.coral,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.lg },
  // Bloc « Complet » (liste d'attente) — même langage visuel que la bannière de tournoi.
  fullBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  summary: { alignSelf: 'stretch', marginTop: spacing.xs, gap: spacing.sm },
  successHero: {
    alignItems: 'center',
    borderRadius: radius.xl,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.e2,
  },
  successBadgeWrap: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center' },
  successRing: { position: 'absolute', width: 72, height: 72, borderRadius: radius.pill, borderWidth: 3, borderColor: colors.white },
  successBadge: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.onPhotoSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
