-- PadelConnect — Fermetures décidées par le porteur après l'AUDIT COMPLET (2026-07-11). À coller
-- APRÈS la 73, dans Supabase → SQL Editor → Run. IDEMPOTENT. `search_path` figé partout.
--
-- Le porteur a choisi de FERMER MAINTENANT les LOW « défense en profondeur / appel forgé » que la 73
-- avait reportés, et de corriger M2 côté serveur. Chaque reproduction de fonction est BYTE-fidèle à
-- l'original SAUF le correctif chirurgical indiqué.
--
--   1) respond_lesson (68)   — clé de verrou `coach:jour:heure` → `coach:jour` : deux cours qui SE
--                              CHEVAUCHENT (mix 1h/1h30) à des heures ≠ prenaient des clés ≠ et
--                              passaient tous les deux en acceptation concurrente.
--   2) block_range (68)      — étendue de dates bornée (≤ 366 j) AVANT la boucle de verrous.
--   3) create_competition(68)— idem : étendue bornée AVANT la boucle de verrous de la branche 'club'
--                              (le trigger de la 73 protège la persistance ; ceci ferme la boucle
--                              interne, seul résiduel restant).
--   4) club_config (trigger) — `court_slots.d` doit être un NOMBRE 60/90 (un `d:"60"` forgé, chaîne,
--                              était résolu 60 côté serveur mais replié 90 côté client → divergence).
--   5) M2 (phone, 67)        — une inscription JAMAIS confirmée (> 24 h) ne squatte plus le numéro :
--                              `phone_available` l'ignore, `handle_new_user` purge le fantôme (best-
--                              effort) puis refuse si un compte confirmé/récent tient le numéro.

-- ─── 1) respond_lesson : verrou par coach:JOUR (plus par coach:jour:heure) ─────────────────────
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

  -- Deux acceptations concurrentes du même coach le même JOUR : le verrou sérialise (clé coach:jour,
  -- PAS coach:jour:heure — audit 2026-07-11 : depuis les durées mixtes 1h/1h30, deux cours à des
  -- heures ≠ peuvent SE CHEVAUCHER ; une clé par heure laissait passer les deux en parallèle). La
  -- seconde voit alors le cours déjà accepté (chevauchement d'INTERVALLE, durée propre) → 'busy'.
  perform pg_advisory_xact_lock(hashtext('lesson:' || l.coach_id || ':' || l.date_key));
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

grant execute on function public.respond_lesson(uuid, boolean) to authenticated;

-- ─── 2) block_range : étendue de dates bornée AVANT la boucle de verrous ───────────────────────
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
  -- Étendue bornée (audit 2026-07-11) : sans plafond d'étendue, un `p_date_from` ancien forgé + une
  -- fin proche = des centaines de milliers de pg_advisory_xact_lock dans la boucle ci-dessous.
  if p_date_to::date - p_date_from::date > 366 then
    return 'invalid';
  end if;
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

grant execute on function public.block_range(text, text, text, text, text[], text) to authenticated;
revoke execute on function public.block_range(text, text, text, text, text[], text) from public, anon;

-- ─── 3) create_competition : étendue bornée AVANT la boucle de verrous (branche 'club') ─────────
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
  -- Bornes de dates AVANT toute boucle de verrous (branche 'club' 68 §9.1), pour TOUTES les branches
  -- (audit 2026-07-11) : cast réel + étendue ≤ 366 j. Un `date_key` ancien forgé + une fin proche
  -- ferait des centaines de milliers de pg_advisory_xact_lock. Miroir du trigger competitions_date_range_guard.
  begin
    if nullif(p_end_date_key, '') is not null
       and (p_end_date_key::date < p_date_key::date
            or p_end_date_key::date - p_date_key::date > 366) then
      return null;
    end if;
  exception when others then return null; end;

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

-- ─── 4) club_config : `court_slots.d` NOMBRE 60/90 gelé au niveau TABLE (défense en profondeur) ──
-- La 72 valide DÉJÀ `jsonb_typeof(ent->'d') = 'number'` (+ valeur 60/90) DANS upsert_club_config → le
-- trou d'origine (un `d:"60"` forgé en CHAÎNE, résolu 60 côté serveur mais replié 90 côté client) est
-- déjà fermé par la RPC, seule voie d'écriture (club_config n'a qu'une policy SELECT). Ce trigger
-- BEFORE INSERT/UPDATE FIGE l'invariant au niveau TABLE (toute voie d'écriture, présente ou future),
-- sans reproduire la fonction (225 lignes, dernière déf. en 72). Belt-and-suspenders.
-- ⚠️ Porteur : lancer la requête de PRÉ-VÉRIFICATION (docs / rapport ci-dessous) AVANT de coller la 74
-- (0 ligne attendue) — écarte l'hypothétique ligne `court_slots` forgée AVANT que la 72 ne soit posée.
create or replace function public.club_config_court_slots_guard()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.court_slots is not null and jsonb_typeof(new.court_slots) = 'object' then
    if exists (
      select 1
      from jsonb_each(new.court_slots) as court
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(court.value) = 'array' then court.value else '[]'::jsonb end
      ) as elem
      where jsonb_typeof(elem.value -> 'd') is distinct from 'number'
         or (elem.value ->> 'd') not in ('60', '90')
    ) then
      raise exception 'court_slots : la durée (d) doit être un nombre 60 ou 90.' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists club_config_court_slots_guard_iu on public.club_config;
