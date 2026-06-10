import { Share } from 'react-native';
import type { Competition } from '@/data/competitions';
import type { Match } from '@/data/matches';

const APP_URL = 'https://lemowbi.github.io/Test-1/';

// Partage un match (WhatsApp, SMS, etc.) pour inviter des amis.
export function inviteToMatch(match: Match): void {
  const message =
    `Rejoins mon match de padel sur PadelConnect 🎾\n` +
    `${match.clubName} · ${match.date} à ${match.time} · niveau ${match.levelValue.toFixed(1)}\n${APP_URL}`;
  Share.share({ message }).catch(() => {});
}

// Partage la fiche d'un club.
export function shareClub(club: { name: string; area: string }): void {
  const message =
    `Découvre ${club.name} (${club.area}) sur PadelConnect — réserve ton terrain en quelques secondes 🎾\n${APP_URL}`;
  Share.share({ message }).catch(() => {});
}

// Partage un tournoi pour recruter des équipes.
export function shareCompetition(comp: Competition): void {
  const where = comp.clubName ? ` à ${comp.clubName}` : '';
  const message =
    `Tournoi de padel${where} : « ${comp.title} » le ${comp.date} 🏆\n` +
    `Récompense : ${comp.reward}. Inscris ton équipe sur PadelConnect 👉 ${APP_URL}`;
  Share.share({ message }).catch(() => {});
}
