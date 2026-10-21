// Test de logique — messages types WhatsApp d'un match (src/lib/matchMessages.ts) :
//   TZ=UTC node --experimental-strip-types tests/matchMessages.test.ts
// Invariant principal : la part annoncée (« Prévois X chacun ») suit la MÊME base que la carte
// « Mes réservations » — la CAPACITÉ pour un match ouvert (les places libres seront prises),
// l'effectif RÉEL (moi + invités) sinon. Le modèle « Il manque des joueurs » n'apparaît que
// s'il reste une place sur MON match (jamais un cours, jamais le match d'un autre), avec le bon
// nombre de joueurs manquants ; l'équipe annoncée est la même que sur l'accueil.

import { matchTeam, matchTemplates } from '../src/lib/matchMessages.ts';
import { perPlayerOf } from '../src/lib/format.ts';
import type { Reservation } from '../src/store/AppContext';

let failed = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? '✓' : '✗ ÉCHEC'} ${msg}`);
  if (!cond) failed++;
};

const URL = 'https://padelconnectci.com/club/padelta';
const resa = (over: Partial<Reservation>): Reservation => ({
  id: 'r1',
  clubId: 'padelta',
  clubName: 'Padelta',
  court: 'Terrain 1',
  date: 'Demain 13',
  dateKey: '2026-10-22',
  time: '18:00',
  startsAt: Date.UTC(2026, 9, 22, 18),
  durationMin: 90,
  price: 20000,
  players: 1,
  invited: [],
  createdAt: 0,
  ...over,
});
const invited = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `u${i + 1}`, name: `Joueur ${i + 1}`, confirmed: true }));
const body = (r: Reservation, key: string, iOwn = true) => matchTemplates(r, URL, iOwn).find((t) => t.key === key)?.body ?? '';
const keys = (r: Reservation, iOwn = true) => matchTemplates(r, URL, iOwn).map((t) => t.key);

// ── Part par joueur (« On joue ! ») ───────────────────────────────────────────
check(body(resa({ invited: invited(1) }), 'play').includes(`Prévois ${perPlayerOf(20000, 2)} chacun.`), 'privé à 2 : part divisée par 2');
check(body(resa({ invited: invited(3) }), 'play').includes(`Prévois ${perPlayerOf(20000, 4)} chacun.`), 'privé à 4 : part divisée par 4');
check(body(resa({}), 'play').includes(`Prévois ${perPlayerOf(20000, 1)} chacun.`), 'privé seul : part entière (jamais ÷ 0)');
check(
  body(resa({ openMatch: true, openCapacity: 4 }), 'play').includes(`Prévois ${perPlayerOf(20000, 4)} chacun.`),
  'ouvert 2v2 vide : part sur la CAPACITÉ (÷ 4), pas sur 1 + invités',
);
check(
  body(resa({ openMatch: true, openCapacity: 2 }), 'play').includes(`Prévois ${perPlayerOf(20000, 2)} chacun.`),
  'ouvert 1v1 vide : part sur la capacité (÷ 2)',
);
check(
  body(resa({ openMatch: true }), 'play').includes(`Prévois ${perPlayerOf(20000, 4)} chacun.`),
  'ouvert sans openCapacity : capacité 4',
);
check(!body(resa({ price: 0 }), 'play').includes('Prévois'), 'sans prix : aucune part annoncée');

// ── « Il manque des joueurs » : même base que « On joue ! » pour un match ouvert ─────
check(
  body(resa({ openMatch: true, openCapacity: 4 }), 'find').includes(`~${perPlayerOf(20000, 4)}/joueur`),
  'ouvert 2v2 vide : « Il manque » ÷ 4',
);
check(body(resa({}), 'find').includes('Il me manque 3 joueurs'), 'seul en 2v2 : 3 joueurs manquants (pluriel)');
check(body(resa({ invited: invited(2) }), 'find').includes('Il me manque 1 joueur au'), 'à 3 en 2v2 : 1 joueur manquant (singulier)');
check(body(resa({ openCapacity: 2 }), 'find').includes('Il me manque 1 joueur au'), '1v1 seul : 1 joueur manquant');
check(body(resa({}), 'find').includes(URL), '« Il manque » porte le lien du club');

// ── Équipe complète : pas de modèle « find » ────────────────────────────────────
check(!keys(resa({ invited: invited(3) })).includes('find'), '2v2 complet : pas de « Il manque des joueurs »');
check(!keys(resa({ openCapacity: 2, invited: invited(1) })).includes('find'), '1v1 complet : pas de « Il manque des joueurs »');
check(keys(resa({})).join(',') === 'play,find,remind,cancel', 'ordre des modèles : « Il manque » juste après « On joue ! »');

// ── Contenu commun ────────────────────────────────────────────────────────────
check(body(resa({ durationMin: 60 }), 'play').includes('(session 1h)'), 'durée RÉELLE du créneau dans le message');
check(body(resa({ invited: invited(2) }), 'play').includes('Équipe : Joueur 1, Joueur 2'), 'équipe listée');

// ── Match d'un autre / cours : pas de « Il manque », équipe complète ──────────────
const booked = { name: 'Awa', phone: '' };
check(!keys(resa({ bookedBy: booked, invited: invited(1) }), false).includes('find'), 'match d’un autre : pas de « Il manque »');
check(
  body(resa({ bookedBy: booked, invited: invited(1) }), 'play', false).includes('Équipe : Awa, Joueur 1'),
  'match d’un autre : l’organisateur ouvre l’équipe',
);
check(
  body(resa({ invited: invited(1) }), 'play', false).includes('Équipe : Organisateur, Joueur 1'),
  'organisateur sans nom : libellé générique',
);
check(!keys(resa({ coachName: 'Coach Yao' })).includes('find'), 'cours de coach : pas de « Il manque »');
check(body(resa({ coachName: 'Coach Yao' }), 'play').includes('Cours avec Coach Yao'), 'cours de coach : « Cours avec X »');
check(!body(resa({ coachName: 'Coach Yao' }), 'play').includes('Équipe :'), 'cours de coach : pas de ligne « Équipe »');

// ── matchTeam : règle UNIQUE de l'équipe (modèle « On joue ! » ET accueil) ─────────
check(matchTeam(resa({ invited: invited(2) }), true).join(',') === 'Joueur 1,Joueur 2', 'matchTeam mon match : les invités seuls');
check(
  matchTeam(resa({ bookedBy: booked, invited: invited(1) }), false).join(',') === 'Awa,Joueur 1',
  'matchTeam match d’un autre : l’organisateur en tête',
);
check(matchTeam(resa({}), false).join(',') === 'Organisateur', 'matchTeam organisateur sans nom : libellé générique');
check(matchTeam(resa({}), true).length === 0, 'matchTeam mon match sans invité : équipe vide (pas de ligne « Équipe »)');

if (failed) {
  console.error(`\n${failed} test(s) en échec`);
  process.exit(1);
}
console.log('\nTous les tests matchMessages.ts passent.');
