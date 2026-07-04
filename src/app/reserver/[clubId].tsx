import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { Confetti } from '@/components/Confetti';
import { PopIn } from '@/components/PopIn';
import { Reveal } from '@/components/Reveal';
import { Screen } from '@/components/Screen';
import { StickyBar } from '@/components/StickyBar';
import { Stepper } from '@/components/Stepper';
import { useToast } from '@/components/Toast';
import { Button, Card, EmptyState, Txt, type IconName } from '@/components/ui';
import { activeClubs, findClub } from '@/data/clubs';
import { seedCompetitions } from '@/data/competitions';
import { addReservationToCalendar } from '@/lib/calendar';
import { openWhatsApp } from '@/lib/contact';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { courtsFor, freeCourts, hasFullDayCompetition, openSlotsFor, type AvailCtx } from '@/lib/availability';
import { dateKeyLabel, nextDays, slotTimestamp } from '@/lib/days';
import { fcfa, perPlayer, perPlayerOf } from '@/lib/format';
import { minPrice, priceForSlot, priceTiersFor } from '@/lib/pricing';
import { useTodayKey } from '@/lib/useTodayKey';
import { MAX_UPCOMING, useApp } from '@/store/AppContext';
import { colors, gradients, radius, shadows, spacing } from '@/theme';

