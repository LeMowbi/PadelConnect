-- PadelConnect — CLASSEMENT PAR POINTS + SCORE DE MATCH (SQL Editor → Run). Idempotent.
--
-- Constat porteur : un classement par NIVEAU serait « nul » — le niveau est plafonné à 7
-- ET auto-déclaré à l'inscription : au lancement, le 1ᵉʳ serait celui qui s'est déclaré 7,
-- puis tout le monde stagnerait. On passe au modèle « Race » (comme la FIP) : des POINTS
-- gagnés DANS l'app, tous issus de faits serveur infalsifiables, sans plafond :
--   • tournoi officiel GAGNÉ (vainqueur ancré à la clôture, 44) . . . 100 pts
--   • participation à un tournoi officiel joué (inscription réelle) .  10 pts
--   • VICTOIRE de match confirmée (score saisi + validé, ci-dessous) .   3 pts
--   • partie jouée (réservation finie, créée ou rejointe) . . . . . .   2 pts
-- Le niveau reste affiché à titre d'info (force du joueur) — le RANG, lui, se mérite.
-- Départage : points, puis tournois gagnés, puis niveau, puis id (stable).
--
-- SCORE DE MATCH (modèle Playtomic) : après un match fini, UN joueur saisit qui a gagné
-- parmi les joueurs IDENTIFIÉS de la réservation (créateur + invités/rejoints acceptés) ;
-- un AUTRE joueur du match confirme (ou conteste). Sans contestation sous 48 h, le résultat
-- est validé automatiquement (sinon personne ne confirmerait jamais). Anti-triche :
--   • il faut ≥ 2 comptes rattachés au match (impossible de se déclarer vainqueur seul) ;
--   • un seul résultat par réservation ; contesté = ne compte pas (ressaisie possible) ;
--   • fenêtre de 14 jours (pas de farming rétroactif de vieux matchs) ;
--   • tout passe par des RPC SECURITY DEFINER — aucune écriture directe dans la table.

-- ─── TABLE DES RÉSULTATS DE MATCH ────────────────────────────────────────────
create table if not exists public.match_results (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null unique references public.reservations (id) on delete cascade,
  winner_ids uuid[] not null,
  submitted_by uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending',
  responded_by uuid,
  created_at timestamptz not null default now()
);

alter table public.match_results drop constraint if exists mr_status_check;
alter table public.match_results
  add constraint mr_status_check check (status in ('pending', 'confirmed', 'disputed'));

-- RLS sans policy : lecture/écriture UNIQUEMENT via les RPC ci-dessous (et le webhook,
-- qui passe par la service role). Personne ne peut forger un résultat à la main.
alter table public.match_results enable row level security;

create index if not exists mr_reservation_idx on public.match_results (reservation_id);

-- ─── SAISIR LE RÉSULTAT ──────────────────────────────────────────────────────
-- Renvoie : 'ok' | 'exists' (déjà saisi, non contesté) | 'no_players' (moins de 2 comptes
-- rattachés au match — rien à confirmer) | 'error' (appel invalide).
create or replace function public.submit_match_result(p_reservation_id uuid, p_winner_ids uuid[])
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_res record;
  v_players uuid[];
  v_winners uuid[];
  v_existing record;
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
  -- Vainqueurs : sous-ensemble strict des joueurs du match (1 à n-1, dédupliqué).
  select array_agg(distinct w) into v_winners
    from unnest(coalesce(p_winner_ids, '{}')) w where w = any (v_players);
  if v_winners is null or array_length(v_winners, 1) >= array_length(v_players, 1) then
    return 'error';
  end if;
  select id, status into v_existing
    from public.match_results where reservation_id = p_reservation_id;
  if v_existing.id is not null then
    if v_existing.status <> 'disputed' then return 'exists'; end if;
    -- Résultat CONTESTÉ : n'importe quel joueur du match peut le ressaisir (repart en
    -- 'pending' — le webhook re-préviendra les autres, created_at relance les 48 h).
    update public.match_results
       set winner_ids = v_winners, submitted_by = v_uid, status = 'pending',
           responded_by = null, created_at = now()
     where id = v_existing.id;
    return 'ok';
  end if;
  insert into public.match_results (reservation_id, winner_ids, submitted_by)
    values (p_reservation_id, v_winners, v_uid);
  return 'ok';
end;
$$;

grant execute on function public.submit_match_result(uuid, uuid[]) to authenticated;

