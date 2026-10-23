// Test de logique — invariants de la migration supabase/98_decisions_porteur.sql (décisions du
// porteur du 2026-10-22, lot D1) et de son pendant dans notify-club v50 :
//   node --experimental-strip-types tests/decisions98Sql.test.ts
// Lecture STATIQUE (les preuves d'exécution vivent dans la compétence padel-preuve-en-base). Ce qui
// ne doit jamais revenir : (1) un drop+create ou un oubli qui rouvre EXECUTE à PUBLIC/anon (84) ;
// (2) un type de retour changé sur une RPC appelée par la v1.0.2 publiée ; (3) une décision
// perdue par une recopie (cours hors classement, fidélité à zéro, ex æquo, compte supprimé…) ;
// (4) un marqueur partagé SQL ↔ notify-club qui diverge (le push ne partirait plus, en silence).

import { readFileSync } from 'node:fs';

let failed = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? '✓' : '✗ ÉCHEC'} ${msg}`);
  if (!cond) failed++;
};
const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

const sql = read('supabase/98_decisions_porteur.sql');
const notify = read('supabase/functions/notify-club/index.ts');
const reset = read('supabase/RESET-DONNEES-TEST.sql');
const pushDoc = read('docs/PUSH-SETUP.md');

// Corps d'une fonction : de sa création jusqu'au `$$;` qui la ferme.
const body = (name: string) => {
  const start = sql.search(new RegExp(`create (or replace )?function public\\.${name}\\(`));
  if (start < 0) return '';
  const open = sql.indexOf('as $$', start);
  return sql.slice(start, sql.indexOf('$$;', open + 5) + 3);
};
// Toutes les fonctions créées (nom + types d'arguments, sans noms ni défauts).
const created = [...sql.matchAll(/create (?:or replace )?function public\.(\w+)\(([^)]*)\)\s*returns (\w+)/g)].map((m) => ({
  name: m[1],
  args: m[2]
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean)
    .map((a) => a.replace(/\s+default\s+.*$/i, '').split(/\s+/)[1])
    .join(', '),
  returns: m[3],
}));
const esc = (s: string) => s.replace(/[()[\]]/g, '\\$&').replace(/\./g, '\\.');

// ── (1) ACL : chaque RPC (non trigger) recréée → anon fermé, authenticated ouvert ──
check(created.length >= 16, `98 : ${created.length} fonctions recréées (balayage non vide)`);
for (const f of created) {
  if (f.returns === 'trigger') continue;
  const sig = esc(`public.${f.name}(${f.args})`);
  if (f.name === 'apply_match_level') {
    check(
      new RegExp(`revoke execute on function ${sig} from public, anon, authenticated;`).test(sql) &&
        !new RegExp(`grant execute on function ${sig}`).test(sql),
      'apply_match_level reste INTERNE (fermée à tous, comme en live)',
    );
    continue;
  }
  check(
    new RegExp(`revoke execute on function ${sig} from public, anon;`).test(sql) &&
      new RegExp(`grant execute on function ${sig} to authenticated;`).test(sql),
    `ACL de ${f.name}(${f.args}) re-posées`,
  );
  check(/security definer\s+set search_path = public/.test(body(f.name)), `${f.name} : SECURITY DEFINER + search_path figé`);
}
check(
  /revoke execute on function public\.reservations_stamp_cancelled\(\) from public, anon, authenticated;/.test(sql),
  'fonction trigger reservations_stamp_cancelled fermée au client',
);

// ── (2) Signatures et types de retour de la v1.0.2 INCHANGÉS ──
const expectSig = (name: string, args: string, returns: string) => {
  const f = created.find((s) => s.name === name);
  check(!!f && f.args === args && f.returns === returns, `signature : ${name}(${args}) → ${returns}`);
};
expectSig('mark_no_show', 'uuid, boolean', 'text');
expectSig('my_leaderboard_rank', '', 'integer');
expectSig('submit_match_score', 'uuid, jsonb', 'text');
expectSig('claim_loyalty', '', 'text');
expectSig('my_loyalty', '', 'table');
check(
  !created.some((f) => f.name === 'public_reliability'),
  'T-3 : public_reliability (80) non redéfinie — un cours reste dans la présence',
);
expectSig('player_reliability', 'uuid[]', 'table');
expectSig('delete_account', '', 'void');
expectSig('delete_club', 'text', 'boolean');
expectSig('cancel_competition', 'uuid, text', 'text');
expectSig('set_news_push', 'boolean', 'boolean');
expectSig('operator_confirm_tournament_payment', 'uuid', 'boolean');
check(
  [...sql.matchAll(/drop function if exists ([^;]+);/g)].map((m) => m[1]).join('|') === 'public.fetch_leaderboard(integer)',
  'un seul drop function (fetch_leaderboard, colonne `rank` ajoutée)',
);
check(/points integer, rank integer\)/.test(body('fetch_leaderboard')), '`rank` en DERNIÈRE colonne de fetch_leaderboard');
check(
  /returns table \(played integer, played_all integer, claimed integer, cap integer\)/.test(body('my_loyalty')),
  'my_loyalty : colonnes de la 92 inchangées (pas de drop)',
);

// ── (3) Décisions ──
const noCourse = /coalesce\(r{1,2}\.coach_name, ''\) = ''/g;
// Décision 3 (T-3) : un cours n'est pas une partie.
for (const [f, n] of [
  ['fetch_leaderboard', 3],
  ['my_leaderboard_rank', 3],
  ['my_loyalty', 2],
] as const) {
  check((body(f).match(noCourse) ?? []).length === n, `T-3 : ${f} exclut les cours (${n} compteur(s))`);
}
check((body('player_reliability').match(noCourse) ?? []).length === 0, 'T-3 : player_reliability garde les cours (badge du gérant)');
check(/coalesce\(v_res\.coach_name, ''\) <> ''/.test(body('apply_match_level')), 'T-3 : un cours n’ajuste jamais le niveau');
check(
  /new\.coach_name := null;/.test(body('reservations_insert_guard')) &&
    /into new\.booked_by_name, new\.booked_by_phone/.test(body('reservations_insert_guard')),
  'T-3 : `coach_name` non forgeable par le joueur (garde d’insertion, R-76 conservé)',
);
// Décision 4 : les réclamations de l'ancienne règle ne comptent plus.
check(
  /add column if not exists legacy boolean;/.test(sql) &&
    /update public\.loyalty_claims set legacy = true where legacy is null;/.test(sql) &&
    /alter column legacy set default false/.test(sql),
  'décision 4 : réclamations antérieures marquées `legacy`, les nouvelles non',
);
check(/lc\.user_id = v_uid and not lc\.legacy/.test(body('my_loyalty')), 'décision 4 : `claimed` ne compte que la règle cible');
check(/coalesce\(max\(lc\.cycle\), 0\) \+ 1/.test(body('claim_loyalty')), 'décision 4 : numéro de cycle à la suite des anciens');
check(/not r\.owner_deleted/.test(body('my_loyalty')), 'décision 9 : une partie héritée n’entre pas dans la fidélité');
// Décision 7 (T-4) : « pas venu » refusé sur un score validé, 48 h comprises.
const ns = body('mark_no_show');
check(
  /a\.n = 1 and a\.w = 1 and a\.first_at < now\(\) - interval '48 hours'/.test(ns) &&
    /a\.w <= least\(2, c\.pc - 1\) and a\.l >= 1/.test(ns) &&
    /48 \* 3600000::bigint/.test(ns) &&
    /level_history lh where lh\.reservation_id = p_id/.test(ns),
  'T-4 : « pas venu » refusé (played) dès que le score est validé, fenêtre R-21 et garde 85 conservées',
);
// Décision 9 (T-6 / R-30) : compte supprimé.
const del = body('delete_account');
check(
  /owner_deleted = true/.test(del) && /'Ancien joueur'/.test(del) && /order by rp\.created_at, rp\.id/.test(del),
  'T-6 : résas passées transférées au plus ancien partenaire, auteur « Ancien joueur »',
);
check(
  /update public\.match_results set user_id = null where user_id = uid;/.test(del) &&
    /set user_id = null/.test(del.slice(del.indexOf('(b)'))),
  'T-6 : saisies et places du compte supprimé gardées sans nom',
);
check(
  del.indexOf("'Ancien joueur'") < del.indexOf('delete from auth.users') &&
    /raise exception 'operator_account'/.test(del) &&
    /for update;\s+update public\.reservations r\s+set invited = f\.arr/.test(del) &&
    /organizer_name = 'Compte supprimé', organizer_phone = null/.test(del),
  'T-6 : tout avant la cascade ; R-58, C2 et R-07 de la 97 conservés',
);
check(
  /alter table public\.reservation_participants alter column user_id drop not null;/.test(sql) &&
    /alter table public\.match_results alter column user_id drop not null;/.test(sql),
  'T-6 : place anonyme possible (user_id NULL) sur participants et scores',
);
const sms = body('submit_match_score');
check(
  /filter \(where t\.uid is not null\)/.test(sms) && /if not coalesce\(v_uid = any \(v_players\), false\)/.test(sms),
  'T-6 : submit_match_score sûr face à une place anonyme (jamais un tiers admis par NULL)',
);
check(
  (body('apply_match_level').match(/and user_id is not null/g) ?? []).length === 2 &&
    /filter \(where t\.uid is not null\)/.test(body('apply_match_level')),
  'T-6 : apply_match_level ignore les saisies anonymes',
);
check(
  /tg_op = 'UPDATE' and old\.status = 'booked'/.test(body('reservations_availability_guard')),
  'T-6 : garde de disponibilité neutre pour un UPDATE qui ne déplace pas le créneau',
);
// Décision 10 (T-8) : ex æquo « 1, 1, 3 ».
check(
  /rank\(\) over \(order by/.test(body('fetch_leaderboard')) &&
    /rank\(\) over \(order by points desc, wins desc, mwins desc\)/.test(body('my_leaderboard_rank')) &&
    !/row_number\(\)/.test(body('my_leaderboard_rank')),
  'T-8 : rang partagé (standard sportif) au classement et au rang perso',
);
// Décision 14 (T-12) : frais d'un tournoi annulé par le club / l'opérateur.
const cc = body('cancel_competition');
check(
  ["'ok'", "'gone'", "'forbidden'", "'played'", "'reason'", "'fees'"].every((c) => cc.includes(c)) && /hashtext\('reg:'/.test(cc),
  'T-12 : codes de cancel_competition (+ fees) et verrou partagé avec l’inscription',
);
for (const f of ['cancel_competition', 'delete_club']) {
  check(
    /when payment_status = 'paid' then 'refund_due' else 'cancelled'/.test(body(f)),
    `T-12 : ${f} annule les frais dus (ou les marque à rembourser)`,
  );
}
check(/from public\.clubs c where c\.id = p_id/.test(body('delete_club')), 'delete_club : R-60 conservé');
// « Paiement reçu » tapé sur une liste périmée : jamais sur un tournoi annulé, ni sur des frais
// annulés ('cancelled') ou à rembourser ('refund_due') — la créance ne ressuscite pas.
check(
  /update public\.competitions set payment_status = 'paid'\s+where id = p_id and status <> 'cancelled' and coalesce\(payment_status, 'unpaid'\) in \('unpaid', 'paid'\);/.test(
    body('operator_confirm_tournament_payment'),
  ),
  'T-12 : operator_confirm_tournament_payment refuse un tournoi annulé / des frais annulés',
);
// Décision 17 (T-14) : actus et agenda désactivables.
check(/add column if not exists news_push boolean not null default true;/.test(sql), 'T-14 : news_push activé par défaut');
check(/set news_push = p_on where id = auth\.uid\(\)/.test(body('set_news_push')), 'T-14 : set_news_push écrit MON profil');
// Décision 18 (T-21) : badge « annulations » à moins de 24 h.
check(
  /add column if not exists cancelled_at timestamptz;/.test(sql) &&
    /before update of status on public\.reservations/.test(sql) &&
    /when \(new\.status = 'cancelled' and old\.status is distinct from 'cancelled'\)/.test(sql),
  'T-21 : heure d’annulation horodatée par trigger',
);
check(
  /r\.starts_at - \(extract\(epoch from r\.cancelled_at\) \* 1000\)::bigint < 24 \* 3600000::bigint/.test(body('player_reliability')) &&
    /r\.cancel_reason is distinct from 'club_deleted'/.test(body('player_reliability')),
  'T-21 : seules les annulations à moins de 24 h comptent (club retiré exclu)',
);

// ── (4) notify-club v50, RESET, doc ──
const newsTokens = notify.slice(notify.indexOf('const newsPushTokens'), notify.indexOf('// Nom affiché d'));
check(/\.eq\('news_push', true\)/.test(newsTokens), 'notify-club : actus/agenda ciblent news_push = true');
check(
  (notify.match(/targets: await newsPushTokens\(\)/g) ?? []).length === 2 && !/allPlayerTokens/.test(notify),
  'notify-club : actu ET agenda passent par le filtre (aucun broadcast non filtré)',
);
check(
  /payment_status === 'refund_due'/.test(notify) &&
    /select\('id, title, club_id, club_name, organizer_id, cancel_reason, status, commission, payment_status, cancelled_by'\)/.test(notify),
  'notify-club : frais à rembourser signalés à l’opérateur',
);
check(
  /const ids = userIds\.filter\(\(id\): id is string => Boolean\(id\)\);/.test(notify) &&
    /p\.status !== 'declined' && p\.user_id/.test(notify),
  'notify-club : jamais un id NULL (place anonyme) dans un in()',
);
check(/Version dépôt : v50/.test(notify), 'notify-club : en-tête v50');
check(/92 → 98/.test(reset), 'RESET : à lancer après la 98');
check(/news_push/.test(pushDoc) && /v50/.test(pushDoc), 'PUSH-SETUP : v50 et réglage news_push documentés');

if (failed) {
  console.error(`\n${failed} ÉCHEC(S) — migration 98`);
  process.exit(1);
}
console.log('\nTOUS LES TESTS 98 PASSENT.');
