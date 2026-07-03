import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { setPendingReferral } from '@/lib/pendingReferral';
import { useApp } from '@/store/AppContext';

// Cible d’un Universal Link padelconnectci.com/invite/CODE : on met le code de parrainage de côté
// puis on renvoie à la racine. Le RootLayout redirige alors vers l’onboarding (si pas de compte),
// où le code est pré-rempli — ou vers l’accueil si l’utilisateur est déjà connecté.
export default function InviteRoute() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const { state, hydrated } = useApp();
  const value = Array.isArray(code) ? code[0] : code;
  // Effet (pas dans le corps du rendu) : le parrainage ne vaut qu’à l’inscription, donc on ne le
  // mémorise QUE si aucun compte n’est encore connecté (un compte existant ne peut plus être
  // parrainé). On attend l’hydratation : au cold start via Universal Link, state.account vaut
  // encore null (état initial) même si un compte EST bel et bien connecté — sans cette garde, le
  // code serait mémorisé à tort pour un utilisateur déjà inscrit.
  useEffect(() => {
    if (hydrated && value && !state.account) setPendingReferral(value);
  }, [hydrated, value, state.account]);
  // Tant que l’hydratation n’est pas terminée, on NE redirige PAS : un démontage prématuré de
  // cette route empêcherait l’effet ci-dessus de jamais s’exécuter (cold start via Universal
  // Link) et le code de parrainage serait perdu. On garde la route montée le temps nécessaire.
  if (!hydrated) return null;
  return <Redirect href="/" />;
}
