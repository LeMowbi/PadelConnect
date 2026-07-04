# Checklist — Publier PadelConnect sur l'App Store (iPhone) et Google Play (Android)

> Document pratique pour le porteur. Le projet est **déjà lié à Expo** (compte `padelconnect-ci`,
> projet `padelconnect`) et **`eas.json` est prêt** (profils `development` / `preview` / `production`).
> Le backend Supabase est **en production** et le mode démo a été retiré : cette page sert pour le **lancement store**.

## 0. Rappel des deux jalons

- **Build de démonstration** (déjà fait pour Android) : APK installable, gratuit, ne demande qu'un compte Expo.
- **Publication store** (ci-dessous) : nécessite des comptes payants et des éléments légaux/marketing.

## 1. Comptes à créer (par le porteur — identité + carte bancaire)

- [ ] **Compte Expo** — déjà créé (`padelconnect-ci`). ✅
- [ ] **Apple Developer Program** — ~99 USD/an — https://developer.apple.com/programs/ (obligatoire pour l'iPhone : TestFlight + App Store).
- [ ] **Google Play Console** — 25 USD une fois — https://play.google.com/console (obligatoire pour Android sur le Play Store).
- [x] **Supabase** — en production ✅ (l'éventuel fournisseur **SMS** reste une note post-lancement — voir GUIDE-LANCEMENT.md).

## 2. Éléments légaux (obligatoires)

- [x] **Politique de confidentialité** rédigée : `site/privacy.html` (page autonome, reflète le
      fonctionnement réel — compte, photos, contacts, notifications). ✅
- [ ] **L'héberger** (dossier `site/` sur Cloudflare Pages → `https://padelconnectci.com/privacy.html`)
      et la coller dans App Store Connect + Play Console → détails dans **`docs/APP-STORE-CONFORMITE.md`**.
- [x] **CGU / Mentions légales** : dans l'app (écran « Mentions légales & CGU »), à jour. ✅
- [ ] Étiquettes **App Privacy** (déclaration des données) : réponses exactes prêtes dans
      **`docs/APP-STORE-CONFORMITE.md`** §2.
- [ ] (Recommandé) faire relire par un juriste pour la conformité **ARTCI** (Côte d'Ivoire).

## 3. Éléments marketing (à préparer)

- [ ] **Icône** 1024×1024 (déjà présente, opaque ✅).
- [ ] **Captures d'écran** par taille d'appareil (iPhone 6.7" et 6.5", + tablette si `supportsTablet`; Android téléphone). On peut les générer depuis la démo.
- [ ] **Description** (FR), **mots-clés**, **catégorie** (Sport / Style de vie).
- [ ] **Nom affiché** : PadelConnect.

## 4. Identité technique (déjà figée dans app.json)

- [ ] iOS `bundleIdentifier` = `ci.padelco.app` (IMMUABLE après publication — confirmer avant le 1er envoi).
- [ ] Android `package` = `ci.padelco.app`.
- [ ] `version` = 1.0.0 ; `ios.buildNumber` s'auto-incrémente à chaque build (profil `production` d'eas.json — actuellement 46) ; `android.versionCode` = 1 au premier envoi Android.

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

- [x] **Backend Supabase** en production (Auth par e-mail confirmé + base partagée) — fait.
- [x] **Gating serveur** des rôles (opérateur / gérant) via `profiles.role` — fait (le mode démo a été retiré).
- [ ] **Relecture sécurité** par un expert (7 audits internes déjà passés, dont 2 dédiés serveur).

## 6-BIS. Corrections des audits n°6 et n°7 (à faire avant la 1ʳᵉ soumission)

### a. Serveur (Dashboard Supabase, sans terminal) — dans CET ORDRE

- [x] Re-coller **`supabase/49_audit5_hardening.sql`** (re-corrigé : anti-triche du score verrouillé + « non classé » géré par le classement) — FAIT (confirmé 2026-07-03, voir AUDIT-SERVEUR §0-SEXIES).
- [x] Coller **`supabase/50_club_maps_query.sql`** (position Maps éditable) — FAIT (confirmé
      2026-07-03, voir AUDIT-SERVEUR §0-SEXIES).
- [x] Coller **`supabase/51_moderation.sql`** (signaler un avis / bloquer un joueur + confidentialité
      des matchs ouverts) — FAIT (confirmé 2026-07-03, voir AUDIT-SERVEUR §0-SEXIES).
- [x] Coller **`supabase/52_tournoi_refus_commente.sql`** (motif de refus d'un tournoi — sans elle,
      refuser un tournoi ÉCHOUE en production) — FAIT (confirmé 2026-07-03, voir AUDIT-SERVEUR §0-SEXIES).
- [x] Coller **`supabase/53_audit7_hardening.sql`** (durcissements de l'audit n°7) — FAIT
      (confirmé le 2026-07-03, vérifié à distance).
- [ ] Coller **`supabase/54_creneaux_modulables.sql`** (fermetures de période, grille libre,
      horaires par terrain) — détail dans `docs/AUDIT-SERVEUR.md` §0-SEPTIES. ⚠️ AVANT le build #47.
- [ ] Coller **`supabase/55_multi_clubs.sql`** (un compte peut gérer plusieurs clubs) — détail
      dans `docs/AUDIT-SERVEUR.md` §0-OCTIES. ⚠️ AVANT le build #47, APRÈS la 54.
- [x] **Edge Function `notify-club`** → **Edit** → recoller tout `supabase/functions/notify-club/index.ts`
      → **Deploy** — FAIT (confirmé 2026-07-03, voir AUDIT-SERVEUR §0-SEXIES).

### b. Modération du contenu (exigé par Apple Guideline 1.2 et Google Play)

- [x] Bouton **« Signaler »** et **« Bloquer »** sur chaque avis d'un autre joueur, et masquage des
      matchs ouverts des comptes bloqués — livré dans l'app (SQL 51). ✅
- [ ] Le mentionner à la revue (App Store Connect → « App Review Information » / Play → politique UGC) :
      _l'app permet de signaler tout avis et de bloquer son auteur ; les signalements sont traités sous 24 h._

### c. Liens universels Android (App Links) + page de téléchargement

- [ ] Récupérer l'**empreinte SHA-256** de la clé de signature de l'app dans **Play Console → Test
      et publication → Intégrité de l'application → Signature de l'app** (clé de signature d'app).
- [ ] La coller dans **`site/assetlinks.json`** (remplacer `REMPLACER_PAR_EMPREINTE_SHA256_…`).
- [ ] **Redéployer le dossier `site/`** sur Cloudflare Pages (il contient maintenant `get.html`,
      `assetlinks.json` et un `_redirects` mis à jour — un ami **Android** est enfin envoyé vers
      **Google Play**, plus vers l'App Store iPhone). ⚠️ Redéployer `site/` **en entier**.

### c-bis. Clé de notifications Apple (APNs)

- [x] **✅ FAIT** — clé APNs créée et liée sur EAS, push opérationnels depuis le build **#45**
      (guide conservé pour référence : **`docs/PUSH-SETUP.md` §2**).
- [ ] Au moment du build **Android** : ajouter aussi les identifiants **FCM** (même page
      Credentials d'expo.dev, section Android) — sans eux, aucun push n'arrivera sur Android.

### d. Sécuriser les notifications (recommandé fort avant lancement)

- [ ] Poser un **`WEBHOOK_SECRET`** sur `notify-club` et sur **tous** les webhooks — étapes exactes
      dans `docs/AUDIT-SERVEUR.md` §3. Sans lui, n'importe qui connaissant l'URL peut déclencher des
      notifications. À faire une fois, avant d'ouvrir au public.

## 7. Note importante — Expo Go

L'app utilise **Expo SDK 56** (récent). L'**Expo Go public de l'App Store ne le supporte pas encore** :
pour faire tester sur iPhone avant publication, privilégier **TestFlight** (build `production`/`preview`)
ou la **démo web**. Sur Android, l'**APK `preview`** s'installe directement.
