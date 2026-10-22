-- 92 — FIDÉLITÉ, règle CIBLE (décision porteur 2026-10-21/22).
-- À coller dans Supabase → SQL Editor → Run APRÈS la 91. Idempotent, rejouable.
--
-- « 10 réservations CRÉÉES par le joueur et JOUÉES = −50 % sur son prochain match, plafonné à
-- 5 000 FCFA, offert par PadelConnect. » Ce qui change par rapport à la 82 :
--
-- 1) COMPTAGE : `my_loyalty` ne compte plus que les réservations dont le joueur est le CRÉATEUR
--    (`r.user_id`), jouées (créneau terminé) et encore 'booked' — plus les invitations acceptées.
--    Le compteur « toutes parties » (créateur OU invité accepté) reste exposé dans `played_all`
--    pour la tuile « Parties jouées » / trophées (K5), qui ne régressent donc pas.
--    ⚠️ AVANT de coller : `select count(*) from public.loyalty_claims;`. Les réclamations faites
--    sous la règle de la 82 (invitations comprises) GARDENT leur poids dans `claimed` : un joueur
--    qui a déjà réclamé repart de plus loin (sa 2ᵉ remise exige 20 réservations CRÉÉES). La carte
--    affiche alors sa progression RÉELLE (`loyaltyProgress`, jamais un 9/10 qui retombe à 0/10) ;
--    remettre ces comptes à zéro (base de départ) est une décision porteur, non prise ici.
-- 2) JUSTIFICATIF : chaque réclamation porte un CODE court lisible (6 caractères, alphabet sans
--    0/O/1/I), unique, que le joueur montre au club. Les réclamations antérieures sont dotées
--    d'un code à l'application (backfill), la colonne devient NOT NULL.
-- 3) SERVICE PAR LE CLUB : `club_serve_loyalty_claim(p_club_id, p_claim_code, p_amount,
--    p_match_price)` — réservé à `can_manage_club` — enregistre club, PRIX DU MATCH déclaré
--    (bornes de `reservations_price_guard`), montant (≤ moitié du prix ET ≤ plafond), serveur et
--    date. Le prix est TRACÉ (liste du club, Demandes opérateur) : une remise gonflée sur un
--    match moins cher devient visible et contestable au lieu d'être un simple montant.
--    Verrou de ligne (FOR UPDATE) : deux gérants qui servent le même code → le second lit
--    'already'. Le montant servi est DÉDUIT du décompte de commission du club sur la semaine
--    du service (`operator_loyalty_served`) et totalisé pour l'opérateur (`operator_loyalty_cost`).
-- 4) PLAFOND réglable par l'opérateur : `app_config.loyalty_cap` (défaut 5 000), écrit par
--    `set_loyalty_cap`, lu par `loyalty_cap()` (client, my_loyalty et la garde de service).
-- 5) `serve_loyalty_claim(p_id)` (82, opérateur) est CONSERVÉE pour les cas de secours : remise
--    en main propre par PadelConnect — ni club ni montant, donc rien n'est déduit à un club.
-- 6) PIÈCE FINANCIÈRE : une remise SERVIE survit à la suppression du compte du joueur (FK
--    `user_id` passée en ON DELETE SET NULL, nom affiché « Un joueur ») — sinon la déduction
--    disparaissait du décompte du club et PadelConnect ne la lui remboursait jamais. Une
--    réclamation NON servie part avec le compte (trigger BEFORE DELETE sur profiles).
-- 7) ANTI-DEVINETTE : le code est un jeton au porteur → `club_serve_loyalty_claim` est plafonné
--    à 30 essais / heure / compte (`rate_limit_hit`, famille des plafonds de la 94 — ⚠️ coller
--    92 → 94 dans la MÊME passe : avant la 94, servir un code échoue en « réessaie ») et le club
--    doit être CONNU du serveur (l'opérateur passe `can_manage_club` pour n'importe quel id).
-- 8) `set_app_config` et la clé `app_config.loyalty_reward` (82) sont GARDÉES volontairement :
--    la v1.0.2 publiée (build #68) lit ce texte sur la carte fidélité et l'écrit depuis l'Espace
--    opérateur. Le build #69 ne les utilise plus — à supprimer une fois le #69 adopté.
--
-- Recopies STRICTES des dernières définitions en base (toutes de la 82) hormis les points
-- ci-dessus. Types de retour changés (my_loyalty, my_loyalty_claims, fetch_loyalty_claims) →
-- drop + create, ACL reposées explicitement (un drop+create remet EXECUTE à PUBLIC).

-- ── 1) Colonnes de la réclamation ───────────────────────────────────────────────

