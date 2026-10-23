-- 98 — Décisions du porteur du 2026-10-22 (« tout ok » sur les recommandations du §7 de
-- docs/AUDIT-REGLES-METIER-2026-10.md), volet SERVEUR — lot D1.
-- À coller dans Supabase → SQL Editor → Run APRÈS la 97, dans la MÊME passe que 92 → 97 (point 4 :
-- les réclamations de fidélité présentes au collage sont celles de l'ancienne règle). Idempotente,
-- rejouable seule.
--
-- Chaque fonction est une recopie STRICTE de sa définition la plus récente (dépôt 92 → 97, sinon
-- dump live du 2026-10-21) hormis le bloc commenté « décision n ». Signatures et types de retour
-- appelés par la v1.0.2 INCHANGÉS ; seul `fetch_leaderboard` gagne une colonne `rank` EN DERNIER
-- (drop + create, client tolérant), comme `fetch_open_matches` dans la 96.
--
--  1) Décision 3 (T-3) — un COURS de coach (résa portant `coach_name`, privé ou collectif) n'est
--     pas une partie : ni +2 / +3 au classement, ni fidélité, ni niveau. Il RESTE dans la
--     présence (T-3 : « restent dans la présence ») — `public_reliability` (80) n'est pas
--     redéfinie et le badge d'absences du gérant compte les cours. `coach_name` n'est plus
--     forgeable par le joueur qui réserve pour lui-même.
--  2) Décision 4 — fidélité : les réclamations faites sous l'ANCIENNE règle (82) ne comptent plus
--     (`legacy`) ; le compteur de la règle cible (92) repart de zéro. Elles restent servables
--     (aucune remise promise n'est retirée) et leur numéro de cycle est gardé.
--  3) Décision 7 (T-4) — « pas venu » refusé sur un match au score VALIDÉ, à 48 h comprises.
--  4) Décision 9 (T-6 / R-30) — compte supprimé : ses partenaires GARDENT les matchs passés
--     (parties, victoires, points) ; l'auteur devient « Ancien joueur » (place anonyme).
--  5) Décision 10 (T-8) — classement « ex æquo » : rang partagé au standard sportif (1, 1, 3).
--  6) Décision 14 (T-12) — tournoi annulé par le club ou l'opérateur : frais PadelConnect
--     annulés (déjà encaissés → « à rembourser », l'opérateur est prévenu par notify-club v50) ;
--     « Paiement reçu » refusé sur un tournoi annulé (la créance annulée ne ressuscite pas).
--  7) Décision 17 (T-14) — push « actus et agenda » activés par défaut, désactivables.
--  8) Décision 18 (T-21) — badge « annulations » du gérant : annulations à moins de 24 h du match.
--  9) Finitions de l'audit (tour 1 du 2026-10-23) : suivi des frais « à rembourser »
--     (operator_refunds_due / operator_mark_refunded), auteur d'une annulation de tournoi
--     (`cancelled_by`, lu par notify-club), `search_path` figé sur 8 fonctions (R-80),
--     rattrapage R-16 rejoué après la nouvelle garde de disponibilité ; (tour 2) suppressions de
--     compte sérialisées (interblocage de deux partenaires), tournoi « à rembourser » non supprimable,
--     rattrapage R-52 (invitations en attente entre comptes bloqués AVANT la 96) ; (tour 3)
--     delete_competition sous le verrou 'reg:' (course avec une annulation ou une inscription).
-- Sans SQL : décision 13 (T-11 — aucune RPC ne calcule la commission : l'Espace opérateur la
-- calcule sur les parties jouées 'booked', l'absence en est déjà exclue, la séance de carnet y
-- reste) ; décisions 11, 12, 15, 16 et 19 (app, site — le serveur ne dérive aucun prix 1h).
-- ⚠️ Après la 98, ne JAMAIS recoller SEULE une migration antérieure qui redéfinit ses fonctions —
-- tout recollage reprend la suite dans l'ordre JUSQU'À LA 98 INCLUSE (prouvé : catalogue
-- identique à un passage unique) :
--   • la 80 (submit_match_score) ou la 96 (apply_match_level, classement) : leurs versions ne
--     connaissent pas la place anonyme d'un compte supprimé — prouvé en local, l'ancienne
--     submit_match_score laisse alors un TIERS saisir et valider le score ; la 96 s'ARRÊTE en
--     plus sur `42P13 cannot change return type` (fetch_leaderboard a gagné `rank`) — la
--     recoller exige `drop function public.fetch_leaderboard(integer);` d'abord ;
--   • la 92 (my_loyalty, claim_loyalty) : passe SANS ERREUR et remet en silence l'ancienne
--     fidélité (réclamations `legacy` recomptées, cours recomptés) ;
--   • la 97 (cancel_competition, delete_club, delete_account) : passe SANS ERREUR et efface en
--     silence les décisions 9 et 14 (code 'fees', 'refund_due', matchs passés des partenaires) —
--     et sa delete_competition, la garde qui empêche de supprimer un tournoi « à rembourser ».
-- notify-club v50 lit `profiles.news_push` et `competitions.cancelled_by` : coller la 98 AVANT de
-- la déployer.

