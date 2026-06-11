import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { Screen } from '@/components/Screen';
import { Button, Card, Divider, IconCircle, SectionHeader, Tag, Txt } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { initials, levelLabel } from '@/lib/format';
import { pickImage } from '@/lib/pickImage';
import { GENDERS, ageFrom, genderLabel, maskBirthDate, parseBirthDate, zodiacFor, type Gender } from '@/lib/zodiac';
import { colors, radius, spacing } from '@/theme';

export default function ProfilScreen() {
  const router = useRouter();
  const { state, stats, setRemindersOn, signOut, resetAll } = useApp();
  const { account, level, friends, officialResults } = state;

  const [editing, setEditing] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  if (!account) return null;

  // Trophées basés sur du réel : parties jouées (auto), tournois, niveau, amis.
  const badges = [
    { label: 'Première partie', ok: stats.played >= 1, need: 'Joue ta 1ʳᵉ partie' },
    { label: '5 parties', ok: stats.played >= 5, need: `${stats.played}/5 parties` },
    { label: '20 parties', ok: stats.played >= 20, need: `${stats.played}/20 parties` },
    { label: 'Premier tournoi', ok: stats.tournamentsPlayed >= 1, need: 'Joue un tournoi' },
    { label: 'Vainqueur de tournoi', ok: stats.tournamentsWon >= 1, need: 'Gagne un tournoi' },
    { label: 'Niveau 4+', ok: level >= 4, need: `Niveau ${level.toFixed(1)}/4` },
    { label: '5 amis', ok: friends.length >= 5, need: `${friends.length}/5 amis` },
  ];

  const bd = account.birthDate ? parseBirthDate(account.birthDate) : null;
  const zod = bd ? zodiacFor(bd) : null;
  // « Non défini » ne s'affiche pas — on ne montre le sexe que s'il est renseigné.
  const g = account.gender && account.gender !== 'nd' ? genderLabel(account.gender) : null;

  return (
    <Screen back title="Profil">
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
              {bd && zod ? (
                <Txt variant="small" color={colors.purple} style={{ marginTop: 2, fontWeight: '600' }}>
                  {zod.emoji} {zod.name} · {ageFrom(bd)} ans{g ? ` · ${g}` : ''}
                </Txt>
              ) : g ? (
                <Txt variant="small" color={colors.textMuted} style={{ marginTop: 2 }}>
                  {g}
                </Txt>
              ) : null}
            </View>
          </View>
          <View style={{ marginTop: spacing.md }}>
            <Button size="sm" label="Modifier le profil" icon="create-outline" variant="secondary" onPress={() => setEditing(true)} />
          </View>
        </Card>
      )}

      {/* Mon niveau — n'évolue que par les tournois officiels */}
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
                  <View key={o.id} style={styles.row}>
                    <Tag label={o.result === 'win' ? 'Vainqueur' : 'Participant'} tone={o.result === 'win' ? 'amber' : 'blue'} />
                    <Txt variant="muted" style={{ flex: 1 }}>
                      {o.title} → Niveau {o.levelAfter.toFixed(2)}
                    </Txt>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
              Inscris-toi à un tournoi officiel : une victoire fait gagner +0.25.
            </Txt>
          )}
        </Card>
      </View>

      {/* 3 stats, pas plus — comptées automatiquement */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Mes statistiques" />
        <View style={styles.stats}>
          <Stat value={stats.played} label="Parties jouées" color={colors.green} bg={colors.greenSoft} />
          <Stat value={stats.tournamentsPlayed} label="Tournois joués" color={colors.purple} bg={colors.purpleSoft} />
          <Stat value={stats.tournamentsWon} label="Tournois gagnés" color={colors.amber} bg={colors.amberSoft} />
        </View>
        <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
          Les parties jouées se comptent toutes seules : une réservation passée = une partie.
        </Txt>
      </View>

      {/* Trophées */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Trophées" />
        <Card>
          <View style={styles.badges}>
            {badges.map((b) => (
              <View key={b.label} style={{ alignItems: 'flex-start' }}>
                <Tag label={b.label} tone={b.ok ? 'amber' : 'neutral'} icon={b.ok ? 'trophy' : 'lock-closed'} />
                {!b.ok ? (
                  <Txt variant="small" color={colors.textFaint} style={{ fontSize: 10, marginTop: 2 }}>
                    {b.need}
                  </Txt>
                ) : null}
              </View>
            ))}
          </View>
        </Card>
      </View>

      {/* Raccourcis */}
      <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
        <Card onPress={() => router.push('/reservations')} style={styles.cta}>
          <IconCircle icon="calendar" color={colors.green} bg={colors.greenSoft} />
          <View style={{ flex: 1 }}>
            <Txt variant="h3">Mes réservations</Txt>
            <Txt variant="muted">À venir, statut du club, passées.</Txt>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Card>
        <Card onPress={() => router.push('/amis')} style={styles.cta}>
          <IconCircle icon="people" color={colors.blue} bg={colors.blueSoft} />
          <View style={{ flex: 1 }}>
            <Txt variant="h3">Mes amis · {friends.length}</Txt>
            <Txt variant="muted">Tes partenaires de jeu.</Txt>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Card>
      </View>

      {/* Rappels */}
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Rappels" />
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <IconCircle icon="notifications" color={colors.coral} bg={colors.coralSoft} />
          <View style={{ flex: 1 }}>
            <Txt variant="body" style={{ fontWeight: '600' }}>
              Rappels de match
            </Txt>
            <Txt variant="small" color={colors.textMuted}>
              Carte de rappel avant chaque partie. (Les notifications téléphone arrivent avec l'app installée.)
            </Txt>
          </View>
          <Switch
            value={state.remindersOn}
            onValueChange={setRemindersOn}
            trackColor={{ true: colors.gold, false: colors.border }}
            thumbColor={colors.white}
          />
        </Card>
      </View>

      {/* Espaces pro */}
      <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
        <Card onPress={() => router.push('/club-admin')} style={styles.cta}>
          <IconCircle icon="business" />
          <View style={{ flex: 1 }}>
            <Txt variant="h3">Tu gères un club ?</Txt>
            <Txt variant="muted">Espace Club : réservations, page, créneaux, tournois.</Txt>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Card>
        <Card onPress={() => router.push('/operateur')} style={styles.cta}>
          <IconCircle icon="stats-chart" color={colors.green} bg={colors.greenSoft} />
          <View style={{ flex: 1 }}>
            <Txt variant="h3">Espace opérateur (PadelConnect)</Txt>
            <Txt variant="muted">Décomptes, commissions, nouveaux clubs.</Txt>
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
  const [birth, setBirth] = useState(a.birthDate ?? '');
  const [gender, setGender] = useState<Gender | undefined>(a.gender);
  const [photoUri, setPhotoUri] = useState<string | undefined>(a.photoUri);

  const choose = async () => {
    const uri = await pickImage();
    if (uri) setPhotoUri(uri);
  };
  const save = () => {
    updateAccount({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim(),
      photoUri,
      birthDate: parseBirthDate(birth) ? birth.trim() : a.birthDate,
      gender,
    });
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
      <TextInput value={birth} onChangeText={(t) => setBirth(maskBirthDate(t, birth))} placeholder="Date de naissance (JJ/MM/AAAA)" placeholderTextColor={colors.textFaint} keyboardType="phone-pad" maxLength={10} style={styles.input} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }}>
        {GENDERS.map((gd) => (
          <Chip key={gd.id} label={gd.label} active={gender === gd.id} onPress={() => setGender(gd.id)} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Button label="Enregistrer" icon="checkmark" onPress={save} full />
        </View>
        <Button label="Annuler" variant="ghost" onPress={onDone} />
      </View>
    </Card>
  );
}

function Stat({ value, label, color, bg }: { value: number | string; label: string; color: string; bg: string }) {
  return (
    <View style={[styles.stat, { backgroundColor: bg }]}>
      <Txt variant="h2" color={color}>
        {value}
      </Txt>
      <Txt variant="small" color={colors.textMuted} style={{ textAlign: 'center' }}>
        {label}
      </Txt>
    </View>
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
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
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
