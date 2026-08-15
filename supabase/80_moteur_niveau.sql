-- 80 — MOTEUR DE NIVEAU + fiabilité publique + joueurs favoris (chantier v3, lot A).
-- À coller dans Supabase → SQL Editor → Run. Idempotent.
--
-- 1) MOTEUR DE NIVEAU : le niveau [1..7] s'ajuste automatiquement quand un match est validé par
--    le chemin MIROIR du pipeline anti-triche EXISTANT (submit_match_score : un PERDANT reconnaît
--    le score). Le chemin « saisie unique gagnante à 48 h » garde ses +3 points de classement mais
--    n'ajuste PAS le niveau (sinon gain sans perte possible = plus de somme nulle). Gagnants
--    +delta, perdants −delta ; delta dépend de l'écart de niveau des camps (battre plus fort
--    rapporte plus), borné [0.02, 0.30] ; gains ET pertes ÉCRÊTÉS à ±0.5 par joueur par 7 jours
--    glissants (anti-farming ET anti-sandbagging — le niveau filtre l'accès aux matchs, 81).
--    Seuls les COMPTES AYANT SAISI un score bougent. Idempotence DURE :
--    unique(reservation_id, user_id) — un match n'ajuste jamais deux fois. Les ±0.5 des tournois
--    officiels (close_competition, trigger protect_level 34) restent INCHANGÉS ; leur
--    journalisation dans level_history viendra avec la ligue (SQL 84).
-- 2) reconcile_my_levels : rattrape les matchs à MIROIR COMPLET dont l'application a été manquée
--    (app fermée au moment de la validation) — appelé à l'ouverture de session.
-- 3) public_reliability : taux de présence AGRÉGÉ (jamais le détail — il reste réservé au club
--    via fetch_reliability) pour le badge public « Fiable · N % ».
-- 4) favorite_players : suivre un joueur (ses matchs ouverts remontent + push à la création,
--    branche notify-club). Blocages masqués (même convention que send_friend_request 53).

-- ── 1) Historique de niveau ─────────────────────────────────────────────────────

create table if not exists public.level_history (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid references public.reservations (id) on delete set null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  delta numeric not null,
  level_before numeric not null,
  level_after numeric not null,
  reason text not null default 'match' check (reason in ('match', 'tournament')),
  created_at timestamptz not null default now()
);

-- Idempotence : un MATCH ne peut ajuster un joueur qu'une seule fois.
create unique index if not exists level_history_match_uniq
  on public.level_history (reservation_id, user_id) where reservation_id is not null;
create index if not exists level_history_user_recent
  on public.level_history (user_id, created_at desc);

alter table public.level_history enable row level security;
drop policy if exists level_history_select_own on public.level_history;
create policy level_history_select_own on public.level_history
  for select using (user_id = auth.uid());
-- Aucune policy d'écriture : seules les fonctions SECURITY DEFINER écrivent.

-- ── 2) apply_match_level : ajuste les niveaux d'un match VALIDÉ (idempotent) ────

