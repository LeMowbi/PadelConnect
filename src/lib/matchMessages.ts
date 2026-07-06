// Messages types (réponses rapides) pour un match : au lieu d'UN message figé, on propose
// quelques modèles pré-remplis (on joue / rappel / il manque des joueurs / j'annule) que le
// joueur envoie en un tap sur WhatsApp. Fonctions PURES (testées sous node) : la couche UI
// ne fait que présenter la liste et ouvrir WhatsApp avec le `body` choisi.

import { dateKeyLabel } from './days';
import { perPlayerOf } from './format';
import type { Reservation } from '@/store/AppContext';

// icon = clé Ionicons (typée `string` ici pour garder ce module pur/testable — l'UI la caste).
export type MatchTemplate = { key: string; label: string; icon: string; body: string };

// `clubUrl` = lien Universal du club (partage) fourni par l'appelant, pour rester découplé de
// la config d'app (referrals) et donc testable sans dépendance native.
export function matchTemplates(r: Reservation, clubUrl: string): MatchTemplate[] {
  const when = `${r.clubName} — ${dateKeyLabel(r.dateKey)} à ${r.time} (session 1h30)`;
  const who = r.invited.length ? `\nÉquipe : ${r.invited.map((i) => i.name).join(', ')}` : '';
  const share = r.price ? `\nPrévois ${perPlayerOf(r.price, 1 + r.invited.length)} chacun.` : '';
  const cap = r.openCapacity ?? 4;
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
      body: `Petit rappel 🎾 on joue au padel : ${when}. À tout' !`,
    },
    {
      key: 'cancel',
      label: "J'annule",
      icon: 'close-circle-outline',
      body: `Désolé, je dois annuler notre padel : ${when} 😔 On remet ça très vite !`,
    },
  ];

  // « Il manque des joueurs » : seulement si l'équipe n'est pas déjà complète (place à prendre).
  if (r.invited.length < cap - 1) {
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
