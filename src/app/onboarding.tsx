import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Keyboard, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomSheet } from '@/components/BottomSheet';
import { Chip } from '@/components/Chip';
import { Logo } from '@/components/Logo';
import { Stepper } from '@/components/Stepper';
import { useToast } from '@/components/Toast';
import { Button, Card, IconCircle, Txt } from '@/components/ui';
import { type Club } from '@/data/clubs';
import { CLUB_TYPES } from '@/lib/clubConstants';
import { levelLabel, levelText } from '@/lib/format';
import { hapticLight } from '@/lib/haptics';
import { QUIZ_QUESTIONS, levelFromQuiz, type QuizAnswers } from '@/lib/levelQuiz';
import { DEFAULT_DIAL, PHONE_INCOMPLETE, isValidPhone } from '@/lib/phone';
import { clearPendingReferral, getPendingReferral } from '@/lib/pendingReferral';
import { pickImage } from '@/lib/pickImage';
import { REFERRAL_CODE, referralCodeIn } from '@/lib/referralCode';
import { GENDERS, ageFrom, maskBirthDate, parseBirthDate, zodiacFor, type Gender } from '@/lib/zodiac';
import { useApp } from '@/store/AppContext';
import { colors, font, gradients, radius, shadows, spacing } from '@/theme';

// « quiz » n’est pas un champ de saisie : c’est le bloc des 4 questions de niveau. Il entre
// quand même dans FieldKey pour profiter de la mécanique existante (erreur d’étape + scroll
// automatique vers le bloc fautif), exactement comme le champ « sexe ».
type FieldKey = 'firstName' | 'lastName' | 'email' | 'phone' | 'password' | 'birth' | 'gender' | 'quiz';

// Validation e-mail volontairement simple (présence d’un @ et d’un point) — la vraie
// vérification, c’est le clic sur le lien de confirmation reçu par mail.
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

// Âge minimal des CGU (§ Accès au service) : une date de naissance SAISIE qui donne moins de 13 ans
// est refusée (la date reste facultative ; la phrase de consentement fait attester l’âge).
const MIN_AGE = 13;

// Inscription en 3 étapes (Stepper du kit). Chaque étape ne valide QUE ses propres champs
// (cf. goNext) — la liste sert aussi de filet de sécurité pour retrouver l’étape d’un champ.
const STEP_LABELS = ['Compte', 'Profil', 'Parrainage'];
const STEP_FIELDS: FieldKey[][] = [['email', 'phone', 'password'], ['firstName', 'lastName', 'birth', 'gender', 'quiz'], []];
const FIELD_ORDER: FieldKey[] = STEP_FIELDS.flat();