create or replace function public.apply_match_level(p_reservation_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_res record;
  v_players uuid[];
  v_pc int;
  v_wn int;
  v_dc int; v_w int; v_l int;
  v_winners uuid[];
  v_losers uuid[];
  v_avg_win numeric;
  v_avg_opp numeric;
  v_delta numeric;
  v_uid uuid;
  v_before numeric;
  v_after numeric;
  v_week numeric;
  v_gain numeric;
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  -- Sérialise les applications concurrentes du MÊME match (deux saisies miroir simultanées).
  perform pg_advisory_xact_lock(hashtext('level:' || p_reservation_id::text));

  -- Déjà appliqué → succès silencieux (idempotence).
  if exists (select 1 from public.level_history where reservation_id = p_reservation_id) then
    return true;
  end if;

  -- Résa réelle, encore 'booked' (un « pas venu » n'ajuste rien), match terminé.
  select id, user_id, status, starts_at, coalesce(duration_min, 90) as duration_min into v_res
    from public.reservations where id = p_reservation_id;
  if v_res.id is null or v_res.status <> 'booked' then return false; end if;
  if v_res.starts_at + (v_res.duration_min * 60000) >= v_now then return false; end if;

  -- Joueurs du match + plafond de vainqueurs — COPIE STRICTE de submit_match_score (à modifier
  -- ENSEMBLE si la règle change).
  select array_agg(distinct t.uid) into v_players from (
    select v_res.user_id as uid
    union all
    select rp.user_id from public.reservation_participants rp
      where rp.reservation_id = p_reservation_id and rp.status = 'accepted'
  ) t;
  v_pc := array_length(v_players, 1);
  if v_pc < 2 then return false; end if;
  v_wn := least(2, v_pc - 1);

  -- Règle de VALIDATION, restreinte au chemin MIROIR (un perdant a reconnu) : le chemin
  -- « saisie unique gagnante à 48 h » valide bien les +3 points du classement, mais n'ajuste
  -- PAS le niveau — sinon le moteur n'est plus à somme nulle (gain sans perte : deux complices
  -- monteraient de +0,5/semaine sans jamais rien risquer), et comme aucune ligne d'historique
  -- n'est écrite ici, une reconnaissance TARDIVE du perdant déclenchera l'ajustement complet.
  select count(distinct canon), count(*) filter (where i_won), count(*) filter (where not i_won)
    into v_dc, v_w, v_l
    from public.match_results where reservation_id = p_reservation_id;
  if not (v_dc = 1 and v_w >= 1 and v_w <= v_wn and v_l >= 1) then
    return false;
  end if;

  -- Camps : seuls les ENTRANTS bougent (les joueurs sans saisie n'ont pas de camp fiable).
  -- Le chemin miroir garantit v_losers non vide — l'écart se mesure gagnants vs perdants.
  select coalesce(array_agg(user_id), '{}') into v_winners
    from public.match_results where reservation_id = p_reservation_id and i_won;
  select coalesce(array_agg(user_id), '{}') into v_losers
    from public.match_results where reservation_id = p_reservation_id and not i_won;

  select avg(level) into v_avg_win from public.profiles where id = any (v_winners);
  select avg(level) into v_avg_opp from public.profiles where id = any (v_losers);
  -- delta = base 0.10 + 0.05 × (niveau adverse − niveau gagnant), borné [0.02, 0.30].
  v_delta := round(least(0.30, greatest(0.02,
               0.10 + 0.05 * (coalesce(v_avg_opp, coalesce(v_avg_win, 3)) - coalesce(v_avg_win, 3))
             ))::numeric, 2);

  -- Autorise l'écriture de `level` pour CETTE transaction (trigger protect_level, 34).
  perform set_config('padel.level_write', 'on', true);

  -- Gagnants : gain écrêté à +0.5 / 7 jours glissants. La ligne d'historique est TOUJOURS
  -- écrite (même à gain 0) : c'est elle qui marque le match comme appliqué.
  foreach v_uid in array v_winners loop
    select coalesce(sum(delta) filter (where delta > 0), 0) into v_week
      from public.level_history
      where user_id = v_uid and reason = 'match' and created_at > now() - interval '7 days';
    v_gain := least(v_delta, greatest(0, 0.5 - v_week));
    select level into v_before from public.profiles where id = v_uid for update;
    v_after := round(least(7, greatest(1, v_before + v_gain))::numeric, 2);
    insert into public.level_history (reservation_id, user_id, delta, level_before, level_after, reason)
      values (p_reservation_id, v_uid, v_after - v_before, v_before, v_after, 'match')
      on conflict do nothing;
    update public.profiles set level = v_after where id = v_uid;
  end loop;

  -- Perdants : écrêtage SYMÉTRIQUE (−0,5 / 7 j glissants) — sans lui, un joueur fort pouvait
  -- se « sandbagger » à coups de défaites déclarées et entrer dans les fourchettes débutants (81).
  foreach v_uid in array v_losers loop
    select coalesce(sum(-delta) filter (where delta < 0), 0) into v_week
      from public.level_history
      where user_id = v_uid and reason = 'match' and created_at > now() - interval '7 days';
    v_gain := least(v_delta, greatest(0, 0.5 - v_week)); -- ici v_gain = ampleur de la PERTE autorisée
    select level into v_before from public.profiles where id = v_uid for update;
    v_after := round(least(7, greatest(1, v_before - v_gain))::numeric, 2);
    insert into public.level_history (reservation_id, user_id, delta, level_before, level_after, reason)
      values (p_reservation_id, v_uid, v_after - v_before, v_before, v_after, 'match')
      on conflict do nothing;
    update public.profiles set level = v_after where id = v_uid;
  end loop;

  return true;
end;
$$;

-- Verrouillage complet : apply_match_level n'est appelée QUE par submit_match_score et
-- reconcile_my_levels (SECURITY DEFINER du même propriétaire — les privilèges du propriétaire
-- suffisent). `from anon` seul serait INOPÉRANT : PUBLIC garde le grant par défaut.
revoke execute on function public.apply_match_level(uuid) from public, anon, authenticated;

-- ── 3) submit_match_score : recopie STRICTE de la 68 + appel du moteur à la validation ──

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
    -- Moteur de niveau (80) : le match vient d'être validé → ajustement immédiat (idempotent).
    perform public.apply_match_level(p_reservation_id);
    return 'validated';
  end if;
  return 'waiting';
end;
$$;

-- ── 4) reconcile_my_levels : rattrape les matchs validés « à 48 h » (chemin lazy) ──

