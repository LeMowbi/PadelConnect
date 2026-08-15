-- 84 — DURCISSEMENT DES PRIVILÈGES (audit complet 2026-08-15).
-- À coller dans Supabase → SQL Editor → Run. Idempotent, rejouable sans risque.
--
-- Deux corrections issues de l'audit serveur :
--
-- A) GRANTS MANQUANTS (lot A / moteur de niveau, SQL 80). Trois RPC neuves ont été révoquées de
--    `public, anon` mais JAMAIS `grant … to authenticated`. Sur ce projet la config Supabase
--    accorde EXECUTE à `authenticated` par défaut (elles fonctionnent donc en prod), MAIS le
--    fichier 80 seul, recollé sur un projet neuf, casserait favoris / fiabilité / rattrapage de
--    niveau. On pose les grants explicites (doctrine du dépôt : revoke public,anon + grant auth).
grant execute on function public.reconcile_my_levels() to authenticated;
grant execute on function public.public_reliability(uuid[]) to authenticated;
grant execute on function public.toggle_favorite_player(uuid) to authenticated;

-- B) FERMETURE SYSTÉMATIQUE D'`anon` (défense en profondeur). Toutes les RPC d'avant le lot 80
--    n'ont jamais eu leur `revoke … from public, anon` explicite : elles restent exécutables par
--    le rôle `anon` (clé publique embarquée dans l'app + le bundle web). AUCUNE n'est aujourd'hui
--    exploitable (toutes se gardent par `auth.uid()` / `can_manage_club` / rôle — un appel anon
--    n'obtient rien), MAIS la doctrine des lots B/C/D est de fermer `anon` partout. On le fait ici
--    en bloc, en préservant `authenticated` (grant explicite) et en épargnant :
--      • `phone_available` — pré-check d'inscription, appelé AVANT d'avoir un compte (anon légitime) ;
--      • les fonctions TRIGGER (non appelables en RPC ; le grant n'a aucun effet sur elles).
--    Rappel (cf. commentaire SQL 80) : `revoke from anon` SEUL est inopérant tant que PUBLIC
--    porte le grant par défaut → on révoque de `public, anon` ET on re-grant `authenticated`.
--
--    ⚠️ On ne cible QUE les fonctions `SECURITY DEFINER` (`prosecdef`) : ce sont les seules à
--    RISQUE (elles s'exécutent en tant que PROPRIÉTAIRE, contournant la RLS). Une fonction SQL
--    normale (non-secdef) s'exécute avec les droits de l'APPELANT → un anon n'y gagne rien qu'il
--    ne puisse déjà faire. Ça épargne aussi les internes de l'extension `btree_gist` (gbt_*,
--    *_dist — args `internal`, non appelables en RPC, appartenant à l'extension).
do $$
declare
  r record;
begin
  for r in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f' -- fonctions normales (pas agrégats/procédures)
      and p.prosecdef -- SEULEMENT les SECURITY DEFINER (la classe à risque)
      and p.prorettype <> 'pg_catalog.trigger'::regtype -- pas les fonctions trigger (non RPC)
      and has_function_privilege('anon', p.oid, 'execute') -- seulement celles encore ouvertes à anon
      and p.proname <> 'phone_available' -- pré-check d'inscription : anon légitime
  loop
    execute format('revoke execute on function public.%I(%s) from public, anon;', r.proname, r.args);
    execute format('grant execute on function public.%I(%s) to authenticated;', r.proname, r.args);
  end loop;
end $$;
