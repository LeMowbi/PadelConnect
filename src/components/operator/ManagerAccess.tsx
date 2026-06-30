import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { useToast } from '@/components/Toast';
import { Button, Card, IconCircle, Txt } from '@/components/ui';
import { opStyles } from '@/components/operator/styles';
import { colors } from '@/theme';

// Accès gérant : l'opérateur saisit le numéro du joueur (qui a déjà créé un compte) et
// choisit le club. Le joueur devient gérant et voit son Espace Club au prochain retour.
export function ManagerAccess({
  clubs,
  onGrant,
  onRevoke,
  toast,
}: {
  clubs: { id: string; name: string; area: string }[];
  onGrant: (phone: string, clubId: string) => Promise<{ ok: boolean; name?: string }>;
  onRevoke: (phone: string) => Promise<{ ok: boolean; name?: string }>;
  toast: ReturnType<typeof useToast>;
}) {
  const [phone, setPhone] = useState('');
  const [clubId, setClubId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState<'grant' | 'revoke' | null>(null);
  const selected = clubs.find((c) => c.id === clubId);
  const digits = phone.replace(/\D/g, '');

  const grant = async () => {
    if (busy || !clubId || digits.length < 8) return;
    setBusy('grant');
    const { ok, name } = await onGrant(phone, clubId);
    setBusy(null);
    if (ok) {
      toast.show(`${name || 'Gérant'} → accès ${selected?.name ?? 'club'} ✅`);
      setPhone('');
      setClubId(null);
    } else {
      toast.show('Aucun joueur avec ce numéro — il doit d’abord créer un compte', { icon: 'alert-circle' });
    }
  };

  const revoke = async () => {
    if (busy || digits.length < 8) return;
    setBusy('revoke');
    const { ok, name } = await onRevoke(phone);
    setBusy(null);
    if (ok) {
      toast.show(`Accès gérant retiré (${name || 'joueur'})`);
      setPhone('');
    } else {
      toast.show('Aucun joueur avec ce numéro', { icon: 'alert-circle' });
    }
  };

  return (
    <Card>
      <Txt variant="small" color={colors.textMuted}>
        Le gérant crée d’abord un compte normal dans l’app, puis te communique son numéro. Saisis-le ici et choisis son club : il obtient
        l’accès « Espace Club » à sa prochaine ouverture de l’app, sans rien faire de technique.
      </Txt>
      <TextInput
        value={phone}
        onChangeText={setPhone}
        placeholder="Numéro du gérant"
        placeholderTextColor={colors.textFaint}
        keyboardType="phone-pad"
        style={opStyles.clubInput}
      />
      <Pressable onPress={() => setPickerOpen(true)} style={[opStyles.clubInput, opStyles.pickerRow]}>
        <Txt variant="body" color={selected ? colors.text : colors.textFaint} numberOfLines={1} style={{ flex: 1 }}>
          {selected ? selected.name : 'Choisir le club…'}
        </Txt>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>
      <Button
        size="sm"
        label={busy === 'grant' ? 'Attribution…' : 'Donner l’accès gérant'}
        icon="key"
        onPress={grant}
        disabled={!!busy || !clubId || digits.length < 8}
        full
      />
      <Button
        size="sm"
        variant="ghost"
        label={busy === 'revoke' ? 'Retrait…' : 'Retirer l’accès gérant'}
        icon="remove-circle-outline"
        onPress={revoke}
        disabled={!!busy || digits.length < 8}
        full
      />

      <BottomSheet visible={pickerOpen} title="Choisir le club" onClose={() => setPickerOpen(false)}>
        {clubs.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => {
              setClubId(c.id);
              setPickerOpen(false);
            }}
            style={opStyles.pickerOption}
          >
            <IconCircle icon="business" color={colors.green} bg={colors.greenSoft} size={36} />
            <View style={{ flex: 1 }}>
              <Txt variant="body" numberOfLines={1}>
                {c.name}
              </Txt>
              <Txt variant="muted" numberOfLines={1}>
                {c.area}
              </Txt>
            </View>
            {clubId === c.id ? <Ionicons name="checkmark-circle" size={20} color={colors.green} /> : null}
          </Pressable>
        ))}
      </BottomSheet>
    </Card>
  );
}
