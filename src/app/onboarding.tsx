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

type FieldKey = 'firstName' | 'lastName' | 'email' | 'phone' | 'password' | 'birth' | 'gender';

// Validation e-mail volontairement simple (présence d'un @ et d'un point) — la vraie
// vérification, c'est le clic sur le lien de confirmation reçu par mail.
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export default function Onboarding() {
  const router = useRouter();
  const { signUpWithEmail, signInWithEmail, signInWithPhone, resetPassword, resendConfirmation } = useApp();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('+225 ');
  const [password, setPassword] = useState('');
  const [birth, setBirth] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [photoUri, setPhotoUri] = useState<string | undefined>(undefined);
  const [lvl, setLvl] = useState(3.0);
  const [referralCode, setReferralCode] = useState(''); // parrainage (facultatif)
  // Erreurs par champ — affichées au tap sur « Créer mon profil » (aucun tap silencieux).
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  // E-mail de confirmation envoyé → on bascule sur l'écran « Vérifie ta boîte mail ».
  const [sentTo, setSentTo] = useState<string | null>(null);
  // Mode « Se connecter » (compte existant). Par e-mail (principal) ou téléphone (hérité).
  const [signInOpen, setSignInOpen] = useState(false);
  const [siMode, setSiMode] = useState<'email' | 'phone'>('email');
  const [siEmail, setSiEmail] = useState('');
  const [siPhone, setSiPhone] = useState('+225 ');
  const [siPass, setSiPass] = useState('');
  const [siBusy, setSiBusy] = useState(false);
  const [siError, setSiError] = useState<string | null>(null);
  const [siInfo, setSiInfo] = useState<string | null>(null); // « lien envoyé » (mot de passe oublié)
  const [resendMsg, setResendMsg] = useState<string | null>(null); // retour du renvoi d'e-mail
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
    if (!isEmail(email)) e.email = 'Adresse e-mail invalide.';
    if (password.length < 6) e.password = 'Mot de passe : 6 caractères minimum.';
    if (phone.replace(/\D/g, '').length < 8) e.phone = 'Numéro invalide — au moins 8 chiffres.';
    if (firstName.trim().length < 2) e.firstName = 'Indique ton prénom (2 lettres minimum).';
    if (lastName.trim().length < 1) e.lastName = 'Indique ton nom.';
    // Date de naissance optionnelle : on ne signale une erreur QUE si elle est mal saisie.
    if (birth.trim().length > 0 && !birthDate) e.birth = 'Date invalide — vérifie le jour, le mois et l’année.';
    if (!gender) e.gender = 'Choisis une option.';
    return e;
  };

  const create = async () => {
    if (busy) return; // garde anti double-tap (évite deux signUp → « déjà un compte »)
    const e = validate();
    setErrors(e);
    setAuthError(null);
    const first = (['email', 'password', 'phone', 'firstName', 'lastName', 'birth', 'gender'] as FieldKey[]).find((k) => e[k]);
    if (first) {
      // Scroll automatique vers le premier champ en erreur.
      scrollRef.current?.scrollTo({ y: Math.max(0, (positions.current[first] ?? 0) - 24), animated: true });
      return;
    }
    setBusy(true);
    const res = await signUpWithEmail(email, password, phone, {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      birthDate: birth.trim() || undefined,
      gender: gender!,
      level: lvl,
      referralCode: referralCode.trim() || undefined,
    });
    setBusy(false);
    if (res.needsConfirm)
      setSentTo(email.trim().toLowerCase()); // → écran « Vérifie ta boîte mail »
    else if (res.ok) router.replace('/');
    else setAuthError(res.error ?? 'Inscription impossible. Réessaie.');
  };

  const signIn = async () => {
    if (siBusy) return; // garde anti double-tap
    const byEmail = siMode === 'email';
    const idOk = byEmail ? isEmail(siEmail) : siPhone.replace(/\D/g, '').length >= 8;
    if (!idOk) {
      setSiError(byEmail ? 'Adresse e-mail invalide.' : 'Numéro invalide.');
      return;
    }
    if (siPass.length < 6) {
      setSiError('Mot de passe : 6 caractères minimum.');
      return;
    }
    setSiBusy(true);
    setSiError(null);
    const res = byEmail ? await signInWithEmail(siEmail, siPass) : await signInWithPhone(siPhone, siPass);
    setSiBusy(false);
    if (res.ok) {
      setSignInOpen(false);
      router.replace('/');
    } else setSiError(res.error ?? 'Connexion impossible.');
  };

  // Mot de passe oublié (mode e-mail) : envoie le lien de réinitialisation à l'e-mail saisi.
  const forgotPassword = async () => {
    if (siBusy) return;
    if (!isEmail(siEmail)) {
      setSiError('Saisis ton e-mail pour recevoir le lien.');
      return;
    }
    setSiBusy(true);
    setSiError(null);
    setSiInfo(null);
    const res = await resetPassword(siEmail);
    setSiBusy(false);
    if (res.ok) setSiInfo('Lien envoyé ! Regarde ta boîte mail (et les spams).');
    else setSiError(res.error ?? 'Envoi impossible. Réessaie.');
  };

  // Renvoyer l'e-mail de confirmation depuis l'écran « Vérifie ta boîte mail ».
  const resend = async () => {
    if (!sentTo) return;
    setResendMsg(null);
    const res = await resendConfirmation(sentTo);
    setResendMsg(res.ok ? 'E-mail renvoyé ✓' : (res.error ?? 'Renvoi impossible — réessaie.'));
  };

  const clearError = (k: FieldKey) => setErrors((cur) => (cur[k] ? { ...cur, [k]: undefined } : cur));

  // Écran « Vérifie ta boîte mail » — après l'envoi du lien de confirmation. Le clic sur
  // le lien rouvre l'app et connecte automatiquement (cf. useEmailConfirmLink).
  if (sentTo) {
    return (
      <View style={styles.root}>
        <LinearGradient colors={gradients.deepGreen} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <Logo size={40} />
        </LinearGradient>
        <View style={[styles.body, { alignItems: 'center' }]}>
          <View style={styles.confirmIcon}>
            <Ionicons name="mail-unread-outline" size={40} color={colors.signature} />
          </View>
          <Txt variant="display" style={{ textAlign: 'center', marginTop: spacing.lg }}>
            Vérifie ta boîte mail
          </Txt>
          <Txt variant="body" color={colors.textMuted} style={{ textAlign: 'center', marginTop: spacing.sm }}>
            On a envoyé un lien de confirmation à{'\n'}
            <Txt variant="body" color={colors.text} style={{ fontWeight: '700' }}>
              {sentTo}
            </Txt>
          </Txt>
          <View style={styles.confirmHint}>
            <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
            <Txt variant="small" color={colors.textMuted} style={{ flex: 1 }}>
              Ouvre-le pour activer ton compte — il te ramènera ici automatiquement. Pense à regarder dans les spams.
            </Txt>
          </View>
          <View style={{ width: '100%', marginTop: spacing.xl, gap: spacing.sm }}>
            <Button
              label="J'ai confirmé — me connecter"
              icon="log-in"
              onPress={() => {
                setSiMode('email');
                setSiEmail(sentTo);
                setSignInOpen(true);
              }}
              full
            />
            <Button label="Renvoyer l'e-mail" icon="refresh" variant="ghost" onPress={resend} full />
            <Button label="Modifier l'adresse" variant="ghost" onPress={() => setSentTo(null)} full />
          </View>
          {resendMsg ? (
            <Txt variant="small" color={colors.signature} style={{ textAlign: 'center', marginTop: spacing.sm }}>
              {resendMsg}
            </Txt>
          ) : null}
        </View>

        {/* Connexion (réutilise la même feuille que l'écran d'inscription). */}
        <SignInSheet
          visible={signInOpen}
          mode={siMode}
          setMode={setSiMode}
          email={siEmail}
          setEmail={setSiEmail}
          phone={siPhone}
          setPhone={setSiPhone}
          pass={siPass}
          setPass={setSiPass}
          busy={siBusy}
          error={siError}
          info={siInfo}
          onClose={() => {
            setSignInOpen(false);
            setSiInfo(null);
          }}
          onSubmit={signIn}
          onForgot={forgotPassword}
          clearError={() => {
            setSiError(null);
            setSiInfo(null);
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: spacing.xxxl }}
      >
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

          {/* E-mail : identifiant de connexion (confirmé par un lien envoyé par mail). */}
          <Field
            label="Adresse e-mail"
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              clearError('email');
            }}
            placeholder="ex. ton.nom@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            error={errors.email}
            onLayout={(y) => {
              positions.current.email = y;
            }}
            autoFocus
          />
          {/* Téléphone : conservé (sans SMS) pour que les clubs puissent joindre les joueurs. */}
          <Field
            label="Numéro de téléphone"
            value={phone}
            onChangeText={(t) => {
              setPhone(t);
              clearError('phone');
            }}
            placeholder="+225 07 00 00 00 00"
            keyboardType="phone-pad"
            autoCapitalize="none"
            error={errors.phone}
            onLayout={(y) => {
              positions.current.phone = y;
            }}
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
            placeholder="Ton prénom"
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
            placeholder="Ton nom"
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
            {/* Clin d'œil pour inciter à l'honnêteté (sinon le terrain s'en charge 😅). */}
            <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.xs, textAlign: 'center' }}>
              Joue franc-jeu 😉 — un « 6 » qui perd 6-0, ça se voit en 2 échanges.
            </Txt>
          </View>

          {/* Parrainage (facultatif) : code d'un ami qui t'a invité. */}
          <Field
            label="Code de parrainage (facultatif)"
            value={referralCode}
            onChangeText={(t) => setReferralCode(t.toUpperCase())}
            placeholder="Ex. A1B2C3D4"
            autoCapitalize="characters"
          />

          {authError ? (
            <View style={styles.authError}>
              <Ionicons name="alert-circle" size={16} color={colors.danger} />
              <Txt variant="small" color={colors.danger} style={{ flex: 1 }}>
                {authError}
              </Txt>
            </View>
          ) : null}

          <View style={{ marginTop: spacing.xl }}>
            <Button label={busy ? 'Création…' : 'Créer mon profil'} icon="checkmark" onPress={create} disabled={busy} full />
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

      {/* Se connecter à un compte existant (par e-mail, ou téléphone pour les comptes hérités). */}
      <SignInSheet
        visible={signInOpen}
        mode={siMode}
        setMode={setSiMode}
        email={siEmail}
        setEmail={setSiEmail}
        phone={siPhone}
        setPhone={setSiPhone}
        pass={siPass}
        setPass={setSiPass}
        busy={siBusy}
        error={siError}
        info={siInfo}
        onClose={() => {
          setSignInOpen(false);
          setSiInfo(null);
        }}
        onSubmit={signIn}
        onForgot={forgotPassword}
        clearError={() => {
          setSiError(null);
          setSiInfo(null);
        }}
      />
    </View>
  );
}

