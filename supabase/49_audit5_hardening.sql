-- PadelConnect — DURCISSEMENTS AUDIT n°5 (SQL Editor → Run). Idempotent.
--
-- Corrige les constats confirmés de l'audit n°5, dont deux régressions de la 48 :
--   1. SCORE DE MATCH — un DOUBLE (2v2) où les DEUX vainqueurs saisissent n'était JAMAIS
--      validé (la porte « 48 h » exigeait UNE seule saisie) : le +3 ne tombait jamais, et une
--      2ᵉ saisie gagnante ANNULAIT même une victoire déjà auto-validée. On base désormais la
--      validation sur le NOMBRE DE JOUEURS identifiés du match : jusqu'à floor(joueurs/2)
--      « je gagne » sont légitimes (2 pour un 2v2, 1 pour un 1v1) — l'anti-triche du perdant
--      qui recopie le score reste intact (un 1v1 refuse toujours deux « je gagne »).
--   2. respond_invitation (48) — le décrément de `players` n'était pas idempotent : un double
--      refus (double-tap, retry réseau, client forgé) corrompait l'effectif. On rend l'UPDATE
--      idempotent (transition réelle only) et on RECALCULE players = 1 + nb d'invités (source
--      de vérité), donc auto-correcteur.
--   3. CLASSEMENT — le niveau auto-déclaré servait de départage à points égaux (interdit) et
--      les comptes à 0 point encombraient le tableau. On retire le niveau du tri et on exclut
--      les 0 point (« non classé » tant qu'on n'a rien gagné).
--   4. COURS — le plafond serveur de réservations à venir de l'élève faisait échouer un cours
--      légitime avec un message « terrain pris » trompeur : on distingue via un statut
--      'student_full' (message honnête, la demande reste en attente).

-- ─── 1) SCORE DE MATCH : validation par nombre de joueurs ────────────────────
-- Règle (identique en submit, lecture, classement) sur les saisies d'une réservation —
-- n = nb saisies, dc = canons distincts, w = « je gagne », l = « je perds », pc = nb de
-- COMPTES identifiés (créateur + participants 'accepted'), wn = least(2, pc-1) vainqueurs max
-- (padel : 2 vainqueurs au plus, et jamais tous les comptes — un 2v2 où seuls 3 joueurs ont
-- l'app garde donc ses 2 « je gagne » légitimes ; un 1v1 (pc=2) reste à wn=1) :
--   • conflit (gelé) si dc > 1  OU  w > wn (plus de vainqueurs qu'un camp ne peut en avoir) ;
--   • VALIDÉ si dc = 1 ET
--       – soit UNE seule saisie « je gagne » restée 48 h sans réponse (n = 1, w = 1),
--       – soit un camp PERDANT reconnaît le score (l ≥ 1) avec 1 ≤ w ≤ wn.
-- ANTI-TRICHE (invariant CLAUDE.md §9) : DEUX « je gagne » sans aucun perdant ne valident
-- JAMAIS — sinon, faute d'ÉQUIPES stockées, deux perdants complices recopiant le score se
-- créditeraient chacun +3. La porte « 48 h » est donc réservée à une saisie UNIQUE ; dès qu'il
-- y a 2 saisies gagnantes, il FAUT un « j'ai perdu » en miroir. Un 1v1 (wn=1) refuse toujours
-- deux « je gagne » (w=2 > wn=1 → conflit).
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
  select id, user_id, status, starts_at into v_res
    from public.reservations where id = p_reservation_id;
  if v_res.id is null or v_res.status <> 'booked' then return 'error'; end if;
  if v_res.starts_at + (90 * 60000) >= v_now then return 'error'; end if;
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

grant execute on function public.submit_match_score(uuid, jsonb) to authenticated;

-- Lecture « Mes réservations » : même règle (nombre de joueurs injecté par sous-requête).
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
          and (
            (count(*) = 1 and count(*) filter (where mr.i_won) = 1
             and min(mr.created_at) < now() - interval '48 hours')
            or (count(*) filter (where mr.i_won) >= 1
                and count(*) filter (where mr.i_won) <= least(2, pc.n - 1)
                and count(*) filter (where not mr.i_won) >= 1)
          )) as validated,
         (count(distinct mr.canon) > 1 or count(*) filter (where mr.i_won) > least(2, pc.n - 1)) as conflict,
         bool_or(mr.user_id = auth.uid()) as mine,
         bool_or(mr.user_id = auth.uid() and mr.i_won) as i_won,
         case when count(distinct mr.canon) = 1 then min(mr.canon) end as score,
         string_agg(trim(coalesce(p.first_name, '') || ' ' ||
                    case when coalesce(p.last_name, '') <> '' then left(p.last_name, 1) || '.' else '' end), ', ')
           filter (where mr.user_id <> auth.uid()) as entered_names
    from public.match_results mr
    join public.reservations r on r.id = mr.reservation_id
    left join public.profiles p on p.id = mr.user_id
    join lateral (
      select 1 + (select count(*) from public.reservation_participants rp
                    where rp.reservation_id = mr.reservation_id and rp.status = 'accepted') as n
    ) pc on true
   where r.user_id = auth.uid()
      or exists (select 1 from public.reservation_participants rp
                   where rp.reservation_id = r.id and rp.user_id = auth.uid() and rp.status = 'accepted')
   group by mr.reservation_id, pc.n;
$$;

grant execute on function public.fetch_my_match_scores() to authenticated;

-- ─── 3) CLASSEMENT : sans départage par niveau, sans les 0 point ─────────────
drop function if exists public.fetch_leaderboard(int);

