-- PadelConnect — TOURNOIS OFFICIELS PADELCONNECT (SQL Editor → Run). Idempotent.
--
-- Décision porteur : PadelConnect ne crée PAS ses tournois en « entrant » dans l'Espace Club
-- d'un club sans son accord. L'opérateur crée le tournoi EN TANT QUE PadelConnect (nouveau
-- type d'organisateur 'operator') : il part « en attente », et c'est le CLUB HÔTE qui le
-- valide dans son Espace Club (sa permission, DANS l'app) — comme un tournoi joueur, mais
-- OFFICIEL (le résultat compte pour le niveau) et sans frais d'organisation (commission 0 :
-- PadelConnect ne se facture pas lui-même). Même canal demain pour accueillir des tournois
-- officiels externes (FIP…) : créés par l'opérateur, validés par le club hôte.
--
-- MÊME signature que la version 37 (create or replace, aucun drop nécessaire — pas de
-- double surcharge PGRST203) : seule la branche 'operator' est ajoutée.

create or replace function public.create_competition(
  p_organizer_type text, p_organizer_name text, p_organizer_phone text, p_club_id text, p_club_name text,
  p_title text, p_format text, p_level text, p_date_key text, p_end_date_key text,
  p_courts text[], p_slots text[], p_capacity int, p_fee text, p_reward text
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
    -- Refus si des réservations « booked » occupent déjà ces terrains/créneaux (double occupation).
    if public.competition_overlaps_reservations(p_club_id, p_date_key, p_end_date_key, coalesce(p_slots, '{}'), coalesce(p_courts, '{}')) then
      return null;
    end if;
    v_official := true;
    v_status := 'published';
  elsif p_organizer_type = 'operator' then
    -- Tournoi officiel PADELCONNECT : réservé au compte opérateur. En attente tant que le
    -- club hôte ne l'a pas validé (approve_competition vérifie aussi la double occupation).
    if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'operator') then
      return null;
    end if;
    v_official := true;
    v_status := 'pending';
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

grant execute on function public.create_competition(text, text, text, text, text, text, text, text, text, text, text[], text[], int, text, text) to authenticated;
