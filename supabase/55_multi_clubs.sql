-- PadelConnect — MULTI-CLUBS (SQL Editor → Run). Idempotent.
--
-- Un même compte (même numéro) peut désormais gérer PLUSIEURS clubs (demande porteur) :
-- - `manager_clubs` liste TOUS les clubs autorisés d'un gérant ;
-- - `profiles.managed_club_id` reste le club ACTIF (un seul à la fois) → AUCUN des contrôles
--   existants (can_manage_club, upsert_club_config, RLS des réservations, blocages, coachs…)
--   ne change : ils continuent de vérifier le club actif ;
-- - le gérant bascule de club depuis l'Espace Club (`switch_managed_club`), qui recharge tout ;
-- - donner l'accès à un 2ᵉ club AJOUTE (au lieu de remplacer) ; retirer l'accès retire TOUT.

-- ─── 1) Les clubs autorisés d'un gérant ─────────────────────────────────────────
create table if not exists public.manager_clubs (
  user_id uuid not null references auth.users (id) on delete cascade,
  club_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, club_id)
);

alter table public.manager_clubs enable row level security;
-- Chacun lit SES clubs autorisés (l'Espace Club affiche le sélecteur) ; écritures via RPC.
drop policy if exists manager_clubs_select_own on public.manager_clubs;
create policy manager_clubs_select_own on public.manager_clubs for select to authenticated
  using (user_id = auth.uid());

-- Reprise de l'existant : chaque gérant actuel garde son club (recollable sans doublon).
insert into public.manager_clubs (user_id, club_id)
  select p.id, p.managed_club_id from public.profiles p
  where p.role = 'club' and p.managed_club_id is not null
  on conflict (user_id, club_id) do nothing;

-- ─── 2) Basculer de club actif (le gérant, depuis l'Espace Club) ────────────────
drop function if exists public.switch_managed_club(text);
create or replace function public.switch_managed_club(p_club_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Seul un club AUTORISÉ (listé dans manager_clubs) peut devenir actif.
  if not exists (select 1 from public.manager_clubs mc where mc.user_id = auth.uid() and mc.club_id = p_club_id) then
    return false;
  end if;
  update public.profiles set role = 'club', managed_club_id = p_club_id where id = auth.uid();
  return true;
end;
$$;

grant execute on function public.switch_managed_club(text) to authenticated;
revoke execute on function public.switch_managed_club(text) from public, anon;

-- ─── 3) Donner l'accès = AJOUTER un club (plus jamais écraser le précédent) ─────
create or replace function public.grant_club_access_by_phone(p_phone text, p_club_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
  full_name text;
  matches int;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'operator') then
    return null; -- réservé à l'opérateur
  end if;
  if coalesce(p_club_id, '') = '' or length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 8 then
    return null;
  end if;
  select count(*) into matches from public.profiles p
    where right(regexp_replace(p.phone, '\D', '', 'g'), 10) = right(regexp_replace(p_phone, '\D', '', 'g'), 10);
  if matches <> 1 then
    return null; -- 0 = introuvable ; >1 = AMBIGU → on refuse (anti-usurpation)
  end if;
  select p.id, trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
    into target, full_name
  from public.profiles p
  where right(regexp_replace(p.phone, '\D', '', 'g'), 10) = right(regexp_replace(p_phone, '\D', '', 'g'), 10);
  -- Multi-clubs (55) : le nouveau club S'AJOUTE à la liste et devient le club ACTIF —
  -- le gérant retrouve ses autres clubs via le sélecteur de l'Espace Club.
  insert into public.manager_clubs (user_id, club_id) values (target, p_club_id)
    on conflict (user_id, club_id) do nothing;
  update public.profiles set role = 'club', managed_club_id = p_club_id where id = target;
  return coalesce(nullif(full_name, ''), 'Gérant');
end;
$$;

grant execute on function public.grant_club_access_by_phone(text, text) to authenticated;
revoke execute on function public.grant_club_access_by_phone(text, text) from public, anon;

-- ─── 4) Retirer l'accès = retirer TOUS ses clubs (l'opérateur re-donne au besoin) ─
create or replace function public.revoke_club_access_by_phone(p_phone text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
  full_name text;
  matches int;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'operator') then
    return null;
  end if;
  if length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 8 then
    return null;
  end if;
  select count(*) into matches from public.profiles p
    where right(regexp_replace(p.phone, '\D', '', 'g'), 10) = right(regexp_replace(p_phone, '\D', '', 'g'), 10);
  if matches <> 1 then
    return null; -- ambigu → on refuse
  end if;
  select p.id, trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
    into target, full_name
  from public.profiles p
  where right(regexp_replace(p.phone, '\D', '', 'g'), 10) = right(regexp_replace(p_phone, '\D', '', 'g'), 10);
  delete from public.manager_clubs where user_id = target;
  update public.profiles set role = 'player', managed_club_id = null where id = target;
  return coalesce(nullif(full_name, ''), 'Joueur');
end;
$$;

grant execute on function public.revoke_club_access_by_phone(text) to authenticated;
revoke execute on function public.revoke_club_access_by_phone(text) from public, anon;

-- ─── 5) delete_club : nettoyer aussi manager_clubs, sans « dégrader » un multi-gérant ─
-- Reprend la version de la 53 et remplace la rétrogradation brute par : on retire le club de
-- toutes les listes ; un gérant dont c'était le club ACTIF bascule sur un autre de SES clubs
-- s'il en a, sinon il redevient joueur.
create or replace function public.delete_club(p_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'operator') then
    return false; -- réservé à l'opérateur
  end if;
  delete from public.club_config where club_id = p_id;
  delete from public.club_overrides where club_id = p_id;
  delete from public.club_status where club_id = p_id;
  delete from public.club_commission where club_id = p_id;
  delete from public.club_boost where club_id = p_id;
  delete from public.blocked_slots where club_id = p_id;
  delete from public.blocked_ranges where club_id = p_id;
  -- Avis du club (les signalements liés partent en cascade) — comme promis à la confirmation.
  delete from public.reviews where club_id = p_id;
  -- Ses coachs redeviennent de simples joueurs (sinon : coach fantôme, deadlock 'other_club',
  -- demandes de cours en attente sur un club disparu).
  update public.coaches set active = false where club_id = p_id;
  update public.lessons set status = 'declined', responded_at = now()
    where club_id = p_id and status = 'pending';
  -- Multi-clubs (55) : le club disparaît des listes ; le club ACTIF de chaque gérant concerné
  -- bascule sur un autre de ses clubs, ou il redevient joueur s'il n'en a plus.
  delete from public.manager_clubs where club_id = p_id;
  update public.profiles p
    set managed_club_id = (select mc.club_id from public.manager_clubs mc where mc.user_id = p.id order by mc.created_at limit 1)
    where p.managed_club_id = p_id;
  update public.profiles p
    set role = 'player', managed_club_id = null
    where p.managed_club_id is null and p.role = 'club'
      and not exists (select 1 from public.manager_clubs mc where mc.user_id = p.id);
  delete from public.clubs where id = p_id;
  return true;
end;
$$;

grant execute on function public.delete_club(text) to authenticated;
revoke execute on function public.delete_club(text) from public, anon;
