import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Linking, StyleSheet, TextInput, View } from 'react-native';
import { useToast } from '@/components/Toast';
import { Button, Divider, Tag, Txt } from '@/components/ui';
import { openWhatsApp } from '@/lib/contact';
import { dateKeyLabel } from '@/lib/days';
import { perPlayerOf } from '@/lib/format';
import { hapticSuccess } from '@/lib/haptics';
import { confirmSharePaid, declareSharePaid, setReservationWaveLink, type ShareState } from '@/lib/sharePayments';
import type { Reservation } from '@/store/AppContext';
import { colors, radius, spacing } from '@/theme';

// PARTS WAVE (18) — partage de la note d’une réservation PARTAGÉE (invités / match ouvert).
// Le terrain reste réglé au CLUB par le créateur : ici on ne suit que les REMBOURSEMENTS entre
// joueurs. Le créateur colle SON lien Wave, chaque partenaire paie sa part puis déclare
// « j’ai payé », le créateur confirme la réception. Écritures HONNÊTES : l’affichage ne bouge
// qu’après la réponse du serveur (relecture `fetch_share_payments` par l’écran appelant, §8).

// Prénom seul : les listes de parts se lisent d’un coup d’œil (et le nom complet déborde).
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

// Normalise le lien collé par le créateur AVANT l’appel serveur : '' = effacement, `http://`
// promu en `https://`, schéma forcé en minuscules (le serveur exige `^https://` STRICT, 83).
// Un lien sans schéma est refusé ICI avec un message clair — sinon le serveur répondait un
// simple `false` et le joueur ne comprenait pas ce qu’on attendait de lui.
function normalizeWaveLink(raw: string): { link: string } | { error: string } {
  const v = raw.trim();
  if (v === '') return { link: '' }; // effacement volontaire (le serveur accepte '')
  const m = /^(https?):\/\/(.+)$/i.exec(v);
  if (!m) return { error: 'Le lien doit commencer par https:// (ex. https://pay.wave.com/…).' };
  const link = `https://${m[2]}`;
  if (link.length > 300) return { error: 'Lien trop long (300 caractères maximum).' };
  return { link };
}

export function SharePayments({
  reservation: r,
  owner,
  players,
  meId,
  share,
  onReload,
}: {
  reservation: Reservation;
  owner: boolean; // je suis l’auteur de la réservation (j’encaisse les parts)
  players: number; // effectif RÉEL du match — base de la part par joueur
  meId: string;
  share?: ShareState; // état serveur des parts (undefined = pas encore chargé)
  onReload: () => void; // relecture après écriture (l’affichage suit le serveur)
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const part = r.price > 0 ? perPlayerOf(r.price, players) : null;
  const link = share?.waveLink ?? '';
  const myShare = share?.shares.find((s) => s.userId === meId) ?? null;
  const organizer = r.bookedBy?.name ? firstName(r.bookedBy.name) : 'l’organisateur';

  // Relance : message PRÉ-REMPLI (part + lien) ouvert dans WhatsApp, le joueur choisit son
  // destinataire — zéro serveur, comme les messages types de « Mes réservations ».
  const remind = () => {
    const body =
      `Salut ! Pour notre padel : ${r.clubName} — ${dateKeyLabel(r.dateKey)} à ${r.time} (${r.court}).\n` +
      (part ? `Ta part : ${part}.\n` : '') +
      (link ? `Tu peux payer ici : ${link}\n` : '') +
      'Merci 🙏';
    openWhatsApp('', body);
  };

  // Créateur : confirme la part d’UN joueur (le serveur fait foi, puis on relit).
  const confirmShare = async (userId: string, name: string) => {
    if (busy) return;
    setBusy(true);
    const ok = await confirmSharePaid(r.id, userId);
    setBusy(false);
    if (ok) hapticSuccess();
    toast.show(ok ? `Part de ${name} confirmée ✓` : 'Confirmation impossible — réessaie', ok ? undefined : { icon: 'alert-circle' });
    if (ok) onReload();
  };

  // Participant : déclare sa part payée (le créateur reçoit une notification, webhook 83).
  const declare = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await declareSharePaid(r.id);
    setBusy(false);
    if (ok) hapticSuccess();
    toast.show(
      ok ? `C’est noté — ${organizer} confirme la réception.` : 'Impossible d’enregistrer — réessaie',
      ok ? undefined : { icon: 'alert-circle' },
    );
    if (ok) onReload();
  };

  const pay = () => {
    if (!link) return;
    void Linking.openURL(link).catch(() =>
      toast.show('Lien de paiement indisponible — préviens l’organisateur.', { icon: 'alert-circle' }),
    );
  };

  return (
    <View style={styles.box}>
      <View style={styles.head}>
        <Ionicons name="wallet-outline" size={16} color={colors.amberDark} />
        <Txt variant="label" color={colors.amberDark} style={{ flex: 1 }}>
          Partager la note
        </Txt>
      </View>

      {owner ? (
        <>
          <Txt variant="small" color={colors.textMuted}>
            Le terrain se règle au club. {part ? `Chaque joueur te rembourse ~${part}. ` : ''}Colle ton lien Wave : tes partenaires paient
            en un tap.
          </Txt>
          <WaveLinkField reservationId={r.id} serverLink={share?.waveLink ?? null} onSaved={onReload} />
          {/* État des parts affiché SEULEMENT une fois chargé : annoncer « personne n'a payé »
              avant d'avoir la réponse du serveur serait une information fausse. */}
          {!share ? null : (
            <>
              <Divider style={{ marginVertical: spacing.sm }} />
              {share.shares.length > 0 ? (
                share.shares.map((s) => (
                  <View key={s.userId} style={styles.row}>
                    <Txt variant="small" style={{ flex: 1 }} numberOfLines={1}>
                      {firstName(s.name)} — {s.status === 'confirmed' ? 'part confirmée' : 'a déclaré avoir payé 💸'}
                    </Txt>
                    {s.status === 'confirmed' ? (
                      <Tag label="Payée ✓" tone="green" />
                    ) : (
                      <Button
                        size="sm"
                        label={busy ? '…' : 'Confirmer'}
                        icon="checkmark"
                        variant="secondary"
                        onPress={() => void confirmShare(s.userId, firstName(s.name))}
                        disabled={busy}
                        accessibilityLabel={`Confirmer la part de ${s.name}`}
                      />
                    )}
                  </View>
                ))
              ) : (
                <Txt variant="small" color={colors.textFaint}>
                  Personne n’a encore déclaré avoir payé sa part.
                </Txt>
              )}
            </>
          )}
          <View style={{ marginTop: spacing.sm, alignSelf: 'flex-start' }}>
            <Button size="sm" variant="ghost" label="Relancer sur WhatsApp" icon="logo-whatsapp" onPress={remind} />
          </View>
        </>
      ) : (
        <>
          <Txt variant="small" color={colors.textMuted}>
            {part ? `Ta part : ${part}` : 'Part à voir avec l’organisateur'} — à régler à {organizer} (le terrain, lui, se paie au club).
          </Txt>
          {myShare?.status === 'confirmed' ? (
            <View style={{ marginTop: spacing.sm, alignSelf: 'flex-start' }}>
              <Tag label="Part confirmée ✓" tone="green" icon="checkmark-circle" />
            </View>
          ) : (
            <>
              {/* Boutons proposés seulement quand l’état des parts est CHARGÉ : sans lui, on ne
                  sait ni s’il existe un lien Wave, ni si j’ai déjà déclaré ma part. Une part
                  déjà déclarée retire les deux (on ne repaie pas ce qu’on vient d’annoncer). */}
              <View style={styles.actions}>
                {link && !myShare ? <Button size="sm" label="Payer ma part" icon="card-outline" onPress={pay} /> : null}
                {share && !myShare ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    label={busy ? '…' : 'J’ai payé ✓'}
                    icon="checkmark"
                    onPress={() => void declare()}
                    disabled={busy}
                  />
                ) : null}
              </View>
              {myShare ? (
                <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.xs }}>
                  Tu as déclaré avoir payé — {organizer} confirme la réception.
                </Txt>
              ) : share && !link ? (
                <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.xs }}>
                  {organizer} n’a pas encore mis son lien Wave.
                </Txt>
              ) : null}
            </>
          )}
        </>
      )}
    </View>
  );
}

