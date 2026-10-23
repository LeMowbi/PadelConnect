# Android — préparation du lancement (guide cliquable)

> État au 2026-08-21 : **un APK de test est prêt** (build EAS `preview`, signé par la clé EAS) et
> l'empreinte de signature est DÉJÀ posée dans `site/assetlinks.json` (déployé). Il reste au
> porteur : tester l'APK, créer le compte Google Play, et créer le projet Firebase (push FCM).

## 1) Tester l'app sur n'importe quel Android (dès maintenant, gratuit)

1. Sur le téléphone Android, ouvre ce lien et télécharge le fichier :
   `https://expo.dev/artifacts/eas/uAupbMe0bZv1bBgWmIzzYpp1HsX1EUf-ZdSk3qX6too.apk`
2. Ouvre le fichier téléchargé → Android demande d'autoriser « installer des applications
   inconnues » pour le navigateur → **Autoriser** → **Installer**.
3. L'app s'ouvre et fonctionne (réservations, tournois, tout le cœur). ⚠️ Les **notifications
   push ne marchent PAS encore** sur Android : il faut Firebase (étape 3) puis un nouveau build.
   (Un lien de test plus récent peut être regénéré à la demande — les artefacts EAS expirent au
   bout de ~30 jours.)

## 2) Créer le compte Google Play Console (25 $ une seule fois)

1. Va sur `play.google.com/console` → connecte-toi avec le compte Google de PadelConnect
   (`padelconnect.civ@gmail.com`) → « Créer un compte développeur » (type **Organisation** si tu
   as les papiers de l'entreprise, sinon **Personnel**).
2. Paie les 25 $ (une fois, à vie) et remplis l'identité. La vérification prend quelques jours.
3. Ne crée PAS encore la fiche de l'app — on la fera ensemble (les textes sont prêts en bas de
   ce document).

## 3) Firebase / FCM — pour que les push marchent sur Android (10 min)

1. Va sur `console.firebase.google.com` → **Ajouter un projet** → nom : `PadelConnect` →
   (Analytics : facultatif, tu peux désactiver).
2. Dans le projet : **Ajouter une application** → icône **Android** →
   nom du package : `ci.padelco.app` → Enregistrer.
3. Télécharge le fichier **`google-services.json`** proposé, et envoie-le à l'assistant (comme
   pour les clés) : il sera branché dans le build (`app.json` → `android.googleServicesFile`)
   SANS être commité en clair s'il contient des identifiants sensibles (il est en général
   committable, décision à confirmer au moment du branchement).
4. Toujours dans Firebase : ⚙️ **Paramètres du projet** → onglet **Cloud Messaging** →
   active l'**API Firebase Cloud Messaging (V1)** si demandé.
5. Dernière étape (croisée avec Expo) : `expo.dev` → projet padelconnect → **Credentials →
   Android** → ajouter la **clé de service FCM** (le Dashboard Expo guide, « Upload a Google
   Service Account Key ») — l'assistant peut le faire si tu fournis le fichier de clé de service.

## 4) App Links (liens padelconnectci.com qui ouvrent l'app) — ✅ DÉJÀ FAIT

L'empreinte SHA-256 de la clé de signature EAS est posée dans
`https://padelconnectci.com/.well-known/assetlinks.json` (vérifié en ligne). ⚠️ Le jour de la
publication sur le **Play Store**, Google RE-SIGNE l'app avec SA propre clé (« Play App
Signing ») : il faudra AJOUTER l'empreinte de Google au fichier (Play Console → Configuration →
Signature d'application → copier l'empreinte SHA-256 → la donner à l'assistant, qui l'ajoutera
au tableau à côté de celle d'EAS — les deux coexistent).

Chemins déclarés côté app (`app.json` → `android.intentFilters`) : `/invite`, `/club` et, depuis
octobre 2026, `/auth-callback` (lien de confirmation d'e-mail, comme sur iPhone). Ce dernier ne
prend effet qu'au **prochain build Android** (l'APK de test actuel ouvre encore la page web
« Adresse confirmée », le joueur se connecte alors à la main). À tester sur un vrai téléphone au
lancement Play : le lien de l'e-mail passe d'abord par Supabase (`/verify`) puis redirige vers
`padelconnectci.com/auth-callback` — si Chrome garde la main, la page web reste un repli honnête.

## 5) Fiche Play Store — textes et formulaires

