// Test de logique — format du code de parrainage et « Coller mon code » (src/lib/referralCode.ts) :
//   node --experimental-strip-types tests/referralCode.test.ts
// Deux invariants comptent : (1) le code extrait a TOUJOURS le format d'un code généré (12 hex en
// majuscules) — c'est lui qui part au serveur à l'inscription ; (2) on retrouve le code dans tout
// ce que le filleul a pu copier : le code seul, le lien d'invitation ou le message de partage.

import { REFERRAL_CODE, referralCodeIn } from '../src/lib/referralCode.ts';

let failed = 0;
const eq = (a: unknown, b: unknown, msg: string) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  console.log(`${ok ? '✓' : `✗ ÉCHEC (${JSON.stringify(a)} ≠ ${JSON.stringify(b)})`} ${msg}`);
  if (!ok) failed++;
};

const CODE = 'A1B2C3D4E5F6';

// ── Format (REFERRAL_CODE) ──────────────────────────────────────────────────────
eq(REFERRAL_CODE.test(CODE), true, '12 hex en majuscules = code valide');
// Même dérivation que referralCodeForUser (referrals.ts) : UUID sans tirets, 12 premiers, majuscules.
eq(
  REFERRAL_CODE.test('9f86d081-884c-4d63-a2b8-1f3c5e7a9b0d'.replace(/-/g, '').slice(0, 12).toUpperCase()),
  true,
  'code dérivé d’un UUID valide',
);
eq(REFERRAL_CODE.test('a1b2c3d4e5f6'), false, 'minuscules refusées (la saisie est mise en majuscules avant)');
eq(REFERRAL_CODE.test('A1B2C3D4E5F'), false, '11 caractères refusés');
eq(REFERRAL_CODE.test('A1B2C3D4E5F60'), false, '13 caractères refusés');
eq(REFERRAL_CODE.test('A1B2C3D4E5G6'), false, 'lettre hors hexadécimal refusée');
eq(REFERRAL_CODE.test(` ${CODE}`), false, 'blancs non tolérés (l’écran fait trim avant)');

// ── Extraction : ce que le filleul a copié ──────────────────────────────────────
eq(referralCodeIn(CODE), CODE, 'code seul');
eq(referralCodeIn(`  ${CODE}\n`), CODE, 'code entouré de blancs');
eq(referralCodeIn('a1b2c3d4e5f6'), CODE, 'code en minuscules remis en majuscules');
eq(referralCodeIn(`https://padelconnectci.com/invite/${CODE}`), CODE, 'lien d’invitation');
eq(referralCodeIn(`padelconnectci.com/invite/${CODE}/`), CODE, 'lien sans schéma, barre finale');
// Message de partage de l'écran Parrainage (parrainage.tsx) : « PADELCONNECT » fait aussi
// 12 caractères mais n'est pas hexadécimal — il ne doit jamais être pris pour le code.
eq(
  referralCodeIn(
    `Rejoins-moi sur PadelConnect 🎾 — on réserve un terrain de padel à Abidjan en 2 minutes.\nMon code de parrainage : ${CODE}\nhttps://padelconnectci.com/invite/${CODE}`,
  ),
  CODE,
  'message de partage complet',
);
eq(referralCodeIn(`Code:${CODE}!`), CODE, 'ponctuation collée au code');
eq(referralCodeIn(`ABCDEF123456 puis ${CODE}`), 'ABCDEF123456', 'plusieurs candidats : le premier gagne');

// ── Rien d'exploitable ──────────────────────────────────────────────────────────
eq(referralCodeIn(''), null, 'presse-papiers vide');
eq(referralCodeIn('Salut, tu viens jouer ce soir ?'), null, 'texte sans code');
eq(referralCodeIn('A1B2C3D4E5F'), null, 'code tronqué (11)');
eq(referralCodeIn('A1B2C3D4E5F6A1'), null, 'mot trop long : pas de code découpé au milieu');
eq(referralCodeIn('A1B2C3-D4E5F6'), null, 'code coupé par un tiret');
eq(referralCodeIn('PADELCONNECT'), null, '12 lettres non hexadécimales');

if (failed) {
  console.error(`\n${failed} test(s) en échec`);
  process.exit(1);
}
console.log('\nTous les tests referralCode.ts passent.');