-- ── 0) Colonnes ──────────────────────────────────────────────────────────────────
-- Décision 9 : résa passée REPRISE par un partenaire (son auteur a supprimé son compte) — exclue
-- de la fidélité du repreneur (il ne l'a pas créée) ; lue par l'app pour l'afficher comme telle.
alter table public.reservations add column if not exists owner_deleted boolean not null default false;
-- Décision 18 : heure de l'annulation (trigger plus bas) — null pour les annulations antérieures
-- à la 98, qui ne comptent donc plus dans le badge (bénéfice du doute : l'heure est inconnue).
alter table public.reservations add column if not exists cancelled_at timestamptz;
-- Décision 9 : la place d'un compte supprimé dans un match passé reste comptée, SANS nom
-- (user_id NULL) — participations et saisies de score. Seules les RPC SECURITY DEFINER écrivent
-- ces tables (aucune policy d'écriture) : un client ne peut pas y glisser une ligne anonyme.
alter table public.reservation_participants alter column user_id drop not null;
alter table public.match_results alter column user_id drop not null;
-- Décision 17 : préférence « actus et agenda PadelConnect » (activée par défaut).
alter table public.profiles add column if not exists news_push boolean not null default true;
-- Décision 4 : réclamations de l'ANCIENNE règle. Colonne posée SANS défaut → les lignes déjà là
-- (règle 82) restent NULL et sont marquées `legacy` ; le défaut `false` ne vaut qu'ENSUITE.
-- Rejouable : au 2ᵉ collage la colonne est NOT NULL, l'update ne touche plus rien.
alter table public.loyalty_claims add column if not exists legacy boolean;
update public.loyalty_claims set legacy = true where legacy is null;
alter table public.loyalty_claims alter column legacy set default false, alter column legacy set not null;
-- Décision 14 (finition) : AUTEUR de l'annulation d'un tournoi (cancel_competition, delete_club) —
-- notify-club ne renvoie pas « Ton tournoi est annulé » à l'organisateur qui vient de l'annuler
-- lui-même (gérant qui annule le tournoi de SON club, organisateur sans inscrit). Détaché à la
-- suppression du compte, comme `organizer_id` (64).
alter table public.competitions add column if not exists cancelled_by uuid references auth.users (id) on delete set null;

-- ── 1) Décision 3 — `coach_name` réservé aux cours ───────────────────────────────
-- Recopie STRICTE de la 96 hormis `new.coach_name := null` dans le bloc R-76 : un joueur qui
-- réserve pour lui-même ne peut plus se déclarer « cours » (il échapperait au moteur de niveau et
-- sortirait sa partie du classement de ses partenaires). Les cours gardent le nom du coach :
-- respond_lesson insère pour l'ÉLÈVE (auth.uid() = coach) et un cours collectif passe par
-- padel.group_lesson — tous deux hors de ce bloc. Et les colonnes de la 98 naissent neutres
-- (`owner_deleted`, `cancelled_at` : seules delete_account et le trigger d'annulation les posent).
create or replace function public.reservations_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
  v_upcoming int;
  v_courts text[];
begin
  -- (71) Verrou CLUB, pris AVANT le verrou club:jour (ordre constant → pas d'interblocage) :
  -- sérialise l'INSERT avec upsert_club_config (garde anti-orphelin 69/70) — sans lui, une résa
  -- pouvait se glisser ENTRE la vérification de la garde et l'écriture de la nouvelle grille.
  perform pg_advisory_xact_lock(hashtext(new.club_id));
  -- Sérialise avec approve_competition / create_competition (même clé club:jour) : plus de
  -- fenêtre où une résa et une publication de tournoi se croisent sans se voir.
  perform pg_advisory_xact_lock(hashtext(new.club_id || ':' || new.date_key));
  -- Une réservation naît TOUJOURS 'booked' et non confirmée (seules les RPC la font évoluer).
  new.club_confirmed := false;
  new.status := 'booked';
  new.owner_deleted := false;
  new.cancelled_at := null;
  -- R-76 : identité du réservant = son profil (jamais la valeur envoyée par le client).
  if auth.uid() is not null and auth.uid() = new.user_id
     and coalesce(current_setting('padel.group_lesson', true), '') <> 'on' then
    select nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), p.phone
      into new.booked_by_name, new.booked_by_phone
      from public.profiles p where p.id = new.user_id;
    -- Décision 3 : seul un cours (respond_lesson, cours collectif) porte le nom d'un coach.
    new.coach_name := null;
  end if;
  -- (a) Format date/heure validé PUIS starts_at RECALCULÉ côté serveur (Abidjan = UTC). Une date
  -- calendaire impossible (« 2026-02-31 ») ferait échouer le cast → refus propre.
  if new.date_key is null or new.date_key !~ '^\d{4}-\d{2}-\d{2}$'
     or new."time" is null or new."time" !~ '^([01]\d|2[0-3]):([0-5]\d)$' then
    raise exception 'invalid slot format';
  end if;
  begin
    new.starts_at := (extract(epoch from (new.date_key || ' ' || new."time")::timestamp) * 1000)::bigint;
  exception when others then
    raise exception 'invalid slot format';
  end;
  -- Créneau passé : interdit (tolérance 15 min pour l'horloge).
  if new.starts_at < v_now - 15 * 60000 then
    raise exception 'reservation must be in the future';
  end if;
  -- (b) Durée valide + créneau OUVERT de CE terrain. La grille par terrain (resolve_court_slots)
  -- remplace l'ancien `time = any(slots)` : elle porte durée ET fermetures. Le terrain doit rester
  -- déclaré (resolve_court_slots retomberait sur la grille par défaut pour un terrain inconnu).
  if new.duration_min is null or new.duration_min not in (60, 90) then
    raise exception 'invalid duration';
  end if;
  select c.courts into v_courts from public.club_config c where c.club_id = new.club_id;
  if v_courts is not null and array_length(v_courts, 1) > 0 and not (new.court = any (v_courts)) then
    raise exception 'unknown court';
  end if;
  if not exists (
    select 1 from public.resolve_court_slots(new.club_id, new.court) rs
    where not rs.x and rs.t = new."time" and rs.d = new.duration_min
  ) then
    raise exception 'slot closed';
  end if;
  -- (c) PÉRIODE fermée (54) : terrain précis ou tout le club ; une heure fermée T ferme [T,T+90).
  if exists (
    select 1 from public.blocked_ranges br
    where br.club_id = new.club_id
      and new.date_key >= br.date_from and new.date_key <= br.date_to
      and (br.court is null or br.court = new.court)
      and (
        br.times is null
        or exists (
          select 1 from unnest(br.times) bt
          where public.hhmm_to_min(bt) is not null
            and public.hhmm_to_min(bt) < public.hhmm_to_min(new."time") + new.duration_min
            and public.hhmm_to_min(new."time") < public.hhmm_to_min(bt) + 90
        )
      )
  ) then
    raise exception 'slot closed';
  end if;
  -- Plafond anti-abus de réservations À VENIR par compte — SAUF cours collectif (83) : la résa
  -- porteuse est au nom du COACH, dont l'agenda dépasse légitimement 10 sessions à venir.
  if coalesce(current_setting('padel.group_lesson', true), '') <> 'on' then
    select count(*) into v_upcoming from public.reservations r
      where r.user_id = new.user_id and r.status = 'booked' and r.starts_at > v_now;
    if v_upcoming >= 10 then
      raise exception 'too many upcoming reservations';
    end if;
  end if;
  return new;
end;
$$;

-- ── 2) Décisions 3 + 10 — Classement ─────────────────────────────────────────────
-- Recopie STRICTE de la 96 hormis : (décision 3) les COURS sortent des parties jouées (+2) et des
-- victoires (+3) ; (décision 10) colonne `rank` EN DERNIER = rang partagé quand points, tournois
-- gagnés et victoires sont égaux (« 1, 1, 3 » — le standard sportif : deux 1ᵉʳˢ ex æquo, puis
-- un 3ᵉ). L'ordre des lignes reste départagé par l'id (stable) ; le client affiche `rank`.
-- Type de retour changé → drop puis create (42P13), ACL reposées. Le rang est calculé sur TOUT
-- le classement avant la limite (fenêtre évaluée avant LIMIT) : il est identique au rang perso.
drop function if exists public.fetch_leaderboard(integer);
create function public.fetch_leaderboard(p_limit integer default 50)
returns table(user_id uuid, name text, level numeric, wins integer, match_wins integer, off_played integer, played integer, points integer, rank integer)
language sql
stable
security definer
set search_path = public
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
                                 and coalesce(rr.coach_name, '') = '' -- décision 3 : jamais un cours
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
               where r.user_id = p.id and r.status = 'booked' and coalesce(r.coach_name, '') = ''
                 and r.starts_at + (r.duration_min * 60000) < (extract(epoch from now()) * 1000)::bigint)
            + (select count(*) from public.reservation_participants rp
                 join public.reservations rr on rr.id = rp.reservation_id
                 where rp.user_id = p.id and rp.status = 'accepted' and rr.user_id <> p.id
                   and rr.status = 'booked' and coalesce(rr.coach_name, '') = ''
                   and rr.starts_at + (rr.duration_min * 60000) < (extract(epoch from now()) * 1000)::bigint))::int as played
      from public.profiles p
      where coalesce(trim(p.first_name), '') <> ''
        and coalesce(p.role, 'player') <> 'operator'
  )
  select b.id, b.pname, b.plevel, b.wins, b.mwins, b.offplayed, b.played,
         (b.wins * 100 + b.offplayed * 10 + b.mwins * 3 + b.played * 2) as points,
         -- Décision 10 : rang PARTAGÉ (mêmes critères que l'ordre, sans l'id).
         (rank() over (order by (b.wins * 100 + b.offplayed * 10 + b.mwins * 3 + b.played * 2) desc,
                                b.wins desc, b.mwins desc))::int as rank
    from base b
    where (b.wins * 100 + b.offplayed * 10 + b.mwins * 3 + b.played * 2) > 0 -- pas de joueur à 0 pt
    order by 8 desc, b.wins desc, b.mwins desc, b.id -- le NIVEAU ne départage jamais (règle §9)
    limit greatest(coalesce(p_limit, 50), 1);
$$;
revoke execute on function public.fetch_leaderboard(integer) from public, anon;
grant execute on function public.fetch_leaderboard(integer) to authenticated;

