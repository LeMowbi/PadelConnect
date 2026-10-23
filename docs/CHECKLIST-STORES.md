# Checklist — Publier PadelConnect sur l'App Store (iPhone) et Google Play (Android)

> ✅ **État au 2026-10-22 :** `app.json` fait foi = **version 1.0.2**, `buildNumber` incrémenté par
> EAS à chaque build (`autoIncrement`). L'app est **EN LIGNE** sur les stores CI/SN/US. Le SQL
> `02`→`91` et la `95` sont **appliqués en base** ; `92`→`94` et `96`→`98` s'appliquent ENSEMBLE AVANT le
> build #69 (état exact : `CLAUDE.md` §8). Les **11 webhooks** sont créés et **`WEBHOOK_SECRET` EST
> POSÉ** (secret Edge Functions + en-tête `x-webhook-secret` sur chaque webhook, depuis le
> 2026-07-06). Builds en cours et version déployée de `notify-club` : **`CLAUDE.md` §7**.

> Document pratique pour le porteur. Le projet est **déjà lié à Expo** (compte `padelconnect-ci`,
> projet `padelconnect`) et **`eas.json` est prêt** (profils `development` / `preview` / `production`).
> Le backend Supabase est **en production** et le mode démo a été retiré : cette page sert pour le **lancement store**.

## 0. Rappel des deux jalons

- **Build de démonstration** (déjà fait pour Android) : APK installable, gratuit, ne demande qu'un compte Expo.
- **Publication store** (ci-dessous) : nécessite des comptes payants et des éléments légaux/marketing.

## 1. Comptes à créer (par le porteur — identité + carte bancaire)

- [x] **Compte Expo** — déjà créé (`padelconnect-ci`). ✅
- [x] **Apple Developer Program** — ~99 USD/an — actif (l'app est publiée sur l'App Store). ✅
- [ ] **Google Play Console** — 25 USD une fois — https://play.google.com/console (obligatoire pour Android sur le Play Store).
- [x] **Supabase** — en production ✅ (l'éventuel fournisseur **SMS** reste une note post-lancement — voir docs/archive/GUIDE-LANCEMENT.md).

## 2. Éléments légaux (obligatoires)

- [x] **Politique de confidentialité** rédigée : `site/privacy.html` (page autonome, reflète le
      fonctionnement réel — compte, photos, contacts, notifications). ✅
- [x] **L'héberger** : en ligne sur `https://padelconnectci.com/privacy` et collée dans App Store
      Connect. ✅ (Play Console : à coller à la création de la fiche.)
- [x] **CGU / Mentions légales** : dans l'app (écran « Mentions légales & CGU ») et sur le site. ✅
- [x] Étiquettes **App Privacy** remplies à la v1.0. ✅
- [ ] Étiquettes **App Privacy** : ajouter les 4 lignes d'octobre 2026 (Customer Support, Gameplay
      Content, Purchase History, Other Financial Info) avant la version du build #69 →
      **`docs/APP-STORE-CONFORMITE.md`** §2.
- [ ] **Redéployer `site/`** (politique, CGU, nouvelle page `supprimer-mon-compte`) le jour où les
      SQL `92` → `98` (collées ensemble) sont en production (**`docs/APP-STORE-CONFORMITE.md`** §1).
- [ ] **Identité juridique de l'éditeur** (nom ou raison sociale, RCCM, adresse) et **récépissé de
      déclaration ARTCI** : à fournir par le porteur, puis à reporter aux endroits marqués
      « À COMPLÉTER » des trois textes (décision n° 22 de `docs/AUDIT-REGLES-METIER-2026-10.md` §7).
- [ ] (Recommandé) faire relire par un juriste pour la conformité à la loi n° 2013-450 (ARTCI).

## 3. Éléments marketing (à préparer)

