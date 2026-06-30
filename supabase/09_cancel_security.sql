-- PadelConnect — annulation côté SERVEUR + durcissements (à coller dans Supabase →
-- SQL Editor → Run). Idempotent.
--
-- Pourquoi : la règle « pas d'annulation à moins de 5h » était purement côté app, donc
-- contournable par l'API. On la déplace dans une fonction serveur, et on garde une TRACE
-- de l'annulation (statut 'cancelled') au lieu de supprimer la ligne — le créneau se
-- libère (slot_occupancy ne compte que 'booked') mais le club pourra voir l'annulation.

-- ─── Annulation contrôlée (auteur uniquement, > 5h avant, trace conservée) ────
create or replace function public.cancel_reservation(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.reservations%rowtype;
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  select * into r from public.reservations where id = p_id;
  if r.id is null or r.user_id <> auth.uid() then return false; end if; -- seul l'auteur annule
  if r.status <> 'booked' then return false; end if; -- déjà annulée / autre statut
  if r.starts_at - now_ms < 5 * 3600 * 1000 then return false; end if; -- moins de 5h avant : refusé
  update public.reservations set status = 'cancelled' where id = p_id;
  return true;
end;
$$;

grant execute on function public.cancel_reservation(uuid) to authenticated;

-- ─── Profil : WITH CHECK sur l'UPDATE (valide la ligne RÉSULTANTE, pas seulement la cible)
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ─── Niveau borné 1.0 → 7.0 côté serveur (anti-injection via l'API) ───────────
update public.profiles set level = least(7, greatest(1, level)) where level < 1 or level > 7;
alter table public.profiles drop constraint if exists profiles_level_range;
alter table public.profiles add constraint profiles_level_range check (level >= 1 and level <= 7);
