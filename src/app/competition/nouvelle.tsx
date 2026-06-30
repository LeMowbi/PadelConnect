import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { Screen } from '@/components/Screen';
import { Button, Txt } from '@/components/ui';
import { activeClubs, findClub } from '@/data/clubs';
import { COMP_FORMATS } from '@/data/competitions';
import { nextDays, type DayOption } from '@/lib/days';
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
        placeholderTextColor={colors.textFaint}
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
  // « asClub » (tournoi OFFICIEL, publié direct) n'est autorisé qu'aux comptes club/opérateur :
  // on le verrouille sur le RÔLE, pas seulement sur le paramètre d'URL — sinon un joueur
  // pourrait forger « ?as=club » et créer un tournoi officiel (puis s'attribuer du niveau).
  const asClub = params.as === 'club' && (state.role === 'club' || state.role === 'operator');
  const club = asClub ? findClub(params.clubId, state.customClubs, state.clubInfo) : undefined;
  // Tournoi créé par un JOUEUR : il choisit le club hôte, qui devra valider.
  const hosts = useMemo(() => activeClubs(state.customClubs, state.clubInfo), [state.customClubs, state.clubInfo]);

  const dates = useMemo(() => nextDays(7), []);
  const [title, setTitle] = useState('');
  const [reward, setReward] = useState('');
  const [fee, setFee] = useState('');
  const [day, setDay] = useState<DayOption | null>(null);
  const [hostId, setHostId] = useState<string | null>(null);
  const [format, setFormat] = useState(COMP_FORMATS[2]);
  const [level, setLevel] = useState('Tous niveaux');
  const [slots, setSlots] = useState(8);
  // Erreurs par champ — affichées au tap sur « Publier » (aucun tap silencieux).
  const [errors, setErrors] = useState<{ title?: string; date?: string; host?: string }>({});
  const scrollRef = useRef<ScrollView>(null);
  const datePos = useRef(0);

  const create = () => {
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
    const host = asClub ? club : findClub(hostId ?? undefined, state.customClubs, state.clubInfo);
    addCompetition({
      title: title.trim(),
      organizerType: asClub ? 'club' : 'joueur',
      organizer: asClub ? (club?.name ?? 'Club') : (state.account?.firstName ?? 'Joueur'),
      clubId: host?.id,
      clubName: host?.name,
      date: day!.label,
      dateKey: day!.key,
      format,
      level,
      reward: reward.trim(),
      fee: fee.trim() || 'Gratuit',
      slots,
      registered: 0,
      official: asClub,
      // Club → publié direct ; joueur → en attente de validation du club hôte.
      status: asClub ? 'approved' : 'pending',
    });
    router.replace(asClub ? '/club-admin' : '/competitions');
  };

  return (
    <Screen
      back
      title="Créer un tournoi"
      subtitle={asClub ? `Pour ${club?.name ?? 'votre club'}` : 'En tant que joueur'}
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
      <Field label="Frais d'inscription (optionnel)" value={fee} onChangeText={setFee} placeholder="Vide = Gratuit" />

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
        Nombre d'équipes (places limitées)
      </Txt>
      <View style={styles.wrap}>
        {SLOTS.map((s) => (
          <Chip key={s} label={`${s} équipes`} active={s === slots} onPress={() => setSlots(s)} />
        ))}
      </View>
      <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
        Chaque équipe compte 2 joueurs. L'inscription se ferme une fois toutes les places prises.
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

      <View style={{ marginTop: spacing.xl }}>
        <Button label={asClub ? 'Publier le tournoi' : 'Envoyer pour validation'} icon="trophy" onPress={create} full />
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
