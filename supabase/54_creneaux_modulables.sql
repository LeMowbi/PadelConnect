-- PadelConnect — CRÉNEAUX MODULABLES (SQL Editor → Run). Idempotent.
--
-- Trois briques décidées avec le porteur (2026-07-03) :
--   1. FERMER UN TERRAIN SUR UNE PÉRIODE (travaux, événement privé…) : table `blocked_ranges`
--      (terrain précis ou tout le club, du jour A au jour B, toute la journée ou certaines
--      heures). Les joueurs ne voient plus ces créneaux, le serveur refuse toute résa dessus.
--   2. GRILLE LIBRE : le gérant ajoute/retire n'importe quel horaire (l'app garantit 90 min
--      d'écart) — AUCUN changement serveur nécessaire : la garde `= any(slots)` accepte déjà
--      toute grille stockée dans club_config.slots.
--   3. FERMETURES RÉCURRENTES PAR TERRAIN : colonne `club_config.court_closed`
--      ({ "Terrain 1": ["18:00"] } = le Terrain 1 est fermé tous les jours à 18h00, pour TOUTES
--      les réservations — cours in-app compris). Les autres terrains restent réservables.
--
-- La durée de session reste 1h30 partout (tarifs, commission, anti double-résa inchangés).

-- ─── 1) FERMETURES SUR PÉRIODE ──────────────────────────────────────────────────
create table if not exists public.blocked_ranges (
  id uuid primary key default gen_random_uuid(),
  club_id text not null,
  court text, -- null = tous les terrains du club
  date_from text not null, -- 'AAAA-MM-JJ' (clé de jour UTC, comme partout)
  date_to text not null,
  times text[], -- null / vide = toute la journée ; sinon liste d'heures 'HH:MM'
  reason text not null default '',
  created_at timestamptz not null default now(),
  constraint blocked_ranges_dates check (date_from <= date_to)
);

alter table public.blocked_ranges enable row level security;

-- Lecture par tout compte connecté : la DISPONIBILITÉ des joueurs en dépend (un créneau fermé
-- doit disparaître de leur grille). Aucune donnée personnelle dans cette table.
drop policy if exists blocked_ranges_select on public.blocked_ranges;
create policy blocked_ranges_select on public.blocked_ranges for select to authenticated using (true);
-- Écritures UNIQUEMENT via les RPC SECURITY DEFINER ci-dessous (aucune policy insert/update/delete).

-- Le MOTIF (reason) est un texte libre du gérant : les joueurs n'ont pas à le télécharger.
-- Grants DE COLONNES : la ligne reste lisible (la dispo joueur en dépend) mais SANS reason —
-- le gérant lit ses motifs via club_blocked_reasons (plus bas).
revoke select on table public.blocked_ranges from public, anon, authenticated;
grant select (id, club_id, court, date_from, date_to, times) on public.blocked_ranges to authenticated;

