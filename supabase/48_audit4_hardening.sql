-- PadelConnect — DURCISSEMENTS AUDIT n°4 (SQL Editor → Run). Idempotent.
--
-- Un seul fichier à coller. Il corrige, sans rien casser de l'app officielle, les constats
-- confirmés de l'audit n°4 (chaque bloc est autonome et rejouable) :
--   1. Tournois officiels PadelConnect : la contrainte CHECK organizer_type refusait 'operator'
--      → la création échouait toujours (feature 43 inutilisable). On élargit la contrainte.
--   2. Réservations : garde d'insertion renforcée + RÉORDONNÉE pour passer AVANT la garde de
--      disponibilité (un INSERT forgé status≠'booked' contournait blocages/tournois), refus des
--      créneaux passés (anti-farming du classement) et plafond serveur de réservations à venir.
--   3. Score de match : le « vainqueur automatique » était falsifiable (un perdant recopiait le
--      score gagnant → +3 aux deux camps). On exige désormais, pour valider, une saisie du camp
--      PERDANT (score en miroir) ; tout match où plus de 2 comptes revendiquent la victoire est
--      gelé. Plus : les +3 ne comptent que si la résa est encore 'booked' (pas « pas venu »), et
--      la contestation reste possible au-delà de 14 jours dès qu'une 1ʳᵉ saisie existe.
--   4. Matchs ouverts : on peut QUITTER un match rejoint (place réellement libérée) et le
--      créateur peut le FERMER aux nouveaux ; refuser une invitation libère la place.
--   5. Cours : un coach ne peut plus accepter deux cours au même créneau ; une acceptation en
--      conflit (terrain parti) refuse proprement la demande (l'élève est prévenu) ; le tarif
--      côté coach est borné comme côté club.
--   6. Coach déjà actif dans un AUTRE club : statut distinct ('other_club') pour ne pas faire
--      croire au gérant qu'il est coach chez lui.

-- ══════════════════════════════════════════════════════════════════════════════
-- 1) TOURNOIS 'operator' : élargir la contrainte organizer_type (26 la limitait à club/joueur)
-- ══════════════════════════════════════════════════════════════════════════════
alter table public.competitions drop constraint if exists competitions_organizer_type_check;
alter table public.competitions
  add constraint competitions_organizer_type_check check (organizer_type in ('club', 'joueur', 'operator'));

-- ══════════════════════════════════════════════════════════════════════════════
-- 2) RÉSERVATIONS : garde d'insertion renforcée, exécutée EN PREMIER
-- ══════════════════════════════════════════════════════════════════════════════
-- Constat : les triggers BEFORE INSERT s'exécutent par ordre alphabétique de nom. La garde de
-- disponibilité (reservations_availability_guard_trg) commence par « if status ≠ 'booked' then
-- return » — donc un INSERT forgé avec status='pending' la traversait, puis cette garde-ci
-- rebasculait en 'booked'. On renomme cette garde pour qu'elle passe AVANT (préfixe « a0_ » <
-- « reservations_… ») et on force 'booked' d'entrée : la disponibilité est donc toujours vérifiée.
-- On en profite pour fermer le farming du classement (réservations passées bidon) : une
-- réservation naît toujours sur un créneau FUTUR, et un compte ne peut pas empiler à l'infini.
create or replace function public.reservations_insert_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
  v_upcoming int;