> Source de vérité des textes et du plan de captures : **`docs/STORE-LISTING.md`** (lot H2, fiche
> v1.0.3 / build #69) — conditions à vérifier avant de pousser (§0), textes prêts à coller (§1-2),
> captures (§3), procédure manuelle et API (§4), comptage calculé de chaque champ (§5).

- [x] **Icône** 1024×1024 (déjà présente, opaque ✅).
- [ ] **Captures d'écran** RÉELLES (aucun club ni avis fictif) : iPhone 6,9" et 6,5", iPad 13"
      (obligatoire, `supportsTablet: true`), Android téléphone + image de présentation 1024×500 —
      plan et légendes : `docs/STORE-LISTING.md` §3.
- [x] **Textes rédigés** (FR, au « tu ») : nom « PadelConnect CI: Padel Abidjan », sous-titre, texte
      promotionnel, mots-clés (95/100 octets), description, nouveautés 1.0.3, fiche Google Play —
      `docs/STORE-LISTING.md` §1-2.
- [ ] **Textes poussés** dans App Store Connect avec la version 1.0.3 (après les conditions du §0 :
      binaire #69 contenant la fidélité, SQL 92 en production, version 1.0.3, chrono « 2 min »,
      quartiers des mots-clés visibles).
- [ ] **Catégorie** (Sports / Style de vie) et URL marketing / assistance vérifiées dans la fiche.
- [ ] **Nom affiché** sur l'écran d'accueil : PadelConnect (inchangé ; le nom du store change seul).

## 4. Identité technique (déjà figée dans app.json)

- [x] iOS `bundleIdentifier` = `ci.padelco.app` (IMMUABLE : l'app est publiée sous cet identifiant). ✅
- [ ] Android `package` = `ci.padelco.app` (IMMUABLE dès le premier envoi Play).
- [ ] `version` = **1.0.3** pour le build #69 (passer `expo.version` AVANT le build — la 1.0.2 est publiée, App Store Connect refuse un binaire 1.0.2 ; `docs/STORE-LISTING.md` §0) ; `ios.buildNumber` s'auto-incrémente à chaque build (profil `production` d'eas.json — valeur courante : voir `app.json`) ; `android.versionCode` vaut 1 dans `app.json` et `autoIncrement` le monte AVANT chaque build de production : le **premier `.aab` porte le versionCode 2** (commiter le bump).

## 5. Fabriquer et envoyer (commandes EAS, depuis un ordinateur)

Version d'`eas-cli` **figée** (la même que `padel-sortie-ios`) : une nouvelle version ne change
pas un build de sortie à notre insu. On la monte volontairement, en une fois, dans tous les docs.

```bash
# Se connecter (une fois)
npx eas-cli@24.12.1 login

# Android — version de production (.aab pour le Play Store)
npx eas-cli@24.12.1 build --platform android --profile production

# iOS — version de production + envoi TestFlight (procédure complète : padel-sortie-ios)
npx eas-cli@24.12.1 build --platform ios --profile production --auto-submit
```

> **Android, premier envoi** : le **premier** `.aab` se dépose **à la main** dans la Play Console
> (Google refuse un premier envoi par API) — étapes dans `docs/ANDROID-LANCEMENT.md` §6. Les envois
> suivants peuvent passer par `npx eas-cli@24.12.1 submit --platform android --profile production`,
> une fois la clé de compte de service Google fournie et un bloc `android` ajouté à
> `submit.production` d'`eas.json` (aujourd'hui seul le bloc `ios` existe).

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
- [x] **`supabase/54`→`64` TOUS APPLIQUÉS EN BASE** — vérifié à distance le **2026-07-06**
      (Management API : chaque table/colonne/fonction confirmée présente). Détail : `54` créneaux
      modulables, `55` multi-clubs, `56` comptes club à l'inscription, `57` matchs 1v1, `58` paiement
      Wave, `59` verrous anti-course (clôture/inscription), `60` durcissement audit 9
      (`reject_club_request` + branche tournoi officiel opérateur), `61` diagnostics anonymes,
      `62` téléphone organisateur privé, `63` `with check` sur les policies UPDATE de Storage,
      `64` cycle de vie compte/tournoi. **Plus rien à coller côté SQL avant le prochain build.**
- [x] Dans l'app, **Espace opérateur → Finances → coller ton lien de paiement Wave** (`pay.wave.com/…`)
      — FAIT (lien configuré en base, vérifié le 2026-10-21).
- [x] **Edge Function `notify-club`** → **Edit** → recoller tout `supabase/functions/notify-club/index.ts`
      → **Deploy** — FAIT (confirmé 2026-07-03, voir AUDIT-SERVEUR §0-SEXIES).

### b. Modération du contenu (exigé par Apple Guideline 1.2 et Google Play)

- [x] Bouton **« Signaler »** et **« Bloquer »** sur chaque avis d'un autre joueur, et masquage des
      matchs ouverts des comptes bloqués — livré dans l'app (SQL 51). ✅
- [ ] Le mentionner à la revue (App Store Connect → « App Review Information » / Play → politique UGC) :
      _l'app permet de signaler tout avis et de bloquer son auteur ; les signalements sont traités sous 24 h._

### b-bis. Compte de démo pour la revue Apple (Guideline 2.1) — **IMPORTANT, sinon rejet**

L'inscription passe par une **confirmation e-mail** : un examinateur Apple ne peut pas dépasser
l'écran « Vérifie ta boîte mail » sans un compte **déjà confirmé**. Un compte de démo prêt a été
créé côté serveur (e-mail déjà validé) — **ses identifiants te sont communiqués à part** (jamais
écrits ici).

- [ ] Coller ces identifiants dans **App Store Connect → App Review Information → « Sign-In required »**
      (nom d'utilisateur = l'e-mail de démo, mot de passe = celui communiqué).
- [ ] (Optionnel) créer aussi un compte **gérant** de démo si tu veux qu'Apple voie l'Espace Club.

### c. Liens universels Android (App Links) + page de téléchargement

- [ ] Récupérer l'**empreinte SHA-256** de la clé de signature de l'app dans **Play Console → Test
      et publication → Intégrité de l'application → Signature de l'app** (clé de signature d'app).
- [ ] L'**AJOUTER** au tableau `sha256_cert_fingerprints` de **`site/assetlinks.json`**, À CÔTÉ de
      l'empreinte EAS déjà présente (ne pas l'écraser : les APK signés EAS perdraient leurs App Links
      — voir `docs/ANDROID-LANCEMENT.md` §4).
- [ ] Au lancement Play, remettre dans **`site/get.html`** le bouton `<a class="btn android" id="android">`
      et la branche `isAndroid` du script en action PRINCIPALE Android, puis reléguer ou retirer le
      bloc `#web` (pont navigateur) dans **`site/get.html` ET `site/invite.html`** (voir le commentaire
      « Android » de get.html) : tant que la fiche Play n'existe pas, ce pont est l'action principale
      hors iPhone.
- [ ] **Redéployer le dossier `site/`** sur Cloudflare Pages. ⚠️ Redéployer `site/` **en entier**.

### c-bis. Clé de notifications Apple (APNs)

- [x] **✅ FAIT** — clé APNs créée et liée sur EAS, push opérationnels depuis le build **#45**
      (guide conservé pour référence : **`docs/PUSH-SETUP.md` §2**).
- [ ] Au moment du build **Android** : ajouter aussi les identifiants **FCM** (même page
      Credentials d'expo.dev, section Android) — sans eux, aucun push n'arrivera sur Android.

### d. Sécuriser les notifications (recommandé fort avant lancement)

- [x] **`WEBHOOK_SECRET`** posé sur `notify-club` et sur les **11** webhooks — FAIT depuis le
      2026-07-06 (rotation : `docs/AUDIT-SERVEUR.md` §3).

### e. Google Play — conformité (avant le premier `.aab`)

- [ ] Questionnaire **« Sécurité des données »** : réponses prêtes dans `docs/ANDROID-LANCEMENT.md` §5.
- [ ] **URL de suppression de compte** : `https://padelconnectci.com/supprimer-mon-compte` (page en
      ligne après le redéploiement de `site/`).
- [ ] Questionnaire **IARC** : mêmes réponses que l'Age Rating Apple (`docs/APP-STORE-CONFORMITE.md` §5).

## 7. Note importante — Expo Go

L'app utilise **Expo SDK 56** (récent). L'**Expo Go public de l'App Store ne le supporte pas encore** :
pour faire tester sur iPhone avant publication, privilégier **TestFlight** (build `production`/`preview`)
ou la **démo web**. Sur Android, l'**APK `preview`** s'installe directement.
