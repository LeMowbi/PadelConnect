-- 78_club_cancel_privacy_pastguard.sql — CORRECTIFS (audit) de club_cancel_reservation (75/77) :
--   1) CONFIDENTIALITÉ : le MOTIF libre saisi par le club (« annulé car M. X a réservé au téléphone »)
--      ne doit PAS partir dans blocked_slots.reason, qui est LISIBLE PAR TOUS les joueurs (dispo).
--      → on écrit toujours un motif GÉNÉRIQUE dans blocked_slots ; le vrai motif reste sur
--        reservations.cancel_reason (privé : visible du joueur concerné et du club).
--   2) INTÉGRITÉ CLASSEMENT : annuler un match DÉJÀ JOUÉ retirerait rétroactivement les points
--      (le +3 n'est compté que si la résa est 'booked'). Or l'annulation « chevauchement hors app »
--      n'a de sens que sur un créneau À VENIR. → on refuse d'annuler une résa dont la fin est passée.
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
  v_now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  select * into r from public.reservations where id = p_id;
  if r.id is null then return false; end if;
  if not public.can_manage_club(r.club_id) then return false; end if;  -- gérant du club actif OU opérateur
  if r.status <> 'booked' then return false; end if;                   -- on n'annule qu'une résa ACTIVE
  -- Créneau DÉJÀ JOUÉ (fin passée) : on refuse (une annulation « chevauchement hors app » ne
  -- concerne que l'avenir ; annuler après coup retirerait à tort les points de classement du joueur).
  if r.starts_at is not null and (r.starts_at + coalesce(r.duration_min, 90) * 60000) <= v_now_ms then
    return false;
  end if;
  -- Sérialise avec les autres écritures du même club:jour (comme block_slot / la garde d'insertion).
  perform pg_advisory_xact_lock(hashtext(r.club_id || ':' || coalesce(r.date_key, '')));

  -- Annulation par le CLUB (statut dédié) + motif + proposition. Garde atomique status='booked'
  -- (77) : une annulation joueur/no_show concurrente laisse 0 ligne → on n'écrase rien.
  update public.reservations
     set status = 'club_cancelled',
         cancel_reason = nullif(trim(coalesce(p_reason, '')), ''),
         proposed_court = nullif(trim(coalesce(p_proposed_court, '')), ''),
         proposed_date_key = nullif(trim(coalesce(p_proposed_date_key, '')), ''),
         proposed_time = nullif(trim(coalesce(p_proposed_time, '')), ''),
         proposed_duration_min = case when p_proposed_duration_min in (60, 90) then p_proposed_duration_min else null end
   where id = p_id and status = 'booked';
  get diagnostics v_updated = row_count;
  if v_updated = 0 then return false; end if;

  -- Le créneau d'origine est occupé HORS APP → on le bloque. Motif GÉNÉRIQUE ici : blocked_slots.reason
  -- est lisible par tous les joueurs (calcul de dispo), on n'y expose donc jamais le texte libre du club.
  if r.court is not null and nullif(trim(coalesce(r.date_key, '')), '') is not null
     and nullif(trim(coalesce(r."time", '')), '') is not null then
    insert into public.blocked_slots (club_id, date_key, time, court, reason, created_by, duration_min)
      values (r.club_id, r.date_key, r."time", r.court, 'Réservation hors application',
              auth.uid(), coalesce(r.duration_min, 90))
      on conflict (club_id, date_key, time, court)
        do update set reason = excluded.reason, duration_min = excluded.duration_min;
  end if;

  return true;
end;
$$;

grant execute on function public.club_cancel_reservation(uuid, text, text, text, text, int) to authenticated;
revoke execute on function public.club_cancel_reservation(uuid, text, text, text, text, int) from public, anon;