create or replace function public.reconcile_my_levels()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
  v_id uuid;
  v_count int := 0;
begin
  if v_uid is null then return 0; end if;
  for v_id in
    select res.id
      from public.reservations res
      where res.status = 'booked'
        and res.starts_at > v_now - 90 * 86400000::bigint
        and res.starts_at + (coalesce(res.duration_min, 90) * 60000) < v_now
        and (res.user_id = v_uid or exists (
              select 1 from public.reservation_participants rp
              where rp.reservation_id = res.id and rp.user_id = v_uid and rp.status = 'accepted'))
        and exists (select 1 from public.match_results mr where mr.reservation_id = res.id and mr.i_won)
        and exists (select 1 from public.match_results mr where mr.reservation_id = res.id and not mr.i_won)
        and not exists (select 1 from public.level_history lh where lh.reservation_id = res.id)
      limit 50
  loop
    if public.apply_match_level(v_id) then v_count := v_count + 1; end if;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.reconcile_my_levels() from public, anon;
grant execute on function public.reconcile_my_levels() to authenticated;

-- ── 5) Fiabilité PUBLIQUE (agrégat seul — le détail reste réservé au club) ──────

create or replace function public.public_reliability(p_user_ids uuid[])
returns table (user_id uuid, played integer, presence_pct integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if auth.uid() is null then return; end if;
  return query
    select u.uid,
           coalesce(p.cnt, 0)::int,
           case when coalesce(p.cnt, 0) + coalesce(ns.cnt, 0) = 0 then 100
                else round(100.0 * coalesce(p.cnt, 0) / (coalesce(p.cnt, 0) + coalesce(ns.cnt, 0)))::int
           end
      from unnest(p_user_ids[1:50]) as u(uid)
      left join lateral (
        select count(*) as cnt from public.reservations r
          where r.status = 'booked'
            and r.starts_at + (coalesce(r.duration_min, 90) * 60000) < v_now
            and (r.user_id = u.uid or exists (
                  select 1 from public.reservation_participants rp
                  where rp.reservation_id = r.id and rp.user_id = u.uid and rp.status = 'accepted'))
      ) p on true
      left join lateral (
        select count(*) as cnt from public.reservations r
          where r.status = 'no_show' and r.user_id = u.uid
      ) ns on true;
end;
$$;

revoke execute on function public.public_reliability(uuid[]) from public, anon;
grant execute on function public.public_reliability(uuid[]) to authenticated;

-- ── 6) Joueurs favoris ──────────────────────────────────────────────────────────

create table if not exists public.favorite_players (
  user_id uuid not null references public.profiles (id) on delete cascade,
  fav_user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, fav_user_id),
  check (user_id <> fav_user_id)
);

alter table public.favorite_players enable row level security;
drop policy if exists favorite_players_select_own on public.favorite_players;
create policy favorite_players_select_own on public.favorite_players
  for select using (user_id = auth.uid());
-- Écritures via la RPC uniquement (masquage des blocages).

create or replace function public.toggle_favorite_player(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or p_user_id is null or p_user_id = v_uid then return 'not_found'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then return 'not_found'; end if;
  -- Blocage (un sens ou l'autre) : refus DÉGUISÉ en introuvable (même convention que la 53 —
  -- on ne révèle jamais un blocage).
  if exists (select 1 from public.blocked_users
             where (blocker_id = p_user_id and blocked_id = v_uid)
                or (blocker_id = v_uid and blocked_id = p_user_id)) then
    return 'not_found';
  end if;
  if exists (select 1 from public.favorite_players where user_id = v_uid and fav_user_id = p_user_id) then
    delete from public.favorite_players where user_id = v_uid and fav_user_id = p_user_id;
    return 'removed';
  end if;
  insert into public.favorite_players (user_id, fav_user_id) values (v_uid, p_user_id)
    on conflict do nothing;
  return 'added';
end;
$$;

revoke execute on function public.toggle_favorite_player(uuid) from public, anon;
grant execute on function public.toggle_favorite_player(uuid) to authenticated;
