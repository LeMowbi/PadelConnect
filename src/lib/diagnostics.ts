// Diagnostics self-hosted : journal d’ERREURS et d’ÉVÉNEMENTS d’usage, écrits dans NOTRE Supabase
// (tables app_errors / app_events, cf. 33_diagnostics.sql). Aucun service externe, aucun pistage.
// Tout est best-effort et TOTALEMENT silencieux : le suivi ne doit jamais casser l’app ni bloquer
// l’utilisateur. Seul l’opérateur peut relire ces tables (RLS).
// Côté serveur (94) : longueurs BORNÉES par CHECK (mêmes bornes qu’ici — une ligne hors borne
// serait refusée, donc perdue en silence), coupe-circuit > 300 lignes / 10 min (ligne abandonnée
// sans erreur) et purge > 30 jours à l’ouverture de l’Espace opérateur.

import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
// Bornes = CHECK de la 94 (message 1000, stack 4000, context 200, name 80, props 2000 en texte jsonb).
const MAX_CONTEXT = 200;
const MAX_NAME = 80;
const MAX_PROPS_JSON = 2000;

// Le CHECK serveur mesure `props::text` (rendu jsonb), qui ajoute une espace après chaque « : » et
// chaque « , » : JSON.stringify sous-estime. Compter TOUS ces caractères (ceux des chaînes aussi)
// donne un majorant pour des props ordinaires (chaînes, booléens, entiers) → jamais de ligne refusée.
function jsonbTextLength(props: Record<string, unknown>): number {
  const json = JSON.stringify(props);
  return json.length + (json.match(/[:,]/g)?.length ?? 0);
}

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

// Enregistre une erreur / un crash. `context` = où c’est arrivé (écran ou action).
// Ne lève jamais, ne bloque jamais (fire-and-forget).
export function logError(error: unknown, context?: string): void {
  try {
    const { message, stack } = describe(error);
    void supabase
      .from('app_errors')
      .insert({
        message: message.slice(0, 1000),
        stack: stack?.slice(0, 4000),
        context: context?.slice(0, MAX_CONTEXT),
        platform: Platform.OS,
        app_version: APP_VERSION,
      })
      .then(() => {});
  } catch {
    // silencieux : un échec de diagnostic ne doit jamais remonter à l’utilisateur.
  }
}

// Enregistre un événement d’usage (ex. 'reservation_created'). `props` = détails NON sensibles.
// Des props trop volumineuses (au-delà de la borne serveur) sont omises plutôt que de perdre
// l’événement entier : on ne tronque pas un JSON.
export function track(name: string, props?: Record<string, unknown>): void {
  try {
    const small = props && jsonbTextLength(props) <= MAX_PROPS_JSON ? props : null;
    void supabase
      .from('app_events')
      .insert({ name: name.slice(0, MAX_NAME), props: small, platform: Platform.OS })
      .then(() => {});
  } catch {
    // silencieux
  }
}

// ─── Lecture opérateur (carte « Santé de l’app » de l’Espace opérateur, RPC 39) ───

export type DiagSummary = { errors7d: number; events7d: number; topContext?: string };

// Résumé 7 jours — null si échec réseau OU compte non opérateur (la carte s’affiche « — »).
export async function fetchDiagSummary(): Promise<DiagSummary | null> {
  const { data, error } = await supabase.rpc('operator_diag_summary');
  if (error) return null;
  const row = ((data ?? []) as { errors_7d: number; events_7d: number; top_context: string | null }[])[0];
  if (!row) return null;
  return { errors7d: row.errors_7d, events7d: row.events_7d, topContext: row.top_context ?? undefined };
}

export type RecentError = { message: string; context?: string; platform?: string; appVersion?: string; createdAt: string };

// Dernières erreurs anonymisées (opérateur). null = échec réseau / non autorisé.
export async function fetchRecentErrors(limit = 5): Promise<RecentError[] | null> {
  const { data, error } = await supabase.rpc('operator_recent_errors', { p_limit: limit });
  if (error) return null;
  return (
    (data ?? []) as { message: string; context: string | null; platform: string | null; app_version: string | null; created_at: string }[]
  ).map((r) => ({
    message: r.message,
    context: r.context ?? undefined,
    platform: r.platform ?? undefined,
    appVersion: r.app_version ?? undefined,
    createdAt: r.created_at,
  }));
}

// Installe le gestionnaire GLOBAL d’erreurs JS (crashs non rattrapés) → on les journalise avant
// que l’app ne réagisse. On chaîne le handler existant pour ne pas casser le comportement natif.
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
