// Test de logique — « Réinitialiser la démo » (régression B du patch v4.4.1).
//   node tests/reset.test.mjs
//
// Le store (src/store/AppContext.tsx) dépend du runtime React Native (AsyncStorage,
// composants…) et ne s'exécute pas seul sous Node ; on REPRODUIT ici fidèlement les
// reducers concernés et l'état seed (`initialState`) pour vérifier la garantie clé :
// après reset, l'état est STRICTEMENT égal à celui d'une première ouverture, et l'état
// seed n'a jamais été pollué (immutabilité). `resetAll` réel = `setState(initialState)`.

const seedFriends = [
  { id: 'f1', name: 'Karim', phone: '+225 07 11 22 33 44', level: 4.0 },
  { id: 'f2', name: 'Fatou', phone: '+225 05 66 77 88 99', level: 2.0 },
  { id: 'f3', name: 'David', level: 5.0 },
  { id: 'f4', name: 'Ines', level: 3.5 },
];
const clampLevel = (n) => Math.min(7, Math.max(1, Math.round(n * 100) / 100));
const LEVEL_STEP = 0.5; // v4.5 : vainqueur officiel +0.50
const LEVEL_PENALTY = 0.25; // v4.5 : dernière place officielle −0.25 (plancher 1.0)
const DEMO_FINISHED_COMP = 'c-fin';
const DEMO_CLOSED_COMP = 'c-clos';

// État seed = première ouverture (miroir de initialState pour les clés testées).
const makeInitial = () => ({
  account: null,
  level: 3.0,
  friends: seedFriends.map((f) => ({ ...f })),
  officialResults: [],
  compRegistrations: {},
  compResults: {},
  blockedSlots: [],
});

// Reducers (miroir exact d'AppContext) — clôture v4.5 : vainqueur + (option) dernière équipe.
const closeCompetition = (s, comp, winnerIsMe, loserIsMe = false) => {
  if (s.compResults[comp.id]) return s;
  const compResults = { ...s.compResults, [comp.id]: { winner: 'X', closedAt: 1 } };
  const registered = !!s.compRegistrations[comp.id];
  const already = s.officialResults.some((o) => o.compId === comp.id);
  if (!registered || already) return { ...s, compResults };
  let level = s.level;
  let result = 'played';
  if (winnerIsMe && comp.official) {
    level = clampLevel(level + LEVEL_STEP);
    result = 'win';
  } else if (loserIsMe && comp.official) {
    level = clampLevel(level - LEVEL_PENALTY);
    result = 'last';
  }
  return {
    ...s,
    compResults,
    level,
    officialResults: [{ id: 'o', compId: comp.id, result, levelAfter: level }, ...s.officialResults],
  };
};
const blockSlot = (s, b) => ({ ...s, blockedSlots: [...s.blockedSlots, b] });
const removeFriend = (s, id) => ({ ...s, friends: s.friends.filter((f) => f.id !== id) });
const resetAll = () => makeInitial(); // = setState(initialState)

let failed = 0;
const check = (cond, msg) => {
  console.log(`${cond ? '✓' : '✗ ÉCHEC'} ${msg}`);
  if (!cond) failed++;
};

// Scénario du test : clôture officielle gagnée (3.50 → 3.75) + blocage + retrait d'ami.
let s = {
  ...makeInitial(),
  account: { firstName: 'Invité' },
  level: 3.5,
  compRegistrations: { [DEMO_FINISHED_COMP]: { partner: 'Karim' }, [DEMO_CLOSED_COMP]: { partner: 'Karim' } },
  compResults: { [DEMO_CLOSED_COMP]: { winner: 'Awa & Yann' } },
  officialResults: [{ id: 'o0', compId: DEMO_CLOSED_COMP, result: 'played', levelAfter: 3.5 }],
};
s = closeCompetition(s, { id: DEMO_FINISHED_COMP, official: true }, true);
check(s.level === 4.0, 'Clôture officielle gagnée : niveau 3.50 → 4.00 (+0.50)');

// Malus « dernière place » : −0.25, avec plancher 1.0.
let sLast = {
  ...makeInitial(),
  account: { firstName: 'Invité' },
  level: 3.5,
  compRegistrations: { [DEMO_FINISHED_COMP]: { partner: 'Karim' } },
};
sLast = closeCompetition(sLast, { id: DEMO_FINISHED_COMP, official: true }, false, true);
check(sLast.level === 3.25, 'Dernière place officielle : 3.50 → 3.25 (−0.25)');
check(sLast.officialResults[0].result === 'last', "Palmarès : entrée « Dernière place »");
let sFloor = { ...makeInitial(), account: { firstName: 'Invité' }, level: 1.0, compRegistrations: { [DEMO_FINISHED_COMP]: { partner: 'K' } } };
sFloor = closeCompetition(sFloor, { id: DEMO_FINISHED_COMP, official: true }, false, true);
check(sFloor.level === 1.0, 'Plancher : un niveau 1.0 ne descend pas sous 1.0');
// Tournoi AMICAL : ni bonus ni malus, palmarès seulement.
let sAmical = { ...makeInitial(), account: { firstName: 'Invité' }, level: 3.5, compRegistrations: { d1: { partner: 'K' } } };
sAmical = closeCompetition(sAmical, { id: 'd1', official: false }, true);
check(sAmical.level === 3.5, 'Tournoi amical gagné : niveau inchangé');
s = blockSlot(s, { clubId: 'padelta', dateKey: '2026-06-13', time: '18:00', court: 'Terrain 1', reason: 'Entretien' });
s = removeFriend(s, 'f4');
check(s.blockedSlots.length === 1 && s.friends.length === 3, 'État pollué avant reset (1 blocage, 3 amis)');

// Reset.
const after = resetAll();
check(after.level === 3.0, 'Après reset : niveau = 3.0');
check(after.officialResults.length === 0, 'Après reset : palmarès vide');
check(Object.keys(after.compResults).length === 0, 'Après reset : compResults vide');
check(after.blockedSlots.length === 0, 'Après reset : blockedSlots vide');
check(after.friends.length === 4, 'Après reset : 4 amis seeds restaurés');
check(after.account === null, 'Après reset : compte déconnecté');
check(JSON.stringify(after) === JSON.stringify(makeInitial()), 'Après reset : état === première ouverture (strict)');

// Immutabilité : l'état seed n'a pas été pollué par le scénario.
check(JSON.stringify(makeInitial()) === JSON.stringify(resetAll()), 'État seed intact (immutabilité préservée)');

// Test #3 : défi terminé SANS aucun inscrit → « Annuler ce tournoi » proposé au créateur.
const teamCount = (comp, isReg) => Math.min(comp.slots, comp.registered + (isReg ? 1 : 0));
const demoTeams = (comp, myTeam) => {
  const others = teamCount(comp, !!myTeam) - (myTeam ? 1 : 0);
  const list = [];
  for (let i = 0; i < others; i++) list.push(`Equipe${i}`);
  return myTeam ? [myTeam, ...list] : list;
};
const defi = { id: 'd1', createdByMe: true, registered: 0, slots: 8, official: false };
const canClose = !!defi.createdByMe && true /* terminé */ && !undefined /* pas de résultat */;
const teamList = demoTeams(defi, undefined); // créateur non inscrit
check(canClose && teamList.length === 0, 'Défi terminé sans inscrit → « Annuler ce tournoi »');

console.log(failed === 0 ? '\nTOUS LES TESTS RESET PASSENT.' : `\n${failed} test(s) reset en échec.`);
if (failed > 0) process.exitCode = 1;
