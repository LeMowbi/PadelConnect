-- PadelConnect — DURCISSEMENTS AUDIT n°7 (SQL Editor → Run). Idempotent, rejouable.
--
-- Corrige les constats confirmés de l'audit n°7 (pré-lancement) :
--   1. AMIS : le blocage (51) s'applique enfin aux demandes d'ami (plus de spam de push après
--      refus, plus de demande d'un compte bloqué) + délai de 24 h avant de renvoyer une demande
--      refusée.
--   2. MODÉRATION : l'opérateur VOIT les avis signalés (fetch_review_reports) et peut agir
--      (operator_delete_review / operator_dismiss_report) — la promesse « modéré sous 24 h »
--      devient tenable (App Store 1.2).
--   3. DIAGNOSTICS : réellement anonymes (plus de user_id posé par défaut, existant purgé) —
--      aligne la base sur privacy.html et les étiquettes App Privacy / Data safety.
--   4. SUPPRESSION DE COMPTE : la photo de profil (bucket public) est effacée, et les
--      réservations à venir sont ANNULÉES (le club est prévenu par push) au lieu de disparaître.
--   5. RÉSERVATIONS : la grille du club (créneaux '!fermés', terrains déclarés) devient
--      OPPOSABLE côté serveur — un vieux build ou un INSERT forgé ne peut plus réserver un
--      créneau fermé ni un terrain retiré. Verrou anti-course avec la validation de tournoi.
--   6. TOURNOIS : plus de chevauchement tournoi-vs-tournoi ni tournoi-vs-créneaux fermés ;
--      désinscription refusée dès le jour du tournoi ; un tournoi officiel CLÔTURÉ n'est plus
--      supprimable (les points du classement s'appuient dessus).
--   7. MATCHS OUVERTS : un compte bloqué (dans un sens ou l'autre) ne peut plus rejoindre ;
--      le roster est FIGÉ dès le début du match (plus de départ rétroactif qui fausse les
--      validations de score).
--   8. COURS : verrou anti-course sur la double acceptation simultanée d'un même créneau.
--   9. COACHS : re-promotion par un AUTRE club → tarif remis à zéro, dispos vidées, spécialité
--      remplacée (les réglages de l'ancien club ne « suivent » plus le coach).
--  10. delete_club : désactive les coachs du club, efface ses avis (et signalements liés),
--      son boost et ses créneaux fermés — conformément à l'écran de confirmation.
--  11. ANON : les fonctions publiques sensibles (matchs ouverts, classement, tournois, coachs)
--      ne sont plus exécutables par le rôle anonyme (récolte sans compte).

-- ─── 1) AMIS : blocage opposable + anti-harcèlement ──────────────────────────
create or replace function public.send_friend_request(p_phone text)
returns table (status text, friend_id uuid, name text, level numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  fid uuid;
  reverse_id uuid;
  fname text;
  flevel numeric;
begin
  if length(regexp_replace(p_phone, '\D', '', 'g')) < 8 then
    return query select 'not_found'::text, null::uuid, null::text, null::numeric;
    return;
  end if;
  select p.id into fid from public.profiles p
    where right(regexp_replace(p.phone, '\D', '', 'g'), 10) = right(regexp_replace(p_phone, '\D', '', 'g'), 10)
      and p.id <> me
    limit 1;
  if fid is null then
    return query select 'not_found'::text, null::uuid, null::text, null::numeric;
    return;
  end if;
  -- BLOCAGE (51) : dans un sens comme dans l'autre, aucune demande possible. On répond
  -- 'not_found' pour ne pas révéler le blocage à l'expéditeur.
  if exists (select 1 from public.blocked_users b
             where (b.blocker_id = fid and b.blocked_id = me)
                or (b.blocker_id = me and b.blocked_id = fid)) then
    return query select 'not_found'::text, null::uuid, null::text, null::numeric;
    return;
  end if;
  select trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), p.level
    into fname, flevel from public.profiles p where p.id = fid;

  -- Déjà amis ?
  if exists (select 1 from public.friends where user_id = me and friend_id = fid) then
    return query select 'already_friends'::text, fid, fname, flevel;
    return;
  end if;

  -- La personne m'a-t-elle DÉJÀ envoyé une demande ? → on accepte automatiquement (lien mutuel).
  select id into reverse_id from public.friend_requests
    where from_user = fid and to_user = me and status = 'pending' limit 1;
  if reverse_id is not null then
    update public.friend_requests set status = 'accepted', responded_at = now() where id = reverse_id;
    insert into public.friends (user_id, friend_id) values (me, fid), (fid, me) on conflict do nothing;
    return query select 'accepted'::text, fid, fname, flevel;
    return;
  end if;

  -- Ma demande existe-t-elle déjà (en attente) ?
  if exists (select 1 from public.friend_requests where from_user = me and to_user = fid and status = 'pending') then
    return query select 'pending'::text, fid, fname, flevel;
    return;
  end if;
  -- ANTI-HARCÈLEMENT : une demande REFUSÉE ne peut être renvoyée qu'après 24 h. Réponse
  -- 'sent' silencieuse (aucun UPDATE → aucun push) : l'expéditeur ne sait pas qu'il est temporisé.
  if exists (select 1 from public.friend_requests fr
             where fr.from_user = me and fr.to_user = fid and fr.status = 'declined'
               and fr.responded_at > now() - interval '24 hours') then
    return query select 'sent'::text, fid, fname, flevel;
    return;
  end if;
  insert into public.friend_requests (from_user, to_user, status, created_at, responded_at)
    values (me, fid, 'pending', now(), null)
    on conflict (from_user, to_user) do update set status = 'pending', created_at = now(), responded_at = null;
  return query select 'sent'::text, fid, fname, flevel;
end;
$$;

grant execute on function public.send_friend_request(text) to authenticated;

-- Les demandes des comptes que J'AI bloqués n'apparaissent plus dans ma liste.
create or replace function public.fetch_friend_requests()
returns table (request_id uuid, from_id uuid, name text, level numeric, created_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select fr.id, fr.from_user,
    trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')),
    p.level, fr.created_at
  from public.friend_requests fr
  join public.profiles p on p.id = fr.from_user
  where fr.to_user = auth.uid() and fr.status = 'pending'
    and not exists (select 1 from public.blocked_users b
                    where b.blocker_id = auth.uid() and b.blocked_id = fr.from_user)
  order by fr.created_at desc;
$$;

grant execute on function public.fetch_friend_requests() to authenticated;

-- ─── 2) MODÉRATION : les avis signalés, visibles et actionnables par l'opérateur ─
create or replace function public.fetch_review_reports()
returns table (report_id uuid, review_id uuid, club_id text, author_name text, rating int,
               review_text text, reason text, reported_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select rr.id, rv.id, rv.club_id, coalesce(rv.author_name, 'Joueur'), rv.rating,
         coalesce(rv.text, ''), coalesce(rr.reason, ''), rr.created_at
  from public.review_reports rr
  join public.reviews rv on rv.id = rr.review_id
  where exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'operator')
  order by rr.created_at desc;
$$;

grant execute on function public.fetch_review_reports() to authenticated;
revoke execute on function public.fetch_review_reports() from public, anon;

-- Retire un avis signalé (modération) — les signalements liés partent en cascade.
create or replace function public.operator_delete_review(p_review_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'operator') then
    return false;
  end if;
  delete from public.reviews where id = p_review_id;
  return true;
end;
$$;

grant execute on function public.operator_delete_review(uuid) to authenticated;
revoke execute on function public.operator_delete_review(uuid) from public, anon;

-- Classe un signalement sans retirer l'avis (contenu jugé acceptable).
create or replace function public.operator_dismiss_report(p_report_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'operator') then
    return false;
  end if;
  delete from public.review_reports where id = p_report_id;
  return true;
end;
$$;

grant execute on function public.operator_dismiss_report(uuid) to authenticated;
revoke execute on function public.operator_dismiss_report(uuid) from public, anon;

-- ─── 3) DIAGNOSTICS réellement anonymes (privacy.html / App Privacy « Not Linked ») ─
alter table public.app_errors alter column user_id drop default;
alter table public.app_events alter column user_id drop default;
-- Plus AUCUN user_id écrit (l'anti-usurpation par défaut devient : rien du tout).
drop policy if exists "app_errors_insert" on public.app_errors;
create policy "app_errors_insert" on public.app_errors for insert to anon, authenticated
  with check (user_id is null);
drop policy if exists "app_events_insert" on public.app_events;
create policy "app_events_insert" on public.app_events for insert to anon, authenticated
  with check (user_id is null);
-- Purge de l'existant : les diagnostics déjà collectés sont détachés des comptes.
update public.app_errors set user_id = null where user_id is not null;
update public.app_events set user_id = null where user_id is not null;

-- ─── 4) SUPPRESSION DE COMPTE : photo effacée + résas à venir annulées (club prévenu) ─
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  -- Photo de profil : le bucket `avatars` est PUBLIC et ne suit pas la cascade auth.users —
  -- on l'efface ici, sinon la photo resterait téléchargeable après la suppression du compte.
  delete from storage.objects
    where bucket_id = 'avatars' and (storage.foldername(name))[1] = uid::text;
  -- Réservations À VENIR : annulées AVANT la cascade (l'UPDATE déclenche le webhook → le club
  -- est prévenu qu'un créneau se libère, au lieu d'une disparition silencieuse du planning).
  update public.reservations
    set status = 'cancelled'
    where user_id = uid and status = 'booked'
      and starts_at > (extract(epoch from now()) * 1000)::bigint;
  -- La cascade ON DELETE efface profil, réservations, parrainages et participations ; les
  -- messages de support et demandes de club gardent leur trace (auteur mis à NULL).
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;

-- ─── 5) RÉSERVATIONS : grille du club opposable + verrou anti-course ──────────
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
  select c.slots, c.courts into v_slots, v_courts from public.club_config c where c.club_id = new.club_id;
  if v_slots is not null and array_length(v_slots, 1) > 0 and not (new."time" = any (v_slots)) then
    raise exception 'slot closed';
  end if;
  if v_courts is not null and array_length(v_courts, 1) > 0 and not (new.court = any (v_courts)) then
    raise exception 'unknown court';
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

-- ─── 6) TOURNOIS : conflits complets + désinscription bornée + clôture protégée ─
-- Conflit d'occupation d'une plage de tournoi : réservations 'booked', AUTRES tournois publiés,
-- et créneaux fermés hors app. Des listes vides (= tout le club / toute la journée) croisent tout.
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
    );