alter table public.loyalty_claims add column if not exists code text;
alter table public.loyalty_claims add column if not exists club_id text;
alter table public.loyalty_claims add column if not exists amount integer;
alter table public.loyalty_claims add column if not exists served_by uuid references public.profiles (id) on delete set null;
alter table public.loyalty_claims add column if not exists match_price integer;

alter table public.loyalty_claims drop constraint if exists loyalty_claims_amount_chk;
alter table public.loyalty_claims add constraint loyalty_claims_amount_chk
  check (amount is null or amount between 1 and 1000000);
-- Prix du match déclaré par le club au service — mêmes bornes que reservations_price_guard (40).
alter table public.loyalty_claims drop constraint if exists loyalty_claims_match_price_chk;
alter table public.loyalty_claims add constraint loyalty_claims_match_price_chk
  check (match_price is null or match_price between 1000 and 1000000);
alter table public.loyalty_claims drop constraint if exists loyalty_claims_club_id_chk;
alter table public.loyalty_claims add constraint loyalty_claims_club_id_chk
  check (club_id is null or length(club_id) between 1 and 64);

-- Point 6 : la ligne SERVIE est une pièce du décompte du club → elle survit au compte (user_id
-- mis à NULL, la paire unique (user_id, cycle) tolère plusieurs NULL). Contrainte renommée à
-- l'identique : rejouable. La 82 l'avait créée en ON DELETE CASCADE (nom par défaut _fkey).
alter table public.loyalty_claims alter column user_id drop not null;
alter table public.loyalty_claims drop constraint if exists loyalty_claims_user_id_fkey;
alter table public.loyalty_claims add constraint loyalty_claims_user_id_fkey
  foreign key (user_id) references public.profiles (id) on delete set null;

-- … mais une réclamation NON servie (aucun argent engagé) part avec le compte : rien à garder,
-- et son code ne doit plus pouvoir être servi. BEFORE DELETE : passe AVANT le SET NULL de la FK,
-- y compris quand la suppression arrive en cascade de auth.users (delete_account).
create or replace function public.loyalty_claims_purge_unserved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.loyalty_claims lc where lc.user_id = old.id and not lc.served;
  return old;
end;
$$;
revoke execute on function public.loyalty_claims_purge_unserved() from public, anon, authenticated;

drop trigger if exists loyalty_claims_purge_unserved on public.profiles;
create trigger loyalty_claims_purge_unserved
  before delete on public.profiles
  for each row execute function public.loyalty_claims_purge_unserved();

-- Générateur de code : 6 caractères d'un alphabet sans ambiguïté (ni 0/O ni 1/I), unique dans
-- la table (boucle jusqu'à un code libre — 32⁶ ≈ 1 milliard de valeurs, la collision est rare).
-- Interne (jamais appelé par le client) : aucun grant.
create or replace function public.loyalty_new_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * 32)::int, 1);
    end loop;
    exit when not exists (select 1 from public.loyalty_claims lc where lc.code = v_code);
  end loop;
  return v_code;
end;
$$;

revoke execute on function public.loyalty_new_code() from public, anon, authenticated;

-- Backfill des réclamations antérieures à la 92 (une par une : chaque appel vérifie l'unicité),
-- puis NOT NULL + index unique — l'index est posé APRÈS le backfill, jamais sur des NULL.
do $$
declare r record;
begin
  for r in select lc.id from public.loyalty_claims lc where lc.code is null loop
    update public.loyalty_claims set code = public.loyalty_new_code() where id = r.id;
  end loop;
end;
$$;
alter table public.loyalty_claims alter column code set not null;
create unique index if not exists loyalty_claims_code_uniq on public.loyalty_claims (code);

-- ── 2) Plafond réglable (app_config.loyalty_cap) ────────────────────────────────

