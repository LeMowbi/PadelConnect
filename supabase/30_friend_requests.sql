-- PadelConnect — DEMANDES D'AMI (à coller dans Supabase → SQL Editor → Run). Idempotent.
--
-- AVANT : add_friend_by_phone ajoutait l'ami INSTANTANÉMENT et dans un seul sens — la personne
-- n'avait pas son mot à dire et ne te voyait même pas en retour. MAINTENANT : on envoie une
-- DEMANDE ; si la personne est sur PadelConnect, elle reçoit une notification et ACCEPTE ou
-- REFUSE. L'amitié ne devient réelle (et MUTUELLE, dans les deux sens) qu'après acceptation.
--
-- La table `friends` (25_friends.sql) reste la liste des amitiés ACCEPTÉES. On ajoute ici la
-- table des demandes en attente + les fonctions SECURITY DEFINER (on n'expose jamais profiles).

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending', -- pending | accepted | declined
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (from_user, to_user),
  check (from_user <> to_user)
);

alter table public.friend_requests enable row level security;

-- Je vois les demandes que J'AI envoyées ou que J'AI reçues (pour l'affichage et le webhook push).
drop policy if exists "friend_requests_select" on public.friend_requests;
create policy "friend_requests_select" on public.friend_requests for select using (auth.uid() = from_user or auth.uid() = to_user);

-- Écritures uniquement via les RPC ci-dessous (SECURITY DEFINER) : pas d'INSERT/UPDATE direct.

-- ── Envoyer une demande d'ami par numéro ──────────────────────────────────────
-- Résout le numéro → joueur (10 derniers chiffres). Renvoie un statut clair :
--   not_found      : personne avec ce numéro sur PadelConnect
--   already_friends: on est déjà amis
--   pending        : une demande de ma part existe déjà (en attente)
--   accepted       : la personne m'avait déjà envoyé une demande → on devient amis tout de suite
--   sent           : demande créée, en attente de sa réponse
create or replace function public.send_friend_request(p_phone text)
returns table (status text, friend_id uuid, name text, level numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  fid uuid;
  reverse_id uuid;
  fname text;
  flevel numeric;
begin
  if length(regexp_replace(p_phone, '\D', '', 'g')) < 8 then
    return query select 'not_found'::text, null::uuid, null::text, null::numeric;
    return;
  end if;
  select p.id into fid from public.profiles p
    where right(regexp_replace(p.phone, '\D', '', 'g'), 10) = right(regexp_replace(p_phone, '\D', '', 'g'), 10)
      and p.id <> me
    limit 1;
  if fid is null then
    return query select 'not_found'::text, null::uuid, null::text, null::numeric;
    return;
  end if;
  select trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), p.level
    into fname, flevel from public.profiles p where p.id = fid;

  -- Déjà amis ?
  if exists (select 1 from public.friends where user_id = me and friend_id = fid) then
    return query select 'already_friends'::text, fid, fname, flevel;
    return;
  end if;

  -- La personne m'a-t-elle DÉJÀ envoyé une demande ? → on accepte automatiquement (lien mutuel).
  select id into reverse_id from public.friend_requests
    where from_user = fid and to_user = me and status = 'pending' limit 1;
  if reverse_id is not null then
    update public.friend_requests set status = 'accepted', responded_at = now() where id = reverse_id;
    insert into public.friends (user_id, friend_id) values (me, fid), (fid, me) on conflict do nothing;
    return query select 'accepted'::text, fid, fname, flevel;
    return;
  end if;

  -- Ma demande existe-t-elle déjà (en attente) ? Sinon on la crée (ou on la ré-arme si refusée).
  if exists (select 1 from public.friend_requests where from_user = me and to_user = fid and status = 'pending') then
    return query select 'pending'::text, fid, fname, flevel;
    return;
  end if;
  insert into public.friend_requests (from_user, to_user, status, created_at, responded_at)
    values (me, fid, 'pending', now(), null)
    on conflict (from_user, to_user) do update set status = 'pending', created_at = now(), responded_at = null;
  return query select 'sent'::text, fid, fname, flevel;
end;
$$;

grant execute on function public.send_friend_request(text) to authenticated;

-- ── Répondre à une demande reçue (accepter / refuser) ─────────────────────────
-- Seul le DESTINATAIRE (to_user) peut répondre. Accepter crée le lien dans les DEUX sens.
create or replace function public.respond_friend_request(p_request_id uuid, p_accept boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  r public.friend_requests%rowtype;
begin
  select * into r from public.friend_requests where id = p_request_id and to_user = me and status = 'pending';
  if r.id is null then
    return false; -- demande inexistante, déjà traitée, ou pas pour moi
  end if;
  if p_accept then
    update public.friend_requests set status = 'accepted', responded_at = now() where id = r.id;
    insert into public.friends (user_id, friend_id) values (r.from_user, r.to_user), (r.to_user, r.from_user) on conflict do nothing;
  else
    update public.friend_requests set status = 'declined', responded_at = now() where id = r.id;
  end if;
  return true;
end;
$$;

grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;

-- ── Mes demandes REÇUES en attente (avec le profil de l'expéditeur) ───────────
create or replace function public.fetch_friend_requests()
returns table (request_id uuid, from_id uuid, name text, level numeric, created_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select fr.id, fr.from_user,
    trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')),
    p.level, fr.created_at
  from public.friend_requests fr
  join public.profiles p on p.id = fr.from_user
  where fr.to_user = auth.uid() and fr.status = 'pending'
  order by fr.created_at desc;
$$;

grant execute on function public.fetch_friend_requests() to authenticated;

-- ── Retirer un ami : on casse le lien dans les DEUX sens (amitié mutuelle) ─────
-- Redéfinit la version de 25_friends.sql (qui ne supprimait qu'un sens). On nettoie aussi une
-- éventuelle demande archivée entre les deux, pour pouvoir se ré-inviter plus tard.
create or replace function public.remove_friend(p_friend_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  delete from public.friends where (user_id = me and friend_id = p_friend_id) or (user_id = p_friend_id and friend_id = me);
  delete from public.friend_requests where (from_user = me and to_user = p_friend_id) or (from_user = p_friend_id and to_user = me);
  return true;
end;
$$;

grant execute on function public.remove_friend(uuid) to authenticated;

-- add_friend_by_phone (25_friends.sql) n'est plus appelée par l'app (remplacée par la demande).
-- On la retire pour éviter tout ajout instantané non consenti à l'avenir.
drop function if exists public.add_friend_by_phone(text);
