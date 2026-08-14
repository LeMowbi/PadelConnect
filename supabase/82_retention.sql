-- 82 — RÉTENTION (chantier v3, lot C) : americano auto-géré, fidélité, agenda du padel.
-- À coller dans Supabase → SQL Editor → Run. Idempotent.
--
-- 1) AMERICANO AUTO-GÉRÉ : l'état du tournoi (joueurs, rondes générées, scores saisis) vit dans
--    `competitions.americano` (jsonb), écrit par l'ORGANISATEUR (ou l'opérateur) via
--    `save_americano_state` — borné en taille, jamais sur un tournoi clôturé. La génération des
--    rondes et le classement sont CLIENT (src/lib/americano.ts, pur et testé) : le serveur ne
--    stocke qu'un état d'affichage, la clôture officielle reste close_competition.
-- 2) FIDÉLITÉ « 10 parties = 1 récompense » : compteur = parties RÉELLEMENT jouées (résas
--    'booked' passées, créateur ou participant accepté — même base que les +2 pts, pas
--    trichable) ; réclamations journalisées (un cycle = 10 parties, unique) ; le texte de la
--    récompense est réglé par l'opérateur dans `app_config` (table générique à liste blanche).
-- 3) AGENDA DU PADEL IVOIRIEN : table `events` éditée par l'opérateur, lisible par tous ;
--    push à la publication via le webhook `events` (INSERT+UPDATE, créé via l'API) — le rappel
--    de la veille est une notification LOCALE côté app (mécanique matchReminders).

-- ── 1) Americano ────────────────────────────────────────────────────────────────

alter table public.competitions add column if not exists americano jsonb;

