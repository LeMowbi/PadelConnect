-- 96 — Règles métier : réservations, invitations, cours, score, niveau, classement, accès
-- directs (audit des règles métier 2026-10-22, lot M2 — première moitié).
-- À coller dans Supabase → SQL Editor → Run APRÈS la 95. Idempotente tant que la 98 n'est pas
-- posée. APRÈS la 98, elle s'arrête sur `42P13 cannot change return type` (fetch_leaderboard a
-- gagné `rank`) et ses versions ignorent la place anonyme d'un compte supprimé : pour la
-- recoller, `drop function public.fetch_leaderboard(integer);` puis 96, 97 et 98 dans l'ordre.
--
-- Chaque fonction est une recopie STRICTE de sa définition LIVE (dump du 2026-10-21 — aucune
-- n'est redéfinie par les 92 à 95) hormis le bloc commenté « R-n ». Les signatures et les types
-- de retour appelés par la v1.0.2 publiée (respond_invitation, cancel_reservation,
-- set_club_confirmed, mark_no_show, request_lesson, apply_match_level…) sont INCHANGÉS : seul
-- `fetch_open_matches` gagne une colonne `price` EN DERNIER (drop + create, client tolérant).
--
--  1) R-03 — niveau appliqué PAR JOUEUR : qui confirme après la validation bouge aussi (avant,
--     le 2ᵉ gagnant avait les +3 sans le niveau, le perdant tardif ne perdait rien).
--  2) R-16 · R-21 · R-52 — respond_invitation : l'acceptation marque `confirmed` dans `invited`,
--     est refusée sur une résa qui n'est plus 'booked' et entre comptes bloqués ; rattrapage
--     unique de `confirmed` pour les invitations déjà acceptées des résas à venir.
--  3) R-52 — block_user retire aussi les invitations EN ATTENTE croisées à venir.
--  4) R-24 — cancel_reservation verrouille la ligne : une annulation joueur concurrente
--     n'écrase plus une annulation club / un « pas venu ».
--  5) R-21 — set_club_confirmed ne confirme qu'une résa 'booked' ; mark_no_show(true) seulement
--     entre le début du créneau et la fin + 48 h.
--  6) R-27 — request_lesson : date validée, début recalculé côté serveur, blocage bilatéral.
--  7) R-19 — coach_cancel_lesson (NOUVELLE) : le coach annule un cours individuel accepté.
--  8) R-20 — rejoindre / accepter purge sa propre alerte de liste d'attente (trigger).
--  9) R-32 · R-33 — scores : nom d'un bloqué masqué ; classement : un gérant reste classé.
-- 10) R-64 — fetch_open_matches renvoie le prix du terrain (part affichée avant de rejoindre).
-- 11) R-75 — club_reservation_phone (NOUVELLE) : le gérant joint le créateur d'un match ouvert.
-- 12) R-76 — nom et téléphone du réservant repris du PROFIL (plus forgeables).
-- 13) R-78 · R-79 — accès directs : blocked_users en lecture seule, `anon` ne lit plus six tables.

-- ── 1) R-03 — Moteur de niveau : idempotence PAR JOUEUR ──────────────────────────
-- Recopie STRICTE de la 80 hormis : (a) plus de court-circuit « le match a déjà une ligne
-- d'historique » — un entrant TARDIF (gagnant ou perdant qui saisit après la validation) bouge à
-- son tour, une seule fois (ligne d'historique propre, index level_history_match_uniq) ; (b) le
-- delta est FIGÉ sur le match : les camps sont mesurés avec le niveau d'AVANT le match (lu dans
-- level_history pour les joueurs déjà ajustés, le niveau courant pour les autres) — sinon le
-- tardif verrait un écart déjà déplacé par la 1ʳᵉ application ; (c) la mise à jour du niveau ne
-- suit que si la ligne d'historique vient d'être INSÉRÉE (double appel = aucun effet).
-- L'écrêtage hebdomadaire ±0,5 s'applique tel quel. Retour inchangé : true = match validé en miroir.
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

