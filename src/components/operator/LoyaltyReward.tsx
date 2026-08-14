import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useToast } from '@/components/Toast';
import { Button, Card, Divider, IconCircle, Txt } from '@/components/ui';
import { fetchLoyaltyReward, setLoyaltyReward } from '@/lib/social';
import { colors, font, radius, spacing } from '@/theme';

// Même borne que `set_app_config` (SQL 82) : au-delà, le serveur refuse — on borne à la saisie
// pour ne jamais promettre un enregistrement qui sera rejeté.
const REWARD_MAX = 300;

// RÉCOMPENSE DE FIDÉLITÉ (82) : le texte que voit le joueur sur sa carte à tampons
// (« 10 parties = 1 récompense »), réglé par l'opérateur. Écriture HONNÊTE : on attend le
// serveur avant de dire « enregistré ».
export function LoyaltyReward({ toast }: { toast: ReturnType<typeof useToast> }) {
  // Valeur SERVEUR : null = pas encore lue (ou échec réseau), '' = non réglée. On n'affiche
  // jamais un texte inventé — convention §8.
  const [server, setServer] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  // La valeur serveur arrive APRÈS le 1er rendu (et change après un enregistrement) : on
  // resynchronise le champ, mais SEULEMENT si l'opérateur n'a pas de saisie en cours, pour ne
  // pas écraser sa frappe. Motif « ajuster un état quand une prop change » (rendu, pas effet) —
  // même patron que WaveLink.
  const [synced, setSynced] = useState<string | null>(null);
  if (server !== synced) {
    const untouched = value.trim() === (synced ?? '').trim();
    setSynced(server);
    if (untouched) setValue(server ?? '');
  }

  useEffect(() => {
    let alive = true;
    // Échec réseau (null) : on garde « pas encore lue » plutôt que d'afficher un champ vide
    // qui laisserait croire qu'aucune récompense n'est réglée.
    void fetchLoyaltyReward().then((t) => alive && t !== null && setServer(t));
    return () => {
      alive = false;
    };
  }, []);

  const dirty = value.trim() !== (server ?? '').trim();
  const save = async () => {
    if (saving) return; // garde anti double-tap
    setSaving(true);
    const text = value.trim();
    const ok = await setLoyaltyReward(text);
    setSaving(false);
    if (ok) setServer(text);
    toast.show(ok ? 'Récompense enregistrée ✅' : 'Enregistrement impossible — réessaie', ok ? undefined : { icon: 'alert-circle' });
  };

  return (
    <Card style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <IconCircle icon="gift" color={colors.amberDark} bg={colors.amberSoft} size={40} />
        <Txt variant="h3" style={{ flex: 1 }}>
          Récompense fidélité
        </Txt>
      </View>
      <Divider />
      <Txt variant="muted">
        Ce que gagne un joueur toutes les 10 parties jouées (il le voit sur sa carte à tampons, dans son profil). Laisse vide tant que la
        récompense n’est pas décidée.
      </Txt>
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder="Ex. 1 heure de terrain offerte dans ton club"
        placeholderTextColor={colors.textMuted}
        multiline
        maxLength={REWARD_MAX}
        accessibilityLabel="Texte de la récompense de fidélité"
        style={styles.input}
      />
      <Txt variant="small" color={colors.textFaint}>
        {value.trim().length}/{REWARD_MAX} caractères
      </Txt>
      <Button
        label={saving ? 'Enregistrement…' : 'Enregistrer la récompense'}
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
    minHeight: 74,
    textAlignVertical: 'top',
  },
});
