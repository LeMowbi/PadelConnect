-- 81 — MATCHS OUVERTS INTELLIGENTS (chantier v3, lot B).
-- À coller dans Supabase → SQL Editor → Run. Idempotent.
--
-- 1) FOURCHETTE DE NIVEAU sur les matchs ouverts : le créateur fixe [min, max] (optionnel) ;
--    `join_open_match` REFUSE côté serveur un joueur hors fourchette ('level') — pas un simple
--    masquage d'affichage. `fetch_open_matches` expose la fourchette (recréée : signature change).
-- 2) ALERTES « un match à ton niveau vient d'ouvrir » : préférence `profiles.match_alerts` +
--    table `club_followers` (suivre un club — brique PARTAGÉE avec les annonces club, SQL 83).
--    Le ciblage vit dans notify-club (branche INSERT reservations, plafond 100).
-- 3) LISTE D'ATTENTE sur créneau complet : `slot_waitlist` + join/leave ; notify-club pousse
--    « un créneau s'est libéré » sur annulation (joueur OU club) puis SUPPRIME les entrées
--    notifiées (alerte one-shot, premier arrivé premier servi).

-- ── 1) Fourchette de niveau ─────────────────────────────────────────────────────

alter table public.reservations add column if not exists open_level_min numeric;
alter table public.reservations add column if not exists open_level_max numeric;

do $$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'reservations_open_level_range_chk'
                   and conrelid = 'public.reservations'::regclass) then
    alter table public.reservations add constraint reservations_open_level_range_chk check (
      (open_level_min is null or (open_level_min >= 1 and open_level_min <= 7))
      and (open_level_max is null or (open_level_max >= 1 and open_level_max <= 7))
      and (open_level_min is null or open_level_max is null or open_level_min <= open_level_max)
    );
  end if;
end $$;

-- join_open_match : recopie STRICTE de la 57 + garde de fourchette ('level').
create or replace function public.join_open_match(p_id uuid)
returns text -- 'ok' | 'full' | 'gone' | 'own' | 'already' | 'forbidden' | 'level'
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_name text;
  v_entry_id text;
  v_cap int;
  v_level numeric;
begin
  if auth.uid() is null then return 'forbidden'; end if;
  select * into r from public.reservations
    where id = p_id and status = 'booked' and open_match
    for update;
  if r.id is null or r.starts_at <= (extract(epoch from now()) * 1000)::bigint then return 'gone'; end if;
  if r.user_id = auth.uid() then return 'own'; end if;
  -- Blocage (exigé par l'App Store 1.2, garde ajoutée en 53) : un compte bloqué — dans un sens
  -- OU l'autre — ne peut pas rejoindre le match. RÉ-INSÉRÉ ici car cette redéfinition de
  -- join_open_match (57, pour open_capacity) écrase celle de la 53 : sans ce bloc, le blocage des
  -- matchs ouverts serait silencieusement levé à l'application des migrations v2.
  if exists (select 1 from public.blocked_users b
             where (b.blocker_id = r.user_id and b.blocked_id = auth.uid())
                or (b.blocker_id = auth.uid() and b.blocked_id = r.user_id)) then
    return 'gone';
  end if;
  -- Fourchette de niveau (81) : si le créateur en a fixé une, le niveau du joueur doit y entrer
  -- (refus SERVEUR — le client affiche « Ce match cherche un niveau X–Y »).
  if r.open_level_min is not null or r.open_level_max is not null then
    select level into v_level from public.profiles where id = auth.uid();
    if v_level is null
       or (r.open_level_min is not null and v_level < r.open_level_min)
       or (r.open_level_max is not null and v_level > r.open_level_max) then
      return 'level';
    end if;
  end if;
  if exists (select 1 from public.reservation_participants rp
             where rp.reservation_id = p_id and rp.user_id = auth.uid() and rp.status <> 'declined') then
    return 'already';
  end if;
  v_cap := coalesce(r.open_capacity, 4);
  if coalesce(case when jsonb_typeof(r.invited) = 'array' then jsonb_array_length(r.invited) end, 0) >= v_cap - 1 then
    return 'full';
  end if;
  select coalesce(nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), 'Un joueur')
    into v_name from public.profiles p where p.id = auth.uid();
  insert into public.reservation_participants (reservation_id, user_id, status)
    values (p_id, auth.uid(), 'accepted')
    on conflict (reservation_id, user_id) do update set status = 'accepted';
  v_entry_id := 'open-' || auth.uid();
  if not exists (select 1 from jsonb_array_elements(coalesce(case when jsonb_typeof(r.invited) = 'array' then r.invited end, '[]'::jsonb)) e
                 where e ->> 'id' = v_entry_id) then
    update public.reservations
      set invited = coalesce(case when jsonb_typeof(invited) = 'array' then invited end, '[]'::jsonb)
                    || jsonb_build_object('id', v_entry_id, 'name', v_name, 'confirmed', true),
          players = least(v_cap, coalesce(players, 1) + 1)
      where id = p_id;
  end if;
  return 'ok';
end;
$$;

