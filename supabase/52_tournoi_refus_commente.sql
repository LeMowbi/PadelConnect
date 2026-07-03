-- PadelConnect — SQL 52 : REFUS DE TOURNOI COMMENTÉ (demande porteur). Idempotent, rejouable.
-- À coller dans Supabase → SQL Editor → Run (« Success. No rows returned »).
--
-- Quand un club refuse un tournoi joueur (ex. les créneaux chevauchent des réservations), il
-- peut désormais joindre un MOTIF (« ces créneaux sont pris — possible du 12 au 14 après 18h »).
-- L'organisateur le lit sur la fiche de son tournoi (et dans la notification push) : il sait
-- QUOI changer au lieu de rester dans le flou, puis supprime le tournoi refusé et le recrée.

alter table public.competitions add column if not exists reject_reason text;

-- La signature change (motif en 2ᵉ paramètre) : on DROP l'ancienne pour éviter l'ambiguïté
-- PostgREST entre les deux surcharges. Le défaut null garde les anciennes versions de l'app
-- fonctionnelles (elles appellent avec p_id seul → motif absent, comportement inchangé).
drop function if exists public.reject_competition(uuid);

create or replace function public.reject_competition(p_id uuid, p_reason text default null)
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
  update public.competitions
    set status = 'rejected',
        reject_reason = nullif(trim(coalesce(p_reason, '')), '')
    where id = p_id and status = 'pending';
  return true;
end;
$$;

grant execute on function public.reject_competition(uuid, text) to authenticated;

-- fetch_competitions renvoie aussi le motif (colonne AJOUTÉE en fin : les anciennes versions de
-- l'app lisent par nom et l'ignorent). Le type de retour change → DROP puis recréation.
drop function if exists public.fetch_competitions();
create or replace function public.fetch_competitions()
returns table (
  id uuid, organizer_id uuid, organizer_type text, organizer_name text, organizer_phone text,
  club_id text, club_name text, title text, format text, level text,
  date_key text, end_date_key text, courts text[], slots text[],
  capacity int, fee text, reward text, official boolean, status text, commission int,
  winner text, second text, third text, loser text, registered int, teams text[],
  reject_reason text
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
       where rg.competition_id = c.id),
    c.reject_reason
  from public.competitions c
  where c.status in ('published', 'closed')
    or c.organizer_id = auth.uid()
    or public.can_manage_club(c.club_id);
$$;

grant execute on function public.fetch_competitions() to authenticated;
