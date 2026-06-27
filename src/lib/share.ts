import { Platform, Share } from 'react-native';
import { formatFee, type Competition } from '@/data/competitions';

const APP_URL = 'https://lemowbi.github.io/PadelConnect/';

export type ShareResult = 'shared' | 'copied' | 'none';

// Partage un message : feuille native quand elle existe, sinon (web de bureau)
// copie le lien dans le presse-papiers — l'appelant affiche « Lien copié ! ».
async function shareMessage(message: string): Promise<ShareResult> {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && !(navigator as any).share) {
    try {
      await navigator.clipboard.writeText(message);
      return 'copied';
    } catch {
      return 'none';
    }
  }
  try {
    await Share.share({ message });
    return 'shared';
  } catch {
    return 'none';
  }
}

// Partage la fiche d'un club.
export function shareClub(club: { name: string; area: string }): Promise<ShareResult> {
  const message =
    `Découvre ${club.name} (${club.area}) sur PadelConnect — réserve ton terrain en quelques secondes 🎾\n${APP_URL}`;
  return shareMessage(message);
}

// Partage un tournoi pour recruter des équipes.
export function shareCompetition(comp: Competition): Promise<ShareResult> {
  const where = comp.clubName ? ` à ${comp.clubName}` : '';
  const message =
    `Tournoi de padel${where} : « ${comp.title} » le ${comp.date} 🏆\n` +
    (comp.reward.trim() ? `Récompense : ${formatFee(comp.reward)}. ` : '') +
    `Inscris ton équipe sur PadelConnect 👉 ${APP_URL}`;
  return shareMessage(message);
}