create or replace function public.fetch_leaderboard(p_limit int default 50)
returns table (user_id uuid, name text, level numeric, wins int, match_wins int, off_played int, played int, points int)
language sql
security definer
set search_path = public
stable
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
    where (b.wins * 100 + b.offplayed * 10 + b.mwins * 3 + b.played * 2) > 0 -- pas de joueur à 0 pt
    order by 8 desc, b.wins desc, b.mwins desc, b.id -- le NIVEAU ne départage jamais (règle §9)
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
                 and r.starts_at + (90 * 60000) < (extract(epoch from now()) * 1000)::bigint)
            + (select count(*) from public.reservation_participants rp
                 join public.reservations rr on rr.id = rp.reservation_id
                 where rp.user_id = p.id and rp.status = 'accepted' and rr.user_id <> p.id
                   and rr.status = 'booked'
                   and rr.starts_at + (90 * 60000) < (extract(epoch from now()) * 1000)::bigint)) as played
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
  select rk::int from ranked where id = auth.uid();
$$;

grant execute on function public.my_leaderboard_rank() to authenticated;

-- ─── 2) respond_invitation IDEMPOTENT (players auto-corrigé) ─────────────────
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
  -- Transition RÉELLE uniquement : un 2ᵉ appel au même statut est un no-op (found = false).
  update public.reservation_participants
    set status = v_target
    where reservation_id = p_reservation_id and user_id = v_uid
      and status is distinct from v_target;
  v_changed := found;
  if v_changed and not p_accept then
    -- Retire l'entrée du joueur de `invited` (son uuid, ou 'open-<uuid>' pour un match rejoint)
    -- puis RECALCULE players = 1 (créateur) + nb d'invités restants → auto-correcteur, idempotent.
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

-- ─── 4) respond_lesson : plafond élève distingué ('student_full') ────────────
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

  if exists (
    select 1 from public.lessons x
    where x.coach_id = l.coach_id and x.status = 'accepted'
      and x.date_key = l.date_key and x."time" = l."time" and x.id <> l.id
  ) then
    update public.lessons set status = 'declined', responded_at = now() where id = p_id;
    return 'busy';
  end if;

  -- L'ÉLÈVE a-t-il atteint le plafond de réservations à venir ? (la garde d'insertion lèverait
  -- alors une exception attrapée comme 'conflict' → message « terrain pris » trompeur). On le
  -- distingue proprement : la demande RESTE en attente, le coach reçoit un message honnête.
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
