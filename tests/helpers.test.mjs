// Lance le test des helpers PURS du store : esbuild résout l'alias @/ et bundle
// tests/helpers.entry.ts (helpers source), puis on exécute le résultat (motif seeds.test.mjs).
// Le client Supabase (importé en relatif `./supabase` par les bibliothèques serveur testées :
// classement, préférence « actus et agenda ») est remplacé par une DOUBLURE pilotée par l'entrée
// via globalThis.__sb (motif notifications.test.mjs).
//   node tests/helpers.test.mjs
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

// Doublure : chaque appel RPC est journalisé, sa réponse vient de `globalThis.__sb.next`.
const supabaseStub = `
  const S = (globalThis.__sb = { calls: [], next: { data: null, error: null } });
  export const supabase = {
    async rpc(name, args) { S.calls.push({ name, args }); return S.next; },
  };
`;
const stubPlugin = {
  name: 'padelco-supabase-stub',
  setup(b) {
    b.onResolve({ filter: /^(\.\/|@\/lib\/)supabase$/ }, () => ({ path: 'supabase', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: supabaseStub, loader: 'js' }));
  },
};

const result = await build({
  entryPoints: [join(root, 'tests/helpers.entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  alias: { '@': join(root, 'src') },
  plugins: [stubPlugin],
  logLevel: 'silent',
});
const out = join(mkdtempSync(join(tmpdir(), 'padelco-helpers-')), 'helpers.mjs');
writeFileSync(out, result.outputFiles[0].text);
await import(pathToFileURL(out).href);
