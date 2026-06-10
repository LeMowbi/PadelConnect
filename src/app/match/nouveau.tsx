import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { LevelStepper } from '@/components/LevelStepper';
import { Screen } from '@/components/Screen';
import { Button, Card, Txt, type IconName } from '@/components/ui';
import { clubsByName } from '@/data/clubs';
import { seedCompetitions } from '@/data/competitions';
import { LOOKING_OPTIONS, levelLabel, type Looking } from '@/data/matches';
import { courtsFor, freeCourts, hasCompetition, openSlotsFor, type AvailCtx } from '@/lib/availability';
import { nextDays, slotTimestamp, type DayOption } from '@/lib/days';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing } from '@/theme';

export default function NouveauMatch() {
  const router = useRouter();
  const { state, addReservation, addMatch } = useApp();

  const dates = useMemo(() => nextDays(5), []);
  const [clubId, setClubId] = useState<string | null>(null);
  const [day, setDay] = useState<DayOption | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [court, setCourt] = useState<string | null>(null);
  const [levelValue, setLevelValue] = useState(state.level);
  const [looking, setLooking] = useState<Looking>('partenaire');
  const [places, setPlaces] = useState(1);
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [visibility, setVisibility] = useState(state.defaultVisibility);
  // Niveau, amis et visibilité ont de bons défauts : repliés pour garder l'écran simple.
  const [showAdvanced, setShowAdvanced] = useState(false);

  const club = clubsByName.find((c) => c.id === clubId) ?? null;
  const ctx: AvailCtx = {
    clubSlots: state.clubSlots,
    clubCourts: state.clubCourts,
    reservations: state.reservations,
    comps: [...seedCompetitions, ...state.myCompetitions],
  };
  const openSlots = club ? openSlotsFor(club, state.clubSlots) : [];
  const allCourts = club ? courtsFor(club, state.clubCourts) : [];
  const compToday = !!club && !!day && hasCompetition(club.id, day.key, ctx.comps);
  const free = club && day && slot ? freeCourts(club, day.key, slot, ctx) : [];

  const ready = !!club && !!day && !!slot && !!court && !compToday;

  const toggleFriend = (id: string) => setFriendIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const create = () => {
    if (!club || !day || !slot || !court) return;
    const startsAt = slotTimestamp(day.value, slot);
    if (startsAt <= Date.now()) return;
    const invited = state.friends.filter((f) => friendIds.includes(f.id)).map((f) => ({ id: f.id, name: f.name, confirmed: false }));
    if (!addReservation({ clubId: club.id, clubName: club.name, court, date: day.label, dateKey: day.key, time: slot, startsAt, players: 4, invited })) {
      setCourt(null); // terrain pris entre-temps : on redemande
      return;
    }
    addMatch({
      clubId: club.id,
      clubName: club.name,
      date: day.label,
      time: slot,
      startsAt,
      levelValue,
      looking,
      total: 4,
      spotsLeft: places,
      visibility,
      host: state.account?.firstName ?? 'Joueur',
    });
    router.replace('/matchs');
  };

  return (
    <Screen back title="Créer un match">
      <Card style={{ marginTop: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Ionicons name="tennisball" size={22} color={colors.gold} />
        <Txt variant="small" color={colors.textMuted} style={{ flex: 1 }}>
          Groupe incomplet ou seul ? Réserve un terrain et ouvre des places — on te trouve des joueurs.
        </Txt>
      </Card>

      <Label text="Terrain (club)" />
      <View style={styles.wrap}>
        {clubsByName.map((c) => (
          <Chip key={c.id} label={c.name} active={c.id === clubId} onPress={() => { setClubId(c.id); setSlot(null); setCourt(null); }} />
        ))}
      </View>

      <Label text="Date" />
      <View style={styles.wrap}>
        {dates.map((d) => (
          <Chip key={d.key} label={d.label} active={d.key === day?.key} onPress={() => { setDay(d); setSlot(null); setCourt(null); }} size="lg" />
        ))}
      </View>

      {compToday ? (
        <View style={styles.banner}>
          <Ionicons name="trophy" size={16} color={colors.gold} />
          <Txt variant="small" color={colors.text} style={{ flex: 1 }}>
            Tournoi ce jour à {club?.name} — terrain indisponible.
          </Txt>
        </View>
      ) : null}

      <Label text={club ? 'Créneau' : 'Créneau (choisis d’abord un club)'} />
      <View style={styles.wrap}>
        {openSlots.map((s) => {
          const slotTs = slotTimestamp(day?.value ?? 0, s);
          const isPast = !!day && slotTs <= Date.now();
          const noCourt = !!club && !!day && freeCourts(club, day.key, s, ctx).length === 0;
          const blocked = !day || compToday || isPast || noCourt;
          const label = isPast ? `${s} · passé` : noCourt ? `${s} · complet` : s;
          return <Chip key={s} label={label} active={s === slot} disabled={blocked} onPress={() => { setSlot(s); setCourt(null); }} size="lg" />;
        })}
        {club && openSlots.length === 0 ? (
          <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
            Aucun créneau ouvert par ce club.
          </Txt>
        ) : null}
      </View>

      {club && day && slot ? (
        <>
          <Label text="Terrain disponible" />
          <View style={styles.wrap}>
            {allCourts.map((c) => {
              const isFree = free.includes(c);
              return <Chip key={c} label={isFree ? c : `${c} · pris`} active={c === court} disabled={!isFree} onPress={() => setCourt(c)} size="lg" />;
            })}
          </View>
        </>
      ) : null}

      <Label text="Tu cherches" />
      <View style={styles.wrap}>
        {LOOKING_OPTIONS.map((o) => (
          <Chip key={o.id} label={o.label} icon={o.icon as IconName} active={o.id === looking} onPress={() => setLooking(o.id)} />
        ))}
      </View>

      <Label text="Places à pourvoir" />
      <View style={styles.wrap}>
        {[1, 2, 3].map((p) => (
          <Chip key={p} label={`${p}`} active={p === places} onPress={() => setPlaces(p)} size="lg" />
        ))}
      </View>

      {/* Options avancées — bons défauts : ton niveau, match public, pas d'invitation */}
      <Pressable onPress={() => setShowAdvanced((v) => !v)} style={styles.advancedToggle}>
        <Ionicons name={showAdvanced ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.textMuted} />
        <Txt variant="body" color={colors.textMuted} style={{ fontWeight: '600' }}>
          Options avancées
        </Txt>
        <Txt variant="small" color={colors.textFaint} style={{ flex: 1 }}>
          niveau · amis · visibilité
        </Txt>
      </Pressable>

      {showAdvanced ? (
        <>
          <Label text="Niveau du match" />
          <View style={{ alignItems: 'center', marginTop: spacing.sm }}>
            <LevelStepper value={levelValue} onChange={setLevelValue} />
            <Txt variant="small" color={colors.textMuted} style={{ marginTop: spacing.sm }}>
              {levelLabel(levelValue)}
            </Txt>
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

          <Label text="Qui peut voir ce match ?" />
          <View style={styles.wrap}>
            <Chip label="Public" icon="earth" active={visibility === 'public'} onPress={() => setVisibility('public')} size="lg" />
            <Chip label="Amis uniquement" icon="people" active={visibility === 'amis'} onPress={() => setVisibility('amis')} size="lg" />
          </View>
        </>
      ) : null}

      <View style={{ marginTop: spacing.xl }}>
        <Button label="Créer le match & réserver le terrain" icon="checkmark" onPress={create} disabled={!ready} full />
        <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm, textAlign: 'center' }}>
          Créer un match réserve le créneau. Le tarif se règle au club ; annulation jusqu'à 5h avant.
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

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  advancedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
    paddingVertical: spacing.sm,
  },
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
});