export default function Onboarding() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { signUpWithEmail, signInWithEmail, signInWithPhone, resetPassword, resendConfirmation } = useApp();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState(DEFAULT_DIAL);
  const [password, setPassword] = useState('');
  const [birth, setBirth] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [photoUri, setPhotoUri] = useState<string | undefined>(undefined);
  // Quiz de niveau (v3) : le joueur ne choisit plus son niveau, il répond à 4 questions et
  // l’app en DÉRIVE le niveau de départ (barème pur `levelFromQuiz`, src/lib/levelQuiz.ts).
  // Partial : une question sans réponse reste absente ; les 4 sont exigées pour continuer.
  const [answers, setAnswers] = useState<Partial<QuizAnswers>>({});
  const [referralCode, setReferralCode] = useState(''); // parrainage (facultatif)
  // Étape courante du formulaire (0 = Compte, 1 = Profil, 2 = Parrainage). État global au
  // composant (pas par étape) : le pré-remplissage du parrainage marche quel que soit l’écran.
  const [step, setStep] = useState(0);
  // Chantier 1 — TYPE DE COMPTE choisi en tout premier : joueur ou gérant de club.
  // null = l’écran de choix s’affiche ; ensuite le parcours diffère (le club renseigne
  // en plus les infos de son établissement, validées ensuite par l’opérateur).
  const [accountType, setAccountType] = useState<'player' | 'club' | null>(null);
  // Infos du club (parcours gérant uniquement).
  const [clubName, setClubName] = useState('');
  const [clubArea, setClubArea] = useState('');
  const [clubType, setClubType] = useState<Club['type']>('Extérieur');
  const [clubCourts, setClubCourts] = useState(2);
  const [clubPrice, setClubPrice] = useState('');
  // Code capté via un lien d’invitation (padelconnectci.com/invite/CODE) → pré-remplissage.
  // setState APRÈS await (pas dans le corps de l’effet) pour respecter le React Compiler.
  // On ne l’EFFACE PAS ici : si l’utilisateur quitte sans s’inscrire, le code doit rester
  // disponible pour la prochaine visite (effacé seulement APRÈS un succès, dans create()).
  useEffect(() => {
    let alive = true;
    void getPendingReferral().then((code) => {
      if (alive && code) setReferralCode(code);
    });
    return () => {
      alive = false;
    };
  }, []);
  // Erreurs par champ — affichées au tap sur « Créer mon profil » (aucun tap silencieux).
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  // E-mail de confirmation envoyé → on bascule sur l’écran « Vérifie ta boîte mail ».
  const [sentTo, setSentTo] = useState<string | null>(null);
  // Mode « Se connecter » (compte existant). Par e-mail (principal) ou téléphone (hérité).
  const [signInOpen, setSignInOpen] = useState(false);
  const [siMode, setSiMode] = useState<'email' | 'phone'>('email');
  const [siEmail, setSiEmail] = useState('');
  const [siPhone, setSiPhone] = useState(DEFAULT_DIAL);
  const [siPass, setSiPass] = useState('');
  const [siBusy, setSiBusy] = useState(false);
  const [siError, setSiError] = useState<string | null>(null);
  const [siInfo, setSiInfo] = useState<string | null>(null); // « lien envoyé » (mot de passe oublié)
  const [resendMsg, setResendMsg] = useState<string | null>(null); // retour du renvoi d’e-mail
  const [resending, setResending] = useState(false); // garde anti double-tap
  // Lecture du presse-papiers en cours (« Coller mon code ») : la ref bloque le double-tap,
  // l’état gèle le CTA de création (le code envoyé = le code affiché).
  const [pasting, setPasting] = useState(false);
  const pastingRef = useRef(false);
  // Collage réussi : le bouton « Coller mon code » (qui a le focus) disparaît avec le code
  // valide — on pose alors le focus sur la confirmation qui le remplace (effet ci-dessous).
  // Une ref (pas un state) : la lire/la remettre à false ne doit pas re-déclencher de rendu.
  const pastedRef = useRef(false);
  const referralHintRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);
  const positions = useRef<Partial<Record<FieldKey, number>>>({});
  // Champ à cibler après un changement d’étape déclenché par create() (filet de sécurité) —
  // une ref (pas un state) : sa lecture/écriture ne doit pas re-déclencher de rendu.
  const pendingScroll = useRef<FieldKey | null>(null);

  // Scroll différé vers le champ en erreur après un changement d’étape : il faut d’abord que
  // le nouveau rendu pose les positions des champs de l’étape affichée (onLayout des <Field>).
  useEffect(() => {
    const key = pendingScroll.current;
    if (!key) return;
    pendingScroll.current = null;
    const id = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, (positions.current[key] ?? 0) - 24), animated: true });
    }, 60);
    return () => clearTimeout(id);
  }, [step]);

  // Focus après « Coller mon code » : APRÈS le rendu qui affiche la confirmation (avant, sa
  // ref est vide). Natif : focus du lecteur d’écran (VoiceOver/TalkBack la lit) ; web :
  // `sendAccessibilityEvent` n’existe pas, le focus DOM sur la confirmation la fait lire.
  useEffect(() => {
    if (!pastedRef.current) return;
    pastedRef.current = false;
    const hint = referralHintRef.current;
    if (!hint) return;
    if (Platform.OS === 'web') hint.focus();
    else AccessibilityInfo.sendAccessibilityEvent(hint, 'focus');
  }, [referralCode]);

  const birthDate = parseBirthDate(birth);
  const zodiac = birthDate ? zodiacFor(birthDate) : null;

  // Niveau de départ dérivé du quiz — null tant que les 4 réponses ne sont pas posées (le
  // barème les exige toutes). Déstructuré plutôt que casté : aucune réponse manquante ne peut
  // se glisser dans levelFromQuiz.
  const { frequency, racketSport, competition, selfAssess } = answers;
  const quizLevel =
    frequency && racketSport && competition && selfAssess ? levelFromQuiz({ frequency, racketSport, competition, selfAssess }) : null;

  const choosePhoto = async () => {
    const uri = await pickImage({ square: true });
    if (uri) setPhotoUri(uri);
  };

  const validate = (): Partial<Record<FieldKey, string>> => {
    const e: Partial<Record<FieldKey, string>> = {};
    if (!isEmail(email)) e.email = 'Adresse e-mail invalide.';
    if (password.length < 6) e.password = 'Mot de passe : 6 caractères minimum.';
    if (!isValidPhone(phone)) e.phone = PHONE_INCOMPLETE;
    if (firstName.trim().length < 2) e.firstName = 'Indique ton prénom (2 lettres minimum).';
    if (lastName.trim().length < 1) e.lastName = 'Indique ton nom.';
    // Date de naissance optionnelle : erreur seulement si elle est mal saisie ou sous l’âge minimal.
    if (birth.trim().length > 0 && !birthDate) e.birth = 'Date invalide — vérifie le jour, le mois et l’année.';
    else if (birthDate && ageFrom(birthDate) < MIN_AGE) e.birth = `PadelConnect est réservé aux ${MIN_AGE} ans et plus.`;
    if (!gender) e.gender = 'Choisis une option.';
    // Les 4 questions du quiz sont obligatoires : sans elles, pas de niveau de départ.
    if (quizLevel === null) e.quiz = 'Réponds aux 4 questions pour connaître ton niveau.';
    return e;
  };

  // Valide UNIQUEMENT les champs de l’étape affichée (réutilise validate(), qui calcule les
  // règles pour tous les champs — on ne garde que celles de l’étape courante : les champs des
  // autres étapes ne sont pas visibles ici, inutile de bloquer dessus). Si l’étape est valide,
  // on avance ; à la dernière étape, on déclenche la création du compte.
  const goNext = async () => {
    const keys = STEP_FIELDS[step];
    const e = validate();
    setErrors((cur) => {
      const next = { ...cur };
      keys.forEach((k) => {
        next[k] = e[k];
      });
      return next;
    });
    setAuthError(null);
    const first = keys.find((k) => e[k]);
    if (first) {
      // Scroll automatique vers le premier champ en erreur DE L’ÉTAPE.
      scrollRef.current?.scrollTo({ y: Math.max(0, (positions.current[first] ?? 0) - 24), animated: true });
      return;
    }
    if (step < STEP_LABELS.length - 1) {
      // Les identifiants restent montés (repliés) après l’étape 0 : sans ça, le champ qui avait
      // le focus garderait le clavier ouvert et la frappe partirait dans un champ invisible.
      Keyboard.dismiss();
      setStep((s) => s + 1);
    } else await create();
  };

  const create = async () => {
    if (busy) return; // garde anti double-tap (évite deux signUp → « déjà un compte »)
    const e = validate();
    setErrors(e);
    setAuthError(null);
    const first = FIELD_ORDER.find((k) => e[k]);
    if (first) {
      // Filet de sécurité : chaque étape valide déjà ses propres champs avant de laisser passer
      // à la suivante (goNext) — ce cas ne devrait donc jamais survenir. S’il survient malgré
      // tout (champ redevenu invalide), on ramène l’utilisateur à l’étape concernée plutôt que
      // d’échouer silencieusement.
      const stepIdx = STEP_FIELDS.findIndex((keys) => keys.includes(first));
      if (stepIdx >= 0 && stepIdx !== step) {
        pendingScroll.current = first;
        setStep(stepIdx);
      } else {
        scrollRef.current?.scrollTo({ y: Math.max(0, (positions.current[first] ?? 0) - 24), animated: true });
      }
      return;
    }
    setBusy(true);
    const res = await signUpWithEmail(email, password, phone, {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      birthDate: birth.trim() || undefined,
      gender: gender!,
      level: quizLevel ?? undefined, // jamais null ici (validate() bloque l’étape sans les 4 réponses)
      referralCode: referralCode.trim() || undefined,
      photoUri, // envoyée au stockage à la 1ʳᵉ session (mise de côté d’ici là)
    });
    setBusy(false);
    if (res.needsConfirm) {
      void clearPendingReferral(); // inscription réussie → le code ne sert plus, on le libère
      setSentTo(email.trim().toLowerCase()); // → écran « Vérifie ta boîte mail »
    } else if (res.ok) {
      void clearPendingReferral();
      router.replace('/');
    } else setAuthError(res.error ?? 'Inscription impossible. Réessaie.');
  };

  // Création d’un compte CLUB (Chantier 1) : mêmes identifiants (e-mail + mot de passe +
  // téléphone) + les infos de l’établissement. Le serveur crée d’office la demande
  // d’inscription du club, que l’opérateur validera avant d’ouvrir l’Espace Club.
  const createClub = async () => {
    if (busy) return;
    const e: Partial<Record<FieldKey, string>> = {};
    if (!isEmail(email)) e.email = 'Adresse e-mail invalide.';
    if (password.length < 6) e.password = 'Mot de passe : 6 caractères minimum.';
    if (!isValidPhone(phone)) e.phone = PHONE_INCOMPLETE;
    if (firstName.trim().length < 2) e.firstName = 'Indique ton prénom (2 lettres minimum).';
    if (lastName.trim().length < 1) e.lastName = 'Indique ton nom.';
    setErrors(e);
    setAuthError(null);
    // Nom + quartier du club obligatoires (message global : ils n’ont pas de champ FieldKey).
    if (Object.keys(e).length > 0) {
      const first = FIELD_ORDER.find((k) => e[k]);
      if (first) scrollRef.current?.scrollTo({ y: Math.max(0, (positions.current[first] ?? 0) - 24), animated: true });
      return;
    }
    if (clubName.trim().length < 2 || clubArea.trim().length < 2) {
      setAuthError('Indique le nom et le quartier de ton club.');
      return;
    }
    setBusy(true);
    const res = await signUpWithEmail(email, password, phone, {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      accountType: 'club',
      club: {
        name: clubName.trim(),
        area: clubArea.trim(),
        type: clubType,
        courts: clubCourts,
        priceFrom: Number(clubPrice.replace(/\D/g, '')) || undefined,
      },
    });
    setBusy(false);
    if (res.needsConfirm) setSentTo(email.trim().toLowerCase());
    else if (res.ok) router.replace('/');
    else setAuthError(res.error ?? 'Inscription impossible. Réessaie.');
  };

  const signIn = async () => {
    if (siBusy) return; // garde anti double-tap
    const byEmail = siMode === 'email';
    const idOk = byEmail ? isEmail(siEmail) : isValidPhone(siPhone);
    if (!idOk) {
      setSiError(byEmail ? 'Adresse e-mail invalide.' : PHONE_INCOMPLETE);
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
    } else if (byEmail && 'unconfirmed' in res && res.unconfirmed) {
      // E-mail jamais confirmé (lien non ouvert ou expiré) : plutôt qu’un cul-de-sac, l’écran
      // « Vérifie ta boîte mail » et son bouton « Renvoyer l’e-mail » pour cette adresse.
      setSignInOpen(false);
      setResendMsg('Ton adresse n’est pas encore confirmée — ouvre le lien reçu ou renvoie-le.');
      setSentTo(siEmail.trim().toLowerCase());
    } else setSiError(res.error ?? 'Connexion impossible.');
  };

  // Mot de passe oublié (mode e-mail) : envoie le lien de réinitialisation à l’e-mail saisi.
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

  // Renvoyer l’e-mail de confirmation depuis l’écran « Vérifie ta boîte mail ».
  const resend = async () => {
    if (!sentTo || resending) return; // garde anti double-tap
    setResending(true);
    setResendMsg(null);
    const res = await resendConfirmation(sentTo);
    setResending(false);
    setResendMsg(res.ok ? 'E-mail renvoyé ✓' : (res.error ?? 'Renvoi impossible — réessaie.'));
  };

  // « Coller mon code » (parrainage) : le presse-papiers n’est lu QU’AU TAP — jamais à
  // l’ouverture de l’écran (iOS affiche alors sa demande d’autorisation de coller).
  const pasteCode = async () => {
    if (pastingRef.current || busy) return;
    // Le collage REMPLACE la saisie : on ferme le clavier, sinon le toast d’échec (ancré en
    // bas, il ne suit pas le clavier) resterait caché dessous.
    Keyboard.dismiss();
    pastingRef.current = true;
    setPasting(true);
    let text: string | null = null;
    try {
      text = await Clipboard.getStringAsync();
    } catch {
      text = null; // lecture refusée (web) ou indisponible
    }
    pastingRef.current = false;
    setPasting(false);
    if (text === null) {
      toast.show('Impossible de lire le presse-papiers — tape ton code', { icon: 'alert-circle' });
      return;
    }
    // iOS 16+ : refuser la demande « Autoriser le collage » renvoie une chaîne VIDE (pas une
    // exception) — indiscernable d’un presse-papiers vide, d’où un message qui couvre les deux.
    if (text.trim() === '') {
      toast.show('Presse-papiers vide ou accès refusé — tape ton code', { icon: 'alert-circle' });
      return;
    }
    const code = referralCodeIn(text);
    if (!code) {
      toast.show('Aucun code dans le presse-papiers — copie-le depuis le lien de ton ami', { icon: 'alert-circle' });
      return;
    }
    hapticLight();
    // Succès annoncé aux lecteurs d’écran (le retour visuel seul — confirmation verte — leur
    // échappait) ; le focus suit sur cette confirmation (effet sur referralCode).
    AccessibilityInfo.announceForAccessibility('Code de parrainage collé');
    pastedRef.current = true;
    setReferralCode(code);
  };

  const clearError = (k: FieldKey) => {
    setErrors((cur) => (cur[k] ? { ...cur, [k]: undefined } : cur));
    // On efface aussi le bandeau d’erreur GLOBAL dès que l’utilisateur corrige un champ, sinon
    // il resterait affiché (« e-mail déjà utilisé »…) alors que la saisie a changé.
    setAuthError((cur) => (cur ? null : cur));
  };

  // Écran « Vérifie ta boîte mail » — après l’envoi du lien de confirmation. Le clic sur
  // le lien rouvre l’app et connecte automatiquement (cf. useEmailConfirmLink).
  if (sentTo) {
    return (
      <View style={styles.root}>
        <LinearGradient
          colors={gradients.deepGreen}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + spacing.xl }]}
        >
          <Logo size={40} tone="light" />
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
          {/* Clin d’œil parrainage : le code a accompagné l’inscription (le serveur ne relie qu’un code
              existant — on n’annonce donc pas un lien qu’on ne peut pas garantir). */}
          {referralCode.trim().length > 0 ? (
            <Txt variant="small" color={colors.signature} style={{ textAlign: 'center', marginTop: spacing.sm }}>
              Code de parrainage transmis avec ton inscription 🎾
            </Txt>
          ) : null}
          <View style={styles.confirmHint}>
            <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
            <Txt variant="small" color={colors.textMuted} style={{ flex: 1 }}>
              Ouvre-le pour activer ton compte — il te ramènera ici automatiquement. Pense à regarder dans les spams.
            </Txt>
          </View>
          <View style={{ width: '100%', marginTop: spacing.xl, gap: spacing.sm }}>
            <Button
              label="J’ai confirmé — me connecter"
              icon="log-in"
              onPress={() => {
                setSiMode('email');
                setSiEmail(sentTo);
                setSignInOpen(true);
              }}
              full
            />
            {/* Secondaire (pas ghost) : c'est LE geste de secours quand le mail n'arrive pas. */}
            <Button
              label={resending ? 'Envoi…' : 'Renvoyer l’e-mail'}
              icon="refresh"
              variant="secondary"
              onPress={resend}
              disabled={resending}
              full
            />
            <Button label="Modifier l’adresse" variant="ghost" onPress={() => setSentTo(null)} full />
          </View>
          {resendMsg ? (
            <Txt variant="small" color={colors.signature} style={{ textAlign: 'center', marginTop: spacing.sm }}>
              {resendMsg}
            </Txt>
          ) : null}
        </View>

        {/* Connexion (réutilise la même feuille que l’écran d’inscription). */}
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

  // ── Écran de CHOIX DU TYPE DE COMPTE (tout premier écran, Chantier 1) ──────────
  if (accountType === null) {
    return (
      <View style={styles.root}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
          <LinearGradient
            colors={gradients.deepGreen}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.hero, { paddingTop: insets.top + spacing.xl }]}
          >
            <Logo size={40} tone="light" />
            <Txt variant="display" color={colors.onSignature} style={styles.heroTitle}>
              Bienvenue sur PadelConnect
            </Txt>
            <Txt variant="body" color={colors.onSignature} style={{ marginTop: spacing.sm, opacity: 0.85 }}>
              Dis-nous qui tu es pour commencer.
            </Txt>
          </LinearGradient>
          <View style={styles.body}>
            <Card onPress={() => setAccountType('player')} style={styles.roleCard}>
              <IconCircle icon="tennisball" color={colors.signature} bg={colors.signatureSoft} size={52} />
              <View style={{ flex: 1 }}>
                <Txt variant="h3">Je suis un joueur</Txt>
                <Txt variant="muted">Réserve un terrain, rejoins des matchs et des tournois.</Txt>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </Card>
            <Card onPress={() => setAccountType('club')} style={styles.roleCard}>
              <IconCircle icon="business" color={colors.amberDark} bg={colors.amberSoft} size={52} />
              <View style={{ flex: 1 }}>
                <Txt variant="h3">Je gère un club</Txt>
                <Txt variant="muted">Référence ton club et gère tes réservations. Ton club est validé par PadelConnect.</Txt>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </Card>
            <Pressable
              onPress={() => setSignInOpen(true)}
              style={{ marginTop: spacing.lg, alignItems: 'center' }}
              accessibilityRole="button"
              accessibilityLabel="Se connecter"
              hitSlop={8}
            >
              <Txt variant="small" color={colors.textFaint} style={{ textAlign: 'center' }}>
                Tu as déjà un compte ?{' '}
                <Txt variant="small" color={colors.signature}>
                  Se connecter →
                </Txt>
              </Txt>
            </Pressable>
          </View>
        </ScrollView>
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

  // ── Parcours GÉRANT DE CLUB (Chantier 1) : identifiants + infos de l’établissement ──
  if (accountType === 'club') {
    return (
      <View style={styles.root}>
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: spacing.xxxl }}
        >
          <LinearGradient
            colors={gradients.deepGreen}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.hero, { paddingTop: insets.top + spacing.xl }]}
          >
            <Logo size={40} tone="light" />
            <Txt variant="display" color={colors.onSignature} style={styles.heroTitle}>
              Inscris ton club
            </Txt>
            <Txt variant="body" color={colors.onSignature} style={{ marginTop: spacing.sm, opacity: 0.85 }}>
              Crée ton accès gérant. PadelConnect valide ton club, puis tu gères tout depuis l’app ou l’ordinateur.
            </Txt>
          </LinearGradient>

          <View style={styles.body}>
            <Txt variant="label" style={{ marginTop: 0 }}>
              TON ACCÈS GÉRANT
            </Txt>
            <Field
              label="Adresse e-mail"
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                clearError('email');
              }}
              placeholder="ex. contact@ton-club.com"
              keyboardType="email-address"
              autoCapitalize="none"
              error={errors.email}
              onLayout={(y) => {
                positions.current.email = y;
              }}
            />
            <Field
              label="Numéro de téléphone (WhatsApp de préférence)"
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
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Field
                  label="Prénom (contact)"
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
              </View>
              <View style={{ flex: 1 }}>
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
              </View>
            </View>

            <Txt variant="label" style={{ marginTop: spacing.xl }}>
              TON CLUB
            </Txt>
            <Field
              label="Nom du club"
              value={clubName}
              onChangeText={setClubName}
              placeholder="ex. Padel Club Cocody"
              autoCapitalize="words"
            />
            <Field label="Quartier / commune" value={clubArea} onChangeText={setClubArea} placeholder="ex. Cocody" autoCapitalize="words" />
            <Txt variant="label" style={styles.fieldLabel}>
              Type de terrains
            </Txt>
            <View style={styles.genderRow}>
              {CLUB_TYPES.map((t) => (
                <Chip key={t} label={t} active={clubType === t} onPress={() => setClubType(t)} size="lg" />
              ))}
            </View>
            <Txt variant="label" style={styles.fieldLabel}>
              Nombre de terrains
            </Txt>
            <View style={styles.genderRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Chip key={n} label={`${n}`} active={clubCourts === n} onPress={() => setClubCourts(n)} size="lg" />
              ))}
            </View>
            <Field
              label="Tarif indicatif d’une session 1h30 (FCFA — optionnel)"
              value={clubPrice}
              onChangeText={setClubPrice}
              placeholder="ex. 15000"
              keyboardType="number-pad"
            />

            <View style={styles.confirmHint}>
              <Ionicons name="shield-checkmark-outline" size={16} color={colors.signature} />
              <Txt variant="small" color={colors.textMuted} style={{ flex: 1 }}>
                PadelConnect vérifie chaque club avant de l’activer. Tu recevras l’accès à ton Espace Club dès la validation.
              </Txt>
            </View>

            {authError ? (
              <View style={styles.authError}>
                <Ionicons name="alert-circle" size={16} color={colors.danger} />
                {/* coralDark sur dangerSoft : contraste AA (le corail « plein » n’y atteint que 4,15:1) */}
                <Txt variant="small" color={colors.coralDark} style={{ flex: 1 }}>
                  {authError}
                </Txt>
              </View>
            ) : null}

            <View style={styles.stepNav}>
              <Button label="Retour" icon="arrow-back" variant="ghost" onPress={() => setAccountType(null)} disabled={busy} />
              <View style={{ flex: 1 }}>
                <Button label={busy ? 'Création…' : 'Créer mon compte club'} icon="checkmark" onPress={createClub} disabled={busy} full />
              </View>
            </View>
            <LegalConsent onPress={() => router.push('/legal')} />

            <Pressable
              onPress={() => setSignInOpen(true)}
              style={{ marginTop: spacing.lg, alignItems: 'center' }}
              accessibilityRole="button"
              accessibilityLabel="Se connecter"
              hitSlop={8}
            >
              <Txt variant="small" color={colors.textFaint} style={{ textAlign: 'center' }}>
                Tu as déjà un compte ?{' '}
                <Txt variant="small" color={colors.signature}>
                  Se connecter →
                </Txt>
              </Txt>
            </Pressable>
          </View>
        </ScrollView>
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
        <LinearGradient
          colors={gradients.deepGreen}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + spacing.xl }]}
        >
          <Logo size={40} tone="light" />
          <Txt variant="display" color={colors.onSignature} style={styles.heroTitle}>
            Réserve ton terrain à Abidjan
          </Txt>
          {/* Preuves de confiance : rassurent AVANT de demander e-mail + téléphone. */}
          <View style={styles.heroProofs}>
            {(
              [
                { icon: 'business', text: 'Les meilleurs clubs d’Abidjan, en un seul endroit' },
                { icon: 'checkmark-circle', text: 'Chaque réservation confirmée par le club' },
                { icon: 'shield-checkmark', text: 'Gratuit — tu règles ton terrain au club, comme d’habitude' },
              ] as const
            ).map((p) => (
              <View key={p.icon} style={styles.heroProofRow}>
                <Ionicons name={p.icon} size={15} color={colors.onSignature} style={{ opacity: 0.85 }} />
                <Txt variant="small" color={colors.onSignature} style={{ flex: 1, opacity: 0.85 }}>
                  {p.text}
                </Txt>
              </View>
            ))}
          </View>
        </LinearGradient>

        <View style={styles.body}>
          {/* Progression « Compte / Profil / Parrainage » — purement visuelle (kit Stepper). */}
          <Stepper steps={STEP_LABELS} current={step} />

          {/* Identifiants (étape 0) REPLIÉS, pas démontés, aux étapes suivantes : iOS (trousseau,
              webcredentials) et Android (Autofill) proposent « Enregistrer le mot de passe ? » dès
              que l’e-mail et le mot de passe QUITTENT l’écran. Démontés au passage à l’étape 2, ils
              déclenchaient la proposition AVANT que le compte existe (création encore refusable :
              e-mail déjà pris, réseau…). Repliés, ils ne partent qu’avec le formulaire, une fois le
              compte créé. Web : démontés comme avant (un champ replié resterait atteignable au clavier). */}
          {step === 0 || Platform.OS !== 'web' ? (
            <>
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
                offstage={step !== 0}
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
                offstage={step !== 0}
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
                offstage={step !== 0}
              />
            </>
          ) : null}
          {step === 1 ? (
            <>
              <View style={{ alignItems: 'center' }}>
                <Pressable
                  onPress={choosePhoto}
                  style={styles.avatar}
                  accessibilityRole="button"
                  accessibilityLabel={photoUri ? 'Changer la photo de profil' : 'Ajouter une photo de profil'}
                >
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

              {/* Petit clin d’œil astro dès que la date est valide ✨ */}
              {zodiac && birthDate ? (
                <View style={styles.zodiac}>
                  <Txt variant="h2">{zodiac.emoji}</Txt>
                  <View style={{ flex: 1 }}>
                    <Txt variant="body" style={{ fontWeight: '700' }} color={colors.purpleDark}>
                      {zodiac.name} · {ageFrom(birthDate)} ans
                    </Txt>
                    <Txt variant="small" color={colors.textMuted}>
                      {zodiac.message}
                    </Txt>
                  </View>
                </View>
              ) : birth.length === 10 ? (
                <Txt variant="small" color={colors.danger} style={{ marginTop: spacing.sm }}>
                  Cette date n’existe pas — vérifie le jour et le mois.
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

              {/* Quiz de niveau : 4 questions à la place du choix libre — un niveau DÉRIVÉ est
                  plus juste qu’un niveau déclaré (les « 6 » fantaisistes se voyaient en deux
                  échanges). Une seule réponse par question ; le bloc entier porte l’erreur. */}
              <View
                onLayout={(e) => {
                  positions.current.quiz = e.nativeEvent.layout.y;
                }}
              >
                <Txt variant="label" style={styles.fieldLabel}>
                  Ton niveau de jeu
                </Txt>
                <Txt variant="small" color={colors.textMuted} style={{ marginTop: spacing.xs }}>
                  4 questions rapides — on calcule ton niveau de départ pour t’associer aux bons joueurs.
                </Txt>
                {QUIZ_QUESTIONS.map((q) => (
                  <View key={q.key} style={{ marginTop: spacing.lg }}>
                    <Txt variant="body" style={{ fontWeight: '700' }}>
                      {q.title}
                    </Txt>
                    <Txt variant="small" color={colors.textFaint} style={{ marginTop: 2 }}>
                      {q.help}
                    </Txt>
                    <View style={styles.genderRow}>
                      {q.options.map((o) => (
                        <Chip
                          key={o.value}
                          label={o.label}
                          active={answers[q.key] === o.value}
                          onPress={() => {
                            setAnswers((cur) => ({ ...cur, [q.key]: o.value }));
                            clearError('quiz');
                          }}
                          size="lg"
                        />
                      ))}
                    </View>
                  </View>
                ))}
                {quizLevel !== null ? (
                  <View style={styles.levelBox}>
                    <Txt variant="small" color={colors.textMuted}>
                      Ton niveau de départ
                    </Txt>
                    <Txt variant="display" color={colors.signature} style={{ fontSize: 32 }}>
                      {levelText(quizLevel)}
                    </Txt>
                    <Txt variant="small" color={colors.textMuted} style={{ marginTop: spacing.xs }}>
                      {levelLabel(quizLevel)}
                    </Txt>
                    {/* Clin d’œil pour inciter à l’honnêteté (sinon le terrain s’en charge 😅). */}
                    <Txt variant="small" color={colors.textFaint} style={styles.levelHint}>
                      Réponds franc-jeu 😉 — un « 6 » qui perd 6-0, ça se voit en 2 échanges. Ton niveau s’ajustera tout seul avec tes
                      matchs et tes tournois.
                    </Txt>
                  </View>
                ) : null}
                {errors.quiz ? (
                  <Txt variant="small" color={colors.danger} style={{ marginTop: spacing.sm }}>
                    {errors.quiz}
                  </Txt>
                ) : null}
              </View>
            </>
          ) : step === 2 ? (
            <>
              {/* Parrainage (facultatif) : code d’un ami qui t’a invité. */}
              <Field
                label="Code de parrainage (facultatif)"
                value={referralCode}
                onChangeText={(t) => setReferralCode(t.toUpperCase())}
                placeholder="Ex. A1B2C3D4E5F6"
                autoCapitalize="characters"
              />
              {/* Lien d’invitation ouvert SANS l’app (App Store) : le code est perdu à l’installation.
                  Le filleul l’a copié depuis la page d’invitation → un tap le colle. Masqué dès
                  qu’un code valide est en place (pré-rempli par le lien ou déjà collé). */}
              {!REFERRAL_CODE.test(referralCode.trim()) ? (
                <View style={styles.pasteRow}>
                  <Button
                    label={pasting ? 'Lecture…' : 'Coller mon code'}
                    icon="clipboard-outline"
                    variant="secondary"
                    onPress={pasteCode}
                    disabled={busy || pasting}
                    accessibilityLabel="Coller mon code de parrainage depuis le presse-papiers"
                  />
                </View>
              ) : null}
              {/* Retour immédiat sur le code saisi/pré-rempli : sans lui, la saisie était muette
                  (un code mal tapé passait inaperçu, un lien d’invitation semblait ignoré). */}
              {referralCode.trim().length > 0 ? (
                REFERRAL_CODE.test(referralCode.trim()) ? (
                  // Cible du focus après « Coller mon code » (cf. pasteCode) : focalisable par le
                  // code seulement sur le web (tabIndex -1, jamais un arrêt de tabulation).
                  <View ref={referralHintRef} style={styles.referralHint} accessible tabIndex={Platform.OS === 'web' ? -1 : undefined}>
                    <Ionicons name="checkmark-circle" size={14} color={colors.green} />
                    <Txt variant="small" color={colors.signature}>
                      Code au bon format — il sera relié à ton ami s’il existe
                    </Txt>
                  </View>
                ) : (
                  <View style={styles.referralHint}>
                    <Ionicons name="information-circle-outline" size={14} color={colors.amberDark} />
                    <Txt variant="small" color={colors.amberDark}>
                      Un code fait 12 caractères (lettres et chiffres) — vérifie-le
                    </Txt>
                  </View>
                )
              ) : null}

              {authError ? (
                <View style={styles.authError}>
                  <Ionicons name="alert-circle" size={16} color={colors.danger} />
                  <Txt variant="small" color={colors.coralDark} style={{ flex: 1 }}>
                    {authError}
                  </Txt>
                </View>
              ) : null}
            </>
          ) : null}

          {/* Navigation entre étapes : « Retour » (sauf à la 1ʳᵉ) + CTA principal — valide
              l’étape affichée puis avance (ou crée le compte à la dernière étape). */}
          <View style={styles.stepNav}>
            {step > 0 ? (
              <Button label="Retour" icon="arrow-back" variant="ghost" onPress={() => setStep((s) => s - 1)} disabled={busy} />
            ) : null}
            <View style={{ flex: 1 }}>
              <Button
                label={step === STEP_LABELS.length - 1 ? (busy ? 'Création…' : 'Créer mon profil') : 'Continuer'}
                icon={step === STEP_LABELS.length - 1 ? 'checkmark' : 'arrow-forward'}
                onPress={goNext}
                disabled={busy || pasting}
                full
              />
            </View>
          </View>

          {/* Mode « Se connecter » : accessible depuis TOUTES les étapes. */}
          <Pressable
            onPress={() => setSignInOpen(true)}
            style={{ marginTop: spacing.lg, alignItems: 'center' }}
            accessibilityRole="button"
            accessibilityLabel="Se connecter"
            hitSlop={8}
          >
            <Txt variant="small" color={colors.textFaint} style={{ textAlign: 'center' }}>
              Tu as déjà un compte ?{' '}
              <Txt variant="small" color={colors.signature}>
                Se connecter →
              </Txt>
            </Txt>
          </Pressable>

          {step === 0 ? (
            <>
              {/* C-S2 : lien discret vers /decouvrir pour les débutants */}
              <Pressable
                onPress={() => router.push('/decouvrir')}
                style={{ marginTop: spacing.lg, alignItems: 'center' }}
                accessibilityRole="button"
                accessibilityLabel="Découvrir les règles du padel"
                hitSlop={8}
              >
                <Txt variant="small" color={colors.textFaint} style={{ textAlign: 'center' }}>
                  Nouveau au padel ?{' '}
                  <Txt variant="small" color={colors.signature}>
                    Découvrir les règles →
                  </Txt>
                </Txt>
              </Pressable>

              <LegalConsent onPress={() => router.push('/legal')} />
            </>
          ) : null}
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

// Feuille de connexion — e-mail (principal) ou téléphone (comptes créés avant l’e-mail).
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
            placeholderTextColor={colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            // « username » (et non emailAddress) : iOS associe ce champ au mot de passe et propose
            // l’identifiant enregistré dans le trousseau (remplissage automatique).
            textContentType="username"
            autoComplete="email"
            accessibilityLabel="Adresse e-mail"
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
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            autoCorrect={false}
            textContentType="telephoneNumber"
            autoComplete="tel"
            accessibilityLabel="Numéro de téléphone"
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
          onSubmitEditing={onSubmit} // signIn garde déjà le double envoi (siBusy)
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
          <Pressable
            onPress={onForgot}
            disabled={busy}
            style={{ alignItems: 'center', paddingVertical: spacing.xs }}
            accessibilityRole="button"
            accessibilityLabel="Mot de passe oublié"
            hitSlop={8}
          >
            <Txt variant="small" color={colors.textFaint}>
              Mot de passe oublié ?
            </Txt>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => {
            clearError(); // efface l’erreur/l’info du mode quitté (sinon message obsolète affiché)
            setMode(byEmail ? 'phone' : 'email');
          }}
          style={{ alignItems: 'center', paddingVertical: spacing.xs }}
          accessibilityRole="button"
          accessibilityLabel={byEmail ? 'Se connecter par téléphone' : 'Se connecter par e-mail'}
          hitSlop={8}
        >
          <Txt variant="small" color={colors.signature}>
            {byEmail ? 'Se connecter par téléphone' : 'Se connecter par e-mail'}
          </Txt>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

// Champ mot de passe avec œil pour révéler/masquer (évite les fautes de frappe invisibles).
// Réutilisé par le formulaire d’inscription et la feuille de connexion. `newPassword` (inscription) :
// iOS propose un mot de passe fort et l’enregistre dans le trousseau ; sinon il remplit l’existant
// (jetons `new-password` / `current-password` : « password » seul n’est pas un jeton HTML valide
// pour les gestionnaires de mots de passe du web). `onSubmitEditing` : Entrée valide (connexion).
function PasswordInput({
  value,
  onChangeText,
  placeholder,
  error,
  autoFocus,
  newPassword,
  onSubmitEditing,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  error?: boolean;
  autoFocus?: boolean;
  newPassword?: boolean;
  onSubmitEditing?: () => void;
}) {
  const [hidden, setHidden] = useState(true);
  return (
    <View style={styles.pwWrap}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        secureTextEntry={hidden}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
        returnKeyType={onSubmitEditing ? 'go' : 'done'}
        onSubmitEditing={onSubmitEditing}
        textContentType={newPassword ? 'newPassword' : 'password'}
        autoComplete={newPassword ? 'new-password' : 'current-password'}
        accessibilityLabel={placeholder}
        style={[styles.input, styles.pwInput, error ? { borderColor: colors.danger } : null]}
      />
      <Pressable
        onPress={() => setHidden((h) => !h)}
        hitSlop={12}
        style={styles.pwEye}
        accessibilityRole="button"
        accessibilityLabel={hidden ? 'Afficher le mot de passe' : 'Masquer le mot de passe'}
      >
        <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

// Consentement à l’inscription (joueur ET club) : l’utilisateur atteste son âge minimal (CGU) et
// accepte les CGU ; le lien ouvre les textes complets.
function LegalConsent({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{ marginTop: spacing.md }}
      accessibilityRole="button"
      accessibilityLabel="Lire nos CGU et notre politique de confidentialité"
      hitSlop={8}
    >
      <Txt variant="small" color={colors.textFaint} style={{ textAlign: 'center' }}>
        En continuant, tu confirmes avoir {MIN_AGE} ans ou plus et tu acceptes nos{' '}
        <Txt variant="small" color={colors.signature}>
          CGU & confidentialité
        </Txt>
        .
      </Txt>
    </Pressable>
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
  offstage,
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
  // Replié (identifiants hors de l’étape 0) : monté mais sans hauteur, ni visible ni touchable,
  // masqué aux lecteurs d’écran.
  offstage?: boolean;
}) {
  return (
    <View onLayout={(e) => onLayout?.(e.nativeEvent.layout.y)} style={offstage ? styles.offstage : undefined} aria-hidden={offstage}>
      <Txt variant="label" style={styles.fieldLabel}>
        {label}
      </Txt>
      {secureTextEntry ? (
        // Field ne sert qu’aux formulaires d’INSCRIPTION : son mot de passe est toujours un nouveau.
        <PasswordInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          error={!!error}
          autoFocus={autoFocus}
          newPassword
        />
      ) : (
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          keyboardType={keyboardType ?? 'default'}
          maxLength={maxLength}
          autoFocus={autoFocus}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          returnKeyType="done"
          // E-mail = identifiant du compte → « username » : iOS l’enregistre avec le nouveau mot de passe.
          textContentType={keyboardType === 'email-address' ? 'username' : keyboardType === 'phone-pad' ? 'telephoneNumber' : undefined}
          autoComplete={keyboardType === 'email-address' ? 'email' : keyboardType === 'phone-pad' ? 'tel' : undefined}
          accessibilityLabel={label}
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
  // Plafond de largeur (comme Screen.tsx) : sur iPad, le formulaire ne s’étire pas sur
  // toute la largeur — il reste lisible, centré, colonne de 640 pt max.
  root: { flex: 1, backgroundColor: colors.bg, width: '100%', maxWidth: 640, alignSelf: 'center' },
  // paddingTop posé au rendu (zone sûre + 24) : le haut du héros ne passe plus sous l’encoche.
  hero: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    ...shadows.e2,
  },
  heroTitle: { marginTop: spacing.xl, lineHeight: 38 },
  heroProofs: { marginTop: spacing.lg, gap: spacing.sm },
  heroProofRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
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
  // overflow hidden : le contenu est rogné à la hauteur nulle (rendu ET toucher).
  offstage: { height: 0, overflow: 'hidden' },
  roleCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  stepNav: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', marginTop: spacing.xl },
  referralHint: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.xs },
  pasteRow: { flexDirection: 'row', marginTop: spacing.sm },
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
    marginTop: spacing.lg,
  },
  levelHint: { marginTop: spacing.sm, textAlign: 'center', paddingHorizontal: spacing.md },
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
  pwInput: { paddingRight: 48 }, // place pour l’œil, sans chevaucher le texte
  pwEye: { position: 'absolute', right: spacing.md, height: '100%', justifyContent: 'center' },
});