-- Mêmes règles que fetch_leaderboard (décisions 3 et 10) — à modifier ENSEMBLE. Type inchangé
-- (integer ; 0 = non classé). Recopie STRICTE de la 96 hormis le filtre des cours et
-- `rank()` à la place de `row_number()` (ex æquo : deux joueurs à égalité parfaite ont le même rang).
create or replace function public.my_leaderboard_rank()
returns integer
language sql
stable
security definer
set search_path = public
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
                                 and coalesce(rr.coach_name, '') = '' -- décision 3 : jamais un cours
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
               where r.user_id = p.id and r.status = 'booked' and coalesce(r.coach_name, '') = ''
                 and r.starts_at + (r.duration_min * 60000) < (extract(epoch from now()) * 1000)::bigint)
            + (select count(*) from public.reservation_participants rp
                 join public.reservations rr on rr.id = rp.reservation_id
                 where rp.user_id = p.id and rp.status = 'accepted' and rr.user_id <> p.id
                   and rr.status = 'booked' and coalesce(rr.coach_name, '') = ''
                   and rr.starts_at + (rr.duration_min * 60000) < (extract(epoch from now()) * 1000)::bigint)) as played
      from public.profiles p
      where coalesce(trim(p.first_name), '') <> '' and coalesce(p.role, 'player') <> 'operator'
  ),
  scored as (
    select id, (wins * 100 + offplayed * 10 + mwins * 3 + played * 2) as points, wins, mwins from base
  ),
  ranked as (
    select id, rank() over (order by points desc, wins desc, mwins desc) as rk
      from scored where points > 0 -- non classé tant qu'on n'a marqué aucun point
  )
  -- 0 = NON CLASSÉ (0 point) — distinct d'un échec réseau côté client (null).
  select coalesce((select rk::int from ranked where id = auth.uid()), 0);
$$;
revoke execute on function public.my_leaderboard_rank() from public, anon;
grant execute on function public.my_leaderboard_rank() to authenticated;

-- ── 3) Décisions 3 + 4 + 9 — Fidélité ────────────────────────────────────────────
-- Recopie STRICTE de la 92 hormis : (décision 3) les COURS ne comptent ni dans `played` ni dans
-- `played_all` (tuile « Parties jouées », trophées) ; (décision 9) une résa REPRISE d'un compte
-- supprimé (`owner_deleted`) compte dans `played_all` du repreneur — il a joué — mais pas dans
-- `played` — il ne l'a pas créée ; (décision 4) `claimed` ne compte que les réclamations de la
-- règle cible (`not legacy`). Colonnes inchangées → create or replace (aucun drop).
create or replace function public.my_loyalty()
returns table (played integer, played_all integer, claimed integer, cap integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if v_uid is null then return; end if;
  return query
    select
      (select count(*) from public.reservations r
        where r.status = 'booked'
          and r.starts_at + (coalesce(r.duration_min, 90) * 60000) < v_now
          and r.user_id = v_uid
          and coalesce(r.coach_name, '') = ''
          and not r.owner_deleted)::int,
      (select count(*) from public.reservations r
        where r.status = 'booked'
          and r.starts_at + (coalesce(r.duration_min, 90) * 60000) < v_now
          and coalesce(r.coach_name, '') = ''
          and (r.user_id = v_uid or exists (
                select 1 from public.reservation_participants rp
                where rp.reservation_id = r.id and rp.user_id = v_uid and rp.status = 'accepted')))::int,
      (select count(*) from public.loyalty_claims lc where lc.user_id = v_uid and not lc.legacy)::int,
      public.loyalty_cap();
end;
$$;

-- Recopie STRICTE de la 92 hormis le NUMÉRO de cycle (décision 4) : il suit TOUS les cycles du
-- joueur, anciens compris — `claimed` (règle cible) repart de zéro, et `v_claimed + 1` heurterait
-- la paire unique (user_id, cycle) d'une ancienne réclamation (« ok » sans rien insérer). Le
-- verrou consultatif par joueur sérialise toujours les doubles taps.
create or replace function public.claim_loyalty()
returns text -- 'ok' | 'not_yet' | 'error'
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_played int;
  v_claimed int;
  v_cycle int;
begin
  if v_uid is null then return 'error'; end if;
  perform pg_advisory_xact_lock(hashtext('loyalty:' || v_uid::text));
  select played, claimed into v_played, v_claimed from public.my_loyalty();
  if v_played / 10 <= v_claimed then return 'not_yet'; end if;
  select coalesce(max(lc.cycle), 0) + 1 into v_cycle from public.loyalty_claims lc where lc.user_id = v_uid;
  insert into public.loyalty_claims (user_id, cycle, code) values (v_uid, v_cycle, public.loyalty_new_code())
    on conflict (user_id, cycle) do nothing;
  return 'ok';
end;
$$;
revoke execute on function public.my_loyalty() from public, anon;
revoke execute on function public.claim_loyalty() from public, anon;
grant execute on function public.my_loyalty() to authenticated;
grant execute on function public.claim_loyalty() to authenticated;

-- ── 4) Décision 18 — Fiabilité ──────────────────────────────────────────────────
-- `public_reliability` (80) n'est PAS redéfinie : un cours reste dans la présence publique (T-3,
-- « restent dans la présence » — parties jouées comme absences).

-- Décision 18 : horodatage de l'annulation (toutes voies : joueur, delete_account, delete_club).
-- BEFORE UPDATE OF status + WHEN : ne coûte rien aux autres écritures.
create or replace function public.reservations_stamp_cancelled()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.cancelled_at := now();
  return new;
end;
$$;
revoke execute on function public.reservations_stamp_cancelled() from public, anon, authenticated;
drop trigger if exists reservations_stamp_cancelled on public.reservations;
create trigger reservations_stamp_cancelled
  before update of status on public.reservations
  for each row when (new.status = 'cancelled' and old.status is distinct from 'cancelled')
  execute function public.reservations_stamp_cancelled();

-- Badge du gérant (« N annulations · N absences » sur 14 j). Recopie STRICTE de la 29 (live)
-- hormis : (décision 18) une annulation ne compte que si elle a été faite à MOINS DE 24 H du
-- match — une annulation permise des jours avant ne marque plus un joueur « peu fiable » ;
-- celles d'avant la 98 (heure inconnue) et celles d'un club retiré ('club_deleted') ne comptent
-- pas. Les cours y restent (T-3 : un élève absent à ses cours reste signalé au club). Type inchangé.
create or replace function public.player_reliability(p_user_ids uuid[])
returns table (user_id uuid, cancelled int, no_show int)
language plpgsql
security definer
set search_path = public
as $$
declare
  cutoff bigint := (extract(epoch from now()) * 1000)::bigint - 14 * 86400000; -- il y a 14 jours (ms)
begin
  return query
    select r.user_id,
      count(*) filter (where r.status = 'cancelled' and r.starts_at >= cutoff
                         and r.cancelled_at is not null
                         and r.starts_at - (extract(epoch from r.cancelled_at) * 1000)::bigint < 24 * 3600000::bigint
                         and r.cancel_reason is distinct from 'club_deleted')::int,
      count(*) filter (where r.status = 'no_show' and r.starts_at >= cutoff)::int
    from public.reservations r
    join public.profiles me on me.id = auth.uid()
    where me.role in ('club', 'operator')
      and r.user_id = any (p_user_ids)
      and (me.role = 'operator' or r.club_id = me.managed_club_id) -- un club ne voit QUE son club
    group by r.user_id;
end;
$$;
revoke execute on function public.player_reliability(uuid[]) from public, anon;
grant execute on function public.player_reliability(uuid[]) to authenticated;

