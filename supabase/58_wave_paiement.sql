-- PadelConnect — PAIEMENT WAVE des tournois joueurs (Chantier 5, v2). SQL Editor → Run.
-- Idempotent. VERSION MANUELLE : l'opérateur colle SON lien de paiement Wave ; le créateur
-- d'un tournoi le règle APRÈS validation du club ; l'opérateur confirme la réception →
-- le tournoi est marqué payé. (Automatisation via l'API Wave prévue plus tard.)
--
-- On NE TOUCHE PAS à la machine à états des tournois (pending → published → closed). Le
-- paiement est une info EN PLUS : un tournoi JOUEUR validé (published) et non payé = « frais
-- à régler » côté organisateur + « paiement à confirmer » côté opérateur.

-- ─── 1) Lien de paiement Wave de l'opérateur (dans le singleton tournament_config) ──────
alter table public.tournament_config
  add column if not exists wave_link text; -- lien de paiement Wave (https://pay.wave.com/…)

-- ─── 2) Statut de paiement par tournoi ───────────────────────────────────────────────
alter table public.competitions
  add column if not exists payment_status text not null default 'unpaid'; -- 'unpaid' | 'paid'

-- ─── 3) L'opérateur enregistre son lien Wave ─────────────────────────────────────────
create or replace function public.set_wave_link(p_link text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'operator') then
    return false; -- réservé à l'opérateur
  end if;
  update public.tournament_config
    set wave_link = nullif(trim(coalesce(p_link, '')), ''), updated_at = now()
    where id = true;
  return true;
end;
$$;

grant execute on function public.set_wave_link(text) to authenticated;

-- ─── 4) L'opérateur confirme le paiement d'un tournoi ────────────────────────────────
-- Marque payment_status='paid'. Réservé à l'opérateur (la preuve Wave lui est envoyée hors
-- app dans la version manuelle). Renvoie false si le tournoi n'existe pas / pas opérateur.
create or replace function public.operator_confirm_tournament_payment(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'operator') then
    return false;
  end if;
  update public.competitions set payment_status = 'paid' where id = p_id;
  return found;
end;
$$;

grant execute on function public.operator_confirm_tournament_payment(uuid) to authenticated;

-- ─── 5) fetch_competitions renvoie AUSSI le statut de paiement + le lien Wave courant ────
-- Colonnes AJOUTÉES en fin (les anciennes versions de l'app lisent par nom et les ignorent).
-- wave_link est le lien de l'opérateur (même pour tous) — sert à l'organisateur pour payer.
drop function if exists public.fetch_competitions();
create or replace function public.fetch_competitions()
returns table (
  id uuid, organizer_id uuid, organizer_type text, organizer_name text, organizer_phone text,
  club_id text, club_name text, title text, format text, level text,
  date_key text, end_date_key text, courts text[], slots text[],
  capacity int, fee text, reward text, official boolean, status text, commission int,
  winner text, second text, third text, loser text, registered int, teams text[],
  reject_reason text, payment_status text, wave_link text
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
    (select coalesce(array_agg(trim(coalesce(pr.first_name, '') || ' & ' || rg.partner) order by rg.created_at), '{}')
       from public.competition_registrations rg
       join public.profiles pr on pr.id = rg.user_id
       where rg.competition_id = c.id),
    c.reject_reason,
    c.payment_status,
    (select tc.wave_link from public.tournament_config tc where tc.id = true)
  from public.competitions c
  where c.status in ('published', 'closed')
    or c.organizer_id = auth.uid()
    or public.can_manage_club(c.club_id);
$$;

grant execute on function public.fetch_competitions() to authenticated;