create or replace function public.save_americano_state(p_id uuid, p_state jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comp record;
begin
  if auth.uid() is null then return false; end if;
  -- Taille bornée (l'état grandit avec rondes + scores ; 16 joueurs × 7 rondes ≪ 16 Ko) et
  -- forme minimale : un OBJET jsonb (le détail est validé côté client, l'état n'est qu'affiché).
  if p_state is null or jsonb_typeof(p_state) <> 'object' or pg_column_size(p_state) > 16384 then
    return false;
  end if;
  select id, organizer_id, club_id, status, format into v_comp
    from public.competitions where id = p_id
    for update;
  if v_comp.id is null or v_comp.status <> 'published' then return false; end if;
  -- Organisateur du tournoi, gérant du club hôte (tournoi club) ou opérateur.
  if v_comp.organizer_id <> auth.uid()
     and not public.can_manage_club(v_comp.club_id)
     and not exists (select 1 from public.profiles where id = auth.uid() and role = 'operator') then
    return false;
  end if;
  -- Réservé au format americano (le seul dont l'app génère les rondes).
  if position('americano' in lower(coalesce(v_comp.format, ''))) = 0 then return false; end if;
  update public.competitions set americano = p_state where id = p_id;
  return true;
end;
$$;

revoke execute on function public.save_americano_state(uuid, jsonb) from public, anon;

-- fetch_competitions : la SIGNATURE de retour change (colonne `americano` ajoutée EN FIN) →
-- drop + create (convention §8). Recopie STRICTE de la 68 sinon.
drop function if exists public.fetch_competitions();
create function public.fetch_competitions()
returns table (
  id uuid, organizer_id uuid, organizer_type text, organizer_name text, organizer_phone text,
  club_id text, club_name text, title text, format text, level text,
  date_key text, end_date_key text, courts text[], slots text[],
  capacity int, fee text, reward text, official boolean, status text, commission int,
  winner text, second text, third text, loser text, registered int, teams text[],
  reject_reason text, payment_status text, wave_link text, slot_durations int[], americano jsonb
)
language sql
security definer
set search_path = public
stable
as $$
  select c.id, c.organizer_id, c.organizer_type, c.organizer_name,
    case when c.organizer_id = auth.uid()
              or public.can_manage_club(c.club_id)
              or exists (select 1 from public.competition_registrations r
                           where r.competition_id = c.id and r.user_id = auth.uid())
         then c.organizer_phone else null end,
    c.club_id, c.club_name, c.title, c.format, c.level,
    c.date_key, c.end_date_key, c.courts, c.slots,
    c.capacity, c.fee, c.reward, c.official, c.status, c.commission,
    c.winner, c.second, c.third, c.loser,
    (select count(*) from public.competition_registrations r where r.competition_id = c.id)::int,
    (select coalesce(array_agg(trim(coalesce(pr.first_name, '') || ' & ' || rg.partner) order by rg.created_at), '{}')
       from public.competition_registrations rg
       join public.profiles pr on pr.id = rg.user_id
       where rg.competition_id = c.id),
    c.reject_reason,
    c.payment_status,
    (select tc.wave_link from public.tournament_config tc where tc.id = true),
    c.slot_durations,
    c.americano
  from public.competitions c
  where c.status in ('published', 'closed')
    or c.organizer_id = auth.uid()
    or public.can_manage_club(c.club_id);
$$;

-- ── 2) Réglages opérateur génériques (liste blanche) ───────────────────────────

create table if not exists public.app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_config enable row level security;
drop policy if exists app_config_select_all on public.app_config;
create policy app_config_select_all on public.app_config
  for select using (true); -- lisible par tous (réglages publics : texte de récompense…)
-- Écritures via la RPC uniquement (liste blanche).

create or replace function public.set_app_config(p_key text, p_value text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or not exists (select 1 from public.profiles where id = auth.uid() and role = 'operator') then
    return false;
  end if;
  -- LISTE BLANCHE : seules les clés prévues existent (pas un fourre-tout).
  if p_key not in ('loyalty_reward') then return false; end if;
  if p_value is null or length(p_value) > 300 then return false; end if;
  insert into public.app_config (key, value) values (p_key, p_value)
    on conflict (key) do update set value = excluded.value, updated_at = now();
  return true;
end;
$$;

revoke execute on function public.set_app_config(text, text) from public, anon;

-- ── 2bis) Fidélité ──────────────────────────────────────────────────────────────

create table if not exists public.loyalty_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  cycle int not null check (cycle >= 1),
  claimed_at timestamptz not null default now(),
  served boolean not null default false,
  served_at timestamptz,
  unique (user_id, cycle)
);

alter table public.loyalty_claims enable row level security;
drop policy if exists loyalty_claims_select_own on public.loyalty_claims;
create policy loyalty_claims_select_own on public.loyalty_claims
  for select using (user_id = auth.uid());
-- Écritures via RPC (validation du compteur) ; lecture opérateur via RPC dédiée.

-- Parties réellement JOUÉES (même base que les +2 pts du classement : résa 'booked' passée,
-- créateur OU participant accepté) + nombre de cycles déjà réclamés.
create or replace function public.my_loyalty()
returns table (played integer, claimed integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if v_uid is null then return; end if;
  return query
    select
      (select count(*) from public.reservations r
        where r.status = 'booked'
          and r.starts_at + (coalesce(r.duration_min, 90) * 60000) < v_now
          and (r.user_id = v_uid or exists (
                select 1 from public.reservation_participants rp
                where rp.reservation_id = r.id and rp.user_id = v_uid and rp.status = 'accepted')))::int,
      (select count(*) from public.loyalty_claims lc where lc.user_id = v_uid)::int;
end;
$$;

-- Réclamer la récompense du cycle suivant : exige 10 parties jouées de PLUS que les cycles
-- déjà réclamés. Journalisé (le club/opérateur voit la réclamation et la sert).
create or replace function public.claim_loyalty()
returns text -- 'ok' | 'not_yet' | 'error'
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_played int;
  v_claimed int;
begin
  if v_uid is null then return 'error'; end if;
  perform pg_advisory_xact_lock(hashtext('loyalty:' || v_uid::text));
  select played, claimed into v_played, v_claimed from public.my_loyalty();
  if v_played / 10 <= v_claimed then return 'not_yet'; end if;
  insert into public.loyalty_claims (user_id, cycle) values (v_uid, v_claimed + 1)
    on conflict do nothing;
  return 'ok';
end;
$$;

-- Réclamations à SERVIR (opérateur → Demandes) — avec le nom du joueur pour la remise en main
-- propre. L'opérateur marque « servie » après remise.
create or replace function public.fetch_loyalty_claims()
returns table (id uuid, user_id uuid, player_name text, cycle int, claimed_at timestamptz, served boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or not exists (select 1 from public.profiles where id = auth.uid() and role = 'operator') then
    return;
  end if;
  return query
    select lc.id, lc.user_id,
           coalesce(nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), 'Un joueur'),
           lc.cycle, lc.claimed_at, lc.served
      from public.loyalty_claims lc
      join public.profiles p on p.id = lc.user_id
      order by lc.served asc, lc.claimed_at desc
      limit 100;
end;
$$;

create or replace function public.serve_loyalty_claim(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or not exists (select 1 from public.profiles where id = auth.uid() and role = 'operator') then
    return false;
  end if;
  update public.loyalty_claims set served = true, served_at = now() where id = p_id and not served;
  return found;
end;
$$;

revoke execute on function public.my_loyalty() from public, anon;
revoke execute on function public.claim_loyalty() from public, anon;
revoke execute on function public.fetch_loyalty_claims() from public, anon;
revoke execute on function public.serve_loyalty_claim(uuid) from public, anon;

-- ── 3) Agenda du padel ivoirien ─────────────────────────────────────────────────

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 2 and 80),
  date_key text not null check (date_key ~ '^\d{4}-\d{2}-\d{2}$'),
  place text not null default '' check (length(place) <= 80),
  link text not null default '' check (length(link) <= 300),
  push boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null
);

alter table public.events enable row level security;
drop policy if exists events_select_all on public.events;
create policy events_select_all on public.events
  for select using (true); -- agenda public (lisible même déconnecté : accueil)
-- Écritures via RPC opérateur.

create or replace function public.upsert_event(
  p_id uuid, p_title text, p_date_key text, p_place text, p_link text, p_push boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_link text := trim(coalesce(p_link, ''));
begin
  if auth.uid() is null
     or not exists (select 1 from public.profiles where id = auth.uid() and role = 'operator') then
    return null;
  end if;
  -- Même règle de lien que l'actu opérateur : vide, ou https:// explicite.
  if v_link <> '' and v_link !~ '^https://' then return null; end if;
  if p_id is null then
    insert into public.events (title, date_key, place, link, push, created_by)
      values (trim(p_title), p_date_key, trim(coalesce(p_place, '')), v_link, coalesce(p_push, false), auth.uid())
      returning id into v_id;
  else
    update public.events
      set title = trim(p_title), date_key = p_date_key, place = trim(coalesce(p_place, '')),
          link = v_link, push = coalesce(p_push, false)
      where id = p_id
      returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.delete_event(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or not exists (select 1 from public.profiles where id = auth.uid() and role = 'operator') then
    return false;
  end if;
  delete from public.events where id = p_id;
  return found;
end;
$$;

revoke execute on function public.upsert_event(uuid, text, text, text, text, boolean) from public, anon;
revoke execute on function public.delete_event(uuid) from public, anon;
