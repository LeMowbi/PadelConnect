-- PadelConnect — CLASSEMENT GÉNÉRAL + ANNUAIRE DES COURS (SQL Editor → Run). Idempotent.
--
-- 1) Classement général des joueurs (modèle Playtomic adapté) : par NIVEAU — le seul signal
--    anti-triche du projet (il n'évolue que par les tournois officiels, côté serveur) —
--    départagé par tournois officiels GAGNÉS puis par parties JOUÉES (l'activité récompense
--    les assidus à niveau égal). Lecture seule, réservé aux comptes connectés.
-- 2) Coachs réservables TOUS CLUBS confondus : alimente l'écran « Réserver un cours »
--    (accès rapide de l'accueil) — le nom du club est résolu côté app (les 9 clubs de base
--    ne vivent pas en table).

-- ─── 1) Classement ────────────────────────────────────────────────────────────

create or replace function public.fetch_leaderboard(p_limit int default 50)
returns table (user_id uuid, name text, level numeric, wins int, played int)
language sql
security definer
set search_path = public
stable
as $$
  select p.id,
         -- Prénom + initiale du nom (pas le nom complet : un classement est public dans
         -- l'app, on n'y expose pas plus que ce que montre déjà une équipe de tournoi).
         trim(coalesce(p.first_name, '') || ' ' ||
              case when coalesce(p.last_name, '') <> '' then left(p.last_name, 1) || '.' else '' end),
         coalesce(p.level, 3)::numeric,
         -- Tournois OFFICIELS gagnés : équipes vainqueures dont ce compte était l'inscrit.
         (select count(*)::int from public.competitions c
            join public.competition_registrations rg on rg.competition_id = c.id and rg.user_id = p.id
            where c.status = 'closed' and c.official
              and trim(coalesce(p.first_name, '') || ' & ' || rg.partner) = c.winner),
         -- Parties jouées : réservations « booked » dont la session (1h30) est finie.
         (select count(*)::int from public.reservations r
            where r.user_id = p.id and r.status = 'booked'
              and r.starts_at + (90 * 60000) < (extract(epoch from now()) * 1000)::bigint)
    from public.profiles p
    where coalesce(trim(p.first_name), '') <> ''
      and coalesce(p.role, 'player') = 'player' -- les comptes club/opérateur ne concourent pas
    order by coalesce(p.level, 3) desc, 4 desc, 5 desc, p.id
    limit greatest(coalesce(p_limit, 50), 1);
$$;

grant execute on function public.fetch_leaderboard(int) to authenticated;

-- Ma position dans ce classement (si je suis au-delà du top affiché). Mêmes critères,
-- mêmes départages — 1 + le nombre de joueurs strictement mieux classés que moi.
create or replace function public.my_leaderboard_rank()
returns int
language sql
security definer
set search_path = public
stable
as $$
  with ranked as (
    select p.id,
           row_number() over (
             order by coalesce(p.level, 3) desc,
               (select count(*) from public.competitions c
                  join public.competition_registrations rg on rg.competition_id = c.id and rg.user_id = p.id
                  where c.status = 'closed' and c.official
                    and trim(coalesce(p.first_name, '') || ' & ' || rg.partner) = c.winner) desc,
               (select count(*) from public.reservations r
                  where r.user_id = p.id and r.status = 'booked'
                    and r.starts_at + (90 * 60000) < (extract(epoch from now()) * 1000)::bigint) desc,
               p.id
           ) as rk
      from public.profiles p
      where coalesce(trim(p.first_name), '') <> '' and coalesce(p.role, 'player') = 'player'
  )
  select rk::int from ranked where id = auth.uid();
$$;

grant execute on function public.my_leaderboard_rank() to authenticated;

-- ─── 2) Coachs réservables (tous clubs) ──────────────────────────────────────

create or replace function public.fetch_bookable_coaches()
returns table (user_id uuid, club_id text, name text, specialty text, price integer, slots text[])
language sql
security definer
set search_path = public
stable
as $$
  select c.user_id, c.club_id,
         coalesce(nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), 'Coach'),
         c.specialty, c.price, c.slots
    from public.coaches c
    join public.profiles p on p.id = c.user_id
    where c.active
    order by c.club_id, 3;
$$;

grant execute on function public.fetch_bookable_coaches() to authenticated;
