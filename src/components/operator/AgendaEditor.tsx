import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StyleSheet, Switch, TextInput, View } from 'react-native';
import { CalendarPicker } from '@/components/CalendarPicker';
import { useToast } from '@/components/Toast';
import { Button, Card, Divider, Tag, Txt } from '@/components/ui';
import { opStyles } from '@/components/operator/styles';
import { deleteEvent, fetchEvents, upsertEvent, type AgendaEvent } from '@/lib/agenda';
import { confirmAsync } from '@/lib/confirm';
import { DAY_MS, dateKeyLabel, dayKey } from '@/lib/days';
import { useTodayKey } from '@/lib/useTodayKey';
import { colors, radius, spacing } from '@/theme';

// Éditeur de l’AGENDA DU PADEL IVOIRIEN (82), motif NewsEditor : l’opérateur publie les
// événements de la scène locale (FIP Gold, soirée club, stage…) que TOUS les joueurs voient
// sur leur accueil. Titre + date obligatoires, lieu et lien facultatifs, push OPTIONNEL à la
// création (décoché par défaut — le choix est explicite, événement par événement).
export function AgendaEditor() {
  const toast = useToast();
  const todayKey = useTodayKey();
  const maxKey = dayKey(new Date(Date.now() + 365 * DAY_MS));

  // undefined = chargement ; null = échec réseau (≠ [] = aucun événement), convention §8.
  const [events, setEvents] = useState<AgendaEvent[] | null | undefined>(undefined);
  const [editingId, setEditingId] = useState<string | null>(null); // null = création
  const [title, setTitle] = useState('');
  const [dateKey, setDateKey] = useState<string | null>(null);
  const [place, setPlace] = useState('');
  const [link, setLink] = useState('');
  const [sendPush, setSendPush] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null); // garde anti double-tap (suppression)

  useEffect(() => {
    let alive = true;
    // Échec réseau → on garde la liste existante (jamais de liste vidée à tort, §8).
    void fetchEvents(todayKey).then((rows) => alive && setEvents((cur) => rows ?? (cur === undefined ? null : cur)));
    return () => {
      alive = false;
    };
  }, [todayKey]);

  // Rechargement après écriture (création / modification / suppression).
  const reload = async () => {
    const rows = await fetchEvents(todayKey);
    setEvents((cur) => rows ?? (cur === undefined ? null : cur));
  };

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setDateKey(null);
    setPlace('');
    setLink('');
    setSendPush(false);
  };

  const edit = (ev: AgendaEvent) => {
    setEditingId(ev.id);
    setTitle(ev.title);
    setDateKey(ev.dateKey);
    setPlace(ev.place);
    setLink(ev.link);
    setSendPush(false); // jamais mémorisé : le push est un choix par publication
  };

  const canSubmit = title.trim().length >= 3 && !!dateKey && !saving;

  const save = async () => {
    if (!canSubmit || !dateKey) return;
    // Lien : on préfixe https:// s’il manque, et on REFUSE une saisie invalide plutôt que de la
    // laisser tomber en silence (même règle que l’actu d’accueil, cf. setOperatorNews).
    let url = link.trim();
    if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
    if (url && !/^https?:\/\/.+\..+/i.test(url)) {
      toast.show('Lien invalide — corrige-le (https://…) ou vide le champ.', { icon: 'alert-circle' });
      return;
    }
    setSaving(true);
    const id = await upsertEvent({ id: editingId, title: title.trim(), dateKey, place: place.trim(), link: url, push: sendPush });
    setSaving(false);
    // Écriture HONNÊTE : on n’efface le formulaire qu’au vrai succès serveur.
    if (!id) {
      toast.show('Enregistrement impossible — vérifie le lien et ta connexion', { icon: 'alert-circle' });
      return;
    }
    toast.show(editingId ? 'Événement modifié ✅' : sendPush ? 'Événement publié + notification envoyée ✅' : 'Événement publié ✅');
    resetForm();
    await reload();
  };

  const remove = async (ev: AgendaEvent) => {
    if (busyId) return;
    const ok = await confirmAsync('Supprimer l’événement ?', `« ${ev.title} » disparaîtra de l’accueil des joueurs.`, {
      confirmLabel: 'Supprimer',
      destructive: true,
    });
    if (!ok) return;
    setBusyId(ev.id);
    const done = await deleteEvent(ev.id);
    setBusyId(null);
    if (!done) {
      toast.show('Suppression impossible — réessaie', { icon: 'alert-circle' });
      return;
    }
    if (editingId === ev.id) resetForm(); // on n’édite plus un événement disparu
    toast.show('Événement supprimé');
    await reload();
  };

  return (
    <Card>
      <Txt variant="muted" style={{ marginBottom: spacing.sm }}>
        Les événements à venir s’affichent sur l’accueil de tous les joueurs (les joueurs peuvent se poser un rappel la veille).
      </Txt>

      {/* Événements à venir — liste éditable */}
      {events === undefined ? (
        <Txt variant="small" color={colors.textMuted}>
          Chargement…
        </Txt>
      ) : events === null ? (
        <Txt variant="small" color={colors.textMuted}>
          Liste indisponible — vérifie ta connexion.
        </Txt>
      ) : events.length === 0 ? (
        <Txt variant="small" color={colors.textMuted}>
          Aucun événement à venir pour l’instant.
        </Txt>
      ) : (
        events.map((ev, i) => (
          <View key={ev.id}>
            {i > 0 ? <Divider style={{ marginVertical: spacing.sm }} /> : null}
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Txt variant="body" style={{ fontWeight: '700' }} numberOfLines={2}>
                  {ev.title}
                </Txt>
                <Txt variant="small" color={colors.textMuted} numberOfLines={1}>
                  {dateKeyLabel(ev.dateKey)}
                  {ev.place ? ` · ${ev.place}` : ''}
                </Txt>
              </View>
              {ev.push ? <Tag label="Poussé" tone="purple" icon="notifications" /> : null}
            </View>
            <View style={styles.rowActions}>
              <Button size="sm" variant="ghost" label="Modifier" icon="create-outline" onPress={() => edit(ev)} />
              <Button
                size="sm"
                variant="ghost"
                label={busyId === ev.id ? 'Suppression…' : 'Supprimer'}
                icon="trash-outline"
                disabled={busyId === ev.id}
                onPress={() => void remove(ev)}
                accessibilityLabel={`Supprimer ${ev.title}`}
              />
            </View>
          </View>
        ))
      )}

      <Divider style={{ marginVertical: spacing.md }} />

      {/* Formulaire — création, ou modification de l’événement choisi */}
      <Txt variant="label">{editingId ? 'Modifier l’événement' : 'Nouvel événement'}</Txt>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Titre (ex. FIP Gold Abidjan)"
        placeholderTextColor={colors.textMuted}
        maxLength={80}
        accessibilityLabel="Titre de l’événement"
        style={opStyles.newsInput}
      />
      <TextInput
        value={place}
        onChangeText={setPlace}
        placeholder="Lieu (optionnel — ex. Padelta, Riviera)"
        placeholderTextColor={colors.textMuted}
        maxLength={80}
        accessibilityLabel="Lieu de l’événement"
        style={opStyles.newsInput}
      />
      <TextInput
        value={link}
        onChangeText={setLink}
        placeholder="Lien (optionnel — https://…)"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        keyboardType="url"
        maxLength={300}
        accessibilityLabel="Lien de l’événement"
        style={opStyles.newsInput}
      />
      <Txt variant="label" style={{ marginTop: spacing.md }}>
        Date {dateKey ? `— ${dateKeyLabel(dateKey)}` : ''}
      </Txt>
      {/* Même calendrier mensuel que les tournois / fermetures club (aucun module natif). */}
      <CalendarPicker value={dateKey} minKey={todayKey} maxKey={maxKey} onSelect={setDateKey} />

      {/* Push OPTIONNEL, à la CRÉATION seulement : la notification part du webhook `events` en
          INSERT — la proposer sur une modification promettrait un envoi qui n’aurait pas lieu. */}
      {editingId === null ? (
        <View style={styles.pushRow}>
          <View style={{ flex: 1 }}>
            <Txt variant="body" style={{ fontWeight: '600' }}>
              Envoyer aussi en notification
            </Txt>
            <Txt variant="small" color={colors.textMuted}>
              Tous les joueurs reçoivent l’événement en push — à réserver aux grands rendez-vous.
            </Txt>
          </View>
          <Switch
            value={sendPush}
            onValueChange={setSendPush}
            trackColor={{ true: colors.signature, false: colors.border }}
            thumbColor={colors.white}
          />
        </View>
      ) : null}

      <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
        <Button
          size="sm"
          label={
            saving
              ? 'Enregistrement…'
              : editingId
                ? 'Enregistrer les modifications'
                : sendPush
                  ? 'Publier + notifier'
                  : 'Publier l’événement'
          }
          icon={editingId ? 'checkmark' : 'calendar'}
          onPress={() => void save()}
          disabled={!canSubmit}
          full
        />
        {editingId ? <Button size="sm" variant="ghost" label="Annuler la modification" icon="close" onPress={resetForm} full /> : null}
      </View>
      {title.trim().length > 0 && title.trim().length < 3 ? (
        <View style={styles.hint}>
          <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
          <Txt variant="small" color={colors.textMuted}>
            Le titre doit faire au moins 3 caractères.
          </Txt>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  pushRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  hint: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
});
