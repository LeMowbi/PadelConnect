// Test de logique — invariants des migrations supabase/96_regles_reservations_scores.sql et
// supabase/97_tournois_clubs_comptes.sql (audit des règles métier 2026-10-22, lot M2) et de leur
// pendant dans notify-club v49 :
//   node --experimental-strip-types tests/regles9697Sql.test.ts
// Lecture STATIQUE (les preuves d'exécution vivent dans la compétence padel-preuve-en-base). Ce qui
// ne doit jamais revenir : (1) un drop+create ou un oubli qui rouvre EXECUTE à PUBLIC/anon (84) ;
// (2) un type de retour changé sur une RPC appelée par la v1.0.2 publiée (elle compare `=== true`) ;
// (3) une garde retirée par une recopie (niveau par joueur, blocages, fenêtres, orphelins…) ;
// (4) un marqueur partagé SQL ↔ notify-club qui diverge (le push ne partirait plus, en silence).

import { readFileSync } from 'node:fs';

let failed = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? '✓' : '✗ ÉCHEC'} ${msg}`);
  if (!cond) failed++;
};
const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

const sql96 = read('supabase/96_regles_reservations_scores.sql');
const sql97 = read('supabase/97_tournois_clubs_comptes.sql');
const notify = read('supabase/functions/notify-club/index.ts');
const reset = read('supabase/RESET-DONNEES-TEST.sql');
const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };

// Corps d'une fonction : de sa création jusqu'au `$$;` qui la ferme.
const body = (sql: string, name: string) => {
  const start = sql.search(new RegExp(`create (or replace )?function public\\.${name}\\(`));
  if (start < 0) return '';
  const open = sql.indexOf('as $$', start);
  return sql.slice(start, sql.indexOf('$$;', open + 5) + 3);
};
// Toutes les fonctions créées (nom + types d'arguments, sans noms ni défauts).
const created = (sql: string) =>
  [...sql.matchAll(/create (?:or replace )?function public\.(\w+)\(([^)]*)\)\s*returns (\w+)/g)].map((m) => ({
    name: m[1],
    args: m[2]
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean)
      .map((a) => a.replace(/\s+default\s+.*$/i, '').split(/\s+/)[1])
      .join(', '),
    returns: m[3],
  }));

// ── (1) ACL : chaque RPC (non trigger) recréée → anon fermé, authenticated ouvert ──
for (const [label, sql] of [
  ['96', sql96],
  ['97', sql97],
] as const) {
  for (const f of created(sql)) {
    if (f.returns === 'trigger') continue;
    const sig = `public.${f.name}(${f.args})`.replace(/[()[\]]/g, '\\$&').replace(/\./g, '\\.');
    if (f.name === 'apply_match_level') {
      check(
        new RegExp(`revoke execute on function ${sig} from public, anon, authenticated;`).test(sql) &&
          !new RegExp(`grant execute on function ${sig}`).test(sql),
        `${label} : apply_match_level reste INTERNE (fermée à tous, comme en live)`,
      );
      continue;
    }
    check(
      new RegExp(`revoke execute on function ${sig} from public, anon;`).test(sql) &&
        new RegExp(`grant execute on function ${sig} to authenticated;`).test(sql),
      `${label} : ACL de ${f.name}(${f.args}) re-posées`,
    );
    check(
      /security definer\s+set search_path = public/.test(body(sql, f.name)),
      `${label} : ${f.name} SECURITY DEFINER + search_path figé`,
    );
  }
}

// ── (2) Signatures et types de retour de la v1.0.2 INCHANGÉS ──
const sigs = [...created(sql96), ...created(sql97)];
const expectSig = (name: string, args: string, returns: string) => {
  const f = sigs.find((s) => s.name === name);
  check(!!f && f.args === args && f.returns === returns, `signature v1.0.2 : ${name}(${args}) → ${returns}`);
};
expectSig('respond_invitation', 'uuid, boolean', 'boolean');
expectSig('cancel_reservation', 'uuid', 'boolean');
expectSig('set_club_confirmed', 'uuid, boolean', 'boolean');
expectSig('mark_no_show', 'uuid, boolean', 'text');
expectSig('request_lesson', 'uuid, text, text, text, text, text, text, bigint, integer, integer', 'uuid');
expectSig('block_user', 'uuid', 'boolean');
expectSig('close_competition', 'uuid, text, text, text, text', 'boolean');
expectSig('delete_competition', 'uuid', 'boolean');
expectSig('approve_competition', 'uuid', 'boolean');
expectSig('block_recurring', 'text, text, text, integer, text[], text', 'jsonb');
expectSig('delete_account', '', 'void');
expectSig('delete_club', 'text', 'boolean');
expectSig('approve_club_request', 'uuid', 'text');
expectSig('grant_club_access_by_phone', 'text, text', 'text');
expectSig('revoke_club_access_by_phone', 'text', 'text');
check(
  [...sql96.matchAll(/drop function if exists ([^;]+);/g)].map((m) => m[1]).join('|') === 'public.fetch_open_matches()',
  '96 : un seul drop function (fetch_open_matches, colonne `price` ajoutée)',
);
check(
  [...sql97.matchAll(/drop function if exists ([^;]+);/g)].map((m) => m[1]).join('|') === 'public.unblock_recurring(text, text, text)',
  '97 : un seul drop function (unblock_recurring, NOUVELLE de la 97, gagne p_dow — aucune fonction live touchée)',
);
check(
  /open_level_max numeric, price integer\)/.test(body(sql96, 'fetch_open_matches')),
  '96 : `price` en DERNIÈRE colonne de fetch_open_matches',
);

// ── (3) Gardes des correctifs ──
const level = body(sql96, 'apply_match_level');
check(!/where reservation_id = p_reservation_id\) then\s+return true;/.test(level), 'R-03 : plus de court-circuit « match déjà appliqué »');
check(
  (level.match(/if not found then continue;/g) ?? []).length === 2,
  'R-03 : niveau modifié seulement si la ligne d’historique est neuve (2 camps)',
);
check(/coalesce\(lh\.level_before, p\.level\)/.test(level), 'R-03 : delta figé sur le niveau d’AVANT le match');
check(/lh\.user_id = v_uid/.test(body(sql96, 'reconcile_my_levels')), 'R-03 : reconcile_my_levels filtré par joueur');
const invite = body(sql96, 'respond_invitation');
check(
  /r\.status = 'booked'/.test(invite) && /blocked_users/.test(invite),
  'R-21 / R-52 : acceptation refusée hors booked et entre bloqués',
);
check(/jsonb_set\(t\.e, '\{confirmed\}', 'true'::jsonb\)/.test(invite), 'R-16 : `confirmed` posé à l’acceptation');
check(
  /status = 'invited'/.test(body(sql96, 'block_user')) && /for update/.test(body(sql96, 'block_user')),
  'R-52 : block_user retire les invitations sous verrou',
);
const cancel = body(sql96, 'cancel_reservation');
check(
  /for update/.test(cancel) && /and status = 'booked';\s+return found;/.test(cancel),
  'R-24 : annulation joueur verrouillée et atomique',
);
check(/and status = 'booked';\s+return found;/.test(body(sql96, 'set_club_confirmed')), 'R-21 : confirmation d’une résa active seulement');
check(/48 \* 3600000::bigint/.test(body(sql96, 'mark_no_show')), 'R-21 : « pas venu » borné à la fin + 48 h');
const lesson = body(sql96, 'request_lesson');
check(
  /v_starts := public\.slot_start_ms\(p_date_key, p_time\)/.test(lesson) && !/, p_starts_at, p_price/.test(lesson),
  'R-27 : début du cours recalculé, p_starts_at ignoré',
);
check(/blocked_users/.test(lesson), 'R-27 : demande de cours refusée entre bloqués');
check(
  /cancelled_by = 'coach'/.test(body(sql96, 'coach_cancel_lesson')) && /'club_cancelled'/.test(body(sql96, 'coach_cancel_lesson')),
  'R-19 : coach_cancel_lesson sans pénalité, auteur tracé',
);
check(
  /after insert or update of status on public\.reservation_participants/.test(sql96),
  'R-20 : purge d’attente sur rejoindre / accepter',
);
check(/'Un joueur'/.test(body(sql96, 'fetch_my_match_scores')), 'R-32 : nom d’un bloqué masqué');
check(
  (sql96.match(/coalesce\(p\.role, 'player'\) <> 'operator'/g) ?? []).length === 2 &&
    !/coalesce\(p\.role, 'player'\) = 'player'/.test(sql96),
  'R-33 : gérant classé, opérateur exclu (classement ET rang)',
);
check(/can_manage_club\(r\.club_id\)/.test(body(sql96, 'club_reservation_phone')), 'R-75 : téléphone réservé au gérant du club');
check(
  /into new\.booked_by_name, new\.booked_by_phone/.test(body(sql96, 'reservations_insert_guard')),
  'R-76 : identité du réservant reprise du profil',
);
check(
  /create policy "blocked_users_select_own" on public\.blocked_users\s+for select/.test(sql96) &&
    /revoke insert, update, delete on public\.blocked_users from anon, authenticated;/.test(sql96),
  'R-78 : blocked_users en lecture seule',
);
const r79 = sql96.slice(sql96.indexOf('revoke select on public.reviews'));
check(
  ['reviews', 'coaches', 'blocked_slots', 'club_news', 'events', 'club_boost'].every((t) => r79.includes(`public.${t}`)) &&
    !/revoke select on [^;]*public\.(clubs|club_overrides|club_status|club_config)\b/.test(sql96),
  'R-79 : anon fermé sur 6 tables, GARDÉ sur celles du site vitrine',
);

check(/'cancelled'\]\)\)/.test(sql97) && /add column if not exists cancel_reason text/.test(sql97), 'R-05 : statut cancelled + motif');
const cc = body(sql97, 'cancel_competition');
check(
  ["'ok'", "'gone'", "'forbidden'", "'played'", "'reason'"].every((c) => cc.includes(c)) && /hashtext\('reg:'/.test(cc),
  'R-05 : codes de cancel_competition + verrou partagé avec l’inscription',
);
check(
  /where c\.status <> 'cancelled'/.test(body(sql97, 'fetch_competitions')),
  'R-05 : fetch_competitions ne renvoie JAMAIS un tournoi annulé',
);
for (const f of ['close_competition', 'delete_competition']) {
  const b = body(sql97, f);
  check(
    /coalesce\(v_owner = auth\.uid\(\), false\) or public\.can_manage_club\(v_club\)/.test(b) && !/if v_owner is null then/.test(b),
    `R-04 : ${f} sur l’ID (orphelin géré, jamais « tout compte »)`,
  );
}
const close = body(sql97, 'close_competition');
check(/>= to_char\(\(now\(\) at time zone 'utc'\)::date, 'YYYY-MM-DD'\)/.test(close), 'R-38 : clôture refusée avant la fin');
check((close.match(/'tournament'\)/g) ?? []).length === 2, 'R-31 : vainqueur et dernier inscrits dans l’historique de niveau');
check(
  /v_date::date <= \(now\(\) at time zone 'utc'\)::date then return false/.test(body(sql97, 'approve_competition')),
  'R-36 : validation refusée le jour même ou après',
);
check(
  /v_start <= \(now\(\) at time zone 'utc'\)::date then/.test(body(sql97, 'competitions_date_range_guard')),
  'R-39 : jamais un tournoi créé pour aujourd’hui',
);
check(/c\.status = 'published'/.test(body(sql97, 'upsert_club_config')), 'R-40 : terrain d’un tournoi publié non retirable');
const br = body(sql97, 'block_recurring');
check(!/do update/.test(br) && /'taken', to_jsonb\(v_taken\)/.test(br), 'R-43 : la série n’écrase plus rien, clé `taken`');
check(
  /reason = 'Récurrent'/.test(body(sql97, 'unblock_recurring')) && /blocked_slot_notes/.test(body(sql97, 'unblock_recurring')),
  'R-06 : arrêt de série (notes comprises)',
);
check(
  /extract\(dow from b\.date_key::date\)::int = p_dow/.test(body(sql97, 'unblock_recurring')) &&
    /drop function if exists public\.unblock_recurring\(text, text, text\)/.test(sql97),
  'R-06 : arrêt de série limité à SON jour de la semaine (mardi ≠ jeudi)',
);
const del = body(sql97, 'delete_account');
check(/raise exception 'operator_account'/.test(del), 'R-58 : le compte opérateur ne se supprime pas');
check(
  /organizer_name = 'Compte supprimé', organizer_phone = null/.test(del) &&
    /support_messages set name = null, contact_phone = null/.test(del),
  'R-07 : données personnelles anonymisées',
);
check(/lesson_cancel_notices/.test(del) && /'Coach indisponible'/.test(del), 'R-53 : cours du coach annulés sans pénalité, élèves notés');
check(
  /for update;\s+update public\.reservations r\s+set invited = f\.arr/.test(del),
  'delete_account : verrou de ligne AVANT la table dérivée (course C2, 86) conservé',
);
const dc = body(sql97, 'delete_club');
check(
  /from public\.clubs c where c\.id = p_id/.test(dc) &&
    /cancel_reason = 'club_deleted'/.test(dc) &&
    /status = 'cancelled', cancel_reason = 'Club retiré/.test(dc),
  'R-60 / R-42 : club inconnu refusé, tournois annulés, résas marquées',
);
check(
  /email_confirmed_at is not null or u\.phone_confirmed_at is not null/.test(body(sql97, 'approve_club_request')),
  'R-55 : demandeur réel et confirmé',
);
for (const f of ['approve_club_request', 'grant_club_access_by_phone', 'revoke_club_access_by_phone']) {
  check(/return '__operator__';/.test(body(sql97, f)), `R-58 : sentinelle '__operator__' dans ${f}`);
}
check(/payment_status = 'unpaid'/.test(body(sql97, 'operator_unconfirm_tournament_payment')), 'R-68 : « Paiement reçu » réversible');
check(
  /check \(status in \('new', 'contacted', 'approved', 'rejected'\)\) not valid/.test(sql97) &&
    /with check \(auth\.uid\(\) = requested_by and status = 'new'\)/.test(sql97),
  'R-77 : statuts bornés, demande créée « new » seulement',
);
check(
  /revoke all on public\.lesson_cancel_notices from public, anon, authenticated;/.test(sql97),
  'R-53 : lesson_cancel_notices fermée au client',
);

// ── (4) Marqueurs partagés SQL ↔ notify-club, RESET, version ──
check(notify.includes("record.cancel_reason === 'club_deleted'"), 'notify-club lit le marqueur club_deleted posé par delete_club');
check(
  notify.includes("from('lesson_cancel_notices')") && reset.includes('delete from public.lesson_cancel_notices'),
  'lesson_cancel_notices relue par notify-club et vidée par le RESET',
);
check(
  notify.includes("l.cancelled_by === 'coach'") && notify.includes("record.cancelled_by !== 'coach'"),
  'notify-club lit lessons.cancelled_by (96)',
);
check(/record\.status === 'cancelled' && oldRecord\.status === 'published'/.test(notify), 'notify-club : branche tournoi annulé');
check(/Version dépôt : v(49|50)\b/.test(notify), 'notify-club : en-tête de version (v49 ou suivante)');
const sbVersion = pkg.dependencies['@supabase/supabase-js'].replace(/^[\^~]/, '');
check(
  notify.includes(`https://esm.sh/@supabase/supabase-js@${sbVersion}'`),
  `notify-club : supabase-js épinglé à la version de l’app (${sbVersion})`,
);
check(/waitUntil\(work\)/.test(notify) && /status: 202/.test(notify), 'notify-club : réponse 202 puis travail en arrière-plan');

if (failed) {
  console.error(`\n${failed} ÉCHEC(S) — migrations 96-97`);
  process.exit(1);
}
console.log('\nTOUS LES TESTS 96-97 PASSENT.');
