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

## 5) Fiche Play Store — textes prêts à coller

- **Nom** : PadelConnect CI
- **Description courte (80 car. max)** :
  « Réserve ton terrain de padel à Abidjan, rejoins des matchs et des tournois. »
- **Description longue** :
  « PadelConnect, c'est le padel à Abidjan dans ta poche :
  • Réserve un terrain en quelques secondes dans les meilleurs clubs de la ville.
  • Rejoins des matchs ouverts à ton niveau, ou crée le tien et partage les frais.
  • Inscris-toi aux tournois, suis ton classement et fais évoluer ton niveau match après match.
  • Trouve un coach, réserve un cours, suis les annonces de ton club.
  Les clubs partenaires gèrent leurs terrains, leurs horaires et leurs réservations depuis le
  même outil. Rejoins la communauté du padel ivoirien ! 🎾 »
- **Catégorie** : Sports. **Contact** : contact@padelconnectci.com ·
  site `https://padelconnectci.com` · confidentialité `https://padelconnectci.com/privacy`.
- **Captures d'écran** : à prendre sur l'APK de test (accueil, réservation, tournois, classement,
  fiche club) — minimum 2, idéal 6-8, format téléphone.
- **Questionnaire « Sécurité des données »** : mêmes réponses que l'App Privacy iOS
  (cf. `docs/APP-STORE-CONFORMITE.md`) — données collectées : e-mail, téléphone, nom, niveau ;
  liées à l'identité ; pas de partage à des tiers ; suppression de compte disponible dans l'app.

## 6) Le jour du lancement (avec l'assistant)

1. Build **production Android** (`.aab`) via EAS + envoi sur Play Console.
2. Ajout de l'empreinte Google au `assetlinks.json` (cf. §4).
3. Compléter `site/get.html` : activer la redirection Android vers la fiche Play (aujourd'hui
   la page n'envoie que vers l'App Store, par choix, tant que la fiche n'existe pas).
4. Test fermé (Google impose ~14 jours de test avec des testeurs pour un compte personnel neuf —
   prévoir cette fenêtre), puis production.
