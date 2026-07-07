-- 68 — Créneaux modulables 1h / 1h30, PAR TERRAIN (anti-double-vente durci)
-- =============================================================================
-- Chaque terrain d'un club a SA grille ; chaque créneau peut être 1h (60 min) ou 1h30 (90 min),
-- mélangés librement ; deux créneaux d'un même terrain ne se chevauchent jamais ; chaque
-- réservation FIGE sa durée (comme son prix) ; les tournois sont aussi modulables 1h/1h30.
--
-- ⚠️ Migration SÛRE À REJOUER (idempotente) et RÉTRO-COMPATIBLE (tous les défauts = 90) : les
-- données existantes deviennent 90 min d'office, aucune n'est cassée. Ce build REMPLACE le #57
-- (décision porteur §12) : une SEULE migration complète (colonnes + contrainte d'exclusion GiST
-- + réécriture des gardes + nouvelles signatures RPC), à appliquer au moment de couper le build.
--
-- Le CŒUR anti-double-vente = la contrainte d'exclusion GiST sur `reservations` (garantie par la
-- base, course concurrente comprise). Les gardes (triggers + RPC) raisonnent partout en
-- INTERVALLE demi-ouvert `[début, fin)` avec la DURÉE PROPRE de chaque côté — jamais un tampon
-- fixe de 90 min. Convention unique client (`courtSchedule.ts`) ↔ serveur : `a < b+db && b < a+da`.
-- =============================================================================

-- ─── 0) EXTENSION requise par la contrainte d'exclusion (index GiST sur text + int8range) ──────
create extension if not exists btree_gist;

-- ─── 1) HELPERS PURS (immuables — utilisés par les gardes ET les contraintes CHECK) ───────────

-- « HH:MM » → minutes depuis minuit (miroir EXACT de `toMin` client : accepte « H:MM »/« HH:MM »,
-- 24:00 = 1440), ou NULL si invalide. IMMUTABLE : utilisable dans un index/tri/CHECK.
create or replace function public.hhmm_to_min(p text)
returns int
language sql
immutable
as $$
  select case
    when p ~ '^\d{1,2}:\d{2}$'
         and split_part(p, ':', 1)::int <= 24
         and split_part(p, ':', 2)::int <= 59
         and not (split_part(p, ':', 1)::int = 24 and split_part(p, ':', 2)::int <> 0)
    then split_part(p, ':', 1)::int * 60 + split_part(p, ':', 2)::int
    else null
  end;
$$;

-- Tous les éléments d'un tableau de durées valent-ils 60 ou 90 ? (NULL toléré = tableau absent).
-- Sert de garde de valeur pour `competitions.slot_durations` (une durée NULL → range non borné
-- → double-vente silencieuse d'un créneau tournoi).
create or replace function public.durations_60_90(a int[])
returns boolean
language sql
immutable
as $$
  select a is null or not exists (select 1 from unnest(a) x where x is null or x not in (60, 90));
$$;

-- ─── 2) NOUVELLES COLONNES (add if not exists — défaut 90 pour ne casser aucune donnée) ───────
alter table public.reservations  add column if not exists duration_min int not null default 90;
alter table public.lessons       add column if not exists duration_min int not null default 90;
alter table public.blocked_slots add column if not exists duration_min int not null default 90;
-- Tournois modulables (§11.1) : durées parallèles à `slots` (vide ⇒ 90 par créneau).
alter table public.competitions  add column if not exists slot_durations int[] default '{}'::int[];
-- Grille par terrain : { "Terrain 1":[{"t":"08:00","d":90},{"t":"09:30","d":60}], … }.
-- NULL ⇒ on dérive de l'ancienne grille club `slots`@90 (voir resolve_court_slots).
alter table public.club_config   add column if not exists court_slots jsonb;

-- ─── 3) CONTRAINTES CHECK (NON idempotentes : drop-if-exists AVANT add) ────────────────────────
-- Durée ∈ {60,90} sur les trois axes réservables : durée 0 → range `empty` → double-vente
-- silencieuse ; durée nulle → range non borné. La contrainte d'exclusion S'APPUIE dessus.
alter table public.reservations  drop constraint if exists reservations_duration_chk;
alter table public.reservations  add  constraint reservations_duration_chk  check (duration_min in (60, 90));
alter table public.lessons       drop constraint if exists lessons_duration_chk;
alter table public.lessons       add  constraint lessons_duration_chk       check (duration_min in (60, 90));
alter table public.blocked_slots drop constraint if exists blocked_slots_duration_chk;
alter table public.blocked_slots add  constraint blocked_slots_duration_chk check (duration_min in (60, 90));

-- Parité tournoi : autant de durées que de créneaux, ou aucune (⇒ 90 partout).
alter table public.competitions  drop constraint if exists competitions_slot_durations_parity;
alter table public.competitions  add  constraint competitions_slot_durations_parity
  check (cardinality(slot_durations) in (0, cardinality(slots)));
-- Chaque durée tournoi ∈ {60,90}.
alter table public.competitions  drop constraint if exists competitions_slot_durations_values;
alter table public.competitions  add  constraint competitions_slot_durations_values
  check (public.durations_60_90(slot_durations));

-- ─── 4) starts_at NON NULL (la clé d'unicité de l'exclusion) ──────────────────────────────────
-- Un `starts_at` NULL donnerait un `int8range(NULL,…)` qui chevauche TOUT → un seul booked
-- briquerait un terrain. Backfill depuis date_key+time (Abidjan = UTC, même formule que Date.UTC
-- client) puis NOT NULL. Table VIDE aujourd'hui → opération triviale.
update public.reservations
   set starts_at = (extract(epoch from (date_key || ' ' || "time")::timestamp) * 1000)::bigint
 where starts_at is null and date_key is not null and "time" is not null;
alter table public.reservations alter column starts_at set not null;

-- ─── 5) CONTRAINTE D'EXCLUSION GiST — LE CŒUR ANTI-DOUBLE-VENTE ────────────────────────────────
-- Remplace l'index unique `reservations_slot_unique` (qui ne comparait que des heures ÉGALES) :
-- deux réservations `booked` sur le MÊME (club, terrain) dont les intervalles `[starts_at, +durée)`
-- se CHEVAUCHENT sont impossibles — course concurrente comprise (garantie DB, pas juste trigger).
-- `int8range(starts_at, starts_at + durée*60000)` = millisecondes ; borne haute exclusive `[)`.
drop index if exists public.reservations_slot_unique;
alter table public.reservations drop constraint if exists reservations_no_overlap;
alter table public.reservations add constraint reservations_no_overlap
  exclude using gist (
    club_id with =,
    court with =,
    int8range(starts_at, starts_at + duration_min * 60000) with &&
  ) where (status = 'booked' and starts_at is not null);

-- ─── 6) VUE slot_occupancy (+ duration_min) ───────────────────────────────────────────────────
-- L'app calcule le chevauchement des réservations des AUTRES joueurs à partir de cette vue :
-- sans la durée, impossible de savoir si un créneau des autres déborde sur le sien.
create or replace view public.slot_occupancy as
  select club_id, date_key, "time", court, duration_min
    from public.reservations
   where status = 'booked';
revoke select on public.slot_occupancy from anon; -- (identique à 03 : lecture non anonyme)