-- Recopie STRICTE de la 80 hormis le filtre PAR JOUEUR (R-03) : un match compte tant que MOI je
-- n'ai pas de ligne d'historique et que j'y ai saisi un score (seuls les entrants bougent) —
-- avant, le filtre « aucune ligne pour ce match » ignorait les entrants tardifs.
create or replace function public.reconcile_my_levels()
returns integer
language plpgsql
security definer
set search_path = public
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
        and exists (select 1 from public.match_results mr where mr.reservation_id = res.id and mr.user_id = v_uid)
        and not exists (select 1 from public.level_history lh
                        where lh.reservation_id = res.id and lh.user_id = v_uid)
      limit 50
  loop
    if public.apply_match_level(v_id) then v_count := v_count + 1; end if;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.reconcile_my_levels() from public, anon;
grant execute on function public.reconcile_my_levels() to authenticated;

-- ── 2) R-16 · R-21 · R-52 — Répondre à une invitation ────────────────────────────
-- Recopie STRICTE de la 73 (verrou de LIGNE, garde « match commencé », recalcul de `invited` au
-- refus) hormis, pour l'ACCEPTATION seulement (le refus reste toujours permis) :
--  • R-21 : la résa doit être encore 'booked' (une résa annulée, absente ou annulée par le club
--    ne s'accepte plus — et le créateur ne reçoit plus « Invitation acceptée » d'un match mort) ;
--  • R-52 : refus si un blocage existe entre l'invité et le créateur, dans un sens ou l'autre
--    (même garde que link_participants / join_open_match) ;
--  • R-16 : `confirmed = true` posé sur MON entrée de `invited` (id = mon compte) → la carte du
--    créateur distingue « ✓ » de « en attente ». Les entrées « x-… » (nom sans compte) et
--    « open-… » (match ouvert, déjà confirmées) ne sont jamais touchées.
-- Type de retour inchangé (boolean, la v1.0.2 compare `=== true`).
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
  -- Verrou de LIGNE sur la réservation (comme join_open_match) : sérialise les entrées/sorties
  -- concurrentes du même match ouvert (audit 2026-07-11). Sans lui, un refus recalculait `invited`
  -- sur un instantané NON verrouillé et écrasait l'ajout d'un « Rejoindre » concurrent → surbooking
  -- (5-6 joueurs sur un terrain de 4) ou place gelée à jamais (entrée d'un partant ressuscitée).
  perform 1 from public.reservations where id = p_reservation_id for update;
  if exists (select 1 from public.reservations r
             where r.id = p_reservation_id
               and r.starts_at <= (extract(epoch from now()) * 1000)::bigint) then
    return false; -- le match a commencé : plus d'entrée/sortie
  end if;
  if p_accept then
    -- R-21 : seulement une réservation encore active.
    if not exists (select 1 from public.reservations r
                   where r.id = p_reservation_id and r.status = 'booked') then
      return false;
    end if;
    -- R-52 : blocage bilatéral avec le créateur.
    if exists (select 1 from public.reservations r
               join public.blocked_users b
                 on (b.blocker_id = r.user_id and b.blocked_id = v_uid)
                 or (b.blocker_id = v_uid and b.blocked_id = r.user_id)
               where r.id = p_reservation_id) then
      return false;
    end if;
  end if;
  update public.reservation_participants
    set status = v_target
    where reservation_id = p_reservation_id and user_id = v_uid
      and status is distinct from v_target;
  v_changed := found;
  if v_changed and p_accept then
    -- R-16 : MON entrée passe « confirmée » (ordre du tableau conservé).
    update public.reservations
      set invited = (
        select coalesce(jsonb_agg(case when t.e ->> 'id' = v_uid::text
                                       then jsonb_set(t.e, '{confirmed}', 'true'::jsonb)
                                       else t.e end order by t.o), '[]'::jsonb)
          from jsonb_array_elements(case when jsonb_typeof(invited) = 'array' then invited else '[]'::jsonb end)
               with ordinality as t(e, o))
      where id = p_reservation_id
        and exists (select 1
                      from jsonb_array_elements(case when jsonb_typeof(invited) = 'array' then invited else '[]'::jsonb end) x
                     where x ->> 'id' = v_uid::text);
  end if;
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
revoke execute on function public.respond_invitation(uuid, boolean) from public, anon;
grant execute on function public.respond_invitation(uuid, boolean) to authenticated;

-- R-16 · rattrapage UNIQUE (idempotent) : les invitations acceptées AVANT la 96 n'ont jamais eu
-- `confirmed` posé → la carte du créateur les dirait « (en attente) » jusqu'au match. Reprises :
-- les résas encore 'booked' qui ne sont pas passées depuis plus d'un jour, pour les seules entrées
-- dont le compte a ACCEPTÉ (reservation_participants). Ligne par ligne : chaque UPDATE repasse la
-- garde de disponibilité (35) — une résa en conflit avec une fermeture ou un tournoi est laissée
-- telle quelle (notice) au lieu d'arrêter toute la migration. Aucun push : le webhook
-- `reservations` ne réagit qu'aux changements de statut et de `club_confirmed`.
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

-- ── 3) R-52 — Bloquer retire aussi les invitations en attente ─────────────────────
-- Recopie STRICTE de la 91 hormis le bloc final : les participations ENCORE « invited » entre
-- les deux comptes sur des réservations À VENIR (dans un sens ou l'autre) sont retirées, et
-- `invited` / `players` de la résa sont recalculés sous VERROU DE LIGNE (patron respond_invitation,
-- 73) — un « Rejoindre » concurrent n'est jamais écrasé. Une participation déjà ACCEPTÉE reste
-- (le match est convenu ; le bloqué ne peut de toute façon plus rien accepter de neuf). Aucun push
-- (DELETE : aucun webhook) : le blocage reste invisible pour la personne bloquée.
create or replace function public.block_user(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
  v_rid uuid;
  v_guest uuid;
  v_new jsonb;
begin
  if me is null or p_user_id is null or p_user_id = me then return false; end if;
  insert into public.blocked_users (blocker_id, blocked_id)
    values (me, p_user_id)
    on conflict (blocker_id, blocked_id) do nothing;
  delete from public.friends where (user_id = me and friend_id = p_user_id) or (user_id = p_user_id and friend_id = me);
  delete from public.friend_requests where (from_user = me and to_user = p_user_id) or (from_user = p_user_id and to_user = me);
  delete from public.favorite_players where (user_id = me and fav_user_id = p_user_id) or (user_id = p_user_id and fav_user_id = me);
  -- R-52 : invitations en attente croisées, résas à venir (ordre stable des verrous).
  for v_rid, v_guest in
    select r.id, rp.user_id
      from public.reservations r
      join public.reservation_participants rp on rp.reservation_id = r.id and rp.status = 'invited'
      where r.starts_at > v_now
        and ((r.user_id = me and rp.user_id = p_user_id) or (r.user_id = p_user_id and rp.user_id = me))
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
  return true;
end;
$$;
revoke execute on function public.block_user(uuid) from public, anon;
grant execute on function public.block_user(uuid) to authenticated;

-- ── 4) R-24 — Annulation joueur : verrou de ligne + garde atomique ────────────────
-- Recopie STRICTE de la 09 hormis `for update` à la lecture et `where status = 'booked'` +
-- `return found` à l'écriture : une annulation CLUB (75) ou un « pas venu » commis entre-temps
-- n'est plus écrasé (le motif et la proposition du club survivent, la fiabilité du joueur aussi).
-- Signature et type inchangés.
create or replace function public.cancel_reservation(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.reservations%rowtype;
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  select * into r from public.reservations where id = p_id for update;
  if r.id is null or r.user_id <> auth.uid() then return false; end if; -- seul l'auteur annule
  if r.status <> 'booked' then return false; end if; -- déjà annulée / autre statut
  if r.starts_at - now_ms < 5 * 3600 * 1000 then return false; end if; -- moins de 5h avant : refusé
  update public.reservations set status = 'cancelled' where id = p_id and status = 'booked';
  return found;
end;
$$;
revoke execute on function public.cancel_reservation(uuid) from public, anon;
grant execute on function public.cancel_reservation(uuid) to authenticated;

-- ── 5) R-21 — Confirmation club et « pas venu » bornés ───────────────────────────
-- Recopie STRICTE (live) hormis `and status = 'booked'` + `return found` : confirmer une résa
-- annulée (appel forgé) ne fait plus rien et ne pousse plus « Réservation confirmée ».
create or replace function public.set_club_confirmed(p_id uuid, p_value boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare allowed boolean;
begin
  select exists (
    select 1 from public.reservations r
    join public.profiles p on p.id = auth.uid()
    where r.id = p_id
      and ((p.role = 'club' and p.managed_club_id = r.club_id) or p.role = 'operator')
  ) into allowed;
  if not allowed then return false; end if;
  update public.reservations set club_confirmed = p_value where id = p_id and status = 'booked';
  return found;
end; $$;
revoke execute on function public.set_club_confirmed(uuid, boolean) from public, anon;
grant execute on function public.set_club_confirmed(uuid, boolean) to authenticated;

-- Recopie STRICTE de la 87 hormis la FENÊTRE du marquage (R-21) : du début du créneau jusqu'à
-- sa fin + 48 h — sur-ensemble de ce que l'Espace Club propose (bouton dès le début, historique
-- 48 h après le début) : rien d'affiché n'est refusé, un « pas venu » forgé sur une résa FUTURE
-- ou vieille de plusieurs semaines renvoie 'gone'. Le dé-marquage (p_value = false) est inchangé.
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

-- ── 6) R-27 — Demande de cours : date validée, début serveur, blocage ────────────
-- Recopie STRICTE de la 68/74 hormis : format de `p_date_key` / `p_time` validé, début du cours
-- RECALCULÉ côté serveur (`slot_start_ms`, comme la garde d'insertion des réservations) — le
-- paramètre `p_starts_at` reste dans la signature (v1.0.2) mais n'est plus lu ; et refus si un
-- blocage existe entre l'élève et le coach, dans un sens ou l'autre (patron link_participants).
create or replace function public.request_lesson(p_coach uuid, p_club_id text, p_club_name text, p_date_key text, p_date_label text, p_time text, p_court text, p_starts_at bigint, p_price integer, p_duration integer default 90)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  sname text;
  cname text;
  v_courts text[];
  v_starts bigint;
begin
  if auth.uid() is null or auth.uid() = p_coach then return null; end if;
  if p_price is null or p_price < 1000 or p_price > 1000000 then return null; end if;
  if p_duration is null or p_duration not in (60, 90) then return null; end if;
  -- R-27 : jour et heure au bon format, début recalculé (une date impossible fait échouer le cast).
  if p_date_key is null or p_date_key !~ '^\d{4}-\d{2}-\d{2}$'
     or p_time is null or p_time !~ '^([01]\d|2[0-3]):([0-5]\d)$' then
    return null;
  end if;
  begin
    v_starts := public.slot_start_ms(p_date_key, p_time);
  exception when others then
    return null;
  end;
  -- R-27 : pas de demande entre comptes bloqués.
  if exists (select 1 from public.blocked_users b
             where (b.blocker_id = p_coach and b.blocked_id = auth.uid())
                or (b.blocker_id = auth.uid() and b.blocked_id = p_coach)) then
    return null;
  end if;
  -- Le coach doit être ACTIF dans CE club et proposer CE créneau (dispo coach = heures).
  if not exists (
    select 1 from public.coaches c
    where c.user_id = p_coach and c.club_id = p_club_id and c.active and p_time = any (c.slots)
  ) then
    return null;
  end if;
  -- Terrain déclaré + (heure, durée) = créneau OUVERT de CE terrain (grille par terrain, 38/68).
  select courts into v_courts from public.club_config where club_id = p_club_id;
  if v_courts is not null and array_length(v_courts, 1) > 0 and not (p_court = any (v_courts)) then
    return null;
  end if;
  if not exists (
    select 1 from public.resolve_court_slots(p_club_id, p_court) rs
    where not rs.x and rs.t = p_time and rs.d = p_duration
  ) then
    return null;
  end if;
  if v_starts <= (extract(epoch from now()) * 1000)::bigint then return null; end if;
  -- Pas deux demandes actives identiques (même élève, même coach, même créneau).
  if exists (
    select 1 from public.lessons l
    where l.student_id = auth.uid() and l.coach_id = p_coach and l.date_key = p_date_key
      and l."time" = p_time and l.status = 'pending'
  ) then
    return null;
  end if;
  select coalesce(nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), 'Un joueur')
    into sname from public.profiles where id = auth.uid();
  select coalesce(nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), 'Coach')
    into cname from public.profiles where id = p_coach;
  insert into public.lessons (coach_id, coach_name, club_id, club_name, student_id, student_name, date_key, date_label, "time", court, starts_at, price, duration_min)
    values (p_coach, cname, p_club_id, coalesce(p_club_name, ''), auth.uid(), sname, p_date_key, coalesce(p_date_label, ''), p_time, p_court, v_starts, p_price, p_duration)
    returning id into new_id;
  return new_id;