create trigger club_config_court_slots_guard_iu
  before insert or update on public.club_config
  for each row execute function public.club_config_court_slots_guard();

-- ─── 5) M2 : une inscription JAMAIS confirmée ne squatte plus le numéro (auth) ──────────────────
-- phone_available ignore un compte fantôme (e-mail non confirmé, > 24 h) ; handle_new_user le PURGE
-- (best-effort) puis refuse si un compte confirmé/récent tient encore le numéro. Redéfinitions
-- BYTE-fidèles à la 67, seul le bloc « numéro » change.
create or replace function public.phone_available(p_phone text)
returns boolean
language sql
security definer
set search_path = public
as $$
  -- Un numéro vide/illisible n'est jamais « pris » (l'app valide déjà ≥ 8 chiffres avant), et un
  -- compte FANTÔME (e-mail jamais confirmé, > 24 h) ne « tient » pas le numéro (audit 2026-07-11).
  select public.phone10(p_phone) is null
    or not exists (
      select 1
      from public.profiles p
      join auth.users u on u.id = p.id
      where public.phone10(p.phone) = public.phone10(p_phone)
        and not (u.email_confirmed_at is null and u.created_at < now() - interval '24 hours')
    );
$$;

revoke all on function public.phone_available(text) from public;
grant execute on function public.phone_available(text) to anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  ref_code text;
  ref_id uuid;
  acct text := lower(nullif(meta->>'account_type', ''));
begin
  if acct is null or acct not in ('player', 'club') then acct := 'player'; end if;

  -- Un numéro = un seul compte. audit 2026-07-11 (M2) : un compte FANTÔME (e-mail jamais confirmé,
  -- > 24 h) ne doit pas squatter le numéro à vie → on le PURGE (best-effort ; si un FK bloque, on
  -- retombe simplement sur le refus dur ci-dessous, comportement d'avant). Puis on refuse si un
  -- compte confirmé/récent tient encore le numéro.
  if public.phone10(meta->>'phone') is not null then
    begin
      delete from public.profiles p
        using auth.users u
        where p.id = u.id
          and public.phone10(p.phone) = public.phone10(meta->>'phone')
          and u.email_confirmed_at is null
          and u.created_at < now() - interval '24 hours';
    exception when others then null;
    end;
    if exists (
      select 1 from public.profiles
      where public.phone10(phone) = public.phone10(meta->>'phone')
    ) then
      raise exception 'PHONE_TAKEN' using errcode = 'unique_violation';
    end if;
  end if;

  -- Profil (créé une seule fois). Le RÔLE reste 'player' par défaut ; seul account_type
  -- retient l'intention (joueur / club). La promotion 'club' passe par approve_club_request.
  insert into public.profiles (id, first_name, last_name, phone, email, birth_date, gender, level, referral_code, account_type)
    values (
      new.id,
      nullif(meta->>'first_name', ''),
      nullif(meta->>'last_name', ''),
      nullif(meta->>'phone', ''),
      new.email,
      nullif(meta->>'birth_date', ''),
      nullif(meta->>'gender', ''),
      -- Niveau borné [1,7] à l'inscription (durcissement 36) : on RE-applique le clamp ici, car
      -- cette redéfinition de handle_new_user écrase la précédente — sans lui, un signUp forgé
      -- hors app (level=99) créerait un profil hors bornes. Via l'app c'est déjà clampé côté client.
      least(7.0, greatest(1.0, coalesce((meta->>'level')::numeric, 3.0))),
      upper(substr(replace(new.id::text, '-', ''), 1, 12)),
      acct
    )
    on conflict (id) do nothing;

  -- Parrainage : si un code a été saisi à l'inscription, on crée le lien parrain→filleul.
  ref_code := upper(trim(coalesce(meta->>'referred_by', '')));
  if length(ref_code) >= 4 then
    select id into ref_id from public.profiles where referral_code = ref_code limit 1;
    if ref_id is not null and ref_id <> new.id then
      insert into public.referrals (referrer_id, referee_id)
        values (ref_id, new.id)
        on conflict (referee_id) do nothing;
    end if;
  end if;

  -- Compte CLUB : demande d'inscription créée d'office (statut 'new') → visible par
  -- l'opérateur dans « Demandes ». Il valide ensuite (approve_club_request). Le nom du
  -- club vient des métadonnées ; à défaut, on retombe sur le nom de la personne.
  if acct = 'club' then
    insert into public.club_requests (requested_by, name, area, type, courts, price_from, contact_phone, message, status)
      values (
        new.id,
        coalesce(nullif(meta->>'club_name', ''), nullif(meta->>'first_name', ''), 'Mon club'),
        nullif(meta->>'club_area', ''),
        nullif(meta->>'club_type', ''),
        nullif(meta->>'club_courts', '')::int,
        nullif(meta->>'club_price_from', '')::int,
        nullif(meta->>'phone', ''),
        nullif(meta->>'club_message', ''),
        'new'
      );
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
