---
name: padel-preuve-en-base
description: Prouver une migration SQL ou un déploiement de notify-club PadelConnect AVANT de les déclarer appliqués — Postgres 16 local (courses à 2 sessions comprises), puis production via l'API Management Supabase en transaction annulée, ACL, 11 webhooks, déploiement de l'Edge Function, RESET avant ouverture publique. À utiliser dès qu'un `supabase/NN_*.sql` ou `supabase/functions/notify-club/index.ts` est écrit ou modifié, ou avant d'écrire « appliqué » dans CLAUDE.md.
---

# Preuve en base

« Écrite » ≠ « appliquée » ≠ « prouvée » : CLAUDE.md §8 n'écrit « appliquée » qu'avec « prouvée N/N ».
Bonnes pratiques : `supabase-postgres-best-practices`. Si `supabase` conseille CLI, `supabase/migrations` ou
`SECURITY INVOKER` : le projet garde `supabase/NN_*.sql` et des RPC `SECURITY DEFINER` + `auth.uid()` + ACL (§8).

## 0. Écrire la migration

- Dernière définition live d'une fonction = plus grand numéro :
  `grep -ln "function public.<f>" supabase/*.sql | sort -V | tail -1`. La recopier STRICTEMENT puis
  modifier (commentaire « Recopie STRICTE de la version live hormis … ») ; en cas de doute, comparer à
  la prod : `select pg_get_functiondef('public.<f>(<types>)'::regprocedure);` (§2). En-tête : numéro, but, « À coller APRÈS la NN. Idempotent, rejouable. »
- Type de retour changé → `drop function if exists public.<f>(<types>);` juste avant (sinon `42P13`).
- Pour CHAQUE fonction créée ou recréée (un drop+create remet `EXECUTE` à PUBLIC) — sauf fonctions
  trigger ; `phone_available` reste la SEULE RPC ouverte à anon (84) :

```sql
revoke execute on function public.<f>(<types>) from public, anon;
grant execute on function public.<f>(<types>) to authenticated;
```

## 1. Preuve locale (Postgres 16)

```bash
pg_ctlcluster 16 main start
sudo -u postgres psql -q -c "drop database if exists proof" -c "create database proof"
install -d -m 755 /tmp/pgproof               # postgres ne traverse PAS le scratchpad (drwx------)
install -m 644 supabase/NN_x.sql /tmp/pgproof/
P="sudo -u postgres psql -v ON_ERROR_STOP=1 -d proof -Atq"
$P -f /tmp/pgproof/00_socle.sql && $P -f /tmp/pgproof/NN_x.sql   # variante : $P -f - < supabase/NN_x.sql
```

Socle minimal `/tmp/pgproof/00_socle.sql` (jamais dans le dépôt) :

```sql
do $$ declare r text; begin foreach r in array array['anon', 'authenticated', 'service_role'] loop
  if not exists (select 1 from pg_roles where rolname = r) then execute format('create role %I nologin', r); end if;
end loop; end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text,
  raw_user_meta_data jsonb default '{}'::jsonb, email_confirmed_at timestamptz, created_at timestamptz default now());
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid $$;
grant usage on schema public, auth to anon, authenticated, service_role;
create extension if not exists btree_gist;
```

- Ne PAS rejouer `02`→`90` (`schema.sql` est historique) : créer seulement les tables/colonnes que la
  migration touche, recopiées de la prod
  (`select column_name, data_type, is_nullable, column_default from information_schema.columns where table_name = '<t>' order by ordinal_position`).
- Un cas = une assertion nommée qui lève `ÉCHEC cas N`, utilisateur simulé par `request.jwt.claims` (§2) ;
  puis une **contre-épreuve** : le même cas sur l'ANCIENNE définition doit échouer (le test teste).
- **Course à 2 sessions** (verrous, `for update`, TOCTOU) — B doit ATTENDRE A puis voir son état :

