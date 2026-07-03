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

-- Le VAINQUEUR est FIGÉ à la clôture (winner_user_id) : compter les victoires en re-comparant
-- des chaînes « Prénom & partenaire » à la lecture serait falsifiable a posteriori (renommage
-- du profil après coup) — même classe de faille que celles fermées par 34/36 pour le niveau.
alter table public.competitions
  add column if not exists winner_user_id uuid;

-- close_competition (version 36 + ancrage du vainqueur) : MÊME signature (create or replace).
create or replace function public.close_competition(p_id uuid, p_winner text, p_second text, p_third text, p_loser text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_club text;
  v_official boolean;
  v_winner text := nullif(trim(coalesce(p_winner, '')), '');
  v_loser text := nullif(trim(coalesce(p_loser, '')), '');
  v_winner_n int;
  v_loser_n int;
begin
  select organizer_id, club_id, official into v_owner, v_club, v_official
    from public.competitions where id = p_id and status = 'published';
  if v_owner is null then return false; end if;
  if v_owner <> auth.uid() and not public.can_manage_club(v_club) then return false; end if;
  update public.competitions
    set status = 'closed',
        winner = v_winner,
        second = nullif(trim(coalesce(p_second, '')), ''),
        third = nullif(trim(coalesce(p_third, '')), ''),
        loser = v_loser,
        closed_at = now()
    where id = p_id;

  if v_official then
    -- Autorise l'écriture de `level` pour cette transaction uniquement (le trigger la laissera passer).
    perform set_config('padel.level_write', 'on', true);
    if v_winner is not null then
      -- Combien d'inscriptions de CE tournoi portent la chaîne gagnante ? (anti-collision)
      select count(*) into v_winner_n
        from public.competition_registrations rg
        join public.profiles pr on pr.id = rg.user_id
        where rg.competition_id = p_id
          and trim(coalesce(pr.first_name, '') || ' & ' || rg.partner) = v_winner;
      if v_winner_n = 1 then
        update public.profiles pr
          set level = least(7, greatest(1, coalesce(pr.level, 3) + 0.5))
          from public.competition_registrations rg
          where rg.competition_id = p_id and rg.user_id = pr.id
            and trim(coalesce(pr.first_name, '') || ' & ' || rg.partner) = v_winner;
        -- Vainqueur ANCRÉ une fois pour toutes (même règle d'unicité que le niveau) :
        -- le classement (fetch_leaderboard) compte sur cet id, jamais sur la chaîne.
        update public.competitions c
          set winner_user_id = (
            select rg.user_id from public.competition_registrations rg
              join public.profiles pr on pr.id = rg.user_id
              where rg.competition_id = p_id
                and trim(coalesce(pr.first_name, '') || ' & ' || rg.partner) = v_winner
              limit 1)
          where c.id = p_id;
      end if;
    end if;
    if v_loser is not null then
      select count(*) into v_loser_n
        from public.competition_registrations rg
        join public.profiles pr on pr.id = rg.user_id
        where rg.competition_id = p_id
          and trim(coalesce(pr.first_name, '') || ' & ' || rg.partner) = v_loser;
      if v_loser_n = 1 then
        update public.profiles pr
          set level = least(7, greatest(1, coalesce(pr.level, 3) - 0.25))
          from public.competition_registrations rg
          where rg.competition_id = p_id and rg.user_id = pr.id
            and trim(coalesce(pr.first_name, '') || ' & ' || rg.partner) = v_loser;
      end if;
    end if;
  end if;
  return true;
end;
$$;

grant execute on function public.close_competition(uuid, text, text, text, text) to authenticated;

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
         -- Tournois OFFICIELS gagnés : sur le vainqueur ANCRÉ à la clôture (winner_user_id),
         -- jamais par comparaison de chaînes (falsifiable en renommant son profil après coup).
         (select count(*)::int from public.competitions c
            where c.status = 'closed' and c.official and c.winner_user_id = p.id),
         -- Parties jouées : réservations « booked » finies (session 1h30) que j'ai créées
         -- + celles que j'ai REJOINTES (invitation acceptée / match ouvert) — même règle
         -- que « Mes réservations » côté app, sinon les rejoigneurs stagnent à 0.
         ((select count(*) from public.reservations r
             where r.user_id = p.id and r.status = 'booked'
               and r.starts_at + (90 * 60000) < (extract(epoch from now()) * 1000)::bigint)
          + (select count(*) from public.reservation_participants rp
               join public.reservations rr on rr.id = rp.reservation_id
               where rp.user_id = p.id and rp.status = 'accepted' and rr.user_id <> p.id
                 and rr.status = 'booked'
                 and rr.starts_at + (90 * 60000) < (extract(epoch from now()) * 1000)::bigint))::int
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
                  where c.status = 'closed' and c.official and c.winner_user_id = p.id) desc,
               ((select count(*) from public.reservations r
                   where r.user_id = p.id and r.status = 'booked'
                     and r.starts_at + (90 * 60000) < (extract(epoch from now()) * 1000)::bigint)
                + (select count(*) from public.reservation_participants rp
                     join public.reservations rr on rr.id = rp.reservation_id
                     where rp.user_id = p.id and rp.status = 'accepted' and rr.user_id <> p.id
                       and rr.status = 'booked'
                       and rr.starts_at + (90 * 60000) < (extract(epoch from now()) * 1000)::bigint)) desc,
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
