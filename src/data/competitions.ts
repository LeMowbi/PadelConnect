// Compétitions — données de DÉMONSTRATION. Créées par un CLUB ou par un JOUEUR.

import { dayKey, nextDays } from '@/lib/days';

export type Competition = {
  id: string;
  title: string;
  organizerType: 'club' | 'joueur';
  organizer: string;
  clubId?: string;
  clubName?: string;
  date: string; // libellé d'affichage (jour de DÉBUT)
  dateKey: string; // identité stable du jour de début (AAAA-MM-JJ) — base du blocage des terrains
  // Tournoi sur PLUSIEURS jours (ex. americano sur un week-end) : jour de fin optionnel.
  // Absent ou égal au jour de début → événement d'une seule journée.
  endDate?: string;
  endDateKey?: string;
  format: string;
  level: string;
  reward: string; // récompense / dotation
  fee: string; // frais d'inscription
  slots: number;
  registered: number;
  official?: boolean;
  createdByMe?: boolean;
  // Modération : un tournoi créé par un JOUEUR reste « pending » jusqu'à validation du
  // club hôte. Club / seeds → visibles directement (absence de statut = approuvé).
  status?: 'pending' | 'approved';
};

// Tournoi visible publiquement (listes, accueil, fiche club) : tout sauf « en attente ».
export function isTournamentPublic(c: Competition): boolean {
  return c.status !== 'pending';
}

// Libellé de date : « du X au Y » si le tournoi s'étale sur plusieurs jours, sinon le jour seul.
export function compDateLabel(c: Competition): string {
  return c.endDateKey && c.endDateKey !== c.dateKey ? `${c.date} → ${c.endDate}` : c.date;
}

// Jours réels (relatifs au lancement) pour que l'affichage ET le blocage des terrains
// pointent toujours sur le bon jour calendaire.
const D = nextDays(8);

// Jours PASSÉS (pour les tournois terminés de démo) — dateKey stable.
const yesterday = dayKey(new Date(Date.now() - 86400000));
const lastWeek = dayKey(new Date(Date.now() - 7 * 86400000));

// IDs des tournois « terminés » du catalogue d'exemple (un à clôturer, un déjà clôturé).
export const DEMO_FINISHED_COMP = 'c-fin'; // terminé hier, à clôturer par le club
export const DEMO_CLOSED_COMP = 'c-clos'; // déjà clôturé la semaine dernière

export const seedCompetitions: Competition[] = [
  {
    id: 'c1',
    title: 'Tournoi du week-end — Double mixte',
    organizerType: 'club',
    organizer: 'Padelta',
    clubId: 'padelta',
    clubName: 'Padelta',
    date: D[1].label,
    dateKey: D[1].key,
    format: 'Poules + tableau final',
    level: 'Intermédiaire',
    reward: 'Bon d’achat 100 000 FCFA + lots partenaires',
    fee: '10 000 FCFA / équipe',
    slots: 16,
    registered: 11,
    official: true,
  },
  {
    id: 'c2',
    title: 'Americano du dimanche',
    organizerType: 'club',
    organizer: 'Padel Zone 4',
    clubId: 'padel-zone-4',
    clubName: 'Padel Zone 4',
    date: D[6].label,
    dateKey: D[6].key,
    format: 'Americano (rotation)',
    level: 'Tous niveaux',
    reward: 'Trophée + équipement padel',
    fee: '5 000 FCFA / joueur',
    slots: 24,
    registered: 18,
    official: true,
  },
  {
    id: 'c3',
    title: 'Défi entre amis — Riviera',
    organizerType: 'joueur',
    organizer: 'Awa',
    date: D[4].label,
    dateKey: D[4].key,
    format: 'Mini-tournoi 8 équipes',
    level: 'Débutant / Intermédiaire',
    reward: 'Cagnotte 30 000 FCFA',
    fee: 'Gratuit',
    slots: 8,
    registered: 5,
  },
  {
    id: DEMO_FINISHED_COMP,
    title: 'Tournoi officiel — Padelta',
    organizerType: 'club',
    organizer: 'Padelta',
    clubId: 'padelta',
    clubName: 'Padelta',
    date: 'Hier',
    dateKey: yesterday,
    format: 'Poules + tableau final',
    level: 'Intermédiaire',
    reward: 'Bon d’achat 50 000 FCFA',
    fee: '10 000 FCFA / équipe',
    slots: 8,
    registered: 7,
    official: true,
  },
  {
    id: DEMO_CLOSED_COMP,
    title: 'Americano officiel — Padel Zone 4',
    organizerType: 'club',
    organizer: 'Padel Zone 4',
    clubId: 'padel-zone-4',
    clubName: 'Padel Zone 4',
    date: 'Sem. dernière',
    dateKey: lastWeek,
    format: 'Americano (rotation)',
    level: 'Tous niveaux',
    reward: 'Trophée + équipement',
    fee: '5 000 FCFA / joueur',
    slots: 8,
    registered: 7,
    official: true,
  },
];

// Nombre d'équipes affiché : ne dépasse JAMAIS la capacité (l'inscription locale
// s'ajoute aux inscrits de démo, plafonnée).
export function teamCount(comp: Competition, isRegistered: boolean): number {
  return Math.min(comp.slots, comp.registered + (isRegistered ? 1 : 0));
}

// Équipes de DÉMONSTRATION d'un tournoi (noms stables par tournoi). Si l'utilisateur
// est inscrit, son équipe est en tête de liste.
const TEAM_POOL = [
  'Awa & Yann',
  'Aïcha & David',
  'Fatou & Karim',
  'Marina & Ali',
  'Nadia & Serge',
  'Aminata & Paul',
  'Chantal & Idriss',
  'Léa & Moussa',
  'Sarah & Franck',
  'Mariam & Hervé',
  'Clara & Bakary',
  'Eva & Junior',
];
export function demoTeams(comp: Competition, myTeam?: string): string[] {
  const seed = comp.id.split('').reduce((s, ch) => s + ch.charCodeAt(0), 0);
  const total = teamCount(comp, !!myTeam);
  const others = total - (myTeam ? 1 : 0);
  // Noms UNIQUES garantis (le pool fait 12 noms, un tournoi peut avoir 24 équipes) :
  // indispensable pour les clés React et la sélection du vainqueur par nom.
  const list: string[] = [];
  const used = new Map<string, number>();
  for (let i = 0; i < others; i++) {
    const base = TEAM_POOL[(seed + i) % TEAM_POOL.length];
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    list.push(n === 1 ? base : `${base} (${n})`);
  }
  return myTeam ? [myTeam, ...list] : list;
}

// Frais / récompense saisis librement par l'organisateur : on formate les nombres
// avec séparateurs de milliers (« 10000 FCFA » → « 10 000 FCFA ») et un champ vide
// devient « Gratuit » — même règle partout (cartes, fiches, partage).
export function formatFee(s: string | undefined): string {
  const v = (s ?? '').trim();
  if (!v) return 'Gratuit';
  return v.replace(/\d{4,}/g, (n) => n.replace(/\B(?=(\d{3})+(?!\d))/g, ' '));
}

export const COMP_FORMATS = ['Poules + tableau final', 'Americano (rotation)', 'Mini-tournoi', 'Élimination directe'];
