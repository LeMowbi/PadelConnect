import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { AppState as RNAppState, StyleSheet, TextInput, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { GroupLessonForm } from '@/components/coach/GroupLessonForm';
import { Screen } from '@/components/Screen';
import { SkeletonLines } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import { Button, Card, Divider, IconCircle, SectionHeader, Tag, Txt } from '@/components/ui';
import { activeClubs, findClub } from '@/data/clubs';
import { seedCompetitions } from '@/data/competitions';
import { courtsFor, freeCourtSlotsAt, openSlotsFor, type AvailCtx } from '@/lib/availability';
import { fetchCoachLessons, respondLesson, type CoachProfile, type Lesson } from '@/lib/coachesServer';
import { durationLabel } from '@/lib/courtSchedule';
import { dateKeyLabel, nextDays, slotTimestamp } from '@/lib/days';
import { fcfa } from '@/lib/format';
import { createGroupLesson, fetchGroupLessons, type GroupLesson } from '@/lib/groupLessons';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { priceForSlot } from '@/lib/pricing';
import { usePullToRefresh } from '@/lib/usePullToRefresh';
import { useTodayKey } from '@/lib/useTodayKey';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing } from '@/theme';

// ESPACE COACH — réservé aux comptes promus coach par leur club (table coaches, serveur).
// Le coach y reçoit les demandes de cours (Accepter / Refuser), voit ses cours à venir et
// règle sa fiche (spécialité, tarif indicatif, disponibilités). RÈGLE CLEF : le terrain n’est
// réservé QUE lorsqu’il accepte — l’acceptation crée la réservation, que le club confirme
// ensuite comme n’importe laquelle (double validation coach + club).
export default function CoachAdmin() {
  const { state, saveCoachSettings, refreshSession } = useApp();
  const toast = useToast();

  // Les cours côté coach : chargés à l’ouverture, au retour au premier plan (une demande a pu
  // arriver par push pendant que l’écran restait ouvert) et au pull-to-refresh.
  // lessons = null tant que rien n’est chargé ; convention §8 : un échec réseau garde l’existant
  // (failed ne sert qu’au bloc « Réessayer » du tout premier chargement).
  const [loaded, setLoaded] = useState<{ lessons: Lesson[] | null; failed: boolean }>({ lessons: null, failed: false });
  const [busyId, setBusyId] = useState<string | null>(null);
  // COURS COLLECTIFS (19) : les sessions à venir du club (tous coachs) — filtrées sur les MIENNES
  // au rendu. null = pas encore chargé ; un échec réseau garde la liste affichée (§8).
  const [groupLessons, setGroupLessons] = useState<GroupLesson[] | null>(null);

  const userId = state.serverUserId;
  const profile = state.coachProfile;
  const clubId = profile?.clubId;
  const reload = async () => {
    if (!userId) return;
    const ls = await fetchCoachLessons(userId);
    if (ls) setLoaded({ lessons: ls, failed: false });
    else setLoaded((cur) => (cur.lessons === null ? { lessons: null, failed: true } : cur));
  };
  const reloadGroupLessons = async () => {
    if (!clubId) return;
    const rows = await fetchGroupLessons(clubId);
    if (rows) setGroupLessons(rows);
  };
  const { refreshControl, webRefreshButton } = usePullToRefresh(async () => {
    await Promise.all([reload(), reloadGroupLessons()]);
  });

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    const load = () =>
      void fetchCoachLessons(userId).then((ls) => {
        if (!alive) return;
        if (ls) setLoaded({ lessons: ls, failed: false });
        else setLoaded((cur) => (cur.lessons === null ? { lessons: null, failed: true } : cur));
      });
    load();
    const sub = RNAppState.addEventListener('change', (st) => {
      if (st === 'active') load();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, [userId]);

  // Cours collectifs du club : rechargés à l’ouverture et au retour au premier plan (un élève a
  // pu s’inscrire entre-temps — le compteur « n/cap » doit rester juste).
  useEffect(() => {
    if (!clubId) return;
    let alive = true;
    const load = () =>
      void fetchGroupLessons(clubId).then((rows) => {
        if (!alive || !rows) return; // setState APRÈS l’await (règle React Compiler)
        setGroupLessons(rows);
      });
    load();
    const sub = RNAppState.addEventListener('change', (st) => {
      if (st === 'active') load();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, [clubId]);

  // Liste des jours proposables, recalée après minuit (retour au premier plan).
  const todayKey = useTodayKey();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const days = useMemo(() => nextDays(7), [todayKey]);

  const club = findClub(clubId, state.customClubs, state.clubInfo);

  // Espace réservé aux coachs : sans session ou sans fiche coach active, on bloque proprement
  // (l’entrée n’apparaît de toute façon que dans le profil d’un compte coach).
  if (!userId || !profile) {
    return (
      <Screen back title="Espace Coach">
        <Card style={{ marginTop: spacing.md, alignItems: 'center', paddingVertical: spacing.xl }}>
          <Ionicons name="school-outline" size={28} color={colors.textFaint} />
          <Txt variant="h3" style={{ marginTop: spacing.sm }}>
            Réservé aux coachs
          </Txt>
          <Txt variant="muted" style={{ marginTop: 4, textAlign: 'center' }}>
            {userId
              ? 'Cet espace s’ouvre quand un club te déclare comme coach. Rapproche-toi du club où tu donnes cours.'
              : 'Connecte-toi : cet espace s’ouvre quand un club te déclare comme coach.'}
          </Txt>
        </Card>
      </Screen>
    );
  }

  // Disponibilité RÉELLE du club, calculée comme dans le tunnel joueur (availability.ts) : le
  // formulaire ne propose qu’un créneau OUVERT sur ce terrain et encore LIBRE. Le serveur
  // applique les mêmes gardes (resolve_court_slots + contrainte d’exclusion) — l’écran ne fait
  // que refléter honnêtement ce qui a une chance de passer.
  const ctx: AvailCtx = {
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
  };
  const courts = club ? courtsFor(club, state.clubCourts) : [];
  // Créneaux proposables d’un terrain, un jour donné : ouverts, encore libres et pas passés.
  const slotsFor = (court: string, dateKey: string): { time: string; durationMin: 60 | 90 }[] => {
    if (!club) return [];
    const out: { time: string; durationMin: 60 | 90 }[] = [];
    for (const time of openSlotsFor(club, ctx)) {
      if (slotTimestamp(dateKey, time) <= Date.now()) continue;
      const hit = freeCourtSlotsAt(club, dateKey, time, ctx).find((x) => x.court === court);
      if (hit) out.push({ time, durationMin: hit.durationMin });
    }
    return out;
  };

  // Création d’un cours collectif — écriture HONNÊTE : on attend l’id renvoyé par le serveur
  // avant d’annoncer quoi que ce soit, puis on relit la liste (compteur d’inscrits juste).
  const createLesson = async (input: {
    court: string;
    dateKey: string;
    time: string;
    durationMin: 60 | 90;
    capacity: number;
    note: string;
  }): Promise<boolean> => {
    if (!clubId || !club) return false;
    const id = await createGroupLesson({
      clubId,
      court: input.court,
      dateKey: input.dateKey,
      dateLabel: dateKeyLabel(input.dateKey), // libellé ABSOLU (« Lun 8 juin ») : jamais faux demain
      time: input.time,
      durationMin: input.durationMin,
      capacity: input.capacity,
      // Prix du TERRAIN (motif request_lesson) : figé sur la résa — jamais le tarif du coach,
      // qui se règle au coach hors app (revenu club et commission restent justes).
      price: priceForSlot(club, input.time, input.durationMin),
      note: input.note,
    });
    if (!id) {
      hapticWarning();
      toast.show('Créneau indisponible ou chevauchement avec un autre de tes cours', { icon: 'alert-circle' });
      return false;
    }
    hapticSuccess();
    toast.show('Cours collectif créé ✓ — le club confirme la réservation du terrain');
    await reloadGroupLessons();
    void refreshSession(); // la réservation créée entre dans le planning du club
    return true;
  };

  // Mes sessions à venir (fetch_group_lessons renvoie celles de TOUS les coachs du club).
  const myGroupLessons = (groupLessons ?? []).filter((l) => l.coachId === userId);

  const decide = async (l: Lesson, accept: boolean) => {
    if (busyId) return;
    setBusyId(l.id);
    const res = await respondLesson(l.id, accept);
    setBusyId(null);
    if (res === 'ok') {
      hapticSuccess();
      toast.show('Cours accepté — le terrain est réservé ✓');
      void refreshSession(); // la réservation créée apparaît dans le planning du club
    } else if (res === 'declined') {
      toast.show('Demande refusée — l’élève est prévenu');
    } else if (res === 'conflict') {
      hapticWarning();
      toast.show('Le terrain a été pris entre-temps — impossible d’accepter ce créneau', { icon: 'alert-circle' });
    } else if (res === 'busy') {
      hapticWarning();
      toast.show('Tu avais déjà un cours accepté à ce créneau — cette demande a été refusée automatiquement, l’élève est prévenu.', {
        icon: 'alert-circle',
      });
    } else if (res === 'student_full') {
      hapticWarning();
      toast.show('L’élève a trop de réservations à venir — il doit en libérer avant que tu acceptes', { icon: 'alert-circle' });
    } else if (res === 'gone') {
      toast.show('Cette demande n’est plus valable (créneau passé ou annulée)', { icon: 'alert-circle' });
    } else {
      hapticWarning();
      toast.show('Connexion impossible — vérifie ton réseau et réessaie', { icon: 'cloud-offline-outline' });
    }
    void reload();
  };

  const now = Date.now();
  const { lessons, failed: loadFailed } = loaded;
  // Les COURS COLLECTIFS (83, lesson au nom du coach : studentId = coachId) vivent dans LEUR
  // section — sans ce filtre, chaque cours apparaissait EN DOUBLE, avec « Cours collectif »
  // affiché comme nom d'élève dans « Cours à venir » et l'historique.
  const all = (lessons ?? []).filter((l) => l.studentId !== l.coachId);
  const pending = all.filter((l) => l.status === 'pending' && l.startsAt > now).sort((a, b) => a.startsAt - b.startsAt);
  // Durée RÉELLE du cours (créneaux modulables 1h/1h30, 68 — coachesServer replie déjà à 1h30
  // pour une donnée héritée), pas une durée de session fixe.
  const upcoming = all
    .filter((l) => l.status === 'accepted' && l.startsAt + l.durationMin * 60000 > now)
    .sort((a, b) => a.startsAt - b.startsAt);
  // Historique compact : cours donnés, demandes passées/refusées ET cours annulés par l’élève
  // après acceptation (reservationId présent) — une demande retirée avant réponse n’y figure pas.
  const history = all
    .filter((l) => !pending.includes(l) && !upcoming.includes(l) && (l.status !== 'cancelled' || !!l.reservationId))
    .sort((a, b) => b.startsAt - a.startsAt)
    .slice(0, 10);

  return (
    <Screen
      back
      title="Espace Coach"
      subtitle={club ? `${club.name} — tes cours` : 'Tes cours'}
      refreshControl={refreshControl}
      headerRight={webRefreshButton}
    >
      {/* Demandes à traiter */}
      <View style={{ marginTop: spacing.md }}>
        <SectionHeader title={`Demandes de cours${pending.length ? ` · ${pending.length}` : ''}`} />
        {lessons === null && !loadFailed ? (
          <Card>
            <SkeletonLines lines={3} />
          </Card>
        ) : loadFailed ? (
          <Card style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
            <Ionicons name="cloud-offline-outline" size={24} color={colors.textFaint} />
            <Txt variant="muted" style={{ marginTop: spacing.sm, textAlign: 'center' }}>
              Impossible de charger tes cours — vérifie ta connexion.
            </Txt>
            <View style={{ marginTop: spacing.md }}>
              <Button size="sm" label="Réessayer" icon="refresh" variant="secondary" onPress={() => void reload()} />
            </View>
          </Card>
        ) : pending.length === 0 ? (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <IconCircle icon="checkmark-done-outline" color={colors.signature} bg={colors.greenSoft} />
            <Txt variant="muted" style={{ flex: 1 }}>
              Aucune demande en attente. Tu recevras une notification à chaque nouvelle demande.
            </Txt>
          </Card>
        ) : (
          pending.map((l) => (
            <Card key={l.id} style={{ marginTop: spacing.sm }}>
              <LessonRow lesson={l} />
              <Txt variant="small" color={colors.textMuted} style={{ marginTop: spacing.xs }}>
                Le terrain ({l.court}) ne sera réservé que si tu acceptes.
              </Txt>
              <View style={styles.actionsRow}>
                <View style={{ flex: 1 }}>
                  <Button
                    size="sm"
                    label={busyId === l.id ? '…' : 'Accepter'}
                    icon="checkmark"
                    onPress={() => void decide(l, true)}
                    disabled={busyId !== null}
                    full
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    size="sm"
                    label="Refuser"
                    icon="close"
                    variant="secondary"
                    onPress={() => void decide(l, false)}
                    disabled={busyId !== null}
                    full
                  />
                </View>
              </View>
            </Card>
          ))
        )}
      </View>

      {/* Cours à venir (acceptés) */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Cours à venir" />
        {upcoming.length === 0 ? (
          <Card>
            <Txt variant="muted">Aucun cours accepté à venir.</Txt>
          </Card>
        ) : (
          upcoming.map((l) => (
            <Card key={l.id} style={{ marginTop: spacing.sm }}>
              <LessonRow lesson={l} />
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                <Tag label="Terrain réservé ✓" tone="green" />
              </View>
            </Card>
          ))
        )}
      </View>

      {/* Cours collectifs (19) — le coach ouvre une session à plusieurs : le terrain est réservé
          à son nom (double validation club préservée), les élèves s’inscrivent depuis la fiche
          du club tant qu’il reste des places. */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title={`Cours collectifs${myGroupLessons.length ? ` · ${myGroupLessons.length}` : ''}`} />
        {club ? (
          <GroupLessonForm courts={courts} days={days} slotsFor={slotsFor} onSubmit={createLesson} />
        ) : (
          <Card>
            <Txt variant="muted">Ton club n’est pas encore chargé — reviens dans un instant.</Txt>
          </Card>
        )}
        {myGroupLessons.map((l) => (
          <Card key={l.id} style={{ marginTop: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <IconCircle icon="people" color={colors.purple} bg={colors.purpleSoft} />
              <View style={{ flex: 1 }}>
                <Txt variant="h3" numberOfLines={1}>
                  {dateKeyLabel(l.dateKey)} à {l.time}
                </Txt>
                <Txt variant="muted">
                  {l.court} · {durationLabel(l.durationMin)}
                </Txt>
                {l.note ? (
                  <Txt variant="small" color={colors.textFaint} numberOfLines={2}>
                    {l.note}
                  </Txt>
                ) : null}
              </View>
              <Tag
                label={`${l.joined}/${l.capacity} inscrits`}
                tone={l.joined >= l.capacity ? 'neutral' : 'signature'}
                icon="people-outline"
              />
            </View>
          </Card>
        ))}
        {myGroupLessons.length > 0 ? (
          <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
            Chaque cours bloque le terrain comme une réservation normale — le club la confirme de son côté.
          </Txt>
        ) : null}
      </View>

      {/* Ma fiche (spécialité, tarif indicatif, disponibilités) */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Ma fiche coach" />
        <CoachSettings
          key={profile.clubId}
          profile={profile}
          clubSlots={
            club
              ? openSlotsFor(club, {
                  clubSlots: state.clubSlots,
                  clubCourts: state.clubCourts,
                  courtSlots: state.courtSlots,
                  courtClosed: state.clubCourtClosed,
                })
              : profile.slots
          }
          onSave={async (specialty, price, slots) => {
            const ok = await saveCoachSettings(specialty, price, slots);
            toast.show(
              ok ? 'Fiche enregistrée ✓' : 'Enregistrement impossible — vérifie ta connexion',
              ok ? undefined : { icon: 'alert-circle' },
            );
            return ok;
          }}
        />
      </View>

      {/* Historique compact */}
      {history.length > 0 ? (
        <View style={{ marginTop: spacing.xl }}>
          <SectionHeader title="Historique" />
          <Card>
            {history.map((l, i) => (
              <View key={l.id}>
                {i > 0 ? <Divider style={{ marginVertical: spacing.sm }} /> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <Txt variant="body" style={{ fontWeight: '600' }} numberOfLines={1}>
                      {l.studentName} · {l.dateLabel} à {l.time}
                    </Txt>
                    <Txt variant="muted">{l.court}</Txt>
                  </View>
                  {l.status === 'accepted' ? (
                    <Tag label="Donné" tone="green" />
                  ) : l.status === 'declined' ? (
                    <Tag label="Refusé" tone="neutral" />
                  ) : l.status === 'cancelled' ? (
                    <Tag label="Annulé" tone="coral" />
                  ) : (
                    <Tag label="Expiré" tone="neutral" />
                  )}
                </View>
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.lg, textAlign: 'center' }}>
        Ton tarif de cours se règle directement avec l’élève. Le terrain, lui, se règle au club comme toute réservation.
      </Txt>
    </Screen>
  );
}

// Ligne récap d’un cours (élève, jour/heure, terrain, prix du terrain).
function LessonRow({ lesson: l }: { lesson: Lesson }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <IconCircle icon="school" color={colors.purple} bg={colors.purpleSoft} />
      <View style={{ flex: 1 }}>
        <Txt variant="h3" numberOfLines={1}>
          {l.studentName}
        </Txt>
        <Txt variant="muted">
          {l.dateLabel} à {l.time} ({durationLabel(l.durationMin)}) · {l.court}
        </Txt>
        {l.price ? <Txt variant="small" color={colors.textMuted}>{`Terrain : ${fcfa(l.price)} (réglé au club)`}</Txt> : null}
      </View>
    </View>
  );
}

// Réglages de la fiche coach — composant à état local (remonté par `key` si le club change).
function CoachSettings({
  profile,
  clubSlots,
  onSave,
}: {
  profile: CoachProfile;
  clubSlots: string[];
  onSave: (specialty: string, price: number | null, slots: string[]) => Promise<boolean>;
}) {
  const [specialty, setSpecialty] = useState(profile.specialty);
  const [price, setPrice] = useState(profile.price ? String(profile.price) : '');
  const [slots, setSlots] = useState<string[]>(profile.slots);
  const [saving, setSaving] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  // Resynchronisation RENDER-PHASE quand `profile` se rafraîchit (session / premier plan) : les
  // champs NON touchés suivent le serveur — sinon « Enregistrer » depuis un écran resté monté
  // réécrivait dispos/tarif PÉRIMÉS par-dessus une modif faite sur le web ou un autre appareil
  // (onSave envoie les trois champs). Patron WaveLink : ajuster l'état quand une prop change.
  const [synced, setSynced] = useState(profile);
  const [touched, setTouched] = useState<{ specialty?: boolean; price?: boolean; slots?: boolean }>({});
  if (synced !== profile) {
    setSynced(profile);
    if (!touched.specialty) setSpecialty(profile.specialty);
    if (!touched.price) setPrice(profile.price ? String(profile.price) : '');
    if (!touched.slots) setSlots(profile.slots);
  }

  const toggleSlot = (t: string) => {
    setTouched((c) => ({ ...c, slots: true }));
    setSlots((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t].sort()));
  };

  const save = async () => {
    if (saving) return;
    const p = Number(price.replace(/\D/g, '')) || null;
    // Mêmes bornes que le serveur (48) et que le tarif fixé par le club (42) : hors bornes, le
    // serveur refuserait en silence → on le dit d'avance au lieu d'un « impossible » trompeur.
    if (p !== null && (p < 1000 || p > 1000000)) {
      setPriceError('Tarif entre 1 000 et 1 000 000 FCFA (ou vide = non affiché).');
      return;
    }
    setPriceError(null);
    setSaving(true);
    const ok = await onSave(specialty.trim(), p, slots);
    setSaving(false);
    // Sauvegarde acceptée : la fiche locale redevient le miroir du serveur — les prochaines
    // modifs distantes se resynchronisent à nouveau (touched repart à zéro).
    if (ok) setTouched({});
  };

  return (
    <Card>
      <Txt variant="muted">Les joueurs voient ta spécialité, ton tarif indicatif et tes disponibilités sur la fiche du club.</Txt>
      <TextInput
        value={specialty}
        onChangeText={(t) => {
          setSpecialty(t);
          setTouched((c) => ({ ...c, specialty: true }));
        }}
        placeholder="Spécialité (ex. Initiation, Compétition)"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        accessibilityLabel="Spécialité"
      />
      <TextInput
        value={price}
        onChangeText={(t) => {
          setPrice(t);
          setPriceError(null);
          setTouched((c) => ({ ...c, price: true }));
        }}
        placeholder="Tarif indicatif du cours (FCFA, optionnel)"
        placeholderTextColor={colors.textMuted}
        keyboardType="numeric"
        style={styles.input}
        accessibilityLabel="Tarif indicatif du cours"
      />
      {priceError ? (
        <Txt variant="small" color={colors.coral} style={{ marginTop: spacing.xs }}>
          {priceError}
        </Txt>
      ) : null}
      <Txt variant="label" style={{ marginTop: spacing.md }}>
        Mes créneaux de cours (horaires ouverts par le club)
      </Txt>
      <View style={styles.wrap}>
        {clubSlots.map((t) => (
          <Chip key={t} label={t} active={slots.includes(t)} onPress={() => toggleSlot(t)} />
        ))}
      </View>
      {slots.length === 0 ? (
        <Txt variant="small" color={colors.amberDark} style={{ marginTop: spacing.sm }}>
          Sans créneau sélectionné, les joueurs ne peuvent pas te demander de cours.
        </Txt>
      ) : null}
      <View style={{ marginTop: spacing.md }}>
        <Button label={saving ? 'Enregistrement…' : 'Enregistrer ma fiche'} icon="save-outline" onPress={save} disabled={saving} full />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    marginTop: spacing.sm,
  },
});
