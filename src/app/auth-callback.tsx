import { Redirect } from 'expo-router';

// Cible des liens de confirmation (changement d’e-mail, etc.) : l’échange du code est géré
// ailleurs (useEmailConfirmLink) ; ici on renvoie simplement l’utilisateur à l’accueil pour
// ne pas le laisser sur l’écran technique « Unmatched Route ».
export default function AuthCallback() {
  return <Redirect href="/" />;
}
