// Messages types (réponses rapides) pour un match : au lieu d'UN message figé, on propose
// quelques modèles pré-remplis (on joue / rappel / il manque des joueurs / j'annule) que le
// joueur envoie en un tap sur WhatsApp. Fonction PURE (aucune dépendance native) : la couche UI
// ne fait que présenter la liste et ouvrir WhatsApp avec le `body` choisi.

import { durationLabel } from './courtSchedule.ts';
import { dateKeyLabel } from './days.ts';
import { perPlayerOf } from './format.ts';
import type { Reservation } from '@/store/AppContext';

// icon = clé Ionicons (typée `string` ici pour garder ce module pur/testable — l'UI la caste).
export type MatchTemplate = { key: string; label: string; icon: string; body: string };

// Équipe d'un match HORS moi : l'organisateur en tête si ce n'est pas mon match (`iOwn` =
// isReservationOwner chez l'appelant), puis les invités. Règle UNIQUE partagée par le modèle
// « On joue ! » et la carte « Prochain match » de l'accueil (même équipe aux deux endroits).
export function matchTeam(r: Reservation, iOwn: boolean): string[] {
  return [...(iOwn ? [] : [r.bookedBy?.name ?? 'Organisateur']), ...r.invited.map((i) => i.name)];
}

// `clubUrl` = lien Universal du club (partage) fourni par l'appelant, pour rester découplé de
// la config d'app (referrals) et donc testable sans dépendance native. `iOwn` = je suis
// l'organisateur (isReservationOwner chez l'appelant) : sinon l'équipe commence par lui.
export function matchTemplates(r: Reservation, clubUrl: string, iOwn: boolean): MatchTemplate[] {
  // Durée RÉELLE du créneau (1h/1h30, 68) — déjà portée par la réservation, pas de paramètre à ajouter.
  const when = `${r.clubName} — ${dateKeyLabel(r.dateKey)} à ${r.time} (session ${durationLabel(r.durationMin)})`;
  // Modèle « On joue ! » (en tête) réutilisé tel quel par la carte « Prochain match » de l'accueil.
  const team = matchTeam(r, iOwn);
  const who = r.coachName ? `\nCours avec ${r.coachName}` : team.length ? `\nÉquipe : ${team.join(', ')}` : '';
  const cap = r.openCapacity ?? 4;
  // Part sur la CAPACITÉ pour un match OUVERT (les places libres seront prises), sinon sur
  // l'effectif RÉEL — même base que la carte « Mes réservations » et l'accueil.
  const heads = r.openMatch ? cap : Math.max(1, 1 + r.invited.length);
  const share = r.price ? `\nPrévois ${perPlayerOf(r.price, heads)} chacun.` : '';
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
