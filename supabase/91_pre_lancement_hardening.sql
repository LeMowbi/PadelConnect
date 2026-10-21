-- 91 — Durcissements pré-lancement (audit 2026-10-21, lot K8).
-- À coller dans Supabase → SQL Editor → Run APRÈS la 90. Idempotent, rejouable.
--
-- Cinq constats serveur de l'audit pré-lancement, dans l'ordre de gravité :
--
-- 1) MEDIUM — contrainte `reservations_open_level_range_chk` (81) : sa clause `open_match and`
--    rendait `set_match_open(false)` IMPOSSIBLE sur un match ouvert portant une fourchette de
--    niveau (23514 → « Action impossible — réessaie » à jamais, le match restait rejoignable).
--    Variante B retenue par le porteur : on relâche la clause — bornes [1,7] et min ≤ max
--    CONSERVÉES —, la fourchette survit à fermer/rouvrir, aucune fonction touchée, rien côté
--    client. Une fourchette sur une résa privée est inerte (join_open_match exige open_match,
--    fetch_open_matches ne liste que les ouverts, notify-club ne la lit qu'à l'INSERT ouvert).
--    ⚠️ Ne jamais recoller la 81 seule ensuite : son CHECK strict reviendrait.
-- 2) LOW — `register_competition` (59) n'avait aucune garde de date : un appel forgé inscrivait
--    une équipe le jour J ou APRÈS la fin d'un tournoi encore 'published' et récoltait +10 pts
--    « officiel joué » à la clôture. Garde `date_key <= aujourd'hui (UTC)` → false — MÊME borne
--    que unregister_competition (53) et que le masque `started` de la fiche (jour UTC = Abidjan).
--    Décision porteur : un tournoi ne se crée plus pour le jour même (côté client, lot K3).
-- 3) LOW — `block_user` (51) ne rompait pas l'amitié : un ami bloqué restait dans Amis, dans
--    les sélecteurs d'invitation, et lisait mon numéro. Décision porteur : bloquer ROMPT
--    l'amitié dans les deux sens (patron remove_friend 30) ; un déblocage ne la restaure pas.
--    Le SUIVI (favorite_players, 80) est purgé de même : toggle_favorite_player REFUSE tout
--    toggle avec un bloqué ('not_found'), un suivi existant devenait donc IMPOSSIBLE à retirer
--    (fiche « suivie » à jamais depuis la liste d'équipes d'un tournoi).
-- 4) LOW — `create_group_lesson` (83) dérivait le nom du club de la seule table `clubs` : pour
--    les 9 clubs FONDATEURS (absents de la table, ils vivent dans l'app) l'IDENTIFIANT technique
--    (« padelta ») partait dans reservations.club_name / lessons.club_name → élèves, coach et
--    push. 10ᵉ paramètre `p_club_name` fourni par le client (parité request_lesson 68) ; défaut
--    '' = l'appel du build #68 reste valide. Signature changée → drop de la version à 9 paramètres
--    (sinon PostgREST ne saurait plus choisir : PGRST203) + ACL reposées sur la nouvelle.
--    ⚠️ Ne jamais recoller la 83 seule ensuite : elle recréerait la version à 9 paramètres.
-- 5) LOW — purge de l'alerte de liste d'attente (trigger 89, join_group_lesson 90) sur l'ÉGALITÉ
--    stricte de l'heure, alors que notify-club déclenche l'alerte sur le CHEVAUCHEMENT [t, t+d) :
--    une résa 09:00/90 sur une grille décalée laissait vivre l'alerte 09:30 → « Un créneau s'est
--    libéré » reçu pour une heure où l'on joue. Miroir EXACT de notify-club (hhmm_to_min +
--    duration_min, demi-ouvert strict : l'adjacence est préservée) — sur-ensemble de l'égalité,
--    donc aucune régression du nettoyage client (clé exacte) ni de leave_slot_waitlist.

