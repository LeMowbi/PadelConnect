-- PadelConnect — réservation partagée : Accepter / Refuser une invitation (à coller dans
-- Supabase → SQL Editor → Run). Idempotent.
--
-- Un ami invité à une réservation peut désormais ACCEPTER ou REFUSER. On ajoute un statut
-- sur reservation_participants ('invited' par défaut) et une fonction réservée à l'invité
-- pour répondre (il ne peut changer QUE sa propre ligne, QUE le statut).

alter table public.reservation_participants
  add column if not exists status text not null default 'invited';

-- Valeurs permises (idempotent : on recrée la contrainte proprement).
alter table public.reservation_participants drop constraint if exists rp_status_check;
alter table public.reservation_participants
  add constraint rp_status_check check (status in ('invited', 'accepted', 'declined'));

-- L'invité répond à SON invitation (accepte / refuse). SECURITY DEFINER : ne touche que la
-- ligne de l'appelant, et seulement la colonne statut. Renvoie true si une ligne a changé.
create or replace function public.respond_invitation(p_reservation_id uuid, p_accept boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.reservation_participants
    set status = case when p_accept then 'accepted' else 'declined' end
    where reservation_id = p_reservation_id and user_id = auth.uid();
  return found;
end;
$$;

grant execute on function public.respond_invitation(uuid, boolean) to authenticated;