-- ── 5) Décision 7 — « Pas venu » sur un score validé ─────────────────────────────
-- Recopie STRICTE de la 96 hormis le bloc T-4 : un match dont le score est VALIDÉ — perdant en
-- miroir OU saisie unique gagnante restée 48 h — a été joué et noté : 'played' (avant, la voie
-- 48 h n'écrivait pas de level_history et le club effaçait la partie et les +3). Même règle que
-- fetch_my_match_scores / fetch_leaderboard (à modifier ENSEMBLE si elle change).
create or replace function public.mark_no_show(p_id uuid, p_value boolean default true)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare allowed boolean;
begin
  select exists (
    select 1
    from public.reservations r
    join public.profiles p on p.id = auth.uid()
    where r.id = p_id
      and ((p.role = 'club' and p.managed_club_id = r.club_id) or p.role = 'operator')
  ) into allowed;
  if not allowed then return 'forbidden'; end if;
  if p_value then
    -- R-21 : seulement entre le début du créneau et sa fin + 48 h.
    if not exists (
      select 1 from public.reservations r
      where r.id = p_id
        and r.starts_at <= (extract(epoch from now()) * 1000)::bigint
        and (extract(epoch from now()) * 1000)::bigint
            <= r.starts_at + coalesce(r.duration_min, 90) * 60000 + 48 * 3600000::bigint
    ) then
      return 'gone';
    end if;
    -- Score validé + niveau appliqué → ce match a été joué, pas un no-show (85 C6).
    if exists (select 1 from public.level_history lh where lh.reservation_id = p_id) then
      return 'played';
    end if;
    -- T-4 (décision 7) : score validé, y compris par la voie « saisie unique à 48 h ».
    if exists (
      select 1
        from (select count(*) as n,
                     count(*) filter (where mr.i_won) as w,
                     count(*) filter (where not mr.i_won) as l,
                     count(distinct mr.canon) as dc,
                     min(mr.created_at) as first_at
                from public.match_results mr where mr.reservation_id = p_id) a,
             lateral (select 1 + count(*) as pc from public.reservation_participants rp
                       where rp.reservation_id = p_id and rp.status = 'accepted') c
       where a.dc = 1 and (
               (a.n = 1 and a.w = 1 and a.first_at < now() - interval '48 hours')
               or (a.w >= 1 and a.w <= least(2, c.pc - 1) and a.l >= 1)
             )
    ) then
      return 'played';
    end if;
    update public.reservations set status = 'no_show' where id = p_id and status in ('booked', 'no_show');
    return case when found then 'ok' else 'gone' end;
  else
    -- Annule l'absence (repasse en réservé) — possible seulement si le créneau est resté libre.
    update public.reservations set status = 'booked' where id = p_id and status = 'no_show';
    return case when found then 'ok' else 'gone' end;
  end if;
exception when unique_violation or exclusion_violation or check_violation then
  -- Dé-marquage : le créneau a été repris entre-temps (contrainte d'exclusion GiST) → refus net.
  return 'taken';
end;
$$;
revoke execute on function public.mark_no_show(uuid, boolean) from public, anon;
grant execute on function public.mark_no_show(uuid, boolean) to authenticated;

-- ── 6) Décision 9 — Compte supprimé : les matchs passés des partenaires survivent ──
-- Modèle : la place du compte supprimé devient une place ANONYME — participation et saisie de
-- score gardées avec user_id NULL, entrée « x-… » nommée « Ancien joueur » dans `invited` (le
-- format d'un joueur sans compte : jamais « en attente », jamais notifié). Le décompte des joueurs
-- (validation du score, plafond de vainqueurs) reste donc celui du match joué.

-- Garde de disponibilité : recopie STRICTE de la 68 (live) hormis l'en-tête — un UPDATE qui ne
-- déplace PAS une résa déjà réservée (transfert de propriétaire, `invited`, confirmation club…)
-- n'est plus re-vérifié contre les fermetures et tournois posés APRÈS elle (refus à tort d'une
-- résa légitimement acceptée). Tout le reste repasse la garde : insertion, dé-marquage d'un
-- « pas venu » (no_show → booked), et un déplacement de créneau s'il en existait un.
create or replace function public.reservations_availability_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from 'booked' then
    return new; -- on ne garde que les créneaux réellement réservés
  end if;
  if tg_op = 'UPDATE' and old.status = 'booked'
     and (new.club_id, new.court, new.date_key, new."time", new.duration_min, new.starts_at)
         is not distinct from (old.club_id, old.court, old.date_key, old."time", old.duration_min, old.starts_at) then
    return new; -- résa déjà réservée, créneau inchangé
  end if;
  -- Créneau fermé hors app par le club (chevauchement d'intervalle sur ce terrain) ?
  if exists (
    select 1 from public.blocked_slots b
    where b.club_id = new.club_id and b.date_key = new.date_key and b.court = new.court
      and public.hhmm_to_min(b."time") is not null
      and public.hhmm_to_min(b."time") < public.hhmm_to_min(new."time") + new.duration_min
      and public.hhmm_to_min(new."time") < public.hhmm_to_min(b."time") + b.duration_min
  ) then
    raise exception 'slot blocked' using errcode = '23514';
  end if;
  -- Créneau réservé à un TOURNOI publié ? Chaque créneau tournoi i = [slots[i], +slot_durations[i])
  -- (défaut 90), comparé à la réservation [time, +duration_min).
  if exists (
    select 1 from public.competitions c
    where c.club_id = new.club_id
      and c.status = 'published'
      and new.date_key >= c.date_key
      and new.date_key <= coalesce(c.end_date_key, c.date_key)
      and (coalesce(array_length(c.courts, 1), 0) = 0 or new.court = any (c.courts))
      and (
        coalesce(array_length(c.slots, 1), 0) = 0 -- tournoi sans créneau précis = tout le jour
        or exists (
          select 1 from unnest(c.slots) with ordinality as s(t, i)
          where public.hhmm_to_min(s.t) is not null
            and public.hhmm_to_min(s.t) < public.hhmm_to_min(new."time") + new.duration_min
            and public.hhmm_to_min(new."time") < public.hhmm_to_min(s.t) + coalesce(c.slot_durations[s.i], 90)
        )
      )
  ) then
    raise exception 'slot reserved for tournament' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Recopie STRICTE de la 80 (live) hormis le décompte des joueurs : comptes identifiés SANS la
-- place anonyme (jamais `NULL = any(…)` dans la garde d'appartenance — un tiers y passerait :
-- `not (x = any(array[a, NULL]))` vaut NULL, donc « pas refusé »), plus une place par
-- participation anonyme acceptée. Sans compte supprimé, résultat identique à la 80.
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
  select id, user_id, status, starts_at, duration_min into v_res
    from public.reservations where id = p_reservation_id;
  if v_res.id is null or v_res.status <> 'booked' then return 'error'; end if;
  if v_res.starts_at + (v_res.duration_min * 60000) >= v_now then return 'error'; end if;
  select exists (select 1 from public.match_results where reservation_id = p_reservation_id)
    into v_has_prior;
  if v_res.starts_at < v_now - 14 * 86400000 and not v_has_prior then
    return 'error';
  end if;
  select array_agg(distinct t.uid) filter (where t.uid is not null) into v_players from (
    select v_res.user_id as uid
    union all
    select rp.user_id from public.reservation_participants rp
      where rp.reservation_id = p_reservation_id and rp.status = 'accepted'
  ) t;
  if not coalesce(v_uid = any (v_players), false) then return 'error'; end if;
  -- Décision 9 : la place d'un compte supprimé (participation anonyme) compte toujours.
  v_pc := coalesce(array_length(v_players, 1), 0)
          + (select count(*) from public.reservation_participants rp
              where rp.reservation_id = p_reservation_id and rp.status = 'accepted' and rp.user_id is null)::int;
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
revoke execute on function public.submit_match_score(uuid, jsonb) from public, anon;
grant execute on function public.submit_match_score(uuid, jsonb) to authenticated;

-- Recopie STRICTE de la 96 hormis : (décision 9) décompte des joueurs identique à
-- submit_match_score (place anonyme comptée, jamais NULL dans le tableau) et camps formés des
-- seules saisies NOMMÉES (une saisie anonyme valide le match mais ne bouge personne) ;
-- (décision 3) un cours n'ajuste jamais le niveau.
create or replace function public.apply_match_level(p_reservation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
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

  -- Résa réelle, encore 'booked' (un « pas venu » n'ajuste rien), match terminé.
  select id, user_id, status, starts_at, coalesce(duration_min, 90) as duration_min, coach_name into v_res
    from public.reservations where id = p_reservation_id;
  if v_res.id is null or v_res.status <> 'booked' then return false; end if;
  if v_res.starts_at + (v_res.duration_min * 60000) >= v_now then return false; end if;
  if coalesce(v_res.coach_name, '') <> '' then return false; end if; -- décision 3 : un cours

  -- Joueurs du match + plafond de vainqueurs — COPIE STRICTE de submit_match_score (à modifier
  -- ENSEMBLE si la règle change).
  select array_agg(distinct t.uid) filter (where t.uid is not null) into v_players from (
    select v_res.user_id as uid
    union all
    select rp.user_id from public.reservation_participants rp
      where rp.reservation_id = p_reservation_id and rp.status = 'accepted'
  ) t;
  v_pc := coalesce(array_length(v_players, 1), 0)
          + (select count(*) from public.reservation_participants rp
              where rp.reservation_id = p_reservation_id and rp.status = 'accepted' and rp.user_id is null)::int;
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

  -- Camps : seuls les ENTRANTS NOMMÉS bougent (les joueurs sans saisie n'ont pas de camp fiable ;
  -- une saisie anonyme — compte supprimé — n'a plus de niveau à ajuster).
  select coalesce(array_agg(user_id), '{}') into v_winners
    from public.match_results where reservation_id = p_reservation_id and i_won and user_id is not null;
  select coalesce(array_agg(user_id), '{}') into v_losers
    from public.match_results where reservation_id = p_reservation_id and not i_won and user_id is not null;

  -- R-03 : niveau d'AVANT le match (historique de CE match s'il existe) → delta figé du match.
  select avg(coalesce(lh.level_before, p.level)) into v_avg_win
    from public.profiles p
    left join public.level_history lh on lh.reservation_id = p_reservation_id and lh.user_id = p.id
    where p.id = any (v_winners);
  select avg(coalesce(lh.level_before, p.level)) into v_avg_opp
    from public.profiles p
    left join public.level_history lh on lh.reservation_id = p_reservation_id and lh.user_id = p.id
    where p.id = any (v_losers);
  -- delta = base 0.10 + 0.05 × (niveau adverse − niveau gagnant), borné [0.02, 0.30].
  v_delta := round(least(0.30, greatest(0.02,
               0.10 + 0.05 * (coalesce(v_avg_opp, coalesce(v_avg_win, 3)) - coalesce(v_avg_win, 3))
             ))::numeric, 2);

  -- Autorise l'écriture de `level` pour CETTE transaction (trigger protect_level, 34).
  perform set_config('padel.level_write', 'on', true);

  -- Gagnants : gain écrêté à +0.5 / 7 jours glissants. La ligne d'historique est TOUJOURS
  -- écrite (même à gain 0) : c'est elle qui marque le joueur comme ajusté pour ce match.
  foreach v_uid in array v_winners loop
    -- R-03 : déjà ajusté pour ce match → rien (idempotence par joueur).
    if exists (select 1 from public.level_history
               where reservation_id = p_reservation_id and user_id = v_uid) then
      continue;
    end if;
    select coalesce(sum(delta) filter (where delta > 0), 0) into v_week
      from public.level_history
      where user_id = v_uid and reason = 'match' and created_at > now() - interval '7 days';
    v_gain := least(v_delta, greatest(0, 0.5 - v_week));
    select level into v_before from public.profiles where id = v_uid for update;
    v_after := round(least(7, greatest(1, v_before + v_gain))::numeric, 2);
    insert into public.level_history (reservation_id, user_id, delta, level_before, level_after, reason)
      values (p_reservation_id, v_uid, v_after - v_before, v_before, v_after, 'match')
      on conflict do nothing;
    if not found then continue; end if; -- R-03 : niveau modifié seulement si la ligne est neuve
    update public.profiles set level = v_after where id = v_uid;
  end loop;

  -- Perdants : écrêtage SYMÉTRIQUE (−0,5 / 7 j glissants) — sans lui, un joueur fort pouvait
  -- se « sandbagger » à coups de défaites déclarées et entrer dans les fourchettes débutants (81).
  foreach v_uid in array v_losers loop
    if exists (select 1 from public.level_history
               where reservation_id = p_reservation_id and user_id = v_uid) then
      continue;
    end if;
    select coalesce(sum(-delta) filter (where delta < 0), 0) into v_week
      from public.level_history
      where user_id = v_uid and reason = 'match' and created_at > now() - interval '7 days';
    v_gain := least(v_delta, greatest(0, 0.5 - v_week)); -- ici v_gain = ampleur de la PERTE autorisée
    select level into v_before from public.profiles where id = v_uid for update;
    v_after := round(least(7, greatest(1, v_before - v_gain))::numeric, 2);
    insert into public.level_history (reservation_id, user_id, delta, level_before, level_after, reason)
      values (p_reservation_id, v_uid, v_after - v_before, v_before, v_after, 'match')
      on conflict do nothing;
    if not found then continue; end if;
    update public.profiles set level = v_after where id = v_uid;
  end loop;

  return true;
end;
$$;
-- Interne (appelée par submit_match_score et reconcile_my_levels) : fermée à tous, comme en live.
revoke execute on function public.apply_match_level(uuid) from public, anon, authenticated;

-- Recopie STRICTE de la 97 hormis le bloc « décision 9 », juste avant la cascade : jusqu'ici la
-- cascade effaçait les résas passées dont le compte était l'AUTEUR (ses partenaires perdaient la
-- partie, la victoire et les points) et ses participations / saisies (un 1v1 validé perdait son
-- 2ᵉ joueur, donc la victoire). Aucune donnée personnelle ne survit : nom, téléphone, lien Wave
-- et entrées nommées retirés ; seules restent des places anonymes. Finitions (tour 1) : téléphone
-- retiré de TOUS ses tournois (un gérant y laissait le sien), nom de coach neutre (« Coach ») sur
-- les cours de ses élèves, et une invitation jamais acceptée n'est pas une place confirmée.
-- Tour 2 : suppressions sérialisées par un verrou consultatif commun (interblocage de deux
-- partenaires croisés supprimant leur compte au même instant — prouvé à 2 sessions).
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
  v_rid uuid;
  v_heir uuid;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  -- R-58 : jamais le compte opérateur.
  if exists (select 1 from public.profiles p where p.id = uid and p.role = 'operator') then
    raise exception 'operator_account';
  end if;
  -- Suppressions de compte SÉRIALISÉES (tour 2) : deux partenaires croisés qui suppriment leur
  -- compte au même instant verrouillaient chacun la résa de l'autre (étape a) puis attendaient la
  -- sienne (étape c) → interblocage, une suppression échouait. Pris AVANT tout verrou de ligne ;
  -- les suppressions sont rares, les faire passer une à une ne coûte rien.
  perform pg_advisory_xact_lock(hashtext('delete_account'));
  -- Avatar (bucket public, hors cascade) — GUC storage (bug plateforme, cf. 83).
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects
    where bucket_id = 'avatars' and (storage.foldername(name))[1] = uid::text;
  perform set_config('storage.allow_delete_query', 'false', true);
  -- C2 : retirer ce compte des matchs ouverts des AUTRES (avant la cascade des participations).
  -- `players` RECALCULÉ depuis le tableau `invited` filtré (R1) — jamais un -1 aveugle.
  -- ⚠️ Un `UPDATE … FROM LATERAL (…)` ne peut PAS référencer la table CIBLE (`r`) → on passe par une
  -- table dérivée auto-jointe sur `id` (le LATERAL référence `r2`, qui est dans son propre FROM).
  -- Le `left join … on true` + `filter` rend `arr='[]'` même si `invited` est vide ou non-tableau.
  -- ⚠️ VERROU DE LIGNE D'ABORD (patron 73/M4) : la table dérivée `f` de l'UPDATE serait matérialisée
  -- sur le snapshot d'AVANT un « Rejoindre » concurrent, et EvalPlanQual ne re-évalue que la jointure
  -- (`r.id=f.id`), PAS `f.arr` → l'ajout concurrent serait écrasé (place fantôme). Le `for update`
  -- sérialise avec join_open_match/respond_invitation ; l'UPDATE suivant prend alors un snapshot
  -- READ COMMITTED frais après les verrous → `f.arr` inclut bien l'entrée du joiner.
  perform 1 from public.reservations r
    where r.status = 'booked' and r.starts_at > now_ms and r.user_id <> uid
      and exists (select 1 from public.reservation_participants rp
                  where rp.reservation_id = r.id and rp.user_id = uid)
    for update;
  update public.reservations r
    set invited = f.arr,
        players = greatest(1, 1 + jsonb_array_length(f.arr))
    from (
      select r2.id,
             coalesce(jsonb_agg(e) filter (where e ->> 'id' <> uid::text
                                             and e ->> 'id' <> 'open-' || uid::text), '[]'::jsonb) as arr
      from public.reservations r2
      left join lateral jsonb_array_elements(
        case when jsonb_typeof(r2.invited) = 'array' then r2.invited else '[]'::jsonb end) e on true
      where r2.status = 'booked' and r2.starts_at > now_ms and r2.user_id <> uid
        and exists (select 1 from public.reservation_participants rp
                    where rp.reservation_id = r2.id and rp.user_id = uid)
      group by r2.id
    ) f
    where r.id = f.id;
  -- R-07 : données personnelles hors cascade (tournois, support, demandes de club).
  delete from public.competitions
    where organizer_id = uid and organizer_type = 'joueur' and status in ('pending', 'rejected');
  update public.competitions
    set organizer_name = 'Compte supprimé', organizer_phone = null
    where organizer_id = uid and organizer_type = 'joueur';
  -- Tournois de club / PadelConnect : le nom affiché est celui du club, mais le téléphone est
  -- celui du compte qui l'a créé (organizerPhone = téléphone du profil) → retiré aussi.
  update public.competitions set organizer_phone = null
    where organizer_id = uid and organizer_phone is not null;
  update public.support_messages set name = null, contact_phone = null where user_id = uid;
  delete from public.club_requests where requested_by = uid and status in ('new', 'contacted');
  update public.club_requests set contact_phone = null where requested_by = uid;
  -- C8 + R-53 : coach supprimé → ses cours ACCEPTÉS à venir sont annulés SANS pénalité pour
  -- l'élève ('club_cancelled', motif « Coach indisponible », créneau NON re-bloqué donc libéré ;
  -- la lesson passe à 'cancelled' par le trigger 76, le carnet est rendu par le trigger 85), et
  -- ses demandes en attente refusées. Élève d'un cours INDIVIDUEL : la résa est à son nom, elle
  -- survit et le webhook `reservations` le prévient. Élèves d'un cours COLLECTIF : la résa est
  -- au nom du coach et part dans la cascade avec lesson_students → liste notée d'abord ici.
  delete from public.lesson_cancel_notices where created_at < now() - interval '7 days';
  insert into public.lesson_cancel_notices (reservation_id, user_id)
    select l.reservation_id, ls.user_id
      from public.lessons l
      join public.lesson_students ls on ls.lesson_id = l.id
      join public.reservations r on r.id = l.reservation_id
      where l.coach_id = uid and l.status = 'accepted' and coalesce(l.capacity, 1) > 1
        and r.status = 'booked' and r.starts_at > now_ms
    on conflict do nothing;
  update public.reservations
    set status = 'club_cancelled', cancel_reason = 'Coach indisponible'
    where status = 'booked' and starts_at > now_ms
      and id in (select l.reservation_id from public.lessons l
                 where l.coach_id = uid and l.status = 'accepted' and l.reservation_id is not null);
  update public.lessons set status = 'declined', responded_at = now()
    where coach_id = uid and status = 'pending';
  -- Nom du coach NEUTRE sur les cours de ses élèves (passés, ou annulés juste au-dessus — le push
  -- d'annulation est déjà parti avec son nom : chaque UPDATE porte son propre webhook). Jamais
  -- vide : `coach_name` non vide est ce qui fait d'une résa un COURS (décision 3). Les cours
  -- collectifs (résa au nom du coach) partent dans la cascade.
  update public.reservations set coach_name = 'Coach'
    where user_id <> uid and coalesce(coach_name, '') <> '' and coach_name <> 'Coach'
      and id in (select l.reservation_id from public.lessons l
                 where l.coach_id = uid and l.reservation_id is not null);
  -- Mes propres réservations À VENIR : annulées avant la cascade (webhook → club prévenu).
  update public.reservations
    set status = 'cancelled'
    where user_id = uid and status = 'booked' and starts_at > now_ms;
  -- Décision 9 (T-6 / R-30) : matchs PASSÉS des partenaires conservés, auteur anonymisé.
  -- Aucun push : ni statut ni confirmation ne changent (les webhooks ne réagissent qu'à eux).
  -- (a) Mon entrée dans `invited` des résas des AUTRES (toute date, tout statut — les matchs à
  --     venir ont déjà été nettoyés par C2) → place anonyme « Ancien joueur » (`players` inchangé),
  --     « confirmée » seulement si j'avais ACCEPTÉ (une invitation restée sans réponse ne devient
  --     pas une place confirmée qui n'a jamais existé).
  update public.reservations r
    set invited = (
      select coalesce(jsonb_agg(case when t.e ->> 'id' in (uid::text, 'open-' || uid::text)
                                     then jsonb_build_object('id', 'x-' || gen_random_uuid()::text,
                                                             'name', 'Ancien joueur',
                                                             'confirmed', exists (
                                                               select 1 from public.reservation_participants rp
                                                               where rp.reservation_id = r.id and rp.user_id = uid
                                                                 and rp.status = 'accepted'))
                                     else t.e end order by t.o), '[]'::jsonb)
        from jsonb_array_elements(r.invited) with ordinality as t(e, o))
    where r.user_id <> uid and jsonb_typeof(r.invited) = 'array'
      and (r.invited @> jsonb_build_array(jsonb_build_object('id', uid::text))
           or r.invited @> jsonb_build_array(jsonb_build_object('id', 'open-' || uid::text)));
  -- (b) Ma place ACCEPTÉE dans les matchs commencés des autres reste comptée, sans nom.
  update public.reservation_participants rp
    set user_id = null
    from public.reservations r
    where rp.user_id = uid and rp.status = 'accepted'
      and r.id = rp.reservation_id and r.user_id <> uid
      and r.status = 'booked' and r.starts_at <= now_ms;
  -- (c) Mes résas COMMENCÉES encore 'booked' (hors cours, décision 3) avec au moins un partenaire
  --     AVEC COMPTE ayant accepté → reprises par le plus ancien d'entre eux (`owner_deleted`,
  --     exclue de sa fidélité) ; sa participation devient ma place anonyme et son entrée dans
  --     `invited` devient « Ancien joueur » ; identité du réservant = la sienne (R-76), téléphone
  --     et lien Wave retirés. Sans partenaire avec compte : la résa part dans la cascade.
  for v_rid in
    select r.id from public.reservations r
      where r.user_id = uid and r.status = 'booked' and r.starts_at <= now_ms
        and coalesce(r.coach_name, '') = ''
      order by r.id
      for update
  loop
    -- Héritier choisi SOUS VERROU de sa ligne : un partenaire qui a supprimé son compte juste
    -- avant (suppressions sérialisées, verrou en tête) a déjà rendu sa place anonyme (étape b de
    -- SA suppression) → il est sauté au profit du suivant ; sinon la résa lui était transférée puis
    -- l'écriture échouait (clé étrangère vers un compte disparu) et toute la suppression avec elle.
    select rp.user_id into v_heir from public.reservation_participants rp
      where rp.reservation_id = v_rid and rp.status = 'accepted'
        and rp.user_id is not null and rp.user_id <> uid
      order by rp.created_at, rp.id
      limit 1
      for update;
    continue when v_heir is null;
    update public.reservation_participants set user_id = null
      where reservation_id = v_rid and user_id = v_heir;
    update public.reservations r
      set user_id = v_heir,
          owner_deleted = true,
          booked_by_name = (select nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
                              from public.profiles p where p.id = v_heir),
          booked_by_phone = null,
          wave_link = null,
          invited = case when jsonb_typeof(r.invited) = 'array' then (
            select coalesce(jsonb_agg(case when t.e ->> 'id' in (v_heir::text, 'open-' || v_heir::text)
                                           then jsonb_build_object('id', 'x-' || gen_random_uuid()::text,
                                                                   'name', 'Ancien joueur', 'confirmed', true)
                                           else t.e end order by t.o), '[]'::jsonb)
              from jsonb_array_elements(r.invited) with ordinality as t(e, o))
            else r.invited end
      where r.id = v_rid;
  end loop;
  -- (d) Mes saisies de score restent comptées sans nom (validation des matchs conservée) ; celles
  --     des résas qui partent dans la cascade disparaissent avec elles.
  update public.match_results set user_id = null where user_id = uid;
  -- Cascade ON DELETE : profil, réservations, participations, favoris, etc.
  delete from auth.users where id = uid;
end;
$$;
revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;

-- ── 7) Décision 14 — Frais d'un tournoi annulé ───────────────────────────────────
-- Recopie STRICTE de la 97 hormis T-12 :
--  • club hôte / opérateur : les frais PadelConnect dus sont ANNULÉS (payment_status
--    'cancelled') ; déjà encaissés, ils passent « à rembourser » ('refund_due' — notify-club
--    prévient l'opérateur, qui rembourse l'organisateur par Wave) ;
--  • organisateur seul (aucun inscrit) : refusé tant que des frais restent DUS ('fees', nouveau
--    code — sinon annuler effaçait une dette, comme delete_competition le refuse déjà). Il règle
--    les frais, ou le club annule.
-- Calcul du statut des frais IDENTIQUE dans delete_club (à modifier ENSEMBLE). L'auteur est noté
-- (`cancelled_by`) : notify-club ne lui renvoie pas son propre geste.
create or replace function public.cancel_competition(p_id uuid, p_reason text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 300), '');
  v_manager boolean;
begin
  if auth.uid() is null then return 'forbidden'; end if;
  perform pg_advisory_xact_lock(hashtext('reg:' || p_id::text));
  select id, organizer_id, club_id, status, date_key, end_date_key, commission, payment_status into c
    from public.competitions where id = p_id for update;
  if c.id is null then return 'gone'; end if;
  if c.status = 'closed' then return 'played'; end if;
  if c.status <> 'published' then return 'gone'; end if;
  v_manager := public.can_manage_club(c.club_id);
  if not v_manager then
    if not coalesce(c.organizer_id = auth.uid(), false) then return 'forbidden'; end if;
    if exists (select 1 from public.competition_registrations rg where rg.competition_id = p_id) then
      return 'forbidden';
    end if;
    -- T-12 : l'organisateur n'efface pas une dette en annulant.
    if coalesce(c.commission, 0) > 0 and coalesce(c.payment_status, 'unpaid') <> 'paid' then
      return 'fees';
    end if;
  end if;
  if coalesce(nullif(c.end_date_key, ''), c.date_key) < to_char((now() at time zone 'utc')::date, 'YYYY-MM-DD') then
    return 'played';
  end if;
  if v_reason is null then return 'reason'; end if;
  update public.competitions
    set status = 'cancelled', cancel_reason = v_reason, cancelled_by = auth.uid(),
        -- T-12 : annulation par le club / l'opérateur → frais annulés (ou à rembourser).
        payment_status = case when not v_manager or coalesce(commission, 0) <= 0 then payment_status
                              when payment_status = 'paid' then 'refund_due' else 'cancelled' end
    where id = p_id and status = 'published';
  return case when found then 'ok' else 'gone' end;
end;
$$;
revoke execute on function public.cancel_competition(uuid, text) from public, anon;
grant execute on function public.cancel_competition(uuid, text) to authenticated;

-- Recopie STRICTE de la 97 hormis T-12 dans l'annulation des tournois publiés (club retiré par
-- l'OPÉRATEUR = frais annulés, même calcul que cancel_competition ; auteur noté).
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
  if not exists (select 1 from public.clubs c where c.id = p_id) then
    return false; -- R-60 : club inconnu de la table (fondateur ou identifiant forgé)
  end if;
  delete from public.club_config where club_id = p_id;
  delete from public.club_overrides where club_id = p_id;
  delete from public.club_status where club_id = p_id;
  delete from public.club_commission where club_id = p_id;
  delete from public.club_boost where club_id = p_id;
  delete from public.blocked_slots where club_id = p_id;
  delete from public.blocked_ranges where club_id = p_id;
  delete from public.club_passes where club_id = p_id;
  delete from public.club_news where club_id = p_id;
  delete from public.club_followers where club_id = p_id;
  delete from public.slot_waitlist where club_id = p_id;
  delete from public.reviews where club_id = p_id;
  -- R-42 : tournois publiés à venir ou en cours → ANNULÉS (prévenus) ; R4 : les autres non
  -- clôturés (en attente, refusés, publiés déjà terminés) supprimés comme avant ; les clôturés
  -- survivent pour le palmarès.
  update public.competitions
    set status = 'cancelled', cancel_reason = 'Club retiré de PadelConnect', cancelled_by = auth.uid(),
        -- T-12 : annulation par l'opérateur → frais annulés (ou à rembourser).
        payment_status = case when coalesce(commission, 0) <= 0 then payment_status
                              when payment_status = 'paid' then 'refund_due' else 'cancelled' end
    where club_id = p_id and status = 'published'
      and coalesce(nullif(end_date_key, ''), date_key) >= to_char((now() at time zone 'utc')::date, 'YYYY-MM-DD');
  delete from public.competitions where club_id = p_id and status in ('pending', 'published', 'rejected');
  update public.reservations set status = 'cancelled', cancel_reason = 'club_deleted'
    where club_id = p_id and status = 'booked' and starts_at > (extract(epoch from now()) * 1000)::bigint;
  update public.coaches set active = false where club_id = p_id;
  update public.lessons set status = 'declined', responded_at = now()
    where club_id = p_id and status = 'pending';
  delete from public.manager_clubs where club_id = p_id;
  update public.profiles p
    set managed_club_id = (select mc.club_id from public.manager_clubs mc where mc.user_id = p.id order by mc.created_at limit 1)
    where p.managed_club_id = p_id;
  update public.profiles p
    set role = 'player', managed_club_id = null
    where p.managed_club_id is null and p.role = 'club'
      and not exists (select 1 from public.manager_clubs mc where mc.user_id = p.id);
  -- Storage (bug plateforme storage.protect_delete, cf. 83) : GUC officiel le temps du delete.
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where bucket_id = 'club-photos' and (storage.foldername(name))[1] = p_id;
  perform set_config('storage.allow_delete_query', 'false', true);
  delete from public.clubs where id = p_id;
  return true;
end;
$$;
revoke execute on function public.delete_club(text) from public, anon;
grant execute on function public.delete_club(text) to authenticated;

-- Recopie STRICTE de la 97 hormis T-12 (tour 2) : un tournoi ANNULÉ dont les frais sont « à
-- rembourser » ne se supprime plus — ni par l'organisateur ni par le gérant —, sinon la dette de
-- PadelConnect sortait de operator_refunds_due par un appel forgé (aucun bouton dans l'app :
-- fetch_competitions masque les tournois annulés). Supprimable de nouveau une fois 'refunded'.
-- (tour 3) Verrou 'reg:' + ligne relue `for update` AVANT les gardes, patron de cancel_competition :
-- sans eux, un « Supprimer » concurrent d'un « Annuler » du club (refund_due) ou d'une inscription
-- (register_competition) jugeait l'état d'AVANT et effaçait la créance ou l'inscrit sans prévenir.
create or replace function public.delete_competition(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_owner uuid;
  v_club text;
begin
  perform pg_advisory_xact_lock(hashtext('reg:' || p_id::text));
  select id, organizer_id, club_id into v_id, v_owner, v_club from public.competitions where id = p_id for update;
  if v_id is null then return false; end if;
  if not (coalesce(v_owner = auth.uid(), false) or public.can_manage_club(v_club)) then return false; end if;
  if exists (select 1 from public.competitions c where c.id = p_id and c.status = 'closed' and c.official) then
    return false; -- le palmarès (niveau attribué, points) s'appuie dessus
  end if;
  -- T-12 : frais encaissés d'un tournoi annulé, pas encore remboursés → la créance reste visible.
  if exists (select 1 from public.competitions c
              where c.id = p_id and c.status = 'cancelled' and c.payment_status = 'refund_due') then
    return false;
  end if;
  -- Un tournoi PUBLIÉ (validé par le club) avec des INSCRITS ou des frais opérateur DUS ne peut plus
  -- être supprimé par l'ORGANISATEUR seul (audit 2026-07-11) : les équipes inscrites perdraient le
  -- tournoi SANS notification (pas de webhook DELETE) et la carte « Frais à encaisser » de l'opérateur
  -- disparaîtrait. Ce cas reste réservé au club / à l'opérateur (can_manage_club), qui préviennent.
  if v_owner = auth.uid() and not public.can_manage_club(v_club)
     and exists (select 1 from public.competitions c where c.id = p_id and c.status = 'published')
     and (
       exists (select 1 from public.competition_registrations cr where cr.competition_id = p_id)
       or exists (select 1 from public.competitions c where c.id = p_id
                    and coalesce(c.commission, 0) > 0 and coalesce(c.payment_status, 'unpaid') <> 'paid')
     ) then
    return false;
  end if;
  delete from public.competitions where id = p_id;
  return true;
end;
$$;
revoke execute on function public.delete_competition(uuid) from public, anon;
grant execute on function public.delete_competition(uuid) to authenticated;

-- « Paiement reçu » : recopie STRICTE de la 58 hormis la garde (décision 14) — un opérateur dont
-- la liste « à encaisser » est périmée ne peut plus marquer « payé » un tournoi annulé entre-temps :
-- depuis 'cancelled' (frais annulés) la créance ressusciterait, depuis 'refund_due' l'obligation de
-- remboursement serait effacée. Retour inchangé (false = refus, l'app relit la liste).
create or replace function public.operator_confirm_tournament_payment(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'operator') then
    return false;
  end if;
  update public.competitions set payment_status = 'paid'
    where id = p_id and status <> 'cancelled' and coalesce(payment_status, 'unpaid') in ('unpaid', 'paid');
  return found;
end;
$$;
revoke execute on function public.operator_confirm_tournament_payment(uuid) from public, anon;
grant execute on function public.operator_confirm_tournament_payment(uuid) to authenticated;

-- Frais « à rembourser » (NOUVELLES) : fetch_competitions ne renvoie jamais un tournoi annulé (la
-- v1.0.2 ne connaît pas ce statut) — sans cette lecture, la dette de PadelConnect envers
-- l'organisateur ne vivait que dans un push (absent sur le web, sans rattrapage). L'opérateur
-- liste les tournois annulés aux frais déjà encaissés, rembourse par Wave, puis les solde.
-- Opérateur seul (sinon aucune ligne / false).
create or replace function public.operator_refunds_due()
returns table (id uuid, title text, club_name text, organizer_name text, organizer_phone text,
               commission integer, cancel_reason text, date_key text)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.title, c.club_name, c.organizer_name, c.organizer_phone,
         c.commission, c.cancel_reason, c.date_key
    from public.competitions c
   where c.status = 'cancelled' and c.payment_status = 'refund_due'
     and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'operator')
   order by c.date_key, c.id
   limit 200;
$$;
revoke execute on function public.operator_refunds_due() from public, anon;
grant execute on function public.operator_refunds_due() to authenticated;

-- « Remboursé ✓ » : 'refund_due' → 'refunded' (et seulement depuis 'refund_due' : jamais une
-- créance ordinaire soldée par erreur). false = refus (pas opérateur, déjà soldé) — l'app relit.
create or replace function public.operator_mark_refunded(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'operator') then
    return false;
  end if;
  update public.competitions set payment_status = 'refunded'
    where id = p_id and status = 'cancelled' and payment_status = 'refund_due';
  return found;
end;
$$;
revoke execute on function public.operator_mark_refunded(uuid) from public, anon;
grant execute on function public.operator_mark_refunded(uuid) to authenticated;

-- ── 8) Décision 17 — Push « actus et agenda » désactivables ──────────────────────
-- Écrit MA préférence (colonne posée plus haut, activée par défaut). La lecture se fait sur mon
-- profil (RLS profiles_select_own), comme `match_alerts`. true = enregistré ; false = refus
-- (non connecté, valeur absente). notify-club v50 ne diffuse actus et agenda qu'aux comptes
-- `news_push = true`.
create or replace function public.set_news_push(p_on boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or p_on is null then return false; end if;
  update public.profiles set news_push = p_on where id = auth.uid();
  return found;
end;
$$;
revoke execute on function public.set_news_push(boolean) from public, anon;
grant execute on function public.set_news_push(boolean) to authenticated;

-- ── 9) Finitions de l'audit ──────────────────────────────────────────────────────
-- R-80 : `search_path` figé sur les 8 fonctions qui ne l'avaient pas (conseiller de sécurité
-- Supabase « function_search_path_mutable », qui signale TOUTE fonction, pure comprise) : 4 trigger
-- (34, 40, 51, 31) et 4 fonctions SQL pures (67, 68, 69/71). Corps inchangés — ils n'appellent que
-- le catalogue. phone10 porte l'index unique profiles_phone10_uniq : le SET ne change ni les
-- valeurs ni la validité de l'index (il empêche seulement l'inlining de la fonction).
alter function public.protect_level() set search_path = public;
alter function public.reservations_price_guard() set search_path = public;
alter function public.strip_open_match_phone() set search_path = public;
alter function public.support_stamp_resolved() set search_path = public;
alter function public.phone10(text) set search_path = public;
alter function public.hhmm_to_min(text) set search_path = public;
alter function public.durations_60_90(integer[]) set search_path = public;
alter function public.min_to_hhmm(integer) set search_path = public;

