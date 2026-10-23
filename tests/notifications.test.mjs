// Lance le test des rappels LOCAUX (src/lib/notifications.ts + src/lib/push.ts) : esbuild résout
// l'alias @/ et bundle tests/notifications.entry.ts (motif seeds.test.mjs), en remplaçant les modules
// NATIFS par des doublures : expo-notifications (centre de notifications en mémoire, permission
// pilotable, compteur de fenêtres système ouvertes), react-native (Platform iOS), expo-constants et
// le client Supabase (compteur d'enregistrements de jeton). Puis on exécute le résultat.
//   node tests/notifications.test.mjs
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

// Doublures : l'état partagé vit sur globalThis.__notifs (lu/piloté par l'entrée de test).
const stubs = {
  'expo-notifications': `
    const S = (globalThis.__notifs = {
      scheduled: [],
      permission: { granted: true, canAskAgain: true },
      prompts: 0,
      seq: 0,
      received: [], // écouteurs « push reçu au premier plan » (déclenchables par le test)
    });
    export const SchedulableTriggerInputTypes = { DATE: 'date' };
    export const AndroidImportance = { HIGH: 4 };
    export const IosAuthorizationStatus = { PROVISIONAL: 3 };
    export function setNotificationHandler() {}
    export async function setNotificationChannelAsync() {}
    export async function getPermissionsAsync() { return S.permission; }
    export async function requestPermissionsAsync() {
      S.prompts++;
      S.permission = { granted: true, canAskAgain: true };
      return S.permission;
    }
    // iOS : un identifiant déjà programmé est REMPLACÉ (pas dupliqué) — même sémantique ici.
    export async function scheduleNotificationAsync(req) {
      const identifier = req.identifier ?? 'auto-' + ++S.seq;
      S.scheduled = S.scheduled.filter((n) => n.identifier !== identifier);
      S.scheduled.push({ identifier, content: req.content, trigger: req.trigger });
      return identifier;
    }
    export async function getAllScheduledNotificationsAsync() { return [...S.scheduled]; }
    export async function cancelScheduledNotificationAsync(id) {
      S.scheduled = S.scheduled.filter((n) => n.identifier !== id);
    }
    export function addNotificationReceivedListener(cb) {
      S.received.push(cb);
      return { remove() { S.received = S.received.filter((x) => x !== cb); } };
    }
    export function addNotificationResponseReceivedListener() { return { remove() {} }; }
    export async function getLastNotificationResponseAsync() { return null; }
    export async function getExpoPushTokenAsync() { return { data: 'ExponentPushToken[test]' }; }
  `,
  'react-native': `
    export const Platform = { OS: 'ios' };
    export const AppState = { addEventListener() { return { remove() {} }; } };
  `,
  'expo-constants': `export default { expoConfig: { extra: { eas: { projectId: 'test-project' } } } };`,
  supabase: `
    const S = (globalThis.__supabase = { tokenWrites: 0 });
    export const supabase = {
      async rpc() { S.tokenWrites++; return { error: null }; },
    };
  `,
};

const stubPlugin = {
  name: 'padelco-native-stubs',
  setup(b) {
    b.onResolve({ filter: /^(expo-notifications|react-native|expo-constants)$/ }, (args) => ({ path: args.path, namespace: 'stub' }));
    // Le client Supabase est importé en relatif (./supabase) par push.ts et reservations.ts.
    b.onResolve({ filter: /^(\.\/|@\/lib\/)supabase$/ }, () => ({ path: 'supabase', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => ({ contents: stubs[args.path], loader: 'js' }));
  },
};

const result = await build({
  entryPoints: [join(root, 'tests/notifications.entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  alias: { '@': join(root, 'src') },
  plugins: [stubPlugin],
  logLevel: 'silent',
});
const out = join(mkdtempSync(join(tmpdir(), 'padelco-notifications-')), 'notifications.mjs');
writeFileSync(out, result.outputFiles[0].text);
await import(pathToFileURL(out).href);
