// Test de logique — helpers PURS du store (src/store/helpers.ts), bundlé par tests/helpers.test.mjs
// (esbuild résout l'alias @/ : helpers importe @/lib/days à l'exécution) :
//   node tests/helpers.test.mjs
// Trois contrats qui comptent : (1) frAuthError ne montre JAMAIS l'anglais brut de GoTrue et
// reconnaît le « Database error saving new user » qui MASQUE le refus PHONE_TAKEN du trigger
// handle_new_user ; (2) isReservationOwner est la règle UNIQUE « c'est ma résa » (écrans + rappels
// locaux), connecté ou non ; (3) loggedOutState purge tout le périmètre du compte (fidélité comprise).

import { AUTH_ERROR_FALLBACK, frAuthError, initialState, isReservationOwner, loggedOutState } from '@/store/helpers';
import type { Reservation } from '@/store/AppContext';

let failed = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? '✓' : '✗ ÉCHEC'} ${msg}`);
  if (!cond) failed++;
};
const eq = (a: unknown, b: unknown, msg: string) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  console.log(`${ok ? '✓' : `✗ ÉCHEC (${JSON.stringify(a)} ≠ ${JSON.stringify(b)})`} ${msg}`);
  if (!ok) failed++;
};

// ── frAuthError : messages PAR CAS, jamais d'anglais à l'écran ───────────────────────────────
eq(
  frAuthError('Database error saving new user'),
  'Inscription impossible — ce numéro est peut-être déjà utilisé par un autre compte. Réessaie ou connecte-toi.',
  'frAuthError : « Database error saving new user » (PHONE_TAKEN masqué par GoTrue) → message prudent',
);
eq(frAuthError('Some brand new GoTrue message'), AUTH_ERROR_FALLBACK, 'frAuthError : message inconnu → repli FR (plus jamais le brut)');
check(
  !/[a-z]+ error|saving|should be/i.test(frAuthError('Password reset token has expired')),
  'frAuthError : aucun fragment anglais ne fuit',
);
eq(
  frAuthError('Password should be at least 6 characters.'),
  'Mot de passe trop court (6 caractères minimum).',
  'frAuthError : mot de passe trop court',
);
eq(
  frAuthError('New password should be different from the old password.'),
  'Choisis un mot de passe différent de l’ancien.',
  'frAuthError : same_password (reset-password) → refus définitif dédié, PAS « trop court »',
);
eq(
  frAuthError('Signups not allowed for this instance'),
  'Inscriptions momentanément fermées — réessaie plus tard ou écris-nous.',
  'frAuthError : inscriptions fermées → plus de « config Supabase »',
);
check(
  frAuthError('Invalid login credentials').includes('Mot de passe oublié'),
  'frAuthError : identifiants incorrects → renvoie vers « Mot de passe oublié ? »',
);
eq(
  frAuthError('Network request failed'),
  'Connexion internet impossible — réessaie.',
  'frAuthError : réseau → « réessaie » (le seul cas légitime)',
);
eq(
  frAuthError('Password is known to be weak and easy to guess, please choose a different one.'),
  'Mot de passe trop facile à deviner — choisis-en un autre.',
  'frAuthError : weak_password → refus dédié, PAS le repli « Réessaie »',
);
eq(frAuthError(''), AUTH_ERROR_FALLBACK, 'frAuthError : message vide → repli');

// ── isReservationOwner : règle UNIQUE « c'est ma résa » ──────────────────────────────────────
const base = {
  id: 'r1',
  clubId: 'padelta',
  dateKey: '2026-10-22',
  time: '18:00',
  court: 'Terrain 1',
  startsAt: 0,
  price: 15000,
  invited: [],
};
const mine = { ...base, userId: 'me' } as unknown as Reservation;
const other = { ...base, userId: 'him', bookedBy: { name: 'Awa' } } as unknown as Reservation;
const local = { ...base } as unknown as Reservation; // résa locale (démo), sans userId ni bookedBy
check(isReservationOwner(mine, 'me'), 'owner : connecté, ma résa (userId = moi)');
check(!isReservationOwner(other, 'me'), 'owner : connecté, résa d’un autre compte');
check(isReservationOwner(local, 'me'), 'owner : connecté, résa locale sans userId → à moi');
check(isReservationOwner(local, null), 'owner : sans session, résa locale → à moi');
check(!isReservationOwner(other, null), 'owner : sans session, résa « bookedBy » d’un autre → pas à moi');

// ── loggedOutState : tout le périmètre du compte est purgé ───────────────────────────────────
const cleared = loggedOutState({
  ...initialState,
  serverUserId: 'me',
  loyalty: { played: 12, claimed: 1 },
  friends: [{ id: 'f1', name: 'Awa', phone: '0707070707' }],
  favoritePlayerIds: ['f1'],
  blockedUserIds: ['x'],
});
eq(cleared.serverUserId, null, 'loggedOut : identité serveur purgée');
eq(cleared.loyalty, null, 'loggedOut : compteur de fidélité serveur purgé (sinon le compte suivant hérite des tampons)');
eq(cleared.friends, [], 'loggedOut : amis purgés');
eq(cleared.favoritePlayerIds, [], 'loggedOut : joueurs suivis purgés');
eq(cleared.blockedUserIds, [], 'loggedOut : bloqués purgés');

if (failed > 0) {
  console.error(`\n${failed} assertion(s) en échec`);
  process.exit(1);
}
console.log('\nhelpers.test : tout est vert ✓');
