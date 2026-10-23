import Ionicons from '@expo/vector-icons/Ionicons';
import { isAuthPKCECodeVerifierMissingError } from '@supabase/supabase-js';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { Button, Txt } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/store/AppContext';
import { AUTH_ERROR_FALLBACK, frAuthError } from '@/store/helpers';
import { colors, font, radius, spacing } from '@/theme';

// Écran de RÉINITIALISATION du mot de passe (ouvert par le lien reçu par e-mail, deep link
// « padelco://reset-password?code=… »). On échange le code contre une session, puis on laisse
// l’utilisateur saisir un NOUVEAU mot de passe (supabase.auth.updateUser). Sans cet écran, le
// bouton « Mot de passe oublié ? » ne permettait jamais de définir un nouveau mot de passe.
// Deux formats de lien : `?code=` (PKCE — lié à l’appareil ET au navigateur de la demande) et
// `?token_hash=…&type=recovery` (verifyOtp — valable partout, pour le futur modèle d’e-mail).
// Un lien PKCE ouvert AILLEURS (demande sur l’ordinateur, mail ouvert sur le téléphone) n’est pas
// « expiré » : on le dit, et on permet de redemander un lien DEPUIS cet appareil (sinon boucle).
type Status = 'exchanging' | 'ready' | 'elsewhere' | 'error';

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; token_hash?: string; type?: string }>();
  const toast = useToast();
  const { state, refreshSession } = useApp();
  // E-mail du compte réinitialisé : adopté par refreshSession AVANT le passage à « ready »
  // (session.user.email fait foi, cf. AppContext) — sert d’identifiant au trousseau iOS.
  const accountEmail = state.account?.email;
  const code = one(params.code);
  const tokenHash = one(params.type) === 'recovery' ? one(params.token_hash) : undefined;
  // Sans code ni jeton dans le lien → « error » d’emblée (évite un setState synchrone dans l’effet).
  const [status, setStatus] = useState<Status>(code || tokenHash ? 'exchanging' : 'error');
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [hidden, setHidden] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const exchanged = useRef(false);

  useEffect(() => {
    if ((!code && !tokenHash) || exchanged.current) return;
    exchanged.current = true;
    // L'échange BASCULE la session Supabase (potentiellement sur un AUTRE compte — lien d'un
    // proche ouvert sur ce téléphone) : le store l'adopte tout de suite (refreshSession purge
    // le périmètre de l'ancien compte). Sinon, un abandon en cours de flux laissait l'identité
    // affichée A sur une session serveur B — miroirs mélangés au retour au premier plan.
    let done = false;
    const finish = (s: Exclude<Status, 'exchanging'>) => {
      if (!done) {
        done = true;
        setStatus(s);
      }
    };
    // `.catch` + timeout de secours : si l'échange REJETTE (exception, ≠ résolution {error}) ou
    // ne revient jamais (réseau coupé), on ne laisse pas l'utilisateur bloqué sur « Vérification
    // du lien… » dans ce parcours critique — on bascule en « lien invalide/expiré » avec une
    // issue (même filet que auth-callback.tsx).
    const verify = tokenHash
      ? supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
      : supabase.auth.exchangeCodeForSession(code!);
    void verify
      .then(async ({ error }) => {
        if (!error) await refreshSession();
        finish(!error ? 'ready' : isAuthPKCECodeVerifierMissingError(error) ? 'elsewhere' : 'error');
      })
      .catch(() => finish('error'));
    const t = setTimeout(() => finish('error'), 12000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, tokenHash]);

  const submit = async () => {
    if (submitting) return;
    if (pwd.length < 6) {
      toast.show('Mot de passe trop court (6 caractères minimum)', { icon: 'alert-circle' });
      return;
    }
    if (pwd !== pwd2) {
      toast.show('Les deux mots de passe ne correspondent pas', { icon: 'alert-circle' });
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd });
      if (error) {
        // Message PAR CAS via frAuthError : « même mot de passe que l’ancien » (GoTrue 422
        // same_password, refus DÉFINITIF — retaper le même ne changera rien), trop court, réseau ;
        // « lien expiré » ne reste que le repli d’un message inconnu.
        const text = frAuthError(error.message);
        toast.show(text === AUTH_ERROR_FALLBACK ? 'Changement impossible — le lien a peut-être expiré' : text, { icon: 'alert-circle' });
        return;
      }
    } finally {
      setSubmitting(false); // même si updateUser REJETTE (exception) : le bouton ne reste pas figé
    }
    toast.show('Mot de passe mis à jour ✓');
    // La session Supabase est valide (exchangeCodeForSession + updateUser) mais state.account
    // n’est pas encore adopté par le Context → sans ça, le garde racine renvoyait vers
    // /onboarding malgré une session active (comme onConfirm dans _layout.tsx).
    await refreshSession();
    router.replace('/');
  };

  return (
    <Screen title="Nouveau mot de passe" subtitle="Choisis un nouveau mot de passe pour ton compte">
      {status === 'exchanging' ? (
        <Txt variant="muted" style={{ marginTop: spacing.lg }}>
          Vérification du lien…
        </Txt>
      ) : status === 'error' || status === 'elsewhere' ? (
        <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
          <Txt variant="body" color={colors.textMuted}>
            {status === 'elsewhere'
              ? 'Ce lien doit s’ouvrir sur l’appareil et dans le navigateur où tu as demandé la réinitialisation. Ouvre-le là-bas, ou redemande un lien ici : il marchera sur cet appareil.'
              : 'Ce lien de réinitialisation est invalide ou a expiré. Redemande un lien ci-dessous.'}
          </Txt>
          <ResendLink />
          <Button label="Retour à la connexion" variant="ghost" onPress={() => router.replace('/onboarding')} full />
        </View>
      ) : (
        <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
          {accountEmail ? (
            // Identifiant en LECTURE SEULE (textContentType « username ») : sans lui, iOS
            // enregistrait le nouveau mot de passe dans une entrée sans identifiant (ou en
            // double) au lieu de mettre à jour celle de cet e-mail dans le trousseau.
            <View style={styles.accountRow}>
              <Txt variant="muted">Compte :</Txt>
              <TextInput
                value={accountEmail}
                editable={false}
                textContentType="username"
                autoComplete="username"
                accessibilityLabel={`Compte ${accountEmail}`}
                style={styles.accountValue}
              />
            </View>
          ) : null}
          <View style={styles.inputRow}>
            <TextInput
              value={pwd}
              onChangeText={setPwd}
              placeholder="Nouveau mot de passe"
              placeholderTextColor={colors.textMuted}
              secureTextEntry={hidden}
              autoCapitalize="none"
              autoCorrect={false}
              // newPassword : iOS propose un mot de passe fort et met à jour le trousseau.
              textContentType="newPassword"
              autoComplete="new-password"
              accessibilityLabel="Nouveau mot de passe"
              style={styles.inputInner}
            />
            <Pressable
              onPress={() => setHidden((h) => !h)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={hidden ? 'Afficher le mot de passe' : 'Masquer le mot de passe'}
            >
              <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.textMuted} />
            </Pressable>
          </View>
          <TextInput
            value={pwd2}
            onChangeText={setPwd2}
            placeholder="Confirme le mot de passe"
            placeholderTextColor={colors.textMuted}
            secureTextEntry={hidden}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="newPassword"
            autoComplete="new-password"
            accessibilityLabel="Confirme le nouveau mot de passe"
            style={styles.input}
          />
          <View style={{ marginTop: spacing.md }}>
            <Button label={submitting ? 'Enregistrement…' : 'Enregistrer le mot de passe'} onPress={submit} disabled={submitting} full />
          </View>
        </View>
      )}
    </Screen>
  );
}