// Champ « Ton lien Wave » du créateur — même resynchronisation RENDER-PHASE que WaveLink.tsx
// (opérateur) : la valeur serveur arrive APRÈS le premier rendu (chargement des parts) ou change
// après un enregistrement, sans jamais écraser une saisie en cours.
function WaveLinkField({ reservationId, serverLink, onSaved }: { reservationId: string; serverLink: string | null; onSaved: () => void }) {
  const toast = useToast();
  const [value, setValue] = useState(serverLink ?? '');
  const [saving, setSaving] = useState(false);
  const [synced, setSynced] = useState(serverLink);
  if (serverLink !== synced) {
    const untouched = value.trim() === (synced ?? '').trim();
    setSynced(serverLink);
    if (untouched) setValue(serverLink ?? '');
  }
  const dirty = value.trim() !== (serverLink ?? '').trim();

  const save = async () => {
    if (saving) return;
    const res = normalizeWaveLink(value);
    if ('error' in res) {
      toast.show(res.error, { icon: 'alert-circle' });
      return;
    }
    setSaving(true);
    const ok = await setReservationWaveLink(reservationId, res.link);
    setSaving(false);
    toast.show(
      ok ? (res.link === '' ? 'Lien Wave retiré' : 'Lien Wave enregistré ✅') : 'Enregistrement impossible — réessaie',
      ok ? undefined : { icon: 'alert-circle' },
    );
    if (ok) {
      setValue(res.link); // la saisie devient le miroir EXACT de ce qui est parti au serveur
      onSaved();
    }
  };

  return (
    <>
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder="https://pay.wave.com/…"
        placeholderTextColor={colors.textMuted}
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Ton lien de paiement Wave"
        style={styles.input}
      />
      <View style={{ marginTop: spacing.sm, alignSelf: 'flex-start' }}>
        <Button
          size="sm"
          variant="secondary"
          label={saving ? 'Enregistrement…' : value.trim() === '' && serverLink ? 'Retirer le lien' : 'Enregistrer le lien'}
          icon="save-outline"
          onPress={() => void save()}
          disabled={saving || !dirty}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  // Encadré « argent » ambré, même langage que la carte « Frais à régler » (tournois).
  box: { marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.amberSoft },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  input: {
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
  },
});