-- R-16 · rattrapage REJOUÉ (recopie STRICTE du bloc de la 96) : collé avant la 98, il laissait
-- « (en attente) » les acceptations des résas en conflit avec une fermeture posée APRÈS elles
-- (check_violation de l'ancienne garde de disponibilité). La garde de la 98 (section 6) laisse
-- passer un UPDATE qui ne déplace pas le créneau → ces entrées sont reprises ici. Idempotent.
do $$
declare
  r record;
begin
  for r in
    select res.id from public.reservations res
     where res.status = 'booked' and jsonb_typeof(res.invited) = 'array'
       and res.starts_at > (extract(epoch from now()) * 1000)::bigint - 86400000
       and exists (select 1
                     from public.reservation_participants rp
                     join jsonb_array_elements(res.invited) x on x ->> 'id' = rp.user_id::text
                    where rp.reservation_id = res.id and rp.status = 'accepted'
                      and not coalesce(x -> 'confirmed' = 'true'::jsonb, false))
  loop
    begin
      update public.reservations res
        set invited = (
          select coalesce(jsonb_agg(case when exists (select 1 from public.reservation_participants rp
                                                       where rp.reservation_id = res.id and rp.status = 'accepted'
                                                         and rp.user_id::text = t.e ->> 'id')
                                         then jsonb_set(t.e, '{confirmed}', 'true'::jsonb)
                                         else t.e end order by t.o), '[]'::jsonb)
            from jsonb_array_elements(res.invited) with ordinality as t(e, o))
        where res.id = r.id;
    exception when check_violation then
      raise notice 'R-16 : réservation % laissée telle quelle (créneau en conflit)', r.id;
    end;
  end loop;
end $$;

-- R-52 · rattrapage des blocages ANTÉRIEURS à la 96 : block_user (96) retire les invitations en
-- attente croisées au moment du blocage, mais une paire bloquée sous la 91 garde les siennes —
-- respond_invitation les refuse désormais, et l'invité les voyait « à confirmer » jusqu'au match.
-- Recopie STRICTE de la boucle de block_user (96), sur TOUTES les paires bloquées : verrou de ligne,
-- puis `invited` / `players` recalculés (un « Rejoindre » concurrent n'est jamais écrasé). Placé
-- APRÈS la garde de la 98 (section 6) : l'UPDATE ne déplace pas le créneau. Un blocage dans les
-- deux sens donne deux lignes : la seconde ne supprime rien (`if found`). Idempotent.
do $$
declare
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
  v_rid uuid;
  v_guest uuid;
  v_new jsonb;
begin
  for v_rid, v_guest in
    select r.id, rp.user_id
      from public.reservations r
      join public.reservation_participants rp on rp.reservation_id = r.id and rp.status = 'invited'
      join public.blocked_users b
        on (b.blocker_id = r.user_id and b.blocked_id = rp.user_id)
        or (b.blocker_id = rp.user_id and b.blocked_id = r.user_id)
      where r.starts_at > v_now
      order by r.id
  loop
    perform 1 from public.reservations where id = v_rid for update;
    delete from public.reservation_participants
      where reservation_id = v_rid and user_id = v_guest and status = 'invited';
    if found then
      select coalesce(jsonb_agg(e), '[]'::jsonb) into v_new
        from jsonb_array_elements(
          (select case when jsonb_typeof(invited) = 'array' then invited else '[]'::jsonb end
             from public.reservations where id = v_rid)) e
        where e ->> 'id' <> v_guest::text and e ->> 'id' <> 'open-' || v_guest::text;
      update public.reservations
        set invited = v_new, players = greatest(1, 1 + jsonb_array_length(v_new))
        where id = v_rid;
    end if;
  end loop;
end $$;
