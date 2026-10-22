-- 94 — Plafonds ANTI-ABUS par compte + coupe-circuit des diagnostics (audit pré-lancement
-- 2026-10, lot F2 ; chiffres validés par le porteur le 2026-10-22).
-- À coller dans Supabase → SQL Editor → Run APRÈS la 93. Idempotent, rejouable.
--
-- Personne ne doit pouvoir aspirer la liste des joueurs par numéro, harceler un membre par
-- demandes d'ami répétées, noyer l'opérateur de spam, ni remplir la base d'erreurs forgées.
-- Tout est côté SERVEUR (protège dès le collage, quel que soit le build installé) :
--
-- 1) COMPTEURS par (compte, action, fenêtre) — table `rate_counters` (patron recommandé par
--    Supabase) écrite UNIQUEMENT par `rate_limit_hit` (SECURITY DEFINER, interne). Fenêtres
--    FIXES en UTC (= heure d'Abidjan) : 'hour' ou 'day'. L'UPSERT verrouille la ligne du compte
--    → deux appels simultanés se sérialisent, aucune course possible sur le compteur. Ménage
--    borné aux lignes du compte à chaque appel (clé primaire) + purge globale > 2 j en tête de
--    `operator_diag_summary` : la table reste minuscule sans tâche planifiée.
-- 2) `find_player_by_phone` : 30 recherches / heure (compteur `phone_lookup`, PARTAGÉ avec
--    `send_friend_request` qui est une recherche déguisée) → `raise exception 'rate_limited'`
--    (la fonction renvoie une ligne, pas un texte : le code voyage dans le message d'erreur,
--    lu par le client `friends.ts`).
-- 3) `send_friend_request` : même compteur horaire (statut TEXTE 'rate_limited') ; 20 demandes
--    / jour (statut 'rate_limited_day') ; une demande REFUSÉE ne se ré-arme plus qu'après
--    7 JOURS (24 h avant) — toujours EN SILENCE : réponse 'sent' sans UPDATE, donc sans push,
--    l'expéditeur ne sait pas qu'il est temporisé ni que la personne a refusé.
-- 4) Triggers BEFORE INSERT à fenêtre JOURNALIÈRE : 5 messages support / jour, 10 signalements
--    d'avis / jour, 3 demandes de club / jour — clé = auth.uid(). Quand auth.uid() est NUL
--    (handle_new_user crée la demande d'un compte-club sous le rôle de l'Auth, sans JWT) le
--    trigger laisse passer : l'inscription compte-club n'est jamais cassée. Refus =
--    `raise exception 'rate_limited_day'` (SQLSTATE P0001) : il REMONTE à travers
--    `report_review` (qui ne renvoie donc pas `false` — un `false` serait affiché « réessaie »,
--    mensonge en boucle) et à travers les INSERT directs du client (support, club), qui lisent
--    le code dans le message d'erreur.
-- 5) `app_errors` / `app_events` : longueurs BORNÉES par CHECK (posés `not valid` puis validés
--    après purge des lignes hors bornes — le client borne déjà au même niveau), COUPE-CIRCUIT
--    > 300 lignes / 10 min (trigger BEFORE INSERT qui ABANDONNE la ligne en silence : un journal
--    de diagnostic ne doit jamais faire échouer l'app, et un bombardement ne remplit plus la
--    base ; `created_at` y est imposé par le serveur, jamais celui du client), PURGE > 30 jours
--    (et des dates futures forgées) en tête de `operator_diag_summary` (ouverture de l'Espace
--    opérateur, comme purge_old_resolved_support).
--
-- 6) 🔴 CORRECTIF au passage — `send_friend_request` (30/53, définition LIVE) référençait
--    `friend_id` et `status` NON QUALIFIÉS dans ses requêtes sur `friends` / `friend_requests`
--    alors que ce sont aussi ses colonnes de SORTIE (RETURNS TABLE) : PL/pgSQL lève
--    « 42702 column reference "friend_id" is ambiguous » dès que le numéro correspond à un vrai
--    compte non bloqué — reproduit sur Postgres 16 local avec la définition live byte-fidèle (les
--    branches 'not_found' et blocage, testées jusqu'ici, s'arrêtent AVANT la requête fautive).
--    Côté app : « Envoi impossible — réessaie dans un instant » en boucle. Requêtes qualifiées
--    (`f.`, `fr.`), AUCUN autre changement de logique. À vérifier en prod après collage
--    (transaction annulée) : `select * from public.send_friend_request('<numéro d'un autre compte>')`.
--
-- Reporté (décision plan) : plafond sur `join_open_match`.
-- Recopies STRICTES des dernières définitions en base (`find_player_by_phone` 13 — passée en
-- plpgsql, même signature ; `send_friend_request` 53 ; `operator_diag_summary` 39) hormis les
-- points ci-dessus. Aucun type de retour changé → aucun drop ; ACL re-posées explicitement.

