// Test de logique — invariants des migrations supabase/93_index.sql et supabase/94_anti_abus.sql :
//   node --experimental-strip-types tests/antiAbusSql.test.ts
// Ce qui a cassé ou failli casser pendant le lot P8 et ne doit jamais revenir : (1) la définition
// live de send_friend_request référençait `friend_id` / `status` NON qualifiés alors que ce sont
// ses colonnes de sortie → 42702 à chaque vraie demande ; (2) un drop+create ou un oubli remet
// EXECUTE à PUBLIC sur une RPC SECURITY DEFINER (84) ; (3) les CODES de refus doivent être les
// MÊMES côté serveur et côté client (moderation.ts), sinon « Doucement 😊 » ne s'affiche jamais ;
// (4) les chiffres validés par le porteur (30 / h, 20 / j, 5 / j, 10 / j, 3 / j, 7 jours, 300 / 10 min).

import { readFileSync } from 'node:fs';

let failed = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? '✓' : '✗ ÉCHEC'} ${msg}`);
  if (!cond) failed++;
};
const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

const sql93 = read('supabase/93_index.sql');
const sql94 = read('supabase/94_anti_abus.sql');
const moderation = read('src/lib/moderation.ts');
const friends = read('src/lib/friends.ts');

// ── 93 : uniquement des `create index if not exists` (rejouable), aucun index unique (jamais de refus de données) ──
const creates93 = [...sql93.matchAll(/^create (unique )?index( if not exists)? (\w+)/gim)];
check(creates93.length === 9, `93 : 9 index posés (${creates93.length})`);
check(
  creates93.every((m) => !m[1] && !!m[2]),
  '93 : chaque index est `create index if not exists` (idempotent, non unique)',
);
check(!/reviews \(club_id\)/.test(sql93), '93 : pas de doublon reviews(club_id) (couvert par reviews_club_id_user_id_key)');

// ── 94 : colonnes de sortie homonymes TOUJOURS qualifiées dans send_friend_request ──
const sfr = sql94.slice(
  sql94.indexOf('function public.send_friend_request'),
  sql94.indexOf('revoke execute on function public.send_friend_request'),
);
check(!/from public\.friends\s+where/.test(sfr), '94 : `friends` toujours aliasé (friend_id est une colonne de sortie)');
check(!/from public\.friend_requests\s+where/.test(sfr), '94 : `friend_requests` toujours aliasé (status est une colonne de sortie)');
check(/f\.friend_id = fid/.test(sfr) && /fr\.status = 'pending'/.test(sfr), '94 : références qualifiées f.friend_id / fr.status présentes');

// ── 94 : ACL re-posées sur chaque RPC SECURITY DEFINER (non trigger), helper interne fermé ──
const rpcs = ['find_player_by_phone(text)', 'send_friend_request(text)', 'operator_diag_summary()'];
for (const f of rpcs) {
  const esc = f.replace(/[()]/g, '\\$&');
  check(
    new RegExp(`revoke execute on function public\\.${esc} from public, anon;`).test(sql94) &&
      new RegExp(`grant execute on function public\\.${esc} to authenticated;`).test(sql94),
    `94 : ACL de ${f} re-posées (anon fermé, authenticated ouvert)`,
  );
}
check(
  /revoke execute on function public\.rate_limit_hit\(uuid, text, integer, text\) from public, anon, authenticated;/.test(sql94) &&
    !/grant execute on function public\.rate_limit_hit/.test(sql94),
  '94 : rate_limit_hit fermé à tous (interne, jamais exposé)',
);
check(/revoke all on public\.rate_counters from public, anon, authenticated;/.test(sql94), '94 : table rate_counters fermée au client');
check(!/drop function/.test(sql94), '94 : aucun drop function (aucune signature changée)');

// ── 94 : chiffres validés par le porteur ──
check(/rate_limit_hit\(auth\.uid\(\), 'phone_lookup', 30, 'hour'\)/.test(sql94), '94 : find_player_by_phone → 30 / heure');
check(/rate_limit_hit\(me, 'phone_lookup', 30, 'hour'\)/.test(sql94), '94 : send_friend_request partage le compteur 30 / heure');
check(/rate_limit_hit\(me, 'friend_request', 20, 'day'\)/.test(sql94), '94 : 20 demandes d’ami / jour');
check(/rate_limit_insert_guard\('support', '5'\)/.test(sql94), '94 : 5 messages support / jour');
check(/rate_limit_insert_guard\('review_report', '10'\)/.test(sql94), '94 : 10 signalements / jour');
check(/rate_limit_insert_guard\('club_request', '3'\)/.test(sql94), '94 : 3 demandes de club / jour');
check(/interval '7 days'/.test(sfr) && !/interval '24 hours'/.test(sfr), '94 : silence d’une demande refusée = 7 jours (plus 24 h)');
check(/if auth\.uid\(\) is null then return new; end if;/.test(sql94), '94 : trigger journalier inerte sans JWT (inscription compte-club)');
// offset 299 : une 300ᵉ ligne existante suffit à couper → au plus 300 lignes par fenêtre (offset 300 en laissait 301).
check(
  (sql94.match(/interval '10 minutes' offset 299 limit 1/g) ?? []).length === 2,
  '94 : coupe-circuit à 300 lignes / 10 min (pile) sur les deux journaux',
);
// Un re-signalement du même avis (ON CONFLICT DO NOTHING) n'insère rien → il ne doit pas consommer le quota.
check(
  /if tg_table_name = 'review_reports' then\s+if exists \(select 1 from public\.review_reports r\s+where r\.review_id = new\.review_id and r\.reporter_id = new\.reporter_id\) then\s+return new;/.test(
    sql94,
  ),
  '94 : un re-signalement du même avis ne décompte pas le quota journalier',
);
// created_at vient du client (anon compris) : daté dans le passé il contournait le plafond, daté
// dans le futur il le saturait à jamais (jamais purgé) → imposé par le serveur AVANT le comptage.
const breaker = sql94.slice(
  sql94.indexOf('function public.diag_circuit_breaker'),
  sql94.indexOf('drop trigger if exists app_errors_circuit_breaker'),
);
check(
  /begin\s+new\.created_at := now\(\);\s+if tg_table_name = 'app_errors'/.test(breaker),
  '94 : coupe-circuit — created_at imposé par le serveur avant le comptage',
);
check(
  (sql94.match(/where created_at < now\(\) - interval '30 days' or created_at > now\(\) \+ interval '1 day';/g) ?? []).length === 2,
  '94 : purge des journaux > 30 jours ET des dates futures forgées (les deux journaux)',
);

// ── Parité des CODES serveur ↔ client ──
const serverCodes = new Set([...sql94.matchAll(/'(rate_limited(?:_day)?)'/g)].map((m) => m[1]));
check(
  serverCodes.has('rate_limited') && serverCodes.has('rate_limited_day') && serverCodes.size === 2,
  '94 : exactement deux codes de refus',
);
check(
  /export type RateLimited = 'rate_limited' \| 'rate_limited_day';/.test(moderation),
  'client : type RateLimited = les deux codes serveur',
);
check(/Doucement 😊 — réessaie dans une heure/.test(moderation), 'client : message horaire décidé par le porteur, verbatim');
check(
  /'rate_limited' \| 'rate_limited_day' \| 'error'/.test(friends) && /\| 'rate_limited'>/.test(friends),
  'client : friends.ts expose les codes (demande + recherche)',
);

if (failed) {
  console.error(`\n${failed} ÉCHEC(S) — SQL anti-abus / index`);
  process.exit(1);
}
console.log('\nTOUS LES TESTS SQL ANTI-ABUS / INDEX PASSENT.');
