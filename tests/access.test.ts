// Test de logique — contrôle d'accès aux espaces sensibles (src/lib/access.ts, module PUR) :
// node --experimental-strip-types tests/access.test.ts
// Ces helpers ne pilotent que la VISIBILITÉ des entrées (la vraie barrière est la RLS serveur),
// mais une régression ici afficherait l'Espace opérateur/Club à un joueur — à ne jamais laisser.

import { canAccessClub, canAccessOperator, canSeeClubSpace } from '../src/lib/access.ts';

let failed = 0;
const eq = (a: unknown, b: unknown, msg: string) => {
  const ok = a === b;
  console.log(`${ok ? '✓' : `✗ ÉCHEC (${JSON.stringify(a)} ≠ ${JSON.stringify(b)})`} ${msg}`);
  if (!ok) failed++;
};

// ── Espace opérateur : réservé au rôle 'operator' ──
eq(canAccessOperator('operator'), true, 'Opérateur : opérateur → oui');
eq(canAccessOperator('club'), false, 'Opérateur : club → non');
eq(canAccessOperator('player'), false, 'Opérateur : joueur → non');

// ── Visibilité de l'Espace Club : club OU opérateur, jamais un joueur ──
eq(canSeeClubSpace('club'), true, 'Espace Club visible : club → oui');
eq(canSeeClubSpace('operator'), true, 'Espace Club visible : opérateur → oui');
eq(canSeeClubSpace('player'), false, 'Espace Club visible : joueur → non');

// ── Accès à UN club précis : un gérant ne voit QUE le club qu'il gère ──
eq(canAccessClub('club', 'padelta', 'padelta'), true, 'Club : gérant de padelta → accède à padelta');
eq(canAccessClub('club', 'padelta', 'padel-zone-4'), false, 'Club : gérant de padelta → refusé sur un autre club');
eq(canAccessClub('club', null, 'padelta'), false, 'Club : rôle club sans club géré → refusé');
eq(canAccessClub('operator', null, 'padelta'), true, 'Club : opérateur → accède à tout, même sans club géré');
eq(canAccessClub('player', 'padelta', 'padelta'), false, 'Club : joueur (même avec un id qui matche) → refusé');

if (failed) {
  console.error(`\n${failed} test(s) en échec`);
  process.exit(1);
}
console.log('\nTous les tests access.ts passent.');
