import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { EmptyState } from '@/components/ui';

// Page de repli d'expo-router : un lien profond malformé (custom scheme tapé à la main, route
// disparue) affichait l'écran technique « Unmatched Route ». On rend à la place un écran soigné
// qui ramène à l'accueil — plus rassurant, jamais un cul-de-sac.
export default function NotFound() {
  const router = useRouter();
  return (
    <Screen back>
      <EmptyState
        icon="compass-outline"
        title="Page introuvable"
        text="Ce lien n'existe plus ou est incorrect. Reviens à l'accueil pour continuer."
        actionLabel="Retour à l'accueil"
        onAction={() => router.replace('/')}
      />
    </Screen>
  );
}
