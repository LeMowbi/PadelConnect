import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
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

// ─── Rafraîchissement du jeton selon l’état de l’app (NATIF, F3) ──────────────
// Hors navigateur, auth-js lance son ticker de rafraîchissement dès l’initialisation
// (autoRefreshToken) mais ne sait pas quand l’app passe en arrière-plan : il tournait à vide pendant
// la suspension (tentatives réseau vouées à l’échec, rafale au réveil) et, gelé trop longtemps par
// l’OS, laissait expirer le jeton d’un gérant qui garde l’Espace Club ouvert toute la journée →
// déconnexion silencieuse. Doc Supabase React Native : UN SEUL écouteur AppState, ici (au plus près
// du client, hors React), qui arrête le ticker en arrière-plan et le relance au retour au premier
// plan (premier tick au tour suivant de la boucle ; un jeton expiré est de toute façon rafraîchi
// par getSession avant chaque requête, refreshMirror compris).
// Web : auth-js gère lui-même `visibilitychange`, aucun écouteur à poser.
if (Platform.OS === 'ios' || Platform.OS === 'android') {
  AppState.addEventListener('change', (st) => {
    if (st === 'active') void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });
}

// ─── Connexion « téléphone + mot de passe » SANS SMS (comptes HÉRITÉS) ────────
// Parcours d’origine, conservé uniquement pour la CONNEXION des comptes créés avant
// l’inscription par e-mail (dont le compte opérateur). On mappe le numéro vers un e-mail
// interne non routable. L’inscription principale se fait désormais par e-mail RÉEL avec
// confirmation activée (cf. signUpWithEmail + useEmailConfirmLink) ; ces comptes hérités
// ont été confirmés à leur création, leur connexion reste donc valable.
export function phoneToAuthEmail(phone: string): string {
  return `p${normalizePhone(phone)}@phone.padelconnect.app`;
}
