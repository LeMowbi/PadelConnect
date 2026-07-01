-- PadelConnect — TOURNOIS côté serveur (à coller dans Supabase → SQL Editor → Run). Idempotent.
--
-- Jusqu'ici un tournoi vivait SEULEMENT dans le téléphone de son créateur → invisible des
-- autres joueurs (« j'ai créé un tournoi mais il ne s'affiche pas sur un autre téléphone »).
-- Cette table le rend RÉEL et partagé. Règles métier :
--   • Tournoi créé par un CLUB → publié directement (officiel), visible par tous.
--   • Tournoi créé par un JOUEUR → « en attente » : invisible des autres tant que le club
--     hôte ne l'a pas approuvé. Il ne bloque AUCUN terrain avant approbation.
--   • L'organisateur choisit des TERRAINS et des CRÉNEAUX précis (pas toute la journée /
--     tous les terrains) et, au besoin, une PLAGE de jours (début → fin).
--   • Frais fixe (commission PadelConnect) sur les tournois JOUEURS uniquement — montant
--     réglé par l'opérateur (par défaut 5 000 FCFA), figé à la création de chaque tournoi.

-- ─── Frais fixe des tournois joueurs (réglable par l'opérateur) ────────────────
create table if not exists public.tournament_config (
  id boolean primary key default true,
  player_fee int not null default 5000,
  updated_at timestamptz not null default now(),
  constraint tournament_config_singleton check (id)
);
insert into public.tournament_config (id, player_fee) values (true, 5000) on conflict (id) do nothing;

alter table public.tournament_config enable row level security;
drop policy if exists "tournament_config_select" on public.tournament_config;
create policy "tournament_config_select" on public.tournament_config for select using (true);

-- ─── Tournois ──────────────────────────────────────────────────────────────────
create table if not exists public.competitions (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references auth.users (id) on delete cascade,
  organizer_type text not null check (organizer_type in ('club', 'joueur')),
  organizer_name text not null default '',
  organizer_phone text,   -- pour contacter l'organisateur (règlement des frais d'inscription)
  club_id text,           -- club hôte (slug d'un club de base OU id texte d'un club serveur)
  club_name text,
  title text not null,
  format text not null default '',
  level text not null default '',
  date_key text not null,         -- jour de début (AAAA-MM-JJ)
  end_date_key text,              -- jour de fin (tournoi multi-jours) — null = un seul jour
  courts text[] not null default '{}',  -- terrains réservés au tournoi (bloqués)
  slots text[] not null default '{}',   -- créneaux réservés au tournoi (bloqués)
  capacity int not null default 8,      -- nombre d'équipes
  fee text not null default '',         -- frais d'inscription affichés (texte libre)
  reward text not null default '',
  official boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'published', 'closed', 'rejected')),
  commission int not null default 0,    -- frais fixe PadelConnect (tournoi joueur), figé à la création
  winner text,
  second text,
  third text,
  loser text,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists competitions_status_idx on public.competitions (status);
create index if not exists competitions_club_idx on public.competitions (club_id);

create table if not exists public.competition_registrations (
  competition_id uuid not null references public.competitions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  partner text not null default 'Partenaire',
  created_at timestamptz not null default now(),
  primary key (competition_id, user_id)
);

alter table public.competitions enable row level security;
alter table public.competition_registrations enable row level security;
-- Toutes les lectures passent par les fonctions ci-dessous (visibilité + comptage),
-- toutes les écritures par des RPC SECURITY DEFINER → aucune policy d'accès direct.

-- Suis-je opérateur, ou gérant de ce club hôte ? (lecture sans RLS → pas de récursion)
create or replace function public.can_manage_club(p_club_id text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role = 'operator' or (p.role = 'club' and p.managed_club_id = p_club_id))
  );
$$;

grant execute on function public.can_manage_club(text) to authenticated;

