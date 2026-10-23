// Fonction serveur ABSENTE ≠ panne réseau (src/lib/competitionsServer.ts), bundlé par
// tests/rpcMissing.test.mjs — le client Supabase y est REMPLACÉ par un faux `rpc` piloté ici.
// Invariant : un build publié avant le collage des SQL 92→98 reçoit PGRST202 (PostgREST) ou
// 42883 (Postgres) ; ce cas doit remonter 'unsupported' — jamais null (« vérifie ta connexion »,
// réessayé en boucle) — tandis qu'une vraie erreur réseau reste null/false.

import { cancelCompetition, isMissingRpc, unconfirmTournamentPayment } from '@/lib/competitionsServer';

type RpcReply = { data: unknown; error: { code?: string; message?: string } | null };
const g = globalThis as unknown as { __rpcReply: RpcReply };

let failed = 0;
const eq = (a: unknown, b: unknown, msg: string) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  console.log(`${ok ? '✓' : `✗ ÉCHEC (${JSON.stringify(a)} ≠ ${JSON.stringify(b)})`} ${msg}`);
  if (!ok) failed++;
};
const reply = (r: RpcReply) => {
  g.__rpcReply = r;
};

// Reconnaissance pure.
eq(isMissingRpc({ code: 'PGRST202' }), true, 'PGRST202 = fonction absente');
eq(isMissingRpc({ code: '42883' }), true, '42883 = fonction absente');
eq(isMissingRpc({ code: 'PGRST301' }), false, 'autre code PostgREST ≠ fonction absente');
const networkError: RpcReply['error'] = { message: 'TypeError: Network request failed' };
eq(isMissingRpc(networkError), false, 'panne réseau (sans code) ≠ fonction absente');
eq(isMissingRpc(null), false, 'pas d’erreur ≠ fonction absente');

// cancel_competition (97).
reply({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
eq(await cancelCompetition('c1', 'Pluie'), 'unsupported', 'annulation sur serveur d’avant la 97 → unsupported');
reply({ data: null, error: { code: '42883' } });
eq(await cancelCompetition('c1', 'Pluie'), 'unsupported', 'annulation, 42883 → unsupported');
reply({ data: null, error: { message: 'Network request failed' } });
eq(await cancelCompetition('c1', 'Pluie'), null, 'annulation, panne réseau → null (seul cas « réessaie »)');
reply({ data: 'fees', error: null });
eq(await cancelCompetition('c1', 'Pluie'), 'fees', 'annulation, code métier conservé');
reply({ data: 'ok', error: null });
eq(await cancelCompetition('c1', 'Pluie'), 'ok', 'annulation réussie');

// operator_unconfirm_tournament_payment (97).
reply({ data: null, error: { code: 'PGRST202' } });
eq(await unconfirmTournamentPayment('c1'), 'unsupported', '« Paiement reçu → annuler » sur serveur d’avant la 97 → unsupported');
reply({ data: null, error: { message: 'Network request failed' } });
eq(await unconfirmTournamentPayment('c1'), false, 'annulation de paiement, panne réseau → false');
reply({ data: true, error: null });
eq(await unconfirmTournamentPayment('c1'), true, 'annulation de paiement réussie');

if (failed) {
  console.error(`\n${failed} échec(s)`);
  process.exit(1);
}
console.log('\nrpcMissing : tout est vert');