-- ─── 7) resolve_court_slots — grille EFFECTIVE d'un terrain (miroir EXACT du client) ───────────
-- Renvoie les créneaux d'un terrain (t, durée, fermé?). Fusion / repli rétro-compatible, dans
-- l'ordre du client (`resolveCourtSlots`) :
--   • court_slots[court] présent (array)      → source de vérité (normalisée, dédup par heure).
--   • court_slots présent mais CE terrain absent → grille par défaut @90 (SAMPLE_SLOTS).
--   • court_slots absent, slots présent       → dérive de l'ancienne grille club @90.
--   • rien du tout (7 clubs seed sur 9)        → grille par défaut @90 (sinon = non réservable).
-- Les fermetures héritées (`'!HH:MM'` dans slots, `court_closed[court]`) sont repliées en x:true
-- (sinon un club pas re-réglé « rouvrirait » ses pauses déjeuner = régression de double-vente).
-- DÉFAUT = les 8 valeurs de SAMPLE_SLOTS (clubs.ts) — un test d'équivalence le verrouille.
create or replace function public.resolve_court_slots(p_club_id text, p_court text)
returns table(t text, d int, x boolean)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_cs         jsonb;   -- club_config.court_slots
  v_slots      text[];  -- ancienne grille club
  v_cc         jsonb;   -- club_config.court_closed
  v_default    text[] := array['07:30','09:00','10:30','12:00','16:30','18:00','19:30','21:00'];
  v_rows       jsonb  := '[]'::jsonb;   -- accumulateur {t,d,x}
  v_seen       int[]  := '{}';          -- heures déjà vues (dédup, première gagne)
  v_closed     int[]  := '{}';          -- minutes fermées (repli legacy)
  v_legacy     text[];
  elem         jsonb;
  ent          text;
  v_time       text;
  v_m          int;
  v_is_closed  boolean;
begin
  select c.court_slots, c.slots, c.court_closed
    into v_cs, v_slots, v_cc
    from public.club_config c
   where c.club_id = p_club_id;

  if v_cs is not null and (v_cs ? p_court) and jsonb_typeof(v_cs -> p_court) = 'array' then
    -- SOURCE DE VÉRITÉ : grille par terrain (durée bornée 60|90 défaut 90, dédup par heure).
    for elem in select value from jsonb_array_elements(v_cs -> p_court) loop
      v_time := elem ->> 't';
      v_m := public.hhmm_to_min(v_time);
      if v_m is null or v_m = any (v_seen) then continue; end if;
      v_seen := v_seen || v_m;
      v_rows := v_rows || jsonb_build_object(
        't', v_time,
        'd', case when (elem ->> 'd') = '60' then 60 else 90 end,
        'x', coalesce((elem ->> 'x')::boolean, false));
    end loop;
  else
    -- DÉRIVATION @90 depuis une grille « legacy ». On choisit la source ET l'ensemble fermé :
    if v_cs is not null then
      v_legacy := v_default;   -- grille par terrain existe mais ce terrain manque → défaut, sans fermeture
      v_closed := '{}';        -- (miroir de fromLegacy(fallback, null) côté client)
    else
      if v_slots is not null and array_length(v_slots, 1) > 0 then
        v_legacy := v_slots;   -- ancienne grille club
      else
        v_legacy := v_default; -- club sans config → grille par défaut
      end if;
      -- fermetures récurrentes héritées de court_closed[court] (repliées en x:true)
      if v_cc is not null and (v_cc ? p_court) and jsonb_typeof(v_cc -> p_court) = 'array' then
        select coalesce(array_agg(m), '{}')
          into v_closed
          from (select public.hhmm_to_min(val) m
                  from jsonb_array_elements_text(v_cc -> p_court) val) s
         where m is not null;
      end if;
    end if;

    foreach ent in array v_legacy loop
      v_is_closed := left(ent, 1) = '!';               -- ancien préfixe « ! » = fermé
      v_time := case when v_is_closed then substr(ent, 2) else ent end;
      v_m := public.hhmm_to_min(v_time);
      if v_m is null or v_m = any (v_seen) then continue; end if;
      v_seen := v_seen || v_m;
      v_rows := v_rows || jsonb_build_object(
        't', v_time, 'd', 90,
        'x', v_is_closed or v_m = any (v_closed));
    end loop;
  end if;

  return query
    select r ->> 't', (r ->> 'd')::int, (r ->> 'x')::boolean
      from jsonb_array_elements(v_rows) r
     order by public.hhmm_to_min(r ->> 't');
end;
$$;

