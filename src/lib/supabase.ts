import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Connexion au backend Supabase (cerveau central : comptes, réservations, clubs…).
// L'URL et la clé « publishable » sont PUBLIQUES par conception (faites pour vivre dans
// l'app) — la vraie sécurité vient des règles Row Level Security côté serveur.
const SUPABASE_URL = 'https://bqeoqcqvqrqcrvkccxij.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_n2_mCCNviA-fbtpSZiz2ew_mnEqGeG_';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: AsyncStorage, // session persistée sur l'appareil (reste connecté)
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // app native, pas de redirection navigateur
  },
});

// ─── Connexion « téléphone + mot de passe » SANS SMS ─────────────────────────
// Supabase n'autorise le canal « téléphone » qu'avec un fournisseur SMS payant.
// Astuce : on mappe le numéro vers un e-mail interne non routable et on s'appuie sur
// l'auth e-mail/mot de passe (confirmation d'e-mail désactivée côté Supabase).
// L'utilisateur ne voit JAMAIS cet e-mail : il saisit seulement son numéro.
export function phoneToAuthEmail(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `p${digits}@phone.padelconnect.app`;
}
