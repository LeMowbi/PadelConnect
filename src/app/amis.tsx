import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Button, Card, Divider, EmptyState, SectionHeader, Tag, Txt } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { initials } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';

export default function AmisScreen() {
  const { state, addFriend, removeFriend } = useApp();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [tapError, setTapError] = useState(false);

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
    <Screen back title="Mes amis" subtitle="Tes partenaires de jeu — invite-les sur tes réservations">
      <View style={{ marginTop: spacing.sm }}>
        <SectionHeader title={`Amis · ${state.friends.length}`} />
        {state.friends.length === 0 ? (
          <EmptyState icon="people-outline" title="Aucun ami pour l'instant" text="Ajoute tes partenaires ci-dessous : tu pourras les inviter en réservant." />
        ) : (
          <Card>
            {state.friends.map((f, i) => (
              <View key={f.id}>
                {i > 0 ? <Divider style={{ marginVertical: spacing.sm }} /> : null}
                <View style={styles.friend}>
                  <View style={styles.friendAvatar}>
                    <Txt variant="h3" color={colors.blue} style={{ fontSize: 14 }}>
                      {initials(f.name)}
                    </Txt>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt variant="body" style={{ fontWeight: '600' }}>
                      {f.name}
                    </Txt>
                    {f.phone ? (
                      <Txt variant="small" color={colors.textFaint}>
                        {f.phone}
                      </Txt>
                    ) : null}
                  </View>
                  {f.level !== undefined ? <Tag label={`Niv. ${f.level.toFixed(1)}`} tone="blue" /> : null}
                  <Pressable onPress={() => removeFriend(f.id)} hitSlop={8}>
                    <Ionicons name="close-circle" size={20} color={colors.textFaint} />
                  </Pressable>
                </View>
              </View>
            ))}
          </Card>
        )}
      </View>

      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Ajouter un ami" />
        <Card>
          <Txt variant="small" color={colors.textFaint}>
            Par numéro : il devient ton ami dès qu'il installe PadelConnect.
          </Txt>
          <TextInput value={name} onChangeText={setName} placeholder="Nom de l'ami" placeholderTextColor={colors.textFaint} style={styles.input} />
          {tapError || (name.length > 0 && !ready) ? (
            <Txt variant="small" color={colors.danger} style={{ marginTop: 4 }}>
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
            <Button size="sm" label="Ajouter l'ami" icon="person-add" onPress={submit} />
          </View>
          {!ready ? (
            <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
              Le nom est obligatoire pour ajouter un ami.
            </Txt>
          ) : null}
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  friend: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  friendAvatar: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    padding: spacing.md,
    marginTop: spacing.sm,
    fontSize: 15,
  },
});
