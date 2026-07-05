import { Platform, Share } from 'react-native';
import { compDateLabel, formatFee, type Competition } from '@/data/competitions';
import { APP_DOMAIN } from '@/lib/referrals';

export type ShareResult = 'shared' | 'copied' | 'none';

// Partage un message : feuille native quand elle existe, sinon (web de bureau)
// copie le lien dans le presse-papiers — l’appelant affiche « Lien copié ! ».
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

// Partage d’un message libre (export CSV opérateur, demande de boost, parrainage…) — même
// stratégie feuille native / repli presse-papiers web, pour ne plus laisser un rejet non géré
// (le `Share.share` de RN-Web rejette quand le navigateur de bureau n’a pas `navigator.share`).
export function shareText(message: string): Promise<ShareResult> {
  return shareMessage(message);
}

// Partage la fiche d’un club — Universal Link /club/ID (déclaré dans l’AASA) : ouvre
// directement la fiche dans l’app si elle est installée, sinon la page renvoie à l’App Store.
export function shareClub(club: { id: string; name: string; area: string }): Promise<ShareResult> {
  const message = `Découvre ${club.name} (${club.area}) sur PadelConnect — réserve ton terrain en quelques secondes 🎾\n${APP_DOMAIN}/club/${club.id}`;
  return shareMessage(message);
}

// Partage un tournoi pour recruter des équipes.
export function shareCompetition(comp: Competition): Promise<ShareResult> {
  const where = comp.clubName ? ` à ${comp.clubName}` : '';
  // Plage COMPLÈTE (début → fin) et non le seul jour de début : un tournoi sur plusieurs jours
  // était partagé comme s’il durait un jour.
  const message =
    `Tournoi de padel${where} : « ${comp.title} » le ${compDateLabel(comp)} 🏆\n` +
    (comp.reward.trim() ? `Récompense : ${formatFee(comp.reward)}. ` : '') +
    `Inscris ton équipe sur PadelConnect 👉 ${APP_DOMAIN}`;
  return shareMessage(message);
}