```bash
CA="select set_config('request.jwt.claims', '{\"sub\":\"<uuid-A>\",\"role\":\"authenticated\"}', false);"
( $P -c "$CA begin; select public.<f_a>(…); select pg_sleep(1.5); commit;" & )
$P -c "select pg_sleep(0.3)" > /dev/null            # laisser A prendre son verrou
$P -c "<claims B> select public.<f_b>(…);"
wait; $P -c "select … ;"                            # état final attendu (ex. joiner préservé)
```

Rejouer SANS le verrou pour montrer l'écrasement (contre-épreuve de la course C2). Nettoyage :
`sudo -u postgres psql -qc "drop database proof"`, `rm -rf /tmp/pgproof`, `pg_ctlcluster 16 main stop`.

## 2. Production — API Management (PAT du porteur)

PAT fourni par le porteur pour la session, lu depuis `SUPABASE_PAT` ; jamais écrit dans un fichier, un
commit, un rapport, ni recopié d'une sortie. Sans PAT : migration « écrite, à coller » (§5).

```bash
REF=$(grep -oP "https://\K[a-z]+(?=\.supabase\.co)" src/lib/supabase.ts)
q() { jq -n --arg q "$1" '{query: $q}' | curl -sS -X POST \
  "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_PAT" -H "Content-Type: application/json" --data-binary @-; }
q "$(cat supabase/NN_x.sql)"        # appliquer : plusieurs instructions = UNE transaction implicite
```

**Preuve en transaction annulée** (patron des campagnes) — succès = réponse en ERREUR contenant `TEST_OK` :

```sql
do $$
declare u1 uuid := gen_random_uuid(); r text; n int := 0;
begin
  insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at)
    values (u1, 'preuve-' || u1 || '@example.invalid', '{"first_name":"Preuve"}', now()); -- handle_new_user crée profiles
  -- alter table public.reservations disable trigger user;   -- seulement si une fixture DOIT contourner une garde
  -- insert into public.reservations (…, starts_at, …) values (…, (extract(epoch from now()) * 1000)::bigint + 30::bigint * 86400000, …);
  -- alter table public.reservations enable trigger user;
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  r := public.<f>(…); if r is distinct from 'ok' then raise exception 'ÉCHEC cas 1 : %', r; end if; n := n + 1;
  raise exception 'TEST_OK %/% assertions', n, n;     -- annule TOUT : aucune trace en prod
end $$;
```

Pièges vécus :

- `30*86400000` déborde `integer` → `30::bigint * 86400000` (`starts_at` = ms epoch en `bigint`).
- `profiles.first_name` / `last_name`, pas `name` ; pas de `phone` en fixture (`PHONE_TAKEN`, `profiles_phone10_uniq`).
- `disable trigger user` = verrou ACCESS EXCLUSIVE sur la table de PROD : bloc court, réactivation dans le bloc,
  puis `select tgname, tgenabled from pg_trigger where tgrelid = 'public.<t>'::regclass and not tgisinternal;` → tous `O`.
- Écrire `level` exige `set_config('padel.level_write', 'on', true)` (protect_level 34/80) ; supprimer
  dans `storage.objects` exige `set_config('storage.allow_delete_query', 'true', true)` (83).
- Exécuter CHAQUE branche modifiée : `create or replace` accepte un corps qui échouera à l'appel
  (tour 4 : `UPDATE … FROM LATERAL` référant la table cible).

**Catalogue après application** — attendu : `prosecdef = t`, `proconfig = {search_path=public}`,
`anon_exec = f`, `auth_exec = t` ; le balayage global ne doit renvoyer que `phone_available` :

```sql
select p.oid::regprocedure, p.prosecdef, p.proconfig,
       has_function_privilege('anon', p.oid, 'execute') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'execute') as auth_exec
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('<f1>', '<f2>');
-- balayage global des fuites anon
select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef and p.prorettype <> 'trigger'::regtype
  and has_function_privilege('anon', p.oid, 'execute');
```

## 3. Les 11 webhooks