-- Plafond courant de la remise (FCFA). Lecture connectée : la carte joueur, la carte club et
-- l'Espace opérateur affichent le plafond RÉEL (jamais une constante client qui mentirait).
create or replace function public.loyalty_cap()
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select case when ac.value ~ '^\d{1,7}$' then ac.value::int end from public.app_config ac where ac.key = 'loyalty_cap'),
    5000);
$$;

-- Opérateur : règle le plafond. Bornes [100, 1 000 000] FCFA (une faute de frappe « 50 » ou
-- « 50 000 000 » est refusée, pas enregistrée). Idempotent (upsert).
create or replace function public.set_loyalty_cap(p_cap integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'operator') then
    return false;
  end if;
  if p_cap is null or p_cap < 100 or p_cap > 1000000 then return false; end if;
  insert into public.app_config (key, value) values ('loyalty_cap', p_cap::text)
    on conflict (key) do update set value = excluded.value, updated_at = now();
  return true;
end;
$$;

revoke execute on function public.loyalty_cap() from public, anon;
revoke execute on function public.set_loyalty_cap(integer) from public, anon;
grant execute on function public.loyalty_cap() to authenticated;
grant execute on function public.set_loyalty_cap(integer) to authenticated;

-- ── 3) Compteur : réservations CRÉÉES et jouées ─────────────────────────────────

-- Type de retour changé (colonnes `played_all` et `cap` ajoutées) → drop + create. Recopie
-- STRICTE de la 82 hormis : `played` = CRÉATEUR seul (règle cible) ; `played_all` = l'ancien
-- compteur (créateur OU invité accepté — base des +2 pts et de la tuile « Parties jouées ») ;
-- `cap` = plafond courant.
drop function if exists public.my_loyalty();
create function public.my_loyalty()
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
          and r.user_id = v_uid)::int,
      (select count(*) from public.reservations r
        where r.status = 'booked'
          and r.starts_at + (coalesce(r.duration_min, 90) * 60000) < v_now
          and (r.user_id = v_uid or exists (
                select 1 from public.reservation_participants rp
                where rp.reservation_id = r.id and rp.user_id = v_uid and rp.status = 'accepted')))::int,
      (select count(*) from public.loyalty_claims lc where lc.user_id = v_uid)::int,
      public.loyalty_cap();
end;
$$;

-- Réclamer le cycle suivant — principe INCHANGÉ (10 réservations de plus que les cycles déjà
-- réclamés). Recopie STRICTE de la 82 hormis le code généré à l'insertion et la CIBLE du
-- `on conflict` : (user_id, cycle) seulement — une collision (rarissime) sur l'index unique du
-- code lève 23505 → 'error' réessayable côté client, au lieu d'un 'ok' sans rien d'inséré.
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
begin
  if v_uid is null then return 'error'; end if;
  perform pg_advisory_xact_lock(hashtext('loyalty:' || v_uid::text));
  select played, claimed into v_played, v_claimed from public.my_loyalty();
  if v_played / 10 <= v_claimed then return 'not_yet'; end if;
  insert into public.loyalty_claims (user_id, cycle, code) values (v_uid, v_claimed + 1, public.loyalty_new_code())
    on conflict (user_id, cycle) do nothing;
  return 'ok';
end;
$$;

-- Mes cycles réclamés : + code (le justificatif à montrer), club et montant une fois servie.
-- Type de retour changé → drop + create. Recopie STRICTE de la 82 sinon.
drop function if exists public.my_loyalty_claims();
create function public.my_loyalty_claims()
returns table (cycle int, claimed_at timestamptz, served boolean, code text, club_id text, amount int)
language sql
security definer
set search_path = public
stable
as $$
  select lc.cycle, lc.claimed_at, lc.served, lc.code, lc.club_id, lc.amount
    from public.loyalty_claims lc
    where lc.user_id = auth.uid()
    order by lc.cycle desc
    limit 20;
$$;

revoke execute on function public.my_loyalty() from public, anon;
revoke execute on function public.claim_loyalty() from public, anon;
revoke execute on function public.my_loyalty_claims() from public, anon;
grant execute on function public.my_loyalty() to authenticated;
grant execute on function public.claim_loyalty() to authenticated;
grant execute on function public.my_loyalty_claims() to authenticated;