-- ─── 8) BARRIÈRE D'INSERTION DES RÉSERVATIONS (réécrite : durée + starts_at recalculé) ─────────
-- Reprend TOUTES les gardes de la 54 (verrou club:jour, créneau passé, terrain déclaré, période
-- fermée, plafond à venir) et ajoute :
--   (a) recalcul SERVEUR de starts_at depuis date_key+time (jamais confiance au client : c'est la
--       clé de la contrainte d'exclusion — un starts_at forgé double-vendrait le vrai créneau) ;
--   (b) le couple (heure, durée) doit correspondre à un créneau OUVERT de CE terrain (grille par
--       terrain résolue) + durée ∈ {60,90} ;
--   (c) période fermée (blocked_ranges) en overlap d'INTERVALLE : une heure fermée T ferme [T,T+90).
-- On NE fait AUCUN exists(reservations) redondant : la contrainte d'exclusion garde résa↔résa.
create or replace function public.reservations_insert_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
  v_upcoming int;
  v_courts text[];
begin
  -- Sérialise avec approve_competition / create_competition (même clé club:jour) : plus de
  -- fenêtre où une résa et une publication de tournoi se croisent sans se voir.
  perform pg_advisory_xact_lock(hashtext(new.club_id || ':' || new.date_key));
  -- Une réservation naît TOUJOURS 'booked' et non confirmée (seules les RPC la font évoluer).
  new.club_confirmed := false;
  new.status := 'booked';
  -- (a) Format date/heure validé PUIS starts_at RECALCULÉ côté serveur (Abidjan = UTC). Une date
  -- calendaire impossible (« 2026-02-31 ») ferait échouer le cast → refus propre.
  if new.date_key is null or new.date_key !~ '^\d{4}-\d{2}-\d{2}$'
     or new."time" is null or new."time" !~ '^([01]\d|2[0-3]):([0-5]\d)$' then
    raise exception 'invalid slot format';
  end if;
  begin
    new.starts_at := (extract(epoch from (new.date_key || ' ' || new."time")::timestamp) * 1000)::bigint;
  exception when others then
    raise exception 'invalid slot format';
  end;
  -- Créneau passé : interdit (tolérance 15 min pour l'horloge).
  if new.starts_at < v_now - 15 * 60000 then
    raise exception 'reservation must be in the future';
  end if;
  -- (b) Durée valide + créneau OUVERT de CE terrain. La grille par terrain (resolve_court_slots)
  -- remplace l'ancien `time = any(slots)` : elle porte durée ET fermetures. Le terrain doit rester
  -- déclaré (resolve_court_slots retomberait sur la grille par défaut pour un terrain inconnu).
  if new.duration_min is null or new.duration_min not in (60, 90) then
    raise exception 'invalid duration';
  end if;
  select c.courts into v_courts from public.club_config c where c.club_id = new.club_id;
  if v_courts is not null and array_length(v_courts, 1) > 0 and not (new.court = any (v_courts)) then
    raise exception 'unknown court';
  end if;
  if not exists (
    select 1 from public.resolve_court_slots(new.club_id, new.court) rs
    where not rs.x and rs.t = new."time" and rs.d = new.duration_min
  ) then
    raise exception 'slot closed';
  end if;
  -- (c) PÉRIODE fermée (54) : terrain précis ou tout le club ; une heure fermée T ferme [T,T+90).
  if exists (
    select 1 from public.blocked_ranges br
    where br.club_id = new.club_id
      and new.date_key >= br.date_from and new.date_key <= br.date_to
      and (br.court is null or br.court = new.court)
      and (
        br.times is null
        or exists (
          select 1 from unnest(br.times) bt
          where public.hhmm_to_min(bt) is not null
            and public.hhmm_to_min(bt) < public.hhmm_to_min(new."time") + new.duration_min
            and public.hhmm_to_min(new."time") < public.hhmm_to_min(bt) + 90
        )
      )
  ) then
    raise exception 'slot closed';
  end if;
  -- Plafond anti-abus de réservations À VENIR par compte.
  select count(*) into v_upcoming from public.reservations r
    where r.user_id = new.user_id and r.status = 'booked' and r.starts_at > v_now;
  if v_upcoming >= 10 then
    raise exception 'too many upcoming reservations';
  end if;
  return new;
end;
$$;

-- ─── 9) BARRIÈRE DE DISPONIBILITÉ (INSERT + UPDATE) — overlap d'intervalle ─────────────────────
-- blocked_slots et tournois comparés en INTERVALLE (durée propre de chaque côté), au lieu d'une
-- égalité d'heure exacte. Ne lit PAS `reservations` (l'auto-exclusion sur UPDATE est gérée par la
-- contrainte d'exclusion — un `id <> new.id` ici serait un no-op, §8.2).
create or replace function public.reservations_availability_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status is distinct from 'booked' then
    return new; -- on ne garde que les créneaux réellement réservés
  end if;
  -- Créneau fermé hors app par le club (chevauchement d'intervalle sur ce terrain) ?
  if exists (
    select 1 from public.blocked_slots b
    where b.club_id = new.club_id and b.date_key = new.date_key and b.court = new.court
      and public.hhmm_to_min(b."time") is not null
      and public.hhmm_to_min(b."time") < public.hhmm_to_min(new."time") + new.duration_min
      and public.hhmm_to_min(new."time") < public.hhmm_to_min(b."time") + b.duration_min
  ) then
    raise exception 'slot blocked' using errcode = '23514';
  end if;
  -- Créneau réservé à un TOURNOI publié ? Chaque créneau tournoi i = [slots[i], +slot_durations[i])
  -- (défaut 90), comparé à la réservation [time, +duration_min).
  if exists (
    select 1 from public.competitions c
    where c.club_id = new.club_id
      and c.status = 'published'
      and new.date_key >= c.date_key
      and new.date_key <= coalesce(c.end_date_key, c.date_key)
      and (coalesce(array_length(c.courts, 1), 0) = 0 or new.court = any (c.courts))
      and (
        coalesce(array_length(c.slots, 1), 0) = 0 -- tournoi sans créneau précis = tout le jour
        or exists (
          select 1 from unnest(c.slots) with ordinality as s(t, i)
          where public.hhmm_to_min(s.t) is not null
            and public.hhmm_to_min(s.t) < public.hhmm_to_min(new."time") + new.duration_min
            and public.hhmm_to_min(new."time") < public.hhmm_to_min(s.t) + coalesce(c.slot_durations[s.i], 90)
        )
      )
  ) then
    raise exception 'slot reserved for tournament' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- ─── 10) upsert_club_config (+ p_court_slots) ─────────────────────────────────────────────────
-- Nouvelle signature (drop de l'ancienne 54). p_court_slots :
--   • NULL          → préserve la colonne (comme 66).
--   • '{}'          → efface (retour au défaut dérivé de `slots`).
--   • objet valide  → SOURCE DE VÉRITÉ : on écrit AUSSI un miroir `slots`@90 (compat), on VIDE
--                     court_closed (les fermetures récurrentes vivent dans court_slots.x), et on
--                     IGNORE tout p_slots client. Validation stricte (forme, bornes, no-overlap).
drop function if exists public.upsert_club_config(text, text[], text[], jsonb, jsonb, text[], text, jsonb, jsonb);
create or replace function public.upsert_club_config(
  p_club_id text,
  p_slots text[] default null,
  p_courts text[] default null,
  p_offers jsonb default null,
  p_coaches jsonb default null,
  p_photos text[] default null,
  p_cover_url text default null,
  p_court_photos jsonb default null,
  p_court_closed jsonb default null,
  p_court_slots jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_mode text := 'preserve';      -- preserve | clear | set
  v_eff_slots text[] := '{}';     -- miroir slots dérivé (mode 'set')
  k text;
  kk text;
  arr jsonb;
  ent jsonb;
  prev_end int;
  cur_start int;
  cur_d int;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and (p.managed_club_id = p_club_id or p.role = 'operator')
  ) then
    return false;
  end if;
  -- Bornes anti-abus court_closed (téléchargé par tous les joueurs) — inchangé.
  if p_court_closed is not null
     and (jsonb_typeof(p_court_closed) <> 'object' or pg_column_size(p_court_closed) > 8192) then
    return false;
  end if;

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
        if (ent ->> 'd') is null or (ent ->> 'd') not in ('60', '90') then return false; end if;
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

    -- Miroir `slots`@90 = union des DÉBUTS de créneaux 90 min ouverts de TOUS les terrains (60 min
    -- omis) ; un début est marqué '!' seulement s'il est fermé à 90 sur TOUS les terrains l'offrant.
    with entries as (
      select (e ->> 't') as t,
             (e ->> 'd')::int as d,
             coalesce((e ->> 'x')::boolean, false) as x
        from jsonb_each(p_court_slots) as court(key, val),
             lateral jsonb_array_elements(court.val) as e
       where jsonb_typeof(court.val) = 'array'
    ),
    n90 as (
      select t, bool_or(not x) as any_open from entries where d = 90 group by t
    )
    select coalesce(array_agg(case when any_open then t else '!' || t end
                              order by public.hhmm_to_min(t)), '{}')
      into v_eff_slots
      from n90;
  elsif p_court_slots = '{}'::jsonb then
    v_mode := 'clear';
  end if;

  insert into public.club_config as cc
    (club_id, slots, courts, offers, coaches, photos, cover_url, court_photos, court_closed, court_slots)
  values (
    p_club_id,
    case when v_mode = 'set' then v_eff_slots else p_slots end,
    p_courts, p_offers, p_coaches, p_photos, nullif(p_cover_url, ''), p_court_photos,
    case when v_mode = 'set' then '{}'::jsonb else p_court_closed end,
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
    court_closed = case when v_mode = 'set' then '{}'::jsonb
                        else coalesce(excluded.court_closed, cc.court_closed) end,
    court_slots = case v_mode when 'set' then p_court_slots
                              when 'clear' then null
                              else cc.court_slots end, -- 'preserve'
    updated_at = now();
  return true;
end;
$$;

grant execute on function public.upsert_club_config(text, text[], text[], jsonb, jsonb, text[], text, jsonb, jsonb, jsonb)
  to authenticated;
revoke execute on function public.upsert_club_config(text, text[], text[], jsonb, jsonb, text[], text, jsonb, jsonb, jsonb)
  from public, anon;

-- ─── 11) request_lesson (+ p_duration) ────────────────────────────────────────────────────────
-- Valide (terrain, heure, durée) contre la GRILLE PAR TERRAIN (plus l'ancienne grille club).
drop function if exists public.request_lesson(uuid, text, text, text, text, text, text, bigint, integer);
create or replace function public.request_lesson(
  p_coach uuid, p_club_id text, p_club_name text, p_date_key text, p_date_label text,
  p_time text, p_court text, p_starts_at bigint, p_price integer, p_duration int default 90
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  new_id uuid;
  sname text;
  cname text;
  v_courts text[];
begin
  if auth.uid() is null or auth.uid() = p_coach then return null; end if;
  if p_price is null or p_price < 1000 or p_price > 1000000 then return null; end if;
  if p_duration is null or p_duration not in (60, 90) then return null; end if;
  -- Le coach doit être ACTIF dans CE club et proposer CE créneau (dispo coach = heures).
  if not exists (
    select 1 from public.coaches c
    where c.user_id = p_coach and c.club_id = p_club_id and c.active and p_time = any (c.slots)
  ) then
    return null;
  end if;
  -- Terrain déclaré + (heure, durée) = créneau OUVERT de CE terrain (grille par terrain, 38/68).
  select courts into v_courts from public.club_config where club_id = p_club_id;
  if v_courts is not null and array_length(v_courts, 1) > 0 and not (p_court = any (v_courts)) then
    return null;
  end if;
  if not exists (
    select 1 from public.resolve_court_slots(p_club_id, p_court) rs
    where not rs.x and rs.t = p_time and rs.d = p_duration
  ) then
    return null;
  end if;
  if p_starts_at <= (extract(epoch from now()) * 1000)::bigint then return null; end if;
  -- Pas deux demandes actives identiques (même élève, même coach, même créneau).
  if exists (
    select 1 from public.lessons l
    where l.student_id = auth.uid() and l.coach_id = p_coach and l.date_key = p_date_key
      and l."time" = p_time and l.status = 'pending'
  ) then
    return null;
  end if;
  select coalesce(nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), 'Un joueur')
    into sname from public.profiles where id = auth.uid();
  select coalesce(nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), 'Coach')
    into cname from public.profiles where id = p_coach;
  insert into public.lessons (coach_id, coach_name, club_id, club_name, student_id, student_name, date_key, date_label, "time", court, starts_at, price, duration_min)
    values (p_coach, cname, p_club_id, coalesce(p_club_name, ''), auth.uid(), sname, p_date_key, coalesce(p_date_label, ''), p_time, p_court, p_starts_at, p_price, p_duration)
    returning id into new_id;
  return new_id;
end;
$$;

grant execute on function public.request_lesson(uuid, text, text, text, text, text, text, bigint, integer, int) to authenticated;
revoke execute on function public.request_lesson(uuid, text, text, text, text, text, text, bigint, integer, int) from public, anon;

-- ─── 12) respond_lesson (re-valide contre la grille par terrain, coach busy en intervalle) ─────
create or replace function public.respond_lesson(p_id uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  l record;
  s record;
  res_id uuid;
begin
  select * into l from public.lessons where id = p_id and status = 'pending' for update;
  if l.id is null then return 'gone'; end if;
  if l.coach_id <> auth.uid() then return 'forbidden'; end if;

  -- Le club a pu changer la grille du terrain entre-temps : (terrain, heure, durée) doit rester
  -- un créneau OUVERT. La règle « figée » ne vaut qu'APRÈS création de la résa.
  if not exists (
    select 1 from public.resolve_court_slots(l.club_id, l.court) rs
    where not rs.x and rs.t = l."time" and rs.d = l.duration_min
  ) then
    if p_accept then
      update public.lessons set status = 'declined', responded_at = now() where id = p_id;
      return 'conflict';
    end if;
  end if;

  if not p_accept then
    update public.lessons set status = 'declined', responded_at = now() where id = p_id;
    return 'declined';
  end if;

  if not exists (
    select 1 from public.coaches c where c.user_id = l.coach_id and c.club_id = l.club_id and c.active
  ) then
    update public.lessons set status = 'declined', responded_at = now() where id = p_id;
    return 'gone';
  end if;

  if l.starts_at <= (extract(epoch from now()) * 1000)::bigint then
    update public.lessons set status = 'declined', responded_at = now() where id = p_id;
    return 'gone';
  end if;

  -- Deux acceptations SIMULTANÉES au même créneau : le verrou sérialise ; la seconde voit le
  -- cours déjà accepté (chevauchement d'INTERVALLE, durée propre de chaque cours) → 'busy'.
  perform pg_advisory_xact_lock(hashtext('lesson:' || l.coach_id || ':' || l.date_key || ':' || l."time"));
  if exists (
    select 1 from public.lessons x
    where x.coach_id = l.coach_id and x.status = 'accepted'
      and x.date_key = l.date_key and x.id <> l.id
      and public.hhmm_to_min(x."time") is not null
      and public.hhmm_to_min(x."time") < public.hhmm_to_min(l."time") + l.duration_min
      and public.hhmm_to_min(l."time") < public.hhmm_to_min(x."time") + x.duration_min
  ) then
    update public.lessons set status = 'declined', responded_at = now() where id = p_id;
    return 'busy';
  end if;

  if (select count(*) from public.reservations r
        where r.user_id = l.student_id and r.status = 'booked'
          and r.starts_at > (extract(epoch from now()) * 1000)::bigint) >= 10 then
    return 'student_full';
  end if;

  select first_name, last_name, phone into s from public.profiles where id = l.student_id;
  begin
    insert into public.reservations (
      user_id, club_id, club_name, date_key, date_label, "time", starts_at, court, price, duration_min,
      players, invited, booked_by_name, booked_by_phone, coach_name, club_confirmed, status
    )
    select l.student_id, l.club_id,
           coalesce(nullif(l.club_name, ''), (select name from public.clubs c where c.id = l.club_id), l.club_id),
           l.date_key, l.date_label, l."time", l.starts_at, l.court, l.price, l.duration_min,
           1, '[]'::jsonb,
           coalesce(nullif(trim(coalesce(s.first_name, '') || ' ' || coalesce(s.last_name, '')), ''), 'Un joueur'),
           s.phone,
           coalesce(nullif(l.coach_name, ''), (select coalesce(nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), 'Coach')
              from public.profiles p where p.id = l.coach_id)),
           false, 'booked'
    returning id into res_id;
  exception when others then
    -- Conflit d'occupation (contrainte d'exclusion 23P01, terrain fermé, etc.) → cours refusé.
    update public.lessons set status = 'declined', responded_at = now() where id = p_id;
    return 'conflict';
  end;

  update public.lessons set status = 'accepted', responded_at = now(), reservation_id = res_id where id = p_id;
  return 'ok';
end;
$$;

-- ─── 13) block_slot (verrou club:jour + overlap d'intervalle + durée réelle du créneau) ────────
create or replace function public.block_slot(p_club_id text, p_date_key text, p_time text, p_court text, p_reason text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_dur int;
begin
  if not public.can_manage_club(p_club_id) then
    return false; -- réservé au gérant du club (ou opérateur)
  end if;
  -- Sérialise avec les résas joueur du même jour (fix §9.2 : sans verrou, fermeture et résa
  -- qui se chevauchent pouvaient committer toutes deux).
  perform pg_advisory_xact_lock(hashtext(p_club_id || ':' || p_date_key));
  -- Durée réelle du créneau selon la grille du terrain (défaut 90) → le bloc couvre [time, +durée).
  select rs.d into v_dur from public.resolve_court_slots(p_club_id, p_court) rs
    where not rs.x and rs.t = p_time limit 1;
  v_dur := coalesce(v_dur, 90);
  -- Déjà réservé (chevauchement d'intervalle sur ce terrain) → on ne bloque pas par-dessus.
  if exists (
    select 1 from public.reservations r
    where r.club_id = p_club_id and r.date_key = p_date_key and r.court = p_court and r.status = 'booked'
      and public.hhmm_to_min(r."time") is not null
      and public.hhmm_to_min(r."time") < public.hhmm_to_min(p_time) + v_dur
      and public.hhmm_to_min(p_time) < public.hhmm_to_min(r."time") + r.duration_min
  ) then
    return false;
  end if;
  insert into public.blocked_slots (club_id, date_key, time, court, reason, created_by, duration_min)
    values (p_club_id, p_date_key, p_time, p_court, coalesce(p_reason, ''), auth.uid(), v_dur)
    on conflict (club_id, date_key, time, court) do update set reason = excluded.reason, duration_min = excluded.duration_min;
  return true;
end;
$$;

-- ─── 14) competition_overlaps_reservations (+ p_slot_durations) — overlap tournoi↔résa ─────────
drop function if exists public.competition_overlaps_reservations(text, text, text, text[], text[]);
create or replace function public.competition_overlaps_reservations(
  p_club_id text, p_date_key text, p_end_date_key text, p_slots text[], p_courts text[], p_slot_durations int[]
)
returns boolean
language sql
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.reservations r
    where r.club_id = p_club_id
      and r.status = 'booked'
      and r.date_key >= p_date_key
      and r.date_key <= coalesce(nullif(p_end_date_key, ''), p_date_key)
      and (coalesce(array_length(p_courts, 1), 0) = 0 or r.court = any (p_courts))
      and (
        coalesce(array_length(p_slots, 1), 0) = 0 -- tournoi tout le jour
        or exists (
          select 1 from unnest(p_slots) with ordinality as s(t, i)
          where public.hhmm_to_min(s.t) is not null and public.hhmm_to_min(r."time") is not null
            and public.hhmm_to_min(s.t) < public.hhmm_to_min(r."time") + r.duration_min
            and public.hhmm_to_min(r."time") < public.hhmm_to_min(s.t) + coalesce(p_slot_durations[s.i], 90)
        )
      )
  );
$$;
revoke execute on function public.competition_overlaps_reservations(text, text, text, text[], text[], int[]) from public, anon, authenticated;

-- ─── 15) competition_slot_conflict (+ p_slot_durations) — tous les croisements en intervalle ───
drop function if exists public.competition_slot_conflict(text, text, text, text[], text[], uuid);
create or replace function public.competition_slot_conflict(
  p_club_id text, p_date_key text, p_end_date_key text, p_slots text[], p_courts text[],
  p_slot_durations int[], p_exclude uuid default null
)
returns boolean
language sql
security definer
set search_path to 'public'
as $$
  select public.competition_overlaps_reservations(p_club_id, p_date_key, p_end_date_key, p_slots, p_courts, p_slot_durations)
    -- tournoi ↔ tournoi (minutes-de-journée : un tournoi n'a pas de starts_at, donc PAS int8range)
    or exists (
      select 1 from public.competitions c
      where c.club_id = p_club_id and c.status = 'published'
        and (p_exclude is null or c.id <> p_exclude)
        and c.date_key <= coalesce(nullif(p_end_date_key, ''), p_date_key)
        and coalesce(nullif(c.end_date_key, ''), c.date_key) >= p_date_key
        and (coalesce(array_length(p_courts, 1), 0) = 0 or coalesce(array_length(c.courts, 1), 0) = 0 or c.courts && p_courts)
        and (
          coalesce(array_length(p_slots, 1), 0) = 0 or coalesce(array_length(c.slots, 1), 0) = 0
          or exists (
            select 1 from unnest(p_slots) with ordinality as a(t, i)
            cross join unnest(c.slots) with ordinality as b(t, j)
            where public.hhmm_to_min(a.t) is not null and public.hhmm_to_min(b.t) is not null
              and public.hhmm_to_min(a.t) < public.hhmm_to_min(b.t) + coalesce(c.slot_durations[b.j], 90)
              and public.hhmm_to_min(b.t) < public.hhmm_to_min(a.t) + coalesce(p_slot_durations[a.i], 90)
          )
        )
    )
    -- tournoi ↔ créneau bloqué (blocked_slots, durée propre)
    or exists (
      select 1 from public.blocked_slots b
      where b.club_id = p_club_id
        and b.date_key >= p_date_key
        and b.date_key <= coalesce(nullif(p_end_date_key, ''), p_date_key)
        and (coalesce(array_length(p_courts, 1), 0) = 0 or b.court = any (p_courts))
        and (
          coalesce(array_length(p_slots, 1), 0) = 0
          or exists (
            select 1 from unnest(p_slots) with ordinality as s(t, i)
            where public.hhmm_to_min(s.t) is not null and public.hhmm_to_min(b."time") is not null
              and public.hhmm_to_min(s.t) < public.hhmm_to_min(b."time") + b.duration_min
              and public.hhmm_to_min(b."time") < public.hhmm_to_min(s.t) + coalesce(p_slot_durations[s.i], 90)
          )
        )
    )
    -- tournoi ↔ période fermée (blocked_ranges : une heure fermée T ferme [T,T+90))
    or exists (
      select 1 from public.blocked_ranges br
      where br.club_id = p_club_id
        and br.date_from <= coalesce(nullif(p_end_date_key, ''), p_date_key)
        and br.date_to >= p_date_key
        and (br.court is null or coalesce(array_length(p_courts, 1), 0) = 0 or br.court = any (p_courts))
        and (
          coalesce(array_length(p_slots, 1), 0) = 0
          or br.times is null
          or exists (
            select 1 from unnest(p_slots) with ordinality as s(t, i)
            cross join unnest(br.times) as bt
            where public.hhmm_to_min(s.t) is not null and public.hhmm_to_min(bt) is not null
              and public.hhmm_to_min(s.t) < public.hhmm_to_min(bt) + 90
              and public.hhmm_to_min(bt) < public.hhmm_to_min(s.t) + coalesce(p_slot_durations[s.i], 90)
          )
        )
    );
$$;
revoke execute on function public.competition_slot_conflict(text, text, text, text[], text[], int[], uuid) from public, anon, authenticated;

-- ─── 16) create_competition (+ p_slot_durations, verrou MULTI-JOURS §9.1) ──────────────────────
drop function if exists public.create_competition(text, text, text, text, text, text, text, text, text, text, text[], text[], int, text, text);
create or replace function public.create_competition(
  p_organizer_type text, p_organizer_name text, p_organizer_phone text, p_club_id text, p_club_name text,
  p_title text, p_format text, p_level text, p_date_key text, p_end_date_key text,
  p_courts text[], p_slots text[], p_capacity integer, p_fee text, p_reward text,
  p_slot_durations int[] default '{}'::int[]
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  new_id uuid;
  v_official boolean;
  v_status text;
  v_commission int := 0;
  d int;
begin
  if auth.uid() is null then return null; end if;
  if coalesce(trim(p_title), '') = '' or coalesce(trim(p_date_key), '') = '' then return null; end if;
  -- Parité + valeurs des durées tournoi (miroir de la contrainte CHECK — refus propre côté RPC).
  if p_slot_durations is not null
     and cardinality(p_slot_durations) not in (0, cardinality(coalesce(p_slots, '{}'))) then
    return null;
  end if;
  if not public.durations_60_90(p_slot_durations) then return null; end if;

  if p_organizer_type = 'club' then
    if not public.can_manage_club(p_club_id) then return null; end if; -- réservé au gérant du club
    -- Dates validées (car ::date plus bas dans le verrou multi-jours).
    if p_date_key !~ '^\d{4}-\d{2}-\d{2}$'
       or (nullif(p_end_date_key, '') is not null and p_end_date_key !~ '^\d{4}-\d{2}-\d{2}$') then
      return null;
    end if;
    begin
      perform p_date_key::date, coalesce(nullif(p_end_date_key, ''), p_date_key)::date;
    exception when others then return null; end;
    -- Verrou sur CHAQUE jour de la plage (fix §9.1 : un tournoi multi-jours doit sérialiser avec
    -- les résas de tous ses jours, pas seulement le jour de début). Ordre croissant → pas d'inter-
    -- blocage, même discipline que block_range. Clé byte-identique à la garde résa (to_char).
    for d in 0 .. (coalesce(nullif(p_end_date_key, ''), p_date_key)::date - p_date_key::date) loop
      perform pg_advisory_xact_lock(hashtext(p_club_id || ':' || to_char(p_date_key::date + d, 'YYYY-MM-DD')));
    end loop;
    if public.competition_slot_conflict(p_club_id, p_date_key, p_end_date_key,
         coalesce(p_slots, '{}'), coalesce(p_courts, '{}'), coalesce(p_slot_durations, '{}')) then
      return null;
    end if;
    v_official := true;
    v_status := 'published';
  elsif p_organizer_type = 'operator' then
    -- Tournoi officiel PADELCONNECT : RÉSERVÉ à l'opérateur (anti-spoofing). En attente tant que
    -- le club hôte ne l'a pas validé (approve_competition vérifie la double occupation). Sans commission.
    if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'operator') then
      return null;
    end if;
    v_official := true;
    v_status := 'pending';
  else
    v_official := false;
    v_status := 'pending';
    select player_fee into v_commission from public.tournament_config where id = true;
    v_commission := coalesce(v_commission, 0);
  end if;

  insert into public.competitions (
    organizer_id, organizer_type, organizer_name, organizer_phone, club_id, club_name,
    title, format, level, date_key, end_date_key, courts, slots, slot_durations,
    capacity, fee, reward, official, status, commission
  ) values (
    auth.uid(), p_organizer_type, coalesce(p_organizer_name, ''), nullif(trim(coalesce(p_organizer_phone, '')), ''), p_club_id, p_club_name,
    trim(p_title), coalesce(p_format, ''), coalesce(p_level, ''), p_date_key, nullif(p_end_date_key, ''),
    coalesce(p_courts, '{}'), coalesce(p_slots, '{}'), coalesce(p_slot_durations, '{}'),
    greatest(coalesce(p_capacity, 8), 1), coalesce(p_fee, ''), coalesce(p_reward, ''),
    v_official, v_status, v_commission
  ) returning id into new_id;
  return new_id;
