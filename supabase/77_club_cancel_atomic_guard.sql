-- 77_club_cancel_atomic_guard.sql — CORRECTIF (audit) : rendre club_cancel_reservation (75)
-- robuste aux ECRITURES CONCURRENTES. Le verrou consultatif pg_advisory_xact_lock(club:jour)
-- ne sérialise que les fonctions qui prennent LE MÊME verrou ; cancel_reservation et mark_no_show
-- ne le prennent pas. Entre le SELECT (garde status='booked') et l'UPDATE, une annulation joueur
-- concurrente pouvait donc passer la résa en 'cancelled' pendant que club_cancel la repassait en
-- 'club_cancelled' (perte de mise à jour, statut faux). On ajoute la condition status='booked'
-- DIRECTEMENT dans le WHERE de l'UPDATE (garde atomique côté ligne) : si la ligne n'est plus
-- 'booked' au moment de l'écriture, 0 ligne mise à jour → on renvoie false sans rien casser.
-- Idempotent (create or replace). À coller dans Supabase → SQL Editor → Run.

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
  v_updated int;
begin
  select * into r from public.reservations where id = p_id;
  if r.id is null then return false; end if;
  if not public.can_manage_club(r.club_id) then return false; end if;  -- gérant du club actif OU opérateur
  if r.status <> 'booked' then return false; end if;                   -- on n'annule qu'une résa ACTIVE
  -- Sérialise avec les autres écritures du même club:jour (comme block_slot / la garde d'insertion).
  perform pg_advisory_xact_lock(hashtext(r.club_id || ':' || coalesce(r.date_key, '')));

  -- 2a) Annulation par le CLUB (statut dédié) + motif + proposition. La condition status='booked'
  --     dans le WHERE rend l'écriture ATOMIQUE : une annulation joueur/no_show concurrente
  --     (déjà passée après notre SELECT) laisse 0 ligne mise à jour → on ne l'écrase pas.
  update public.reservations
     set status = 'club_cancelled',
         cancel_reason = nullif(trim(coalesce(p_reason, '')), ''),
         proposed_court = nullif(trim(coalesce(p_proposed_court, '')), ''),
         proposed_date_key = nullif(trim(coalesce(p_proposed_date_key, '')), ''),
         proposed_time = nullif(trim(coalesce(p_proposed_time, '')), ''),
         proposed_duration_min = case when p_proposed_duration_min in (60, 90) then p_proposed_duration_min else null end
   where id = p_id and status = 'booked';
  get diagnostics v_updated = row_count;
  if v_updated = 0 then return false; end if;  -- la résa a changé d'état entre-temps : on n'écrase rien

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
