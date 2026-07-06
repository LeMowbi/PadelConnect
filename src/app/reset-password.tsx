import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { Button, Txt } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing } from '@/theme';

// Écran de RÉINITIALISATION du mot de passe (ouvert par le lien reçu par e-mail, deep link
// « padelco://reset-password?code=… »). On échange le code contre une session, puis on laisse
// l’utilisateur saisir un NOUVEAU mot de passe (supabase.auth.updateUser). Sans cet écran, le
// bouton « Mot de passe oublié ? » ne permettait jamais de définir un nouveau mot de passe.
export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string }>();
  const toast = useToast();
  const { refreshSession } = useApp();
  const code = Array.isArray(params.code) ? params.code[0] : params.code;
  // Sans code dans le lien → « error » d’emblée (évite un setState synchrone dans l’effet).
  const [status, setStatus] = useState<'exchanging' | 'ready' | 'error'>(code ? 'exchanging' : 'error');
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [hidden, setHidden] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const exchanged = useRef(false);

  useEffect(() => {
    if (!code || exchanged.current) return;
    exchanged.current = true;
    // L'échange BASCULE la session Supabase (potentiellement sur un AUTRE compte — lien d'un
    // proche ouvert sur ce téléphone) : le store l'adopte tout de suite (refreshSession purge
    // le périmètre de l'ancien compte). Sinon, un abandon en cours de flux laissait l'identité
    // affichée A sur une session serveur B — miroirs mélangés au retour au premier plan.
    let done = false;
    const finish = (s: 'ready' | 'error') => {
      if (!done) {
        done = true;
        setStatus(s);
      }
    };
    // `.catch` + timeout de secours : si l'échange REJETTE (exception, ≠ résolution {error}) ou
    // ne revient jamais (réseau coupé), on ne laisse pas l'utilisateur bloqué sur « Vérification
    // du lien… » dans ce parcours critique — on bascule en « lien invalide/expiré » avec une
    // issue (même filet que auth-callback.tsx).
    void supabase.auth
      .exchangeCodeForSession(code)
      .then(async ({ error }) => {
        if (!error) await refreshSession();
        finish(error ? 'error' : 'ready');
      })
      .catch(() => finish('error'));
    const t = setTimeout(() => finish('error'), 12000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

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
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setSubmitting(false);
    if (error) {
      toast.show('Changement impossible — le lien a peut-être expiré', { icon: 'alert-circle' });
      return;
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
      ) : status === 'error' ? (
        <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
          <Txt variant="body" color={colors.textMuted}>
            Ce lien de réinitialisation est invalide ou a expiré. Redemande un e-mail depuis « Mot de passe oublié ? ».
          </Txt>
          <Button label="Retour à la connexion" onPress={() => router.replace('/onboarding')} full />
        </View>
      ) : (
        <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
          <View style={styles.inputRow}>
            <TextInput
              value={pwd}
              onChangeText={setPwd}
              placeholder="Nouveau mot de passe"
              placeholderTextColor={colors.textMuted}
              secureTextEntry={hidden}
              autoCapitalize="none"
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

const styles = {
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
