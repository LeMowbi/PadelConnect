-- 90 — Finitions liste d'attente & parts Wave (audit post-lancement, tour 1, 2026-08-21).
-- À coller dans Supabase → SQL Editor → Run APRÈS la 89. Idempotent, rejouable.
--
-- Deux LOW de la même famille que 87/89 (refus honnêtes, plus d'alerte sur son propre créneau) :
--
-- 1) join_group_lesson : rejoindre un COURS COLLECTIF n'insère aucune ligne `reservations`
--    (seulement lesson_students) → le trigger 89 ne purgeait pas l'alerte de liste d'attente de
--    l'élève sur ce créneau : il pouvait encore recevoir « un créneau s'est libéré » pour une
--    heure où il joue déjà. On purge ici, même clé que la 89 (club, jour, heure).
--    Recopie STRICTE de la version live hormis le delete ajouté après l'insert.
create or replace function public.join_group_lesson(p_lesson_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  l record;
begin
  if auth.uid() is null then return 'gone'; end if;
  select * into l from public.lessons
    where id = p_lesson_id and status = 'accepted' and capacity > 1
    for update;
  if l.id is null then return 'gone'; end if;
  if l.coach_id = auth.uid() then return 'gone'; end if;
  if l.starts_at <= (extract(epoch from now()) * 1000)::bigint then return 'gone'; end if;
  -- La résa porteuse doit encore tenir (annulation coach/club → le cours n'existe plus).
  if not exists (select 1 from public.reservations r where r.id = l.reservation_id and r.status = 'booked') then
    return 'gone';
  end if;
  if exists (select 1 from public.blocked_users b
             where (b.blocker_id = l.coach_id and b.blocked_id = auth.uid())
                or (b.blocker_id = auth.uid() and b.blocked_id = l.coach_id)) then
    return 'gone';
  end if;
  if exists (select 1 from public.lesson_students s where s.lesson_id = p_lesson_id and s.user_id = auth.uid()) then
    return 'already';
  end if;
  if (select count(*) from public.lesson_students s where s.lesson_id = p_lesson_id) >= l.capacity then
    return 'full';
  end if;
  insert into public.lesson_students (lesson_id, user_id) values (p_lesson_id, auth.uid());
  -- 90 : je joue ce créneau → mon alerte de liste d'attente dessus n'a plus lieu d'être (parité 89).
  delete from public.slot_waitlist w
    where w.user_id = auth.uid() and w.club_id = l.club_id
      and w.date_key = l.date_key and w."time" = l."time";
  return 'ok';
end;
$$;

revoke execute on function public.join_group_lesson(uuid) from public, anon;
grant execute on function public.join_group_lesson(uuid) to authenticated;

-- 2) confirm_share_paid : renvoyait un booléen — le refus LÉGITIME « résa plus active » (garde 85
--    C5 : status='booked') était indistinct d'un échec réseau → « réessaie » à l'infini côté
--    créateur. Codes TEXTE (patron 87) : 'ok' / 'gone' (résa absente ou plus 'booked' — définitif)
--    / 'none' (aucune part 'declared' de ce joueur à confirmer). Le changement de type de retour
--    impose un drop+create. Recopie STRICTE de la 85 hormis les codes.
drop function if exists public.confirm_share_paid(uuid, uuid);
create or replace function public.confirm_share_paid(p_reservation_id uuid, p_user uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return 'gone'; end if;
  if not exists (
    select 1 from public.reservations r
    where r.id = p_reservation_id and r.user_id = auth.uid() and r.status = 'booked'
  ) then
    return 'gone';
  end if;
  update public.share_payments
    set status = 'confirmed', confirmed_at = now()
    where reservation_id = p_reservation_id and user_id = p_user and status = 'declared';
  return case when found then 'ok' else 'none' end;
end;
$$;

revoke execute on function public.confirm_share_paid(uuid, uuid) from public, anon;
grant execute on function public.confirm_share_paid(uuid, uuid) to authenticated;