$$;

-- approve_competition : verrou (course avec les réservations) + conflit COMPLET.
create or replace function public.approve_competition(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club text;
  v_date text;
  v_end text;
  v_slots text[];
  v_courts text[];
begin
  select club_id, date_key, end_date_key, slots, courts
    into v_club, v_date, v_end, v_slots, v_courts
    from public.competitions where id = p_id and status = 'pending';
  if v_club is null then return false; end if;
  if not public.can_manage_club(v_club) then return false; end if;
  perform pg_advisory_xact_lock(hashtext(v_club || ':' || v_date));
  if public.competition_slot_conflict(v_club, v_date, v_end, coalesce(v_slots, '{}'), coalesce(v_courts, '{}'), p_id) then
    return false;
  end if;
  update public.competitions set status = 'published' where id = p_id and status = 'pending';
  return true;
end;
$$;

grant execute on function public.approve_competition(uuid) to authenticated;

-- create_competition : la branche CLUB (publication immédiate) refuse aussi les conflits
-- tournoi-vs-tournoi et tournoi-vs-créneaux fermés (mêmes règles qu'à la validation).
create or replace function public.create_competition(
  p_organizer_type text, p_organizer_name text, p_organizer_phone text, p_club_id text, p_club_name text,
  p_title text, p_format text, p_level text, p_date_key text, p_end_date_key text,
  p_courts text[], p_slots text[], p_capacity int, p_fee text, p_reward text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  v_official boolean;
  v_status text;
  v_commission int := 0;
begin
  if auth.uid() is null then return null; end if;
  if coalesce(trim(p_title), '') = '' or coalesce(trim(p_date_key), '') = '' then return null; end if;

  if p_organizer_type = 'club' then
    if not public.can_manage_club(p_club_id) then return null; end if; -- réservé au gérant du club
    perform pg_advisory_xact_lock(hashtext(p_club_id || ':' || p_date_key));
    if public.competition_slot_conflict(p_club_id, p_date_key, p_end_date_key, coalesce(p_slots, '{}'), coalesce(p_courts, '{}')) then
      return null;
    end if;
    v_official := true;
    v_status := 'published';
  else
    v_official := false;
    v_status := 'pending';
    select player_fee into v_commission from public.tournament_config where id = true;
    v_commission := coalesce(v_commission, 0);
  end if;

  insert into public.competitions (
    organizer_id, organizer_type, organizer_name, organizer_phone, club_id, club_name,
    title, format, level, date_key, end_date_key, courts, slots,
    capacity, fee, reward, official, status, commission
  ) values (
    auth.uid(), p_organizer_type, coalesce(p_organizer_name, ''), nullif(trim(coalesce(p_organizer_phone, '')), ''), p_club_id, p_club_name,
    trim(p_title), coalesce(p_format, ''), coalesce(p_level, ''), p_date_key, nullif(p_end_date_key, ''),
    coalesce(p_courts, '{}'), coalesce(p_slots, '{}'),
    greatest(coalesce(p_capacity, 8), 1), coalesce(p_fee, ''), coalesce(p_reward, ''),
    v_official, v_status, v_commission
  ) returning id into new_id;
  return new_id;
end;
$$;

grant execute on function public.create_competition(text, text, text, text, text, text, text, text, text, text, text[], text[], int, text, text) to authenticated;

-- Désinscription : impossible dès le JOUR du tournoi (le perdant n'échappe plus au −0.25 en
-- quittant le roster avant la clôture) et sur un tournoi clôturé.
create or replace function public.unregister_competition(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.competitions c
    where c.id = p_id
      and (c.status = 'closed' or c.date_key <= to_char((now() at time zone 'utc')::date, 'YYYY-MM-DD'))
  ) then
    return false;
  end if;
  delete from public.competition_registrations where competition_id = p_id and user_id = auth.uid();
  return true;
end;
$$;

grant execute on function public.unregister_competition(uuid) to authenticated;

-- Un tournoi OFFICIEL CLÔTURÉ porte des points de classement (100/10) : plus supprimable.
create or replace function public.delete_competition(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_club text;
begin
  select organizer_id, club_id into v_owner, v_club from public.competitions where id = p_id;
  if v_owner is null then return false; end if;
  if v_owner <> auth.uid() and not public.can_manage_club(v_club) then return false; end if;
  if exists (select 1 from public.competitions c where c.id = p_id and c.status = 'closed' and c.official) then
    return false; -- le palmarès (niveau attribué, points) s'appuie dessus
  end if;
  delete from public.competitions where id = p_id;
  return true;
end;
$$;

grant execute on function public.delete_competition(uuid) to authenticated;

-- ─── 7) MATCHS OUVERTS : blocage opposable + roster figé au coup d'envoi ──────
create or replace function public.join_open_match(p_id uuid)
returns text -- 'ok' | 'full' | 'gone' | 'own' | 'already' | 'forbidden'
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_name text;
  v_entry_id text;
begin
  if auth.uid() is null then return 'forbidden'; end if;
  select * into r from public.reservations
    where id = p_id and status = 'booked' and open_match
    for update;
  if r.id is null or r.starts_at <= (extract(epoch from now()) * 1000)::bigint then return 'gone'; end if;
  if r.user_id = auth.uid() then return 'own'; end if;
  -- BLOCAGE (51) : un compte bloqué (dans un sens ou l'autre) ne rejoint pas — 'gone' pour ne
  -- pas révéler le blocage.
  if exists (select 1 from public.blocked_users b
             where (b.blocker_id = r.user_id and b.blocked_id = auth.uid())
                or (b.blocker_id = auth.uid() and b.blocked_id = r.user_id)) then
    return 'gone';
  end if;
  if exists (select 1 from public.reservation_participants rp
             where rp.reservation_id = p_id and rp.user_id = auth.uid() and rp.status <> 'declined') then
    return 'already';
  end if;
  if coalesce(case when jsonb_typeof(r.invited) = 'array' then jsonb_array_length(r.invited) end, 0) >= 3 then
    return 'full';
  end if;
  select coalesce(nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), 'Un joueur')
    into v_name from public.profiles p where p.id = auth.uid();
  insert into public.reservation_participants (reservation_id, user_id, status)
    values (p_id, auth.uid(), 'accepted')
    on conflict (reservation_id, user_id) do update set status = 'accepted';
  v_entry_id := 'open-' || auth.uid();
  if not exists (select 1 from jsonb_array_elements(coalesce(case when jsonb_typeof(r.invited) = 'array' then r.invited end, '[]'::jsonb)) e
                 where e ->> 'id' = v_entry_id) then
    update public.reservations
      set invited = coalesce(case when jsonb_typeof(invited) = 'array' then invited end, '[]'::jsonb)
                    || jsonb_build_object('id', v_entry_id, 'name', v_name, 'confirmed', true),
          players = least(4, coalesce(players, 1) + 1)
      where id = p_id;
  end if;
  return 'ok';
end;
$$;

grant execute on function public.join_open_match(uuid) to authenticated;

-- respond_invitation : roster FIGÉ dès le début du match — le décompte de joueurs sert à la
-- validation des scores (49), une sortie rétroactive faussait les points déjà acquis.
create or replace function public.respond_invitation(p_reservation_id uuid, p_accept boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_target text := case when p_accept then 'accepted' else 'declined' end;
  v_changed boolean;
  v_new jsonb;
begin
  if exists (select 1 from public.reservations r
             where r.id = p_reservation_id
               and r.starts_at <= (extract(epoch from now()) * 1000)::bigint) then
    return false; -- le match a commencé : plus d'entrée/sortie
  end if;
  update public.reservation_participants
    set status = v_target
    where reservation_id = p_reservation_id and user_id = v_uid
      and status is distinct from v_target;
  v_changed := found;
  if v_changed and not p_accept then
    select coalesce(jsonb_agg(e), '[]'::jsonb) into v_new
      from jsonb_array_elements(
        (select case when jsonb_typeof(invited) = 'array' then invited else '[]'::jsonb end
           from public.reservations where id = p_reservation_id)) e
      where e ->> 'id' <> v_uid::text and e ->> 'id' <> 'open-' || v_uid::text;
    update public.reservations
      set invited = v_new, players = greatest(1, 1 + jsonb_array_length(v_new))
      where id = p_reservation_id;
  end if;
  return v_changed;
end;
$$;

grant execute on function public.respond_invitation(uuid, boolean) to authenticated;

-- ─── 8) COURS : verrou anti-course sur l'acceptation (double 'busy' simultané) ─
create or replace function public.respond_lesson(p_id uuid, p_accept boolean)
returns text -- 'ok' | 'declined' | 'conflict' | 'busy' | 'student_full' | 'forbidden' | 'gone'
language plpgsql
security definer
set search_path = public
as $$
declare
  l record;
  s record;
  cfg record;
  res_id uuid;
begin
  select * into l from public.lessons where id = p_id and status = 'pending' for update;
  if l.id is null then return 'gone'; end if;
  if l.coach_id <> auth.uid() then return 'forbidden'; end if;

  select slots, courts into cfg from public.club_config where club_id = l.club_id;
  if (cfg.slots is not null and not (l."time" = any (cfg.slots)))
     or (cfg.courts is not null and not (l.court = any (cfg.courts))) then
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

  -- Deux acceptations SIMULTANÉES de deux demandes distinctes au même créneau : le verrou
  -- sérialise, la seconde transaction voit le cours accepté par la première → 'busy'.
  perform pg_advisory_xact_lock(hashtext('lesson:' || l.coach_id || ':' || l.date_key || ':' || l."time"));
  if exists (
    select 1 from public.lessons x
    where x.coach_id = l.coach_id and x.status = 'accepted'
      and x.date_key = l.date_key and x."time" = l."time" and x.id <> l.id
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
      user_id, club_id, club_name, date_key, date_label, "time", starts_at, court, price,
      players, invited, booked_by_name, booked_by_phone, coach_name, club_confirmed, status
    )
    select l.student_id, l.club_id,
           coalesce(nullif(l.club_name, ''), (select name from public.clubs c where c.id = l.club_id), l.club_id),
           l.date_key, l.date_label, l."time", l.starts_at, l.court, l.price,
           1, '[]'::jsonb,
           coalesce(nullif(trim(coalesce(s.first_name, '') || ' ' || coalesce(s.last_name, '')), ''), 'Un joueur'),
           s.phone,
           coalesce(nullif(l.coach_name, ''), (select coalesce(nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), 'Coach')
              from public.profiles p where p.id = l.coach_id)),
           false, 'booked'
    returning id into res_id;
  exception when others then
    update public.lessons set status = 'declined', responded_at = now() where id = p_id;
    return 'conflict';
  end;

  update public.lessons set status = 'accepted', responded_at = now(), reservation_id = res_id where id = p_id;
  return 'ok';
end;
$$;

grant execute on function public.respond_lesson(uuid, boolean) to authenticated;

-- ─── 9) COACHS : re-promotion par un AUTRE club → réglages remis à zéro ────────
create or replace function public.club_add_coach(p_club_id text, p_phone text, p_specialty text default '')
returns table (status text, coach_id uuid, name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid;
  cname text;
begin
  if not public.can_manage_club(p_club_id) then
    return query select 'forbidden'::text, null::uuid, null::text; return;
  end if;
  if length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 8 then
    return query select 'not_found'::text, null::uuid, null::text; return;
  end if;
  if (select count(*) from public.profiles p
      where right(regexp_replace(p.phone, '\D', '', 'g'), 10) = right(regexp_replace(p_phone, '\D', '', 'g'), 10)) <> 1 then
    return query select 'not_found'::text, null::uuid, null::text; return;
  end if;
  select p.id, trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
    into cid, cname
    from public.profiles p
    where right(regexp_replace(p.phone, '\D', '', 'g'), 10) = right(regexp_replace(p_phone, '\D', '', 'g'), 10)
    limit 1;
  if cid is null then
    return query select 'not_found'::text, null::uuid, null::text; return;
  end if;
  if exists (select 1 from public.coaches c where c.user_id = cid and c.active and c.club_id = p_club_id) then
    return query select 'already'::text, cid, cname; return;
  end if;
  if exists (select 1 from public.coaches c where c.user_id = cid and c.active and c.club_id <> p_club_id) then
    return query select 'other_club'::text, cid, cname; return;
  end if;
  -- Changement de club : le tarif (fixé par l'ANCIEN club), les dispos et la spécialité de
  -- l'ancien poste ne « suivent » pas — le nouveau club repart de zéro.
  insert into public.coaches (user_id, club_id, specialty, active)
    values (cid, p_club_id, coalesce(p_specialty, ''), true)
    on conflict (user_id) do update
      set club_id = excluded.club_id,
          active = true,
          specialty = excluded.specialty,
          price = case when coaches.club_id = excluded.club_id then coaches.price else null end,
          slots = case when coaches.club_id = excluded.club_id then coaches.slots else '{}' end;
  return query select 'ok'::text, cid, cname;
end;
$$;

grant execute on function public.club_add_coach(text, text, text) to authenticated;

-- ─── 10) delete_club : nettoyage complet (coachs, avis, boost, créneaux fermés) ─
create or replace function public.delete_club(p_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'operator') then
    return false; -- réservé à l'opérateur
  end if;
  delete from public.club_config where club_id = p_id;
  delete from public.club_overrides where club_id = p_id;
  delete from public.club_status where club_id = p_id;
  delete from public.club_commission where club_id = p_id;
  delete from public.club_boost where club_id = p_id;
  delete from public.blocked_slots where club_id = p_id;
  -- Avis du club (les signalements liés partent en cascade) — comme promis à la confirmation.
  delete from public.reviews where club_id = p_id;
  -- Ses coachs redeviennent de simples joueurs (sinon : coach fantôme, deadlock 'other_club',
  -- demandes de cours en attente sur un club disparu).
  update public.coaches set active = false where club_id = p_id;
  update public.lessons set status = 'declined', responded_at = now()
    where club_id = p_id and status = 'pending';
  update public.profiles set role = 'player', managed_club_id = null where managed_club_id = p_id;
  delete from public.clubs where id = p_id;
  return true;
end;
$$;

grant execute on function public.delete_club(text) to authenticated;

-- ─── 11) ANON : les lectures « communauté » exigent un compte ──────────────────
-- (CREATE FUNCTION accorde EXECUTE à PUBLIC par défaut : le rôle anon — la clé publique seule,
-- sans connexion — pouvait récolter matchs ouverts, classement, tournois et annuaire coachs.)
revoke execute on function public.fetch_open_matches() from public, anon;
revoke execute on function public.fetch_leaderboard(int) from public, anon;
revoke execute on function public.my_leaderboard_rank() from public, anon;
revoke execute on function public.fetch_bookable_coaches() from public, anon;
revoke execute on function public.fetch_competitions() from public, anon;
revoke execute on function public.fetch_my_registrations() from public, anon;
revoke execute on function public.fetch_my_match_scores() from public, anon;
revoke execute on function public.send_friend_request(text) from public, anon;
revoke execute on function public.fetch_friend_requests() from public, anon;
revoke execute on function public.join_open_match(uuid) from public, anon;
