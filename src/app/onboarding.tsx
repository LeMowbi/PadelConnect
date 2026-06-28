import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { Chip } from '@/components/Chip';
import { LevelStepper } from '@/components/LevelStepper';
import { Logo } from '@/components/Logo';
import { Button, Txt } from '@/components/ui';
import { levelLabel } from '@/lib/format';
import { pickImage } from '@/lib/pickImage';
import { GENDERS, ageFrom, maskBirthDate, parseBirthDate, zodiacFor, type Gender } from '@/lib/zodiac';
import { useApp } from '@/store/AppContext';
import { colors, font, gradients, radius, shadows, spacing } from '@/theme';

type FieldKey = 'firstName' | 'lastName' | 'phone' | 'password' | 'birth' | 'gender';

export default function Onboarding() {
  const router = useRouter();
  const { signUpWithPhone, signInWithPhone, loadDemo } = useApp();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('+225 ');
  const [password, setPassword] = useState('');
  const [birth, setBirth] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [photoUri, setPhotoUri] = useState<string | undefined>(undefined);
  const [lvl, setLvl] = useState(3.0);
  // Erreurs par champ — affichées au tap sur « Créer mon profil » (aucun tap silencieux).
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  // Mode « Se connecter » (compte existant, ex. après réinstallation).
  const [signInOpen, setSignInOpen] = useState(false);
  const [siPhone, setSiPhone] = useState('+225 ');
  const [siPass, setSiPass] = useState('');
  const [siBusy, setSiBusy] = useState(false);
  const [siError, setSiError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const positions = useRef<Partial<Record<FieldKey, number>>>({});

  const birthDate = parseBirthDate(birth);
  const zodiac = birthDate ? zodiacFor(birthDate) : null;

  const choosePhoto = async () => {
    const uri = await pickImage({ square: true });
    if (uri) setPhotoUri(uri);
  };

  const validate = (): Partial<Record<FieldKey, string>> => {
    const e: Partial<Record<FieldKey, string>> = {};
    if (phone.replace(/\D/g, '').length < 8) e.phone = 'Numéro invalide — au moins 8 chiffres.';
    if (password.length < 6) e.password = 'Mot de passe : 6 caractères minimum.';
    if (firstName.trim().length < 2) e.firstName = 'Indique ton prénom (2 lettres minimum).';
    if (lastName.trim().length < 1) e.lastName = 'Indique ton nom.';
    // Date de naissance optionnelle : on ne signale une erreur QUE si elle est mal saisie.
    if (birth.trim().length > 0 && !birthDate) e.birth = 'Date invalide — vérifie le jour, le mois et l’année.';
    if (!gender) e.gender = 'Choisis une option.';
    return e;
  };

  const create = async () => {
    const e = validate();
    setErrors(e);
    setAuthError(null);
    const first = (['phone', 'password', 'firstName', 'lastName', 'birth', 'gender'] as FieldKey[]).find((k) => e[k]);
    if (first) {
      // Scroll automatique vers le premier champ en erreur.
      scrollRef.current?.scrollTo({ y: Math.max(0, (positions.current[first] ?? 0) - 24), animated: true });
      return;
    }
    setBusy(true);
    const res = await signUpWithPhone(phone, password, {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      birthDate: birth.trim() || undefined,
      gender: gender!,
      level: lvl,
    });
    setBusy(false);
    if (res.ok) router.replace('/');
    else setAuthError(res.error ?? 'Inscription impossible. Réessaie.');
  };

  const signIn = async () => {
    if (siPhone.replace(/\D/g, '').length < 8 || siPass.length < 6) {
      setSiError('Numéro et mot de passe requis.');
      return;
    }
    setSiBusy(true);
    setSiError(null);
    const res = await signInWithPhone(siPhone, siPass);
    setSiBusy(false);
    if (res.ok) {
      setSignInOpen(false);
      router.replace('/');
    } else setSiError(res.error ?? 'Connexion impossible.');
  };

  const demo = () => {
    loadDemo();
    router.replace('/');
  };

  const clearError = (k: FieldKey) => setErrors((cur) => (cur[k] ? { ...cur, [k]: undefined } : cur));

  return (
    <View style={styles.root}>
      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
        <LinearGradient colors={gradients.deepGreen} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <Logo size={40} />
          <Txt variant="display" color={colors.onSignature} style={styles.heroTitle}>
            Réserve ton terrain à Abidjan
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

          {/* Téléphone d'abord (brief) — c'est l'identifiant clé pour les réservations. */}
          <Field
            label="Numéro de téléphone"
            value={phone}
            onChangeText={(t) => {
              setPhone(t);
              clearError('phone');
            }}
            placeholder="+225 07 00 00 00 00"
            keyboardType="phone-pad"
            error={errors.phone}
            onLayout={(y) => {
              positions.current.phone = y;
            }}
            autoFocus
          />
          <Field
            label="Mot de passe"
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              clearError('password');
            }}
            placeholder="6 caractères minimum"
            secureTextEntry
            autoCapitalize="none"
            error={errors.password}
            onLayout={(y) => {
              positions.current.password = y;
            }}
          />
          <Field
            label="Prénom"
            value={firstName}
            onChangeText={(t) => {
              setFirstName(t);
              clearError('firstName');
            }}
            placeholder="Ex. Moustapha"
            autoCapitalize="words"
            error={errors.firstName}
            onLayout={(y) => {
              positions.current.firstName = y;
            }}
          />
          <Field
            label="Nom"
            value={lastName}
            onChangeText={(t) => {
              setLastName(t);
              clearError('lastName');
            }}
            placeholder="Ex. Bitar"
            autoCapitalize="words"
            error={errors.lastName}
            onLayout={(y) => {
              positions.current.lastName = y;
            }}
          />
          {/* Date de naissance OPTIONNELLE (brief : différée au profil). */}
          <Field
            label="Date de naissance (optionnel)"
            value={birth}
            onChangeText={(t) => {
              setBirth(maskBirthDate(t, birth));
              clearError('birth');
            }}
            placeholder="JJ/MM/AAAA"
            keyboardType="number-pad"
            maxLength={10}
            error={errors.birth}
            onLayout={(y) => {
              positions.current.birth = y;
            }}
          />

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
          ) : birth.length === 10 ? (
            <Txt variant="small" color={colors.danger} style={{ marginTop: spacing.sm }}>
              Cette date n'existe pas — vérifie le jour et le mois.
            </Txt>
          ) : null}

          <View
            onLayout={(e) => {
              positions.current.gender = e.nativeEvent.layout.y;
            }}
          >
            <Txt variant="label" style={styles.fieldLabel}>
              Sexe
            </Txt>
            <View style={styles.genderRow}>
              {GENDERS.map((g) => (
                <Chip
                  key={g.id}
                  label={g.label}
                  active={gender === g.id}
                  onPress={() => {
                    setGender(g.id);
                    clearError('gender');
                  }}
                  size="lg"
                />
              ))}
            </View>
            {errors.gender ? (
              <Txt variant="small" color={colors.danger} style={{ marginTop: 4 }}>
                {errors.gender}
              </Txt>
            ) : null}
          </View>

          <Txt variant="label" style={styles.fieldLabel}>
            Ton niveau de jeu
          </Txt>
          <View style={styles.levelBox}>
            <LevelStepper value={lvl} onChange={setLvl} />
            <Txt variant="small" color={colors.textMuted} style={{ marginTop: spacing.sm }}>
              {levelLabel(lvl)} · évoluera selon tes tournois officiels
            </Txt>
          </View>

          {authError ? (
            <View style={styles.authError}>
              <Ionicons name="alert-circle" size={16} color={colors.danger} />
              <Txt variant="small" color={colors.danger} style={{ flex: 1 }}>
                {authError}
              </Txt>
            </View>
          ) : null}

          <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
            <Button label={busy ? 'Création…' : 'Créer mon profil'} icon="checkmark" onPress={create} disabled={busy} full />
            <Button label="Découvrir en démo" icon="play" variant="secondary" onPress={demo} full />
          </View>

          <Pressable onPress={() => setSignInOpen(true)} style={{ marginTop: spacing.lg, alignItems: 'center' }}>
            <Txt variant="small" color={colors.textFaint} style={{ textAlign: 'center' }}>
              Tu as déjà un compte ?{' '}
              <Txt variant="small" color={colors.signature}>
                Se connecter →
              </Txt>
            </Txt>
          </Pressable>

          {/* C-S2 : lien discret vers /decouvrir pour les débutants */}
          <Pressable onPress={() => router.push('/decouvrir')} style={{ marginTop: spacing.lg, alignItems: 'center' }}>
            <Txt variant="small" color={colors.textFaint} style={{ textAlign: 'center' }}>
              Nouveau au padel ?{' '}
              <Txt variant="small" color={colors.signature}>
                Découvrir les règles →
              </Txt>
            </Txt>
          </Pressable>

          <Pressable onPress={() => router.push('/legal')} style={{ marginTop: spacing.md }}>
            <Txt variant="small" color={colors.textFaint} style={{ textAlign: 'center' }}>
              En continuant, tu acceptes nos{' '}
              <Txt variant="small" color={colors.signature}>
                CGU & confidentialité
              </Txt>
              .
            </Txt>
          </Pressable>
        </View>
      </ScrollView>

      {/* Se connecter à un compte existant (ex. après réinstallation). */}
      <BottomSheet
        visible={signInOpen}
        title="Se connecter"
        subtitle="Ton compte est enregistré — retrouve-le avec ton numéro et ton mot de passe."
        onClose={() => setSignInOpen(false)}
      >
        <View style={{ gap: spacing.md }}>
          <TextInput
            value={siPhone}
            onChangeText={(t) => {
              setSiPhone(t);
              setSiError(null);
            }}
            placeholder="+225 07 00 00 00 00"
            placeholderTextColor={colors.textFaint}
            keyboardType="phone-pad"
            style={styles.input}
          />
          <TextInput
            value={siPass}
            onChangeText={(t) => {
              setSiPass(t);
              setSiError(null);
            }}
            placeholder="Mot de passe"
            placeholderTextColor={colors.textFaint}
            secureTextEntry
            autoCapitalize="none"
            style={styles.input}
          />
          {siError ? (
            <Txt variant="small" color={colors.danger}>
              {siError}
            </Txt>
          ) : null}
          <Button label={siBusy ? 'Connexion…' : 'Se connecter'} icon="log-in" onPress={signIn} disabled={siBusy} full />
        </View>
      </BottomSheet>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  maxLength,
  error,
  onLayout,
  autoFocus,
  autoCapitalize = 'sentences',
  secureTextEntry,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'phone-pad' | 'number-pad';
  maxLength?: number;
  error?: string;
  onLayout?: (y: number) => void;
  autoFocus?: boolean;
  autoCapitalize?: 'none' | 'words' | 'sentences' | 'characters';
  secureTextEntry?: boolean;
}) {
  return (
    <View onLayout={(e) => onLayout?.(e.nativeEvent.layout.y)}>
      <Txt variant="label" style={styles.fieldLabel}>
        {label}
      </Txt>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        keyboardType={keyboardType ?? 'default'}
        maxLength={maxLength}
        autoFocus={autoFocus}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        secureTextEntry={secureTextEntry}
        returnKeyType="done"
        style={[styles.input, error ? { borderColor: colors.danger } : null]}
      />
      {error ? (
        <Txt variant="small" color={colors.danger} style={{ marginTop: 4 }}>
          {error}
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  hero: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xxl,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    ...shadows.e2,
  },
  heroTitle: { marginTop: spacing.xl, lineHeight: 38 },
  fieldLabel: { marginTop: spacing.lg },
  authError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
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
    fontSize: font.size.md,
  },
});
