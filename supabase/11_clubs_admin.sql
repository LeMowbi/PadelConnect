-- PadelConnect — outils opérateur sur les clubs (à coller dans Supabase → SQL Editor → Run).
-- Idempotent. Ajoute le statut « Bientôt » (coming_soon) et deux fonctions réservées à
-- l'opérateur : changer le statut d'un club, et donner l'accès gérant à un compte.
--
-- Modèle de statut d'un club (colonne clubs.status, créée en 07_clubs.sql) :
--   active       → visible ET réservable par les joueurs
--   coming_soon  → visible mais « Bientôt » (pas encore réservable) : on peut référencer un
--                  club avant qu'il ait fini de s'inscrire, pour montrer qu'il arrive
--   hidden       → invisible des joueurs (brouillon / retiré)

-- ─── Les joueurs voient AUSSI les clubs « Bientôt » (lecture seule) ───────────
-- 07_clubs.sql n'autorisait que status='active'. On élargit aux 'coming_soon' pour
-- l'affichage (la non-réservabilité est gérée côté app).
drop policy if exists "clubs_select_active" on public.clubs;
-- Idempotence : on droppe AUSSI le nom réellement créé ci-dessous, sinon un 2ᵉ rejeu du fichier
-- (le porteur recolle régulièrement) échouait avec « policy clubs_select_visible already exists ».
drop policy if exists "clubs_select_visible" on public.clubs;
create policy "clubs_select_visible" on public.clubs
  for select using (status in ('active', 'coming_soon'));

-- ─── Changer le statut d'un club (opérateur uniquement) ───────────────────────
create or replace function public.set_club_status(p_id text, p_status text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'operator') then
    return false; -- réservé à l'opérateur
  end if;
  if p_status not in ('active', 'coming_soon', 'hidden') then
    return false; -- statut inconnu refusé
  end if;
  update public.clubs set status = p_status where id = p_id;
  return found;
end;
$$;

revoke execute on function public.set_club_status(text, text) from public, anon;
grant execute on function public.set_club_status(text, text) to authenticated;

-- ─── Donner l'accès gérant à un compte pour un club : voir la 55 (multi-clubs) ─
-- ⚠️ `grant_club_access` N'EST PLUS définie ici. Elle vit UNIQUEMENT dans
-- `55_multi_clubs.sql` (version « multi-clubs » : elle AJOUTE le club dans `manager_clubs`
-- en plus de poser `managed_club_id`). L'ancienne version de ce fichier écrasait celle de la
-- 55 quand on recollait la 11 après la 55 → le gérant perdait son 1ᵉʳ club. Ne jamais la
-- redéfinir ici. (Si tu viens de recoller la 11, recolle la 55 pour restaurer la bonne version.)

-- ─── Créer un club « Bientôt » directement (opérateur) ────────────────────────
-- Pré-charge un club côté serveur sans demande préalable (statut coming_soon par défaut).
-- Renvoie l'id généré (slug du nom). Réservé à l'opérateur.
create or replace function public.create_club(p_name text, p_area text, p_type text, p_courts integer, p_price_from integer)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id text;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'operator') then
    return null; -- réservé à l'opérateur
  end if;
  new_id := left(regexp_replace(lower(coalesce(p_name, 'club')), '[^a-z0-9]+', '-', 'g'), 24);
  new_id := trim(both '-' from new_id);
  if new_id = '' then new_id := 'club'; end if;
  -- suffixe court dérivé de l'horloge pour éviter les collisions de slug
  new_id := new_id || '-' || substr(md5(p_name || now()::text), 1, 6);
  insert into public.clubs (id, name, area, type, courts, price_from, status)
    values (
      new_id,
      p_name,
      nullif(p_area, ''),
      coalesce(nullif(p_type, ''), 'Mixte'),
      greatest(1, coalesce(p_courts, 1)),
      greatest(0, coalesce(p_price_from, 10000)),
      'coming_soon'
    );
  return new_id;
end;
$$;

revoke execute on function public.create_club(text, text, text, integer, integer) from public, anon;
grant execute on function public.create_club(text, text, text, integer, integer) to authenticated;