end;
$$;
revoke execute on function public.request_lesson(uuid, text, text, text, text, text, text, bigint, integer, integer) from public, anon;
grant execute on function public.request_lesson(uuid, text, text, text, text, text, text, bigint, integer, integer) to authenticated;

-- ── 7) R-19 — Le coach annule un cours individuel accepté ────────────────────────
-- Traçabilité de l'auteur de l'annulation : 'coach' (cette RPC) ; null = toute autre voie.
-- notify-club la lit pour envoyer à l'élève un push DÉDIÉ (jamais « annulé par le club ») et ne
-- pas renvoyer « Cours annulé » au coach qui vient lui-même d'annuler.
alter table public.lessons add column if not exists cancelled_by text;
alter table public.lessons drop constraint if exists lessons_cancelled_by_chk;
alter table public.lessons add constraint lessons_cancelled_by_chk
  check (cancelled_by is null or cancelled_by = 'coach');

-- 'ok' | 'gone' (introuvable, plus accepté, résa déjà annulée) | 'forbidden' (pas son cours, ou
-- cours COLLECTIF) | 'played' (le cours a commencé). La résa passe en 'club_cancelled' : aucune
-- pénalité pour l'élève (≠ 'cancelled' compté dans sa fiabilité), carnet rendu (trigger 85), et
-- AUCUN blocage du créneau (≠ club_cancel_reservation) — il redevient réservable. La lesson passe
-- en 'cancelled' AVANT la résa : le trigger lessons_follow_reservation la trouve déjà annulée et
-- n'émet donc pas une 2ᵉ transition (sinon le coach recevrait « Cours annulé » de sa propre main).
-- Verrous dans l'ordre réservation → lesson (même ordre que cancel_reservation via le trigger 76).
create or replace function public.coach_cancel_lesson(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rid uuid;
  l public.lessons%rowtype;
  r public.reservations%rowtype;
begin
  if auth.uid() is null then return 'forbidden'; end if;
  select reservation_id into v_rid from public.lessons where id = p_id;
  if v_rid is not null then
    select * into r from public.reservations where id = v_rid for update;
  end if;
  select * into l from public.lessons where id = p_id for update;
  if l.id is null then return 'gone'; end if;
  if l.coach_id <> auth.uid() or coalesce(l.capacity, 1) > 1 then return 'forbidden'; end if;
  if l.status <> 'accepted' or l.reservation_id is null or l.reservation_id is distinct from v_rid then
    return 'gone';
  end if;
  if r.id is null or r.status <> 'booked' then return 'gone'; end if;
  if r.starts_at <= (extract(epoch from now()) * 1000)::bigint then return 'played'; end if;
  update public.lessons
    set status = 'cancelled', cancelled_by = 'coach', responded_at = now()
    where id = p_id and status = 'accepted';
  update public.reservations
    set status = 'club_cancelled', cancel_reason = 'Cours annulé par le coach'
    where id = v_rid and status = 'booked';
  return 'ok';
end;
$$;
revoke execute on function public.coach_cancel_lesson(uuid) from public, anon;
grant execute on function public.coach_cancel_lesson(uuid) to authenticated;

-- ── 8) R-20 — Rejoindre / accepter purge sa propre alerte d'attente ──────────────
-- Miroir de waitlist_purge_on_booking (89, chevauchement 91) côté PARTICIPANT : rejoindre un
-- match ouvert ou accepter une invitation sur un créneau où j'attendais une place retire mon
-- alerte — sinon « Un créneau s'est libéré » me serait poussé pour l'heure où je joue.
-- Chevauchement demi-ouvert [t, t+d) : l'égal et le chevauchant sont purgés, l'adjacent reste.
-- SECURITY DEFINER obligatoire (slot_waitlist n'a qu'une policy SELECT). Aucune recolle de la 81.
create or replace function public.waitlist_purge_on_join()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'accepted' and (tg_op = 'INSERT' or old.status is distinct from 'accepted') then
    delete from public.slot_waitlist w
      using public.reservations r
      where r.id = new.reservation_id and r.status = 'booked'
        and w.user_id = new.user_id and w.club_id = r.club_id and w.date_key = r.date_key
        and public.hhmm_to_min(w."time") < public.hhmm_to_min(r."time") + coalesce(r.duration_min, 90)
        and public.hhmm_to_min(r."time") < public.hhmm_to_min(w."time") + coalesce(w.duration_min, 90);
  end if;
  return new;
