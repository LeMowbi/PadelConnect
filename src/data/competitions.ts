// Compétitions — tournois RÉELS créés par un CLUB ou par un JOUEUR (aucune donnée de démo).

import { podium, standings } from '@/lib/americano';
import { dateKeyLabel } from '@/lib/days';

export type Competition = {
  id: string;
  title: string;
  organizerType: 'club' | 'joueur' | 'operator'; // operator = tournoi officiel PadelConnect
  organizer: string;
  organizerId?: string; // id serveur de l’organisateur (tournois serveur) — sert au « c’est moi »
  organizerPhone?: string; // numéro de l’organisateur (pour régler les frais d’inscription)
  clubId?: string;
  clubName?: string;
  date: string; // libellé d’affichage (jour de DÉBUT)
  dateKey: string; // identité stable du jour de début (AAAA-MM-JJ) — base du blocage des terrains
  // Tournoi sur PLUSIEURS jours (ex. americano sur un week-end) : jour de fin optionnel.
  // Absent ou égal au jour de début → événement d’une seule journée.
  endDate?: string;
  endDateKey?: string;
  format: string;
  level: string;
  reward: string; // récompense / dotation
  fee: string; // frais d’inscription
  slots: number; // nombre d’ÉQUIPES (capacité)
  registered: number;
  official?: boolean;
  createdByMe?: boolean;
  // Tournoi serveur (synchronisé) vs seed/local : pilote l’écriture (RPC) côté store.
  server?: boolean;
  // Terrains et créneaux PRÉCIS réservés au tournoi (bloqués). Vides = ancien comportement
  // (tout le club bloqué ce jour-là) — gardé pour les seeds de démonstration.
  courtNames?: string[];
  timeSlots?: string[];
  // Durée (min) de CHAQUE créneau du tournoi, alignée sur timeSlots (créneaux modulables 1h/1h30).
  // Vide/absent = 1h30 par défaut sur chaque créneau (rétrocompat + tournois seed).
  slotDurations?: number[];
  // Roster RÉEL des équipes inscrites (tournois serveur) — « Prénom & Partenaire ». Remplace
  // les noms de démonstration : le nombre d’inscrits et les noms affichés sont vrais.
  teamNames?: string[];
  commission?: number; // frais fixe PadelConnect figé à la création (tournois joueurs)
  // Modération : un tournoi créé par un JOUEUR reste « pending » jusqu’à validation du
  // club hôte (« rejected » s’il est refusé). Club / seeds → visibles directement.
  status?: 'pending' | 'approved' | 'rejected';
  // Motif de refus laissé par le club (52) — l’organisateur sait quoi changer avant de recréer.
  rejectReason?: string;
  // Tournoi CLÔTURÉ côté serveur (status='closed', résultats figés). On garde `status='approved'`
  // (donc toujours VISIBLE : palmarès, fiche) mais ce drapeau distinct sert au blocage de dispo :
  // un tournoi clôturé LIBÈRE ses terrains (le serveur ne bloque QUE 'published'), il ne doit donc
  // plus masquer aucun créneau — sinon un multi-jours clôturé avant sa fin sur-bloque le lendemain.
  closed?: boolean;
  // Paiement Wave des frais (v2) : 'unpaid' tant que l’opérateur n’a pas confirmé, 'paid' ensuite.
  paymentStatus?: 'unpaid' | 'paid';
  // État americano auto-géré (82) — présent seulement si l'organisateur a lancé la gestion.
  americano?: import('@/lib/americano').AmericanoState;
};

// Tournoi visible publiquement (listes, accueil, fiche club) : ni « en attente », ni « refusé ».
export function isTournamentPublic(c: Competition): boolean {
  return c.status !== 'pending' && c.status !== 'rejected';
}

// Tournoi qui BLOQUE réellement des terrains/créneaux dans le calcul de disponibilité — miroir EXACT
// de la garde serveur (`reservations_availability_guard`, qui ne bloque QUE 'published') : public ET
// non clôturé. Un tournoi clôturé reste affiché (isTournamentPublic) mais libère ses créneaux.
export function isTournamentBlocking(c: Competition): boolean {
  return isTournamentPublic(c) && !c.closed;
}

// Libellé de date : « du X au Y » si le tournoi s’étale sur plusieurs jours, sinon le jour seul.
// Dérivé de dateKey/endDateKey (date ABSOLUE) — jamais du libellé relatif figé à la création
// (sinon « Demain 30 » resterait affiché une fois le jour passé).
export function compDateLabel(c: Competition): string {
  const start = dateKeyLabel(c.dateKey);
  return c.endDateKey && c.endDateKey !== c.dateKey ? `${start} → ${dateKeyLabel(c.endDateKey)}` : start;
}

// Aucun tournoi de démonstration : les tournois affichés sont RÉELS (créés par les clubs/joueurs
// et synchronisés côté serveur). On n’expose donc jamais d’inscrits ni d’équipes inventés.
export const seedCompetitions: Competition[] = [];