end;
$$;

grant execute on function public.create_competition(text, text, text, text, text, text, text, text, text, text, text[], text[], int, text, text, int[]) to authenticated;
revoke execute on function public.create_competition(text, text, text, text, text, text, text, text, text, text, text[], text[], int, text, text, int[]) from public, anon;

-- ─── 17) approve_competition (durées tournoi + verrou MULTI-JOURS §9.1) ────────────────────────
create or replace function public.approve_competition(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_club text;
  v_date text;
  v_end text;
  v_slots text[];
  v_courts text[];
  v_durs int[];
  d int;
begin
  select club_id, date_key, end_date_key, slots, courts, slot_durations
    into v_club, v_date, v_end, v_slots, v_courts, v_durs
    from public.competitions where id = p_id and status = 'pending';
  if v_club is null then return false; end if;
  if not public.can_manage_club(v_club) then return false; end if;
  -- Dates validées (car ::date dans le verrou multi-jours).
  if v_date !~ '^\d{4}-\d{2}-\d{2}$'
     or (nullif(v_end, '') is not null and v_end !~ '^\d{4}-\d{2}-\d{2}$') then
    return false;
  end if;
  begin
    perform v_date::date, coalesce(nullif(v_end, ''), v_date)::date;
  exception when others then return false; end;
  -- Verrou sur CHAQUE jour de la plage (fix §9.1).
  for d in 0 .. (coalesce(nullif(v_end, ''), v_date)::date - v_date::date) loop
    perform pg_advisory_xact_lock(hashtext(v_club || ':' || to_char(v_date::date + d, 'YYYY-MM-DD')));
  end loop;
  if public.competition_slot_conflict(v_club, v_date, v_end, coalesce(v_slots, '{}'), coalesce(v_courts, '{}'), coalesce(v_durs, '{}'), p_id) then
    return false;
  end if;
  update public.competitions set status = 'published' where id = p_id and status = 'pending';
  return true;
end;
$$;

-- ─── 18) block_range (croisement tournoi en intervalle ; réservations en intervalle) ──────────
create or replace function public.block_range(p_club_id text, p_court text, p_date_from text, p_date_to text, p_times text[] default null::text[], p_reason text default ''::text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
  v_court text := nullif(trim(coalesce(p_court, '')), '');
  v_id uuid;
  d int;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and (p.managed_club_id = p_club_id or p.role = 'operator')
  ) then
    return 'forbidden';
  end if;
  if p_date_from !~ '^\d{4}-\d{2}-\d{2}$' or p_date_to !~ '^\d{4}-\d{2}-\d{2}$'
     or p_date_from > p_date_to
     or p_date_to > to_char(now() + interval '366 days', 'YYYY-MM-DD') then
    return 'invalid';
  end if;
  begin
    perform p_date_from::date, p_date_to::date;
  exception when others then
    return 'invalid';
  end;
  if p_times is not null and (
    coalesce(array_length(p_times, 1), 0) > 48
    or exists (select 1 from unnest(p_times) t where t !~ '^\d{2}:\d{2}$')
  ) then
    return 'invalid';
  end if;
  if (select count(*) from public.blocked_ranges br
      where br.club_id = p_club_id and br.date_to >= to_char(now(), 'YYYY-MM-DD')) >= 100 then
    return 'invalid';
  end if;
  -- Verrous par jour (convention 53/54) sur toute la plage, ordre croissant → pas d'interblocage.
  for d in 0 .. (p_date_to::date - p_date_from::date) loop
    perform pg_advisory_xact_lock(hashtext(p_club_id || ':' || to_char(p_date_from::date + d, 'YYYY-MM-DD')));
  end loop;
  -- Réservation à venir dans la période (chevauchement d'intervalle : une heure fermée T = [T,T+90)) → refus.
  if exists (
    select 1 from public.reservations r
    where r.club_id = p_club_id and r.status = 'booked' and r.starts_at > v_now
      and r.date_key >= p_date_from and r.date_key <= p_date_to
      and (v_court is null or r.court = v_court)
      and (
        p_times is null or coalesce(array_length(p_times, 1), 0) = 0
        or exists (
          select 1 from unnest(p_times) bt
          where public.hhmm_to_min(bt) is not null and public.hhmm_to_min(r."time") is not null
            and public.hhmm_to_min(bt) < public.hhmm_to_min(r."time") + r.duration_min
            and public.hhmm_to_min(r."time") < public.hhmm_to_min(bt) + 90
        )
      )
  ) then
    return 'reservations';
  end if;
  -- Tournoi publié qui chevauche la période (créneau tournoi j = [slots[j], +slot_durations[j])) → refus.
  if exists (
    select 1 from public.competitions c
    where c.club_id = p_club_id and c.status = 'published'
      and c.date_key <= p_date_to
      and coalesce(nullif(c.end_date_key, ''), c.date_key) >= p_date_from
      and (v_court is null or coalesce(array_length(c.courts, 1), 0) = 0 or v_court = any (c.courts))
      and (
        p_times is null or coalesce(array_length(p_times, 1), 0) = 0 or coalesce(array_length(c.slots, 1), 0) = 0
        or exists (
          select 1 from unnest(p_times) bt
          cross join unnest(c.slots) with ordinality as cs(t, j)
          where public.hhmm_to_min(bt) is not null and public.hhmm_to_min(cs.t) is not null
            and public.hhmm_to_min(bt) < public.hhmm_to_min(cs.t) + coalesce(c.slot_durations[cs.j], 90)
            and public.hhmm_to_min(cs.t) < public.hhmm_to_min(bt) + 90
        )
      )
  ) then
    return 'competitions';
  end if;
  insert into public.blocked_ranges (club_id, court, date_from, date_to, times, reason)
    values (p_club_id, v_court, p_date_from, p_date_to,
            case when coalesce(array_length(p_times, 1), 0) = 0 then null else p_times end,
            left(trim(coalesce(p_reason, '')), 200))
    returning id into v_id;
  return 'ok:' || v_id::text;
end;
$$;

-- ─── 19) SCORE / CLASSEMENT — durée FIGÉE au lieu de 90*60000 en dur (5 occurrences) ───────────
-- submit_match_score : la fin réelle du match = starts_at + duration_min*60000 (1 occurrence).
create or replace function public.submit_match_score(p_reservation_id uuid, p_sets jsonb)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_res record;
  v_players uuid[];
  v_pc int;
  v_wn int;
  v_set jsonb;
  v_me int;
  v_them int;
  v_mine int := 0;
  v_theirs int := 0;
  v_iwon boolean;
  v_canon text := '';
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
  v_has_prior boolean;
  v_n int; v_dc int; v_w int; v_l int; v_first timestamptz;
