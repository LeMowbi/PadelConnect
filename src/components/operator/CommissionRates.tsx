import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useToast } from '@/components/Toast';
import { Button, Card, Divider, Txt } from '@/components/ui';
import { opStyles } from '@/components/operator/styles';
import { colors, spacing } from '@/theme';

// Commission par club : l'opérateur fixe le % négocié avec chaque club (repli sur le défaut).
export function CommissionRates({
  clubs,
  rates,
  defaultRate,
  onSet,
  toast,
}: {
  clubs: { id: string; name: string; area: string }[];
  rates: Record<string, number>;
  defaultRate: number;
  onSet: (clubId: string, rate: number) => Promise<{ ok: boolean }>;
  toast: ReturnType<typeof useToast>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const save = async (clubId: string) => {
    const raw = draft[clubId];
    const pct = Number((raw ?? '').replace(',', '.'));
    // L'opérateur fixe le taux LIBREMENT (il prévient lui-même le club avant) : on valide
    // seulement que c'est un pourcentage plausible (0 à 100).
    if (busy || !Number.isFinite(pct) || pct < 0 || pct > 100) {
      toast.show('Entre un pourcentage entre 0 et 100', { icon: 'alert-circle' });
      return;
    }
    setBusy(clubId);
    const { ok } = await onSet(clubId, pct / 100);
    setBusy(null);
    if (ok) {
      setDraft((d) => ({ ...d, [clubId]: '' }));
      toast.show('Commission mise à jour ✅');
    } else {
      toast.show('Changement impossible — réessaie', { icon: 'alert-circle' });
    }
  };

  return (
    <Card>
      <Txt variant="small" color={colors.textMuted}>
        Par défaut {Math.round(defaultRate * 100)} %. Tu peux fixer un taux différent pour chaque club selon ton accord (préviens le club
        avant) — il s'applique aussitôt au décompte.
      </Txt>
      <Button
        size="sm"
        variant="ghost"
        label={open ? 'Masquer les taux' : 'Régler les taux par club'}
        icon={open ? 'chevron-up' : 'options'}
        onPress={() => setOpen((v) => !v)}
        full
      />
      {open
        ? clubs.map((c, i) => {
            const current = Math.round((rates[c.id] ?? defaultRate) * 100);
            const custom = rates[c.id] !== undefined;
            return (
              <View key={c.id}>
                {i > 0 ? <Divider style={{ marginVertical: spacing.sm }} /> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <Txt variant="body" style={{ fontWeight: '600' }} numberOfLines={1}>
                      {c.name}
                    </Txt>
                    <Txt variant="muted">
                      Actuel : {current}%{custom ? '' : ' (défaut)'}
                    </Txt>
                  </View>
                  <TextInput
                    value={draft[c.id] ?? ''}
                    onChangeText={(t) => setDraft((d) => ({ ...d, [c.id]: t }))}
                    placeholder={`${current}`}
                    placeholderTextColor={colors.textFaint}
                    keyboardType="numeric"
                    style={[opStyles.clubInput, { width: 64, marginTop: 0, textAlign: 'center' }]}
                  />
                  <Button
                    size="sm"
                    label={busy === c.id ? '…' : 'OK'}
                    onPress={() => save(c.id)}
                    disabled={busy === c.id || !(draft[c.id] ?? '').trim()}
                  />
                </View>
              </View>
            );
          })
        : null}
    </Card>
  );
}