// Nombre d’équipes inscrites (jamais au-dessus de la capacité). Tournoi SERVEUR : le compteur
// serveur est déjà exact (ma propre inscription incluse) → on le prend tel quel. Seeds de démo :
// mon inscription LOCALE s’ajoute au nombre figé de la démo.
export function teamCount(comp: Competition, isRegistered: boolean): number {
  if (comp.server) return Math.min(comp.slots, comp.registered);
  return Math.min(comp.slots, comp.registered + (isRegistered ? 1 : 0));
}

// Équipes à afficher : le roster RÉEL pour un tournoi serveur (aucun nom fictif). Un tournoi
// local (hors session) n’a pas de roster serveur : seule MON équipe (si inscrit) est connue.
// `myTeam` est mis en tête pour le mettre en avant.
export function teamsToShow(comp: Competition, myTeam?: string): string[] {
  if (comp.server) {
    const list = comp.teamNames ?? [];
    if (!myTeam) return list;
    return [myTeam, ...list.filter((t) => t !== myTeam)]; // ma team en tête, sans doublon
  }
  return myTeam ? [myTeam] : [];
}

// Podium de l’americano auto-géré (82) traduit en noms d’ÉQUIPE. Le classement americano est
// INDIVIDUEL (par joueur) alors que la clôture désigne des ÉQUIPES : on retrouve l’équipe
// « Prénom & Partenaire » qui contient le joueur classé. Sert UNIQUEMENT à PRÉ-REMPLIR la
// clôture — l’organisateur garde le dernier mot. Renvoie {} tant qu’aucun score n’est saisi
// (sinon on suggérerait un « vainqueur » à 0 point, tiré de l’ordre alphabétique).
// Une place dont l’équipe est inconnue (joueur ajouté à la main) ou DÉJÀ classée plus haut
// (les 2 joueurs d’une même équipe sur le podium) reste vide : jamais de sélection invisible.
export function americanoPodiumTeams(comp: Competition, myTeam?: string): { first?: string; second?: string; third?: string } {
  const state = comp.americano;
  if (!state?.rounds?.length || !state.scores?.length) return {};
  const teams = teamsToShow(comp, myTeam);
  const teamOf = (player?: string): string | undefined => {
    if (!player) return undefined;
    const key = player.trim().toLocaleLowerCase();
    return teams.find((t) => t.split(' & ').some((n) => n.trim().toLocaleLowerCase() === key));
  };
  const top = podium(standings(state.players, state.rounds, state.scores));
  const first = teamOf(top.first);
  const second = teamOf(top.second);
  const third = teamOf(top.third);
  return {
    first,
    second: second && second !== first ? second : undefined,
    third: third && third !== first && third !== second ? third : undefined,
  };
}

// Le tournoi a-t-il des frais d’inscription (≠ gratuit) ? Sert à proposer de contacter
// l’organisateur pour le règlement.
export function hasEntryFee(fee: string | undefined): boolean {
  const v = (fee ?? '').trim().toLowerCase();
  return v.length > 0 && v !== 'gratuit';
}

// Frais / récompense saisis librement par l’organisateur : on formate les nombres
// avec séparateurs de milliers (« 10000 FCFA » → « 10 000 FCFA ») et un champ vide
// devient « Gratuit » — même règle partout (cartes, fiches, partage).
export function formatFee(s: string | undefined): string {
  const v = (s ?? '').trim();
  if (!v) return 'Gratuit';
  return v.replace(/\d{4,}/g, (n) => n.replace(/\B(?=(\d{3})+(?!\d))/g, ' '));
}

// Cycle de vie d’un tournoi : « terminé » = jour de fin STRICTEMENT passé (le jour même = en
// cours, on ne clôture pas avant que ça se joue ; pour un multi-jours c’est la date de FIN qui
// fait foi). `todayKey` passé par l’appelant (dayKey(new Date()) ou useTodayKey) — même règle
// partout (carte, fiche joueur, Espace Club).
export function isCompFinished(comp: Competition, todayKey: string): boolean {
  return (comp.endDateKey ?? comp.dateKey) < todayKey;
}

// Remplissage d’un tournoi : places restantes + pourcentage (barre). `full` se dérive au besoin
// côté appelant (la fiche joueur exclut l’inscrit courant du « complet »). Math.max(1,…) : jamais
// de NaN si slots vaut 0.
export function compFill(comp: Competition, teams: number): { left: number; pct: number } {
  const left = Math.max(0, comp.slots - teams);
  const pct = Math.min(100, Math.round((teams / Math.max(1, comp.slots)) * 100));
  return { left, pct };
}

export const COMP_FORMATS = ['Poules + tableau final', 'Americano (rotation)', 'Mini-tournoi', 'Élimination directe'];