// Feuille de connexion — e-mail (principal) ou téléphone (comptes créés avant l'e-mail).
function SignInSheet({
  visible,
  mode,
  setMode,
  email,
  setEmail,
  phone,
  setPhone,
  pass,
  setPass,
  busy,
  error,
  info,
  onClose,
  onSubmit,
  onForgot,
  clearError,
}: {
  visible: boolean;
  mode: 'email' | 'phone';
  setMode: (m: 'email' | 'phone') => void;
  email: string;
  setEmail: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  pass: string;
  setPass: (v: string) => void;
  busy: boolean;
  error: string | null;
  info: string | null;
  onClose: () => void;
  onSubmit: () => void;
  onForgot: () => void;
  clearError: () => void;
}) {
  const byEmail = mode === 'email';
  return (
    <BottomSheet
      visible={visible}
      title="Se connecter"
      subtitle={
        byEmail ? 'Retrouve ton compte avec ton e-mail et ton mot de passe.' : 'Connexion par numéro (comptes créés avant l’e-mail).'
      }
      onClose={onClose}
    >
      <View style={{ gap: spacing.md }}>
        {byEmail ? (
          <TextInput
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              clearError();
            }}
            placeholder="ton@email.com"
            placeholderTextColor={colors.textFaint}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
        ) : (
          <TextInput
            value={phone}
            onChangeText={(t) => {
              setPhone(t);
              clearError();
            }}
            placeholder="+225 07 00 00 00 00"
            placeholderTextColor={colors.textFaint}
            keyboardType="phone-pad"
            autoCorrect={false}
            textContentType="telephoneNumber"
            style={styles.input}
          />
        )}
        <PasswordInput
          value={pass}
          onChangeText={(t) => {
            setPass(t);
            clearError();
          }}
          placeholder="Mot de passe"
        />
        {error ? (
          <Txt variant="small" color={colors.danger}>
            {error}
          </Txt>
        ) : null}
        {info ? (
          <Txt variant="small" color={colors.signature}>
            {info}
          </Txt>
        ) : null}
        <Button label={busy ? 'Connexion…' : 'Se connecter'} icon="log-in" onPress={onSubmit} disabled={busy} full />
        {/* Mot de passe oublié : seulement pertinent en connexion par e-mail. */}
        {byEmail ? (
          <Pressable onPress={onForgot} disabled={busy} style={{ alignItems: 'center', paddingVertical: spacing.xs }}>
            <Txt variant="small" color={colors.textFaint}>
              Mot de passe oublié ?
            </Txt>
          </Pressable>
        ) : null}
        <Pressable onPress={() => setMode(byEmail ? 'phone' : 'email')} style={{ alignItems: 'center', paddingVertical: spacing.xs }}>
          <Txt variant="small" color={colors.signature}>
            {byEmail ? 'Se connecter par téléphone' : 'Se connecter par e-mail'}
          </Txt>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

