import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { Reveal } from '@/components/Reveal';
import { Screen } from '@/components/Screen';
import { StickyBar } from '@/components/StickyBar';
import { Stepper } from '@/components/Stepper';
import { Button, Card, EmptyState, Txt, type IconName } from '@/components/ui';
import { activeClubs, findClub } from '@/data/clubs';
import { seedCompetitions } from '@/data/competitions';
import { openWhatsApp } from '@/lib/contact';
import { courtsFor, freeCourts, hasCompetition, openSlotsFor, type AvailCtx } from '@/lib/availability';
import { nextDays, slotTimestamp, type DayOption } from '@/lib/days';
import { fcfa, perPlayer } from '@/lib/format';
import { minPrice, priceForSlot, priceTiersFor } from '@/lib/pricing';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing } from '@/theme';

export default function ReserverScreen() {
  const params = useLocalSearchParams<{ clubId: string; dateKey?: string; time?: string }>();
  const router = useRouter();
  const { state, addReservation } = useApp();
  const club = findClub(params.clubId, state.customClubs, state.clubInfo);

  const dates = useMemo(() => nextDays(7), []);
  const [day, setDay] = useState<DayOption | null>(dates.find((d) => d.key === params.dateKey) ?? null);
  const [slot, setSlot] = useState<string | null>(params.time ?? null);
  const [court, setCourt] = useState<string | null>(null);
  // Participants : toi + jusqu'à 3 invités (amis ou nom libre).
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [extraNames, setExtraNames] = useState<string[]>([]);
  const [extraName, setExtraName] = useState('');
  const [done, setDone] = useState(false);

  if (!club) {
    return (
      <Screen back>
        <EmptyState icon="alert-circle-outline" title="Club introuvable" />
      </Screen>
    );
  }

  const ctx: AvailCtx = {
    clubs: activeClubs(state.customClubs, state.clubInfo),
    clubSlots: state.clubSlots,
    clubCourts: state.clubCourts,
    reservations: state.reservations,
    comps: [...seedCompetitions, ...state.myCompetitions],
    blocked: state.blockedSlots,
  };
  const openSlots = openSlotsFor(club, state.clubSlots);
  const allCourts = courtsFor(club, state.clubCourts);
  const compToday = !!day && hasCompetition(club.id, day.key, ctx.comps);
  const free = day && slot ? freeCourts(club, day.key, slot, ctx) : [];

  // A-L2 : pré-sélectionner le 1er terrain libre dès que jour + créneau sont choisis.
  // Valeur dérivée : si l'utilisateur n'a pas encore choisi manuellement (court === null)
  // ET qu'un terrain libre existe, on propose le premier. L'utilisateur peut toujours
  // cliquer sur un autre chip pour le remplacer (setCourt(c)). Pur UX, pas de setState
  // dans le rendu ni d'effet — la dispo ne change pas.
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

  const confirm = () => {
    if (!day || !slot || !effectiveCourt) return;
    const startsAt = slotTimestamp(day.value, slot);
    if (startsAt <= Date.now()) return;
    const invited = [
      ...state.friends.filter((f) => friendIds.includes(f.id)).map((f) => ({ id: f.id, name: f.name, confirmed: false })),
      ...extraNames.map((n, i) => ({ id: `x-${Date.now()}-${i}`, name: n, confirmed: false })),
    ];
    const ok = addReservation({
      clubId: club.id,
      clubName: club.name,
      court: effectiveCourt,
      date: day.label,
      dateKey: day.key,
      time: slot,
      startsAt,
      price: priceForSlot(club, slot),
      players: 1 + invited.length,
      invited,
    });
    if (ok) setDone(true);
    else setCourt(null); // terrain pris entre-temps → réinitialise aussi la pré-sélection
  };

  if (done) {
    return (
      <Screen back title="Réservation">
        <Card style={{ alignItems: 'center', paddingVertical: spacing.xl, marginTop: spacing.lg }}>
          <Ionicons name="checkmark-circle" size={56} color={colors.green} />
          <Txt variant="h2" style={{ marginTop: spacing.md }}>
            Terrain réservé !
          </Txt>
          <Txt variant="muted" style={{ marginTop: 4, textAlign: 'center' }}>
            Le club la reçoit dans son Espace Club et la confirme. Tu recevras un rappel avant le match.
          </Txt>
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
            {participantCount > 0 ? (
              <Button
                label="Prévenir mes partenaires"
                icon="logo-whatsapp"
                variant="secondary"
                onPress={() => {
                  const invitedNames = [...state.friends.filter((f) => friendIds.includes(f.id)).map((f) => f.name), ...extraNames];
                  const who = invitedNames.length ? `\nÉquipe : ${invitedNames.join(', ')}` : '';
                  const share = slotPrice ? `\nPrévois ${perPlayer(slotPrice)} chacun.` : '';
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
  // A-L2 : le step 2 (terrain) est considéré complété dès qu'effectiveCourt est défini.
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
          cta="Réserver le terrain"
          onPress={confirm}
          disabled={!ready}
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
                setDay(d);
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
              Un tournoi a lieu ce jour à {club.name} — le terrain n'est pas réservable.
            </Txt>
          </View>
        ) : null}

        <Label text={day ? 'Créneau' : 'Créneau (choisis d’abord un jour)'} />
        {SLOT_PERIODS.map((period) => {
          const periodSlots = openSlots.filter((s) => periodOf(s) === period.id);
          if (periodSlots.length === 0) return null;
          return (
            <View key={period.id}>
              <View style={styles.periodHeader}>
                <Ionicons name={period.icon} size={15} color={period.color} />
                <Txt variant="label" color={colors.textMuted}>
                  {period.label}
                  {hasTiers && periodSlots[0] ? ` · ${fcfa(priceForSlot(club, periodSlots[0]))}` : ''}
                </Txt>
              </View>
              <View style={styles.wrap}>
                {periodSlots.map((s) => {
                  const slotTs = slotTimestamp(day?.value ?? 0, s);
                  const isPast = !!day && slotTs <= Date.now();
                  const noCourt = !!day && freeCourts(club, day.key, s, ctx).length === 0;
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
          <>
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
          </>
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
        {participantCount < 3 ? (
          <View style={styles.extraRow}>
            <TextInput
              value={extraName}
              onChangeText={setExtraName}
              placeholder="Ou un autre nom…"
              placeholderTextColor={colors.textFaint}
              style={styles.extraInput}
              onSubmitEditing={addExtra}
            />
            <Button size="sm" label="Ajouter" icon="add" variant="secondary" onPress={addExtra} disabled={extraName.trim().length < 2} />
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
            Session de 1h30, sans paiement en ligne. Le tarif se règle directement au club. Annulation jusqu'à 5h avant.
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
    backgroundColor: colors.signatureSoft,
    borderWidth: 1,
    borderColor: colors.signature,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.lg },
  summary: { alignSelf: 'stretch', marginTop: spacing.lg, gap: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