begin
  if v_uid is null then return 'error'; end if;
  select id, user_id, status, starts_at, duration_min into v_res
    from public.reservations where id = p_reservation_id;
  if v_res.id is null or v_res.status <> 'booked' then return 'error'; end if;
  if v_res.starts_at + (v_res.duration_min * 60000) >= v_now then return 'error'; end if;
  select exists (select 1 from public.match_results where reservation_id = p_reservation_id)
    into v_has_prior;
  if v_res.starts_at < v_now - 14 * 86400000 and not v_has_prior then
    return 'error';
  end if;
  select array_agg(distinct t.uid) into v_players from (
    select v_res.user_id as uid
    union all
    select rp.user_id from public.reservation_participants rp
      where rp.reservation_id = p_reservation_id and rp.status = 'accepted'
  ) t;
  if not (v_uid = any (v_players)) then return 'error'; end if;
  v_pc := array_length(v_players, 1);
  if v_pc < 2 then return 'no_players'; end if;
  v_wn := least(2, v_pc - 1); -- vainqueurs max : 2 (padel), jamais tous les comptes (1v1 → 1)
  if jsonb_typeof(p_sets) <> 'array'
     or jsonb_array_length(p_sets) < 1 or jsonb_array_length(p_sets) > 3 then
    return 'error';
  end if;
  for v_set in select * from jsonb_array_elements(p_sets) loop
    if jsonb_typeof(v_set -> 'me') <> 'number' or jsonb_typeof(v_set -> 'them') <> 'number' then
      return 'error';
    end if;
    v_me := (v_set ->> 'me')::int;
    v_them := (v_set ->> 'them')::int;
    if v_me < 0 or v_me > 30 or v_them < 0 or v_them > 30 or v_me = v_them then
      return 'error';
    end if;
    if v_me > v_them then v_mine := v_mine + 1; else v_theirs := v_theirs + 1; end if;
  end loop;
  if v_mine = v_theirs then return 'error'; end if;
  v_iwon := v_mine > v_theirs;
  select string_agg(
           case when v_iwon then (s ->> 'me') || '-' || (s ->> 'them')
                else (s ->> 'them') || '-' || (s ->> 'me') end, ', ')
    into v_canon
    from jsonb_array_elements(p_sets) s;
  insert into public.match_results (reservation_id, user_id, sets, i_won, canon)
    values (p_reservation_id, v_uid, p_sets, v_iwon, v_canon)
    on conflict (reservation_id, user_id)
    do update set sets = excluded.sets, i_won = excluded.i_won,
                  canon = excluded.canon, created_at = now();
  select count(*), count(distinct canon), count(*) filter (where i_won),
         count(*) filter (where not i_won), min(created_at)
    into v_n, v_dc, v_w, v_l, v_first
    from public.match_results where reservation_id = p_reservation_id;
  if v_dc > 1 or v_w > v_wn then return 'conflict'; end if;
  -- Validé si : UNE seule saisie gagnante restée 48 h sans réponse, OU un perdant en miroir.
  -- Deux « je gagne » sans perdant (v_l = 0, v_n > 1) ne valident jamais (anti-triche §9).
  if v_dc = 1 and (
       (v_n = 1 and v_w = 1 and v_first < now() - interval '48 hours')
       or (v_w >= 1 and v_w <= v_wn and v_l >= 1)
     ) then
    return 'validated';
  end if;
  return 'waiting';
