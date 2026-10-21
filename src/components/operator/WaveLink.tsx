import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useToast } from '@/components/Toast';
import { Button, Card, Divider, IconCircle, Txt } from '@/components/ui';
import { normalizeWaveLink } from '@/lib/waveLink';
import { colors, font, radius, spacing } from '@/theme';

// Lien de paiement Wave de l'opérateur (v2). Le créateur d'un tournoi validé l'ouvre pour
// régler ses frais. Écriture HONNÊTE : on attend le serveur avant de dire « enregistré ».
export function WaveLink({
  link,
  onSet,
  toast,
}: {
  link: string | null;
  onSet: (link: string) => Promise<{ ok: boolean }>;
  toast: ReturnType<typeof useToast>;
}) {
  const [value, setValue] = useState(link ?? '');
  const [saving, setSaving] = useState(false);
  // Le lien serveur peut arriver APRÈS le 1er rendu (démarrage à froid / réseau lent) ou changer
  // après un enregistrement. On resynchronise le champ sur cette nouvelle valeur — mais SEULEMENT
  // si l'opérateur n'a pas de saisie en cours (le champ reflète encore l'ancien lien), pour ne pas
  // écraser sa frappe. Motif « ajuster un état quand une prop change » de React (rendu, pas effet).
  const [syncedLink, setSyncedLink] = useState(link);
  if (link !== syncedLink) {
    const untouched = value.trim() === (syncedLink ?? '').trim();
    setSyncedLink(link);
    if (untouched) setValue(link ?? '');
  }
  const dirty = value.trim() !== (link ?? '').trim();

  const save = async () => {
    if (saving) return;
    // Même normalisation que les parts d'un match (aucune garde côté set_wave_link) : un lien
    // sans « https:// » enregistré tel quel cassait « Payer par Wave » chez chaque organisateur.
    const res = normalizeWaveLink(value);
    if ('error' in res) {
      toast.show(res.error, { icon: 'alert-circle' });
      return;
    }
    setSaving(true);
    const { ok } = await onSet(res.link);
    setSaving(false);
    toast.show(
      ok ? (res.link === '' ? 'Lien Wave retiré' : 'Lien Wave enregistré ✅') : 'Enregistrement impossible — réessaie',
      ok ? undefined : { icon: 'alert-circle' },
    );
    // La saisie devient le miroir EXACT de ce qui est parti au serveur (sinon `dirty` restait vrai).
    if (ok) setValue(res.link);
  };

  return (
    <Card style={{ gap: spacing.sm }}>
      {/* En-tête « argent » ambré, miroir de la carte « Frais à régler » vue par l'organisateur. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <IconCircle icon="wallet-outline" color={colors.amberDark} bg={colors.amberSoft} size={40} />
        <Txt variant="h3" style={{ flex: 1 }}>
          Paiement Wave
        </Txt>
      </View>
      <Divider />
      <Txt variant="muted">
        Colle ici TON lien de paiement Wave (ex. https://pay.wave.com/…). C’est ce lien que les organisateurs de tournois ouvriront pour
        régler leurs frais.
      </Txt>
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder="https://pay.wave.com/…"
        placeholderTextColor={colors.textMuted}
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Lien de paiement Wave"
        style={styles.input}
      />
      <Button
        label={saving ? 'Enregistrement…' : 'Enregistrer le lien'}
        icon="save-outline"
        onPress={save}
        disabled={saving || !dirty}
        full
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: font.size.md,
  },
});
