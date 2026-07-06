-- PadelConnect — SQL 51 : MODÉRATION UGC + CONFIDENTIALITÉ (audit n°6). Idempotent, rejouable.
-- À coller dans Supabase → SQL Editor → Run (« Success. No rows returned »).
--
--   1. MODÉRATION (App Store Guideline 1.2 + Google Play) : tout contenu public rédigé par un
--      joueur (avis de club, prénom dans les matchs ouverts) doit pouvoir être SIGNALÉ et son
--      auteur BLOQUÉ. Deux tables (review_reports, blocked_users) + report/block/unblock/fetch.
--   2. CONFIDENTIALITÉ des matchs ouverts : on ne stocke plus le téléphone du créateur sur une
--      réservation « match ouvert » (il n'est jamais affiché et pouvait être récolté en rejoignant
--      chaque match). Trigger + purge des données existantes.

-- ── Signalements d'avis (lecture réservée à l'opérateur ; le joueur crée les siens) ──
create table if not exists public.review_reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews (id) on delete cascade,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  unique (review_id, reporter_id) -- un même joueur ne signale qu'une fois le même avis
);

alter table public.review_reports enable row level security;

-- Le signaleur voit/crée SES signalements ; l'opérateur les lit tous (modération sous 24 h).
drop policy if exists "review_reports_insert_own" on public.review_reports;
create policy "review_reports_insert_own" on public.review_reports
  for insert with check (reporter_id = auth.uid());
drop policy if exists "review_reports_read_own_or_operator" on public.review_reports;
create policy "review_reports_read_own_or_operator" on public.review_reports
  for select using (
    reporter_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'operator')
  );

-- ── Blocages entre joueurs (chacun gère SA liste) ──
create table if not exists public.blocked_users (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

alter table public.blocked_users enable row level security;

drop policy if exists "blocked_users_rw_own" on public.blocked_users;
create policy "blocked_users_rw_own" on public.blocked_users
  for all using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

-- Signaler un avis (idempotent : un 2ᵉ signalement du même avis par le même joueur est un no-op).
create or replace function public.report_review(p_review_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return false; end if;
  insert into public.review_reports (review_id, reporter_id, reason)
    values (p_review_id, auth.uid(), nullif(trim(coalesce(p_reason, '')), ''))
    on conflict (review_id, reporter_id) do nothing;
  return true;
end;
$$;

grant execute on function public.report_review(uuid, text) to authenticated;
revoke execute on function public.report_review(uuid, text) from public, anon;

-- Bloquer / débloquer un joueur (jamais soi-même). Idempotent.
create or replace function public.block_user(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or p_user_id is null or p_user_id = auth.uid() then return false; end if;
  insert into public.blocked_users (blocker_id, blocked_id)
    values (auth.uid(), p_user_id)
    on conflict (blocker_id, blocked_id) do nothing;
  return true;
end;
$$;

grant execute on function public.block_user(uuid) to authenticated;
revoke execute on function public.block_user(uuid) from public, anon;

create or replace function public.unblock_user(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return false; end if;
  delete from public.blocked_users where blocker_id = auth.uid() and blocked_id = p_user_id;
  return true;
end;
$$;

grant execute on function public.unblock_user(uuid) to authenticated;
revoke execute on function public.unblock_user(uuid) from public, anon;

-- Ma liste de comptes bloqués (pour filtrer avis + matchs ouverts côté app).
create or replace function public.fetch_blocked_users()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select blocked_id from public.blocked_users where blocker_id = auth.uid();
$$;

grant execute on function public.fetch_blocked_users() to authenticated;
revoke execute on function public.fetch_blocked_users() from public, anon;

-- ── 2) Confidentialité des matchs ouverts : jamais le téléphone du créateur ──
-- fetch_open_matches est PUBLIC et join_open_match rend l'appelant participant → la policy
-- « participant » lui ouvrirait la ligne reservations, dont booked_by_phone. Un compte pouvait
-- rejoindre chaque match, lire le numéro du créateur, puis repartir (récolte de masse). Ce numéro
-- n'est JAMAIS affiché pour un match ouvert → on le retire à l'écriture dès qu'une réservation est
-- (ou devient) un match ouvert. Les réservations privées normales (invités choisis par le
-- créateur, non énumérables publiquement) gardent leur comportement.
create or replace function public.strip_open_match_phone()
returns trigger
language plpgsql
as $$
begin
  if new.open_match then new.booked_by_phone := null; end if;
  return new;
end;
$$;

drop trigger if exists trg_strip_open_match_phone on public.reservations;
create trigger trg_strip_open_match_phone
  before insert or update on public.reservations
  for each row execute function public.strip_open_match_phone();

-- Purge des matchs ouverts DÉJÀ créés qui portent encore un numéro (avant ce durcissement).
update public.reservations set booked_by_phone = null where open_match and booked_by_phone is not null;