- **Titre, description courte et description longue** : SOURCE UNIQUE `docs/STORE-LISTING.md`
  §2.1-2.3 (comptées, sans emoji, conditions du §0 à cocher avant de pousser). Ne pas les recopier
  ici : une seconde version finirait par diverger.
- **Catégorie** : Sports. **Contact** : contact@padelconnectci.com ·
  site `https://padelconnectci.com` · confidentialité `https://padelconnectci.com/privacy` ·
  **suppression de compte** (champ « URL de suppression du compte », obligatoire) :
  `https://padelconnectci.com/supprimer-mon-compte`.
- **Captures d'écran et image de présentation** : plan, légendes et formats dans
  `docs/STORE-LISTING.md` §3 (source unique — pas de capture du Classement : aucun nom de vrai
  joueur à l'écran). À prendre sur l'APK de test.
- **Questionnaire « Sécurité des données »** (Play Console → Contenu de l'application) — miroir de
  l'App Privacy iOS (`docs/APP-STORE-CONFORMITE.md` §2) :
  - **Collecte** : oui. **Partage** avec des tiers : **non** — les prestataires (Supabase, Expo,
    Google/Apple pour les push, Brevo, Cloudflare) traitent pour notre compte, et la transmission
    de la réservation au club est demandée par le joueur lui-même (deux exceptions prévues par Google).
  - **Chiffrement en transit** : oui (HTTPS). **Suppression** : oui, dans l'app (Profil → Supprimer
    mon compte) ET via l'URL publique ci-dessus.
  - Données à cocher (toutes « Fonctionnement de l'application », traitées pour le compte) :

  | Catégorie Play                   | Donnée                                    | Facultative ?        |
  | -------------------------------- | ----------------------------------------- | -------------------- |
  | Informations personnelles        | Nom                                       | non                  |
  | Informations personnelles        | Adresse e-mail                            | non                  |
  | Informations personnelles        | Numéro de téléphone                       | non                  |
  | Informations personnelles        | ID utilisateur                            | non                  |
  | Informations personnelles        | Autres infos (date de naissance, sexe)    | oui                  |
  | Photos et vidéos                 | Photos (profil, photos du club)           | oui                  |
  | Messages                         | Autres messages (support, annonces club)  | oui                  |
  | Activité dans l'appli            | Autre contenu généré (avis, scores)       | oui                  |
  | Activité dans l'appli            | Interactions avec l'appli (diagnostics)   | non (anonymes)       |
  | Infos financières                | Historique d'achats (réservations, prix)  | non                  |
  | Infos financières                | Autres infos financières (lien Wave)      | oui                  |
  | Contacts                         | Contacts (le seul contact choisi, numéro) | oui                  |
  | Infos et performances de l'appli | Journaux de plantage, diagnostics         | non (anonymes)       |
  | Identifiants de l'appareil       | Jeton de notification                     | oui (si push refusé) |
  - **Rien** en localisation, santé, fichiers, agenda (l'ajout au calendrier ouvre la fiche système
    sans lire l'agenda), navigation web.

## 6) Le jour du lancement (avec l'assistant)

1. Build **production Android** (`.aab`) :
   `npx eas-cli@24.12.1 build --platform android --profile production --non-interactive --no-wait`.
   `autoIncrement` monte `android.versionCode` dans `app.json` AVANT le build : le 1ᵉʳ `.aab` porte le
   **versionCode 2** (commiter le bump). Le **premier** `.aab` se dépose **à la main** dans la Play
   Console (Test et publication → Tests fermés → Créer une version → importer le fichier téléchargé
   depuis expo.dev) : Google refuse un premier envoi par API. Ensuite seulement, `eas submit` peut
   prendre le relais, avec une clé de compte de service Google (à créer dans la Play Console, à
   fournir hors dépôt) et un bloc `android` dans `submit.production` d'`eas.json`.
2. Ajout de l'empreinte Google au `assetlinks.json` (cf. §4).
3. Compléter `site/get.html` ET `site/invite.html` : remettre le bouton Google Play (et la redirection
   Android de get.html) en action PRINCIPALE sur Android, et reléguer ou retirer le bloc `#web`
   (pont « Utiliser la version navigateur », action principale hors iPhone tant que la fiche Play
   n'existe pas — voir le commentaire « Android » de get.html). Redéployer `site/` en entier.
4. Test fermé (Google impose ~14 jours de test avec des testeurs pour un compte personnel neuf —
   prévoir cette fenêtre), puis production.
