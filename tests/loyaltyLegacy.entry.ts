// Fidélité lue sur un serveur d'AVANT la 92 (src/lib/social.ts) — bundlé par
// tests/loyaltyLegacy.test.mjs, le client Supabase y est REMPLACÉ par un faux `rpc` piloté ici.
// Invariant : `my_loyalty` de la 82 ne renvoie que (played, claimed) → `cap: null` (« Fidélité
// bientôt disponible »), jamais le plafond par défaut présenté comme réel ; `my_loyalty_claims` /
// `fetch_loyalty_claims` de la 82 n'ont pas de colonne code → '' (jamais « code undefined »).

import { fetchLoyaltyClaims, fetchMyLoyalty, fetchMyLoyaltyClaims } from '@/lib/social';

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

// my_loyalty — serveur à la 82 (prod d'avant la 92) : ni plafond ni règle cible.
reply({ data: [{ played: 12, claimed: 1 }], error: null });
eq(
  await fetchMyLoyalty(),
  { played: 12, playedAll: 12, claimed: 1, cap: null },
  'compteur, serveur d’avant la 92 → cap null (pas de plafond inventé) ; Parties jouées = played de la 82',
);
reply({ data: [{ played: 0, claimed: 0 }], error: null });
eq(await fetchMyLoyalty(), { played: 0, playedAll: 0, claimed: 0, cap: null }, 'compteur vide, serveur d’avant la 92 → cap null');

// my_loyalty — serveur à la 92+ : plafond RÉEL, y compris un plafond réglé par l'opérateur.
reply({ data: [{ played: 3, played_all: 7, claimed: 0, cap: 4000 }], error: null });
eq(await fetchMyLoyalty(), { played: 3, playedAll: 7, claimed: 0, cap: 4000 }, 'compteur 92 : plafond lu du serveur');
reply({ data: { played: 3, played_all: 7, claimed: 0, cap: 5000 }, error: null });
eq(await fetchMyLoyalty(), { played: 3, playedAll: 7, claimed: 0, cap: 5000 }, 'compteur 92 renvoyé en objet (non tableau)');

// Échecs : null (convention réseau §8), jamais un compteur inventé.
reply({ data: null, error: { message: 'Network request failed' } });
eq(await fetchMyLoyalty(), null, 'compteur, panne réseau → null');
reply({ data: [], error: null });
eq(await fetchMyLoyalty(), null, 'compteur, aucune ligne (hors session) → null');

// fetch_loyalty_claims (opérateur) — la 82 n'a ni code ni champs de service.
reply({
  data: [{ id: 'l1', user_id: 'u1', player_name: 'Awa', cycle: 1, claimed_at: '2026-10-01T10:00:00Z', served: false }],
  error: null,
});
eq(
  await fetchLoyaltyClaims(),
  [
    {
      id: 'l1',
      userId: 'u1',
      playerName: 'Awa',
      cycle: 1,
      claimedAt: Date.UTC(2026, 9, 1, 10),
      served: false,
      code: '',
      clubId: null,
      amount: null,
      matchPrice: null,
      servedAt: null,
    },
  ],
  'réclamations (opérateur), serveur d’avant la 92 → code vide, jamais undefined',
);
reply({
  data: [
    {
      id: 'l2',
      user_id: null,
      player_name: 'Ancien joueur',
      cycle: 2,
      claimed_at: '2026-10-02T10:00:00Z',
      served: true,
      code: 'ABC234',
      club_id: 'c1',
      amount: 2500,
      match_price: 5000,
      served_at: '2026-10-03T10:00:00Z',
    },
  ],
  error: null,
});
eq(
  (await fetchLoyaltyClaims())?.[0],
  {
    id: 'l2',
    userId: null,
    playerName: 'Ancien joueur',
    cycle: 2,
    claimedAt: Date.UTC(2026, 9, 2, 10),
    served: true,
    code: 'ABC234',
    clubId: 'c1',
    amount: 2500,
    matchPrice: 5000,
    servedAt: Date.UTC(2026, 9, 3, 10),
  },
  'réclamations (opérateur), serveur 92 : code et service conservés',
);
reply({ data: null, error: { message: 'Network request failed' } });
eq(await fetchLoyaltyClaims(), null, 'réclamations (opérateur), panne réseau → null');

// my_loyalty_claims (joueur) — même repli, déjà en place : contrôle de parité.
reply({ data: [{ cycle: 1, claimed_at: '2026-10-01T10:00:00Z', served: false }], error: null });
eq((await fetchMyLoyaltyClaims())?.[0]?.code, '', 'mes réclamations, serveur d’avant la 92 → code vide');

if (failed) {
  console.error(`\n${failed} échec(s)`);
  process.exit(1);
}
console.log('\nloyaltyLegacy : tout est vert');
