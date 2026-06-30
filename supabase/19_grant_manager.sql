-- PadelConnect — donner l'accès gérant à un joueur PAR SON NUMÉRO (à coller dans
-- Supabase → SQL Editor → Run). Idempotent.
--
-- Scénario : le gérant d'un club crée d'abord un compte NORMAL (joueur) dans l'app.
-- L'opérateur lui attribue ensuite l'accès « Espace Club » en saisissant son numéro et en
-- choisissant le club. Vaut pour N'IMPORTE QUEL club, y compris les 9 clubs « de base »
-- embarqués (managed_club_id est un simple texte, sans clé étrangère) — contrairement à
-- grant_club_access(uuid, text) qui exigeait un club présent dans la table serveur.
--
-- Sécurité : réservé à l'opérateur. Le déclencheur protect_role (02_roles.sql) ne bloque que
-- l'auto-promotion (auth.uid() = id de la ligne) ; ici la cible est un AUTRE compte, donc la
-- promotion passe. Renvoie le nom du joueur promu, ou null si introuvable / non autorisé.

create or replace function public.grant_club_access_by_phone(p_phone text, p_club_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
  full_name text;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'operator') then
    return null; -- réservé à l'opérateur
  end if;
  if coalesce(p_club_id, '') = '' or length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 8 then
    return null; -- club ou numéro invalide
  end if;
  -- Match exact sur les 10 derniers chiffres (même règle que find_player_by_phone / participants).
  select p.id, trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
    into target, full_name
  from public.profiles p
  where right(regexp_replace(p.phone, '\D', '', 'g'), 10) = right(regexp_replace(p_phone, '\D', '', 'g'), 10)
  limit 1;
  if target is null then
    return null; -- aucun joueur avec ce numéro
  end if;
  update public.profiles set role = 'club', managed_club_id = p_club_id where id = target;
  return coalesce(nullif(full_name, ''), 'Gérant');
end;
$$;

grant execute on function public.grant_club_access_by_phone(text, text) to authenticated;

-- Retirer l'accès gérant (repasse le compte en joueur). Pratique si erreur de numéro.
create or replace function public.revoke_club_access_by_phone(p_phone text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
  full_name text;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'operator') then
    return null;
  end if;
  if length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 8 then
    return null;
  end if;
  select p.id, trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
    into target, full_name
  from public.profiles p
  where right(regexp_replace(p.phone, '\D', '', 'g'), 10) = right(regexp_replace(p_phone, '\D', '', 'g'), 10)
  limit 1;
  if target is null then
    return null;
  end if;
  update public.profiles set role = 'player', managed_club_id = null where id = target;
  return coalesce(nullif(full_name, ''), 'Joueur');
end;
$$;

grant execute on function public.revoke_club_access_by_phone(text) to authenticated;
