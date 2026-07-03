-- PadelConnect — SQL 50 : position Google Maps éditable par le gérant, pour TOUS les clubs
-- (y compris les 9 fondateurs). Jusqu'ici la position venait uniquement de mapsQuery en dur
-- dans le code (src/data/clubs.ts) ; le gérant ne pouvait pas la corriger. On ajoute la colonne
-- maps_query aux surcharges de page et on l'expose dans upsert_club_override. La fiche du club
-- ouvre alors Google Maps sur la position saisie par le gérant (nom + adresse), qui l'emporte
-- sur la valeur par défaut. Idempotent, rejouable sans risque. À coller dans Supabase →
-- SQL Editor → Run (« Success. No rows returned »).

alter table public.club_overrides add column if not exists maps_query text;

-- La signature change (un paramètre en plus) → on DROP l'ancienne fonction avant de la recréer.
-- `p_maps_query default null` : les builds ANTÉRIEURS (appel à 8 paramètres) continuent de
-- fonctionner. Les bornes de prix de la 40 sont CONSERVÉES (un tarif hors bornes rendrait le
-- club irréservable : chaque réservation serait rejetée par reservations_price_guard).
drop function if exists public.upsert_club_override(text, text, text, text, text, integer, jsonb, text);

create or replace function public.upsert_club_override(
  p_club_id text,
  p_name text,
  p_area text,
  p_blurb text,
  p_type text,
  p_price_from integer,
  p_price_tiers jsonb,
  p_contact_phone text,
  p_maps_query text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and (p.managed_club_id = p_club_id or p.role = 'operator')
  ) then
    return false; -- seul le gérant de CE club (ou l'opérateur) peut modifier sa page
  end if;
  -- Bornes de vraisemblance (mêmes que reservations_price_guard, cf. 40) sur le tarif de base…
  if p_price_from is not null and (p_price_from < 1000 or p_price_from > 1000000) then
    return false;
  end if;
  -- …et sur chaque plage tarifaire fournie.
  if p_price_tiers is not null and exists (
    select 1 from jsonb_array_elements(p_price_tiers) t
    where coalesce((t->>'price')::integer, 0) < 1000 or (t->>'price')::integer > 1000000
  ) then
    return false;
  end if;
  insert into public.club_overrides
      (club_id, name, area, blurb, type, price_from, price_tiers, contact_phone, maps_query, updated_at)
    values (p_club_id, nullif(p_name, ''), nullif(p_area, ''), nullif(p_blurb, ''), nullif(p_type, ''),
            p_price_from, p_price_tiers, nullif(p_contact_phone, ''), nullif(p_maps_query, ''), now())
    on conflict (club_id) do update set
      name = excluded.name, area = excluded.area, blurb = excluded.blurb, type = excluded.type,
      price_from = excluded.price_from, price_tiers = excluded.price_tiers,
      contact_phone = excluded.contact_phone, maps_query = excluded.maps_query, updated_at = now();
  return true;
end;
$$;

grant execute on function public.upsert_club_override(text, text, text, text, text, integer, jsonb, text, text) to authenticated;