-- ── 4) Service par le CLUB ──────────────────────────────────────────────────────

-- Le joueur montre son code ; le gérant saisit le code et le PRIX du match, l'app en déduit le
-- montant RÉELLEMENT remis (−50 % du match, ≤ plafond). Le serveur rattache le montant au prix
-- déclaré : montant ≤ round(prix / 2) (même arrondi que `loyaltyDiscount`) — sinon 'invalid' —,
-- et TRACE ce prix (`match_price`). Le code est normalisé (casse, espaces, tirets) avant recherche.
-- Verrou de ligne : un double service (deux gérants, double-tap) rend 'already', jamais deux
-- déductions. Le club est passé EXPLICITEMENT (multi-clubs 55 : le gérant agit pour le club
-- affiché, l'opérateur n'a pas de club actif) et vérifié par can_manage_club.
-- Point 7 : can_manage_club est vrai pour l'opérateur QUEL QUE SOIT l'id → le club doit être
-- CONNU du serveur (club inscrit, ou fondateur doté d'un gérant / d'une config / d'une
-- surcharge) ; et le code étant un jeton au porteur, 30 essais / heure / compte (un comptoir en
-- sert quelques-uns par soirée ; deviner un code parmi ~1 milliard devient hors de portée).
-- Signature à 4 paramètres (prix du match) : l'éventuelle version à 3 (brouillon) est retirée.
drop function if exists public.club_serve_loyalty_claim(text, text, integer);
create or replace function public.club_serve_loyalty_claim(p_club_id text, p_claim_code text, p_amount integer, p_match_price integer)
returns text -- 'ok' | 'not_found' | 'already' | 'over_cap' | 'invalid' | 'forbidden' | 'rate_limited'
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_claim_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_claim record;
begin
  if auth.uid() is null or not public.can_manage_club(p_club_id) then return 'forbidden'; end if;
  if not (exists (select 1 from public.clubs c where c.id = p_club_id)
          or exists (select 1 from public.manager_clubs m where m.club_id = p_club_id)
          or exists (select 1 from public.club_config cc where cc.club_id = p_club_id)
          or exists (select 1 from public.club_overrides co where co.club_id = p_club_id)) then
    return 'forbidden';
  end if;
  if p_amount is null or p_amount < 1 then return 'invalid'; end if;
  if p_match_price is null or p_match_price < 1000 or p_match_price > 1000000
     or p_amount > round(p_match_price / 2.0) then
    return 'invalid';
  end if;
  if p_amount > public.loyalty_cap() then return 'over_cap'; end if;
  if length(v_code) <> 6 then return 'not_found'; end if;
  if public.rate_limit_hit(auth.uid(), 'loyalty_serve', 30, 'hour') then return 'rate_limited'; end if;
  select lc.id, lc.served into v_claim from public.loyalty_claims lc where lc.code = v_code for update;
  if v_claim.id is null then return 'not_found'; end if;
  if v_claim.served then return 'already'; end if;
  update public.loyalty_claims
    set served = true, served_at = now(), served_by = auth.uid(), club_id = p_club_id, amount = p_amount,
        match_price = p_match_price
    where id = v_claim.id;
  return 'ok';
end;
$$;

-- Gérant : les remises servies par SON club (les plus récentes d'abord) — la trace de ce qui
-- sera déduit de son décompte, avec le nom du joueur (remise en main propre) et le prix du match
-- déclaré. Type de retour changé (`match_price`) → drop + create (rejouable).
drop function if exists public.club_loyalty_served(text);
create function public.club_loyalty_served(p_club_id text)
returns table (id uuid, player_name text, code text, amount int, match_price int, served_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.can_manage_club(p_club_id) then return; end if;
  return query
    select lc.id,
           coalesce(nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), 'Un joueur'),
           lc.code, lc.amount, lc.match_price, lc.served_at
      from public.loyalty_claims lc
      left join public.profiles p on p.id = lc.user_id -- compte supprimé : la remise reste (point 6)
      where lc.club_id = p_club_id and lc.served and lc.amount is not null
      order by lc.served_at desc
      limit 30;
end;
$$;

revoke execute on function public.club_serve_loyalty_claim(text, text, integer, integer) from public, anon;
revoke execute on function public.club_loyalty_served(text) from public, anon;
grant execute on function public.club_serve_loyalty_claim(text, text, integer, integer) to authenticated;
grant execute on function public.club_loyalty_served(text) to authenticated;

-- ── 5) Opérateur : réclamations, secours, décompte et coût ──────────────────────