-- ── 1) Compteurs par compte / action / fenêtre ──────────────────────────────────

create table if not exists public.rate_counters (
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null,                 -- 'phone_lookup', 'friend_request', 'support', 'review_report', 'club_request'
  bucket timestamp not null,            -- début de la fenêtre (UTC) : date_trunc('hour'|'day')
  n integer not null default 0,
  primary key (user_id, action, bucket)
);
alter table public.rate_counters enable row level security; -- aucune policy : seules les fonctions SECURITY DEFINER y touchent
revoke all on public.rate_counters from public, anon, authenticated;

-- Compte UN appel et dit si le plafond est DÉPASSÉ (true = refuser). Interne : jamais exposée.
-- Un compte nul (contexte sans JWT) ne compte pas et passe toujours.
create or replace function public.rate_limit_hit(p_user uuid, p_action text, p_limit integer, p_window text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamp := now() at time zone 'UTC';
  v_n integer;
begin
  if p_user is null then return false; end if;
  -- Ménage borné aux lignes de CE compte (clé primaire) : rien ne s'accumule entre deux purges.
  delete from public.rate_counters where user_id = p_user and bucket < v_now - interval '2 days';
  insert into public.rate_counters (user_id, action, bucket, n)
    values (p_user, p_action, date_trunc(p_window, v_now), 1)
    on conflict (user_id, action, bucket) do update set n = public.rate_counters.n + 1
    returning rate_counters.n into v_n;
  return v_n > p_limit;
end;
$$;
revoke execute on function public.rate_limit_hit(uuid, text, integer, text) from public, anon, authenticated;

-- ── 2) find_player_by_phone — 30 recherches / heure ─────────────────────────────
-- Recopie STRICTE de la 13 (même signature, même résultat), passée en plpgsql pour compter AVANT
-- de chercher. Plafond atteint → exception 'rate_limited' (le client la distingue du réseau).

create or replace function public.find_player_by_phone(p_phone text)
returns table(first_name text, last_name text, level numeric)
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.rate_limit_hit(auth.uid(), 'phone_lookup', 30, 'hour') then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  return query
    select p.first_name, p.last_name, p.level
    from public.profiles p
    where length(regexp_replace(p_phone, '\D', '', 'g')) >= 8
      and right(regexp_replace(p.phone, '\D', '', 'g'), 10) = right(regexp_replace(p_phone, '\D', '', 'g'), 10)
      and p.id <> auth.uid() -- on ne se trouve pas soi-même
    limit 1;
end;
$$;
revoke execute on function public.find_player_by_phone(text) from public, anon;
grant execute on function public.find_player_by_phone(text) to authenticated;

-- ── 3) send_friend_request — 30 recherches / h partagées, 20 demandes / j, silence 7 j ──
-- Recopie STRICTE de la 53 hormis : compteur horaire partagé (avant la recherche), plafond
-- journalier (avant tout envoi, silencieux compris), fenêtre de silence 24 h → 7 jours, et
-- qualification `f.` / `fr.` des colonnes homonymes des paramètres de sortie (point 6).

