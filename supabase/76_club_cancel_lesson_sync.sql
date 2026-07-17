-- 76_club_cancel_lesson_sync.sql — CORRECTIF (audit) : synchroniser les COURS avec l'annulation
-- par le CLUB (75). Le trigger lessons_follow_reservation (38) ne réagissait qu'aux statuts
-- 'cancelled' (annulation élève) et 'no_show' (absence marquée par le club) — il IGNORAIT le
-- nouveau statut 'club_cancelled' introduit par la feature 75. Conséquence : quand un club annulait
-- une réservation NÉE D'UN COURS (chevauchement hors app), la ligne `lessons` restait 'accepted'
-- (cours fantôme visible « Terrain réservé ✓ » dans l'Espace Coach) et le COACH n'était JAMAIS
-- prévenu (le webhook lessons UPDATE→cancelled ne partait pas). On ajoute 'club_cancelled' à la
-- garde du trigger → le cours passe 'cancelled', le coach reçoit son push, son espace est juste.
-- Idempotent (create or replace). À coller dans Supabase → SQL Editor → Run.

create or replace function public.lessons_follow_reservation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Annulation par l'élève, « pas venu » marqué par le club, OU annulation par le club pour
  -- chevauchement hors app (75) : dans les trois cas le cours n'a plus lieu — l'Espace Coach
  -- doit le montrer « Annulé », pas « Terrain réservé ✓ », et le coach doit être prévenu.
  if new.status in ('cancelled', 'no_show', 'club_cancelled') and old.status = 'booked' then
    update public.lessons
      set status = 'cancelled', responded_at = now()
      where reservation_id = new.id and status = 'accepted';
  end if;
  return new;
end;
$$;

drop trigger if exists lessons_follow_reservation on public.reservations;
create trigger lessons_follow_reservation
  after update on public.reservations
  for each row execute function public.lessons_follow_reservation();
