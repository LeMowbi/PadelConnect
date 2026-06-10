import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { LevelStepper } from '@/components/LevelStepper';
import { Logo } from '@/components/Logo';
import { Button, Txt } from '@/components/ui';
import { levelLabel } from '@/data/matches';
import { pickImage } from '@/lib/pickImage';
import { GENDERS, ageFrom, parseBirthDate, zodiacFor, type Gender } from '@/lib/zodiac';
import { useApp } from '@/store/AppContext';
import { colors, gradients, radius, spacing } from '@/theme';

export default function Onboarding() {
  const router = useRouter();
  const { setAccount, setLevel, loadDemo } = useApp();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [birth, setBirth] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [photoUri, setPhotoUri] = useState<string | undefined>(undefined);
  const [lvl, setLvl] = useState(3.0);

  const birthDate = parseBirthDate(birth);
  const zodiac = birthDate ? zodiacFor(birthDate) : null;
  const ready =
    firstName.trim().length >= 2 &&
    lastName.trim().length >= 1 &&
    phone.replace(/\D/g, '').length >= 8 &&
    !!birthDate &&
    !!gender;

  const choosePhoto = async () => {
    const uri = await pickImage();
    if (uri) setPhotoUri(uri);
  };

  const create = () => {
    if (!ready) return;
    setAccount({ firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim(), photoUri, birthDate: birth.trim(), gender: gender! });
    setLevel(lvl);
    router.replace('/');
  };

  const demo = () => {
    loadDemo();
    router.replace('/');
  };

  return (
    <View style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
        <LinearGradient colors={gradients.heroSoft} style={styles.hero}>
          <Logo size={40} />
          <Txt variant="display" style={{ fontSize: 30, marginTop: spacing.xl }}>
            Bienvenue 👋
          </Txt>
          <Txt variant="muted" style={{ marginTop: 4 }}>
            Crée ton profil pour réserver, jouer et progresser.
          </Txt>
        </LinearGradient>

        <View style={styles.body}>
          <View style={{ alignItems: 'center' }}>
            <Pressable onPress={choosePhoto} style={styles.avatar}>
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.avatarImg} contentFit="cover" />
              ) : (
                <Ionicons name="camera-outline" size={28} color={colors.textMuted} />
              )}
            </Pressable>
            <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
              Photo (optionnel)
            </Txt>
          </View>

          <Field label="Prénom" value={firstName} onChangeText={setFirstName} placeholder="Ex. Moustapha" />
          <Field label="Nom" value={lastName} onChangeText={setLastName} placeholder="Ex. Bitar" />
          <Field label="Numéro de téléphone" value={phone} onChangeText={setPhone} placeholder="+225 07 00 00 00 00" keyboardType="phone-pad" />
          <Field label="Date de naissance" value={birth} onChangeText={setBirth} placeholder="JJ/MM/AAAA" keyboardType="phone-pad" />

          {/* Petit clin d'œil astro dès que la date est valide ✨ */}
          {zodiac && birthDate ? (
            <View style={styles.zodiac}>
              <Txt variant="h2">{zodiac.emoji}</Txt>
              <View style={{ flex: 1 }}>
                <Txt variant="body" style={{ fontWeight: '700' }} color={colors.purple}>
                  {zodiac.name} · {ageFrom(birthDate)} ans
                </Txt>
                <Txt variant="small" color={colors.textMuted}>
                  {zodiac.message}
                </Txt>
              </View>
            </View>
          ) : birth.trim().length > 0 ? (
            <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
              Format attendu : JJ/MM/AAAA (ex. 14/02/1998)
            </Txt>
          ) : null}

          <Txt variant="label" color={colors.textFaint} style={{ marginTop: spacing.lg }}>
            Sexe
          </Txt>
          <View style={styles.genderRow}>
            {GENDERS.map((g) => (
              <Chip key={g.id} label={g.label} active={gender === g.id} onPress={() => setGender(g.id)} size="lg" />
            ))}
          </View>

          <Txt variant="label" color={colors.textFaint} style={{ marginTop: spacing.lg }}>
            Ton niveau de jeu
          </Txt>
          <View style={styles.levelBox}>
            <LevelStepper value={lvl} onChange={setLvl} />
            <Txt variant="small" color={colors.textMuted} style={{ marginTop: spacing.sm }}>
              {levelLabel(lvl)} · évoluera selon tes tournois officiels
            </Txt>
          </View>

          <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
            <Button label="Créer mon profil" icon="checkmark" onPress={create} disabled={!ready} full />
            <Button label="Découvrir en démo" icon="play" variant="secondary" onPress={demo} full />
          </View>

          <Pressable onPress={() => router.push('/legal')} style={{ marginTop: spacing.lg }}>
            <Txt variant="small" color={colors.textFaint} style={{ textAlign: 'center' }}>
              En continuant, tu acceptes nos <Txt variant="small" color={colors.gold}>CGU & confidentialité</Txt>.
            </Txt>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'phone-pad';
}) {
  return (
    <>
      <Txt variant="label" color={colors.textFaint} style={{ marginTop: spacing.lg }}>
        {label}
      </Txt>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        keyboardType={keyboardType ?? 'default'}
        style={styles.input}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  hero: { paddingHorizontal: spacing.lg, paddingTop: spacing.xxxl, paddingBottom: spacing.xl },
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  zodiac: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.purpleSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  genderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  levelBox: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    marginTop: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    padding: spacing.md,
    marginTop: spacing.sm,
    fontSize: 15,
  },
});
