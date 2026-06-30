import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Avatar } from '@/components/Avatar';
import { PlayerSheet, type PlayerLike } from '@/components/PlayerSheet';
import { Screen } from '@/components/Screen';
import { Button, Card, Divider, EmptyState, Txt } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing } from '@/theme';

export default function AmisScreen() {
  const router = useRouter();
  const { state, addFriend, removeFriend } = useApp();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [tapError, setTapError] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null); // ami en cours de retrait (confirmation)
  const [openPlayer, setOpenPlayer] = useState<PlayerLike | null>(null);

  const openFriend = (f: { id: string; name: string; level?: number }) => setOpenPlayer({ id: f.id, name: f.name, level: f.level });

  const ready = name.trim().length >= 2;
  // Le bouton reste tapable : un tap sans nom affiche l'erreur (au lieu d'un silence).
  const submit = () => {
    if (!ready) {
      setTapError(true);
      return;
    }
    setTapError(false);
    addFriend(name, phone);
    setName('');
    setPhone('');
  };

  return (
    <Screen back title="Amis" subtitle="Tes partenaires de jeu — invite-les sur tes réservations">
      <View style={{ marginTop: spacing.sm }}>
        {state.friends.length === 0 ? (
          <>
            <EmptyState
              icon="people-outline"
              title="Aucun ami pour l'instant"
              text="Ajoute tes partenaires ci-dessous : tu pourras les inviter en réservant."
            />
            <View style={{ alignItems: 'center', marginTop: spacing.md }}>
              <Button label="Inviter des amis" icon="gift-outline" variant="secondary" onPress={() => router.push('/parrainage')} pill />
            </View>
          </>
        ) : (
          <Card>
            {state.friends.map((f, i) => (
              <View key={f.id}>
                {i > 0 ? <Divider style={{ marginVertical: spacing.md }} /> : null}
                <View style={styles.row}>
                  <Pressable onPress={() => openFriend(f)} style={styles.rowTap}>
                    <Avatar name={f.name} size={44} />
                    <View style={styles.rowInfo}>
                      <Txt variant="body" style={styles.rowName}>
                        {f.name}
                      </Txt>
                      <Txt variant="small" color={colors.textMuted}>
                        {subtitleFor(f.level, f.phone)}
                      </Txt>
                    </View>
                  </Pressable>
                  <Button size="sm" label="Retirer" variant="ghost" onPress={() => setRemoveId(removeId === f.id ? null : f.id)} />
                </View>
                {removeId === f.id ? (
                  // Confirmation légère, en place — pas de suppression au premier tap.
                  <View style={styles.removeConfirm}>
                    <Txt variant="small" color={colors.textMuted} style={{ flex: 1 }}>
                      Retirer {f.name} de tes amis ?
                    </Txt>
                    <Button
                      size="sm"
                      label="Oui, retirer"
                      variant="danger"
                      onPress={() => {
                        removeFriend(f.id);
                        setRemoveId(null);
                      }}
                    />
                    <Button size="sm" label="Non" variant="secondary" onPress={() => setRemoveId(null)} />
                  </View>
                ) : null}
              </View>
            ))}
          </Card>
        )}

        <View style={styles.section}>
          <Card>
            <Txt variant="h3">Ajouter un ami</Txt>
            <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.xs }}>
              Par numéro : il devient ton ami dès qu'il installe PadelConnect.
            </Txt>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Nom de l'ami"
              placeholderTextColor={colors.textFaint}
              style={styles.input}
            />
            {tapError || (name.length > 0 && !ready) ? (
              <Txt variant="small" color={colors.danger} style={{ marginTop: spacing.xs }}>
                Indique au moins le nom (2 caractères).
              </Txt>
            ) : null}
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="Numéro (+225…) — optionnel"
              placeholderTextColor={colors.textFaint}
              keyboardType="phone-pad"
              style={styles.input}
            />
            <View style={{ marginTop: spacing.md, opacity: ready ? 1 : 0.5 }}>
              <Button size="sm" label="Ajouter l'ami" icon="person-add" onPress={submit} pill />
            </View>
            {!ready ? (
              <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
                Le nom est obligatoire pour ajouter un ami.
              </Txt>
            ) : null}
          </Card>
        </View>
      </View>

      <PlayerSheet player={openPlayer} onClose={() => setOpenPlayer(null)} />
    </Screen>
  );
}

// Sous-titre « Niveau X · {ville/zone si dispo} » — le second segment n'apparaît
// que s'il est renseigné (numéro de l'ami ou club favori du joueur suivi).
function subtitleFor(level: number | undefined, extra?: string): string {
  const parts: string[] = [];
  if (level !== undefined) parts.push(`Niveau ${level.toFixed(1)}`);
  if (extra) parts.push(extra);
  return parts.length > 0 ? parts.join(' · ') : 'Joueur PadelConnect';
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowInfo: { flex: 1, gap: 2 },
  rowName: { fontWeight: '600' },
  removeConfirm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    padding: spacing.md,
    marginTop: spacing.sm,
    fontSize: 15,
  },
});