end;
$$;

-- fetch_leaderboard : 2 occurrences 90*60000 → duration_min*60000 (résas propres + résas rejointes).
create or replace function public.fetch_leaderboard(p_limit integer default 50)
returns table(user_id uuid, name text, level numeric, wins integer, match_wins integer, off_played integer, played integer, points integer)
language sql
stable
security definer
set search_path to 'public'
as $$
  with mstats as ( -- agrégats de score par réservation + nb de joueurs identifiés
    select mr.reservation_id,
           count(*) n,
           count(*) filter (where mr.i_won) w,
           count(*) filter (where not mr.i_won) l,
           count(distinct mr.canon) dc,
           min(mr.created_at) first_at,
           1 + (select count(*) from public.reservation_participants rp
                  where rp.reservation_id = mr.reservation_id and rp.status = 'accepted') pc
      from public.match_results mr group by mr.reservation_id
  ),
  valid_wins as ( -- victoire de match validée et non falsifiée, par joueur (résa encore 'booked')
    select mr.user_id
      from public.match_results mr
      join public.reservations rr on rr.id = mr.reservation_id and rr.status = 'booked'
      join mstats a on a.reservation_id = mr.reservation_id
     where mr.i_won and a.dc = 1 and (
             (a.n = 1 and a.w = 1 and a.first_at < now() - interval '48 hours')
             or (a.w >= 1 and a.w <= least(2, a.pc - 1) and a.l >= 1)
           )
  ),
  base as (
    select p.id,
           trim(coalesce(p.first_name, '') || ' ' ||
                case when coalesce(p.last_name, '') <> '' then left(p.last_name, 1) || '.' else '' end) as pname,
           coalesce(p.level, 3)::numeric as plevel,
           (select count(*)::int from public.competitions c
              where c.status = 'closed' and c.official and c.winner_user_id = p.id) as wins,
           (select count(*)::int from public.competitions c
              join public.competition_registrations rg on rg.competition_id = c.id and rg.user_id = p.id
              where c.status = 'closed' and c.official) as offplayed,
           (select count(*)::int from valid_wins vw where vw.user_id = p.id) as mwins,
           ((select count(*) from public.reservations r
               where r.user_id = p.id and r.status = 'booked'
                 and r.starts_at + (r.duration_min * 60000) < (extract(epoch from now()) * 1000)::bigint)
            + (select count(*) from public.reservation_participants rp
                 join public.reservations rr on rr.id = rp.reservation_id
                 where rp.user_id = p.id and rp.status = 'accepted' and rr.user_id <> p.id
                   and rr.status = 'booked'
                   and rr.starts_at + (rr.duration_min * 60000) < (extract(epoch from now()) * 1000)::bigint))::int as played
      from public.profiles p
      where coalesce(trim(p.first_name), '') <> ''
        and coalesce(p.role, 'player') = 'player'
  )
  select b.id, b.pname, b.plevel, b.wins, b.mwins, b.offplayed, b.played,
         (b.wins * 100 + b.offplayed * 10 + b.mwins * 3 + b.played * 2) as points
    from base b
    where (b.wins * 100 + b.offplayed * 10 + b.mwins * 3 + b.played * 2) > 0 -- pas de joueur à 0 pt
    order by 8 desc, b.wins desc, b.mwins desc, b.id -- le NIVEAU ne départage jamais (règle §9)
    limit greatest(coalesce(p_limit, 50), 1);
