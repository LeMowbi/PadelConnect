-- 89 — Liste d'attente : purge de SA propre alerte quand on réserve le créneau
-- (audit complet, tour 8, 2026-08-16). À coller dans SQL Editor → Run. Idempotent, rejouable.
--
-- Constat (LOW) : le nettoyage de l'alerte à la réservation ne vivait QUE dans le tunnel client.
-- Réserver le même créneau par la VOIE RAPIDE (BookingSheet) — ou via un cours accepté par un
-- coach (respond_lesson crée la résa) — laissait l'entrée slot_waitlist en vie : à la prochaine
-- annulation d'un voisin, le joueur recevait « Un créneau s'est libéré 🏃 » pour un créneau qu'il
-- OCCUPE. Fix SERVEUR (couvre toutes les voies, présentes et futures) : à l'INSERT d'une résa
-- 'booked', on retire l'alerte du même joueur sur le même (club, jour, heure). AFTER INSERT :
-- aucune interaction avec les gardes/contraintes d'insertion, et un échec d'insert n'y passe pas.
-- Le nettoyage client du tunnel reste (hygiène immédiate du miroir local) — même clé, même effet.
create or replace function public.waitlist_purge_on_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'booked' then
    delete from public.slot_waitlist w
      where w.user_id = new.user_id and w.club_id = new.club_id
        and w.date_key = new.date_key and w."time" = new."time";
  end if;
  return new;
end;
$$;
drop trigger if exists waitlist_purge_on_booking on public.reservations;
create trigger waitlist_purge_on_booking after insert on public.reservations
  for each row execute function public.waitlist_purge_on_booking();
