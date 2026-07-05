import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
// normalizePhone vit désormais dans un module PUR (testable) — ré-exporté ici pour ne pas
// casser les nombreux imports existants `from '@/lib/supabase'`.
import { normalizePhone } from '@/lib/phone';

export { normalizePhone };

// Connexion au backend Supabase (cerveau central : comptes, réservations, clubs…).
// L’URL et la clé « publishable » sont PUBLIQUES par conception (faites pour vivre dans
// l’app) — la vraie sécurité vient des règles Row Level Security côté serveur.
const SUPABASE_URL = 'https://bqeoqcqvqrqcrvkccxij.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_n2_mCCNviA-fbtpSZiz2ew_mnEqGeG_';
// Clé AsyncStorage où auth-js persiste la session (« sb-<ref>-auth-token »). La déconnexion
// HORS-LIGNE doit pouvoir l'effacer directement : auth-js ne retire PAS la session locale
// quand la révocation serveur échoue (réseau coupé) — le compte « ressusciterait » sinon au
// prochain lancement, y compris sur un téléphone prêté.
export const SUPABASE_AUTH_STORAGE_KEY = 'sb-bqeoqcqvqrqcrvkccxij-auth-token';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: AsyncStorage, // session persistée sur l’appareil (reste connecté)
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // app native : on traite le deep link nous-mêmes (cf. useEmailConfirmLink)
    flowType: 'pkce', // confirmation d’e-mail : le lien renvoie un `code` échangé contre une session
  },
});

// ─── Connexion « téléphone + mot de passe » SANS SMS (comptes HÉRITÉS) ────────
// Parcours d’origine, conservé uniquement pour la CONNEXION des comptes créés avant
// l’inscription par e-mail (dont le compte opérateur). On mappe le numéro vers un e-mail
// interne non routable. L’inscription principale se fait désormais par e-mail RÉEL avec
// confirmation activée (cf. signUpWithEmail + useEmailConfirmLink) ; ces comptes hérités
// ont été confirmés à leur création, leur connexion reste donc valable.
export function phoneToAuthEmail(phone: string): string {
  return `p${normalizePhone(phone)}@phone.padelconnect.app`;
}
