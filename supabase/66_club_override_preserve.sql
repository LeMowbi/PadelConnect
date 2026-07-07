-- PadelConnect — upsert_club_override NE PERD PLUS de champs (audit v2 tour 2). Idempotent.
--
-- Bug : à la sauvegarde d'UNE info de fiche club (ex. le nom) pendant le DÉMARRAGE À FROID, avant
-- que le miroir `state.clubInfo[clubId]` ne soit chargé, le client envoie `null` pour les champs
-- non chargés (description, plages tarifaires, Maps). L'ancien `ON CONFLICT DO UPDATE SET x =
-- excluded.x` écrasait alors ces colonnes à NULL → la description « se réinitialisait » au seed.
--
-- Correctif : sur conflit, un paramètre `NULL` = « champ NON fourni » → on GARDE la valeur existante ;
-- une chaîne VIDE ('') = « effacement volontaire » → on met à NULL (nullif). Un vrai texte remplace.
-- (Même esprit que upsert_club_config, qui coalesce déjà.) Aucune régression : en régime normal le
-- client envoie l'objet complet (valeurs réelles, jamais NULL pour un champ à conserver).

create or replace function public.upsert_club_override(
  p_club_id text, p_name text, p_area text, p_blurb text, p_type text,
  p_price_from integer, p_price_tiers jsonb, p_contact_phone text, p_maps_query text default null
)
  returns boolean
  language plpgsql
  security definer
  set search_path to 'public'
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
      -- NULL en entrée = champ non fourni → on conserve l'existant ; '' = effacement → NULL ; sinon remplace.
      name          = case when p_name          is null then public.club_overrides.name          else nullif(p_name, '')          end,
      area          = case when p_area          is null then public.club_overrides.area          else nullif(p_area, '')          end,
      blurb         = case when p_blurb         is null then public.club_overrides.blurb         else nullif(p_blurb, '')         end,
      type          = case when p_type          is null then public.club_overrides.type          else nullif(p_type, '')          end,
      price_from    = coalesce(p_price_from, public.club_overrides.price_from),
      price_tiers   = coalesce(p_price_tiers, public.club_overrides.price_tiers),
      contact_phone = case when p_contact_phone is null then public.club_overrides.contact_phone else nullif(p_contact_phone, '') end,
      maps_query    = case when p_maps_query    is null then public.club_overrides.maps_query    else nullif(p_maps_query, '')    end,
      updated_at    = now();
  return true;
end;
$$;

revoke execute on function public.upsert_club_override(text, text, text, text, text, integer, jsonb, text, text) from public, anon;
grant execute on function public.upsert_club_override(text, text, text, text, text, integer, jsonb, text, text) to authenticated;