-- Tournois VISIBLES (+ nombre d'inscrits) : publiés/clôturés pour tous ; « en attente »/
-- « refusé » seulement pour l'organisateur et le club hôte (ou l'opérateur).
create or replace function public.fetch_competitions()
returns table (
  id uuid, organizer_id uuid, organizer_type text, organizer_name text, organizer_phone text,
  club_id text, club_name text, title text, format text, level text,
  date_key text, end_date_key text, courts text[], slots text[],
  capacity int, fee text, reward text, official boolean, status text, commission int,
  winner text, second text, third text, loser text, registered int, teams text[]
)
language sql
security definer
set search_path = public
stable
as $$
  select c.id, c.organizer_id, c.organizer_type, c.organizer_name, c.organizer_phone,
    c.club_id, c.club_name, c.title, c.format, c.level,
    c.date_key, c.end_date_key, c.courts, c.slots,
    c.capacity, c.fee, c.reward, c.official, c.status, c.commission,
    c.winner, c.second, c.third, c.loser,
    (select count(*) from public.competition_registrations r where r.competition_id = c.id)::int,
    -- Roster RÉEL des équipes inscrites (« Prénom & Partenaire »), pour l'affichage et la
    -- désignation du vainqueur/podium à la clôture — plus aucun nom fictif.
    (select coalesce(array_agg(trim(coalesce(pr.first_name, '') || ' & ' || rg.partner) order by rg.created_at), '{}')
       from public.competition_registrations rg
       join public.profiles pr on pr.id = rg.user_id
       where rg.competition_id = c.id)
  from public.competitions c
  where c.status in ('published', 'closed')
    or c.organizer_id = auth.uid()
    or public.can_manage_club(c.club_id);
$$;

grant execute on function public.fetch_competitions() to authenticated;

-- Mes inscriptions → { competition_id, partner } pour réafficher mon état sur tout appareil.
create or replace function public.fetch_my_registrations()
returns table (competition_id uuid, partner text)
language sql
security definer
set search_path = public
stable
as $$
  select r.competition_id, r.partner
  from public.competition_registrations r
  where r.user_id = auth.uid();
$$;

grant execute on function public.fetch_my_registrations() to authenticated;