end;
$$;
drop trigger if exists waitlist_purge_on_join on public.reservation_participants;
create trigger waitlist_purge_on_join
  after insert or update of status on public.reservation_participants
  for each row execute function public.waitlist_purge_on_join();

-- ── 9) R-32 · R-33 — Scores et classement ────────────────────────────────────────
-- Recopie STRICTE de la 49 (live) hormis `entered_names` : un compte bloqué (dans un sens ou
-- l'autre) apparaît « Un joueur » au lieu de son nom (R-32) — le décompte des saisies est inchangé.
create or replace function public.fetch_my_match_scores()
returns table(reservation_id uuid, entries integer, validated boolean, conflict boolean, mine boolean, i_won boolean, score text, entered_names text)
language sql
stable
security definer
set search_path = public
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
         string_agg(
           case when exists (select 1 from public.blocked_users b
                             where (b.blocker_id = auth.uid() and b.blocked_id = mr.user_id)
                                or (b.blocker_id = mr.user_id and b.blocked_id = auth.uid()))
                then 'Un joueur'
                else trim(coalesce(p.first_name, '') || ' ' ||
                          case when coalesce(p.last_name, '') <> '' then left(p.last_name, 1) || '.' else '' end)
           end, ', ')
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
revoke execute on function public.fetch_my_match_scores() from public, anon;
grant execute on function public.fetch_my_match_scores() to authenticated;

-- Recopie STRICTE de la 49 (live) hormis le filtre de rôle (R-33) : un joueur devenu GÉRANT de
-- club garde son rang et ses points (seul l'opérateur est exclu). Un compte club qui ne joue
-- pas reste hors classement par le filtre `points > 0` existant.
create or replace function public.fetch_leaderboard(p_limit integer default 50)
returns table(user_id uuid, name text, level numeric, wins integer, match_wins integer, off_played integer, played integer, points integer)
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
                 and r.starts_at + (r.duration_min * 60000) < (extract(epoch from now()) * 1000)::bigint)
            + (select count(*) from public.reservation_participants rp
                 join public.reservations rr on rr.id = rp.reservation_id
                 where rp.user_id = p.id and rp.status = 'accepted' and rr.user_id <> p.id
                   and rr.status = 'booked'
                   and rr.starts_at + (rr.duration_min * 60000) < (extract(epoch from now()) * 1000)::bigint))::int as played
      from public.profiles p
      where coalesce(trim(p.first_name), '') <> ''
        and coalesce(p.role, 'player') <> 'operator'
  )
  select b.id, b.pname, b.plevel, b.wins, b.mwins, b.offplayed, b.played,
         (b.wins * 100 + b.offplayed * 10 + b.mwins * 3 + b.played * 2) as points
    from base b
    where (b.wins * 100 + b.offplayed * 10 + b.mwins * 3 + b.played * 2) > 0 -- pas de joueur à 0 pt
    order by 8 desc, b.wins desc, b.mwins desc, b.id -- le NIVEAU ne départage jamais (règle §9)
    limit greatest(coalesce(p_limit, 50), 1);
