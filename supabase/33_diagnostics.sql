-- PadelConnect — diagnostics : journal d'ERREURS et d'ÉVÉNEMENTS d'usage (self-hosted, aucun
-- service externe). À coller dans Supabase → SQL Editor → Run. Idempotent.
--
-- But : savoir si un joueur a un crash / une erreur (sinon on ne le voit jamais) et suivre les
-- grands événements d'usage (inscriptions, réservations, tournois…). Tout reste DANS ton Supabase,
-- sous ton contrôle — pas de pistage publicitaire. Seul l'OPÉRATEUR peut lire ; tout le monde peut
-- écrire sa propre ligne (y compris avant connexion, pour capturer une erreur au démarrage).

-- ── Journal d'erreurs / crashs ────────────────────────────────────────────────
create table if not exists public.app_errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  message text not null,
  stack text,
  context text,        -- où c'est arrivé (écran / action)
  platform text,       -- ios | android | web
  app_version text,
  created_at timestamptz not null default now()
);

alter table public.app_errors enable row level security;

-- Insertion ouverte (authentifié OU anonyme) : on capture aussi les erreurs avant connexion.
drop policy if exists "app_errors_insert" on public.app_errors;
create policy "app_errors_insert" on public.app_errors for insert to anon, authenticated with check (true);

-- Lecture réservée à l'opérateur.
drop policy if exists "app_errors_select" on public.app_errors;
create policy "app_errors_select" on public.app_errors
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'operator'));

-- ── Journal d'événements d'usage ──────────────────────────────────────────────
create table if not exists public.app_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  name text not null,  -- ex. signup_completed, reservation_created, competition_created
  props jsonb,         -- détails facultatifs (jamais de donnée sensible)
  platform text,
  created_at timestamptz not null default now()
);

alter table public.app_events enable row level security;

drop policy if exists "app_events_insert" on public.app_events;
create policy "app_events_insert" on public.app_events for insert to anon, authenticated with check (true);

drop policy if exists "app_events_select" on public.app_events;
create policy "app_events_select" on public.app_events
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'operator'));

-- Index pour lire vite le plus récent (côté opérateur).
create index if not exists app_errors_created_idx on public.app_errors (created_at desc);
create index if not exists app_events_created_idx on public.app_events (created_at desc);