-- ── 1) Fourchette de niveau : clause `open_match` relâchée ──────────────────────

alter table public.reservations drop constraint if exists reservations_open_level_range_chk;
alter table public.reservations add constraint reservations_open_level_range_chk check (
  (open_level_min is null or (open_level_min >= 1 and open_level_min <= 7))
  and (open_level_max is null or (open_level_max >= 1 and open_level_max <= 7))
  and (open_level_min is null or open_level_max is null or open_level_min <= open_level_max)
);

-- ── 2) Inscription à un tournoi : refusée dès le jour J ─────────────────────────
-- Recopie STRICTE de la 59 (verrou consultatif 'reg:', capacité, ON CONFLICT partenaire) hormis
-- la garde de date. Type de retour inchangé (boolean) : pas de drop, le `false` est déjà traité
-- par l'appelant. Effet assumé : changer de partenaire est aussi fermé dès le jour J (l'UI masque
-- déjà le formulaire).
create or replace function public.register_competition(p_id uuid, p_partner text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capacity int;
  v_count int;
begin
  perform pg_advisory_xact_lock(hashtext('reg:' || p_id::text)); -- sérialise ce tournoi
  select capacity into v_capacity from public.competitions where id = p_id and status = 'published';
  if v_capacity is null then return false; end if; -- inexistant ou non publié
  -- 91 : jour J ou après (donc aussi après la fin) → refus. Même borne que unregister_competition.
  if exists (
    select 1 from public.competitions c
    where c.id = p_id and c.date_key <= to_char((now() at time zone 'utc')::date, 'YYYY-MM-DD')
  ) then
    return false;
  end if;
  select count(*) into v_count from public.competition_registrations where competition_id = p_id;
  if v_count >= v_capacity and not exists (
    select 1 from public.competition_registrations where competition_id = p_id and user_id = auth.uid()
  ) then
    return false; -- complet
  end if;
  insert into public.competition_registrations (competition_id, user_id, partner)
    values (p_id, auth.uid(), coalesce(nullif(trim(p_partner), ''), 'Partenaire'))
    on conflict (competition_id, user_id) do update set partner = excluded.partner;
  return true;
end;
$$;

revoke execute on function public.register_competition(uuid, text) from public, anon;
grant execute on function public.register_competition(uuid, text) to authenticated;

-- ── 3) Bloquer un joueur rompt l'amitié et le suivi ─────────────────────────────
-- Recopie STRICTE de la 51 hormis les trois `delete` (amitié + demandes + suivi, dans les DEUX
-- sens — patron remove_friend 30). Idempotent : re-bloquer un compte déjà bloqué ne change rien.
create or replace function public.block_user(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or p_user_id is null or p_user_id = me then return false; end if;
  insert into public.blocked_users (blocker_id, blocked_id)
    values (me, p_user_id)
    on conflict (blocker_id, blocked_id) do nothing;
  delete from public.friends where (user_id = me and friend_id = p_user_id) or (user_id = p_user_id and friend_id = me);
  delete from public.friend_requests where (from_user = me and to_user = p_user_id) or (from_user = p_user_id and to_user = me);
  delete from public.favorite_players where (user_id = me and fav_user_id = p_user_id) or (user_id = p_user_id and fav_user_id = me);
  return true;
end;
$$;

revoke execute on function public.block_user(uuid) from public, anon;
grant execute on function public.block_user(uuid) to authenticated;

-- ── 4) Cours collectif : nom du club fourni par le client ───────────────────────
-- Recopie STRICTE de la 83 hormis `p_club_name` (10ᵉ paramètre, dernier, défaut '') et la
-- dérivation de `club_label` (client → table clubs → identifiant, motif request_lesson 68:628).
-- Le nom vient du client : borné comme les autres champs texte.
drop function if exists public.create_group_lesson(text, text, text, text, integer, integer, integer, text, text);
create or replace function public.create_group_lesson(
  p_club_id text,
  p_court text,
  p_date_key text,
  p_time text,
  p_duration integer,
  p_capacity integer,
  p_price integer,
  p_note text default '',
  p_date_label text default '',
  p_club_name text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_starts bigint;
  v_courts text[];
  cname text;
  cphone text;
  club_label text;
  res_id uuid;
  new_id uuid;
begin
  if v_uid is null then return null; end if;
  if p_duration is null or p_duration not in (60, 90) then return null; end if;
  if p_capacity is null or p_capacity < 2 or p_capacity > 8 then return null; end if;
  if p_price is null or p_price < 1000 or p_price > 1000000 then return null; end if;
  if p_date_key !~ '^\d{4}-\d{2}-\d{2}$' or public.hhmm_to_min(p_time) is null then return null; end if;
  begin
    perform p_date_key::date;
  exception when others then
    return null;
  end;
  -- Coach ACTIF de CE club (son tarif éventuel reste sur coaches.price, hors résa).
  if not exists (
    select 1 from public.coaches c where c.user_id = v_uid and c.club_id = p_club_id and c.active
  ) then
    return null;
  end if;
  -- Terrain déclaré + (heure, durée) = créneau OUVERT de CE terrain (motif request_lesson).
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
  v_starts := public.slot_start_ms(p_date_key, p_time);
  if v_starts <= (extract(epoch from now()) * 1000)::bigint then return null; end if;
  -- Chevauchement avec MES autres cours acceptés (verrou coach:jour, motif respond_lesson).
  perform pg_advisory_xact_lock(hashtext('lesson:' || v_uid || ':' || p_date_key));
  if exists (
    select 1 from public.lessons x
    where x.coach_id = v_uid and x.status = 'accepted' and x.date_key = p_date_key
      and public.hhmm_to_min(x."time") is not null
      and public.hhmm_to_min(x."time") < public.hhmm_to_min(p_time) + p_duration
      and public.hhmm_to_min(p_time) < public.hhmm_to_min(x."time") + x.duration_min
  ) then
    return null;
  end if;
  select coalesce(nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), 'Coach'), phone
    into cname, cphone from public.profiles where id = v_uid;
  -- 91 : nom fourni par le client (les 9 fondateurs ne sont pas en table clubs), sinon la table,
  -- sinon l'identifiant (dernier recours, jamais vide).
  club_label := coalesce(
    nullif(left(trim(coalesce(p_club_name, '')), 80), ''),
    (select name from public.clubs c where c.id = p_club_id),
    p_club_id
  );
  -- Exemption du plafond « 10 résas à venir » (anti-abus JOUEUR) : l'agenda d'un coach qui
  -- ouvre plusieurs sessions/semaine le dépasse légitimement. GUC transactionnel lu par
  -- reservations_insert_guard (motif padel.level_write du trigger protect_level, 80/34),
  -- REMIS À ZÉRO sitôt l'insert fait — il ne couvre jamais une autre écriture.
  perform set_config('padel.group_lesson', 'on', true);
  begin
    insert into public.reservations (
      user_id, club_id, club_name, date_key, date_label, "time", starts_at, court, price, duration_min,
      players, invited, booked_by_name, booked_by_phone, coach_name, club_confirmed, status
    )
    values (
      v_uid, p_club_id, club_label, p_date_key, coalesce(p_date_label, ''), p_time, v_starts, p_court,
      p_price, p_duration, 1, '[]'::jsonb, cname, cphone, cname, false, 'booked'
    )
    returning id into res_id;
  exception when others then
    -- Conflit d'occupation (contrainte d'exclusion 23P01, terrain fermé, etc.) → refus propre.
    perform set_config('padel.group_lesson', '', true);
    return null;
  end;
  perform set_config('padel.group_lesson', '', true);
  insert into public.lessons (
    coach_id, coach_name, club_id, club_name, student_id, student_name,
    date_key, date_label, "time", court, starts_at, price, duration_min,
    status, responded_at, reservation_id, capacity, note
  )
  values (
    v_uid, cname, p_club_id, club_label, v_uid, 'Cours collectif',
    p_date_key, coalesce(p_date_label, ''), p_time, p_court, v_starts, p_price, p_duration,
    'accepted', now(), res_id, p_capacity, left(trim(coalesce(p_note, '')), 200)
  )
  returning id into new_id;
  return new_id;