$$;

-- my_leaderboard_rank : 2 occurrences 90*60000 → duration_min*60000.
create or replace function public.my_leaderboard_rank()
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  with mstats as (
    select mr.reservation_id,
           count(*) n,
           count(*) filter (where mr.i_won) w,
           count(*) filter (where not mr.i_won) l,
           count(distinct mr.canon) dc,
           min(mr.created_at) first_at,
           1 + (select count(*) from public.reservation_participants rp
                  where rp.reservation_id = mr.reservation_id and rp.status = 'accepted') pc
      from public.match_results mr group by mr.reservation_id
  ),
  valid_wins as (
    select mr.user_id
      from public.match_results mr
      join public.reservations rr on rr.id = mr.reservation_id and rr.status = 'booked'
      join mstats a on a.reservation_id = mr.reservation_id
     where mr.i_won and a.dc = 1 and (
             (a.n = 1 and a.w = 1 and a.first_at < now() - interval '48 hours')
             or (a.w >= 1 and a.w <= least(2, a.pc - 1) and a.l >= 1)
           )
  ),
  base as (
    select p.id,
           (select count(*) from public.competitions c
              where c.status = 'closed' and c.official and c.winner_user_id = p.id) as wins,
           (select count(*) from public.competitions c
              join public.competition_registrations rg on rg.competition_id = c.id and rg.user_id = p.id
              where c.status = 'closed' and c.official) as offplayed,
           (select count(*) from valid_wins vw where vw.user_id = p.id) as mwins,
           ((select count(*) from public.reservations r
               where r.user_id = p.id and r.status = 'booked'
                 and r.starts_at + (r.duration_min * 60000) < (extract(epoch from now()) * 1000)::bigint)
            + (select count(*) from public.reservation_participants rp
                 join public.reservations rr on rr.id = rp.reservation_id
                 where rp.user_id = p.id and rp.status = 'accepted' and rr.user_id <> p.id
                   and rr.status = 'booked'
                   and rr.starts_at + (rr.duration_min * 60000) < (extract(epoch from now()) * 1000)::bigint)) as played
      from public.profiles p
      where coalesce(trim(p.first_name), '') <> '' and coalesce(p.role, 'player') = 'player'
  ),
  scored as (
    select id, (wins * 100 + offplayed * 10 + mwins * 3 + played * 2) as points, wins, mwins from base
  ),
  ranked as (
    select id, row_number() over (order by points desc, wins desc, mwins desc, id) as rk
      from scored where points > 0 -- non classé tant qu'on n'a marqué aucun point
  )
  -- 0 = NON CLASSÉ (0 point) — distinct d'un échec réseau côté client (null).
  select coalesce((select rk::int from ranked where id = auth.uid()), 0);