-- fetch_open_matches : la SIGNATURE de retour change (2 colonnes ajoutées EN FIN) → drop + create
-- (convention §8). Recopie stricte de la 68 sinon.
drop function if exists public.fetch_open_matches();
create function public.fetch_open_matches()
returns table (
  id uuid, club_id text, club_name text, date_key text, date_label text, "time" text, court text,
  starts_at bigint, open_level text, creator_id uuid, creator_name text, places_left int, capacity int,
  duration_min int, open_level_min numeric, open_level_max numeric
)
language sql
security definer
set search_path = public
stable
as $$
  select r.id, r.club_id, r.club_name, r.date_key, r.date_label, r."time", r.court, r.starts_at,
         r.open_level, r.user_id,
         case
           when coalesce(trim(r.booked_by_name), '') = '' then 'Un joueur'
           else split_part(trim(r.booked_by_name), ' ', 1) ||
                case when split_part(trim(r.booked_by_name), ' ', 2) <> ''
                     then ' ' || left(split_part(trim(r.booked_by_name), ' ', 2), 1) || '.'
                     else '' end
         end,
         greatest(0, coalesce(r.open_capacity, 4) - 1
           - coalesce(case when jsonb_typeof(r.invited) = 'array' then jsonb_array_length(r.invited) end, 0))::int,
         coalesce(r.open_capacity, 4)::int,
         coalesce(r.duration_min, 90)::int,
         r.open_level_min,
         r.open_level_max
    from public.reservations r
    where r.status = 'booked'
      and r.open_match
      and r.starts_at > (extract(epoch from now()) * 1000)::bigint
      and coalesce(case when jsonb_typeof(r.invited) = 'array' then jsonb_array_length(r.invited) end, 0)
          < coalesce(r.open_capacity, 4) - 1
    order by r.starts_at;
$$;

-- ── 2) Alertes de match + suivi de club ─────────────────────────────────────────

alter table public.profiles add column if not exists match_alerts boolean not null default false;

create table if not exists public.club_followers (
  user_id uuid not null references public.profiles (id) on delete cascade,
  club_id text not null check (length(club_id) between 1 and 64),
  created_at timestamptz not null default now(),
  primary key (user_id, club_id)
);
create index if not exists club_followers_by_club on public.club_followers (club_id);

alter table public.club_followers enable row level security;
drop policy if exists club_followers_select_own on public.club_followers;
create policy club_followers_select_own on public.club_followers
  for select using (user_id = auth.uid());
-- Écritures via la RPC (validation + un seul point d'entrée).

create or replace function public.toggle_club_follow(p_club_id text)
returns text -- 'added' | 'removed' | 'error'
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_club text := nullif(trim(coalesce(p_club_id, '')), '');
begin
  if v_uid is null or v_club is null or length(v_club) > 64 then return 'error'; end if;
  if exists (select 1 from public.club_followers where user_id = v_uid and club_id = v_club) then
    delete from public.club_followers where user_id = v_uid and club_id = v_club;
    return 'removed';
  end if;
  insert into public.club_followers (user_id, club_id) values (v_uid, v_club)
    on conflict do nothing;
  return 'added';
end;
$$;

revoke execute on function public.toggle_club_follow(text) from anon;

-- ── 3) Liste d'attente sur créneau complet ──────────────────────────────────────

create table if not exists public.slot_waitlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  club_id text not null check (length(club_id) between 1 and 64),
  date_key text not null check (date_key ~ '^\d{4}-\d{2}-\d{2}$'),
  "time" text not null check ("time" ~ '^\d{2}:\d{2}$'),
  duration_min int not null default 90 check (duration_min in (60, 90)),
  created_at timestamptz not null default now(),
  unique (user_id, club_id, date_key, "time")
);
create index if not exists slot_waitlist_by_slot on public.slot_waitlist (club_id, date_key);

alter table public.slot_waitlist enable row level security;
drop policy if exists slot_waitlist_select_own on public.slot_waitlist;
create policy slot_waitlist_select_own on public.slot_waitlist
  for select using (user_id = auth.uid());
-- Écritures via RPC (validation du créneau + purge).

-- Départ en millisecondes d'un (jour, heure) — EXPRESSION IDENTIQUE à la garde d'insertion des
-- réservations (68 : `extract(epoch from (date_key || ' ' || time)::timestamp) * 1000`) pour que
-- la liste d'attente et startsAt vivent dans le même référentiel (UTC fixe, décision d'archi).
create or replace function public.slot_start_ms(p_date_key text, p_time text)
returns bigint
language sql
immutable
as $$
  select (extract(epoch from (p_date_key || ' ' || p_time)::timestamp) * 1000)::bigint;
$$;

create or replace function public.join_slot_waitlist(p_club_id text, p_date_key text, p_time text, p_duration int default 90)
returns text -- 'ok' | 'past' | 'error'
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if v_uid is null then return 'error'; end if;
  if coalesce(p_club_id, '') = '' or p_date_key !~ '^\d{4}-\d{2}-\d{2}$' or p_time !~ '^\d{2}:\d{2}$'
     or p_duration not in (60, 90) then
    return 'error';
  end if;
  -- Purge best-effort de MES attentes passées (l'alerte one-shot supprime déjà les notifiées).
  delete from public.slot_waitlist
    where user_id = v_uid and public.slot_start_ms(date_key, "time") < v_now;
  if public.slot_start_ms(p_date_key, p_time) <= v_now then return 'past'; end if;
  insert into public.slot_waitlist (user_id, club_id, date_key, "time", duration_min)
    values (v_uid, p_club_id, p_date_key, p_time, p_duration)
    on conflict (user_id, club_id, date_key, "time") do update set duration_min = excluded.duration_min;
  return 'ok';
end;
$$;

create or replace function public.leave_slot_waitlist(p_club_id text, p_date_key text, p_time text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return false; end if;
  delete from public.slot_waitlist
    where user_id = auth.uid() and club_id = p_club_id and date_key = p_date_key and "time" = p_time;
  return found;
end;
$$;

revoke execute on function public.join_slot_waitlist(text, text, text, int) from anon;
revoke execute on function public.leave_slot_waitlist(text, text, text) from anon;
