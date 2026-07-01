import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { setPendingReferral } from '@/lib/pendingReferral';
import { useApp } from '@/store/AppContext';

// Cible d'un Universal Link padelconnectci.com/invite/CODE : on met le code de parrainage de côté
// puis on renvoie à la racine. Le RootLayout redirige alors vers l'onboarding (si pas de compte),
// où le code est pré-rempli — ou vers l'accueil si l'utilisateur est déjà connecté.
export default function InviteRoute() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const { state } = useApp();
  const value = Array.isArray(code) ? code[0] : code;
  // Effet (pas dans le corps du rendu) : le parrainage ne vaut qu'à l'inscription, donc on ne le
  // mémorise QUE si aucun compte n'est encore connecté (un compte existant ne peut plus être parrainé).
  useEffect(() => {
    if (value && !state.account) setPendingReferral(value);
  }, [value, state.account]);
  return <Redirect href="/" />;
}
