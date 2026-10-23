-- 97 — Règles métier : tournois, clubs, comptes (audit des règles métier 2026-10-22, lot M2 —
-- seconde moitié).
-- À coller dans Supabase → SQL Editor → Run APRÈS la 96. Idempotente, mais APRÈS la 98 elle ne se
-- recolle jamais seule : elle passe SANS ERREUR et efface en silence les décisions 9 et 14
-- (cancel_competition, delete_club, delete_account redeviennent ceux de la 97) — toujours
-- recoller ENSUITE la 98.
--
-- Chaque fonction est une recopie STRICTE de sa définition LIVE (dump du 2026-10-21 — aucune
-- n'est redéfinie par les 92 à 96) hormis le bloc commenté « R-n ». Signatures et types de retour
-- appelés par la v1.0.2 INCHANGÉS ; les nouveaux codes passent par de NOUVELLES fonctions.
--
--  1) R-05 — statut 'cancelled' + motif, RPC cancel_competition (NOUVELLE) ; fetch_competitions
--     ne renvoie JAMAIS un tournoi annulé (la v1.0.2 ne connaît pas ce statut).
--  2) R-04 · R-31 · R-38 — close_competition : tournoi orphelin clôturable par le club,
--     clôture refusée avant la fin, ±0,50 / −0,25 inscrits dans l'historique de niveau.
--  3) R-04 — delete_competition : tournoi orphelin supprimable par le club / l'opérateur.
--  4) R-36 · R-39 — validation refusée pour une date passée ; jamais de tournoi créé pour
--     aujourd'hui (garde serveur, toutes voies).
--  5) R-40 — upsert_club_config refuse de retirer un terrain d'un tournoi publié à venir.
--  6) R-43 · R-06 — block_recurring n'écrase plus rien (`taken`) ; unblock_recurring (NOUVELLE).
--  7) R-07 · R-53 · R-58 — delete_account : données personnelles anonymisées, cours d'un coach
--     supprimé annulés sans pénalité ET élèves prévenus, compte opérateur protégé.
--  8) R-42 · R-60 — delete_club : tournois publiés annulés (push), résas marquées, id inconnu refusé.
--  9) R-55 · R-58 — approve_club_request / grant / revoke : demandeur supprimé ou jamais confirmé
--     refusé ; la cible « opérateur » renvoie la sentinelle '__operator__' sans rien écrire.
-- 10) R-68 — operator_unconfirm_tournament_payment (NOUVELLE) : « Paiement reçu » réversible.
-- 11) R-77 — club_requests : statuts bornés, une demande ne naît que 'new'.
-- Hors périmètre (décisions du porteur en attente) : frais d'un tournoi annulé (T-12) — les
-- colonnes commission / payment_status d'un tournoi annulé restent INTACTES.

-- ── 1) R-05 — Tournoi ANNULÉ ─────────────────────────────────────────────────────
alter table public.competitions add column if not exists cancel_reason text;
alter table public.competitions drop constraint if exists competitions_status_check;
alter table public.competitions add constraint competitions_status_check
  check (status = any (array['pending', 'published', 'closed', 'rejected', 'cancelled']));

-- 'ok' | 'gone' (introuvable, pas publié) | 'forbidden' | 'played' (clôturé ou déjà terminé) |
-- 'reason' (motif vide). Club hôte et opérateur : toujours (tournoi orphelin compris). Organisateur
-- seul : seulement tant que PERSONNE n'est inscrit. Le jour même reste possible (pluie). Les
-- inscriptions sont CONSERVÉES (notify-club prévient les inscrits et l'organisateur) ; les
-- terrains sont libérés d'office (toutes les gardes ne lisent que les tournois 'published').
-- Verrou 'reg:' partagé avec register_competition : aucune inscription ne se glisse entre la
-- vérification « aucun inscrit » et l'annulation.
create or replace function public.cancel_competition(p_id uuid, p_reason text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 300), '');
begin
  if auth.uid() is null then return 'forbidden'; end if;
  perform pg_advisory_xact_lock(hashtext('reg:' || p_id::text));
  select id, organizer_id, club_id, status, date_key, end_date_key into c
    from public.competitions where id = p_id for update;
  if c.id is null then return 'gone'; end if;
  if c.status = 'closed' then return 'played'; end if;
  if c.status <> 'published' then return 'gone'; end if;
  if not public.can_manage_club(c.club_id) then
    if not coalesce(c.organizer_id = auth.uid(), false) then return 'forbidden'; end if;
    if exists (select 1 from public.competition_registrations rg where rg.competition_id = p_id) then
      return 'forbidden';
    end if;
  end if;
  if coalesce(nullif(c.end_date_key, ''), c.date_key) < to_char((now() at time zone 'utc')::date, 'YYYY-MM-DD') then
    return 'played';
  end if;
  if v_reason is null then return 'reason'; end if;
  update public.competitions
    set status = 'cancelled', cancel_reason = v_reason
    where id = p_id and status = 'published';
  return case when found then 'ok' else 'gone' end;
end;
$$;
revoke execute on function public.cancel_competition(uuid, text) from public, anon;
grant execute on function public.cancel_competition(uuid, text) to authenticated;

