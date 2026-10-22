// Format du code de parrainage — module PUR (aucune dépendance React Native), testé par
// tests/referralCode.test.ts. Utilisé par l'inscription (onboarding : retour sur la saisie et
// « Coller mon code »).

// Code de parrainage : 12 caractères hexadécimaux en majuscules — format des codes générés
// (`referralCodeForUser`, referrals.ts) et miroir de la garde de la page d'invitation du site.
export const REFERRAL_CODE = /^[0-9A-F]{12}$/;

// « Coller mon code » : le presse-papiers peut contenir le code SEUL, le lien d'invitation
// (padelconnectci.com/invite/CODE) ou un message entier — on découpe en mots alphanumériques
// et on garde le premier qui a exactement le format d'un code (null sinon).
export const referralCodeIn = (text: string): string | null =>
  text
    .toUpperCase()
    .split(/[^0-9A-Z]+/)
    .find((t) => REFERRAL_CODE.test(t)) ?? null;