// Champ mot de passe avec œil pour révéler/masquer (évite les fautes de frappe invisibles).
// Réutilisé par le formulaire d'inscription et la feuille de connexion.
function PasswordInput({
  value,
  onChangeText,
  placeholder,
  error,
  autoFocus,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  error?: boolean;
  autoFocus?: boolean;
}) {
  const [hidden, setHidden] = useState(true);
  return (
    <View style={styles.pwWrap}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        secureTextEntry={hidden}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
        returnKeyType="done"
        style={[styles.input, styles.pwInput, error ? { borderColor: colors.danger } : null]}
      />
      <Pressable
        onPress={() => setHidden((h) => !h)}
        hitSlop={8}
        style={styles.pwEye}
        accessibilityLabel={hidden ? 'Afficher le mot de passe' : 'Masquer le mot de passe'}
      >
        <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.textMuted} />
      </Pressable>
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
  keyboardType?: 'default' | 'phone-pad' | 'number-pad' | 'email-address';
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
      {secureTextEntry ? (
        <PasswordInput value={value} onChangeText={onChangeText} placeholder={placeholder} error={!!error} autoFocus={autoFocus} />
      ) : (
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
          returnKeyType="done"
          style={[styles.input, error ? { borderColor: colors.danger } : null]}
        />
      )}
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
  confirmIcon: {
    width: 84,
    height: 84,
    borderRadius: radius.pill,
    backgroundColor: colors.signatureSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xxl,
  },
  confirmHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.xl,
  },
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
  pwWrap: { position: 'relative', justifyContent: 'center' },
  pwInput: { paddingRight: 48 }, // place pour l'œil, sans chevaucher le texte
  pwEye: { position: 'absolute', right: spacing.md, height: '100%', justifyContent: 'center' },
});
