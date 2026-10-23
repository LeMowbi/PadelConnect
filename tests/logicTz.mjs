// Rejoue TOUTE la suite `test:logic` sous trois fuseaux NON-UTC (C-07) : une fixture écrite en heure
// LOCALE (`new Date(2026, 5, 12, 23, 0)` au lieu de `Date.UTC(...)`) passe sous TZ=UTC et casse
// ailleurs — ce rejeu la démasque. Les commandes sont LUES dans package.json (source unique) : un
// test ajouté à `test:logic` est rejoué ici sans rien toucher.
//   npm run test:logic:tz
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
// « TZ=UTC node … » → « node … » : le fuseau est imposé par l'environnement de chaque rejeu.
const commands = pkg.scripts['test:logic'].split(' && ').map((c) => c.replace(/^TZ=\S+\s+/, ''));
// Ouest de l'UTC, Est de l'UTC, et l'extrême UTC+14 (le jour local y bascule 14 h avant Abidjan).
const ZONES = ['America/Los_Angeles', 'Asia/Tokyo', 'Pacific/Kiritimati'];

let failed = 0;
for (const zone of ZONES) {
  for (const cmd of commands) {
    try {
      execSync(cmd, { cwd: root, env: { ...process.env, TZ: zone }, stdio: 'pipe' });
    } catch (e) {
      failed++;
      console.error(`✗ ÉCHEC sous TZ=${zone} : ${cmd}\n${e.stdout?.toString() ?? ''}${e.stderr?.toString() ?? ''}`);
    }
  }
  console.log(`✓ fuseau ${zone} : ${commands.length} suites rejouées`);
}
if (failed) {
  console.error(`\n${failed} suite(s) en échec hors UTC`);
  process.exit(1);
}
console.log('\nToute la suite test:logic passe sous 3 fuseaux non-UTC.');
