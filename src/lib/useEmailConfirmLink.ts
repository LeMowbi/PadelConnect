// Confirmation d’e-mail par DEEP LINK. Quand l’utilisateur clique le lien reçu par mail, l’app
// s’ouvre sur une URL de retour. Ce hook établit la session à partir de cette URL, puis prévient
// l’app (onResult) pour qu’elle recharge le profil et entre dans l’accueil.
//
// ⚠️ Supabase peut renvoyer TROIS formats de retour selon la config du projet — on les gère tous
// pour ne jamais laisser une confirmation « bloquée » :
//   1) FRAGMENT implicite  padelco://#access_token=…&refresh_token=…   → setSession (cas réel du
//      lien /auth/v1/verify) ; expo-linking ne lit PAS le `#`, on l’extrait à la main.
//   2) PKCE                 padelco://auth-callback?code=…             → exchangeCodeForSession
//   3) OTP moderne          padelco://auth-callback?token_hash=…&type=…→ verifyOtp
// L’ancienne version ne lisait que le `code` (?code=) → le lien réel (jetons dans le #) n’était
// jamais traité → « on n’arrive pas à confirmer ».

import type { EmailOtpType } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { useEffect, useRef } from 'react';
import { supabase } from './supabase';

type Result = 'confirmed' | 'error';

// Extrait les paramètres d’une URL de retour, à la fois depuis la QUERY (?a=b) ET le FRAGMENT
// (#a=b) — Supabase met les jetons dans le fragment, le `code`/`token_hash` dans la query.
function paramsFrom(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of url.split(/[?#]/).slice(1)) {
    for (const kv of part.split('&')) {
      if (!kv) continue;
      const eq = kv.indexOf('=');
      const k = eq >= 0 ? kv.slice(0, eq) : kv;
      const v = eq >= 0 ? kv.slice(eq + 1) : '';
      try {
        out[decodeURIComponent(k)] = decodeURIComponent(v);
      } catch {
        out[k] = v; // valeur non décodable : on garde brut plutôt que de tout perdre
      }
    }
  }
  return out;
}

export function useEmailConfirmLink(onResult: (r: Result) => void) {
  // Clés déjà traitées (les jetons/code sont consommés au 1er usage) : garde d’idempotence pour
  // éviter un 2ᵉ traitement (getInitialURL stable + ré-run de l’effet) qui échouerait et
  // afficherait un faux « lien expiré » alors que la confirmation a RÉUSSI.
  const handled = useRef<Set<string>>(new Set());
  // On garde `onResult` dans une ref (rafraîchie à chaque rendu) au lieu de le mettre en
  // dépendance de l’effet. SINON : `onConfirm` (l’appelant) change d’identité dès que la session
  // s’hydrate (account/serverUserId) → l’effet se nettoierait (`active = false`) EN PLEIN milieu
  // de l’échange réseau (setSession/exchangeCodeForSession, lent), et le résultat serait perdu
  // au `if (!active) return` → confirmation réussie côté serveur mais spinner infini (H1). Avec
  // la ref + effet monté UNE fois, `active` reste stable et `cb.current` pointe toujours sur le
  // `onConfirm` le plus frais (kind correct, comportement « rester connecté » préservé).
  const cb = useRef(onResult);
  cb.current = onResult;
  useEffect(() => {
    let active = true;

    const handle = async (url: string | null) => {
      if (!url) return;
      // Le lien de RÉINITIALISATION du mot de passe rouvre l’app sur « reset-password » : c’est
      // l’écran dédié qui traite le code et fait saisir un nouveau mot de passe — pas ici.
      if (/(^|[/:])reset-password(\?|#|$)/.test(url)) return;

      const p = paramsFrom(url);
      // Lien expiré / déjà utilisé : on prévient au lieu d’ignorer en silence.
      if (p.error || p.error_code || p.error_description) {
        if (active) cb.current('error');
        return;
      }

      // Clé d’idempotence = le premier jeton présent (selon le format reçu).
      const key = p.access_token || p.code || p.token_hash;
      if (!key || handled.current.has(key)) return;

      let error = null as { message: string } | null;
      if (p.access_token && p.refresh_token) {
        handled.current.add(key);
        ({ error } = await supabase.auth.setSession({ access_token: p.access_token, refresh_token: p.refresh_token }));
      } else if (p.code) {
        handled.current.add(key);
        ({ error } = await supabase.auth.exchangeCodeForSession(p.code));
      } else if (p.token_hash && p.type) {
        handled.current.add(key);
        ({ error } = await supabase.auth.verifyOtp({ token_hash: p.token_hash, type: p.type as EmailOtpType }));
      } else {
        return; // pas un lien de confirmation reconnu
      }
      if (!active) return;
      cb.current(error ? 'error' : 'confirmed');
    };

    // 1) App ouverte « à froid » directement par le lien.
    void Linking.getInitialURL().then(handle);
    // 2) App déjà ouverte en arrière-plan → on reçoit l’URL en événement.
    const sub = Linking.addEventListener('url', ({ url }) => void handle(url));

    return () => {
      active = false;
      sub.remove();
    };
    // Effet monté UNE seule fois : la livraison passe par `cb.current` (toujours le onConfirm
    // le plus frais), donc aucun re-abonnement en cours d'échange réseau. `cb`/`handled` sont
    // des refs stables ; `supabase`/`paramsFrom` sont au niveau module → deps vides correctes.
  }, []);
}