```sql
select c.relname as tbl, t.tgname, (t.tgtype & 4) > 0 as ins, (t.tgtype & 16) > 0 as upd,
       position('x-webhook-secret' in pg_get_triggerdef(t.oid)) > 0 as secret
from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_proc p on p.oid = t.tgfoid
where p.proname = 'http_request' and not t.tgisinternal order by 1;
```

Attendu : 11 lignes, `secret = t` partout ; INSERT+UPDATE sur `reservations`, `reservation_participants`,
`competitions`, `friend_requests`, `lessons`, `coaches`, `match_results`, `operator_news`, `events`,
`share_payments` ; INSERT seul sur `club_news`. ⚠️ Ne JAMAIS afficher `pg_get_triggerdef` en clair : il
contient le secret. Un 12ᵉ webhook se clone (même URL, même en-tête) et s'ajoute à `docs/PUSH-SETUP.md`
et à la liste de rotation de `docs/AUDIT-SERVEUR.md` §3.

## 4. notify-club

```bash
npx esbuild supabase/functions/notify-club/index.ts --log-level=warning > /dev/null   # syntaxe
F="https://api.supabase.com/v1/projects/$REF/functions"
S=$(curl -sS "$F/notify-club" -H "Authorization: Bearer $SUPABASE_PAT"); echo "$S" | jq '{version, status, verify_jwt}'
VJ=$(echo "$S" | jq '.verify_jwt')                  # valeur LUE, jamais basculée
curl -sS -X POST "$F/deploy?slug=notify-club" -H "Authorization: Bearer $SUPABASE_PAT" \
  -F "metadata={\"entrypoint_path\":\"index.ts\",\"name\":\"notify-club\",\"verify_jwt\":$VJ};type=application/json" \
  -F 'file=@supabase/functions/notify-club/index.ts;filename=index.ts'
```

Contrôle : relire → `version` = précédente + 1, `status = ACTIVE`, `verify_jwt` inchangé. Le compteur
plateforme diffère du libellé « vNN » du dépôt (plateforme 44 = dépôt v45) : noter les deux.
Sans PAT : Dashboard → Edge Functions → notify-club → Edit → tout remplacer → Deploy.

## 5. Ordre de collage, porteur sans terminal, RESET

- Ordre strict des numéros ; N suppose N-1 en base. Jamais un vieux fichier seul : si N doit être
  recollé, recoller ensuite N+1 → dernier. La 68 jamais seule ; `21`/`68`/`83`/`85` s'arrêtent sur
  `42P13` depuis 87/90 (drop function d'abord, puis la suite dans l'ordre).
- Une migration qui change une signature appelée par l'app passe AVANT l'installation du build.
- Étapes porteur : Dashboard → SQL Editor → New query → coller TOUT le fichier → Run → « Success.
  No rows returned », puis lui faire coller la requête catalogue du §2 pour confirmer.
- `RESET-DONNEES-TEST.sql` : IRRÉVERSIBLE, une fois, avant l'ouverture publique, sur décision explicite
  du porteur. SECTION 1 (aperçu, lecture seule) → lui montrer les chiffres → SECTION 2 seulement sur son
  feu vert (elle pose elle-même `padel.level_write`, préserve `role = 'operator'`). Ensuite : re-saisir
  lien Wave, frais de tournoi, récompense fidélité. Toute nouvelle table d'activité entre dans les DEUX
  sections, re-prouvées en local (avec et sans GUC).

## Fait quand

- Preuve locale verte (contre-épreuve, course si verrou) ET DO-block de prod `TEST_OK N/N`.
- Migration appliquée, catalogue conforme (corps, `prosecdef`, `search_path`, ACL), triggers réactivés vérifiés.
- Webhooks 11/11 conformes ; notify-club version +1, `ACTIVE`, `verify_jwt` inchangé.
- CLAUDE.md §8 (« 02 → NN — toutes appliquées », date, « prouvée N/N ») et §7/§10 si besoin, en-tête
  de `docs/AUDIT-SERVEUR.md`, versions notify-club (dépôt + plateforme) mis à jour.
- Aucun PAT, secret ni `pg_get_triggerdef` dans un fichier, un commit ou un rapport.
