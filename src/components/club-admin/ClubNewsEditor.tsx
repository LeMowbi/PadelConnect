import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StyleSheet, Switch, TextInput, View } from 'react-native';
import { useToast } from '@/components/Toast';
import { Button, Card, Divider, Txt } from '@/components/ui';
import { deleteClubNews, fetchClubNews, upsertClubNews, type ClubNews } from '@/lib/clubNews';
import { confirmAsync } from '@/lib/confirm';
import { dateKeyLabel, dayKey } from '@/lib/days';
import { colors, radius, spacing } from '@/theme';

// Annonces du club (20), motif AgendaEditor : le gérant publie sur SA fiche (promo, horaires
// exceptionnels, tournoi maison…). Titre obligatoire, texte et lien facultatifs, push OPTIONNEL
// à la CRÉATION seulement (le webhook `club_news` n'écoute que l'INSERT : proposer la case sur
// une modification promettrait un envoi qui n'aurait pas lieu). Convention §8 : null = échec réseau.
export function ClubNewsEditor({ clubId, clubName }: { clubId: string; clubName: string }) {
  const toast = useToast();

  // undefined = chargement ; null = échec réseau (≠ [] = aucune annonce), convention §8.
  const [news, setNews] = useState<ClubNews[] | null | undefined>(undefined);
  const [editingId, setEditingId] = useState<string | null>(null); // null = création
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [sendPush, setSendPush] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null); // garde anti double-tap (suppression)

  useEffect(() => {
    let alive = true;
    // Échec réseau → on garde la liste existante (jamais de liste vidée à tort, §8).
    void fetchClubNews(clubId).then((rows) => alive && setNews((cur) => rows ?? (cur === undefined ? null : cur)));
    return () => {
      alive = false;
    };
  }, [clubId]);

  // Rechargement après écriture (création / modification / suppression).
  const reload = async () => {
    const rows = await fetchClubNews(clubId);
    setNews((cur) => rows ?? (cur === undefined ? null : cur));
  };

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setBody('');
    setLink('');
    setSendPush(false);
  };

  const edit = (n: ClubNews) => {
    setEditingId(n.id);
    setTitle(n.title);
    setBody(n.body);
    setLink(n.link);
    setSendPush(false); // jamais mémorisé : le push est un choix par publication
  };

  const canSubmit = title.trim().length >= 3 && !saving;

  const save = async () => {
    if (!canSubmit) return;
    // Lien : on préfixe https:// s'il manque et on FORCE https (le serveur — SQL 83 — refuse net
    // un http:// ; sans cette normalisation, le gérant bouclerait sur un message « vérifie ta
    // connexion » qui accuse le réseau au lieu du lien). Saisie invalide = refus explicite.
    let url = link.trim();
    if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
    url = url.replace(/^http:\/\//i, 'https://');
    if (url && !/^https:\/\/.+\..+/i.test(url)) {
      toast.show('Lien invalide — corrige-le (https://…) ou vide le champ.', { icon: 'alert-circle' });
      return;
    }
    // Le préfixage a pu faire déborder la borne serveur (colonne link ≤ 300) : refus NET ici
    // plutôt qu'une erreur SQL brute.
    if (url.length > 300) {
      toast.show('Lien trop long (300 caractères maximum).', { icon: 'alert-circle' });
      return;
    }
    setSaving(true);
    const id = await upsertClubNews({ id: editingId, clubId, title: title.trim(), body: body.trim(), link: url, push: sendPush });
    setSaving(false);
    // Écriture HONNÊTE : on n'efface le formulaire qu'au vrai succès serveur.
    if (!id) {
      toast.show('Enregistrement impossible — vérifie le lien et ta connexion', { icon: 'alert-circle' });
      return;
    }
    toast.show(editingId ? 'Annonce modifiée ✅' : sendPush ? 'Annonce publiée + notification envoyée ✅' : 'Annonce publiée ✅');
    resetForm();
    await reload();
  };

  const remove = async (n: ClubNews) => {
    if (busyId) return;
    const ok = await confirmAsync('Supprimer l’annonce ?', `« ${n.title} » disparaîtra de la page de ${clubName}.`, {
      confirmLabel: 'Supprimer',
      destructive: true,
    });
    if (!ok) return;
    setBusyId(n.id);
    const done = await deleteClubNews(n.id);
    setBusyId(null);
    if (!done) {
      toast.show('Suppression impossible — réessaie', { icon: 'alert-circle' });
      return;
    }
    if (editingId === n.id) resetForm(); // on n'édite plus une annonce disparue
    toast.show('Annonce supprimée');
    await reload();
  };

  return (
    <Card>
      <Txt variant="muted" style={{ marginBottom: spacing.sm }}>
        Tes annonces s’affichent sur la page de {clubName} (les 10 dernières). Idéal pour une promo, un changement d’horaires ou une soirée
        du club.
      </Txt>

      {/* Annonces publiées — liste éditable */}
      {news === undefined ? (
        <Txt variant="small" color={colors.textMuted}>
          Chargement…
        </Txt>
      ) : news === null ? (
        <Txt variant="small" color={colors.textMuted}>
          Annonces indisponibles — vérifie ta connexion.
        </Txt>
      ) : news.length === 0 ? (
        <Txt variant="small" color={colors.textFaint}>
          Aucune annonce pour l’instant.
        </Txt>
      ) : (
        news.map((n, i) => (
          <View key={n.id}>
            {i > 0 ? <Divider style={{ marginVertical: spacing.sm }} /> : null}
            <View>
              <Txt variant="body" style={{ fontWeight: '700' }} numberOfLines={2}>
                {n.title}
              </Txt>
              <Txt variant="small" color={colors.textMuted} numberOfLines={1}>
                {dateKeyLabel(dayKey(new Date(n.createdAt)))}
                {n.body ? ` · ${n.body}` : ''}
              </Txt>
            </View>
            <View style={styles.rowActions}>
              <Button size="sm" variant="ghost" label="Modifier" icon="create-outline" onPress={() => edit(n)} />
              <Button
                size="sm"
                variant="ghost"
                label={busyId === n.id ? 'Suppression…' : 'Supprimer'}
                icon="trash-outline"
                disabled={busyId === n.id}
                onPress={() => void remove(n)}
                accessibilityLabel={`Supprimer ${n.title}`}
              />
            </View>
          </View>
        ))
      )}

      <Divider style={{ marginVertical: spacing.md }} />

      {/* Formulaire — création, ou modification de l'annonce choisie */}
      <Txt variant="label">{editingId ? 'Modifier l’annonce' : 'Nouvelle annonce'}</Txt>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Titre (ex. -20 % sur les créneaux du matin)"
        placeholderTextColor={colors.textMuted}
        maxLength={120}
        accessibilityLabel="Titre de l’annonce"
        style={styles.input}
      />
      <TextInput
        value={body}
        onChangeText={setBody}
        placeholder="Texte (optionnel — les détails de ton annonce)"
        placeholderTextColor={colors.textMuted}
        multiline
        maxLength={1000}
        accessibilityLabel="Texte de l’annonce"
        style={[styles.input, styles.multiline]}
      />
      <TextInput
        value={link}
        onChangeText={setLink}
        placeholder="Lien (optionnel — https://…)"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        keyboardType="url"
        maxLength={300}
        accessibilityLabel="Lien de l’annonce"
        style={styles.input}
      />

      {/* Push OPTIONNEL, à la CRÉATION seulement (webhook `club_news` en INSERT). */}
      {editingId === null ? (
        <View style={styles.pushRow}>
          <View style={{ flex: 1 }}>
            <Txt variant="body" style={{ fontWeight: '600' }}>
              Envoyer aussi en notification
            </Txt>
            <Txt variant="small" color={colors.textMuted}>
              Envoyée aux joueurs qui suivent ton club (cœur ♥) — à réserver aux vraies nouvelles.
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
            saving ? 'Enregistrement…' : editingId ? 'Enregistrer les modifications' : sendPush ? 'Publier + notifier' : 'Publier l’annonce'
          }
          icon={editingId ? 'checkmark' : 'megaphone'}
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
  input: {
    marginTop: spacing.sm,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
});