-- Réclamations (Demandes) : + code, club, montant et prix du match servis. Type de retour changé
-- → drop + create.
-- Recopie STRICTE de la 82 hormis la garde opérateur QUALIFIÉE (`p.id`, `p.role`) : la 82
-- écrivait `where id = auth.uid()` alors que `id` est AUSSI une colonne de sortie (returns
-- table) → 42702 « column reference "id" is ambiguous » à CHAQUE appel (prouvé en local) — la
-- liste « Fidélité à servir » de l'opérateur ne se chargeait donc jamais. Jointure profiles
-- passée en LEFT : une remise servie d'un compte supprimé reste listée (user_id NULL, point 6).
drop function if exists public.fetch_loyalty_claims();
create function public.fetch_loyalty_claims()
returns table (
  id uuid, user_id uuid, player_name text, cycle int, claimed_at timestamptz, served boolean,
  code text, club_id text, amount int, match_price int, served_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'operator') then
    return;
  end if;
  return query
    select lc.id, lc.user_id,
           coalesce(nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), 'Un joueur'),
           lc.cycle, lc.claimed_at, lc.served, lc.code, lc.club_id, lc.amount, lc.match_price, lc.served_at
      from public.loyalty_claims lc
      left join public.profiles p on p.id = lc.user_id -- compte supprimé : « Un joueur » (point 6)
      order by lc.served asc, lc.claimed_at desc
      limit 100;
end;
$$;

-- Secours opérateur (82) : remise en main propre par PadelConnect — sans club ni montant, rien
-- n'est déduit à un club. Recopie STRICTE de la 82 hormis `served_by` (trace de qui a servi).
create or replace function public.serve_loyalty_claim(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'operator') then
    return false;
  end if;
  update public.loyalty_claims set served = true, served_at = now(), served_by = auth.uid() where id = p_id and not served;
  return found;
end;
$$;

-- Remises servies par les CLUBS sur une période [p_from, p_to) : le client les regroupe par
-- club × semaine calendaire du SERVICE et les déduit du décompte de commission (operateur.tsx —
-- le décompte hebdo est calculé côté client depuis le miroir des résas, comme avant). Bornée.
create or replace function public.operator_loyalty_served(p_from timestamptz, p_to timestamptz)
returns table (club_id text, amount int, served_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'operator') then
    return;
  end if;
  return query
    select lc.club_id, lc.amount, lc.served_at
      from public.loyalty_claims lc
      where lc.served and lc.club_id is not null and lc.amount is not null
        and lc.served_at >= p_from and lc.served_at < p_to
      order by lc.served_at desc
      limit 2000;
end;
$$;

-- Coût total de la fidélité pour PadelConnect sur [p_from, p_to) (somme des remises servies par
-- les clubs, donc déduites de leurs décomptes) + nombre de remises. Exact (pas de limite).
create or replace function public.operator_loyalty_cost(p_from timestamptz, p_to timestamptz)
returns table (total bigint, served int)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'operator') then
    return;
  end if;
  return query
    select coalesce(sum(lc.amount), 0)::bigint, count(*)::int
      from public.loyalty_claims lc
      where lc.served and lc.club_id is not null and lc.amount is not null
        and lc.served_at >= p_from and lc.served_at < p_to;
end;
$$;

revoke execute on function public.fetch_loyalty_claims() from public, anon;
revoke execute on function public.serve_loyalty_claim(uuid) from public, anon;
revoke execute on function public.operator_loyalty_served(timestamptz, timestamptz) from public, anon;
revoke execute on function public.operator_loyalty_cost(timestamptz, timestamptz) from public, anon;
grant execute on function public.fetch_loyalty_claims() to authenticated;
grant execute on function public.serve_loyalty_claim(uuid) to authenticated;
grant execute on function public.operator_loyalty_served(timestamptz, timestamptz) to authenticated;
grant execute on function public.operator_loyalty_cost(timestamptz, timestamptz) to authenticated;