-- Ferme un terrain (ou tout le club) sur une période. Renvoie un statut TEXTE :
--   'ok:<uuid>'    → fermeture créée (l'app garde l'id : miroir local juste même si la
--                    relecture réseau échoue, réouverture immédiate possible)
--   'forbidden'    → pas le gérant de ce club (ni l'opérateur)
--   'invalid'      → dates mal formées / à l'envers / période > 1 an / heures invalides /
--                    entrées hors bornes (motif > 200 c., > 48 heures listées, > 100 périodes)
--   'reservations' → une résa À VENIR existe dans la période : annule-la d'abord (cohérent
--                    avec la fermeture d'un créneau récurrent côté app)
--   'competitions' → un tournoi PUBLIÉ chevauche la période (terrain bloqué pour les inscrits,
--                    même croisement que competition_slot_conflict) : à régler avec le club
drop function if exists public.block_range(text, text, text, text, text[], text);
create or replace function public.block_range(
  p_club_id text,
  p_court text,
  p_date_from text,
  p_date_to text,
  p_times text[] default null,
  p_reason text default ''
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
  -- p_court normalisé UNE FOIS ('' → null = tous les terrains) : la garde et l'insertion
  -- travaillent sur la MÊME valeur (sinon '' passait la garde terrain sans la restreindre).
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
  if p_times is not null and (
    coalesce(array_length(p_times, 1), 0) > 48
    or exists (select 1 from unnest(p_times) t where t !~ '^\d{2}:\d{2}$')
  ) then
    return 'invalid';
  end if;
  -- Bornes anti-abus : un gérant n'accumule pas des centaines de périodes actives (amplification
  -- vers tous les téléphones : la table est téléchargée par chaque joueur).
  if (select count(*) from public.blocked_ranges br
      where br.club_id = p_club_id and br.date_to >= to_char(now(), 'YYYY-MM-DD')) >= 100 then
    return 'invalid';
  end if;
  -- Mêmes verrous que la barrière d'insertion et approve_competition (clé club:jour, convention
  -- 53) : aucune résa ne se faufile dans la période pendant qu'on la vérifie. Période bornée à
  -- 366 jours, jours pris en ordre croissant → pas d'interblocage.
  for d in 0 .. (p_date_to::date - p_date_from::date) loop
    perform pg_advisory_xact_lock(hashtext(p_club_id || ':' || to_char(p_date_from::date + d, 'YYYY-MM-DD')));
  end loop;
  -- Une réservation à venir vit déjà dans la période → on refuse (le gérant l'annule d'abord,
  -- sinon elle deviendrait invisible du planning sans être annulée — même règle que l'app).
  if exists (
    select 1 from public.reservations r
    where r.club_id = p_club_id and r.status = 'booked' and r.starts_at > v_now
      and r.date_key >= p_date_from and r.date_key <= p_date_to
      and (v_court is null or r.court = v_court)
      and (p_times is null or coalesce(array_length(p_times, 1), 0) = 0 or r."time" = any (p_times))
  ) then
    return 'reservations';
  end if;
  -- Un tournoi PUBLIÉ chevauche la période → on refuse aussi (ses terrains/créneaux sont dus
  -- aux inscrits ; miroir exact du croisement blocked_ranges de competition_slot_conflict).
  if exists (
    select 1 from public.competitions c
    where c.club_id = p_club_id and c.status = 'published'
      and c.date_key <= p_date_to
      and coalesce(nullif(c.end_date_key, ''), c.date_key) >= p_date_from
      and (v_court is null or coalesce(array_length(c.courts, 1), 0) = 0 or v_court = any (c.courts))
      and (p_times is null or coalesce(array_length(p_times, 1), 0) = 0
           or coalesce(array_length(c.slots, 1), 0) = 0 or c.slots && p_times)
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

grant execute on function public.block_range(text, text, text, text, text[], text) to authenticated;
revoke execute on function public.block_range(text, text, text, text, text[], text) from public, anon;

-- Rouvre une période fermée (gérant du club concerné, ou opérateur).
drop function if exists public.unblock_range(uuid);
create or replace function public.unblock_range(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.blocked_ranges br
    using public.profiles p
    where br.id = p_id and p.id = auth.uid()
      and (p.managed_club_id = br.club_id or p.role = 'operator');
  return found;
end;
$$;

grant execute on function public.unblock_range(uuid) to authenticated;
revoke execute on function public.unblock_range(uuid) from public, anon;

-- Purge opportuniste des périodes entièrement passées (appelée par l'app à l'ouverture de
-- l'Espace Club — même motif que la purge des signalements résolus).
drop function if exists public.purge_old_blocked_ranges();
create or replace function public.purge_old_blocked_ranges()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.blocked_ranges where date_to < to_char(now() - interval '7 days', 'YYYY-MM-DD');
$$;

grant execute on function public.purge_old_blocked_ranges() to authenticated;
revoke execute on function public.purge_old_blocked_ranges() from public, anon;

-- Motifs des périodes fermées — réservés au gérant du club (ou à l'opérateur), puisque la
-- colonne reason n'est plus lisible en direct (grants de colonnes plus haut).
drop function if exists public.club_blocked_reasons(text);
create or replace function public.club_blocked_reasons(p_club_id text)
returns table (id uuid, reason text)
language sql
security definer
set search_path = public
as $$
  select br.id, br.reason
  from public.blocked_ranges br
  where br.club_id = p_club_id
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and (p.managed_club_id = p_club_id or p.role = 'operator')
    );
$$;

grant execute on function public.club_blocked_reasons(text) to authenticated;
revoke execute on function public.club_blocked_reasons(text) from public, anon;

-- ─── 2) FERMETURES RÉCURRENTES PAR TERRAIN ──────────────────────────────────────
alter table public.club_config add column if not exists court_closed jsonb;

-- upsert_club_config gagne p_court_closed (fusion partielle comme les autres champs).
-- Signature CHANGÉE → drop de l'ancienne (convention §8, sinon ambiguïté PostgREST) ; les
-- vieux builds appellent par paramètres NOMMÉS sans p_court_closed → défaut null → inchangé.
drop function if exists public.upsert_club_config(text, text[], text[], jsonb, jsonb, text[], text, jsonb);
create or replace function public.upsert_club_config(
  p_club_id text,
  p_slots text[] default null,
  p_courts text[] default null,
  p_offers jsonb default null,
  p_coaches jsonb default null,
  p_photos text[] default null,
  p_cover_url text default null,
  p_court_photos jsonb default null,
  p_court_closed jsonb default null
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
    return false;
  end if;
  -- Bornes anti-abus : court_closed est téléchargé par tous les joueurs — un objet difforme
  -- ou énorme est refusé net (l'app n'envoie jamais ça : seul un appel forgé le ferait).
  if p_court_closed is not null
     and (jsonb_typeof(p_court_closed) <> 'object' or pg_column_size(p_court_closed) > 8192) then
    return false;
  end if;
  insert into public.club_config (club_id, slots, courts, offers, coaches, photos, cover_url, court_photos, court_closed)
    values (p_club_id, p_slots, p_courts, p_offers, p_coaches, p_photos, nullif(p_cover_url, ''), p_court_photos, p_court_closed)
    on conflict (club_id) do update set
      slots = coalesce(excluded.slots, public.club_config.slots),
      courts = coalesce(excluded.courts, public.club_config.courts),
      offers = coalesce(excluded.offers, public.club_config.offers),
      coaches = coalesce(excluded.coaches, public.club_config.coaches),
      photos = coalesce(excluded.photos, public.club_config.photos),
      -- '' = « retirer la cover » (null = champ non fourni → on garde l'existante).
      cover_url = case
        when p_cover_url = '' then null
        else coalesce(p_cover_url, public.club_config.cover_url)
      end,
      court_photos = coalesce(excluded.court_photos, public.club_config.court_photos),
      court_closed = coalesce(excluded.court_closed, public.club_config.court_closed),
      updated_at = now();
  return true;
end;
$$;

grant execute on function public.upsert_club_config(text, text[], text[], jsonb, jsonb, text[], text, jsonb, jsonb)
  to authenticated;
revoke execute on function public.upsert_club_config(text, text[], text[], jsonb, jsonb, text[], text, jsonb, jsonb)
  from public, anon;

-- ─── 3) BARRIÈRE D'INSERTION DES RÉSERVATIONS (période + terrain fermé) ─────────
-- Reprend la version de la 53 et ajoute : refus si le terrain est fermé de façon récurrente
-- à cette heure (court_closed) ou si (club, jour, heure, terrain) tombe dans une période fermée.
create or replace function public.reservations_insert_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
  v_upcoming int;
  v_slots text[];
  v_courts text[];
  v_court_closed jsonb;
begin
  -- Sérialise avec approve_competition (même clé club:jour) : plus de fenêtre où une résa et
  -- une publication de tournoi se croisent sans se voir.
  perform pg_advisory_xact_lock(hashtext(new.club_id || ':' || new.date_key));
  -- Une réservation naît TOUJOURS 'booked' et non confirmée (seules les RPC la font évoluer).
  new.club_confirmed := false;
  new.status := 'booked';
  -- Créneau passé : interdit (tolérance 15 min pour l'horloge).
  if new.starts_at is null or new.starts_at < v_now - 15 * 60000 then
    raise exception 'reservation must be in the future';
  end if;
  -- GRILLE DU CLUB (50/audit 7) : si une config existe, le créneau doit être OUVERT — un
  -- créneau fermé est stocké '!HH:MM' et ne matche jamais — et le terrain doit être déclaré.
  -- Rend la grille opposable aux vieux builds comme aux INSERT forgés.
  select c.slots, c.courts, c.court_closed into v_slots, v_courts, v_court_closed
    from public.club_config c where c.club_id = new.club_id;
  if v_slots is not null and array_length(v_slots, 1) > 0 and not (new."time" = any (v_slots)) then
    raise exception 'slot closed';
  end if;
  if v_courts is not null and array_length(v_courts, 1) > 0 and not (new.court = any (v_courts)) then
    raise exception 'unknown court';
  end if;
  -- TERRAIN fermé de façon récurrente à cette heure (54) : { "Terrain 1": ["18:00", …] }.
  if v_court_closed is not null and (v_court_closed -> new.court) ? new."time" then
    raise exception 'slot closed';
  end if;
  -- PÉRIODE fermée (54) : terrain précis ou tout le club, toute la journée ou certaines heures.
  if exists (
    select 1 from public.blocked_ranges br
    where br.club_id = new.club_id
      and new.date_key >= br.date_from and new.date_key <= br.date_to
      and (br.court is null or br.court = new.court)
      and (br.times is null or new."time" = any (br.times))
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

-- ─── 4) TOURNOIS : une période fermée bloque aussi la validation d'un tournoi ───
-- Même signature que la 53 → create or replace suffit. Ajoute le croisement blocked_ranges
-- (une période « tout le club » ou « ce terrain » croise toute plage de tournoi qui la touche).
create or replace function public.competition_slot_conflict(
  p_club_id text, p_date_key text, p_end_date_key text, p_slots text[], p_courts text[], p_exclude uuid default null
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.competition_overlaps_reservations(p_club_id, p_date_key, p_end_date_key, p_slots, p_courts)
    or exists (
      select 1 from public.competitions c
      where c.club_id = p_club_id and c.status = 'published'
        and (p_exclude is null or c.id <> p_exclude)
        and c.date_key <= coalesce(nullif(p_end_date_key, ''), p_date_key)
        and coalesce(nullif(c.end_date_key, ''), c.date_key) >= p_date_key
        and (coalesce(array_length(p_slots, 1), 0) = 0 or coalesce(array_length(c.slots, 1), 0) = 0 or c.slots && p_slots)
        and (coalesce(array_length(p_courts, 1), 0) = 0 or coalesce(array_length(c.courts, 1), 0) = 0 or c.courts && p_courts)
    )
    or exists (
      select 1 from public.blocked_slots b
      where b.club_id = p_club_id
        and b.date_key >= p_date_key
        and b.date_key <= coalesce(nullif(p_end_date_key, ''), p_date_key)
        and (coalesce(array_length(p_slots, 1), 0) = 0 or b."time" = any (p_slots))
        and (coalesce(array_length(p_courts, 1), 0) = 0 or b.court = any (p_courts))
    )
    or exists (
      select 1 from public.blocked_ranges br
      where br.club_id = p_club_id
        and br.date_from <= coalesce(nullif(p_end_date_key, ''), p_date_key)
        and br.date_to >= p_date_key
        and (br.times is null or coalesce(array_length(p_slots, 1), 0) = 0 or br.times && p_slots)
        and (br.court is null or coalesce(array_length(p_courts, 1), 0) = 0 or br.court = any (p_courts))
    );
$$;

-- Ces deux helpers ne sont appelés QUE depuis des fonctions SECURITY DEFINER (create/approve
-- competition), qui s'exécutent en owner : personne d'autre n'a à les exécuter — exposés, ils
-- serviraient d'oracle d'occupation sans compte.
revoke execute on function public.competition_slot_conflict(text, text, text, text[], text[], uuid) from public, anon, authenticated;
revoke execute on function public.competition_overlaps_reservations(text, text, text, text[], text[]) from public, anon, authenticated;
