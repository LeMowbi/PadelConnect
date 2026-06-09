import { Share } from 'react-native';
import type { Match } from '@/data/matches';

const APP_URL = 'https://lemowbi.github.io/Test-1/';

// Partage un match (WhatsApp, SMS, etc.) pour inviter des amis.
export function inviteToMatch(match: Match): void {
  const message =
    `Rejoins mon match de padel sur PadelConnect 🎾\n` +
    `${match.clubName} · ${match.date} à ${match.time}\n${APP_URL}`;
  Share.share({ message }).catch(() => {});
}
