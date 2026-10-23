// Test de logique — finitions serveur du tour 2 de l'audit du 2026-10-23 (98, notify-club v50) :
//   node --experimental-strip-types tests/finitions98Tour2.test.ts
// Lecture STATIQUE (les preuves d'exécution — Postgres 16 local, course à 2 sessions et
// contre-épreuve sur l'ancienne 98 — vivent dans la compétence padel-preuve-en-base). Ce qui ne doit
// jamais revenir : deux suppressions de compte croisées qui s'interbloquent, une dette « à
// rembourser » effacée par delete_competition, un push de cours trompeur quand la lesson n'est pas relue.

import { readFileSync } from 'node:fs';

let failed = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? '✓' : '✗ ÉCHEC'} ${msg}`);
  if (!cond) failed++;
};
const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

const sql = read('supabase/98_decisions_porteur.sql');
const notify = read('supabase/functions/notify-club/index.ts');

// Corps d'une fonction de la 98 : de sa création jusqu'au `$$;` qui la ferme.
const body = (name: string) => {
  const start = sql.search(new RegExp(`create (or replace )?function public\\.${name}\\(`));
  if (start < 0) return '';
  const open = sql.indexOf('as $$', start);
  return sql.slice(start, sql.indexOf('$$;', open + 5) + 3);
};

// ── delete_account : suppressions sérialisées AVANT tout verrou de ligne ──
const del = body('delete_account');
const lock = del.indexOf("perform pg_advisory_xact_lock(hashtext('delete_account'));");
const firstRowLock = del.search(/for update|update public\.|delete from public\./);
check(lock > 0, 'delete_account : verrou consultatif commun « delete_account »');
check(lock > 0 && firstRowLock > lock, 'delete_account : verrou pris avant tout verrou de ligne (interblocage impossible)');
check(lock > del.indexOf("raise exception 'operator_account'"), 'delete_account : verrou pris après les refus (non connecté, opérateur)');

// ── delete_competition : la créance « à rembourser » survit ──
const dc = body('delete_competition');
check(dc !== '', 'delete_competition redéfinie dans la 98 (après la 97)');
const refundGuard = dc.search(/c\.status = 'cancelled' and c\.payment_status = 'refund_due'\) then\s+return false;/);
check(refundGuard > 0, 'delete_competition : tournoi annulé « à rembourser » non supprimable');
check(refundGuard > 0 && refundGuard < dc.indexOf('delete from public.competitions'), 'delete_competition : garde avant la suppression');
check(
  /revoke execute on function public\.delete_competition\(uuid\) from public, anon;\s+grant execute on function public\.delete_competition\(uuid\) to authenticated;/.test(
    sql,
  ),
  'delete_competition : ACL reposées (anon fermé)',
);
check(
  /la 97 \(cancel_competition, delete_club, delete_account\)[\s\S]{0,260}et sa delete_competition/.test(sql),
  'en-tête : la 97 recollée seule effacerait la garde',
);

// ── R-52 : rattrapage des invitations entre comptes bloqués AVANT la 96 ──
// Placé APRÈS la garde de disponibilité de la 98 (sinon un créneau fermé après coup ferait échouer
// le collage entier — prouvé en local), verrou de ligne, recalcul `invited` / `players`.
const r52 = sql.indexOf('-- R-52 · rattrapage');
const r52Block = r52 < 0 ? '' : sql.slice(r52);
check(
  r52 > sql.indexOf('create or replace function public.reservations_availability_guard()') &&
    /join public\.blocked_users b/.test(r52Block) &&
    /for update/.test(r52Block) &&
    /status = 'invited'/.test(r52Block) &&
    /players = greatest\(1, 1 \+ jsonb_array_length\(v_new\)\)/.test(r52Block),
  'R-52 : rattrapage des paires déjà bloquées, après la garde 98, sous verrou',
);

// ── notify-club : lesson non relue → texte neutre, journalisé ──
const a = notify.indexOf("record.status === 'club_cancelled' && oldRecord.status === 'booked'");
const branch = a < 0 ? '' : notify.slice(a, notify.indexOf("record.status === 'no_show' && oldRecord.status === 'booked'", a));
check(/if \(lsnErr\) \{\s+lessonUnknown = true;\s+await logIssue\(/.test(branch), 'notify-club : échec de lecture de la lesson journalisé');
const unknown = branch.indexOf('} else if (lessonUnknown) {');
const generic = branch.indexOf('} else if (coach) {');
check(unknown > 0 && unknown < generic, 'notify-club : branche « lesson inconnue » AVANT la branche générique du cours');
// Texte envoyé (gabarit `body:`), hors commentaires.
const unknownText = unknown < 0 ? '' : (/body: `([^`]*)`/.exec(branch.slice(unknown, generic))?.[1] ?? '');
check(
  unknownText === 'Ton cours ${when} (${club}) est annulé.${reasonPart}' &&
    !unknownText.includes('Redemande') &&
    !unknownText.includes('avec ${coach}'),
  'notify-club : texte neutre (ni « avec <coach> », ni « Redemande un créneau à ton coach »)',
);

if (failed) {
  console.error(`\n${failed} échec(s).`);
  process.exit(1);
}
console.log('\nFinitions serveur du tour 2 : OK.');