// Redemande d’un lien de réinitialisation DEPUIS cet appareil (le nouveau lien s’ouvrira ici).
// Même action que « Mot de passe oublié ? » (anti-énumération : aucun indice si l’e-mail n’existe pas).
function ResendLink() {
  const { resetPassword } = useApp();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const send = async () => {
    if (busy) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setMsg({ ok: false, text: 'Saisis ton e-mail pour recevoir un nouveau lien.' });
      return;
    }
    setBusy(true);
    setMsg(null);
    const res = await resetPassword(email);
    setBusy(false);
    setMsg(
      res.ok
        ? { ok: true, text: 'Lien envoyé ! Ouvre-le sur cet appareil (pense aux spams).' }
        : { ok: false, text: res.error ?? 'Envoi impossible — réessaie.' },
    );
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <TextInput
        value={email}
        onChangeText={(t) => {
          setEmail(t);
          setMsg(null);
        }}
        placeholder="ton@email.com"
        placeholderTextColor={colors.textMuted}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="username"
        autoComplete="email"
        returnKeyType="send"
        onSubmitEditing={send}
        accessibilityLabel="Adresse e-mail du compte"
        style={styles.input}
      />
      {msg ? (
        <Txt variant="small" color={msg.ok ? colors.signature : colors.danger}>
          {msg.text}
        </Txt>
      ) : null}
      <Button label={busy ? 'Envoi…' : 'Recevoir un nouveau lien'} icon="mail" onPress={send} disabled={busy} full />
    </View>
  );
}

const styles = {
  accountRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs },
  accountValue: { flex: 1, color: colors.text, fontSize: font.size.sm, padding: 0 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    padding: spacing.md,
    fontSize: 15,
  },
  inputInner: { flex: 1, color: colors.text, padding: spacing.md, fontSize: 15 },
  inputRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingRight: spacing.md,
  },
};