begin
  -- Une réservation naît TOUJOURS 'booked' et non confirmée (seules les RPC la font évoluer).
  new.club_confirmed := false;
  new.status := 'booked';
  -- Créneau passé : interdit (tolérance 15 min pour l'horloge). Bloque l'insertion de
  -- réservations « déjà jouées » forgées pour farmer les points « partie jouée »/victoire.
  if new.starts_at is null or new.starts_at < v_now - 15 * 60000 then
    raise exception 'reservation must be in the future';
  end if;
  -- Plafond anti-abus de réservations À VENIR par compte (l'app limite déjà à 6 côté joueur ;
  -- 10 laisse la marge des cours créés par respond_lesson sans jamais gêner un usage réel).
  select count(*) into v_upcoming from public.reservations r
    where r.user_id = new.user_id and r.status = 'booked' and r.starts_at > v_now;
  if v_upcoming >= 10 then
    raise exception 'too many upcoming reservations';
  end if;
  return new;
end;
$$;

-- Réordonner : le nouveau nom « a0_… » passe avant « reservations_availability_guard_trg ».
drop trigger if exists reservations_insert_guard on public.reservations;
drop trigger if exists a0_reservations_insert_guard on public.reservations;
create trigger a0_reservations_insert_guard
  before insert on public.reservations
  for each row execute function public.reservations_insert_guard();

-- ══════════════════════════════════════════════════════════════════════════════
-- 3) SCORE DE MATCH : vainqueur automatique NON falsifiable
-- ══════════════════════════════════════════════════════════════════════════════
-- Règle de validation (identique dans submit, lecture et classement) sur l'ensemble des
-- saisies d'une réservation — n = nb de saisies, dc = nb de canons distincts, w = saisies
-- « j'ai gagné », l = saisies « j'ai perdu », first = 1ʳᵉ saisie :
--   • conflit (points GELÉS) si dc > 1 (chiffres différents) OU w > 2 (padel = 2 vainqueurs max :
--     un 3ᵉ « je gagne » trahit un perdant qui triche → personne ne marque) ;
--   • VALIDÉ si dc = 1 ET w ≤ 2 ET ( saisie unique de plus de 48 h  OU  au moins une saisie
--     PERDANTE en miroir (l ≥ 1) ). Ainsi deux « je gagne » identiques (le perdant recopie le
--     score gagnant) ne valident JAMAIS : il faut qu'un camp reconnaisse la défaite, ou 48 h de
--     silence sur une saisie unique. Un tricheur ne peut donc que GELER un match, jamais farmer.
-- Les +3 ne vont qu'aux saisies « je gagne » d'un match validé dont la résa est encore 'booked'.

