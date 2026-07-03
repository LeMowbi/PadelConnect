-- PadelConnect — CLASSEMENT PAR POINTS + SCORE DE MATCH (SQL Editor → Run). Idempotent.
--
-- Constat porteur : un classement par NIVEAU serait « nul » — le niveau est plafonné à 7
-- ET auto-déclaré à l'inscription : au lancement, le 1ᵉʳ serait celui qui s'est déclaré 7,
-- puis tout le monde stagnerait. On passe au modèle « Race » (comme la FIP) : des POINTS
-- gagnés DANS l'app, tous issus de faits serveur infalsifiables, sans plafond :
--   • tournoi officiel GAGNÉ (vainqueur ancré à la clôture, 44) . . . 100 pts
--   • participation à un tournoi officiel joué (inscription réelle) .  10 pts
--   • VICTOIRE de match au score validé (ci-dessous) . . . . . . . . .   3 pts
--   • partie jouée (réservation finie, créée ou rejointe) . . . . . .   2 pts
-- Le niveau reste affiché à titre d'info (force du joueur) — le RANG, lui, se mérite.
-- Départage : points, puis tournois gagnés, puis niveau, puis id (stable).
--
-- SCORE DE MATCH (décision porteur) : CHAQUE joueur saisit le score du match (les sets, de
-- son point de vue) et l'app DÉSIGNE LE VAINQUEUR AUTOMATIQUEMENT — pas de bouton
-- « confirmer » : dès que deux saisies concordent (identiques côté coéquipiers, ou en
-- miroir côté adversaires), le match est validé. Anti-triche :
--   • il faut ≥ 2 comptes rattachés au match (impossible de se déclarer vainqueur seul) ;
--   • une saisie par joueur ; saisies discordantes = match NON compté (chacun peut corriger) ;
--   • sans 2ᵉ saisie ni contestation sous 48 h, la saisie unique est validée (sinon
--     personne ne validerait jamais) — une saisie discordante tardive ré-ouvre le litige ;
--   • fenêtre de 14 jours (pas de farming rétroactif de vieux matchs) ;
--   • tout passe par des RPC SECURITY DEFINER — aucune écriture directe dans la table ;
--   • seuls les joueurs AYANT SAISI leur score marquent les +3 (ça pousse chacun à le faire).
-- La concordance se calcule sur la forme CANONIQUE du score : les sets vus du VAINQUEUR
-- (ex. « 6-3, 6-4 ») — un perdant qui saisit « 3-6, 4-6 » produit le même canon.

-- ─── TABLE DES SAISIES DE SCORE (une ligne PAR JOUEUR et par match) ──────────
-- La v1 de cette table (colonne winner_ids : « un joueur déclare, l'autre confirme ») est
-- remplacée par le modèle « chaque joueur saisit son score ». On ne la jette QUE si elle a
-- l'ancienne forme (fonctionnalité jamais ouverte aux joueurs : aucune donnée réelle).
do $$ begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'match_results' and column_name = 'winner_ids'
  ) then
    drop table public.match_results;
  end if;
end $$;

create table if not exists public.match_results (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  sets jsonb not null, -- [{ "me": 6, "them": 3 }, …] du point de vue du saisisseur
  i_won boolean not null, -- dérivé des sets côté serveur (jamais fourni par le client)
  canon text not null, -- score vu du vainqueur (ex. '6-3, 6-4') → base de la concordance
  created_at timestamptz not null default now(),
  unique (reservation_id, user_id)
);

-- RLS sans policy : lecture/écriture UNIQUEMENT via les RPC ci-dessous (et le webhook,
-- qui passe par la service role). Personne ne peut forger un score à la main.
alter table public.match_results enable row level security;

create index if not exists mr_reservation_idx on public.match_results (reservation_id);

-- Les RPC de la v1 n'existent plus (signatures/retours changés) — on nettoie proprement.
drop function if exists public.submit_match_result(uuid, uuid[]);
drop function if exists public.confirm_match_result(uuid, boolean);
drop function if exists public.fetch_match_players(uuid);
drop function if exists public.fetch_my_match_results();
drop function if exists public.fetch_results_to_confirm();

