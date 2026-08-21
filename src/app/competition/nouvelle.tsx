import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { CalendarPicker, keyToTs } from '@/components/CalendarPicker';
import { Chip } from '@/components/Chip';
import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { hapticWarning } from '@/lib/haptics';
import { Button, Txt } from '@/components/ui';
import { activeClubs, findClub } from '@/data/clubs';
import { COMP_FORMATS } from '@/data/competitions';
import { courtsFor, openSlotsFor, rangeBlocks } from '@/lib/availability';
import { fetchTournamentFee } from '@/lib/competitionsServer';
import { DAY_MS, dateKeyLabel, dayKey, nextDays, type DayOption } from '@/lib/days';
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
      <Txt variant="label" style={{ marginTop: spacing.lg }}>
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
  // Club hôte d'un tournoi « officiel club » : pour un GÉRANT, on FORCE le club géré (jamais le
  // clubId de l'URL). Sinon un deep link forgé « ?as=club&clubId=<autre> » laissait un gérant
  // publier un tournoi officiel chez un club qu'il ne gère PAS (défense en profondeur, le RPC
  // create_competition le refuse déjà côté serveur). L'opérateur garde le libre choix de l'hôte.
  const asClubId = state.role === 'operator' ? params.clubId : (state.serverManagedClubId ?? undefined);
  const club = asClub ? findClub(asClubId, state.customClubs, state.clubInfo) : undefined;
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
  const [endOpen, setEndOpen] = useState(false); // calendrier de fin affiché (« Plusieurs jours »)
  // Club hôte pré-sélectionné depuis l'URL (?clubId=…) : après un refus, « Recréer en tenant
  // compte du motif » ramène ici avec le même club — plus besoin de le re-choisir à la main.
  const [hostId, setHostId] = useState<string | null>(typeof params.clubId === 'string' ? params.clubId : null);
  const [format, setFormat] = useState(COMP_FORMATS[2]);
  const [level, setLevel] = useState('Tous niveaux');
  const [slots, setSlots] = useState(8);
  const [courts, setCourts] = useState<string[]>([]); // terrains réservés au tournoi (multi-sélection)
  const [times, setTimes] = useState<string[]>([]); // créneaux réservés au tournoi (multi-sélection)
  const [submitting, setSubmitting] = useState(false);
  // Une purge (entrées DISPARUES de la grille) peut VIDER un axe de sélection ; or vide = « tout
  // le club » côté dispo. On note QUEL axe a été vidé, et l'envoi n'exige un refus explicite de
  // plus QUE si cet axe est encore vide au tap suivant — jamais d'escalade silencieuse, jamais
  // d'avertissement à tort sur le chemin de correction normal.
  const [purgeWidened, setPurgeWidened] = useState<{ courts: boolean; times: boolean } | null>(null);
  // Erreurs par champ — affichées au tap sur « Publier » (aucun tap silencieux).
  const [errors, setErrors] = useState<{ title?: string; date?: string; host?: string }>({});
  const scrollRef = useRef<ScrollView>(null);
  const datePos = useRef(0);

  // Club hôte résolu (club si compte club, sinon le club choisi par le joueur) → ses terrains
  // et créneaux réels, pour que l’organisateur réserve des terrains/heures PRÉCIS (pas tout).
  const host = asClub ? club : findClub(hostId ?? undefined, state.customClubs, state.clubInfo);
  const hostCourts = host ? courtsFor(host, state.clubCourts) : [];
  // ScheduleCtx minimal (pas besoin de dispo complète ici, juste les horaires ouverts) — grille
  // PAR TERRAIN (68) : deux clubs — ou deux terrains d’un même club — peuvent proposer des
  // créneaux décalés.
  const sched = {
    clubSlots: state.clubSlots,
    clubCourts: state.clubCourts,
    courtSlots: state.courtSlots,
    courtClosed: state.clubCourtClosed,
  };
  const hostSlots = host ? openSlotsFor(host, sched) : [];
  const toggleCourt = (c: string) => setCourts((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));
  const toggleTime = (t: string) => setTimes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  // Durée (1h/1h30, défaut 1h30) choisie par l’organisateur pour CHAQUE créneau sélectionné —
  // alignée 1-pour-1 sur `times` à l’envoi (les tournois sont modulables comme les résas, 68).
  const [timeDurations, setTimeDurations] = useState<Record<string, 60 | 90>>({});

  // Fermetures du club hôte (54) sur les dates choisies : un terrain/créneau couvert par une
  // période fermée ou une fermeture récurrente est grisé — le serveur refuserait la validation,
  // autant le montrer AVANT l'envoi plutôt qu'un échec inexpliqué au moment d'approuver.
  const hostRanges = host ? state.blockedRanges.filter((r) => r.clubId === host.id) : [];
  const hostClosedByCourt = host ? (state.clubCourtClosed[host.id] ?? {}) : {};
  const chosenDayKeys = useMemo(() => {
    if (!day) return [];
    const end = endDay && endDay.key > day.key ? endDay.key : day.key;
    return dates.filter((d) => d.key >= day.key && d.key <= end).map((d) => d.key);
  }, [day, endDay, dates]);
  // Terrain fermé si TOUTES les heures d'un des jours choisis le sont ? Non — on grise dès
  // qu'une période « toute la journée » le couvre (times null) ; une fermeture partielle ne
  // grise que les heures concernées (chips créneaux).
  const courtDisabled = (c: string) =>
    chosenDayKeys.length > 0 && hostRanges.some((r) => r.times === null && chosenDayKeys.some((dk) => rangeBlocks(r, dk, '00:00', c)));
  // Une heure n'est grisée que si AUCUN terrain du club ne peut la jouer sur les dates choisies
  // (période fermée ou fermeture récurrente) — partiellement fermée, elle reste sélectionnable
  // avec les terrains restants.
  const timeDisabled = (t: string) =>
    chosenDayKeys.length > 0 &&
    hostCourts.length > 0 &&
    hostCourts.every(
      (c) => (hostClosedByCourt[c] ?? []).includes(t) || hostRanges.some((r) => chosenDayKeys.some((dk) => rangeBlocks(r, dk, t, c))),
    );

  const isPlayerTournament = !asClub && !asPadel;

  // Frais d’organisation PadelConnect : state.tournamentFee est chargé UNE FOIS par session —
  // on le rafraîchit à l’ouverture de l’écran pour afficher le montant réel (le porteur peut
  // le changer entre deux ouvertures). null = échec réseau → on garde la valeur affichée.
  const [orgFee, setOrgFee] = useState(state.tournamentFee);
  useEffect(() => {
    void fetchTournamentFee().then((amount) => {
      if (amount != null) setOrgFee(amount);
    });
  }, []);

  const create = async () => {
    if (submitting) return;
    const e: { title?: string; date?: string; host?: string } = {};
    if (title.trim().length < 3) e.title = 'Indique un titre (3 lettres minimum).';
    if (!day) e.date = 'Choisis une date.';
    // Passage de minuit : `dates` est recalé par useTodayKey mais `day` est un état indépendant —
    // un écran resté ouvert la veille garderait « hier » et créerait un tournoi déjà terminé.
    else if (day.key < dates[0].key) e.date = 'Cette date est passée — choisis une date à venir.';
    if (!asClub && !hostId) e.host = 'Choisis le club hôte.';
    setErrors(e);
    if (e.title || e.date || e.host) {
      // Scroll automatique vers le premier champ en erreur.
      scrollRef.current?.scrollTo({ y: e.title ? 0 : Math.max(0, datePos.current - 24), animated: true });
      return;
    }
    // Sélection filtrée sur la grille RÉELLE du club hôte, hors indisponibles. ⚠️ On REFUSE si le
    // filtre VIDE une sélection non vide : côté dispo, `[]` signifie « TOUT le club » — dégrader
    // une sélection précise en liste vide ESCALADERAIT le blocage (club entier fermé) au lieu de
    // le restreindre. L'organisateur corrige sa sélection, on n'envoie jamais un blocage élargi.
    const keptCourts = courts.filter((c) => hostCourts.includes(c) && !courtDisabled(c));
    const keptTimes = times.filter((t) => hostSlots.includes(t) && !timeDisabled(t));
    if ((courts.length > 0 && keptCourts.length === 0) || (times.length > 0 && keptTimes.length === 0)) {
      hapticWarning();
      // Les entrées DISPARUES de la grille (terrain retiré par un autre gérant, refresh) n'ont
      // plus de puce à décocher : on les purge pour que la correction reste possible à l'écran.
      // Les entrées encore affichées (fermées sur ces dates) restent cochées ET décochables.
      const purgedCourts = courts.filter((c) => hostCourts.includes(c));
      const purgedTimes = times.filter((t) => hostSlots.includes(t));
      setCourts(purgedCourts);
      setTimes(purgedTimes);
      // ⚠️ On n'arme le drapeau QUE si la purge a réellement VIDÉ un axe (au re-tap, la garde
      // ci-dessus ne se déclencherait plus et `[]` partirait avec sa sémantique « TOUT »). Une
      // purge qui n'a rien retiré (entrées fermées mais encore affichées) n'arme rien.
      const emptiedCourts = courts.length > 0 && purgedCourts.length === 0;
      const emptiedTimes = times.length > 0 && purgedTimes.length === 0;
      // FUSION avec un armement précédent (jamais d'écrasement) : deux purges successives sur des
      // axes différents ne doivent pas faire perdre le warn du premier axe encore vide.
      if (emptiedCourts || emptiedTimes) {
        setPurgeWidened((cur) => ({ courts: (cur?.courts ?? false) || emptiedCourts, times: (cur?.times ?? false) || emptiedTimes }));
      }
      toast.show('Les terrains ou créneaux choisis sont fermés sur ces dates — corrige ta sélection.', { icon: 'alert-circle' });
      return;
    }
    if (purgeWidened && ((purgeWidened.courts && keptCourts.length === 0) || (purgeWidened.times && keptTimes.length === 0))) {
      // L'axe vidé par la purge est ENCORE vide : l'organisateur doit savoir que « vide » réserve
      // TOUT (le club entier ou toute la journée) avant que l'envoi ne parte. Un seul refus.
      setPurgeWidened(null);
      hapticWarning();
      toast.show(
        'Ton terrain ou créneau a disparu de la grille : sélection vidée. Vide = TOUT le club sera réservé — vérifie, puis touche à nouveau pour confirmer.',
        { icon: 'alert-circle' },
      );
      return;
    }
    if (purgeWidened) setPurgeWidened(null); // resélection faite : plus rien d'élargi, aucun warn
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
      // Terrains/créneaux PRÉCIS réservés au tournoi (vides = tout le club ce jour-là — c'est
      // POUR ÇA que le vidage par filtre est refusé plus haut, jamais envoyé tel quel).
      courtNames: keptCourts,
      timeSlots: keptTimes,
      // Durée de chaque créneau, alignée 1-pour-1 sur la liste FILTRÉE (parité exigée par le RPC).
      slotDurations: keptTimes.map((t) => timeDurations[t] ?? 90),
      // Club → publié direct ; joueur → en attente de validation du club hôte.
      status: asClub ? 'approved' : 'pending',
    });
    setSubmitting(false);
    if (!res.ok) {
      // Club : le serveur refuse aussi quand des réservations occupent déjà la plage choisie (37).
      toast.show(
        asClub
          ? 'Création impossible — des réservations, un autre tournoi ou une période fermée occupent peut-être cette plage.'
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
        <Txt variant="label" style={{ marginTop: spacing.lg }}>
          Date {day ? `— ${day.label}` : ''}
        </Txt>
        {/* Vrai calendrier mensuel (demande porteur) — remplace les 42 pastilles de jours. */}
        <CalendarPicker
          value={day?.key ?? null}
          minKey={dates[0].key}
          maxKey={dates[dates.length - 1].key}
          onSelect={(key) => {
            setDay({ key, label: dateKeyLabel(key), value: keyToTs(key) });
            if (endDay && endDay.key <= key) setEndDay(null); // fin devenue invalide → on réinitialise
            if (errors.date) setErrors((cur) => ({ ...cur, date: undefined }));
          }}
        />
        {errors.date ? (
          <Txt variant="small" color={colors.danger} style={{ marginTop: 4 }}>
            {errors.date}
          </Txt>
        ) : null}
      </View>

      {/* Fin optionnelle — pour un tournoi sur plusieurs jours (ex. americano sur un week-end).
          Second calendrier borné STRICTEMENT après le début ; « 1 seul jour » remet à zéro.
          Masqué si le début est le DERNIER jour de la fenêtre (aucune fin possible) ; la clé
          `key={day.key}` remonte le calendrier quand le début change (mois recalé sur la borne). */}
      {day && day.key < dates[dates.length - 1].key ? (
        <View style={{ marginTop: spacing.lg }}>
          <Txt variant="label">Fin (optionnel — plusieurs jours){endDay ? ` — ${endDay.label}` : ''}</Txt>
          <View style={styles.wrap}>
            <Chip label="1 seul jour" active={!endDay && !endOpen} onPress={() => (setEndDay(null), setEndOpen(false))} />
            <Chip label="Plusieurs jours" active={!!endDay || endOpen} onPress={() => setEndOpen(true)} />
          </View>
          {endOpen || endDay ? (
            <CalendarPicker
              key={day.key}
              value={endDay?.key ?? null}
              minKey={dayKey(new Date(keyToTs(day.key) + DAY_MS))}
              maxKey={dates[dates.length - 1].key}
              onSelect={(key) => setEndDay({ key, label: dateKeyLabel(key), value: keyToTs(key) })}
            />
          ) : null}
        </View>
      ) : null}

      <Txt variant="label" style={{ marginTop: spacing.lg }}>
        Format
      </Txt>
      <View style={styles.wrap}>
        {COMP_FORMATS.map((f) => (
          <Chip key={f} label={f} active={f === format} onPress={() => setFormat(f)} />
        ))}
      </View>

      <Txt variant="label" style={{ marginTop: spacing.lg }}>
        Niveau
      </Txt>
      <View style={styles.wrap}>
        {LEVELS.map((l) => (
          <Chip key={l} label={l} active={l === level} onPress={() => setLevel(l)} />
        ))}
      </View>

      <Txt variant="label" style={{ marginTop: spacing.lg }}>
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
          <Txt variant="label">Club hôte</Txt>
          <View style={styles.wrap}>
            {hosts.map((h) => (
              <Chip
                key={h.id}
                label={h.name}
                active={h.id === hostId}
                onPress={() => {
                  setHostId(h.id);
                  // Changer de club hôte VIDE la sélection terrains/créneaux : les valeurs de
                  // l'ancien club (« Terrain 3 », « 21:00 ») n'existent pas chez le nouveau mais
                  // resteraient en état et PARTIRAIENT au serveur → le club validerait un blocage
                  // qui ne protège aucun terrain réel (résas par-dessus le tournoi).
                  if (h.id !== hostId) {
                    setCourts([]);
                    setTimes([]);
                    setTimeDurations({});
                    setPurgeWidened(null); // sélection neuve : l'avertissement de purge n'a plus d'objet
                  }
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
          <Txt variant="label" style={{ marginTop: spacing.lg }}>
            Terrains réservés au tournoi
          </Txt>
          <View style={styles.wrap}>
            {hostCourts.map((c) => (
              <Chip
                key={c}
                label={courtDisabled(c) && courts.includes(c) ? `${c} · fermé` : c}
                active={courts.includes(c)}
                // Une puce COCHÉE reste toujours décochable, même devenue indisponible : sinon le
                // refus « corrige ta sélection » demanderait un geste que l'UI interdit (boucle).
                // Son libellé porte alors « · fermé » (le grisé ne peut plus le signaler).
                disabled={courtDisabled(c) && !courts.includes(c)}
                onPress={() => toggleCourt(c)}
              />
            ))}
          </View>

          <Txt variant="label" style={{ marginTop: spacing.lg }}>
            Créneaux réservés au tournoi
          </Txt>
          <View style={styles.wrap}>
            {hostSlots.map((t) => (
              <Chip
                key={t}
                label={timeDisabled(t) && times.includes(t) ? `${t} · fermé` : t}
                active={times.includes(t)}
                disabled={timeDisabled(t) && !times.includes(t)} // cochée ⇒ décochable (même règle)
                onPress={() => toggleTime(t)}
              />
            ))}
          </View>
          <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
            Sélectionne les terrains et les heures à bloquer. Si tu ne choisis rien, tout le club est réservé ce(s) jour(s)-là.
            {chosenDayKeys.length > 0 && (hostCourts.some(courtDisabled) || hostSlots.some(timeDisabled))
              ? ' Les choix grisés ou marqués « fermé » sont fermés par le club sur ces dates.'
              : ''}
          </Txt>

          {/* Durée de chaque créneau retenu (1h ou 1h30, défaut 1h30) — les tournois sont
              modulables comme les réservations (68). */}
          {/* Gaté sur la liste FILTRÉE : sinon le titre s'affichait avec zéro ligne quand tous
              les créneaux retenus sont devenus indisponibles (changement de dates). */}
          {times.some((t) => hostSlots.includes(t) && !timeDisabled(t)) ? (
            <>
              <Txt variant="label" style={{ marginTop: spacing.lg }}>
                Durée de chaque créneau
              </Txt>
              {times
                // Même filtre que l'envoi : un créneau devenu indisponible (changement de dates)
                // ne doit plus afficher sa ligne de durée — il ne partira pas au serveur.
                .filter((t) => hostSlots.includes(t) && !timeDisabled(t))
                .slice()
                .sort()
                .map((t) => {
                  const d = timeDurations[t] ?? 90;
                  return (
                    <View key={t} style={styles.durationRow}>
                      <Txt variant="small" color={colors.textMuted} style={{ width: 56 }}>
                        {t}
                      </Txt>
                      <Chip label="1h" active={d === 60} onPress={() => setTimeDurations((cur) => ({ ...cur, [t]: 60 }))} />
                      <Chip label="1h30" active={d === 90} onPress={() => setTimeDurations((cur) => ({ ...cur, [t]: 90 }))} />
                    </View>
                  );
                })}
            </>
          ) : null}
        </>
      ) : null}

      {/* Frais fixe PadelConnect (tournois joueurs) — annoncés AVANT de valider la création,
          bien en évidence (encadré), avec le bon circuit : Wave, après validation du club. */}
      {isPlayerTournament && orgFee > 0 ? (
        <View style={styles.feeBox}>
          <Ionicons name="cash-outline" size={16} color={colors.amberDark} />
          <Txt variant="small" color={colors.text} style={{ flex: 1 }}>
            Frais d’organisation PadelConnect :{' '}
            <Txt variant="small" style={{ fontWeight: '700' }}>
              {fcfa(orgFee)}
            </Txt>{' '}
            — dus UNIQUEMENT si le club valide ton tournoi, réglés à PadelConnect par Wave (on te contacte). Rien à payer s’il est refusé.
          </Txt>
        </View>
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
  durationRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  feeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.amberSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
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