create or replace function public.send_friend_request(p_phone text)
returns table(status text, friend_id uuid, name text, level numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  fid uuid;
  reverse_id uuid;
  fname text;
  flevel numeric;
begin
  if length(regexp_replace(p_phone, '\D', '', 'g')) < 8 then
    return query select 'not_found'::text, null::uuid, null::text, null::numeric;
    return;
  end if;
  -- ANTI-ÉNUMÉRATION (94) : une demande d'ami est aussi une recherche par numéro → même compteur
  -- horaire que find_player_by_phone (30 / h, toutes recherches confondues).
  if public.rate_limit_hit(me, 'phone_lookup', 30, 'hour') then
    return query select 'rate_limited'::text, null::uuid, null::text, null::numeric;
    return;
  end if;
  select p.id into fid from public.profiles p
    where right(regexp_replace(p.phone, '\D', '', 'g'), 10) = right(regexp_replace(p_phone, '\D', '', 'g'), 10)
      and p.id <> me
    limit 1;
  if fid is null then
    return query select 'not_found'::text, null::uuid, null::text, null::numeric;
    return;
  end if;
  -- BLOCAGE (51) : dans un sens comme dans l'autre, aucune demande possible. On répond
  -- 'not_found' pour ne pas révéler le blocage à l'expéditeur.
  if exists (select 1 from public.blocked_users b
             where (b.blocker_id = fid and b.blocked_id = me)
                or (b.blocker_id = me and b.blocked_id = fid)) then
    return query select 'not_found'::text, null::uuid, null::text, null::numeric;
    return;
  end if;
  select trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), p.level
    into fname, flevel from public.profiles p where p.id = fid;

  -- Déjà amis ? (alias f : `friend_id` est aussi une colonne de SORTIE — sans lui, 42702)
  if exists (select 1 from public.friends f where f.user_id = me and f.friend_id = fid) then
    return query select 'already_friends'::text, fid, fname, flevel;
    return;
  end if;

  -- La personne m'a-t-elle DÉJÀ envoyé une demande ? → on accepte automatiquement (lien mutuel).
  select fr.id into reverse_id from public.friend_requests fr
    where fr.from_user = fid and fr.to_user = me and fr.status = 'pending' limit 1;
  if reverse_id is not null then
    update public.friend_requests set status = 'accepted', responded_at = now() where id = reverse_id;
    insert into public.friends (user_id, friend_id) values (me, fid), (fid, me) on conflict do nothing;
    return query select 'accepted'::text, fid, fname, flevel;
    return;
  end if;

  -- Ma demande existe-t-elle déjà (en attente) ?
  if exists (select 1 from public.friend_requests fr where fr.from_user = me and fr.to_user = fid and fr.status = 'pending') then
    return query select 'pending'::text, fid, fname, flevel;
    return;
  end if;
  -- ANTI-HARCÈLEMENT (94) : 20 demandes par jour, toutes personnes confondues (les envois
  -- silencieux ci-dessous comptent aussi : l'expéditeur ne doit rien pouvoir en déduire).
  if public.rate_limit_hit(me, 'friend_request', 20, 'day') then
    return query select 'rate_limited_day'::text, fid, fname, flevel;
    return;
  end if;
  -- ANTI-HARCÈLEMENT : une demande REFUSÉE ne peut être renvoyée qu'après 7 JOURS (94, 24 h
  -- avant). Réponse 'sent' silencieuse (aucun UPDATE → aucun push) : l'expéditeur ne sait pas
  -- qu'il est temporisé.
  if exists (select 1 from public.friend_requests fr
             where fr.from_user = me and fr.to_user = fid and fr.status = 'declined'
               and fr.responded_at > now() - interval '7 days') then
    return query select 'sent'::text, fid, fname, flevel;
    return;
  end if;
  insert into public.friend_requests (from_user, to_user, status, created_at, responded_at)
    values (me, fid, 'pending', now(), null)
    on conflict (from_user, to_user) do update set status = 'pending', created_at = now(), responded_at = null;
  return query select 'sent'::text, fid, fname, flevel;
end;
$$;
revoke execute on function public.send_friend_request(text) from public, anon;
grant execute on function public.send_friend_request(text) to authenticated;

-- ── 4) Plafonds JOURNALIERS à l'insertion : support 5 / j, signalements 10 / j, clubs 3 / j ──
-- Une seule fonction trigger, paramétrée (action, plafond) ; auth.uid() nul = laisser passer.
-- SECURITY DEFINER : l'inséreur (authenticated) n'a aucun droit sur rate_limit_hit ni sur la
-- table des compteurs — c'est voulu.

create or replace function public.rate_limit_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return new; end if;
  -- Re-signalement du MÊME avis : report_review fait ON CONFLICT DO NOTHING, mais un BEFORE
  -- INSERT se déclenche quand même → sans cette garde, un doublon qui n'insère rien mangerait le
  -- quota. IF imbriqué : `new.review_id` n'est analysé que pour review_reports.
  if tg_table_name = 'review_reports' then
    if exists (select 1 from public.review_reports r
               where r.review_id = new.review_id and r.reporter_id = new.reporter_id) then
      return new;
    end if;
  end if;
  if public.rate_limit_hit(auth.uid(), tg_argv[0], tg_argv[1]::integer, 'day') then
    raise exception 'rate_limited_day' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists support_messages_rate_limit on public.support_messages;
create trigger support_messages_rate_limit
  before insert on public.support_messages
  for each row execute function public.rate_limit_insert_guard('support', '5');

drop trigger if exists review_reports_rate_limit on public.review_reports;
create trigger review_reports_rate_limit
  before insert on public.review_reports
  for each row execute function public.rate_limit_insert_guard('review_report', '10');

drop trigger if exists club_requests_rate_limit on public.club_requests;
create trigger club_requests_rate_limit
  before insert on public.club_requests
  for each row execute function public.rate_limit_insert_guard('club_request', '3');

-- ── 5) Diagnostics : longueurs bornées, coupe-circuit, purge ────────────────────
-- CHECK posés `not valid` (aucun verrou long, aucun balayage à la pose), lignes hors bornes
-- purgées (forgées ou antérieures au bornage client), puis `validate` — la validation d'une
-- contrainte déjà validée est un non-événement : rejouable. Bornes = celles du client
-- (diagnostics.ts) : message 1000, stack 4000, context 200, plateforme/version 40, nom 80,
-- props 2000 (texte jsonb `props::text`, que le client majore : espace après « : » et « , »).