-- ─── SAISIR MON SCORE ────────────────────────────────────────────────────────
-- p_sets : tableau JSON de 1 à 3 sets, chacun { "me": int, "them": int } (0–30, pas d'égalité
-- de set ni de match nul). Renvoie l'état du match APRÈS ma saisie :
--   'validated' (2+ saisies concordantes) | 'waiting' (seul pour l'instant) |
--   'conflict' (les saisies ne concordent pas) | 'no_players' (moins de 2 comptes
--   rattachés) | 'error'. Une saisie discordante remet TOUJOURS le match en litige, même
--   validé — c'est voulu : un joueur honnête doit pouvoir contester deux saisies complices
--   (le litige gèle les points, il ne les attribue jamais à l'autre camp).
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
  v_entries int;
  v_canons int;
begin
  if v_uid is null then return 'error'; end if;
  select id, user_id, status, starts_at into v_res
    from public.reservations where id = p_reservation_id;
  if v_res.id is null or v_res.status <> 'booked' then return 'error'; end if;
  -- Match FINI (session 1h30) et récent (≤ 14 jours) : pas de score avant la fin de la
  -- partie, pas de farming rétroactif sur l'historique.
  if v_res.starts_at + (90 * 60000) >= (extract(epoch from now()) * 1000)::bigint
     or v_res.starts_at < ((extract(epoch from now()) - 14 * 86400) * 1000)::bigint then
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
      return 'error'; -- un set ne se termine pas à égalité
    end if;
    if v_me > v_them then v_mine := v_mine + 1; else v_theirs := v_theirs + 1; end if;
  end loop;
  if v_mine = v_theirs then return 'error'; end if; -- pas de match nul au padel
  v_iwon := v_mine > v_theirs;
  select string_agg(
           case when v_iwon then (s ->> 'me') || '-' || (s ->> 'them')
                else (s ->> 'them') || '-' || (s ->> 'me') end, ', ')
    into v_canon
    from jsonb_array_elements(p_sets) s;
  -- Ma saisie (corrigeable à tout moment — created_at relance les 48 h de validation auto).
  insert into public.match_results (reservation_id, user_id, sets, i_won, canon)
    values (p_reservation_id, v_uid, p_sets, v_iwon, v_canon)
    on conflict (reservation_id, user_id)
    do update set sets = excluded.sets, i_won = excluded.i_won,
                  canon = excluded.canon, created_at = now();
  -- État du match après ma saisie.
  select count(*), count(distinct canon) into v_entries, v_canons
    from public.match_results where reservation_id = p_reservation_id;
  if v_canons > 1 then return 'conflict'; end if;
  if v_entries >= 2 then return 'validated'; end if;
  return 'waiting';
end;
$$;

grant execute on function public.submit_match_score(uuid, jsonb) to authenticated;

-- ─── LECTURE (écran « Mes réservations ») ────────────────────────────────────
-- L'état de score de MES matchs (au moins une saisie) : badge Victoire / En attente /
-- Scores différents, invitation « mets ton score » quand un autre joueur a déjà saisi.
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
          and (count(*) >= 2 or min(mr.created_at) < now() - interval '48 hours')) as validated,
         (count(distinct mr.canon) > 1) as conflict,
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

-- ─── CLASSEMENT ──────────────────────────────────────────────────────────────
-- Le type de retour change (colonnes points + match_wins) → DROP obligatoire avant
-- recréation (create or replace refuse un changement de colonnes de sortie).
drop function if exists public.fetch_leaderboard(int);

create or replace function public.fetch_leaderboard(p_limit int default 50)
returns table (user_id uuid, name text, level numeric, wins int, match_wins int, played int, points int)
language sql
security definer
set search_path = public
stable
as $$
  with base as (
    select p.id,
           trim(coalesce(p.first_name, '') || ' ' ||
                case when coalesce(p.last_name, '') <> '' then left(p.last_name, 1) || '.' else '' end) as pname,
           coalesce(p.level, 3)::numeric as plevel,
           -- Tournois OFFICIELS gagnés : vainqueur ANCRÉ à la clôture (44) — infalsifiable.
           (select count(*)::int from public.competitions c
              where c.status = 'closed' and c.official and c.winner_user_id = p.id) as wins,
           -- Participations à des tournois officiels JOUÉS (inscription serveur réelle).
           (select count(*)::int from public.competitions c
              join public.competition_registrations rg on rg.competition_id = c.id and rg.user_id = p.id
              where c.status = 'closed' and c.official) as offplayed,
           -- Victoires de MATCH : MA saisie gagnante, aucune saisie discordante, et une 2ᵉ
           -- saisie concordante (ou aucune réaction sous 48 h → validation automatique).
           (select count(*)::int from public.match_results mr
              where mr.user_id = p.id and mr.i_won
                and not exists (select 1 from public.match_results x
                                  where x.reservation_id = mr.reservation_id and x.canon <> mr.canon)
                and (exists (select 1 from public.match_results x2
                               where x2.reservation_id = mr.reservation_id and x2.user_id <> mr.user_id)
                     or mr.created_at < now() - interval '48 hours')) as mwins,
           -- Parties jouées : créées OU rejointes (invitation acceptée / match ouvert), finies.
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
        and coalesce(p.role, 'player') = 'player' -- les comptes club/opérateur ne concourent pas
  )
  select b.id, b.pname, b.plevel, b.wins, b.mwins, b.played,
         (b.wins * 100 + b.offplayed * 10 + b.mwins * 3 + b.played * 2) as points
    from base b
    order by 7 desc, b.wins desc, b.plevel desc, b.id
    limit greatest(coalesce(p_limit, 50), 1);
$$;

grant execute on function public.fetch_leaderboard(int) to authenticated;

-- Ma position — MÊMES points, MÊMES départages (signature inchangée : create or replace).
create or replace function public.my_leaderboard_rank()
returns int
language sql
security definer
set search_path = public
stable
as $$
  with base as (
    select p.id,
           coalesce(p.level, 3)::numeric as plevel,
           (select count(*) from public.competitions c
              where c.status = 'closed' and c.official and c.winner_user_id = p.id) as wins,
           (select count(*) from public.competitions c
              join public.competition_registrations rg on rg.competition_id = c.id and rg.user_id = p.id
              where c.status = 'closed' and c.official) as offplayed,
           (select count(*) from public.match_results mr
              where mr.user_id = p.id and mr.i_won
                and not exists (select 1 from public.match_results x
                                  where x.reservation_id = mr.reservation_id and x.canon <> mr.canon)
                and (exists (select 1 from public.match_results x2
                               where x2.reservation_id = mr.reservation_id and x2.user_id <> mr.user_id)
                     or mr.created_at < now() - interval '48 hours')) as mwins,
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
