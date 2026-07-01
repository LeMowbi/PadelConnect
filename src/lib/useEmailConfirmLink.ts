// Confirmation d'e-mail par DEEP LINK. Quand l'utilisateur clique le lien reçu par mail,
// l'app s'ouvre sur une URL « padelco://auth-callback?code=… ». Ce hook échange ce `code`
// contre une vraie session (flux PKCE), puis prévient l'app (onConfirmed) pour qu'elle
// recharge le profil et entre dans l'écran d'accueil.

import * as Linking from 'expo-linking';
import { useEffect, useRef } from 'react';
import { supabase } from './supabase';

type Result = 'confirmed' | 'error';

// Extrait le `code` de confirmation d'une URL d'ouverture (ou null si ce n'en est pas une).
function codeFromUrl(url: string | null): string | null {
  if (!url) return null;
  const code = Linking.parse(url).queryParams?.code;
  return typeof code === 'string' ? code : null;
}

// Un lien expiré / déjà utilisé revient avec `error` / `error_code` au lieu de `code`.
function hasAuthError(url: string | null): boolean {
  if (!url) return false;
  const q = Linking.parse(url).queryParams ?? {};
  return Boolean(q.error || q.error_code || q.error_description);
}

export function useEmailConfirmLink(onResult: (r: Result) => void) {
  // Codes déjà échangés (PKCE consomme le code au 1er échange) : garde d'idempotence pour éviter
  // un 2ᵉ échange (via getInitialURL stable + ré-run de l'effet) qui échouerait et afficherait un
  // faux « lien expiré » alors que la confirmation a RÉUSSI. Persiste entre les re-renders.
  const handledCodes = useRef<Set<string>>(new Set());
  useEffect(() => {
    let active = true;

    const handle = async (url: string | null) => {
      // Le lien de RÉINITIALISATION du mot de passe rouvre l'app sur « reset-password » : c'est
      // l'écran dédié qui échange le code et fait saisir un nouveau mot de passe — pas ici.
      if (url && /(^|[/:])reset-password(\?|$)/.test(url)) return;
      // Lien expiré / déjà utilisé : on prévient l'utilisateur au lieu d'ignorer en silence.
      if (hasAuthError(url)) {
        if (active) onResult('error');
        return;
      }
      const code = codeFromUrl(url);
      if (!code || handledCodes.current.has(code)) return; // déjà traité → on n'échange pas 2 fois
      handledCodes.current.add(code);
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!active) return;
      onResult(error ? 'error' : 'confirmed');
    };

    // 1) App ouverte « à froid » directement par le lien.
    void Linking.getInitialURL().then(handle);
    // 2) App déjà ouverte en arrière-plan → on reçoit l'URL en événement.
    const sub = Linking.addEventListener('url', ({ url }) => void handle(url));

    return () => {
      active = false;
      sub.remove();
    };
  }, [onResult]);
}