-- Crée un tournoi. Club → publié direct (officiel). Joueur → « en attente » + frais fixe figé.
create or replace function public.create_competition(
  p_title text, p_organizer_type text, p_organizer_name text, p_organizer_phone text,
  p_club_id text, p_club_name text, p_date_key text, p_end_date_key text,
  p_courts text[], p_slots text[], p_capacity int,
  p_fee text, p_reward text, p_format text, p_level text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  v_official boolean;
  v_status text;
  v_commission int := 0;
begin
  if auth.uid() is null then return null; end if;
  if coalesce(trim(p_title), '') = '' or coalesce(trim(p_date_key), '') = '' then return null; end if;

  if p_organizer_type = 'club' then
    if not public.can_manage_club(p_club_id) then return null; end if; -- réservé au gérant du club
    v_official := true;
    v_status := 'published';
  else
    v_official := false;
    v_status := 'pending';
    select player_fee into v_commission from public.tournament_config where id = true;
    v_commission := coalesce(v_commission, 0);
  end if;

  insert into public.competitions (
    organizer_id, organizer_type, organizer_name, organizer_phone, club_id, club_name,
    title, format, level, date_key, end_date_key, courts, slots,
    capacity, fee, reward, official, status, commission
  ) values (
    auth.uid(), p_organizer_type, coalesce(p_organizer_name, ''), nullif(trim(coalesce(p_organizer_phone, '')), ''), p_club_id, p_club_name,
    trim(p_title), coalesce(p_format, ''), coalesce(p_level, ''), p_date_key, nullif(p_end_date_key, ''),
    coalesce(p_courts, '{}'), coalesce(p_slots, '{}'),
    greatest(coalesce(p_capacity, 8), 1), coalesce(p_fee, ''), coalesce(p_reward, ''),
    v_official, v_status, v_commission
  ) returning id into new_id;
  return new_id;
end;
$$;

grant execute on function public.create_competition(text, text, text, text, text, text, text, text, text[], text[], int, text, text, text, text) to authenticated;

-- Le club hôte (ou l'opérateur) valide un tournoi joueur « en attente » → publié (visible+bloque).
create or replace function public.approve_competition(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club text;
begin
  select club_id into v_club from public.competitions where id = p_id and status = 'pending';
  if v_club is null and not exists (select 1 from public.competitions where id = p_id and status = 'pending') then
    return false;
  end if;
  if not public.can_manage_club(v_club) then return false; end if;
  update public.competitions set status = 'published' where id = p_id and status = 'pending';
  return true;
end;
$$;

grant execute on function public.approve_competition(uuid) to authenticated;

-- Le club hôte (ou l'opérateur) refuse un tournoi joueur « en attente » → refusé (jamais publié).
create or replace function public.reject_competition(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club text;
begin
  select club_id into v_club from public.competitions where id = p_id and status = 'pending';
  if not exists (select 1 from public.competitions where id = p_id and status = 'pending') then return false; end if;
  if not public.can_manage_club(v_club) then return false; end if;
  update public.competitions set status = 'rejected' where id = p_id and status = 'pending';
  return true;
end;
$$;

grant execute on function public.reject_competition(uuid) to authenticated;

-- Inscription d'une équipe (moi + un partenaire), si le tournoi est publié et pas complet.
create or replace function public.register_competition(p_id uuid, p_partner text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capacity int;
  v_count int;
begin
  select capacity into v_capacity from public.competitions where id = p_id and status = 'published';
  if v_capacity is null then return false; end if; -- inexistant ou non publié
  select count(*) into v_count from public.competition_registrations where competition_id = p_id;
  if v_count >= v_capacity and not exists (
    select 1 from public.competition_registrations where competition_id = p_id and user_id = auth.uid()
  ) then
    return false; -- complet
  end if;
  insert into public.competition_registrations (competition_id, user_id, partner)
    values (p_id, auth.uid(), coalesce(nullif(trim(p_partner), ''), 'Partenaire'))
    on conflict (competition_id, user_id) do update set partner = excluded.partner;
  return true;
end;
$$;

grant execute on function public.register_competition(uuid, text) to authenticated;

create or replace function public.unregister_competition(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.competition_registrations where competition_id = p_id and user_id = auth.uid();
  return true;
end;
$$;

grant execute on function public.unregister_competition(uuid) to authenticated;

-- Clôture par l'organisateur (ou le club hôte) : fige le podium et passe le tournoi en « clôturé ».
create or replace function public.close_competition(p_id uuid, p_winner text, p_second text, p_third text, p_loser text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_club text;
begin
  select organizer_id, club_id into v_owner, v_club from public.competitions where id = p_id and status = 'published';
  if v_owner is null then return false; end if;
  if v_owner <> auth.uid() and not public.can_manage_club(v_club) then return false; end if;
  update public.competitions
    set status = 'closed',
        winner = nullif(trim(coalesce(p_winner, '')), ''),
        second = nullif(trim(coalesce(p_second, '')), ''),
        third = nullif(trim(coalesce(p_third, '')), ''),
        loser = nullif(trim(coalesce(p_loser, '')), ''),
        closed_at = now()
    where id = p_id;
  return true;
end;
$$;

grant execute on function public.close_competition(uuid, text, text, text, text) to authenticated;

-- Suppression d'un tournoi par son organisateur (ou le club hôte / l'opérateur).
create or replace function public.delete_competition(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_club text;
begin
  select organizer_id, club_id into v_owner, v_club from public.competitions where id = p_id;
  if v_owner is null then return false; end if;
  if v_owner <> auth.uid() and not public.can_manage_club(v_club) then return false; end if;
  delete from public.competitions where id = p_id;
  return true;
end;
$$;

grant execute on function public.delete_competition(uuid) to authenticated;

-- Opérateur : règle le frais fixe appliqué aux futurs tournois joueurs.
create or replace function public.set_tournament_fee(p_amount int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'operator') then
    return false; -- réservé à l'opérateur
  end if;
  update public.tournament_config set player_fee = greatest(coalesce(p_amount, 0), 0), updated_at = now() where id = true;
  return true;
end;
$$;

grant execute on function public.set_tournament_fee(int) to authenticated;