export default function ReserverScreen() {
  const params = useLocalSearchParams<{ clubId: string; dateKey?: string; time?: string }>();
  const router = useRouter();
  const { state, addReservation } = useApp();
  const toast = useToast();
  const club = findClub(params.clubId, state.customClubs, state.clubInfo);

  // todayKey : la liste se recale après minuit (retour premier plan) — cf. reserver/index.tsx.
  const todayKey = useTodayKey();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const dates = useMemo(() => nextDays(7), [todayKey]);
  // « Rejouer » passe l’heure habituelle SANS jour (?time=…) : on pré-sélectionne le premier
  // jour où ce créneau est encore à venir (aujourd’hui, sinon demain) — sans ça, le choix du
  // jour remettait le créneau à zéro et la pré-sélection promise n’était jamais tenue.
  const presetTime = typeof params.time === 'string' && params.time ? params.time : undefined;
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
  const [court, setCourt] = useState<string | null>(null);
  // Participants : toi + jusqu’à 3 invités (amis ou nom libre).
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [extraNames, setExtraNames] = useState<string[]>([]);
  const [extraName, setExtraName] = useState('');
  // Match OUVERT (45, modèle Playtomic) : le terrain est bloqué normalement, et les places
  // restantes deviennent rejoignables par les autres joueurs (« Matchs ouverts »).
  const [openMatch, setOpenMatch] = useState(false);
  const [openLevel, setOpenLevel] = useState('');
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [celebrate, setCelebrate] = useState(false); // confettis à l’écran de succès (motif amis.tsx)

  // Contexte de disponibilité + terrains libres PAR créneau du jour choisi, mémoïsés (hooks
  // avant les `return` anticipés — règle React Compiler). Sans ça, chaque frappe dans le champ
  // « Ou un autre nom… » re-déroulait freeCourts sur TOUS les créneaux, chacun re-balayant
  // l'occupation non bornée de tous les clubs.
  const ctx = useMemo<AvailCtx>(
    () => ({
      clubs: activeClubs(state.customClubs, state.clubInfo),
      clubSlots: state.clubSlots,
      clubCourts: state.clubCourts,
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
      state.reservations,
      state.occupancy,
      state.myCompetitions,
      state.blockedSlots,
      state.blockedRanges,
      state.clubCourtClosed,
    ],
  );
  const freeBySlot = useMemo(() => {
    if (!club || !day) return null;
    return new Map(openSlotsFor(club, state.clubSlots).map((s) => [s, freeCourts(club, day.key, s, ctx)]));
  }, [club, day, state.clubSlots, ctx]);

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

  const openSlots = openSlotsFor(club, state.clubSlots);
  const allCourts = courtsFor(club, state.clubCourts);
  // Bannière « journée fermée » seulement si un tournoi bloque TOUT le club ; un tournoi sur
  // des terrains/créneaux précis laisse les autres réservables (géré créneau par créneau).
  const compToday = !!day && hasFullDayCompetition(club.id, day.key, ctx.comps);
  const free = day && slot ? (freeBySlot?.get(slot) ?? []) : [];

  // A-L2 : pré-sélectionner le 1er terrain libre dès que jour + créneau sont choisis.
  // Valeur dérivée : si l’utilisateur n’a pas encore choisi manuellement (court === null)
  // ET qu’un terrain libre existe, on propose le premier. L’utilisateur peut toujours
  // cliquer sur un autre chip pour le remplacer (setCourt(c)). Pur UX, pas de setState
  // dans le rendu ni d’effet — la dispo ne change pas.
  const effectiveCourt = court ?? (day && slot && free.length > 0 ? free[0] : null);

  const participantCount = friendIds.length + extraNames.length;
  const toggleFriend = (id: string) =>
    setFriendIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : participantCount < 3 ? [...cur, id] : cur));
  const addExtra = () => {
    const n = extraName.trim();
    if (n.length < 2 || participantCount >= 3) return;
    if (extraNames.includes(n)) return; // pas de doublon (clé de liste + retrait par nom)
    setExtraNames((cur) => [...cur, n]);
    setExtraName('');
  };

  const ready = !!day && !!slot && !!effectiveCourt && !compToday;
  const hasTiers = priceTiersFor(club).length > 0;
  const slotPrice = slot ? priceForSlot(club, slot) : minPrice(club);

  const confirm = async () => {
    if (!day || !slot || !effectiveCourt || submitting) return;
    const startsAt = slotTimestamp(day.key, slot);
    // Le créneau choisi est devenu passé pendant que l’écran restait ouvert : on prévient au lieu
    // d’un bouton silencieusement inopérant, et on désélectionne pour forcer un nouveau choix.
    if (startsAt <= Date.now()) {
      toast.show('Ce créneau vient de passer — choisis-en un autre.', { icon: 'alert-circle' });
      setSlot(null);
      return;
    }
    setSubmitting(true);
    const invited = [
      ...state.friends.filter((f) => friendIds.includes(f.id)).map((f) => ({ id: f.id, name: f.name, confirmed: false })),
      ...extraNames.map((n, i) => ({ id: `x-${Date.now()}-${i}`, name: n, confirmed: false })),
    ];
    const res = await addReservation({
      clubId: club.id,
      clubName: club.name,
      court: effectiveCourt,
      date: dateKeyLabel(day.key), // libellé ABSOLU (« Lun 8 juin ») : ne devient jamais faux le lendemain
      dateKey: day.key,
      time: slot,
      startsAt,
      price: priceForSlot(club, slot),
      players: 1 + invited.length,
      invited,
      // Match ouvert seulement s'il reste des places à prendre (équipe déjà complète = inutile).
      openMatch: openMatch && invited.length < 3,
      openLevel: openMatch ? openLevel : '',
    });
    setSubmitting(false);
    if (res.ok) {
      hapticSuccess();
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
      toast.show(`Tu as déjà ${MAX_UPCOMING} réservations à venir — joue-les d’abord 😊`, { icon: 'alert-circle' });
    } else if (res.reason === 'network') {
      // Échec réseau/serveur : le terrain n’est PAS pris — on invite à réessayer, sans toucher au choix.
      hapticWarning();
      toast.show('Connexion impossible — vérifie ton réseau et réessaie', { icon: 'cloud-offline-outline' });
    } else if (res.reason === 'past') {
      // Le créneau est devenu passé pendant que l’écran restait ouvert.
      hapticWarning();
      setSlot(null);
      toast.show('Ce créneau vient de passer — choisis-en un autre.', { icon: 'alert-circle' });
    } else if (res.reason === 'closed') {
      // Le club vient de FERMER ce créneau (période, terrain, grille — 54) : changer de terrain
      // ne servirait à rien, la grille se resynchronise (addReservation recharge les fermetures).
      hapticWarning();
      setSlot(null);
      toast.show('Ce créneau vient d’être fermé par le club — choisis un autre horaire.', { icon: 'alert-circle' });
    } else {
      // Terrain pris entre-temps (autre joueur / conflit serveur) : on prévient et on
      // réinitialise la pré-sélection pour en choisir un autre.
      hapticWarning();
      setCourt(null);
      toast.show('Ce terrain vient d’être pris — choisis-en un autre', { icon: 'alert-circle' });
    }
  };

  if (done) {
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
            <Row label="Terrain" value={effectiveCourt!} />
            <Row label="Jour" value={day!.label} />
            <Row label="Heure" value={slot!} />
            <Row label="Durée" value="1h30" />
            <Row label="Participants" value={`Toi${participantCount > 0 ? ` + ${participantCount}` : ''}`} />
            <Row label="Tarif (session 1h30)" value={fcfa(slotPrice)} />
            <Row label="≈ par joueur (à 4)" value={perPlayer(slotPrice)} />
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
                  startsAt: slotTimestamp(day!.key, slot!),
                  court: effectiveCourt!,
                  area: club.area,
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
                  const share = slotPrice ? `\nPrévois ${perPlayerOf(slotPrice, 1 + invitedNames.length)} chacun.` : '';
                  openWhatsApp(
                    '',
                    `On joue au padel ! 🎾\n${club.name} — ${day!.label} à ${slot!} (session 1h30)\n${effectiveCourt!}${who}${share}\nRéservé via PadelConnect.`,
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
                setSlot(null);
                setCourt(null);
                setFriendIds([]);
                setExtraNames([]);
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
          hint="session · 1h30"
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
                  const noCourt = !!day && (freeBySlot?.get(s)?.length ?? 0) === 0;
                  const blocked = !day || compToday || isPast || noCourt;
                  // Avec des plages tarifaires, on montre le prix de chaque créneau.
                  const label = isPast
                    ? `${s} · passé`
                    : noCourt
                      ? `${s} · complet`
                      : hasTiers
                        ? `${s} · ${fcfa(priceForSlot(club, s))}`
                        : s;
                  return (
                    <Chip
                      key={s}
                      label={label}
                      active={s === slot}
                      disabled={blocked}
                      onPress={() => {
                        setSlot(s);
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

        {day && slot ? (
          <Reveal>
            <Label text="Terrain" />
            <View style={styles.wrap}>
              {allCourts.map((c) => {
                const isFree = free.includes(c);
                return (
                  <Chip
                    key={c}
                    label={isFree ? c : `${c} · pris`}
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

        <Label text={`Avec qui ? (toi + ${participantCount}/3 — optionnel)`} />
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
        {participantCount < 3 ? (
          <View style={styles.extraRow}>
            <TextInput
              value={extraName}
              onChangeText={setExtraName}
              placeholder="Ou un autre nom…"
              placeholderTextColor={colors.textMuted}
              style={styles.extraInput}
              onSubmitEditing={addExtra}
            />
            <Button size="sm" label="Ajouter" icon="add" variant="secondary" onPress={addExtra} disabled={extraName.trim().length < 2} />
          </View>
        ) : null}

        {/* Match OUVERT (modèle Playtomic) : il manque des joueurs → n'importe qui peut
            rejoindre les places restantes depuis « Matchs ouverts ». Le terrain est bloqué
            quoi qu'il arrive — s'il ne se remplit pas, la réservation reste normale. */}
        {participantCount < 3 && state.serverUserId ? (
          <Pressable
            onPress={() => setOpenMatch((v) => !v)}
            style={[styles.openMatchBox, openMatch && styles.openMatchBoxOn]}
            accessibilityRole="switch"
            accessibilityState={{ checked: openMatch }}
            accessibilityLabel="Ouvrir ce match aux autres joueurs"
          >
            <Ionicons name={openMatch ? 'radio-button-on' : 'radio-button-off'} size={20} color={colors.signature} />
            <View style={{ flex: 1 }}>
              <Txt variant="body" style={{ fontWeight: '700' }}>
                Ouvrir ce match aux autres joueurs
              </Txt>
              <Txt variant="small" color={colors.textMuted}>
                Ton terrain reste bloqué — les {3 - participantCount} place{3 - participantCount > 1 ? 's' : ''} restante
                {3 - participantCount > 1 ? 's' : ''} deviennent rejoignables (tu es prévenu à chaque arrivée).
              </Txt>
            </View>
          </Pressable>
        ) : null}
        {openMatch && participantCount < 3 ? (
          <View style={[styles.wrap, { marginTop: spacing.sm }]}>
            {['Tous niveaux', '2–3', '3–4', '4–5', '5+'].map((lv) => {
              const value = lv === 'Tous niveaux' ? '' : lv;
              return <Chip key={lv} label={lv} active={openLevel === value} onPress={() => setOpenLevel(value)} />;
            })}
          </View>
        ) : null}

        <Card style={styles.priceRow}>
          <View>
            <Txt variant="muted">Tarif (session 1h30)</Txt>
            <Txt variant="small" color={colors.textFaint}>
              soit ~{perPlayer(slotPrice)} / joueur à 4
            </Txt>
          </View>
          <Txt variant="price">{slot ? fcfa(slotPrice) : `dès ${fcfa(slotPrice)}`}</Txt>
        </Card>

        <View style={{ marginTop: spacing.lg }}>
          <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm, textAlign: 'center' }}>
            Session de 1h30, sans paiement en ligne. Le tarif se règle directement au club. Annulation jusqu’à 5h avant.
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
    <Txt variant="label" color={colors.textFaint} style={{ marginTop: spacing.lg }}>
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
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
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
