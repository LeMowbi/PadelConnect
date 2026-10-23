// Test de logique — finitions serveur du tour 1 de l'audit du 2026-10-23 (98, 84, 96/97, notify-club v50) :
//   node --experimental-strip-types tests/finitions98Serveur.test.ts
// Lecture STATIQUE (les preuves d'exécution — Postgres 16 local, contre-épreuve sur l'ancienne 98 —
// vivent dans la compétence padel-preuve-en-base). Ce qui ne doit jamais revenir : un cours sorti
// de la PRÉSENCE (T-3 dit « restent dans la présence »), une colonne de la 98 forgeable à l'INSERT,
// une donnée nominative qui survit à delete_account, une dette « à rembourser » illisible, un
// push d'annulation supprimé parce que le créneau a commencé, un écho à l'auteur de son propre geste.

import { readFileSync } from 'node:fs';

let failed = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? '✓' : '✗ ÉCHEC'} ${msg}`);
  if (!cond) failed++;
};
const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

const sql = read('supabase/98_decisions_porteur.sql');
const s84 = read('supabase/84_hardening_privileges.sql');
const s96 = read('supabase/96_regles_reservations_scores.sql');
const s97 = read('supabase/97_tournois_clubs_comptes.sql');
const notify = read('supabase/functions/notify-club/index.ts');

// Corps d'une fonction de la 98 : de sa création jusqu'au `$$;` qui la ferme.
const body = (name: string) => {
  const start = sql.search(new RegExp(`create (or replace )?function public\\.${name}\\(`));
  if (start < 0) return '';
  const open = sql.indexOf('as $$', start);
  return sql.slice(start, sql.indexOf('$$;', open + 5) + 3);
};
// Tranche de notify-club entre deux repères (vide si l'un manque).
const slice = (from: string, to: string) => {
  const a = notify.indexOf(from);
  const b = a < 0 ? -1 : notify.indexOf(to, a + from.length);
  return a < 0 || b < 0 ? '' : notify.slice(a, b);
};

// ── T-3 : un cours reste dans la présence ──
check(!/function public\.public_reliability\(/.test(sql), 'T-3 : public_reliability (80) non redéfinie — un cours reste dans la présence');
check(
  body('player_reliability') !== '' && !/coach_name/.test(body('player_reliability')),
  'T-3 : le badge d’absences du gérant compte les cours',
);
check(/coalesce\(v_res\.coach_name, ''\) <> ''/.test(body('apply_match_level')), 'T-3 : un cours n’ajuste toujours pas le niveau');

// ── Colonnes de la 98 non forgeables à l'INSERT ──
const guard = body('reservations_insert_guard');
check(
  /new\.status := 'booked';\s+new\.owner_deleted := false;\s+new\.cancelled_at := null;/.test(guard),
  'insert : owner_deleted et cancelled_at naissent neutres',
);

// ── delete_account : plus de donnée nominative ──
const del = body('delete_account');
check(
  /update public\.competitions set organizer_phone = null\s+where organizer_id = uid and organizer_phone is not null;/.test(del),
  'delete_account : téléphone retiré de TOUS ses tournois (club et PadelConnect compris)',
);
check(
  /update public\.reservations set coach_name = 'Coach'/.test(del) &&
    /where l\.coach_id = uid and l\.reservation_id is not null/.test(del) &&
    del.indexOf("cancel_reason = 'Coach indisponible'") < del.indexOf("set coach_name = 'Coach'"),
  'delete_account : nom du coach neutre (non vide → reste un cours), APRÈS l’annulation (push avec son nom)',
);
check(
  /'confirmed', exists \(\s*select 1 from public\.reservation_participants rp\s+where rp\.reservation_id = r\.id and rp\.user_id = uid\s+and rp\.status = 'accepted'\)/.test(
    del,
  ),
  'delete_account : « Ancien joueur » confirmé seulement s’il avait accepté',
);

// ── Tournoi annulé : auteur noté, dette « à rembourser » lisible et soldable ──
check(
  /add column if not exists cancelled_by uuid references auth\.users \(id\) on delete set null;/.test(sql),
  'competitions.cancelled_by (détaché à la suppression du compte)',
);
check(
  /cancelled_by = auth\.uid\(\)/.test(body('cancel_competition')) && /cancelled_by = auth\.uid\(\)/.test(body('delete_club')),
  'cancel_competition et delete_club notent l’auteur',
);
const due = body('operator_refunds_due');
check(
  /c\.status = 'cancelled' and c\.payment_status = 'refund_due'/.test(due) && /p\.role = 'operator'/.test(due) && /limit 200/.test(due),
  'operator_refunds_due : opérateur seul, tournois annulés aux frais à rembourser, borné',
);
check(
  /set payment_status = 'refunded'\s+where id = p_id and status = 'cancelled' and payment_status = 'refund_due';/.test(
    body('operator_mark_refunded'),
  ) && /p\.role = 'operator'/.test(body('operator_mark_refunded')),
  'operator_mark_refunded : seulement refund_due → refunded, opérateur seul',
);
for (const sig of ['operator_refunds_due()', 'operator_mark_refunded(uuid)']) {
  const esc = sig.replace(/[()]/g, '\\$&');
  check(
    new RegExp(`revoke execute on function public\\.${esc} from public, anon;`).test(sql) &&
      new RegExp(`grant execute on function public\\.${esc} to authenticated;`).test(sql),
    `ACL de ${sig}`,
  );
}

// ── R-80, R-16, C-11, avertissements de recollage ──
for (const f of ['protect_level', 'reservations_price_guard', 'strip_open_match_phone', 'support_stamp_resolved']) {
  check(new RegExp(`alter function public\\.${f}\\(\\) set search_path = public;`).test(sql), `R-80 : search_path figé sur ${f}`);
}
check(
  sql.lastIndexOf("raise notice 'R-16 :") > sql.indexOf('function public.reservations_availability_guard()'),
  'R-16 : rattrapage rejoué APRÈS la nouvelle garde de disponibilité',
);
for (const sig of [
  'durations_60_90(integer[])',
  'hhmm_to_min(text)',
  'min_to_hhmm(integer)',
  'phone10(text)',
  'slot_start_ms(text, text)',
]) {
  const esc = sig.replace(/[()[\]]/g, '\\$&');
  check(
    new RegExp(`revoke execute on function public\\.${esc} from public, anon;`).test(s84) &&
      new RegExp(`grant execute on function public\\.${esc} to authenticated;`).test(s84),
    `C-11 : ${sig} fermé à anon dans le dépôt (comme en production)`,
  );
}
check(
  /la 92 \(my_loyalty, claim_loyalty\) : passe SANS ERREUR/.test(sql) &&
    /la 97 \(cancel_competition, delete_club, delete_account\)/.test(sql),
  '98 : l’avertissement de recollage couvre la 92 et la 97',
);
check(
  !/Idempotent, rejouable\.\n/.test(s96.slice(0, 400)) && /drop function public\.fetch_leaderboard\(integer\);/.test(s96.slice(0, 600)),
  '96 : en-tête honnête (42P13 après la 98, procédure de recollage)',
);
check(
  !/Idempotent, rejouable\.\n/.test(s97.slice(0, 400)) && /recoller ENSUITE la 98/.test(s97.slice(0, 600)),
  '97 : en-tête honnête après la 98',
);

// ── notify-club v50 ──
const clubCancel = slice("record.status === 'club_cancelled' && oldRecord.status === 'booked'", 'Créneau réellement LIBÉRÉ');
check(
  clubCancel !== '' && !/^\s*startsAt,?\s*$/m.test(clubCancel),
  'annulation club : aucun push d’annulation supprimé quand le créneau a commencé',
);
check(
  /select\('cancelled_by, capacity, coach_id'\)/.test(clubCancel) && /if \(groupHost\) \{/.test(clubCancel),
  'cours collectif annulé par le club : pas de push « auteur » au coach lui-même',
);
check(
  /record\.cancel_reason === 'Coach indisponible'/.test(clubCancel) && /choisis un autre coach dans « Réserver un cours »/.test(clubCancel),
  'coach supprimé : l’élève n’est plus renvoyé vers ce coach',
);
const lessonCancel = slice("record.cancelled_by !== 'coach'", "oldRecord.status === 'pending'");
check(lessonCancel !== '' && !/créneau est libéré/.test(lessonCancel), 'push coach « Cours annulé » : jamais « le créneau est libéré »');
check(lessonCancel !== '' && !/startsAt/.test(lessonCancel), 'élèves d’un cours collectif annulé : push jamais supprimé');
const compCancel = slice("record.status === 'cancelled' && oldRecord.status === 'published'", "table === 'friend_requests'");
check(
  /comp\.organizer_id && comp\.organizer_id !== comp\.cancelled_by/.test(compCancel) && /payment_status, cancelled_by'\)/.test(compCancel),
  'tournoi annulé : pas d’écho à l’organisateur qui l’a annulé lui-même',
);
check(compCancel !== '' && !/blocked_users/.test(compCancel), 'tournoi annulé : tous les inscrits prévenus (aucun filtre de blocage)');
const score = slice("title: 'Score à saisir 🎾'", "table === 'operator_news'");
check(
  /from\('blocked_users'\)/.test(notify.slice(notify.indexOf('« Score à saisir » émis'), notify.indexOf("table === 'operator_news'"))) &&
    /body: `Un joueur\$\{tail\}`/.test(notify) &&
    /const masked = blkErr \? others/.test(notify),
  'score à saisir : nom masqué pour un bloqué, fail-closed sur le nom',
);
check(score !== '', 'repère « Score à saisir » présent');

if (failed) {
  console.error(`\n${failed} ÉCHEC(S) — finitions serveur 98`);
  process.exit(1);
}
console.log('\nTOUS LES TESTS DES FINITIONS SERVEUR 98 PASSENT.');