-- Contestation possible au-delà de 14 jours DÈS qu'une 1ʳᵉ saisie existe (la fenêtre de 14 j
-- ne borne que la toute PREMIÈRE saisie → anti-farming intact, mais le litige reste ouvrable).
create or replace function public.submit_match_score(p_reservation_id uuid, p_sets jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_res record;
  v_players uuid[];
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
  select id, user_id, status, starts_at into v_res
    from public.reservations where id = p_reservation_id;
  if v_res.id is null or v_res.status <> 'booked' then return 'error'; end if;
  -- Match FINI (session 1h30).
  if v_res.starts_at + (90 * 60000) >= v_now then return 'error'; end if;
  -- Première saisie uniquement bornée à 14 jours (anti-farming) ; au-delà, on n'accepte une
  -- saisie que si le match a déjà au moins une entrée (contestation/correction toujours possible).
  select exists (select 1 from public.match_results where reservation_id = p_reservation_id)
    into v_has_prior;
  if v_res.starts_at < v_now - 14 * 86400000 and not v_has_prior then
    return 'error';
  end if;
  -- Joueurs IDENTIFIÉS du match : créateur + participants acceptés (comptes réels).
  select array_agg(distinct t.uid) into v_players from (
    select v_res.user_id as uid
    union all
    select rp.user_id from public.reservation_participants rp
      where rp.reservation_id = p_reservation_id and rp.status = 'accepted'
  ) t;
  if not (v_uid = any (v_players)) then return 'error'; end if;
  if array_length(v_players, 1) < 2 then return 'no_players'; end if;
  -- Validation des sets + calcul du vainqueur et du canon (score vu du vainqueur).
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
  -- État du match après ma saisie (mêmes agrégats que la règle de validation).
  select count(*), count(distinct canon), count(*) filter (where i_won),
         count(*) filter (where not i_won), min(created_at)
    into v_n, v_dc, v_w, v_l, v_first
    from public.match_results where reservation_id = p_reservation_id;
  if v_dc > 1 or v_w > 2 then return 'conflict'; end if;
  if v_dc = 1 and v_w <= 2 and ((v_n = 1 and v_first < now() - interval '48 hours') or (v_w >= 1 and v_l >= 1)) then
    return 'validated';
  end if;
  return 'waiting';
end;
$$;

grant execute on function public.submit_match_score(uuid, jsonb) to authenticated;

-- Lecture pour « Mes réservations » : mêmes agrégats et même règle de validation.
create or replace function public.fetch_my_match_scores()
returns table (reservation_id uuid, entries int, validated boolean, conflict boolean,
               mine boolean, i_won boolean, score text, entered_names text)
language sql
security definer
set search_path = public
stable
as $$
  select mr.reservation_id,
         count(*)::int as entries,
         (count(distinct mr.canon) = 1
          and count(*) filter (where mr.i_won) <= 2
          and ((count(*) = 1 and min(mr.created_at) < now() - interval '48 hours')
               or (count(*) filter (where mr.i_won) >= 1 and count(*) filter (where not mr.i_won) >= 1))) as validated,
         (count(distinct mr.canon) > 1 or count(*) filter (where mr.i_won) > 2) as conflict,
         bool_or(mr.user_id = auth.uid()) as mine,
         bool_or(mr.user_id = auth.uid() and mr.i_won) as i_won,
         case when count(distinct mr.canon) = 1 then min(mr.canon) end as score,
         string_agg(trim(coalesce(p.first_name, '') || ' ' ||
                    case when coalesce(p.last_name, '') <> '' then left(p.last_name, 1) || '.' else '' end), ', ')
           filter (where mr.user_id <> auth.uid()) as entered_names
    from public.match_results mr
    join public.reservations r on r.id = mr.reservation_id
    left join public.profiles p on p.id = mr.user_id
   where r.user_id = auth.uid()
      or exists (select 1 from public.reservation_participants rp
                   where rp.reservation_id = r.id and rp.user_id = auth.uid() and rp.status = 'accepted')
   group by mr.reservation_id;
$$;

grant execute on function public.fetch_my_match_scores() to authenticated;

-- Classement : les +3 « victoire de match » utilisent la MÊME règle + la résa doit être
-- encore 'booked' (un match marqué « pas venu » par le club ne rapporte plus rien).
drop function if exists public.fetch_leaderboard(int);

create or replace function public.fetch_leaderboard(p_limit int default 50)
returns table (user_id uuid, name text, level numeric, wins int, match_wins int, off_played int, played int, points int)
language sql
security definer
set search_path = public
stable
as $$
  with valid_wins as ( -- une victoire de match validée et non falsifiée, par joueur
    select mr.user_id
      from public.match_results mr
      join public.reservations rr on rr.id = mr.reservation_id and rr.status = 'booked'
      join (
        select reservation_id,
               count(*) n, count(distinct canon) dc,
               count(*) filter (where i_won) w, count(*) filter (where not i_won) l,
               min(created_at) first_at
          from public.match_results group by reservation_id
      ) a on a.reservation_id = mr.reservation_id
     where mr.i_won and a.dc = 1 and a.w <= 2
       and ((a.n = 1 and a.first_at < now() - interval '48 hours') or (a.w >= 1 and a.l >= 1))
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
                 and r.starts_at + (90 * 60000) < (extract(epoch from now()) * 1000)::bigint)
            + (select count(*) from public.reservation_participants rp
                 join public.reservations rr on rr.id = rp.reservation_id
                 where rp.user_id = p.id and rp.status = 'accepted' and rr.user_id <> p.id
                   and rr.status = 'booked'
                   and rr.starts_at + (90 * 60000) < (extract(epoch from now()) * 1000)::bigint))::int as played
      from public.profiles p
      where coalesce(trim(p.first_name), '') <> ''
        and coalesce(p.role, 'player') = 'player'
  )
  select b.id, b.pname, b.plevel, b.wins, b.mwins, b.offplayed, b.played,
         (b.wins * 100 + b.offplayed * 10 + b.mwins * 3 + b.played * 2) as points
    from base b
    order by 8 desc, b.wins desc, b.plevel desc, b.id
    limit greatest(coalesce(p_limit, 50), 1);
$$;

grant execute on function public.fetch_leaderboard(int) to authenticated;