do $$
declare c record;
begin
  for c in
    select * from (values
      ('app_errors', 'app_errors_message_len',     'length(message) <= 1000'),
      ('app_errors', 'app_errors_stack_len',       'stack is null or length(stack) <= 4000'),
      ('app_errors', 'app_errors_context_len',     'context is null or length(context) <= 200'),
      ('app_errors', 'app_errors_platform_len',    'platform is null or length(platform) <= 40'),
      ('app_errors', 'app_errors_app_version_len', 'app_version is null or length(app_version) <= 40'),
      ('app_events', 'app_events_name_len',        'length(name) <= 80'),
      ('app_events', 'app_events_props_len',       'props is null or length(props::text) <= 2000'),
      ('app_events', 'app_events_platform_len',    'platform is null or length(platform) <= 40')
    ) as v(tbl, cname, expr)
  loop
    if not exists (
      select 1 from pg_constraint
      where conname = c.cname and conrelid = ('public.' || c.tbl)::regclass
    ) then
      execute format('alter table public.%I add constraint %I check (%s) not valid', c.tbl, c.cname, c.expr);
    end if;
    execute format('delete from public.%I where not (%s)', c.tbl, c.expr);
    execute format('alter table public.%I validate constraint %I', c.tbl, c.cname);
  end loop;
end $$;

-- Coupe-circuit : au-delà de 300 lignes sur les 10 dernières minutes (toutes sources
-- confondues), la ligne est ABANDONNÉE (return null) sans erreur : l'app n'en sait rien, la
-- base ne grossit plus. Coût par insert : un parcours borné de l'index `*_created_idx`
-- (offset 299 → au plus 300 entrées lues ; une 300ᵉ ligne existante = plafond atteint, la 301ᵉ
-- est abandonnée). SECURITY DEFINER : l'inséreur n'a pas le SELECT.
-- `created_at` est IMPOSÉ par le serveur avant le comptage : le client (anon compris) peut le
-- fournir, et une date ancienne contournait le plafond quand une date future (jamais purgée)
-- le saturait pour de bon. diagnostics.ts ne l'envoie jamais → aucun impact sur l'app.

create or replace function public.diag_circuit_breaker()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.created_at := now();
  if tg_table_name = 'app_errors' then
    perform 1 from public.app_errors where created_at > now() - interval '10 minutes' offset 299 limit 1;
  else
    perform 1 from public.app_events where created_at > now() - interval '10 minutes' offset 299 limit 1;
  end if;
  if found then return null; end if;
  return new;
end;
$$;

drop trigger if exists app_errors_circuit_breaker on public.app_errors;
create trigger app_errors_circuit_breaker
  before insert on public.app_errors
  for each row execute function public.diag_circuit_breaker();

drop trigger if exists app_events_circuit_breaker on public.app_events;
create trigger app_events_circuit_breaker
  before insert on public.app_events
  for each row execute function public.diag_circuit_breaker();

-- operator_diag_summary — recopie STRICTE de la 39 hormis la PURGE en tête (> 30 jours pour les
-- deux journaux, > 2 jours pour les compteurs anti-abus), après le contrôle du rôle.

create or replace function public.operator_diag_summary()
returns table(errors_7d integer, events_7d integer, top_context text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'operator') then
    return; -- pas opérateur → aucune ligne (l'app affiche « indisponible »)
  end if;
  -- Rétention (94) : 30 jours de journaux suffisent à la carte « Santé de l'app » (fenêtre 7 j).
  -- Les lignes datées dans le FUTUR (forgées avant que diag_circuit_breaker n'impose created_at)
  -- partent aussi : sinon elles survivraient à jamais et fausseraient compteurs et top contexte.
  delete from public.app_errors
    where created_at < now() - interval '30 days' or created_at > now() + interval '1 day';
  delete from public.app_events
    where created_at < now() - interval '30 days' or created_at > now() + interval '1 day';
  delete from public.rate_counters where bucket < (now() at time zone 'UTC') - interval '2 days';
  return query
    select
      (select count(*)::integer from public.app_errors e where e.created_at > now() - interval '7 days'),
      (select count(*)::integer from public.app_events v where v.created_at > now() - interval '7 days'),
      (select e.context from public.app_errors e
         where e.created_at > now() - interval '7 days' and e.context is not null
         group by e.context order by count(*) desc limit 1);
end;
$$;
revoke execute on function public.operator_diag_summary() from public, anon;
grant execute on function public.operator_diag_summary() to authenticated;
