import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { PaymentMethods } from '@/components/PaymentMethods';
import { Screen } from '@/components/Screen';
import { Button, Card, EmptyState, Txt } from '@/components/ui';
import { SAMPLE_SLOTS, getClub } from '@/data/clubs';
import { paymentLabel } from '@/data/payments';
import { useApp } from '@/store/AppContext';
import { fcfa } from '@/lib/format';
import { colors, spacing } from '@/theme';

const DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

function nextDays(n: number) {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    d.setHours(0, 0, 0, 0);
    const label = i === 0 ? "Aujourd'hui" : i === 1 ? 'Demain' : `${DAYS[d.getDay()]} ${d.getDate()}`;
    return { label, value: d.getTime() };
  });
}

export default function ReserverScreen() {
  const { clubId } = useLocalSearchParams();
  const router = useRouter();
  const club = getClub(clubId);
  const { state, addReservation } = useApp();

  const dates = useMemo(() => nextDays(5), []);
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [players, setPlayers] = useState(4);
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [payment, setPayment] = useState<string | null>(null);
  const [split, setSplit] = useState(false);
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState(false);

  if (!club) {
    return (
      <Screen back>
        <EmptyState icon="alert-circle-outline" title="Club introuvable" />
      </Screen>
    );
  }

  const slots = Array.from(new Set([...SAMPLE_SLOTS, ...(state.clubSlots[club.id] ?? [])])).sort();
  const taken = state.reservations.filter((r) => r.clubId === club.id && r.date === date).map((r) => r.time);
  const perPlayer = Math.round(club.priceFrom / players);
  const amount = split ? perPlayer : club.priceFrom;

  const toggleFriend = (id: string) =>
    setFriendIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const pay = () => {
    if (!date || !slot || !payment || paying) return;
    const dayValue = dates.find((d) => d.label === date)?.value ?? Date.now();
    const [h, m] = slot.split(':').map(Number);
    const startsAt = dayValue + h * 3600000 + m * 60000;
    const invited = state.friends
      .filter((f) => friendIds.includes(f.id))
      .map((f) => ({ id: f.id, name: f.name, confirmed: false }));
    setPaying(true);
    setTimeout(() => {
      addReservation({ clubId: club.id, clubName: club.name, date, time: slot, startsAt, players, payment: paymentLabel(payment), invited });
      setPaying(false);
      setDone(true);
    }, 900);
  };

  if (done) {
    return (
      <Screen back title="Réservation">
        <Card style={{ alignItems: 'center', paddingVertical: spacing.xl, marginTop: spacing.lg }}>
          <Ionicons name="checkmark-circle" size={56} color={colors.green} />
          <Txt variant="h2" style={{ marginTop: spacing.md }}>
            Créneau réservé & payé
          </Txt>
          <Txt variant="muted" style={{ marginTop: 4, textAlign: 'center' }}>
            (Démo — paiement simulé.) Annulation possible jusqu’à 5h avant.
          </Txt>
          <View style={styles.summary}>
            <Row label="Terrain" value={club.name} />
            <Row label="Date" value={date!} />
            <Row label="Heure" value={slot!} />
            <Row label="Joueurs" value={`${players}`} />
            {friendIds.length > 0 ? <Row label="Amis invités" value={`${friendIds.length}`} /> : null}
            <Row label="Paiement" value={paymentLabel(payment)} />
            <Row label={split ? 'Part / joueur' : 'Montant payé'} value={`≈ ${fcfa(amount)}`} />
          </View>
          <View style={{ alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.lg }}>
            <Button label="Retour à l'accueil" onPress={() => router.push('/')} full />
            <Button label="Réserver un autre créneau" variant="ghost" onPress={() => { setDone(false); setSlot(null); setFriendIds([]); }} full />
          </View>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen back title="Réserver" subtitle={club.name}>
      <Label text="Choisis une date" />
      <View style={styles.wrap}>
        {dates.map((d) => (
          <Chip key={d.label} label={d.label} active={d.label === date} onPress={() => { setDate(d.label); setSlot(null); }} size="lg" />
        ))}
      </View>

      <Label text={date ? 'Choisis un créneau' : 'Choisis un créneau (choisis d’abord une date)'} />
      <View style={styles.wrap}>
        {slots.map((s) => {
          const isTaken = !!date && taken.includes(s);
          return (
            <Chip key={s} label={isTaken ? `${s} · réservé` : s} active={s === slot} disabled={!date || isTaken} onPress={() => setSlot(s)} size="lg" />
          );
        })}
      </View>

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

      <Label text="Mode de paiement" />
      <View style={{ marginTop: spacing.sm }}>
        <PaymentMethods value={payment} onChange={setPayment} />
      </View>

      <Card style={styles.split}>
        <View style={{ flex: 1 }}>
          <Txt variant="h3" style={{ fontSize: 15 }}>
            Diviser entre joueurs
          </Txt>
          <Txt variant="muted">
            {split ? `Chacun paie ≈ ${fcfa(perPlayer)}` : 'Chacun paie sa part (terrain ÷ joueurs)'}
          </Txt>
        </View>
        <Switch value={split} onValueChange={setSplit} trackColor={{ true: colors.gold, false: colors.border }} thumbColor={colors.white} />
      </Card>

      <View style={{ marginTop: spacing.xl }}>
        <Button
          label={paying ? 'Paiement en cours…' : `Payer ≈ ${fcfa(amount)}`}
          icon={paying ? 'hourglass' : 'card'}
          onPress={pay}
          disabled={!date || !slot || !payment || paying}
          full
        />
        <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm, textAlign: 'center' }}>
          Le créneau n’est réservé qu’une fois payé. Annulation gratuite jusqu’à 5h avant ; après, à régler avec le club.
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
  split: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.lg },
  summary: { alignSelf: 'stretch', marginTop: spacing.lg, gap: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
