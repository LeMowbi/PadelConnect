// Diagnostics self-hosted : journal d'ERREURS et d'ÉVÉNEMENTS d'usage, écrits dans NOTRE Supabase
// (tables app_errors / app_events, cf. 33_diagnostics.sql). Aucun service externe, aucun pistage.
// Tout est best-effort et TOTALEMENT silencieux : le suivi ne doit jamais casser l'app ni bloquer
// l'utilisateur. Seul l'opérateur peut relire ces tables (RLS).

import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

// Réduit une erreur inconnue en (message, stack) exploitables.
function describe(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) return { message: error.message || 'Error', stack: error.stack };
  if (typeof error === 'string') return { message: error };
  try {
    return { message: JSON.stringify(error).slice(0, 500) };
  } catch {
    return { message: 'Erreur inconnue' };
  }
}

// Enregistre une erreur / un crash. `context` = où c'est arrivé (écran ou action).
// Ne lève jamais, ne bloque jamais (fire-and-forget).
export function logError(error: unknown, context?: string): void {
  try {
    const { message, stack } = describe(error);
    void supabase
      .from('app_errors')
      .insert({ message: message.slice(0, 1000), stack: stack?.slice(0, 4000), context, platform: Platform.OS, app_version: APP_VERSION })
      .then(() => {});
  } catch {
    // silencieux : un échec de diagnostic ne doit jamais remonter à l'utilisateur.
  }
}

// Enregistre un événement d'usage (ex. 'reservation_created'). `props` = détails NON sensibles.
export function track(name: string, props?: Record<string, unknown>): void {
  try {
    void supabase
      .from('app_events')
      .insert({ name, props: props ?? null, platform: Platform.OS })
      .then(() => {});
  } catch {
    // silencieux
  }
}

// Installe le gestionnaire GLOBAL d'erreurs JS (crashs non rattrapés) → on les journalise avant
// que l'app ne réagisse. On chaîne le handler existant pour ne pas casser le comportement natif.
export function installGlobalErrorLogging(): void {
  const g = globalThis as unknown as {
    ErrorUtils?: {
      getGlobalHandler?: () => (e: unknown, fatal?: boolean) => void;
      setGlobalHandler?: (h: (e: unknown, fatal?: boolean) => void) => void;
    };
  };
  const eu = g.ErrorUtils;
  if (!eu?.setGlobalHandler || !eu.getGlobalHandler) return;
  const previous = eu.getGlobalHandler();
  eu.setGlobalHandler((error, isFatal) => {
    logError(error, isFatal ? 'global:fatal' : 'global');
    previous?.(error, isFatal);
  });
}
