import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Confetti } from '@/components/Confetti';
import { Screen } from '@/components/Screen';
import { Button, Card, Divider, IconCircle, SectionHeader, Tag, Txt } from '@/components/ui';
import { levelLabel } from '@/data/matches';
import { useApp } from '@/store/AppContext';
import { initials } from '@/lib/format';
import { pickImage } from '@/lib/pickImage';
import { colors, radius, spacing } from '@/theme';

const FIVE_H = 5 * 3600000;

export default function ProfilScreen() {
  const router = useRouter();
  const {
    state,
    stats,
    setReservationResult,
    cancelReservation,
    confirmInvite,
    addFriend,
    removeFriend,
    setDefaultVisibility,
    signOut,
    resetAll,
  } = useApp();
  const { account, level, defaultVisibility, reservations, friends, officialResults } = state;

  const [editing, setEditing] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [fName, setFName] = useState('');
  const [fPhone, setFPhone] = useState('');

  if (!account) return null;

  const toValidate = reservations.filter((r) => !r.result);
  const history = reservations.filter((r) => r.result).sort((a, b) => (b.resultAt ?? 0) - (a.resultAt ?? 0));

  const badges = [
    { label: 'Première partie', ok: stats.played >= 1 },
    { label: '5 parties', ok: stats.played >= 5 },
    { label: 'Série de 3', ok: stats.streak >= 3 },
    { label: 'Compétiteur', ok: officialResults.length >= 1 },
    { label: 'Niveau 4+', ok: level >= 4 },
    { label: '5 amis', ok: friends.length >= 5 },
  ];

  return (
    <Screen title="Profil" overlay={celebrate ? <Confetti onDone={() => setCelebrate(false)} /> : null}>
      {editing ? (
        <EditAccount onDone={() => setEditing(false)} />
      ) : (
        <Card style={{ marginTop: spacing.sm }}>
          <View style={styles.head}>
            <View style={styles.avatar}>
              {account.photoUri ? (
                <Image source={{ uri: account.photoUri }} style={styles.avatarImg} contentFit="cover" />
              ) : (
                <Txt variant="display" color={colors.gold}>
                  {initials(`${account.firstName} ${account.lastName}`)}
                </Txt>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="h2">
                {account.firstName} {account.lastName}
              </Txt>
              <Txt variant="muted">{account.phone}</Txt>
              <View style={{ marginTop: spacing.sm }}>
                <Tag label={`Niveau ${level.toFixed(2)} · ${levelLabel(level)}`} tone="gold" icon="ribbon" />
              </View>
            </View>
          </View>
          <View style={{ marginTop: spacing.md }}>
            <Button size="sm" label="Modifier le profil" icon="create-outline" variant="secondary" onPress={() => setEditing(true)} />
          </View>
        </Card>
      )}

      {/* Niveau (évolue uniquement via les tournois officiels) */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Mon niveau" />
        <Card style={{ borderColor: colors.gold }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <IconCircle icon="ribbon" />
            <View style={{ flex: 1 }}>
              <Txt variant="h2" color={colors.gold}>
                {level.toFixed(2)}
              </Txt>
              <Txt variant="muted">{levelLabel(level)} · évolue selon tes tournois officiels.</Txt>
            </View>
          </View>
          {officialResults.length > 0 ? (
            <>
              <Divider style={{ marginVertical: spacing.md }} />
              <View style={{ gap: 6 }}>
                {officialResults.slice(0, 3).map((o) => (
                  <View key={o.id} style={styles.histRow}>
                    <Tag label={o.result === 'win' ? 'Gagné' : 'Perdu'} tone={o.result === 'win' ? 'green' : 'danger'} />
                    <Txt variant="muted" style={{ flex: 1 }}>
                      {o.title} → Niveau {o.levelAfter.toFixed(2)}
                    </Txt>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
              Inscris-toi à un tournoi officiel : ton résultat fera évoluer ton niveau.
            </Txt>
          )}
        </Card>
      </View>

      {/* Statistiques (parties amicales) */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Mes statistiques" />
        <View style={styles.stats}>
          <Stat value={stats.wins} label="Victoires" color={colors.green} />
          <Stat value={stats.losses} label="Défaites" color={colors.danger} />
          <Stat value={stats.played} label="Parties" color={colors.text} />
          <Stat value={`${stats.winRate}%`} label="Réussite" color={colors.gold} />
        </View>
        <Card style={{ marginTop: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <IconCircle icon="flame" color={colors.gold} bg={colors.goldSoft} size={40} />
          <Txt variant="body">
            Série :{' '}
            <Txt variant="body" color={colors.gold} style={{ fontWeight: '700' }}>
              {stats.streak} victoire{stats.streak > 1 ? 's' : ''}
            </Txt>
          </Txt>
        </Card>
      </View>

      {/* Trophées (fun) */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Trophées" />
        <Card>
          <View style={styles.badges}>
            {badges.map((b) => (
              <Tag key={b.label} label={b.label} tone={b.ok ? 'gold' : 'neutral'} icon={b.ok ? 'trophy' : 'lock-closed'} />
            ))}
          </View>
        </Card>
      </View>

      {/* Parties à valider */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title={`Parties à valider · ${toValidate.length}`} />
        {reservations.length === 0 ? (
          <Card>
            <Txt variant="muted">Réserve un terrain pour pouvoir enregistrer tes résultats.</Txt>
          </Card>
        ) : toValidate.length === 0 ? (
          <Card>
            <Txt variant="muted">Aucune partie en attente. Bien joué !</Txt>
          </Card>
        ) : (
          toValidate.map((r) => {
            const canCancel = r.startsAt - Date.now() > FIVE_H;
            return (
              <Card key={r.id} style={{ marginBottom: spacing.sm }}>
                <Txt variant="h3" style={{ fontSize: 15 }}>
                  {r.clubName}
                </Txt>
                <Txt variant="muted" style={{ marginTop: 2 }}>
                  {r.date} · {r.time} · {r.court}
                </Txt>
                {r.invited.length > 0 ? (
                  <View style={styles.invited}>
                    {r.invited.map((iv) => (
                      <Pressable key={iv.id} onPress={() => confirmInvite(r.id, iv.id)} style={[styles.inviteChip, iv.confirmed && styles.inviteOk]}>
                        <Ionicons name={iv.confirmed ? 'checkmark-circle' : 'time-outline'} size={13} color={iv.confirmed ? colors.green : colors.textMuted} />
                        <Txt variant="small" color={iv.confirmed ? colors.green : colors.textMuted}>
                          {iv.name}
                        </Txt>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                  <View style={{ flex: 1 }}>
                    <Button size="sm" label="J'ai gagné" icon="trophy" onPress={() => { setReservationResult(r.id, 'win'); setCelebrate(true); }} full />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button size="sm" label="J'ai perdu" icon="close" variant="danger" onPress={() => setReservationResult(r.id, 'loss')} full />
                  </View>
                </View>
                {canCancel ? (
                  <Button size="sm" label="Annuler la réservation" variant="ghost" onPress={() => cancelReservation(r.id)} />
                ) : (
                  <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm, textAlign: 'center' }}>
                    Annulation impossible (moins de 5h avant) — à régler avec le club.
                  </Txt>
                )}
              </Card>
            );
          })
        )}
      </View>

      {/* Historique */}
      {history.length > 0 ? (
        <View style={{ marginTop: spacing.xl }}>
          <SectionHeader title="Historique" />
          <Card>
            {history.map((r, i) => (
              <View key={r.id}>
                {i > 0 ? <Divider style={{ marginVertical: spacing.sm }} /> : null}
                <View style={styles.histRow}>
                  <View style={{ flex: 1 }}>
                    <Txt variant="body" style={{ fontWeight: '600' }}>
                      {r.clubName}
                    </Txt>
                    <Txt variant="muted">
                      {r.date} · {r.time} · {r.court}
                    </Txt>
                  </View>
                  <Tag label={r.result === 'win' ? 'Victoire' : 'Défaite'} tone={r.result === 'win' ? 'green' : 'danger'} />
                </View>
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      {/* Visibilité par défaut */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Visibilité par défaut" />
        <Card>
          <Txt variant="muted" style={{ marginBottom: spacing.md }}>
            Qui voit tes matchs quand tu en crées un ?
          </Txt>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <VisChip active={defaultVisibility === 'public'} icon="earth" label="Public" onPress={() => setDefaultVisibility('public')} />
            <VisChip active={defaultVisibility === 'amis'} icon="people" label="Amis" onPress={() => setDefaultVisibility('amis')} />
          </View>
        </Card>
      </View>

      {/* Amis */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title={`Mes amis · ${friends.length}`} />
        <Card>
          {friends.map((f, i) => (
            <View key={f.id}>
              {i > 0 ? <Divider style={{ marginVertical: spacing.sm }} /> : null}
              <View style={styles.friend}>
                <View style={styles.friendAvatar}>
                  <Txt variant="h3" color={colors.textMuted} style={{ fontSize: 14 }}>
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
                {f.level !== undefined ? <Tag label={`Niv. ${f.level.toFixed(1)}`} tone="neutral" /> : null}
                <Pressable onPress={() => removeFriend(f.id)} hitSlop={8}>
                  <Ionicons name="close-circle" size={20} color={colors.textFaint} />
                </Pressable>
              </View>
            </View>
          ))}
          <Divider style={{ marginVertical: spacing.md }} />
          <Txt variant="label" color={colors.textFaint}>
            Ajouter un ami
          </Txt>
          <Txt variant="small" color={colors.textFaint} style={{ marginTop: 2 }}>
            Par numéro : il devient ton ami dès qu'il installe PadelConnect.
          </Txt>
          <TextInput value={fName} onChangeText={setFName} placeholder="Nom de l'ami" placeholderTextColor={colors.textFaint} style={styles.input} />
          <TextInput value={fPhone} onChangeText={setFPhone} placeholder="Numéro (+225…) — optionnel" placeholderTextColor={colors.textFaint} keyboardType="phone-pad" style={styles.input} />
          <View style={{ marginTop: spacing.md }}>
            <Button
              size="sm"
              label="Ajouter l'ami"
              icon="person-add"
              disabled={fName.trim().length < 2}
              onPress={() => { addFriend(fName, fPhone); setFName(''); setFPhone(''); }}
            />
          </View>
        </Card>
      </View>

      {/* Espace Club */}
      <View style={{ marginTop: spacing.xl }}>
        <Card onPress={() => router.push('/club-admin')} style={styles.cta}>
          <IconCircle icon="business" />
          <View style={{ flex: 1 }}>
            <Txt variant="h3">Tu gères un club ?</Txt>
            <Txt variant="muted">Espace Club : page, photos, offres, créneaux, tournois.</Txt>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Card>
        <Card onPress={() => router.push('/operateur')} style={[styles.cta, { marginTop: spacing.sm }]}>
          <IconCircle icon="stats-chart" color={colors.green} bg={colors.greenSoft} />
          <View style={{ flex: 1 }}>
            <Txt variant="h3">Espace opérateur (PadelConnect)</Txt>
            <Txt variant="muted">Réservations reçues & commission par club.</Txt>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Card>
      </View>

      <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
        <Button label="Mentions légales & CGU" icon="document-text-outline" variant="ghost" onPress={() => router.push('/legal')} />
        <Button label="Se déconnecter" icon="log-out-outline" variant="secondary" onPress={signOut} />
        <Button
          label={confirmReset ? 'Confirmer la réinitialisation ?' : 'Réinitialiser la démo'}
          icon="refresh"
          variant={confirmReset ? 'danger' : 'ghost'}
          onPress={() => {
            if (confirmReset) resetAll();
            else {
              setConfirmReset(true);
              setTimeout(() => setConfirmReset(false), 4000);
            }
          }}
        />
      </View>
    </Screen>
  );
}

function EditAccount({ onDone }: { onDone: () => void }) {
  const { state, updateAccount } = useApp();
  const a = state.account!;
  const [firstName, setFirstName] = useState(a.firstName);
  const [lastName, setLastName] = useState(a.lastName);
  const [phone, setPhone] = useState(a.phone);
  const [photoUri, setPhotoUri] = useState<string | undefined>(a.photoUri);

  const choose = async () => {
    const uri = await pickImage();
    if (uri) setPhotoUri(uri);
  };
  const save = () => {
    updateAccount({ firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim(), photoUri });
    onDone();
  };

  return (
    <Card style={{ marginTop: spacing.sm }}>
      <View style={{ alignItems: 'center' }}>
        <Pressable onPress={choose} style={styles.avatar}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.avatarImg} contentFit="cover" />
          ) : (
            <Ionicons name="camera-outline" size={26} color={colors.textMuted} />
          )}
        </Pressable>
      </View>
      <TextInput value={firstName} onChangeText={setFirstName} placeholder="Prénom" placeholderTextColor={colors.textFaint} style={styles.input} />
      <TextInput value={lastName} onChangeText={setLastName} placeholder="Nom" placeholderTextColor={colors.textFaint} style={styles.input} />
      <TextInput value={phone} onChangeText={setPhone} placeholder="Téléphone" placeholderTextColor={colors.textFaint} keyboardType="phone-pad" style={styles.input} />
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Button label="Enregistrer" icon="checkmark" onPress={save} full />
        </View>
        <Button label="Annuler" variant="ghost" onPress={onDone} />
      </View>
    </Card>
  );
}

function Stat({ value, label, color }: { value: number | string; label: string; color: string }) {
  return (
    <View style={styles.stat}>
      <Txt variant="h2" color={color}>
        {value}
      </Txt>
      <Txt variant="small" color={colors.textMuted}>
        {label}
      </Txt>
    </View>
  );
}

function VisChip({ active, icon, label, onPress }: { active: boolean; icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.visChip, active && styles.visChipActive]}>
      <Ionicons name={icon} size={16} color={active ? colors.onGold : colors.textMuted} />
      <Txt variant="small" color={active ? colors.onGold : colors.text} style={{ fontWeight: '600' }}>
        {label}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.goldSoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  stats: { flexDirection: 'row', gap: spacing.sm },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  invited: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  inviteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  inviteOk: { backgroundColor: colors.greenSoft },
  visChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  visChipActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  friend: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  friendAvatar: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cta: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
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
