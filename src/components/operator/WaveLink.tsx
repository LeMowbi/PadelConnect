import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { useToast } from '@/components/Toast';
import { Button, Card, Txt } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

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
  const dirty = value.trim() !== (link ?? '').trim();

  const save = async () => {
    if (saving) return;
    setSaving(true);
    const { ok } = await onSet(value);
    setSaving(false);
    toast.show(ok ? 'Lien Wave enregistré ✅' : 'Enregistrement impossible — réessaie', ok ? undefined : { icon: 'alert-circle' });
  };

  return (
    <Card style={{ gap: spacing.sm }}>
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
    fontSize: 15,
  },
});
