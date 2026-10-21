// Test de logique — normalisation du lien de paiement Wave (src/lib/waveLink.ts) :
//   node --experimental-strip-types tests/waveLink.test.ts
// Deux invariants comptent : (1) un lien accepté est TOUJOURS ouvrable et passe la garde serveur
// des parts (83 : `^https://(pay\.)?wave\.com/`, sensible à la casse) — schéma https, host en
// minuscules ; (2) aucun domaine hors Wave ne passe (lien présenté derrière « Payer »).

import { normalizeWaveLink } from '../src/lib/waveLink.ts';

let failed = 0;
const eq = (a: unknown, b: unknown, msg: string) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  console.log(`${ok ? '✓' : `✗ ÉCHEC (${JSON.stringify(a)} ≠ ${JSON.stringify(b)})`} ${msg}`);
  if (!ok) failed++;
};
const refused = (raw: string, msg: string) => eq('error' in normalizeWaveLink(raw), true, msg);

// ── Effacement et liens déjà propres ────────────────────────────────────────────
eq(normalizeWaveLink(''), { link: '' }, 'vide = effacement');
eq(normalizeWaveLink('   '), { link: '' }, 'blancs seuls = effacement');
eq(normalizeWaveLink('https://pay.wave.com/m/M_ci_abc'), { link: 'https://pay.wave.com/m/M_ci_abc' }, 'lien complet inchangé');
eq(normalizeWaveLink('  https://wave.com/x  '), { link: 'https://wave.com/x' }, 'wave.com sans « pay. » accepté, espaces retirés');

// ── Schéma : absent ou http → https ─────────────────────────────────────────────
eq(normalizeWaveLink('pay.wave.com/m/M_ci_abc'), { link: 'https://pay.wave.com/m/M_ci_abc' }, 'sans schéma : https:// ajouté');
eq(normalizeWaveLink('http://pay.wave.com/m/x'), { link: 'https://pay.wave.com/m/x' }, 'http promu en https');
eq(normalizeWaveLink('HTTPS://pay.wave.com/m/x'), { link: 'https://pay.wave.com/m/x' }, 'schéma en majuscules ramené en minuscules');

// ── Casse : host en minuscules, chemin préservé (identifiant marchand) ──────────
eq(normalizeWaveLink('https://Pay.Wave.com/m/M_CI_Abc'), { link: 'https://pay.wave.com/m/M_CI_Abc' }, 'host minusculé, chemin intact');
eq(normalizeWaveLink('Pay.Wave.com/m/M_CI_Abc'), { link: 'https://pay.wave.com/m/M_CI_Abc' }, 'sans schéma + host en majuscules');

// ── Allow-list : rien d'autre que Wave ──────────────────────────────────────────
refused('https://evil.com/pay.wave.com/', 'autre domaine refusé');
refused('https://pay.wave.com.evil.com/x', 'suffixe de domaine piégé refusé');
refused('https://wave.com@evil.com/x', 'identifiants dans l’URL refusés');
refused('https://pay.wave.com', 'host sans chemin refusé (garde serveur exige « / »)');
refused('ftp://pay.wave.com/x', 'autre schéma refusé');
refused('wave', 'saisie incomplète refusée');
eq(
  normalizeWaveLink('evil.com'),
  { error: 'Seuls les liens Wave (pay.wave.com) sont acceptés.' },
  'message générique (opérateur ET parts)',
);

// ── Longueur ────────────────────────────────────────────────────────────────────
refused(`https://pay.wave.com/${'a'.repeat(300)}`, 'lien de plus de 300 caractères refusé');

if (failed) {
  console.error(`\n${failed} test(s) en échec`);
  process.exit(1);
}
console.log('\nTous les tests waveLink.ts passent.');
