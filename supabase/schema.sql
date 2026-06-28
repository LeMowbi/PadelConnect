-- PadelConnect — schéma initial (à coller dans Supabase → SQL Editor → Run).
-- Crée les tables Profils + Réservations avec la sécurité (Row Level Security).
-- Idempotent : peut être relancé sans casser l'existant.

-- ─── PROFILS (1 par compte) ──────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text,
  last_name text,
  phone text,
  birth_date text,
  gender text,
  level numeric not null default 3.0,
  photo_uri text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- ─── RÉSERVATIONS ────────────────────────────────────────────────────────────
create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  club_id text not null,
  club_name text,
  date_key text,
  date_label text,
  "time" text,
  starts_at bigint,
  court text,
  price integer,
  players integer not null default 1,
  invited jsonb not null default '[]'::jsonb,
  booked_by_name text,
  booked_by_phone text,
  club_confirmed boolean not null default false,
  status text not null default 'booked',
  created_at timestamptz not null default now()
);

alter table public.reservations enable row level security;

-- Le joueur gère ses propres réservations.
drop policy if exists "reservations_select_own" on public.reservations;
create policy "reservations_select_own" on public.reservations
  for select using (auth.uid() = user_id);

drop policy if exists "reservations_insert_own" on public.reservations;
create policy "reservations_insert_own" on public.reservations
  for insert with check (auth.uid() = user_id);

drop policy if exists "reservations_delete_own" on public.reservations;
create policy "reservations_delete_own" on public.reservations
  for delete using (auth.uid() = user_id);

-- (Accès « côté club » — un gérant voit les réservations de SON club — sera ajouté
--  avec les comptes clubs, une fois les rôles en place.)

create index if not exists reservations_user_idx on public.reservations (user_id);
create index if not exists reservations_club_idx on public.reservations (club_id);
