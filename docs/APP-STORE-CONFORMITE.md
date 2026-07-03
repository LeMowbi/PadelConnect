# Conformité App Store — confidentialité (guide pour le porteur)

Ce que Apple vérifie à la revue, et **exactement quoi remplir** dans App Store Connect. Rien de
technique : ce sont des cases à cocher et une URL à coller.

## 1. La politique de confidentialité (URL publique — obligatoire)

Apple exige une **URL publique** qui ouvre la politique de confidentialité. Elle est prête dans
`site/privacy.html` et se déploie avec le site (voir `docs/UNIVERSAL-LINKS.md`).

Une fois le dossier `site/` déployé sur **Cloudflare Pages** avec le domaine **padelconnectci.com**,
l'URL à utiliser sera :
```
https://padelconnectci.com/privacy.html
```

**Où la coller :** App Store Connect → ton app → **App Privacy** → *Privacy Policy URL* ; et aussi
dans la fiche de l'app (App Information → Privacy Policy URL). Même URL côté Google Play plus tard.

## 2. « App Privacy » — les étiquettes de confidentialité (à remplir une fois)

App Store Connect → **App Privacy** → *Get Started*. Réponds exactement ceci (c'est le
fonctionnement réel de l'app aujourd'hui) :

**Suivi (Tracking) :** **NON** — l'app ne suit pas l'utilisateur entre apps/sites, aucun SDK
publicitaire. → « Data is **not** used to track you ».

**Données collectées** (pour chacune : *Linked to the user* = OUI ; *Used for tracking* = NON ;
*Purpose* = **App Functionality**) :

| Catégorie Apple            | Donnée                          | Pourquoi |
|----------------------------|---------------------------------|----------|
| **Contact Info**           | Email address                   | Compte / connexion |
| **Contact Info**           | Phone number                    | Le club te recontacte pour tes réservations |
| **Contact Info**           | Name                            | Affichage du profil |
| **User Content**           | Photos                          | Photo de profil / de club (facultatif) |
| **User Content**           | Other user content              | Avis, messages de support |
| **Identifiers**            | User ID                         | Identifier ton compte |
| **Contacts**               | Contacts                        | Retrouver un ami par son numéro (contact choisi par toi) |
| **Health & Fitness** / autre | *(rien)*                      | — |

- **Sensitive Info / Location / Financial / Browsing history** : **rien** (l'app n'utilise pas le
  GPS, ne fait aucun paiement, n'a pas de navigateur).

**Données collectées mais NON reliées à l'identité** (*Not Linked to You*, *Used for tracking* =
NON, *Purpose* = App Functionality / Analytics) — journal de diagnostics self-hosted dans Supabase,
sans identifiant utilisateur :

| Catégorie Apple            | Donnée                          | Pourquoi |
|----------------------------|---------------------------------|----------|
| **Diagnostics**            | Crash Data                      | Détecter et corriger les bugs |
| **Usage Data**             | Product Interaction             | Compter inscriptions / réservations / tournois |

## 3. Autorisations (déjà en place dans l'app ✅)

Les textes demandés à l'utilisateur sont déjà rédigés (Réglages → app) :
- **Photos** : « …pour votre photo de profil et les photos de votre club ».
- **Contacts** : « …uniquement pour t'aider à retrouver et inviter tes amis par leur numéro ».
- **Calendrier** : « …ajoute tes réservations à ton calendrier, avec ton accord ».
- **Notifications** : demandées au bon moment.

## 4. Suppression de compte (obligatoire Apple ✅)

Déjà dans l'app : **Profil → Supprimer mon compte** (efface le compte et les données côté serveur,
immédiat et définitif). Rien à faire.

## 4-BIS. Modération du contenu généré par les joueurs (obligatoire — Apple Guideline 1.2 ✅)

L'app affiche du contenu écrit par les joueurs (avis de club, prénom dans les matchs ouverts). Elle
fournit désormais les contrôles exigés par Apple et Google Play :
- **Signaler** un avis inapproprié (bouton sur chaque avis d'un autre joueur → table `review_reports`,
  lue par l'opérateur pour modérer **sous 24 h**).
- **Bloquer** l'auteur (ses avis et ses matchs ouverts disparaissent aussitôt de la vue du joueur).
- Les **CGU** (dans l'app) interdisent déjà le contenu abusif.

À la soumission, indique dans **App Review Information** (Apple) et la **politique UGC** (Play) :
*« L'app permet de signaler tout avis et de bloquer son auteur ; les signalements sont traités sous
24 h. »* Rien d'autre à coder — c'est en place (SQL 51).

## 5. Divers à cocher dans App Store Connect

- **Age Rating** : questionnaire → l'app n'a pas de contenu sensible → classement **4+**.
- **Export Compliance / chiffrement** : `usesNonExemptEncryption = false` est déjà dans `app.json`
  (HTTPS standard uniquement) → répondre **Non** à « utilise-t-il un chiffrement non exempté ».
- **Content Rights** : tu détiens les droits du contenu.
- **Coordonnées de contact** (Support URL / email) : `padelconnect.civ@gmail.com`.

## 6. Récapitulatif — ce qu'il te reste à faire

1. Héberger `docs/privacy.html` et récupérer son URL.
2. Coller l'URL dans **App Store Connect → App Privacy** + **App Information**.
3. Remplir les étiquettes **App Privacy** avec le tableau du §2 (Tracking = NON).
4. Répondre aux questions Age Rating / Export Compliance (§5).

C'est tout pour être conforme à la revue Apple côté confidentialité.
