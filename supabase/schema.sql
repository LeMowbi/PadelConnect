-- PadelConnect — schéma initial. ⚠️ FICHIER HISTORIQUE : NE PAS RECOLLER en base — les
-- migrations 02→89 ont durci ou remplacé plusieurs de ses objets (le recoller ressusciterait
-- des versions périmées). Conservé pour référence ; les deux policies ci-dessous sont
-- maintenues alignées sur leurs versions durcies (09/41) pour qu'un collage accidentel
-- soit inoffensif, mais la règle reste : ne rien recoller d'ancien (cf. docs/AUDIT-SERVEUR.md).

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
  for update using (auth.uid() = id) with check (auth.uid() = id); -- `with check` : durci par la 09

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

-- `reservations_delete_own` SUPPRIMÉE par la 41 (plus de DELETE direct d'une résa — on annule
-- par changement de statut). On ne la recrée PAS ; le drop reste pour l'idempotence historique.
drop policy if exists "reservations_delete_own" on public.reservations;

-- (Accès « côté club » — un gérant voit les réservations de SON club — sera ajouté
--  avec les comptes clubs, une fois les rôles en place.)

create index if not exists reservations_user_idx on public.reservations (user_id);
create index if not exists reservations_club_idx on public.reservations (club_id);
