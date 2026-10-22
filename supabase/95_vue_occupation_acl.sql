-- 95 — Vue `slot_occupancy` : lecture seule (audit des règles métier 2026-10-22, R-01 HIGH).
-- À coller dans Supabase → SQL Editor → Run APRÈS la 91. Idempotent, rejouable.
--
-- Constat : la vue créée par la 03 (recréée par la 68) appartient à `postgres` et n'est pas en
-- `security_invoker` : elle s'exécute avec les droits de son propriétaire, donc SANS la RLS de
-- `reservations`. Or elle avait gardé les droits par défaut de Supabase sur le schéma public :
-- INSERT / UPDATE / DELETE pour `anon` et `authenticated`. Une vue simple sur une seule table est
-- modifiable automatiquement : n'importe quel compte — et même la clé publique seule — pouvait
-- supprimer ou déplacer TOUTES les réservations (cascade sur scores, parts, carnets ; aucun push).
-- Prouvé en lecture seule sur la production le 2026-10-22 (has_table_privilege = true).
--
-- Correctif : la vue ne sert qu'à LIRE l'occupation (src/lib/reservations.ts → fetchOccupancy,
-- utilisateur connecté). On retire tout et on ne rend que SELECT à `authenticated`.
-- ⚠️ Un futur `drop view` + `create view` (ex. recollage de la 03 ou de la 68) REMET les droits
-- par défaut : toujours reposer ces deux lignes juste après.

revoke all on public.slot_occupancy from public, anon, authenticated;
grant select on public.slot_occupancy to authenticated;