end;
$$;

revoke execute on function public.create_group_lesson(text, text, text, text, integer, integer, integer, text, text, text) from public, anon;
grant execute on function public.create_group_lesson(text, text, text, text, integer, integer, integer, text, text, text) to authenticated;

-- ── 5) Liste d'attente : purge par CHEVAUCHEMENT, miroir de notify-club ─────────
-- Trigger 89 : recopie STRICTE hormis le chevauchement demi-ouvert [t, t+d) à la place de
-- l'égalité d'heure (club + jour en tête : l'index slot_waitlist_by_slot reste utilisé). Le
-- trigger `waitlist_purge_on_booking` (AFTER INSERT) reste branché tel quel.
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
        and w.date_key = new.date_key
        -- durées nullables (lignes antérieures à la 68/81) : repli 90 min, comme partout (88).
        and public.hhmm_to_min(w."time") < public.hhmm_to_min(new."time") + coalesce(new.duration_min, 90)
        and public.hhmm_to_min(new."time") < public.hhmm_to_min(w."time") + coalesce(w.duration_min, 90);
  end if;
  return new;
end;
$$;

-- join_group_lesson : recopie STRICTE de la 90 hormis le même chevauchement sur le delete.
create or replace function public.join_group_lesson(p_lesson_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  l record;
begin
  if auth.uid() is null then return 'gone'; end if;
  select * into l from public.lessons
    where id = p_lesson_id and status = 'accepted' and capacity > 1
    for update;
  if l.id is null then return 'gone'; end if;
  if l.coach_id = auth.uid() then return 'gone'; end if;
  if l.starts_at <= (extract(epoch from now()) * 1000)::bigint then return 'gone'; end if;
  -- La résa porteuse doit encore tenir (annulation coach/club → le cours n'existe plus).
  if not exists (select 1 from public.reservations r where r.id = l.reservation_id and r.status = 'booked') then
    return 'gone';
  end if;
  if exists (select 1 from public.blocked_users b
             where (b.blocker_id = l.coach_id and b.blocked_id = auth.uid())
                or (b.blocker_id = auth.uid() and b.blocked_id = l.coach_id)) then
    return 'gone';
  end if;
  if exists (select 1 from public.lesson_students s where s.lesson_id = p_lesson_id and s.user_id = auth.uid()) then
    return 'already';
  end if;
  if (select count(*) from public.lesson_students s where s.lesson_id = p_lesson_id) >= l.capacity then
    return 'full';
  end if;
  insert into public.lesson_students (lesson_id, user_id) values (p_lesson_id, auth.uid());
  -- 90/91 : je joue ce créneau → mon alerte de liste d'attente qui le CHEVAUCHE n'a plus lieu
  -- d'être (parité trigger 89, même arithmétique [t, t+d) que notify-club).
  delete from public.slot_waitlist w
    where w.user_id = auth.uid() and w.club_id = l.club_id
      and w.date_key = l.date_key
      and public.hhmm_to_min(w."time") < public.hhmm_to_min(l."time") + coalesce(l.duration_min, 90)
      and public.hhmm_to_min(l."time") < public.hhmm_to_min(w."time") + coalesce(w.duration_min, 90);
  return 'ok';
end;
$$;

revoke execute on function public.join_group_lesson(uuid) from public, anon;
grant execute on function public.join_group_lesson(uuid) to authenticated;
