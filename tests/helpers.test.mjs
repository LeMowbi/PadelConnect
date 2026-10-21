// Lance le test des helpers PURS du store : esbuild résout l'alias @/ et bundle
// tests/helpers.entry.ts (helpers source), puis on exécute le résultat (motif seeds.test.mjs).
//   node tests/helpers.test.mjs
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const result = await build({
  entryPoints: [join(root, 'tests/helpers.entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  alias: { '@': join(root, 'src') },
  logLevel: 'silent',
});
const out = join(mkdtempSync(join(tmpdir(), 'padelco-helpers-')), 'helpers.mjs');
writeFileSync(out, result.outputFiles[0].text);
await import(pathToFileURL(out).href);
