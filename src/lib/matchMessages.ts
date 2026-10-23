// Helpers PURS d'un match vu par MOI (aucune dépendance native — testables) : messages types
// (réponses rapides) envoyés en un tap sur WhatsApp, équipes de la carte de résultat partagée,
// libellés des invités et confirmation du score en un tap. La couche UI ne fait que présenter.

import { durationLabel } from './courtSchedule.ts';
import { dateKeyLabel } from './days.ts';
import { perPlayerOf } from './format.ts';
import type { MatchSet } from '@/lib/matchResults';
import type { Invited, Reservation } from '@/store/AppContext';

// icon = clé Ionicons (typée `string` ici pour garder ce module pur/testable — l'UI la caste).
export type MatchTemplate = { key: string; label: string; icon: string; body: string };

// Un joueur du match (hors moi) : `id` sert aux sélections (homonymes possibles), `name` à l'affichage.
export type MatchPlayer = { id: string; name: string };

// Les AUTRES joueurs d'un match : l'organisateur en tête si ce n'est pas mon match (`iOwn` =
// isReservationOwner chez l'appelant), puis les invités. MOI exclu PAR ID — mon entrée d'invité
// porte mon id de compte, ou « open-<id> » quand j'ai rejoint un match ouvert — jamais par prénom
// (deux joueurs peuvent porter le même). Sans `myId`, aucune entrée n'est retirée.
export function matchOthers(r: Reservation, iOwn: boolean, myId?: string | null): MatchPlayer[] {
  const self = myId ? [myId, `open-${myId}`] : [];
  return [
    ...(iOwn ? [] : [{ id: r.userId ?? 'organisateur', name: r.bookedBy?.name ?? 'Organisateur' }]),
    ...r.invited.filter((i) => !self.includes(i.id)).map((i) => ({ id: i.id, name: i.name })),
  ];
}

// Équipe d'un match HORS moi (noms) — règle UNIQUE partagée par le modèle « On joue ! » et la
// carte « Prochain match » de l'accueil (même équipe aux deux endroits).
export function matchTeam(r: Reservation, iOwn: boolean, myId?: string | null): string[] {
  return matchOthers(r, iOwn, myId).map((p) => p.name);
}

// Équipes de la carte de résultat partagée en image : MON équipe (moi + le partenaire choisi, par
// ID) contre les autres joueurs. 1v1 (un seul autre joueur) : aucun partenaire. Partenaire inconnu
// (liste changée depuis le choix) : le premier des autres, comme le choix par défaut de l'écran.
export function shareTeamsOf(
  r: Reservation,
  myId: string | null | undefined,
  iOwn: boolean,
  myName: string,
  partnerId: string,
): { teamA: string[]; teamB: string[] } {
  const others = matchOthers(r, iOwn, myId);
  if (others.length <= 1) return { teamA: [myName], teamB: others.map((p) => p.name) };
  const partner = others.find((p) => p.id === partnerId) ?? others[0];
  return { teamA: [myName, partner.name], teamB: others.filter((p) => p !== partner).map((p) => p.name) };
}

// Libellé d'un invité sur la carte du CRÉATEUR : « ✓ » une fois l'invitation acceptée (96 pose
// `confirmed`), « en attente » tant qu'elle ne l'est pas. Un nom saisi sans compte (« x-… ») n'a
// pas d'invitation à accepter, un joueur qui a REJOINT un match ouvert (« open-… ») a déjà sa
// place : ni l'un ni l'autre n'est jamais « en attente ».
export function invitedLabel(i: Invited): string {
  if (i.id.startsWith('x-')) return i.name;
  if (i.confirmed || i.id.startsWith('open-')) return `${i.name} ✓`;
  return `${i.name} (en attente)`;
}

// Confirmation du score EN UN TAP : à partir du score canonique d'un autre joueur (« 6-3, 6-4 »,
// vu du VAINQUEUR — forme écrite par submit_match_score), les sets de MON point de vue (« nous »
// puis « eux ») selon que mon équipe a gagné ou perdu. null = score illisible (saisie manuelle).
export function setsFromCanon(canon: string, iWon: boolean): MatchSet[] | null {
  const parts = canon.split(',').map((s) => s.trim());
  if (parts.length > 3) return null;
  const sets: MatchSet[] = [];
  for (const p of parts) {
    const m = /^(\d{1,2})-(\d{1,2})$/.exec(p);
    if (!m) return null;
    const win = Number(m[1]);
    const lose = Number(m[2]);
    sets.push(iWon ? { me: win, them: lose } : { me: lose, them: win });
  }
  return sets;
}

// `clubUrl` = lien Universal du club (partage) fourni par l'appelant, pour rester découplé de
// la config d'app (referrals) et donc testable sans dépendance native. `iOwn` = je suis
// l'organisateur (isReservationOwner chez l'appelant) : sinon l'équipe commence par lui.
// `myId` : mon compte, retiré de l'équipe annoncée (cf. matchOthers).
export function matchTemplates(r: Reservation, clubUrl: string, iOwn: boolean, myId?: string | null): MatchTemplate[] {
  // Durée RÉELLE du créneau (1h/1h30, 68) — déjà portée par la réservation, pas de paramètre à ajouter.
  const when = `${r.clubName} — ${dateKeyLabel(r.dateKey)} à ${r.time} (session ${durationLabel(r.durationMin)})`;
  // Modèle « On joue ! » (en tête) réutilisé tel quel par la carte « Prochain match » de l'accueil.
  const team = matchTeam(r, iOwn, myId);
  const who = r.coachName ? `\nCours avec ${r.coachName}` : team.length ? `\nÉquipe : ${team.join(', ')}` : '';
  const cap = r.openCapacity ?? 4;
  // Part sur la CAPACITÉ pour un match OUVERT (les places libres seront prises), sinon sur
  // l'effectif RÉEL — même base que la carte « Mes réservations » et l'accueil. Arrondie à la
  // centaine : « ~ » partout où une part est annoncée.
  const heads = r.openMatch ? cap : Math.max(1, 1 + r.invited.length);
  const share = r.price ? `\nPrévois ~${perPlayerOf(r.price, heads)} chacun.` : '';
  const missing = Math.max(1, cap - 1 - r.invited.length);

  const templates: MatchTemplate[] = [
    {
      key: 'play',
      label: 'On joue !',
      icon: 'tennisball',
      body: `On joue au padel ! 🎾\n${when}\n${r.court}${who}${share}\nRéservé via PadelConnect.`,
    },
    {
      key: 'remind',
      label: 'Rappel',
      icon: 'alarm-outline',
      body: `Petit rappel 🎾 on joue au padel : ${when}. À tout’ !`,
    },
    {
      key: 'cancel',
      label: 'J’annule',
      icon: 'close-circle-outline',
      body: `Désolé, je dois annuler notre padel : ${when} 😔 On remet ça très vite !`,
    },
  ];

  // « Il manque des joueurs » : seulement pour MON match (jamais un cours) dont l'équipe n'est
  // pas complète — mêmes gardes que le bouton « Chercher des joueurs » et l'accueil.
  if (iOwn && !r.coachName && r.invited.length < cap - 1) {
    templates.splice(1, 0, {
      key: 'find',
      label: 'Il manque des joueurs',
      icon: 'people-outline',
      body:
        `Il me manque ${missing} joueur${missing > 1 ? 's' : ''} au padel ! 🎾\n` +
        `${when}${r.price ? ` · ~${perPlayerOf(r.price, cap)}/joueur` : ''}\n` +
        `Qui vient ? ${clubUrl}`,
    });
  }
  return templates;
}
