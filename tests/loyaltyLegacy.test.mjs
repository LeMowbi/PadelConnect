// Lance le test « fidélité sur un serveur d'avant la 92 » : esbuild résout l'alias @/, bundle
// tests/loyaltyLegacy.entry.ts et REMPLACE le client Supabase (./supabase, qui tire react-native) par
// un faux `rpc` renvoyant la réponse posée par le test (globalThis.__rpcReply). Motif rpcMissingStore.test.mjs.
//   node tests/loyaltyLegacy.test.mjs
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const stubSupabase = {
  name: 'stub-supabase',
  setup(b) {
    b.onResolve({ filter: /^(\.\/supabase|@\/lib\/supabase)$/ }, () => ({ path: 'supabase-stub', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: 'export const supabase = { rpc: async () => globalThis.__rpcReply };',
      loader: 'js',
    }));
  },
};
const result = await build({
  entryPoints: [join(root, 'tests/loyaltyLegacy.entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  alias: { '@': join(root, 'src') },
  plugins: [stubSupabase],
  logLevel: 'silent',
});
const out = join(mkdtempSync(join(tmpdir(), 'padelco-loyalty-')), 'loyaltyLegacy.mjs');
writeFileSync(out, result.outputFiles[0].text);
await import(pathToFileURL(out).href);