$$;

-- ─── 20) mark_no_show — le retour à 'booked' déclenche l'EXCLUSION (23P01) et non plus 23505 ────
create or replace function public.mark_no_show(p_id uuid, p_value boolean default true)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare allowed boolean;
begin
  select exists (
    select 1
    from public.reservations r
    join public.profiles p on p.id = auth.uid()
    where r.id = p_id
      and ((p.role = 'club' and p.managed_club_id = r.club_id) or p.role = 'operator')
  ) into allowed;
  if not allowed then return false; end if;
  if p_value then
    update public.reservations set status = 'no_show' where id = p_id and status in ('booked', 'no_show');
  else
    -- Annule l'absence (repasse en réservé) — possible seulement si le créneau est resté libre.
    update public.reservations set status = 'booked' where id = p_id and status = 'no_show';
  end if;
  return found;
exception when unique_violation or exclusion_violation then
  return false; -- le créneau a été repris entre-temps : retour à 'booked' impossible
end;
$$;

-- ─── 21) GRANTS / REVOKES des NOUVELLES fonctions internes (helpers) ──────────────────────────
-- resolve_court_slots = helper interne (appelé par les gardes SECURITY DEFINER) : non exposé.
revoke execute on function public.resolve_court_slots(text, text) from public, anon, authenticated;
-- hhmm_to_min / durations_60_90 : immuables et inoffensifs, utilisés dans les contraintes CHECK
-- → on LAISSE l'EXECUTE PUBLIC par défaut (sinon un INSERT non-owner échouerait sur le CHECK).
