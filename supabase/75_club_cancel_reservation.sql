-- 75_club_cancel_reservation.sql — Le CLUB peut annuler une réservation joueur qui CHEVAUCHE une
-- réservation prise HORS APPLICATION (téléphone/sur place), à tout moment. L'annulation :
--   • passe la résa au statut 'club_cancelled' (DISTINCT de 'cancelled' joueur et de 'no_show') →
--     ne pénalise PAS la fiabilité du joueur (ce n'est pas sa faute) et libère le créneau (la GiST
--     reservations_no_overlap et slot_occupancy ne portent que sur status='booked', cf. SQL 68) ;
--   • BLOQUE le créneau d'origine (blocked_slots) car il est désormais occupé hors app → aucun autre
--     joueur ne peut le re-réserver in-app ;
--   • enregistre un MOTIF et une PROPOSITION d'alternative (terrain / jour / heure / durée) que le
--     joueur voit dans « Mes réservations » et peut accepter en un tap (notification via notify-club).
-- Idempotent. À coller dans Supabase → SQL Editor → Run.

-- 1) Motif + proposition (colonnes optionnelles, transitent par fetchCancelledReservations select *).
alter table public.reservations add column if not exists cancel_reason text;
alter table public.reservations add column if not exists proposed_court text;
alter table public.reservations add column if not exists proposed_date_key text;
alter table public.reservations add column if not exists proposed_time text;
alter table public.reservations add column if not exists proposed_duration_min int;

-- 2) RPC : le gérant du club ACTIF (ou l'opérateur) annule la résa. Patron calqué sur mark_no_show
--    (68) + block_slot (68). SECURITY DEFINER (la résa appartient à un tiers ; on garde par
--    can_manage_club, jamais d'exposition de profiles).
create or replace function public.club_cancel_reservation(
  p_id uuid,
  p_reason text default '',
  p_proposed_court text default null,
  p_proposed_date_key text default null,
  p_proposed_time text default null,
  p_proposed_duration_min int default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.reservations%rowtype;
begin
  select * into r from public.reservations where id = p_id;
  if r.id is null then return false; end if;
  if not public.can_manage_club(r.club_id) then return false; end if;  -- gérant du club actif OU opérateur
  if r.status <> 'booked' then return false; end if;                   -- on n'annule qu'une résa ACTIVE
  -- Sérialise avec les autres écritures du même club:jour (comme block_slot / la garde d'insertion).
  perform pg_advisory_xact_lock(hashtext(r.club_id || ':' || coalesce(r.date_key, '')));

  -- 2a) Annulation par le CLUB (statut dédié) + motif + proposition. Le trigger
  --     reservations_availability_guard (68) sort tôt si status <> 'booked' → aucun re-heurt.
  update public.reservations
     set status = 'club_cancelled',
         cancel_reason = nullif(trim(coalesce(p_reason, '')), ''),
         proposed_court = nullif(trim(coalesce(p_proposed_court, '')), ''),
         proposed_date_key = nullif(trim(coalesce(p_proposed_date_key, '')), ''),
         proposed_time = nullif(trim(coalesce(p_proposed_time, '')), ''),
         proposed_duration_min = case when p_proposed_duration_min in (60, 90) then p_proposed_duration_min else null end
   where id = p_id;

  -- 2b) Le créneau d'origine est occupé HORS APP → on le bloque pour qu'aucun autre joueur ne le
  --     re-réserve in-app (même clé d'unicité que block_slot). Durée = celle FIGÉE de la résa annulée.
  if r.court is not null and nullif(trim(coalesce(r.date_key, '')), '') is not null
     and nullif(trim(coalesce(r."time", '')), '') is not null then
    insert into public.blocked_slots (club_id, date_key, time, court, reason, created_by, duration_min)
      values (r.club_id, r.date_key, r."time", r.court,
              coalesce(nullif(trim(coalesce(p_reason, '')), ''), 'Réservation hors application'),
              auth.uid(), coalesce(r.duration_min, 90))
      on conflict (club_id, date_key, time, court)
        do update set reason = excluded.reason, duration_min = excluded.duration_min;
  end if;

  return true;
end;
$$;

grant execute on function public.club_cancel_reservation(uuid, text, text, text, text, int) to authenticated;
revoke execute on function public.club_cancel_reservation(uuid, text, text, text, text, int) from public, anon;