$$;
revoke execute on function public.fetch_leaderboard(integer) from public, anon;
grant execute on function public.fetch_leaderboard(integer) to authenticated;

-- Même filtre de rôle que fetch_leaderboard (R-33) — à modifier ENSEMBLE.
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
                 and r.starts_at + (r.duration_min * 60000) < (extract(epoch from now()) * 1000)::bigint)
            + (select count(*) from public.reservation_participants rp
                 join public.reservations rr on rr.id = rp.reservation_id
                 where rp.user_id = p.id and rp.status = 'accepted' and rr.user_id <> p.id
                   and rr.status = 'booked'
                   and rr.starts_at + (rr.duration_min * 60000) < (extract(epoch from now()) * 1000)::bigint)) as played
      from public.profiles p
      where coalesce(trim(p.first_name), '') <> '' and coalesce(p.role, 'player') <> 'operator'
  ),
  scored as (
    select id, (wins * 100 + offplayed * 10 + mwins * 3 + played * 2) as points, wins, mwins from base
  ),
  ranked as (
    select id, row_number() over (order by points desc, wins desc, mwins desc, id) as rk
      from scored where points > 0 -- non classé tant qu'on n'a marqué aucun point
  )
  -- 0 = NON CLASSÉ (0 point) — distinct d'un échec réseau côté client (null).
  select coalesce((select rk::int from ranked where id = auth.uid()), 0);