create or replace function public.my_leaderboard_rank()
returns int
language sql
security definer
set search_path = public
stable
as $$
  with valid_wins as (
    select mr.user_id
      from public.match_results mr
      join public.reservations rr on rr.id = mr.reservation_id and rr.status = 'booked'
      join (
        select reservation_id,
               count(*) n, count(distinct canon) dc,
               count(*) filter (where i_won) w, count(*) filter (where not i_won) l,
               min(created_at) first_at
          from public.match_results group by reservation_id
      ) a on a.reservation_id = mr.reservation_id
     where mr.i_won and a.dc = 1 and a.w <= 2
       and ((a.n = 1 and a.first_at < now() - interval '48 hours') or (a.w >= 1 and a.l >= 1))
  ),
  base as (
    select p.id,
           coalesce(p.level, 3)::numeric as plevel,
           (select count(*) from public.competitions c
              where c.status = 'closed' and c.official and c.winner_user_id = p.id) as wins,
           (select count(*) from public.competitions c
              join public.competition_registrations rg on rg.competition_id = c.id and rg.user_id = p.id
              where c.status = 'closed' and c.official) as offplayed,
           (select count(*) from valid_wins vw where vw.user_id = p.id) as mwins,
           ((select count(*) from public.reservations r
               where r.user_id = p.id and r.status = 'booked'
                 and r.starts_at + (90 * 60000) < (extract(epoch from now()) * 1000)::bigint)
            + (select count(*) from public.reservation_participants rp
                 join public.reservations rr on rr.id = rp.reservation_id
                 where rp.user_id = p.id and rp.status = 'accepted' and rr.user_id <> p.id
                   and rr.status = 'booked'
                   and rr.starts_at + (90 * 60000) < (extract(epoch from now()) * 1000)::bigint)) as played
      from public.profiles p
      where coalesce(trim(p.first_name), '') <> '' and coalesce(p.role, 'player') = 'player'
  ),
  ranked as (
    select id, row_number() over (
             order by (wins * 100 + offplayed * 10 + mwins * 3 + played * 2) desc, wins desc, plevel desc, id
           ) as rk
      from base
  )
  select rk::int from ranked where id = auth.uid();
$$;

grant execute on function public.my_leaderboard_rank() to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- 4) MATCHS OUVERTS : refuser une invitation LIBÈRE la place ; quitter / fermer un match
-- ══════════════════════════════════════════════════════════════════════════════
-- Refuser (ou quitter) retire l'entrée du joueur de `invited` et décrémente `players` — sinon
-- fetch_open_matches (qui compte le tableau invited) laissait la place verrouillée à jamais.
create or replace function public.respond_invitation(p_reservation_id uuid, p_accept boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_changed boolean;
  v_removed int := 0;
begin
  update public.reservation_participants
    set status = case when p_accept then 'accepted' else 'declined' end
    where reservation_id = p_reservation_id and user_id = v_uid;
  v_changed := found;
  if v_changed and not p_accept then
    -- Retire l'entrée de ce joueur du tableau `invited` (formes possibles de l'id : son uuid,
    -- ou 'open-<uuid>' pour un match ouvert rejoint) et décrémente `players` d'autant.
    update public.reservations r
      set invited = coalesce((
            select jsonb_agg(e) from jsonb_array_elements(
              case when jsonb_typeof(r.invited) = 'array' then r.invited else '[]'::jsonb end) e
             where e ->> 'id' <> v_uid::text and e ->> 'id' <> 'open-' || v_uid::text
          ), '[]'::jsonb)
      where r.id = p_reservation_id
      returning (case when jsonb_typeof(invited) = 'array' then jsonb_array_length(invited) else 0 end) into v_removed;
    update public.reservations
      set players = greatest(1, coalesce(players, 1) - 1)
      where id = p_reservation_id
        and players > (case when jsonb_typeof(invited) = 'array' then jsonb_array_length(invited) else 0 end);
  end if;
  return v_changed;
end;
$$;

grant execute on function public.respond_invitation(uuid, boolean) to authenticated;

