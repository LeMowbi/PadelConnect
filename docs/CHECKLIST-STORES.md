# Checklist — Publier PadelConnect sur l'App Store (iPhone) et Google Play (Android)

> Document pratique pour le porteur. Le projet est **déjà lié à Expo** (compte `padelconnect-ci`,
> projet `padelconnect`) et **`eas.json` est prêt** (profils `development` / `preview` / `production`).
> Tant qu'on reste en démo, rien de tout ceci n'est obligatoire. Cette page sert pour le **vrai lancement**.

## 0. Rappel des deux jalons
- **Build de démonstration** (déjà fait pour Android) : APK installable, gratuit, ne demande qu'un compte Expo.
- **Publication store** (ci-dessous) : nécessite des comptes payants et des éléments légaux/marketing.

## 1. Comptes à créer (par le porteur — identité + carte bancaire)
- [ ] **Compte Expo** — déjà créé (`padelconnect-ci`). ✅
- [ ] **Apple Developer Program** — ~99 USD/an — https://developer.apple.com/programs/ (obligatoire pour l'iPhone : TestFlight + App Store).
- [ ] **Google Play Console** — 25 USD une fois — https://play.google.com/console (obligatoire pour Android sur le Play Store).
- [ ] (Plus tard, version connectée) **Supabase** + fournisseur **SMS** — voir GUIDE-LANCEMENT.md (chantier §B serveur).

## 2. Éléments légaux (obligatoires, à faire valider une fois)
- [ ] **Politique de confidentialité** rédigée + **hébergée à une URL publique** (Apple et Google l'exigent). L'écran « légal » de l'app est un brouillon de démo — à faire valider par un juriste (conformité **ARTCI** Côte d'Ivoire).
- [ ] **CGU** (conditions générales d'utilisation).
- [ ] Renseigner ces URLs dans App Store Connect et Play Console.

## 3. Éléments marketing (à préparer)
- [ ] **Icône** 1024×1024 (déjà présente, opaque ✅).
- [ ] **Captures d'écran** par taille d'appareil (iPhone 6.7" et 6.5", + tablette si `supportsTablet`; Android téléphone). On peut les générer depuis la démo.
- [ ] **Description** (FR), **mots-clés**, **catégorie** (Sport / Style de vie).
- [ ] **Nom affiché** : PadelConnect.

## 4. Identité technique (déjà figée dans app.json)
- [ ] iOS `bundleIdentifier` = `ci.padelco.app` (IMMUABLE après publication — confirmer avant le 1er envoi).
- [ ] Android `package` = `ci.padelco.app`.
- [ ] `version` = 1.0.0 ; `ios.buildNumber` / `android.versionCode` = 1 (à incrémenter à chaque envoi — le profil `production` d'eas.json gère l'auto-incrément).

## 5. Fabriquer et envoyer (commandes EAS, depuis un ordinateur)
```bash
# Se connecter (une fois)
npx eas-cli login

# Android — version de production (.aab pour le Play Store)
npx eas-cli build --platform android --profile production

# iOS — version de production (nécessite le compte Apple Developer)
npx eas-cli build --platform ios --profile production

# Envoyer aux stores (EAS gère la signature et l'upload)
npx eas-cli submit --platform android --profile production
npx eas-cli submit --platform ios --profile production
```
> Astuce iPhone sans publier tout de suite : `--profile production` puis `eas submit` vers **TestFlight** pour tester sur de vrais iPhones avant la mise en vente.

## 6. Avant d'ouvrir au public (rappels du projet)
- [ ] **Backend §B** (Supabase Auth + base partagée + SMS) — sans lui, chaque téléphone est isolé. Bloquant pour un vrai lancement, volontairement différé (voir RAPPORT.md / STRATEGIE.md).
- [ ] **Gating serveur** des rôles (opérateur / gérant) à la place des codes 4 chiffres et du geste secret de démo.
- [ ] **Relecture sécurité** par un expert.

## 7. Note importante — Expo Go
L'app utilise **Expo SDK 56** (récent). L'**Expo Go public de l'App Store ne le supporte pas encore** :
pour faire tester sur iPhone avant publication, privilégier **TestFlight** (build `production`/`preview`)
ou la **démo web**. Sur Android, l'**APK `preview`** s'installe directement.