$$;
revoke execute on function public.my_leaderboard_rank() from public, anon;
grant execute on function public.my_leaderboard_rank() to authenticated;

-- ── 10) R-64 — Matchs ouverts : prix du terrain ──────────────────────────────────
-- Recopie STRICTE de la définition LIVE (81) hormis la colonne `price` (prix FIGÉ du terrain,
-- int, null possible) ajoutée EN DERNIER : un client v1.0.2 ignore la clé en trop. Type de
-- retour changé → drop puis create (42P13), ACL reposées (un drop+create rouvre EXECUTE à PUBLIC).
-- ⚠️ Ne jamais recoller la 68 ni la 81 seules : elles recréeraient l'ancienne forme.
drop function if exists public.fetch_open_matches();
create function public.fetch_open_matches()
returns table(id uuid, club_id text, club_name text, date_key text, date_label text, "time" text, court text, starts_at bigint, open_level text, creator_id uuid, creator_name text, places_left integer, capacity integer, duration_min integer, open_level_min numeric, open_level_max numeric, price integer)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.club_id, r.club_name, r.date_key, r.date_label, r."time", r.court, r.starts_at,
         r.open_level, r.user_id,
         case
           when coalesce(trim(r.booked_by_name), '') = '' then 'Un joueur'
           else split_part(trim(r.booked_by_name), ' ', 1) ||
                case when split_part(trim(r.booked_by_name), ' ', 2) <> ''
                     then ' ' || left(split_part(trim(r.booked_by_name), ' ', 2), 1) || '.'
                     else '' end
         end,
         greatest(0, coalesce(r.open_capacity, 4) - 1
           - coalesce(case when jsonb_typeof(r.invited) = 'array' then jsonb_array_length(r.invited) end, 0))::int,
         coalesce(r.open_capacity, 4)::int,
         coalesce(r.duration_min, 90)::int,
         r.open_level_min,
         r.open_level_max,
         r.price
    from public.reservations r
    where r.status = 'booked'
      and r.open_match
      and r.starts_at > (extract(epoch from now()) * 1000)::bigint
      and coalesce(case when jsonb_typeof(r.invited) = 'array' then jsonb_array_length(r.invited) end, 0)
          < coalesce(r.open_capacity, 4) - 1
    order by r.starts_at;