-- Recopie STRICTE de la 83 (live) hormis `c.status <> 'cancelled'` en tête du filtre : la v1.0.2
-- ne connaît pas ce statut (elle l'afficherait comme un tournoi à venir). Organisateur, inscrits
-- et club l'apprennent par le push d'annulation ; le tournoi disparaît de leurs listes.
create or replace function public.fetch_competitions()
returns table(id uuid, organizer_id uuid, organizer_type text, organizer_name text, organizer_phone text, club_id text, club_name text, title text, format text, level text, date_key text, end_date_key text, courts text[], slots text[], capacity integer, fee text, reward text, official boolean, status text, commission integer, winner text, second text, third text, loser text, registered integer, teams text[], reject_reason text, payment_status text, wave_link text, slot_durations integer[], americano jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.organizer_id, c.organizer_type, c.organizer_name,
    case when c.organizer_id = auth.uid()
              or public.can_manage_club(c.club_id)
              or exists (select 1 from public.competition_registrations r
                           where r.competition_id = c.id and r.user_id = auth.uid())
         then c.organizer_phone else null end,
    c.club_id, c.club_name, c.title, c.format, c.level,
    c.date_key, c.end_date_key, c.courts, c.slots,
    c.capacity, c.fee, c.reward, c.official, c.status, c.commission,
    c.winner, c.second, c.third, c.loser,
    (select count(*) from public.competition_registrations r where r.competition_id = c.id)::int,
    (select coalesce(array_agg(trim(coalesce(pr.first_name, '') || ' & ' || rg.partner) order by rg.created_at), '{}')
       from public.competition_registrations rg
       join public.profiles pr on pr.id = rg.user_id
       where rg.competition_id = c.id),
    c.reject_reason,
    c.payment_status,
    (select tc.wave_link from public.tournament_config tc where tc.id = true),
    c.slot_durations,
    c.americano
  from public.competitions c
  where c.status <> 'cancelled'
    and (c.status in ('published', 'closed')
      or c.organizer_id = auth.uid()
      or public.can_manage_club(c.club_id));
$$;
revoke execute on function public.fetch_competitions() from public, anon;
grant execute on function public.fetch_competitions() to authenticated;

-- ── 2) R-04 · R-31 · R-38 — Clôture d'un tournoi ─────────────────────────────────
-- Recopie STRICTE de la 59 (live) hormis :
--  • R-04 : en-tête sur l'ID — un tournoi dont l'organisateur a supprimé son compte
--    (organizer_id NULL) restait « réessaie » à vie ; le club hôte / l'opérateur le clôturent.
--    ⚠️ Jamais un simple `v_owner is null` : il laisserait passer tout compte.
--  • R-38 : refus tant que la fin n'est pas STRICTEMENT passée (miroir exact de isCompFinished :
--    jour de fin < aujourd'hui UTC = Abidjan) — plus de niveau attribué avant la date.
--  • R-31 : les ±0,50 / −0,25 d'un tournoi officiel sont inscrits dans level_history
--    (reservation_id NULL, reason 'tournament'), seulement si le niveau a réellement bougé
--    (borne 1 / 7) — « Évolution du niveau » les montre enfin. Pas de rattrapage du passé.
create or replace function public.close_competition(p_id uuid, p_winner text, p_second text, p_third text, p_loser text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_owner uuid;
  v_club text;
  v_official boolean;
  v_date text;
  v_end text;
  v_winner text := nullif(trim(coalesce(p_winner, '')), '');
  v_loser text := nullif(trim(coalesce(p_loser, '')), '');
  v_winner_n int;
  v_loser_n int;
  v_uid uuid;
  v_before numeric;
  v_after numeric;
begin
  select id, organizer_id, club_id, official, date_key, end_date_key
    into v_id, v_owner, v_club, v_official, v_date, v_end
    from public.competitions where id = p_id and status = 'published';
  if v_id is null then return false; end if;
  if not (coalesce(v_owner = auth.uid(), false) or public.can_manage_club(v_club)) then return false; end if;
  -- R-38 : jour de fin strictement passé.
  if coalesce(nullif(v_end, ''), v_date) >= to_char((now() at time zone 'utc')::date, 'YYYY-MM-DD') then
    return false;
  end if;
  update public.competitions
    set status = 'closed',
        winner = v_winner,
        second = nullif(trim(coalesce(p_second, '')), ''),
        third = nullif(trim(coalesce(p_third, '')), ''),
        loser = v_loser,
        closed_at = now()
    where id = p_id and status = 'published';
  if not found then return false; end if; -- déjà clôturé par une transaction concurrente

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
        select rg.user_id, coalesce(pr.level, 3) into v_uid, v_before
          from public.competition_registrations rg
          join public.profiles pr on pr.id = rg.user_id
          where rg.competition_id = p_id
            and trim(coalesce(pr.first_name, '') || ' & ' || rg.partner) = v_winner
          for update of pr;
        v_after := least(7, greatest(1, v_before + 0.5));
        update public.profiles set level = v_after where id = v_uid;
        -- R-31 : trace dans l'historique (seulement si le niveau a bougé).
        if v_after <> v_before then
          insert into public.level_history (reservation_id, user_id, delta, level_before, level_after, reason)
            values (null, v_uid, v_after - v_before, v_before, v_after, 'tournament');
        end if;
        -- Vainqueur ANCRÉ une fois pour toutes (même règle d'unicité que le niveau) :
        -- le classement (fetch_leaderboard) compte sur cet id, jamais sur la chaîne.
        update public.competitions c set winner_user_id = v_uid where c.id = p_id;
      end if;
    end if;
    if v_loser is not null then
      select count(*) into v_loser_n
        from public.competition_registrations rg
        join public.profiles pr on pr.id = rg.user_id
        where rg.competition_id = p_id
          and trim(coalesce(pr.first_name, '') || ' & ' || rg.partner) = v_loser;
      if v_loser_n = 1 then
        select rg.user_id, coalesce(pr.level, 3) into v_uid, v_before
          from public.competition_registrations rg
          join public.profiles pr on pr.id = rg.user_id
          where rg.competition_id = p_id
            and trim(coalesce(pr.first_name, '') || ' & ' || rg.partner) = v_loser
          for update of pr;
        v_after := least(7, greatest(1, v_before - 0.25));
        update public.profiles set level = v_after where id = v_uid;
        if v_after <> v_before then
          insert into public.level_history (reservation_id, user_id, delta, level_before, level_after, reason)
            values (null, v_uid, v_after - v_before, v_before, v_after, 'tournament');
        end if;
      end if;
    end if;
  end if;
  return true;
end;
$$;
revoke execute on function public.close_competition(uuid, text, text, text, text) from public, anon;
grant execute on function public.close_competition(uuid, text, text, text, text) to authenticated;

-- ── 3) R-04 — Suppression d'un tournoi orphelin ──────────────────────────────────
-- Recopie STRICTE de la 73 (live) hormis l'en-tête sur l'ID (même motif que close_competition).
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
  select id, organizer_id, club_id into v_id, v_owner, v_club from public.competitions where id = p_id;
  if v_id is null then return false; end if;
  if not (coalesce(v_owner = auth.uid(), false) or public.can_manage_club(v_club)) then return false; end if;
  if exists (select 1 from public.competitions c where c.id = p_id and c.status = 'closed' and c.official) then
    return false; -- le palmarès (niveau attribué, points) s'appuie dessus
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

-- ── 4) R-36 · R-39 — Dates des tournois ──────────────────────────────────────────
-- Recopie STRICTE de la 59 (live) hormis R-36 : une demande dont le 1ᵉʳ jour est AUJOURD'HUI
-- ou passé ne se valide plus (publiée, elle aurait dû des frais pour un tournoi jamais joué).
-- Le club la refuse avec un motif. Type inchangé (boolean).
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
  v_durs int[];
  d int;
begin
  select club_id, date_key, end_date_key, slots, courts, slot_durations
    into v_club, v_date, v_end, v_slots, v_courts, v_durs
    from public.competitions where id = p_id and status = 'pending';
  if v_club is null then return false; end if;
  if not public.can_manage_club(v_club) then return false; end if;
  -- Dates validées (car ::date dans le verrou multi-jours).
  if v_date !~ '^\d{4}-\d{2}-\d{2}$'
     or (nullif(v_end, '') is not null and v_end !~ '^\d{4}-\d{2}-\d{2}$') then
    return false;
  end if;
  begin
    perform v_date::date, coalesce(nullif(v_end, ''), v_date)::date;
  exception when others then return false; end;
  -- R-36 : jamais le jour même ni une date passée.
  if v_date::date <= (now() at time zone 'utc')::date then return false; end if;
  -- Verrou sur CHAQUE jour de la plage (fix §9.1).
  for d in 0 .. (coalesce(nullif(v_end, ''), v_date)::date - v_date::date) loop
    perform pg_advisory_xact_lock(hashtext(v_club || ':' || to_char(v_date::date + d, 'YYYY-MM-DD')));
  end loop;
  if public.competition_slot_conflict(v_club, v_date, v_end, coalesce(v_slots, '{}'), coalesce(v_courts, '{}'), coalesce(v_durs, '{}'), p_id) then
    return false;
  end if;
  update public.competitions set status = 'published' where id = p_id and status = 'pending';
  return true;
end;
$$;
revoke execute on function public.approve_competition(uuid) from public, anon;
grant execute on function public.approve_competition(uuid) to authenticated;

-- Recopie STRICTE de la 73 (live) hormis R-39 : le 1ᵉʳ jour doit être au plus tôt DEMAIN (UTC =
-- Abidjan) — décision porteur « jamais le jour même », jusqu'ici tenue par l'app seule. Le trigger
-- est BEFORE INSERT : il couvre TOUTES les voies de création (joueur, club, opérateur, appel forgé)
-- et ne touche jamais un tournoi existant.
create or replace function public.competitions_date_range_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_start date;
  v_end date;
begin
  -- date_key doit être une VRAIE date (un cast, pas juste un regex : « 9999-99-99 » passe le regex
  -- mais n'est pas une date).
  if new.date_key is null then
    raise exception 'Tournoi : date de début manquante.' using errcode = '22007';
  end if;
  begin
    v_start := new.date_key::date;
  exception when others then
    raise exception 'Tournoi : date de début invalide (%).', new.date_key using errcode = '22007';
  end;
  -- R-39 : jamais un tournoi pour aujourd'hui ni pour une date passée.
  if v_start <= (now() at time zone 'utc')::date then
    raise exception 'Tournoi : la date de début doit être au plus tôt demain.' using errcode = '22007';
  end if;
  if new.end_date_key is not null and new.end_date_key <> '' then
    begin
      v_end := new.end_date_key::date;
    exception when others then
      raise exception 'Tournoi : date de fin invalide (%).', new.end_date_key using errcode = '22007';
    end;
    -- Bornes ANTI-DoS : fin ≥ début ET ÉTENDUE ≤ 366 jours. C'est l'ÉTENDUE (end − start) qui borne
    -- la boucle `for d in 0 .. (end − start)` d'approve_competition — borner seulement `end ≤ now+366`
    -- laissait passer un `date_key` ancien forgé (ex. 0001-01-01 → fin proche) = des centaines de
    -- milliers de pg_advisory_xact_lock à la validation. Un tournoi de +366 j n'a aucun sens métier.
    if v_end < v_start or (v_end - v_start) > 366 then
      raise exception 'Tournoi : plage de dates invalide (fin avant début, ou étendue > 366 jours).'
        using errcode = '22007';
    end if;
  end if;
  return new;
end;
$$;

-- ── 5) R-40 — Terrain retiré sous un tournoi publié ──────────────────────────────
-- Recopie STRICTE de la 74 (live) hormis le bloc R-40, juste après la garde 72 (même verrou club) :
-- retirer ou renommer un terrain qu'un tournoi PUBLIÉ encore à venir (ou en cours) utilise est
-- refusé — le terrain renommé redevenait réservable pendant le tournoi. Un tournoi sur « tous les
-- terrains » (courts vide) n'est pas concerné.
create or replace function public.upsert_club_config(p_club_id text, p_slots text[] default null::text[], p_courts text[] default null::text[], p_offers jsonb default null::jsonb, p_coaches jsonb default null::jsonb, p_photos text[] default null::text[], p_cover_url text default null::text, p_court_photos jsonb default null::jsonb, p_court_closed jsonb default null::jsonb, p_court_slots jsonb default null::jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode text := 'preserve';      -- preserve | clear | set
  v_eff_slots text[] := '{}';     -- miroir slots dérivé (mode 'set')
  v_eff_closed jsonb := '{}'::jsonb; -- fermetures PAR TERRAIN projetées (mode 'set') → survivent au 'clear'
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
  v_open int;                     -- bornes de la grille réelle (union des terrains, mode 'set')
  v_close int;
  v_prev_slots text[];            -- miroir existant (replis 'clear' et échelle vide)
  v_clear_slots text[];           -- grille effective après un 'clear'
  v_has_cs boolean := false;      -- le club a-t-il déjà une grille par terrain ?
  k text;
  kk text;
  arr jsonb;
  ent jsonb;
  prev_end int;
  cur_start int;
  cur_d int;
  m int;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and (p.managed_club_id = p_club_id or p.role = 'operator')
  ) then
    return false;
  end if;
  -- (71) Même verrou CLUB que reservations_insert_guard : la garde anti-orphelin (69/70) et
  -- l'insertion d'une réservation ne peuvent plus se croiser (vérif puis écriture atomiques).
  perform pg_advisory_xact_lock(hashtext(p_club_id));
  -- (72) Garde anti-orphelin au RETRAIT DE TERRAIN : si p_courts retire un terrain qui porte une
  -- réservation à venir ('booked'), refus (la résa deviendrait invisible du planning par-terrain
  -- et bloquerait ensuite toute écriture de grille). Même verrou club → atomique avec l'INSERT.
  if p_courts is not null and exists (
    select 1 from public.reservations r
     where r.club_id = p_club_id
       and r.status = 'booked'
       and r.starts_at > (extract(epoch from now()) * 1000)::bigint
       and r.court is not null
       and not (r.court = any(p_courts))
  ) then
    return false;
  end if;
  -- R-40 : même garde pour un tournoi PUBLIÉ dont la fin n'est pas passée.
  if p_courts is not null and exists (
    select 1 from public.competitions c
     where c.club_id = p_club_id
       and c.status = 'published'
       and coalesce(nullif(c.end_date_key, ''), c.date_key) >= to_char((now() at time zone 'utc')::date, 'YYYY-MM-DD')
       and exists (select 1 from unnest(c.courts) ct where not (ct = any(p_courts)))
  ) then
    return false;
  end if;
  -- Bornes anti-abus court_closed (téléchargé par tous les joueurs) — inchangé.
  if p_court_closed is not null
     and (jsonb_typeof(p_court_closed) <> 'object' or pg_column_size(p_court_closed) > 8192) then
    return false;
  end if;

  select cc0.slots, (cc0.court_slots is not null) into v_prev_slots, v_has_cs
    from public.club_config cc0 where cc0.club_id = p_club_id;

  -- Décodage du mode court_slots + VALIDATION quand une grille est fournie.
  if p_court_slots is not null and p_court_slots <> '{}'::jsonb then
    v_mode := 'set';
    if jsonb_typeof(p_court_slots) <> 'object' or pg_column_size(p_court_slots) > 65536 then
      return false;
    end if;
    if (select count(*) from jsonb_object_keys(p_court_slots)) > 20 then
      return false; -- ≤ 20 terrains
    end if;
    for k in select jsonb_object_keys(p_court_slots) loop
      arr := p_court_slots -> k;
      if jsonb_typeof(arr) <> 'array' or jsonb_array_length(arr) > 48 then
        return false; -- ≤ 48 créneaux par terrain
      end if;
      prev_end := -1;
      -- Itération TRIÉE par heure de début → contrôle de non-chevauchement (durée propre).
      for ent in select value from jsonb_array_elements(arr) order by public.hhmm_to_min(value ->> 't') loop
        if jsonb_typeof(ent) <> 'object' then return false; end if;
        -- Aucune propriété inconnue (t, d, x seulement).
        for kk in select jsonb_object_keys(ent) loop
          if kk not in ('t', 'd', 'x') then return false; end if;
        end loop;
        if (ent ->> 't') is null or (ent ->> 't') !~ '^([01]\d|2[0-3]):(00|30)$' then
          return false; -- granularité 30 min (rejette :15/:45)
        end if;
        -- (a) durée = NOMBRE jsonb strict (une chaîne "60" passait `->> in ('60','90')` mais le
        -- client la résolvait 90 → grille divergente, créneau imbookable).
        if jsonb_typeof(ent -> 'd') <> 'number' or (ent ->> 'd') not in ('60', '90') then
          return false;
        end if;
        if (ent ? 'x') and jsonb_typeof(ent -> 'x') <> 'boolean' then return false; end if;
        cur_start := public.hhmm_to_min(ent ->> 't');
        cur_d := (ent ->> 'd')::int;
        if cur_start is null or cur_start < 300 or cur_start + cur_d > 1440 then
          return false; -- ≥ 05:00 et fin ≤ minuit
        end if;
        if cur_start < prev_end then
          return false; -- chevauchement (ou doublon d'heure) sur ce terrain
        end if;
        prev_end := cur_start + cur_d;
      end loop;
    end loop;

    -- (c) Garde anti-orphelin : chaque réservation À VENIR du club doit retomber EXACTEMENT
    -- (heure + durée) sur un créneau de la nouvelle grille de SON terrain — sinon elle
    -- disparaîtrait du planning par créneau et son prix/durée deviendraient incohérents.
    -- (Le miroir client peut être périmé : cette garde est le rempart de vérité.)
    if exists (
      select 1
        from public.reservations r
       where r.club_id = p_club_id
         and r.status = 'booked'
         and r.starts_at > v_now
         and not exists (
           select 1
             from jsonb_array_elements(coalesce(p_court_slots -> r.court, '[]'::jsonb)) e
            where (e ->> 't') = r."time"
              and (e ->> 'd')::int = r.duration_min
         )
    ) then
      return false;
    end if;

    -- (b) Miroir `slots`@90 = ÉCHELLE 1h30 recouvrant [ouverture, fermeture] de la grille réelle
    -- (union de tous les terrains). L'ancienne dérivation (débuts des seuls créneaux 90) donnait
    -- un miroir VIDE pour un club tout en 1h. Le miroir ne pilote plus rien tant que court_slots
    -- existe (resolve_court_slots lit la grille) : il sert aux bornes tarifaires et de point de
    -- départ au retour aux horaires simples.
    select min(public.hhmm_to_min(e ->> 't')),
           max(public.hhmm_to_min(e ->> 't') + (e ->> 'd')::int)
      into v_open, v_close
      from jsonb_each(p_court_slots) as court(key, val),
           lateral jsonb_array_elements(court.val) as e
     where jsonb_typeof(court.val) = 'array';
    v_eff_slots := '{}';
    if v_open is not null then
      m := v_open;
      while m + 90 <= v_close loop
        v_eff_slots := v_eff_slots || public.min_to_hhmm(m);
        m := m + 90;
      end loop;
    end if;
    -- (d) plage < 1h30 → échelle vide : on garde l'ancien miroir plutôt que d'écrire un vide.
    if coalesce(array_length(v_eff_slots, 1), 0) = 0 then
      v_eff_slots := coalesce(v_prev_slots, '{}');
    end if;

    -- Fermetures PAR TERRAIN projetées depuis la grille (créneaux `x:true`) → { 'Terrain 1': ['18:00'] }.
    -- Elles restent DORMANTES tant que `court_slots` existe (resolve_court_slots lit alors la grille),
    -- mais un 'clear' ultérieur (retour aux horaires simples) les PRÉSERVE via coalesce(cc.court_closed)
    -- au lieu de rouvrir silencieusement un créneau-terrain volontairement fermé.
    select coalesce(jsonb_object_agg(court, times), '{}'::jsonb)
      into v_eff_closed
      from (
        select ce.key as court,
               jsonb_agg((e ->> 't') order by public.hhmm_to_min(e ->> 't')) as times
          from jsonb_each(p_court_slots) as ce(key, val),
               lateral jsonb_array_elements(ce.val) as e
         where jsonb_typeof(ce.val) = 'array' and coalesce((e ->> 'x')::boolean, false)
         group by ce.key
      ) s;
  elsif p_court_slots = '{}'::jsonb then
    v_mode := 'clear';
    -- (c bis) Même garde anti-orphelin au retour aux horaires simples : la grille effective
    -- redevient le miroir @90 — chaque résa à venir doit durer 1h30 ET tomber sur un de ses
    -- horaires (fermé compris : la résa précède la fermeture, elle reste honorée).
    v_clear_slots := coalesce(p_slots, v_prev_slots, '{}');
    if exists (
      select 1
        from public.reservations r
       where r.club_id = p_club_id
         and r.status = 'booked'
         and r.starts_at > v_now
         and (r.duration_min <> 90
              or not exists (
                select 1 from unnest(v_clear_slots) t
                 where regexp_replace(t, '^!', '') = r."time"
              ))
    ) then
      return false;
    end if;
  end if;

  -- (70) Écriture p_slots SEULE (mode preserve) sans grille par terrain : même garde anti-
  -- orphelin que le 'clear' — la grille effective des terrains est CETTE grille @90.
  if v_mode = 'preserve' and p_slots is not null and not coalesce(v_has_cs, false) then
    if exists (
      select 1
        from public.reservations r
       where r.club_id = p_club_id
         and r.status = 'booked'
         and r.starts_at > v_now
         and (r.duration_min <> 90
              or not exists (
                select 1 from unnest(p_slots) t
                 where regexp_replace(t, '^!', '') = r."time"
              ))
    ) then
      return false;
    end if;
  end if;

  insert into public.club_config as cc
    (club_id, slots, courts, offers, coaches, photos, cover_url, court_photos, court_closed, court_slots)
  values (
    p_club_id,
    case when v_mode = 'set' then v_eff_slots else p_slots end,
    p_courts, p_offers, p_coaches, p_photos, nullif(p_cover_url, ''), p_court_photos,
    case when v_mode = 'set' then v_eff_closed else p_court_closed end,
    case when v_mode = 'set' then p_court_slots else null end
  )
  on conflict (club_id) do update set
    slots = case when v_mode = 'set' then v_eff_slots
                 else coalesce(excluded.slots, cc.slots) end,
    courts = coalesce(excluded.courts, cc.courts),
    offers = coalesce(excluded.offers, cc.offers),
    coaches = coalesce(excluded.coaches, cc.coaches),
    photos = coalesce(excluded.photos, cc.photos),
    -- '' = « retirer la cover » (null = champ non fourni → on garde l'existante).
    cover_url = case when p_cover_url = '' then null else coalesce(p_cover_url, cc.cover_url) end,
    court_photos = coalesce(excluded.court_photos, cc.court_photos),
    court_closed = case when v_mode = 'set' then v_eff_closed
                        else coalesce(excluded.court_closed, cc.court_closed) end,
    court_slots = case v_mode when 'set' then p_court_slots
                              when 'clear' then null
                              else cc.court_slots end, -- 'preserve'
    updated_at = now();
  return true;
end;
$$;
revoke execute on function public.upsert_club_config(text, text[], text[], jsonb, jsonb, text[], text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.upsert_club_config(text, text[], text[], jsonb, jsonb, text[], text, jsonb, jsonb, jsonb) to authenticated;

-- ── 6) R-43 · R-06 — Séries d'habitués ───────────────────────────────────────────
-- Recopie STRICTE de la 83 (live) hormis la boucle d'écriture (R-43) : plus aucun `do update` —
--  • une date dont le créneau CHEVAUCHE un tournoi publié du club part dans `conflicts` (comme
--    une résa) ;
--  • une date déjà couverte par une AUTRE fermeture (blocked_slots qui chevauche) part dans la
--    nouvelle liste `taken` au lieu d'être écrasée en silence ;
--  • une re-pose IDENTIQUE (même heure, même durée, déjà « Récurrent ») est idempotente : comptée
--    dans `blocked`, sa note privée inchangée.
-- Clé `taken` AJOUTÉE (rétrocompatible : la v1.0.2 ne lit que blocked / conflicts).
create or replace function public.block_recurring(p_club_id text, p_court text, p_time text, p_duration integer, p_date_keys text[], p_reason text default ''::text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
  v_dates text[];
  dk text;
  v_blocked text[] := '{}';
  v_conflicts text[] := '{}';
  v_taken text[] := '{}';
begin
  if not public.can_manage_club(p_club_id) then return null; end if;
  if coalesce(trim(p_court), '') = '' or public.hhmm_to_min(p_time) is null then return null; end if;
  if p_duration is null or p_duration not in (60, 90) then return null; end if;
  -- (Contre-lecture lot D) Défense en profondeur : (heure, durée) doit être un créneau OUVERT
  -- de CE terrain — l'UI ne propose que la grille, mais un appel forgé de gérant créerait
  -- sinon une fermeture incohérente avec la grille réelle.
  if not exists (
    select 1 from public.resolve_court_slots(p_club_id, p_court) rs
    where not rs.x and rs.t = p_time and rs.d = p_duration
  ) then
    return null;
  end if;
  -- 1 à 26 dates (26 semaines = 6 mois), format strict, réellement calendaires, bornées à 366 j.
  if p_date_keys is null or coalesce(array_length(p_date_keys, 1), 0) < 1 or array_length(p_date_keys, 1) > 26 then
    return null;
  end if;
  if exists (select 1 from unnest(p_date_keys) d where d !~ '^\d{4}-\d{2}-\d{2}$') then return null; end if;
  begin
    perform d::date from unnest(p_date_keys) d;
  exception when others then
    return null;
  end;
  if exists (select 1 from unnest(p_date_keys) d
             where d::date > (now() + interval '366 days')::date) then
    return null;
  end if;
  -- Toutes FUTURES : bloquer un créneau passé n'a pas de sens (et le résultat mentirait).
  if exists (select 1 from unnest(p_date_keys) d where public.slot_start_ms(d, p_time) <= v_now) then
    return null;
  end if;
  -- Dédoublonnées et ORDONNÉES : les verrous club:jour se prennent en ordre croissant PARTOUT
  -- (motif 74 anti-interblocage — block_range boucle aussi en ordre croissant).
  select array_agg(distinct d order by d) into v_dates from unnest(p_date_keys) d;
  foreach dk in array v_dates loop
    perform pg_advisory_xact_lock(hashtext(p_club_id || ':' || dk));
  end loop;
  foreach dk in array v_dates loop
    -- Même garde que block_slot : résa 'booked' qui CHEVAUCHE [time, time+durée) sur ce terrain.
    if exists (
      select 1 from public.reservations r
      where r.club_id = p_club_id and r.date_key = dk and r.court = p_court and r.status = 'booked'
        and public.hhmm_to_min(r."time") is not null
        and public.hhmm_to_min(r."time") < public.hhmm_to_min(p_time) + p_duration
        and public.hhmm_to_min(p_time) < public.hhmm_to_min(r."time") + r.duration_min
    )
    -- R-43 : tournoi PUBLIÉ qui couvre ce jour, ce terrain (ou tous) et chevauche le créneau.
    or exists (
      select 1 from public.competitions c
      where c.club_id = p_club_id and c.status = 'published'
        and c.date_key <= dk and coalesce(nullif(c.end_date_key, ''), c.date_key) >= dk
        and (coalesce(array_length(c.courts, 1), 0) = 0 or p_court = any (c.courts))
        and (
          coalesce(array_length(c.slots, 1), 0) = 0
          or exists (
            select 1 from unnest(c.slots) with ordinality as b(t, j)
            where public.hhmm_to_min(b.t) is not null
              and public.hhmm_to_min(p_time) < public.hhmm_to_min(b.t) + coalesce(c.slot_durations[b.j], 90)
              and public.hhmm_to_min(b.t) < public.hhmm_to_min(p_time) + p_duration
          )
        )
    ) then
      v_conflicts := v_conflicts || dk;
    -- Re-pose IDENTIQUE : déjà en place, rien à écrire (idempotence).
    elsif exists (
      select 1 from public.blocked_slots b
      where b.club_id = p_club_id and b.date_key = dk and b.court = p_court
        and b."time" = p_time and b.duration_min = p_duration and b.reason = 'Récurrent'
    ) then
      v_blocked := v_blocked || dk;
    -- R-43 : une AUTRE fermeture chevauche ce créneau → jamais écrasée.
    elsif exists (
      select 1 from public.blocked_slots b
      where b.club_id = p_club_id and b.date_key = dk and b.court = p_court
        and public.hhmm_to_min(b."time") is not null
        and public.hhmm_to_min(b."time") < public.hhmm_to_min(p_time) + p_duration
        and public.hhmm_to_min(p_time) < public.hhmm_to_min(b."time") + b.duration_min
    ) then
      v_taken := v_taken || dk;
    else
      -- Motif PUBLIC générique (jamais le nom du client — cf. blocked_slot_notes ci-dessus).
      insert into public.blocked_slots (club_id, date_key, time, court, reason, created_by, duration_min)
        values (p_club_id, dk, p_time, p_court, 'Récurrent', auth.uid(), p_duration)
        on conflict (club_id, date_key, time, court) do nothing;
      insert into public.blocked_slot_notes (club_id, date_key, "time", court, note)
        values (p_club_id, dk, p_time, p_court, left(trim(coalesce(p_reason, '')), 200))
        on conflict (club_id, date_key, "time", court) do nothing;
      v_blocked := v_blocked || dk;
    end if;
  end loop;
  return jsonb_build_object('blocked', to_jsonb(v_blocked), 'conflicts', to_jsonb(v_conflicts),
                            'taken', to_jsonb(v_taken));
end;
$$;
revoke execute on function public.block_recurring(text, text, text, integer, text[], text) from public, anon;
grant execute on function public.block_recurring(text, text, text, integer, text[], text) to authenticated;

-- R-06 : « Arrêter la série ». Retire les fermetures « Récurrent » À VENIR de ce terrain, à cette
-- heure, CE jour de la semaine (p_dow : 0 = dimanche, comme extract(dow)) — deux habitués au même
-- terrain et à la même heure, des jours différents, sont deux séries distinctes (arrêter le mardi
-- ne rouvre jamais le jeudi). Jamais une date passée : l'historique reste ; notes privées comprises.
-- Verrous club:jour en ordre croissant (patron block_recurring). Renvoie le NOMBRE de créneaux
-- retirés (0 = rien à arrêter) ; null = refus (pas gérant de ce club, paramètres invalides).
drop function if exists public.unblock_recurring(text, text, text);
create or replace function public.unblock_recurring(p_club_id text, p_court text, p_time text, p_dow int)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today text := to_char((now() at time zone 'utc')::date, 'YYYY-MM-DD');
  v_now_min int := extract(hour from (now() at time zone 'utc'))::int * 60
                   + extract(minute from (now() at time zone 'utc'))::int;
  v_dates text[];
  dk text;
  k int;
  n int := 0;
begin
  if not public.can_manage_club(p_club_id) then return null; end if;
  if coalesce(trim(p_court), '') = '' or public.hhmm_to_min(p_time) is null
     or p_dow is null or p_dow not between 0 and 6 then return null; end if;
  select array_agg(distinct b.date_key order by b.date_key) into v_dates
    from public.blocked_slots b
    where b.club_id = p_club_id and b.court = p_court and b."time" = p_time and b.reason = 'Récurrent'
      and extract(dow from b.date_key::date)::int = p_dow
      and (b.date_key > v_today or (b.date_key = v_today and public.hhmm_to_min(p_time) > v_now_min));
  if v_dates is null then return 0; end if;
  foreach dk in array v_dates loop
    perform pg_advisory_xact_lock(hashtext(p_club_id || ':' || dk));
  end loop;
  foreach dk in array v_dates loop
    delete from public.blocked_slot_notes
      where club_id = p_club_id and date_key = dk and "time" = p_time and court = p_court;
    delete from public.blocked_slots
      where club_id = p_club_id and date_key = dk and "time" = p_time and court = p_court
        and reason = 'Récurrent';
    get diagnostics k = row_count;
    n := n + k;
  end loop;
  return n;
end;
$$;
revoke execute on function public.unblock_recurring(text, text, text, int) from public, anon;
grant execute on function public.unblock_recurring(text, text, text, int) to authenticated;

-- ── 7) R-07 · R-53 · R-58 — Suppression de compte ────────────────────────────────
-- R-53 : liste des élèves d'un cours COLLECTIF notée AVANT la cascade (lesson_students et la résa
-- du coach disparaissent avec son compte) — notify-club la relit à la réception du webhook
-- d'annulation de la résa, prévient chaque élève, puis efface ses lignes. Écrite et lue par le
-- serveur seulement (aucune policy, droits retirés au client).
create table if not exists public.lesson_cancel_notices (
  reservation_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (reservation_id, user_id)
);
alter table public.lesson_cancel_notices enable row level security;
revoke all on public.lesson_cancel_notices from public, anon, authenticated;

-- Recopie STRICTE de la 86 (live : verrou de ligne, table dérivée auto-jointe, GUC storage) hormis :
--  • R-58 : le compte OPÉRATEUR ne se supprime pas d'ici (l'espace opérateur resterait sans
--    propriétaire) → exception 'operator_account' (type void inchangé : la v1.0.2 affiche son
--    message d'échec générique, la suivante un message dédié) ;
--  • R-07 : avant la cascade, ses tournois de JOUEUR en attente / refusés sont supprimés, les autres
--    gardent un organisateur anonyme (« Compte supprimé », téléphone retiré) ; nom et téléphone
--    retirés de ses messages au support ; ses demandes de club non traitées supprimées, le
--    téléphone des autres retiré ;
--  • R-53 : les résas de ses cours ACCEPTÉS à venir passent en 'club_cancelled' motif « Coach
--    indisponible » (≠ 'cancelled' compté comme annulation de l'élève), après avoir noté les
--    élèves des cours collectifs dans lesson_cancel_notices (commentaire C8 de la 85 corrigé :
--    sans cette trace, la cascade effaçait les inscrits avant que notify-club les lise).
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  -- R-58 : jamais le compte opérateur.
  if exists (select 1 from public.profiles p where p.id = uid and p.role = 'operator') then
    raise exception 'operator_account';
  end if;
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
  -- Mes propres réservations À VENIR : annulées avant la cascade (webhook → club prévenu).
  update public.reservations
    set status = 'cancelled'
    where user_id = uid and status = 'booked' and starts_at > now_ms;
  -- Cascade ON DELETE : profil, réservations, participations, favoris, etc.
  delete from auth.users where id = uid;
end;
$$;
revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;

-- ── 8) R-42 · R-60 — Suppression d'un club ───────────────────────────────────────
-- Recopie STRICTE de la 86 (live) hormis :
--  • R-60 : seul un club de la TABLE clubs se supprime — un appel forgé sur l'identifiant d'un
--    club fondateur (embarqué dans l'app) effaçait sa configuration ;
--  • R-42 : ses tournois PUBLIÉS pas encore terminés passent en 'cancelled' (motif « Club retiré
--    de PadelConnect » → push aux inscrits et à l'organisateur, inscriptions conservées) au lieu
--    d'être effacés en silence ; les résas à venir annulées portent cancel_reason 'club_deleted'
--    (marqueur technique jamais affiché — l'app ne montre un motif que pour 'club_cancelled')
--    → notify-club envoie au joueur un push neutre « Ton créneau … n'a plus lieu ».
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
    set status = 'cancelled', cancel_reason = 'Club retiré de PadelConnect'
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

-- ── 9) R-55 · R-58 — Accès gérant ────────────────────────────────────────────────
-- Recopie STRICTE de la 55 (live) hormis :
--  • R-55 : demande dont le compte a été supprimé (requested_by NULL) ou jamais confirmé (ni
--    e-mail ni téléphone confirmés) → null, rien n'est créé (avant : club visible SANS gérant) ;
--  • R-58 : demande venant du compte OPÉRATEUR → sentinelle '__operator__', rien n'est écrit
--    (l'opérateur gère déjà tous les clubs ; protect_role annulait la rétrogradation mais la
--    ligne manager_clubs restait, avec les push de gérant).
create or replace function public.approve_club_request(p_request_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  is_op boolean;
  req public.club_requests%rowtype;
  new_id text;
begin
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'operator') into is_op;
  if not is_op then return null; end if;
  select * into req from public.club_requests where id = p_request_id;
  if req.id is null then return null; end if;
  -- R-55 : un demandeur réel et confirmé.
  if req.requested_by is null or not exists (
    select 1 from auth.users u
    where u.id = req.requested_by and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)
  ) then
    return null;
  end if;
  -- R-58 : le compte opérateur lui-même.
  if exists (select 1 from public.profiles p where p.id = req.requested_by and p.role = 'operator') then
    return '__operator__';
  end if;

  -- id lisible : slug du nom + 8 caractères de l'id de la demande (anti-collision).
  new_id := left(regexp_replace(lower(coalesce(req.name, 'club')), '[^a-z0-9]+', '-', 'g'), 24);
  new_id := trim(both '-' from new_id);
  if new_id = '' then new_id := 'club'; end if;
  new_id := new_id || '-' || substr(replace(p_request_id::text, '-', ''), 1, 8);

  insert into public.clubs (id, name, area, type, courts, price_from, contact_phone)
    values (
      new_id,
      req.name,
      req.area,
      coalesce(req.type, 'Mixte'),
      coalesce(req.courts, 1),
      coalesce(req.price_from, 10000),
      req.contact_phone
    )
    on conflict (id) do nothing;

  -- Accès gérant au demandeur (s'il est connu) : role='club' + son club, AJOUTÉ à sa liste
  -- multi-clubs (55) — le nouveau club devient l'actif, les précédents restent accessibles.
  if req.requested_by is not null then
    insert into public.manager_clubs (user_id, club_id) values (req.requested_by, new_id)
      on conflict (user_id, club_id) do nothing;
    update public.profiles
      set role = 'club', managed_club_id = new_id
      where id = req.requested_by;
  end if;

  update public.club_requests set status = 'approved' where id = p_request_id;
  return new_id;
end;
$$;
revoke execute on function public.approve_club_request(uuid) from public, anon;
grant execute on function public.approve_club_request(uuid) to authenticated;

-- Recopie STRICTE de la 55 (live) hormis R-58 : numéro du compte OPÉRATEUR → '__operator__'
-- sans rien écrire (avant : « accès ✅ » affiché, ligne manager_clubs orpheline).
create or replace function public.grant_club_access_by_phone(p_phone text, p_club_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
  full_name text;
  matches int;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'operator') then
    return null; -- réservé à l'opérateur
  end if;
  if coalesce(p_club_id, '') = '' or length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 8 then
    return null;
  end if;
  select count(*) into matches from public.profiles p
    where right(regexp_replace(p.phone, '\D', '', 'g'), 10) = right(regexp_replace(p_phone, '\D', '', 'g'), 10);
  if matches <> 1 then
    return null; -- 0 = introuvable ; >1 = AMBIGU → on refuse (anti-usurpation)
  end if;
  select p.id, trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
    into target, full_name
  from public.profiles p
  where right(regexp_replace(p.phone, '\D', '', 'g'), 10) = right(regexp_replace(p_phone, '\D', '', 'g'), 10);
  -- R-58 : jamais le compte opérateur.
  if exists (select 1 from public.profiles p where p.id = target and p.role = 'operator') then
    return '__operator__';
  end if;
  -- Multi-clubs (55) : le nouveau club S'AJOUTE à la liste et devient le club ACTIF —
  -- le gérant retrouve ses autres clubs via le sélecteur de l'Espace Club.
  insert into public.manager_clubs (user_id, club_id) values (target, p_club_id)
    on conflict (user_id, club_id) do nothing;
  update public.profiles set role = 'club', managed_club_id = p_club_id where id = target;
  return coalesce(nullif(full_name, ''), 'Gérant');
end;
$$;
revoke execute on function public.grant_club_access_by_phone(text, text) from public, anon;
grant execute on function public.grant_club_access_by_phone(text, text) to authenticated;

-- Recopie STRICTE de la 55 (live) hormis R-58 (même sentinelle, rien n'est écrit).
create or replace function public.revoke_club_access_by_phone(p_phone text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
  full_name text;
  matches int;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'operator') then
    return null;
  end if;
  if length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 8 then
    return null;
  end if;
  select count(*) into matches from public.profiles p
    where right(regexp_replace(p.phone, '\D', '', 'g'), 10) = right(regexp_replace(p_phone, '\D', '', 'g'), 10);
  if matches <> 1 then
    return null; -- ambigu → on refuse
  end if;
  select p.id, trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
    into target, full_name
  from public.profiles p
  where right(regexp_replace(p.phone, '\D', '', 'g'), 10) = right(regexp_replace(p_phone, '\D', '', 'g'), 10);
  -- R-58 : jamais le compte opérateur.
  if exists (select 1 from public.profiles p where p.id = target and p.role = 'operator') then
    return '__operator__';
  end if;
  delete from public.manager_clubs where user_id = target;
  update public.profiles set role = 'player', managed_club_id = null where id = target;
  return coalesce(nullif(full_name, ''), 'Joueur');
end;
$$;
revoke execute on function public.revoke_club_access_by_phone(text) from public, anon;
grant execute on function public.revoke_club_access_by_phone(text) to authenticated;

-- ── 10) R-68 — Annuler un « Paiement reçu » tapé par erreur ──────────────────────
-- Miroir de operator_confirm_tournament_payment (58) : opérateur seul, tournoi avec des frais
-- PadelConnect (commission > 0) actuellement 'paid' → 'unpaid'. true = annulé ; false = refus
-- (pas opérateur, introuvable, sans frais, déjà non payé, ou tournoi ANNULÉ — pendant de la garde
-- de « Paiement reçu » (98, décision 14) : sinon une créance soldée repassait « non payée » sans
-- retour possible, confirm refusant un tournoi annulé).
create or replace function public.operator_unconfirm_tournament_payment(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'operator') then
    return false;
  end if;
  update public.competitions set payment_status = 'unpaid'
    where id = p_id and status <> 'cancelled' and coalesce(commission, 0) > 0 and payment_status = 'paid';
  return found;
end;
$$;
revoke execute on function public.operator_unconfirm_tournament_payment(uuid) from public, anon;
grant execute on function public.operator_unconfirm_tournament_payment(uuid) to authenticated;

-- ── 11) R-77 — Demandes de club : statuts bornés ─────────────────────────────────
-- Statuts réellement utilisés : 'new' (création), 'contacted' (opérateur), 'approved' /
-- 'rejected' (RPC). Contrainte posée `not valid` (jamais d'échec du collage sur une ligne
-- ancienne), puis validée si toutes les lignes sont conformes — sinon elle protège quand même
-- toute écriture nouvelle. Une demande créée par le client naît forcément 'new' (avant : une
-- demande forgée « approved » apparaissait comme traitée chez l'opérateur).
alter table public.club_requests drop constraint if exists club_requests_status_chk;
alter table public.club_requests add constraint club_requests_status_chk
  check (status in ('new', 'contacted', 'approved', 'rejected')) not valid;
do $$
begin
  alter table public.club_requests validate constraint club_requests_status_chk;
exception when check_violation then
  raise notice 'club_requests : lignes anciennes hors statuts connus — contrainte gardée NOT VALID';
end $$;
drop policy if exists "club_requests_insert_own" on public.club_requests;
create policy "club_requests_insert_own" on public.club_requests
  for insert with check (auth.uid() = requested_by and status = 'new');