-- ─── CONFIRMER / CONTESTER ───────────────────────────────────────────────────
-- Réservé à un joueur du match AUTRE que celui qui a saisi. true = pris en compte.
create or replace function public.confirm_match_result(p_result_id uuid, p_agree boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row record;
begin
  if v_uid is null then return false; end if;
  select mr.id, mr.status, mr.submitted_by, mr.reservation_id, r.user_id as owner_id
    into v_row
    from public.match_results mr
    join public.reservations r on r.id = mr.reservation_id
   where mr.id = p_result_id;
  if v_row.id is null or v_row.status <> 'pending' or v_row.submitted_by = v_uid then
    return false;
  end if;
  if v_row.owner_id <> v_uid and not exists (
    select 1 from public.reservation_participants rp
     where rp.reservation_id = v_row.reservation_id and rp.user_id = v_uid and rp.status = 'accepted'
  ) then
    return false;
  end if;
  update public.match_results
     set status = case when p_agree then 'confirmed' else 'disputed' end, responded_by = v_uid
   where id = p_result_id;
  return true;
end;
$$;

grant execute on function public.confirm_match_result(uuid, boolean) to authenticated;

-- ─── LECTURES (pour l'écran « Mes réservations ») ────────────────────────────
-- Les joueurs identifiés d'une de MES réservations (pour cocher qui a gagné).
create or replace function public.fetch_match_players(p_reservation_id uuid)
returns table (user_id uuid, name text)
language sql
security definer
set search_path = public
stable
as $$
  select p.id,
         trim(coalesce(p.first_name, '') || ' ' ||
              case when coalesce(p.last_name, '') <> '' then left(p.last_name, 1) || '.' else '' end)
    from (
      select r.user_id as uid from public.reservations r where r.id = p_reservation_id
      union
      select rp.user_id from public.reservation_participants rp
        where rp.reservation_id = p_reservation_id and rp.status = 'accepted'
    ) x
    join public.profiles p on p.id = x.uid
   where exists ( -- réservé aux joueurs du match (on n'expose pas les équipes des autres)
     select 1 from (
       select r2.user_id as uid from public.reservations r2 where r2.id = p_reservation_id
       union
       select rp2.user_id from public.reservation_participants rp2
         where rp2.reservation_id = p_reservation_id and rp2.status = 'accepted'
     ) me where me.uid = auth.uid()
   );
$$;

grant execute on function public.fetch_match_players(uuid) to authenticated;

-- L'état des résultats de MES matchs (badge Victoire / En attente / Contesté sur les passées).
create or replace function public.fetch_my_match_results()
returns table (reservation_id uuid, status text, i_won boolean, mine boolean)
language sql
security definer
set search_path = public
stable
as $$
  select mr.reservation_id, mr.status,
         auth.uid() = any (mr.winner_ids) as i_won,
         mr.submitted_by = auth.uid() as mine
    from public.match_results mr
    join public.reservations r on r.id = mr.reservation_id
   where r.user_id = auth.uid()
      or exists (select 1 from public.reservation_participants rp
                   where rp.reservation_id = r.id and rp.user_id = auth.uid() and rp.status = 'accepted');
$$;

grant execute on function public.fetch_my_match_results() to authenticated;

-- Les résultats saisis par un AUTRE joueur qui attendent MA confirmation.
create or replace function public.fetch_results_to_confirm()
returns table (result_id uuid, reservation_id uuid, club_name text, date_label text, "time" text,
               winner_names text, submitted_name text)
language sql
security definer
set search_path = public
stable
as $$
  select mr.id, mr.reservation_id, r.club_name, r.date_label, r."time",
         (select string_agg(trim(coalesce(p2.first_name, '') || ' ' ||
                  case when coalesce(p2.last_name, '') <> '' then left(p2.last_name, 1) || '.' else '' end), ', ')
            from public.profiles p2 where p2.id = any (mr.winner_ids)) as winner_names,
         (select trim(coalesce(p3.first_name, '') || ' ' ||
                  case when coalesce(p3.last_name, '') <> '' then left(p3.last_name, 1) || '.' else '' end)
            from public.profiles p3 where p3.id = mr.submitted_by) as submitted_name
    from public.match_results mr
    join public.reservations r on r.id = mr.reservation_id
   where mr.status = 'pending'
     and mr.submitted_by <> auth.uid()
     and (r.user_id = auth.uid()
          or exists (select 1 from public.reservation_participants rp
                       where rp.reservation_id = r.id and rp.user_id = auth.uid() and rp.status = 'accepted'))
   order by mr.created_at desc;
$$;

grant execute on function public.fetch_results_to_confirm() to authenticated;

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
           -- Victoires de MATCH : confirmées par un partenaire, ou sans contestation sous 48 h.
           (select count(*)::int from public.match_results mr
              where p.id = any (mr.winner_ids)
                and (mr.status = 'confirmed'
                     or (mr.status = 'pending' and mr.created_at < now() - interval '48 hours'))) as mwins,
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
              where p.id = any (mr.winner_ids)
                and (mr.status = 'confirmed'
                     or (mr.status = 'pending' and mr.created_at < now() - interval '48 hours'))) as mwins,
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
