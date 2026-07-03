import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { AppState as RNAppState, StyleSheet, TextInput, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { Screen } from '@/components/Screen';
import { SkeletonLines } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import { Button, Card, Divider, IconCircle, SectionHeader, Tag, Txt } from '@/components/ui';
import { findClub } from '@/data/clubs';
import { openSlotsFor } from '@/lib/availability';
import { fetchCoachLessons, respondLesson, type CoachProfile, type Lesson } from '@/lib/coachesServer';
import { fcfa } from '@/lib/format';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { usePullToRefresh } from '@/lib/usePullToRefresh';
import { SESSION_MS, useApp } from '@/store/AppContext';
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

  const userId = state.serverUserId;
  const reload = async () => {
    if (!userId) return;
    const ls = await fetchCoachLessons(userId);
    if (ls) setLoaded({ lessons: ls, failed: false });
    else setLoaded((cur) => (cur.lessons === null ? { lessons: null, failed: true } : cur));
  };
  const { refreshControl } = usePullToRefresh(reload);

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

  const profile = state.coachProfile;
  const club = findClub(profile?.clubId, state.customClubs, state.clubInfo);

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
      toast.show('Tu as déjà un cours accepté à ce créneau — refuse ou déplace l’autre d’abord', { icon: 'alert-circle' });
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
  const all = lessons ?? [];
  const pending = all.filter((l) => l.status === 'pending' && l.startsAt > now).sort((a, b) => a.startsAt - b.startsAt);
  const upcoming = all.filter((l) => l.status === 'accepted' && l.startsAt + SESSION_MS > now).sort((a, b) => a.startsAt - b.startsAt);
  // Historique compact : cours donnés, demandes passées/refusées ET cours annulés par l’élève
  // après acceptation (reservationId présent) — une demande retirée avant réponse n’y figure pas.
  const history = all
    .filter((l) => !pending.includes(l) && !upcoming.includes(l) && (l.status !== 'cancelled' || !!l.reservationId))
    .sort((a, b) => b.startsAt - a.startsAt)
    .slice(0, 10);

  return (
    <Screen back title="Espace Coach" subtitle={club ? `${club.name} — tes cours` : 'Tes cours'} refreshControl={refreshControl}>
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

      {/* Ma fiche (spécialité, tarif indicatif, disponibilités) */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Ma fiche coach" />
        <CoachSettings
          key={profile.clubId}
          profile={profile}
          clubSlots={club ? openSlotsFor(club, state.clubSlots) : profile.slots}
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
                    <Tag label="Expirée" tone="neutral" />
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
          {l.dateLabel} à {l.time} · {l.court}
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

  const toggleSlot = (t: string) => setSlots((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t].sort()));

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
    await onSave(specialty.trim(), p, slots);
    setSaving(false);
  };

  return (
    <Card>
      <Txt variant="muted">Les joueurs voient ta spécialité, ton tarif indicatif et tes disponibilités sur la fiche du club.</Txt>
      <TextInput
        value={specialty}
        onChangeText={setSpecialty}
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
      <Txt variant="label" color={colors.textFaint} style={{ marginTop: spacing.md }}>
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
