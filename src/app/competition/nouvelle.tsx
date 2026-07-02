import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { Button, Txt } from '@/components/ui';
import { activeClubs, findClub } from '@/data/clubs';
import { COMP_FORMATS } from '@/data/competitions';
import { courtsFor, openSlotsFor } from '@/lib/availability';
import { nextDays, type DayOption } from '@/lib/days';
import { fcfa } from '@/lib/format';
import { useTodayKey } from '@/lib/useTodayKey';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing } from '@/theme';

const LEVELS = ['Tous niveaux', 'Débutant', 'Intermédiaire', 'Avancé'];
const SLOTS = [4, 8, 16, 24];

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  error,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  error?: string;
}) {
  return (
    <>
      <Txt variant="label" color={colors.textFaint} style={{ marginTop: spacing.lg }}>
        {label}
      </Txt>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, error ? { borderColor: colors.danger } : null]}
      />
      {error ? (
        <Txt variant="small" color={colors.danger} style={{ marginTop: 4 }}>
          {error}
        </Txt>
      ) : null}
    </>
  );
}

export default function NouvelleCompetition() {
  const router = useRouter();
  const params = useLocalSearchParams<{ as?: string; clubId?: string }>();
  const { state, addCompetition } = useApp();
  const toast = useToast();
  // « asClub » (tournoi OFFICIEL, publié direct) n’est autorisé qu’aux comptes club/opérateur :
  // on le verrouille sur le RÔLE, pas seulement sur le paramètre d’URL — sinon un joueur
  // pourrait forger « ?as=club » et créer un tournoi officiel (puis s’attribuer du niveau).
  const asClub = params.as === 'club' && (state.role === 'club' || state.role === 'operator');
  // « asPadel » : tournoi OFFICIEL PADELCONNECT créé par l'opérateur. Il choisit le club hôte
  // et le tournoi part EN ATTENTE : le club le valide dans son Espace Club (sa permission,
  // dans l'app — décision porteur : on n'entre pas dans le planning d'un club sans son accord).
  const asPadel = params.as === 'padelconnect' && state.role === 'operator';
  const club = asClub ? findClub(params.clubId, state.customClubs, state.clubInfo) : undefined;
  // Tournoi créé par un JOUEUR : il choisit le club hôte, qui devra valider.
  const hosts = useMemo(
    () => activeClubs(state.customClubs, state.clubInfo),
    // state.clubStatus : dépendance indirecte (activeClubs lit clubStatusMap) — cf. clubs/index.tsx.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.customClubs, state.clubInfo, state.clubStatus],
  );

  // Tournois : planification jusqu’à ~6 semaines à l’avance (un tournoi s’organise bien plus
  // tôt qu’une simple réservation, limitée à la semaine).
  // todayKey : la liste se recale après minuit (retour premier plan) — cf. reserver/index.tsx.
  const todayKey = useTodayKey();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const dates = useMemo(() => nextDays(42), [todayKey]);
  const [title, setTitle] = useState('');
  const [reward, setReward] = useState('');
  const [fee, setFee] = useState('');
  const [day, setDay] = useState<DayOption | null>(null);
  const [endDay, setEndDay] = useState<DayOption | null>(null); // fin optionnelle (tournoi multi-jours)
  const [hostId, setHostId] = useState<string | null>(null);
  const [format, setFormat] = useState(COMP_FORMATS[2]);
  const [level, setLevel] = useState('Tous niveaux');
  const [slots, setSlots] = useState(8);
  const [courts, setCourts] = useState<string[]>([]); // terrains réservés au tournoi (multi-sélection)
  const [times, setTimes] = useState<string[]>([]); // créneaux réservés au tournoi (multi-sélection)
  const [submitting, setSubmitting] = useState(false);
  // Erreurs par champ — affichées au tap sur « Publier » (aucun tap silencieux).
  const [errors, setErrors] = useState<{ title?: string; date?: string; host?: string }>({});
  const scrollRef = useRef<ScrollView>(null);
  const datePos = useRef(0);

  // Club hôte résolu (club si compte club, sinon le club choisi par le joueur) → ses terrains
  // et créneaux réels, pour que l’organisateur réserve des terrains/heures PRÉCIS (pas tout).
  const host = asClub ? club : findClub(hostId ?? undefined, state.customClubs, state.clubInfo);
  const hostCourts = host ? courtsFor(host, state.clubCourts) : [];
  const hostSlots = host ? openSlotsFor(host, state.clubSlots) : [];
  const toggleCourt = (c: string) => setCourts((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));
  const toggleTime = (t: string) => setTimes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  const isPlayerTournament = !asClub && !asPadel;

  const create = async () => {
    if (submitting) return;
    const e: { title?: string; date?: string; host?: string } = {};
    if (title.trim().length < 3) e.title = 'Indique un titre (3 lettres minimum).';
    if (!day) e.date = 'Choisis une date.';
    if (!asClub && !hostId) e.host = 'Choisis le club hôte.';
    setErrors(e);
    if (e.title || e.date || e.host) {
      // Scroll automatique vers le premier champ en erreur.
      scrollRef.current?.scrollTo({ y: e.title ? 0 : Math.max(0, datePos.current - 24), animated: true });
      return;
    }
    setSubmitting(true);
    const res = await addCompetition({
      title: title.trim(),
      organizerType: asClub ? 'club' : asPadel ? 'operator' : 'joueur',
      organizer: asClub ? (club?.name ?? 'Club') : asPadel ? 'PadelConnect' : (state.account?.firstName ?? 'Joueur'),
      clubId: host?.id,
      clubName: host?.name,
      date: day!.label,
      dateKey: day!.key,
      // Fin seulement si elle est postérieure au début (tournoi multi-jours).
      endDate: endDay && endDay.key > day!.key ? endDay.label : undefined,
      endDateKey: endDay && endDay.key > day!.key ? endDay.key : undefined,
      format,
      level,
      reward: reward.trim(),
      fee: fee.trim() || 'Gratuit',
      slots,
      registered: 0,
      official: asClub || asPadel,
      // Terrains/créneaux PRÉCIS réservés au tournoi (vides = tout le club ce jour-là).
      courtNames: courts,
      timeSlots: times,
      // Club → publié direct ; joueur → en attente de validation du club hôte.
      status: asClub ? 'approved' : 'pending',
    });
    setSubmitting(false);
    if (!res.ok) {
      // Club : le serveur refuse aussi quand des réservations occupent déjà la plage choisie (37).
      toast.show(
        asClub
          ? 'Création impossible — des réservations occupent peut-être déjà ces créneaux.'
          : 'Création impossible — réessaie dans un instant.',
        { icon: 'alert-circle' },
      );
      return;
    }
    toast.show(asClub ? 'Tournoi publié ✓' : 'Demande envoyée au club ✓');
    router.replace(asClub ? '/club-admin' : '/competitions');
  };
  // NB : pour asPadel, le libellé « Demande envoyée au club ✓ » est exact — le club hôte
  // valide le tournoi PadelConnect dans son Espace Club, comme un tournoi joueur.

  return (
    <Screen
      back
      title="Créer un tournoi"
      subtitle={
        asClub ? `Pour ${club?.name ?? 'ton club'}` : asPadel ? 'Tournoi officiel PadelConnect — le club hôte valide' : 'En tant que joueur'
      }
      scrollRef={scrollRef}
    >
      <Field
        label="Titre"
        value={title}
        onChangeText={(t) => {
          setTitle(t);
          if (errors.title) setErrors((cur) => ({ ...cur, title: undefined }));
        }}
        placeholder="Ex. Défi entre amis — Riviera"
        error={errors.title}
      />
      <Field label="Récompense (optionnel)" value={reward} onChangeText={setReward} placeholder="Ex. Cagnotte 30 000 FCFA" />
      <Field label="Frais d’inscription (optionnel)" value={fee} onChangeText={setFee} placeholder="Vide = Gratuit" />

      <View onLayout={(ev) => (datePos.current = ev.nativeEvent.layout.y)}>
        <Txt variant="label" color={colors.textFaint} style={{ marginTop: spacing.lg }}>
          Date
        </Txt>
        <View style={styles.wrap}>
          {dates.map((d) => (
            <Chip
              key={d.key}
              label={d.label}
              active={d.key === day?.key}
              onPress={() => {
                setDay(d);
                if (endDay && endDay.key <= d.key) setEndDay(null); // fin devenue invalide → on réinitialise
                if (errors.date) setErrors((cur) => ({ ...cur, date: undefined }));
              }}
            />
          ))}
        </View>
        {errors.date ? (
          <Txt variant="small" color={colors.danger} style={{ marginTop: 4 }}>
            {errors.date}
          </Txt>
        ) : null}
      </View>

      {/* Fin optionnelle — pour un tournoi sur plusieurs jours (ex. americano sur un week-end).
          On ne propose que des jours STRICTEMENT après le début ; « 1 seul jour » remet à zéro. */}
      {day ? (
        <View style={{ marginTop: spacing.lg }}>
          <Txt variant="label" color={colors.textFaint}>
            Fin (optionnel — plusieurs jours)
          </Txt>
          <View style={styles.wrap}>
            <Chip label="1 seul jour" active={!endDay} onPress={() => setEndDay(null)} />
            {dates
              .filter((d) => d.key > day.key)
              .map((d) => (
                <Chip key={d.key} label={d.label} active={d.key === endDay?.key} onPress={() => setEndDay(d)} />
              ))}
          </View>
        </View>
      ) : null}

      <Txt variant="label" color={colors.textFaint} style={{ marginTop: spacing.lg }}>
        Format
      </Txt>
      <View style={styles.wrap}>
        {COMP_FORMATS.map((f) => (
          <Chip key={f} label={f} active={f === format} onPress={() => setFormat(f)} />
        ))}
      </View>

      <Txt variant="label" color={colors.textFaint} style={{ marginTop: spacing.lg }}>
        Niveau
      </Txt>
      <View style={styles.wrap}>
        {LEVELS.map((l) => (
          <Chip key={l} label={l} active={l === level} onPress={() => setLevel(l)} />
        ))}
      </View>

      <Txt variant="label" color={colors.textFaint} style={{ marginTop: spacing.lg }}>
        Nombre d’équipes (places limitées)
      </Txt>
      <View style={styles.wrap}>
        {SLOTS.map((s) => (
          <Chip key={s} label={`${s} équipes`} active={s === slots} onPress={() => setSlots(s)} />
        ))}
      </View>
      <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
        Chaque équipe compte 2 joueurs. L’inscription se ferme une fois toutes les places prises.
      </Txt>

      {/* Club hôte — uniquement pour un tournoi créé par un joueur (modération) */}
      {!asClub ? (
        <View style={{ marginTop: spacing.lg }}>
          <Txt variant="label" color={colors.textFaint}>
            Club hôte
          </Txt>
          <View style={styles.wrap}>
            {hosts.map((h) => (
              <Chip
                key={h.id}
                label={h.name}
                active={h.id === hostId}
                onPress={() => {
                  setHostId(h.id);
                  if (errors.host) setErrors((cur) => ({ ...cur, host: undefined }));
                }}
              />
            ))}
          </View>
          {errors.host ? (
            <Txt variant="small" color={colors.danger} style={{ marginTop: 4 }}>
              {errors.host}
            </Txt>
          ) : null}
          <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
            Ton tournoi sera visible une fois validé par le club hôte.
          </Txt>
        </View>
      ) : null}

      {/* Terrains & créneaux réservés au tournoi — choix PRÉCIS (pas forcément tout le club).
          Disponible dès que le club hôte est connu. Rien de coché = tout le club ce(s) jour(s). */}
      {host ? (
        <>
          <Txt variant="label" color={colors.textFaint} style={{ marginTop: spacing.lg }}>
            Terrains réservés au tournoi
          </Txt>
          <View style={styles.wrap}>
            {hostCourts.map((c) => (
              <Chip key={c} label={c} active={courts.includes(c)} onPress={() => toggleCourt(c)} />
            ))}
          </View>

          <Txt variant="label" color={colors.textFaint} style={{ marginTop: spacing.lg }}>
            Créneaux réservés au tournoi
          </Txt>
          <View style={styles.wrap}>
            {hostSlots.map((t) => (
              <Chip key={t} label={t} active={times.includes(t)} onPress={() => toggleTime(t)} />
            ))}
          </View>
          <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
            Sélectionne les terrains et les heures à bloquer. Si tu ne choisis rien, tout le club est réservé ce(s) jour(s)-là.
          </Txt>
        </>
      ) : null}

      {/* Frais fixe PadelConnect (tournois joueurs) — transparence à l’organisateur. */}
      {isPlayerTournament && state.tournamentFee > 0 ? (
        <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.lg }}>
          Frais d’organisation PadelConnect : {fcfa(state.tournamentFee)} (réglés au club, reversés à PadelConnect).
        </Txt>
      ) : null}

      <View style={{ marginTop: spacing.xl }}>
        <Button
          label={submitting ? 'Envoi…' : asClub ? 'Publier le tournoi' : 'Envoyer pour validation'}
          icon="trophy"
          onPress={create}
          disabled={submitting}
          full
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    padding: spacing.md,
    marginTop: spacing.sm,
    fontSize: 15,
  },
});
