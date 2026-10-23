// Test de logique — finitions serveur du tour 3 de l'audit du 2026-10-23 (97, 98) :
//   node --experimental-strip-types tests/finitions98Tour3.test.ts
// Lecture STATIQUE (les preuves d'exécution — Postgres 16 local, courses à 2 sessions et
// contre-épreuves sur les anciennes définitions — vivent dans la compétence padel-preuve-en-base).
// Ce qui ne doit jamais revenir : un « Supprimer » concurrent d'une annulation (créance « à
// rembourser ») ou d'une inscription qui efface sans prévenir, une fonction sans `search_path`
// signalée par le conseiller de sécurité, une créance soldée d'un tournoi annulé repassée « non payée ».

import { readFileSync } from 'node:fs';

let failed = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? '✓' : '✗ ÉCHEC'} ${msg}`);
  if (!cond) failed++;
};
const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

const sql98 = read('supabase/98_decisions_porteur.sql');
const sql97 = read('supabase/97_tournois_clubs_comptes.sql');

// Corps d'une fonction : de sa création jusqu'au `$$;` qui la ferme.
const body = (sql: string, name: string) => {
  const start = sql.search(new RegExp(`create (or replace )?function public\\.${name}\\(`));
  if (start < 0) return '';
  const open = sql.indexOf('as $$', start);
  return sql.slice(start, sql.indexOf('$$;', open + 5) + 3);
};

// ── delete_competition : verrou 'reg:' + ligne verrouillée AVANT les gardes ──
const dc = body(sql98, 'delete_competition');
const lock = dc.indexOf("perform pg_advisory_xact_lock(hashtext('reg:' || p_id::text));");
const read1 = dc.indexOf(
  'select id, organizer_id, club_id into v_id, v_owner, v_club from public.competitions where id = p_id for update;',
);
check(lock > 0, "delete_competition : verrou consultatif 'reg:' (partagé avec cancel_competition et register_competition)");
check(lock > 0 && read1 > lock, 'delete_competition : ligne relue `for update` APRÈS le verrou');
check(
  read1 > 0 && read1 < dc.indexOf("c.payment_status = 'refund_due'") && read1 < dc.indexOf('competition_registrations'),
  'delete_competition : gardes (à rembourser, inscrits) évaluées sous verrou',
);
check(
  body(sql98, 'cancel_competition').includes("perform pg_advisory_xact_lock(hashtext('reg:' || p_id::text));"),
  "cancel_competition : même clé 'reg:'",
);

// ── R-80 : search_path figé sur TOUTES les fonctions signalées (trigger + pures) ──
for (const sig of [
  'protect_level()',
  'reservations_price_guard()',
  'strip_open_match_phone()',
  'support_stamp_resolved()',
  'phone10(text)',
  'hhmm_to_min(text)',
  'durations_60_90(integer[])',
  'min_to_hhmm(integer)',
]) {
  const esc = sig.replace(/[()[\]]/g, (c) => `\\${c}`);
  check(new RegExp(`alter function public\\.${esc} set search_path = public;`).test(sql98), `R-80 : search_path figé sur ${sig}`);
}

// ── R-68 : « Annuler le paiement » refusé sur un tournoi annulé (pendant de la garde de confirm) ──
const unconfirm = body(sql97, 'operator_unconfirm_tournament_payment');
check(
  /where id = p_id and status <> 'cancelled' and coalesce\(commission, 0\) > 0 and payment_status = 'paid';/.test(unconfirm),
  'unconfirm : tournoi annulé refusé',
);
check(
  /where id = p_id and status <> 'cancelled'/.test(body(sql98, 'operator_confirm_tournament_payment')),
  'confirm : tournoi annulé refusé (miroir)',
);
check(
  /revoke execute on function public\.operator_unconfirm_tournament_payment\(uuid\) from public, anon;\s+grant execute on function public\.operator_unconfirm_tournament_payment\(uuid\) to authenticated;/.test(
    sql97,
  ),
  'unconfirm : ACL (anon fermé)',
);

if (failed) {
  console.error(`\n${failed} échec(s).`);
  process.exit(1);
}
console.log('\nFinitions serveur du tour 3 : OK.');
