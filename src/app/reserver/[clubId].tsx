import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { Screen } from '@/components/Screen';
import { Button, Card, EmptyState, Txt } from '@/components/ui';
import { getClub } from '@/data/clubs';
import { seedCompetitions } from '@/data/competitions';
import { courtsFor, freeCourts, hasCompetition, openSlotsFor, type AvailCtx } from '@/lib/availability';
import { nextDays, slotTimestamp, type DayOption } from '@/lib/days';
import { fcfa } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing } from '@/theme';

export default function ReserverScreen() {
  const params = useLocalSearchParams<{ clubId: string; dateKey?: string; time?: string }>();
  const router = useRouter();
  const club = getClub(params.clubId);
  const { state, addReservation } = useApp();

  const dates = useMemo(() => nextDays(7), []);
  const [day, setDay] = useState<DayOption | null>(dates.find((d) => d.key === params.dateKey) ?? null);
  const [slot, setSlot] = useState<string | null>(params.time ?? null);
  const [court, setCourt] = useState<string | null>(null);
  const [players, setPlayers] = useState(4);
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  if (!club) {
    return (
      <Screen back>
        <EmptyState icon="alert-circle-outline" title="Club introuvable" />
      </Screen>
    );
  }

  const ctx: AvailCtx = {
    clubSlots: state.clubSlots,
    clubCourts: state.clubCourts,
    reservations: state.reservations,
    comps: [...seedCompetitions, ...state.myCompetitions],
  };
  const openSlots = openSlotsFor(club, state.clubSlots);
  const allCourts = courtsFor(club, state.clubCourts);
  const compToday = !!day && hasCompetition(club.id, day.key, ctx.comps);
  const free = day && slot ? freeCourts(club, day.key, slot, ctx) : [];

  const toggleFriend = (id: string) =>
    setFriendIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const ready = !!day && !!slot && !!court && !compToday;

  const confirm = () => {
    if (!day || !slot || !court) return;
    const startsAt = slotTimestamp(day.value, slot);
    if (startsAt <= Date.now()) return;
    const invited = state.friends.filter((f) => friendIds.includes(f.id)).map((f) => ({ id: f.id, name: f.name, confirmed: false }));
    const ok = addReservation({ clubId: club.id, clubName: club.name, court, date: day.label, dateKey: day.key, time: slot, startsAt, players, invited });
    if (ok) setDone(true);
    else setCourt(null); // terrain pris entre-temps
  };

  if (done) {
    return (
      <Screen back title="Réservation">
        <Card style={{ alignItems: 'center', paddingVertical: spacing.xl, marginTop: spacing.lg }}>
          <Ionicons name="checkmark-circle" size={56} color={colors.green} />
          <Txt variant="h2" style={{ marginTop: spacing.md }}>
            Terrain réservé 🎾
          </Txt>
          <Txt variant="muted" style={{ marginTop: 4, textAlign: 'center' }}>
            Tu recevras un rappel avant le match.
          </Txt>
          <View style={styles.summary}>
            <Row label="Club" value={club.name} />
            <Row label="Terrain" value={court!} />
            <Row label="Jour" value={day!.label} />
            <Row label="Heure" value={slot!} />
            <Row label="Joueurs" value={`${players}`} />
            {friendIds.length > 0 ? <Row label="Amis invités" value={`${friendIds.length}`} /> : null}
            <Row label="Tarif indicatif" value={`dès ${fcfa(club.priceFrom)}/h`} />
          </View>
          <View style={{ alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.lg }}>
            <Button label="Retour à l'accueil" onPress={() => router.push('/')} full />
            <Button label="Réserver un autre créneau" variant="ghost" onPress={() => { setDone(false); setSlot(null); setCourt(null); setFriendIds([]); }} full />
          </View>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen back title="Réserver" subtitle={club.name}>
      <Label text="Jour" />
      <View style={styles.wrap}>
        {dates.map((d) => (
          <Chip key={d.key} label={d.label} active={d.key === day?.key} onPress={() => { setDay(d); setSlot(null); setCourt(null); }} size="lg" />
        ))}
      </View>

      {compToday ? (
        <View style={styles.banner}>
          <Ionicons name="trophy" size={16} color={colors.gold} />
          <Txt variant="small" color={colors.text} style={{ flex: 1 }}>
            Une compétition a lieu ce jour à {club.name} — le terrain n'est pas réservable.
          </Txt>
        </View>
      ) : null}

      <Label text={day ? 'Créneau' : 'Créneau (choisis d’abord un jour)'} />
      <View style={styles.wrap}>
        {openSlots.map((s) => {
          const slotTs = slotTimestamp(day?.value ?? 0, s);
          const isPast = !!day && slotTs <= Date.now();
          const noCourt = !!day && freeCourts(club, day.key, s, ctx).length === 0;
          const blocked = !day || compToday || isPast || noCourt;
          const label = isPast ? `${s} · passé` : noCourt ? `${s} · complet` : s;
          return <Chip key={s} label={label} active={s === slot} disabled={blocked} onPress={() => { setSlot(s); setCourt(null); }} size="lg" />;
        })}
        {openSlots.length === 0 ? (
          <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
            Aucun créneau ouvert par le club pour le moment.
          </Txt>
        ) : null}
      </View>

      {day && slot ? (
        <>
          <Label text="Terrain" />
          <View style={styles.wrap}>
            {allCourts.map((c) => {
              const isFree = free.includes(c);
              return <Chip key={c} label={isFree ? c : `${c} · pris`} active={c === court} disabled={!isFree} onPress={() => setCourt(c)} size="lg" />;
            })}
          </View>
        </>
      ) : null}

      <Label text="Nombre de joueurs" />
      <View style={styles.wrap}>
        {[2, 3, 4].map((p) => (
          <Chip key={p} label={`${p} joueurs`} active={p === players} onPress={() => setPlayers(p)} size="lg" />
        ))}
      </View>

      {state.friends.length > 0 ? (
        <>
          <Label text="Inviter des amis (optionnel)" />
          <View style={styles.wrap}>
            {state.friends.map((f) => (
              <Chip key={f.id} label={f.name} icon={friendIds.includes(f.id) ? 'checkmark' : 'person-add'} active={friendIds.includes(f.id)} onPress={() => toggleFriend(f.id)} />
            ))}
          </View>
        </>
      ) : null}

      <Card style={styles.priceRow}>
        <Txt variant="muted">Tarif indicatif</Txt>
        <Txt variant="price">dès {fcfa(club.priceFrom)} / heure</Txt>
      </Card>

      <View style={{ marginTop: spacing.lg }}>
        <Button label="Réserver le terrain" icon="checkmark" onPress={confirm} disabled={!ready} full />
        <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm, textAlign: 'center' }}>
          Réservation sans paiement en ligne. Le tarif se règle directement au club. Annulation jusqu'à 5h avant.
        </Txt>
      </View>
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
    backgroundColor: colors.goldSoft,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.lg },
  summary: { alignSelf: 'stretch', marginTop: spacing.lg, gap: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
