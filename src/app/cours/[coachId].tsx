import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { PopIn } from '@/components/PopIn';
import { Reveal } from '@/components/Reveal';
import { Screen } from '@/components/Screen';
import { SkeletonCard } from '@/components/Skeleton';
import { StickyBar } from '@/components/StickyBar';
import { Stepper } from '@/components/Stepper';
import { useToast } from '@/components/Toast';
import { Button, Card, EmptyState, IconCircle, Txt } from '@/components/ui';
import { activeClubs, findClub } from '@/data/clubs';
import { seedCompetitions } from '@/data/competitions';
import { freeCourts, hasFullDayCompetition, openSlotsFor, type AvailCtx } from '@/lib/availability';
import { fetchClubCoaches, type ServerCoach } from '@/lib/coachesServer';
import { dateKeyLabel, nextDays, slotTimestamp } from '@/lib/days';
import { fcfa } from '@/lib/format';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { priceForSlot } from '@/lib/pricing';
import { useTodayKey } from '@/lib/useTodayKey';
import { useApp } from '@/store/AppContext';
import { colors, gradients, radius, shadows, spacing } from '@/theme';

// RÉSERVER UN COURS avec un coach du club : jour → créneau (dispos du coach ∩ terrain libre)
// → terrain. On n’envoie qu’une DEMANDE : le terrain n’est réservé que si le coach accepte
// (la réservation créée passe ensuite par la confirmation du club, comme d’habitude).
export default function CoursScreen() {
  const params = useLocalSearchParams<{ coachId: string; clubId?: string }>();
  const router = useRouter();
  const { state, requestCoachLesson } = useApp();
  const toast = useToast();
  const coachId = Array.isArray(params.coachId) ? params.coachId[0] : params.coachId;
  const club = findClub(params.clubId, state.customClubs, state.clubInfo);

  // Le coach est relu au serveur (dispos à jour) plutôt que passé en paramètre de route.
  const [coaches, setCoaches] = useState<ServerCoach[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const clubId = club?.id;
  useEffect(() => {
    if (!clubId) return;
    let alive = true;
    void fetchClubCoaches(clubId).then((list) => {
      if (!alive) return;
      // setState APRÈS l’await uniquement (règle React Compiler — pas de setState synchrone).
      if (list) {
        setCoaches(list);
        setLoadFailed(false);
      } else {
        setLoadFailed(true); // échec réseau ≠ « aucun coach »
      }
    });
    return () => {
      alive = false;
    };
  }, [clubId]);

  // todayKey : la liste se recale après minuit (retour premier plan) — cf. reserver/index.tsx.
  const todayKey = useTodayKey();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const dates = useMemo(() => nextDays(7), [todayKey]);
  // On ne stocke QUE la clé du jour choisi et on dérive l’objet à chaque rendu (motif
  // SectionReservations.tsx / reserver/index.tsx) : sinon, après une nuit en arrière-plan,
  // `dates` est recalé par useTodayKey mais `day` resterait figé sur l’ancien objet (veille).
  const [selDayKey, setSelDayKey] = useState<string | null>(null);
  const day = dates.find((d) => d.key === selDayKey) ?? null;
  const [slot, setSlot] = useState<string | null>(null);
  const [court, setCourt] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!club) {
    return (
      <Screen back>
        <EmptyState icon="alert-circle-outline" title="Club introuvable" />
      </Screen>
    );
  }

  const coach = coaches?.find((c) => c.userId === coachId);

  if (coaches === null) {
    return (
      <Screen back title="Réserver un cours" subtitle={club.name}>
        {loadFailed ? (
          <Card style={{ marginTop: spacing.lg, alignItems: 'center', paddingVertical: spacing.lg }}>
            <Ionicons name="cloud-offline-outline" size={24} color={colors.textFaint} />
            <Txt variant="muted" style={{ marginTop: spacing.sm, textAlign: 'center' }}>
              Impossible de charger le coach — vérifie ta connexion.
            </Txt>
            <View style={{ marginTop: spacing.md }}>
              <Button size="sm" label="Retour à la fiche club" variant="secondary" onPress={() => router.back()} />
            </View>
          </Card>
        ) : (
          // Squelette au format de la fiche coach — chargement perçu plus fluide qu'un texte nu.
          <View style={{ marginTop: spacing.lg }}>
            <SkeletonCard banner={false} />
          </View>
        )}
      </Screen>
    );
  }

  if (!coach) {
    return (
      <Screen back title="Réserver un cours" subtitle={club.name}>
        <EmptyState
          icon="school-outline"
          title="Coach indisponible"
          text="Ce coach ne fait plus partie de l’équipe du club. Retourne sur la fiche du club pour en choisir un autre."
        />
      </Screen>
    );
  }

  const ctx: AvailCtx = {
    clubs: activeClubs(state.customClubs, state.clubInfo),
    clubSlots: state.clubSlots,
    clubCourts: state.clubCourts,
    reservations: state.reservations,
    occupancy: state.occupancy,
    comps: [...seedCompetitions, ...state.myCompetitions],
    blocked: state.blockedSlots,
  };
  // Créneaux proposables = dispos du COACH ∩ horaires encore ouverts par le CLUB (triés).
  const openSlots = openSlotsFor(club, state.clubSlots);
  const coachSlots = coach.slots.filter((s) => openSlots.includes(s)).sort();
  const compToday = !!day && hasFullDayCompetition(club.id, day.key, ctx.comps);
  const free = day && slot ? freeCourts(club, day.key, slot, ctx) : [];
  // Pré-sélection du 1er terrain libre (même confort que l’écran Réserver, A-L2).
  const effectiveCourt = court ?? (day && slot && free.length > 0 ? free[0] : null);

  const slotPrice = slot ? priceForSlot(club, slot) : null;
  const ready = !!day && !!slot && !!effectiveCourt && !compToday;
  const step = !day ? 0 : !slot ? 1 : !effectiveCourt ? 2 : 3;

  const confirm = async () => {
    if (!day || !slot || !effectiveCourt || submitting) return;
    if (!state.serverUserId) {
      toast.show('Connecte-toi pour demander un cours', { icon: 'person-circle-outline' });
      return;
    }
    const startsAt = slotTimestamp(day.key, slot);
    if (startsAt <= Date.now()) {
      toast.show('Ce créneau vient de passer — choisis-en un autre.', { icon: 'alert-circle' });
      setSlot(null);
      return;
    }
    setSubmitting(true);
    const ok = await requestCoachLesson({
      coachId: coach.userId,
      clubId: club.id,
      clubName: club.name,
      dateKey: day.key,
      dateLabel: dateKeyLabel(day.key), // libellé ABSOLU (« Lun 8 juin ») : jamais faux le lendemain
      time: slot,
      court: effectiveCourt,
      startsAt,
      price: priceForSlot(club, slot),
    });
    setSubmitting(false);
    if (ok) {
      hapticSuccess();
      setDone(true);
    } else {
      // Doublon de demande, coach retiré entre-temps ou échec réseau : le serveur refuse
      // sans détailler — on invite à réessayer sans rien perdre du choix.
      hapticWarning();
      toast.show('Demande impossible — vérifie ta connexion ou réessaie plus tard', { icon: 'alert-circle' });
    }
  };

  if (done) {
    return (
      <Screen back title="Cours demandé">
        <LinearGradient colors={gradients.deepGreen} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.successHero}>
          <PopIn>
            <View style={styles.successBadge}>
              <Ionicons name="paper-plane" size={32} color={colors.onSignature} />
            </View>
          </PopIn>
          <Txt variant="h2" color={colors.onSignature} style={{ marginTop: spacing.md }}>
            Demande envoyée !
          </Txt>
          <Txt variant="small" color={colors.onPhoto} style={{ marginTop: 4, textAlign: 'center' }}>
            {coach.name} reçoit ta demande. Le terrain sera réservé dès qu’il accepte — tu seras prévenu par notification.
          </Txt>
        </LinearGradient>
        <Card style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
          <View style={styles.summary}>
            <Row label="Coach" value={coach.name} />
            <Row label="Club" value={club.name} />
            <Row label="Jour" value={day!.label} />
            <Row label="Heure" value={slot!} />
            <Row label="Terrain (si accepté)" value={effectiveCourt!} />
            {slotPrice ? <Row label="Terrain (réglé au club)" value={fcfa(slotPrice)} /> : null}
            {coach.price ? <Row label="Cours (réglé au coach)" value={fcfa(coach.price)} /> : null}
          </View>
          <View style={{ alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.lg }}>
            <Button label="Voir mes cours" icon="calendar" onPress={() => router.push('/reservations')} full />
            <Button label="Retour à la fiche du club" variant="ghost" onPress={() => router.back()} full />
          </View>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      back
      title="Réserver un cours"
      subtitle={`${coach.name} — ${club.name}`}
      contentStyle={{ paddingBottom: 96 }}
      overlay={
        <StickyBar
          label={slotPrice ? fcfa(slotPrice) : 'Terrain'}
          hint="terrain · session 1h30"
          cta={submitting ? 'Envoi…' : 'Demander le cours'}
          onPress={confirm}
          disabled={!ready || submitting}
        />
      }
    >
      <Reveal>
        {/* Qui est le coach + comment ça marche */}
        <Card style={{ marginTop: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <IconCircle icon="school" color={colors.purple} bg={colors.purpleSoft} />
          <View style={{ flex: 1 }}>
            <Txt variant="h3">{coach.name}</Txt>
            <Txt variant="muted" numberOfLines={2}>
              {coach.specialty || 'Coach du club'}
              {coach.price ? ` · cours ${fcfa(coach.price)} (réglé au coach)` : ''}
            </Txt>
          </View>
        </Card>
        <View style={styles.banner}>
          <Ionicons name="shield-checkmark-outline" size={16} color={colors.signature} />
          <Txt variant="small" color={colors.text} style={{ flex: 1 }}>
            Le terrain n’est réservé que si {coach.name} accepte ta demande — rien n’est engagé avant.
          </Txt>
        </View>

        <Stepper steps={['Jour', 'Créneau', 'Terrain', 'Envoyer']} current={step} />
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
          <View style={styles.banner}>
            <Ionicons name="trophy" size={16} color={colors.signature} />
            <Txt variant="small" color={colors.text} style={{ flex: 1 }}>
              Un tournoi a lieu ce jour à {club.name} — aucun terrain n’est réservable.
            </Txt>
          </View>
        ) : null}

        <Label text={day ? `Créneau (disponibilités de ${coach.name})` : 'Créneau (choisis d’abord un jour)'} />
        <View style={styles.wrap}>
          {coachSlots.map((s) => {
            const isPast = !!day && slotTimestamp(day.key, s) <= Date.now();
            const noCourt = !!day && freeCourts(club, day.key, s, ctx).length === 0;
            const blocked = !day || compToday || isPast || noCourt;
            const label = isPast ? `${s} · passé` : noCourt ? `${s} · complet` : s;
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
        {coachSlots.length === 0 ? (
          <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
            {coach.name} n’a pas encore publié ses disponibilités — repasse un peu plus tard.
          </Txt>
        ) : null}

        {day && slot ? (
          <>
            <Label text="Terrain (réservé à l’acceptation)" />
            <View style={styles.wrap}>
              {free.map((c) => (
                <Chip key={c} label={c} active={c === effectiveCourt} onPress={() => setCourt(c)} size="lg" />
              ))}
            </View>
          </>
        ) : null}

        <Card style={styles.priceRow}>
          <View style={{ flex: 1 }}>
            <Txt variant="muted">Terrain (session 1h30, réglé au club)</Txt>
            {coach.price ? (
              <Txt variant="small" color={colors.textFaint}>
                + cours {fcfa(coach.price)} réglé directement au coach
              </Txt>
            ) : null}
          </View>
          <Txt variant="price">{slotPrice ? fcfa(slotPrice) : '—'}</Txt>
        </Card>

        <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.lg, textAlign: 'center' }}>
          Double validation : le coach accepte ta demande, puis le club confirme la réservation du terrain.
        </Txt>
      </Reveal>
    </Screen>
  );
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
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.signatureSoft,
    borderWidth: 1,
    borderColor: colors.signature,
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
