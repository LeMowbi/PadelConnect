-- PadelConnect — LE CLUB FIXE LE TARIF DES COURS DE SES COACHS (SQL Editor → Run). Idempotent.
--
-- Demande porteur : « les clubs doivent pouvoir mettre le prix de la session des coachs ».
-- Le tarif vivait déjà sur la fiche coach (coaches.price, affiché aux élèves) mais seul le
-- COACH pouvait le régler (coach_update_profile, 38). Le gérant peut désormais le fixer
-- lui-même depuis l'Espace Club — même colonne, donc affiché partout à l'identique
-- (fiche club, écran « Réserver un cours », Espace Coach). Le coach garde la main sur
-- ses créneaux et sa spécialité ; en cas de désaccord sur le prix, la dernière écriture
-- gagne (club et coach sont censés être d'accord — le tarif se règle au coach, hors app).

create or replace function public.club_set_coach_price(p_user_id uuid, p_price integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club text;
begin
  select club_id into v_club from public.coaches where user_id = p_user_id and active;
  if v_club is null or not public.can_manage_club(v_club) then return false; end if;
  -- Mêmes bornes de vraisemblance que les réservations (40) ; null = tarif non affiché.
  if p_price is not null and (p_price < 1000 or p_price > 1000000) then return false; end if;
  update public.coaches set price = p_price where user_id = p_user_id;
  return true;
end;
$$;

grant execute on function public.club_set_coach_price(uuid, integer) to authenticated;
