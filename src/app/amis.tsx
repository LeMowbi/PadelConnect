import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { PlayerSheet, type PlayerLike } from '@/components/PlayerSheet';
import { Screen } from '@/components/Screen';
import { Button, Card, Divider, EmptyState, SectionHeader, Tag, Txt } from '@/components/ui';
import { playerById } from '@/data/players';
import { useApp } from '@/store/AppContext';
import { initials } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';

export default function AmisScreen() {
  const { state, addFriend, removeFriend, toggleFollow } = useApp();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [tapError, setTapError] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null); // ami en cours de retrait (confirmation)
  const [openPlayer, setOpenPlayer] = useState<PlayerLike | null>(null);

  const followed = Object.entries(state.followed);
  const openFriend = (f: { id: string; name: string; level?: number }) =>
    setOpenPlayer(playerById(f.id) ?? { id: f.id, name: f.name, level: f.level });

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
                  <Pressable onPress={() => openFriend(f)} style={styles.friendTap}>
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
                  </Pressable>
                  <Button
                    size="sm"
                    label="Retirer"
                    variant="ghost"
                    onPress={() => setRemoveId(removeId === f.id ? null : f.id)}
                  />
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
      </View>

      {/* Joueurs suivis (via les mini-fiches) — retirables */}
      {followed.length > 0 ? (
        <View style={{ marginTop: spacing.xl }}>
          <SectionHeader title={`Suivis · ${followed.length}`} />
          <Card>
            {followed.map(([id, info], i) => (
              <View key={id}>
                {i > 0 ? <Divider style={{ marginVertical: spacing.sm }} /> : null}
                <View style={styles.friend}>
                  <Pressable onPress={() => setOpenPlayer({ id, name: info.name, level: info.level })} style={styles.friendTap}>
                    <View style={styles.friendAvatar}>
                      <Txt variant="h3" color={colors.blue} style={{ fontSize: 14 }}>
                        {initials(info.name)}
                      </Txt>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Txt variant="body" style={{ fontWeight: '600' }}>
                        {info.name}
                      </Txt>
                      {info.favoriteClub ? (
                        <Txt variant="small" color={colors.textFaint}>{info.favoriteClub}</Txt>
                      ) : null}
                    </View>
                    {info.level !== undefined ? <Tag label={`Niv. ${info.level.toFixed(2)}`} tone="blue" /> : null}
                  </Pressable>
                  <Button size="sm" label="Retirer" variant="ghost" onPress={() => toggleFollow(id, info)} />
                </View>
              </View>
            ))}
          </Card>
        </View>
      ) : null}

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

      <PlayerSheet player={openPlayer} onClose={() => setOpenPlayer(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  friend: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  friendTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  removeConfirm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
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