-- Quitter un match ouvert qu'on avait rejoint (réservé au participant 'accepted' — jamais le
-- créateur, qui possède la réservation). Réutilise respond_invitation (retire la place).
create or replace function public.leave_open_match(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return false; end if;
  if not exists (select 1 from public.reservation_participants rp
                 where rp.reservation_id = p_id and rp.user_id = v_uid and rp.status = 'accepted') then
    return false; -- je ne suis pas un participant actif de ce match
  end if;
  return public.respond_invitation(p_id, false);
end;
$$;

grant execute on function public.leave_open_match(uuid) to authenticated;

-- Le créateur ouvre / ferme son match aux nouveaux joueurs (ne touche jamais aux places déjà prises).
create or replace function public.set_match_open(p_id uuid, p_open boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.reservations
    set open_match = p_open
    where id = p_id and user_id = auth.uid() and status = 'booked';
  return found;
end;
$$;

grant execute on function public.set_match_open(uuid, boolean) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- 5) COURS : anti double-réservation du coach + acceptation en conflit refusée proprement
-- ══════════════════════════════════════════════════════════════════════════════
create or replace function public.respond_lesson(p_id uuid, p_accept boolean)
returns text -- 'ok' | 'declined' | 'conflict' | 'busy' | 'forbidden' | 'gone'
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

  -- Le coach est-il DÉJÀ pris à ce créneau par un autre cours accepté ? (physiquement il ne
  -- peut donner qu'un cours à la fois) → on refuse cette 2ᵉ demande sans la laisser 'pending'.
  if exists (
    select 1 from public.lessons x
    where x.coach_id = l.coach_id and x.status = 'accepted'
      and x.date_key = l.date_key and x."time" = l."time" and x.id <> l.id
  ) then
    update public.lessons set status = 'declined', responded_at = now() where id = p_id;
    return 'busy';
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
    -- Terrain pris/bloqué/tournoi entre-temps : on REFUSE la demande (elle ne reste plus
    -- 'pending' à jamais) → le webhook lessons (pending→declined) prévient l'élève par push.
    update public.lessons set status = 'declined', responded_at = now() where id = p_id;
    return 'conflict';
  end;

  update public.lessons set status = 'accepted', responded_at = now(), reservation_id = res_id where id = p_id;
  return 'ok';
end;
$$;

grant execute on function public.respond_lesson(uuid, boolean) to authenticated;

-- Tarif côté coach borné comme côté club (42) : 1 000–1 000 000 FCFA, ou null (non affiché).
create or replace function public.coach_update_profile(p_specialty text, p_price integer, p_slots text[])
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_price is not null and (p_price < 1000 or p_price > 1000000) then
    return false;
  end if;
  update public.coaches
    set specialty = coalesce(p_specialty, specialty),
        price = p_price,
        slots = coalesce(p_slots, slots)
    where user_id = auth.uid() and active;
  return found;
end;
$$;

grant execute on function public.coach_update_profile(text, integer, text[]) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- 6) COACH DÉJÀ ACTIF DANS UN AUTRE CLUB : statut 'other_club' (≠ 'already' du même club)
-- ══════════════════════════════════════════════════════════════════════════════
create or replace function public.club_add_coach(p_club_id text, p_phone text, p_specialty text)
returns table (status text, coach_id uuid, coach_name text)
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
  -- Déjà coach ACTIF : distinguer « chez moi » (rien à faire) de « chez un autre club »
  -- (le gérant doit savoir qu'il ne peut pas le déclarer tant que l'autre club ne l'a pas retiré).
  if exists (select 1 from public.coaches c where c.user_id = cid and c.active and c.club_id = p_club_id) then
    return query select 'already'::text, cid, cname; return;
  end if;
  if exists (select 1 from public.coaches c where c.user_id = cid and c.active and c.club_id <> p_club_id) then
    return query select 'other_club'::text, cid, cname; return;
  end if;
  insert into public.coaches (user_id, club_id, specialty, active)
    values (cid, p_club_id, coalesce(p_specialty, ''), true)
    on conflict (user_id) do update set club_id = excluded.club_id, active = true;
  return query select 'ok'::text, cid, cname;
end;
$$;

grant execute on function public.club_add_coach(text, text, text) to authenticated;
