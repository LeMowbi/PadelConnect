-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 72 — Garde anti-orphelin au RETRAIT DE TERRAIN (p_courts) — audit tour 3
-- Les gardes 69/70 couvraient p_court_slots et p_slots, mais retirer un terrain (p_courts) qui a
-- une réservation à venir passait : la résa devenait orpheline (terrain non déclaré) PUIS la purge
-- de sa grille était refusée par la garde 69 → tout le club bloqué en 'denied'. On refuse le
-- retrait à la source, sous le même verrou club (71). Idempotent : redéfinition COMPLÈTE.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.upsert_club_config(p_club_id text, p_slots text[] DEFAULT NULL::text[], p_courts text[] DEFAULT NULL::text[], p_offers jsonb DEFAULT NULL::jsonb, p_coaches jsonb DEFAULT NULL::jsonb, p_photos text[] DEFAULT NULL::text[], p_cover_url text DEFAULT NULL::text, p_court_photos jsonb DEFAULT NULL::jsonb, p_court_closed jsonb DEFAULT NULL::jsonb, p_court_slots jsonb DEFAULT NULL::jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_mode text := 'preserve';      -- preserve | clear | set
  v_eff_slots text[] := '{}';     -- miroir slots dérivé (mode 'set')
  v_eff_closed jsonb := '{}'::jsonb; -- fermetures PAR TERRAIN projetées (mode 'set') → survivent au 'clear'
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
  v_open int;                     -- bornes de la grille réelle (union des terrains, mode 'set')
  v_close int;
  v_prev_slots text[];            -- miroir existant (replis 'clear' et échelle vide)
  v_clear_slots text[];           -- grille effective après un 'clear'
  v_has_cs boolean := false;      -- le club a-t-il déjà une grille par terrain ?
  k text;
  kk text;
  arr jsonb;
  ent jsonb;
  prev_end int;
  cur_start int;
  cur_d int;
  m int;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and (p.managed_club_id = p_club_id or p.role = 'operator')
  ) then
    return false;
  end if;
  -- (71) Même verrou CLUB que reservations_insert_guard : la garde anti-orphelin (69/70) et
  -- l'insertion d'une réservation ne peuvent plus se croiser (vérif puis écriture atomiques).
  perform pg_advisory_xact_lock(hashtext(p_club_id));
  -- (72) Garde anti-orphelin au RETRAIT DE TERRAIN : si p_courts retire un terrain qui porte une
  -- réservation à venir ('booked'), refus (la résa deviendrait invisible du planning par-terrain
  -- et bloquerait ensuite toute écriture de grille). Même verrou club → atomique avec l'INSERT.
  if p_courts is not null and exists (
    select 1 from public.reservations r
     where r.club_id = p_club_id
       and r.status = 'booked'
       and r.starts_at > (extract(epoch from now()) * 1000)::bigint
       and r.court is not null
       and not (r.court = any(p_courts))
  ) then
    return false;
  end if;
  -- Bornes anti-abus court_closed (téléchargé par tous les joueurs) — inchangé.
  if p_court_closed is not null
     and (jsonb_typeof(p_court_closed) <> 'object' or pg_column_size(p_court_closed) > 8192) then
    return false;
  end if;

  select cc0.slots, (cc0.court_slots is not null) into v_prev_slots, v_has_cs
    from public.club_config cc0 where cc0.club_id = p_club_id;

  -- Décodage du mode court_slots + VALIDATION quand une grille est fournie.
  if p_court_slots is not null and p_court_slots <> '{}'::jsonb then
    v_mode := 'set';
    if jsonb_typeof(p_court_slots) <> 'object' or pg_column_size(p_court_slots) > 65536 then
      return false;
    end if;
    if (select count(*) from jsonb_object_keys(p_court_slots)) > 20 then
      return false; -- ≤ 20 terrains
    end if;
    for k in select jsonb_object_keys(p_court_slots) loop
      arr := p_court_slots -> k;
      if jsonb_typeof(arr) <> 'array' or jsonb_array_length(arr) > 48 then
        return false; -- ≤ 48 créneaux par terrain
      end if;
      prev_end := -1;
      -- Itération TRIÉE par heure de début → contrôle de non-chevauchement (durée propre).
      for ent in select value from jsonb_array_elements(arr) order by public.hhmm_to_min(value ->> 't') loop
        if jsonb_typeof(ent) <> 'object' then return false; end if;
        -- Aucune propriété inconnue (t, d, x seulement).
        for kk in select jsonb_object_keys(ent) loop
          if kk not in ('t', 'd', 'x') then return false; end if;
        end loop;
        if (ent ->> 't') is null or (ent ->> 't') !~ '^([01]\d|2[0-3]):(00|30)$' then
          return false; -- granularité 30 min (rejette :15/:45)
        end if;
        -- (a) durée = NOMBRE jsonb strict (une chaîne "60" passait `->> in ('60','90')` mais le
        -- client la résolvait 90 → grille divergente, créneau imbookable).
        if jsonb_typeof(ent -> 'd') <> 'number' or (ent ->> 'd') not in ('60', '90') then
          return false;
        end if;
        if (ent ? 'x') and jsonb_typeof(ent -> 'x') <> 'boolean' then return false; end if;
        cur_start := public.hhmm_to_min(ent ->> 't');
        cur_d := (ent ->> 'd')::int;
        if cur_start is null or cur_start < 300 or cur_start + cur_d > 1440 then
          return false; -- ≥ 05:00 et fin ≤ minuit
        end if;
        if cur_start < prev_end then
          return false; -- chevauchement (ou doublon d'heure) sur ce terrain
        end if;
        prev_end := cur_start + cur_d;
      end loop;
    end loop;

    -- (c) Garde anti-orphelin : chaque réservation À VENIR du club doit retomber EXACTEMENT
    -- (heure + durée) sur un créneau de la nouvelle grille de SON terrain — sinon elle
    -- disparaîtrait du planning par créneau et son prix/durée deviendraient incohérents.
    -- (Le miroir client peut être périmé : cette garde est le rempart de vérité.)
    if exists (
      select 1
        from public.reservations r
       where r.club_id = p_club_id
         and r.status = 'booked'
         and r.starts_at > v_now
         and not exists (
           select 1
             from jsonb_array_elements(coalesce(p_court_slots -> r.court, '[]'::jsonb)) e
            where (e ->> 't') = r."time"
              and (e ->> 'd')::int = r.duration_min
         )
    ) then
      return false;
    end if;

    -- (b) Miroir `slots`@90 = ÉCHELLE 1h30 recouvrant [ouverture, fermeture] de la grille réelle
    -- (union de tous les terrains). L'ancienne dérivation (débuts des seuls créneaux 90) donnait
    -- un miroir VIDE pour un club tout en 1h. Le miroir ne pilote plus rien tant que court_slots
    -- existe (resolve_court_slots lit la grille) : il sert aux bornes tarifaires et de point de
    -- départ au retour aux horaires simples.
    select min(public.hhmm_to_min(e ->> 't')),
           max(public.hhmm_to_min(e ->> 't') + (e ->> 'd')::int)
      into v_open, v_close
      from jsonb_each(p_court_slots) as court(key, val),
           lateral jsonb_array_elements(court.val) as e
     where jsonb_typeof(court.val) = 'array';
    v_eff_slots := '{}';
    if v_open is not null then
      m := v_open;
      while m + 90 <= v_close loop
        v_eff_slots := v_eff_slots || public.min_to_hhmm(m);
        m := m + 90;
      end loop;
    end if;
    -- (d) plage < 1h30 → échelle vide : on garde l'ancien miroir plutôt que d'écrire un vide.
    if coalesce(array_length(v_eff_slots, 1), 0) = 0 then
      v_eff_slots := coalesce(v_prev_slots, '{}');
    end if;

    -- Fermetures PAR TERRAIN projetées depuis la grille (créneaux `x:true`) → { 'Terrain 1': ['18:00'] }.
    -- Elles restent DORMANTES tant que `court_slots` existe (resolve_court_slots lit alors la grille),
    -- mais un 'clear' ultérieur (retour aux horaires simples) les PRÉSERVE via coalesce(cc.court_closed)
    -- au lieu de rouvrir silencieusement un créneau-terrain volontairement fermé.
    select coalesce(jsonb_object_agg(court, times), '{}'::jsonb)
      into v_eff_closed
      from (
        select ce.key as court,
               jsonb_agg((e ->> 't') order by public.hhmm_to_min(e ->> 't')) as times
          from jsonb_each(p_court_slots) as ce(key, val),
               lateral jsonb_array_elements(ce.val) as e
         where jsonb_typeof(ce.val) = 'array' and coalesce((e ->> 'x')::boolean, false)
         group by ce.key
      ) s;
  elsif p_court_slots = '{}'::jsonb then
    v_mode := 'clear';
    -- (c bis) Même garde anti-orphelin au retour aux horaires simples : la grille effective
    -- redevient le miroir @90 — chaque résa à venir doit durer 1h30 ET tomber sur un de ses
    -- horaires (fermé compris : la résa précède la fermeture, elle reste honorée).
    v_clear_slots := coalesce(p_slots, v_prev_slots, '{}');
    if exists (
      select 1
        from public.reservations r
       where r.club_id = p_club_id
         and r.status = 'booked'
         and r.starts_at > v_now
         and (r.duration_min <> 90
              or not exists (
                select 1 from unnest(v_clear_slots) t
                 where regexp_replace(t, '^!', '') = r."time"
              ))
    ) then
      return false;
    end if;
  end if;

  -- (70) Écriture p_slots SEULE (mode preserve) sans grille par terrain : même garde anti-
  -- orphelin que le 'clear' — la grille effective des terrains est CETTE grille @90.
  if v_mode = 'preserve' and p_slots is not null and not coalesce(v_has_cs, false) then
    if exists (
      select 1
        from public.reservations r
       where r.club_id = p_club_id
         and r.status = 'booked'
         and r.starts_at > v_now
         and (r.duration_min <> 90
              or not exists (
                select 1 from unnest(p_slots) t
                 where regexp_replace(t, '^!', '') = r."time"
              ))
    ) then
      return false;
    end if;
  end if;

  insert into public.club_config as cc
    (club_id, slots, courts, offers, coaches, photos, cover_url, court_photos, court_closed, court_slots)
  values (
    p_club_id,
    case when v_mode = 'set' then v_eff_slots else p_slots end,
    p_courts, p_offers, p_coaches, p_photos, nullif(p_cover_url, ''), p_court_photos,
    case when v_mode = 'set' then v_eff_closed else p_court_closed end,
    case when v_mode = 'set' then p_court_slots else null end
  )
  on conflict (club_id) do update set
    slots = case when v_mode = 'set' then v_eff_slots
                 else coalesce(excluded.slots, cc.slots) end,
    courts = coalesce(excluded.courts, cc.courts),
    offers = coalesce(excluded.offers, cc.offers),
    coaches = coalesce(excluded.coaches, cc.coaches),
    photos = coalesce(excluded.photos, cc.photos),
    -- '' = « retirer la cover » (null = champ non fourni → on garde l'existante).
    cover_url = case when p_cover_url = '' then null else coalesce(p_cover_url, cc.cover_url) end,
    court_photos = coalesce(excluded.court_photos, cc.court_photos),
    court_closed = case when v_mode = 'set' then v_eff_closed
                        else coalesce(excluded.court_closed, cc.court_closed) end,
    court_slots = case v_mode when 'set' then p_court_slots
                              when 'clear' then null
                              else cc.court_slots end, -- 'preserve'
    updated_at = now();
  return true;
end;
$function$
;