$$;
revoke execute on function public.fetch_open_matches() from public, anon;
grant execute on function public.fetch_open_matches() to authenticated;

-- ── 11) R-75 — Téléphone du réservant pour le gérant ─────────────────────────────
-- Le téléphone d'un créateur de MATCH OUVERT n'est pas stocké sur la résa (51, trigger
-- strip_open_match_phone) : le gérant le lit ici, AU TAP (jamais dans le miroir local). Lu dans
-- `profiles` (jamais exposé en direct) seulement si l'appelant gère le club de la résa ; null sinon.
create or replace function public.club_reservation_phone(p_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.phone
    from public.reservations r
    join public.profiles p on p.id = r.user_id
   where r.id = p_id and public.can_manage_club(r.club_id);
$$;
revoke execute on function public.club_reservation_phone(uuid) from public, anon;
grant execute on function public.club_reservation_phone(uuid) to authenticated;

-- ── 12) R-76 — Garde d'insertion : identité du réservant reprise du profil ───────
-- Recopie STRICTE de la 79 (live) hormis le bloc R-76 : quand un joueur réserve POUR LUI-MÊME
-- (auth.uid() = user_id), `booked_by_name` / `booked_by_phone` viennent de SON profil — un appel
-- forgé ne peut plus afficher un autre nom ou numéro au club. Les insertions faites par une RPC
-- pour autrui (respond_lesson : résa au nom de l'élève) gardent leurs valeurs, déjà lues en base ;
-- celle d'un cours collectif (padel.group_lesson) aussi. Ordre des triggers BEFORE INSERT
-- (alphabétique) : a0_reservations_insert_guard passe AVANT trg_strip_open_match_phone → le
-- téléphone d'un match ouvert est toujours retiré ensuite (51).
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
  -- R-76 : identité du réservant = son profil (jamais la valeur envoyée par le client).
  if auth.uid() is not null and auth.uid() = new.user_id
     and coalesce(current_setting('padel.group_lesson', true), '') <> 'on' then
    select nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), p.phone
      into new.booked_by_name, new.booked_by_phone
      from public.profiles p where p.id = new.user_id;
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

-- ── 13) R-78 · R-79 — Accès directs aux tables ───────────────────────────────────
-- R-78 : un INSERT direct dans blocked_users contournait « bloquer rompt l'amitié » (91) et le
-- retrait des invitations (R-52). Lecture de SES blocages seulement ; toute écriture passe par
-- block_user / unblock_user (SECURITY DEFINER, non concernées par ces droits).
drop policy if exists "blocked_users_rw_own" on public.blocked_users;
drop policy if exists "blocked_users_select_own" on public.blocked_users;
create policy "blocked_users_select_own" on public.blocked_users
  for select using (blocker_id = auth.uid());
revoke insert, update, delete on public.blocked_users from anon, authenticated;

-- R-79 : la clé publique seule (sans compte) lisait avis, coachs, créneaux bloqués (uuid du
-- gérant), annonces, agenda et boosts. L'app ne les lit qu'une fois connectée. On GARDE `anon`
-- sur clubs, club_overrides, club_status et club_config : le site vitrine les lit sans compte
-- (site/assets/site.js). Idempotent : un droit déjà retiré ne change rien.
revoke select on public.reviews, public.coaches, public.blocked_slots, public.club_news,
  public.events, public.club_boost from anon;
