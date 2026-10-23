// Fonction serveur ABSENTE ≠ panne réseau — RPC fidélité nées dans la 92 (src/lib/social.ts) et
// `club_reservation_phone` / `respond_invitation` (96, src/lib/reservations.ts). Bundlé par
// tests/rpcMissingStore.test.mjs — le client Supabase y est REMPLACÉ par un faux `rpc` piloté ici.
// Invariant : un build publié avant le collage des SQL 92→98 reçoit PGRST202 ; les LECTURES rendent
// le vide réel (aucune remise ne peut exister avant la 92), les gestes 'unsupported' — jamais
// null/false/'error' (« vérifie ta connexion », réessayé en boucle) ; une vraie panne réseau le reste.

import { clubReservationPhone, respondInvitation } from '@/lib/reservations';
import {
  clubServeLoyaltyClaim,
  fetchClubLoyaltyServed,
  fetchLoyaltyCap,
  fetchOperatorLoyaltyCost,
  fetchOperatorLoyaltyServed,
  setLoyaltyCap,
} from '@/lib/social';

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
const missing: RpcReply = { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } };
const network: RpcReply = { data: null, error: { message: 'TypeError: Network request failed' } };

// operator_loyalty_served (92) : décompte, export et « payé » ne doivent plus bloquer.
reply(missing);
eq(await fetchOperatorLoyaltyServed(0, 1), [], 'remises servies (opérateur), serveur d’avant la 92 → [] (rien à déduire)');
reply({ data: null, error: { code: '42883' } });
eq(await fetchOperatorLoyaltyServed(0, 1), [], 'remises servies (opérateur), 42883 → []');
reply(network);
eq(await fetchOperatorLoyaltyServed(0, 1), null, 'remises servies (opérateur), panne réseau → null');
reply({ data: [{ club_id: 'c1', amount: 2500, served_at: '2026-10-20T10:00:00Z' }], error: null });
eq(
  await fetchOperatorLoyaltyServed(0, 1),
  [{ clubId: 'c1', amount: 2500, servedAt: Date.UTC(2026, 9, 20, 10) }],
  'remises servies (opérateur), lignes conservées',
);

// club_loyalty_served (92).
reply(missing);
eq(await fetchClubLoyaltyServed('c1'), [], 'remises servies (club), serveur d’avant la 92 → []');
reply(network);
eq(await fetchClubLoyaltyServed('c1'), null, 'remises servies (club), panne réseau → null');

// operator_loyalty_cost (92).
reply(missing);
eq(await fetchOperatorLoyaltyCost(0, 1), { total: 0, served: 0 }, 'coût fidélité, serveur d’avant la 92 → zéro');
reply(network);
eq(await fetchOperatorLoyaltyCost(0, 1), null, 'coût fidélité, panne réseau → null');

// loyalty_cap / set_loyalty_cap (92).
reply(missing);
eq(await fetchLoyaltyCap(), 'unsupported', 'plafond, serveur d’avant la 92 → unsupported');
reply(network);
eq(await fetchLoyaltyCap(), null, 'plafond, panne réseau → null');
reply({ data: 5000, error: null });
eq(await fetchLoyaltyCap(), 5000, 'plafond lu');
reply(missing);
eq(await setLoyaltyCap(6000), 'unsupported', 'réglage du plafond, serveur d’avant la 92 → unsupported');
reply(network);
eq(await setLoyaltyCap(6000), false, 'réglage du plafond, panne réseau → false');
reply({ data: true, error: null });
eq(await setLoyaltyCap(6000), true, 'réglage du plafond enregistré');

// club_serve_loyalty_claim (92).
reply(missing);
eq(await clubServeLoyaltyClaim('c1', 'ABC234', 2500, 5000), 'unsupported', 'service d’un code, serveur d’avant la 92 → unsupported');
reply(network);
eq(await clubServeLoyaltyClaim('c1', 'ABC234', 2500, 5000), 'error', 'service d’un code, panne réseau → error');
reply({ data: 'already', error: null });
eq(await clubServeLoyaltyClaim('c1', 'ABC234', 2500, 5000), 'already', 'service d’un code, code métier conservé');

// club_reservation_phone (96).
reply(missing);
eq(await clubReservationPhone('r1'), 'unsupported', 'téléphone du réservant, serveur d’avant la 96 → unsupported');
reply(network);
eq(await clubReservationPhone('r1'), null, 'téléphone du réservant, panne réseau → null');
reply({ data: '  ', error: null });
eq(await clubReservationPhone('r1'), null, 'téléphone du réservant, numéro vide → null');
reply({ data: '+2250700000000', error: null });
eq(await clubReservationPhone('r1'), '+2250700000000', 'téléphone du réservant lu');

// respond_invitation : refus DÉFINITIF du serveur (false) ≠ panne réseau (null).
reply({ data: false, error: null });
eq(await respondInvitation('r1', true), false, 'invitation, refus serveur → false (définitif)');
reply(network);
eq(await respondInvitation('r1', true), null, 'invitation, panne réseau → null (réessayer a du sens)');
reply({ data: true, error: null });
eq(await respondInvitation('r1', true), true, 'invitation enregistrée');

if (failed) {
  console.error(`\n${failed} échec(s)`);
  process.exit(1);
}
console.log('\nrpcMissingStore : tout est vert');
