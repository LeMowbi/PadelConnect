# Conformité App Store — confidentialité (guide pour le porteur)

Ce que Apple vérifie à la revue, et **exactement quoi remplir** dans App Store Connect. Rien de
technique : ce sont des cases à cocher et une URL à coller.

## 1. La politique de confidentialité (URL publique — obligatoire)

Apple exige une **URL publique** qui ouvre la politique de confidentialité. Elle vit dans
`site/privacy.html` et est **déjà en ligne** (dossier `site/` sur Cloudflare Pages, domaine
**padelconnectci.com**) :

```
https://padelconnectci.com/privacy
```

(L'ancienne adresse `…/privacy.html` redirige vers celle-ci.) **Où elle est collée :** App Store
Connect → ton app → **App Privacy** → _Privacy Policy URL_ et App Information → Privacy Policy URL.
Même URL côté Google Play (Contenu de l'application → Règles de confidentialité).

⚠️ Toute modification de `site/privacy.html`, `site/cgu.html` ou `site/supprimer-mon-compte.html`
ne compte qu'une fois le dossier `site/` **redéployé en entier**. Les textes d'octobre 2026
(prestataires, durées, ce qui subsiste après suppression) décrivent l'état APRÈS les SQL `92` → `98`,
collées ENSEMBLE avant le build #69 : `92` (remises fidélité servies conservées pour le décompte du
club), `94` (purge des diagnostics à 30 jours), `97` (anonymisation à la suppression de compte) et
`98` (matchs passés gardés par les partenaires, place « Ancien joueur » ; actus et agenda
désactivables dans Profil → Notifications — cet interrupteur n'apparaît dans l'app qu'une fois la
`98` en base). Redéployer le site le jour où ces migrations sont appliquées, pas avant.

**Identité juridique (à fournir par le porteur, décision n° 22 de
`docs/AUDIT-REGLES-METIER-2026-10.md` §7)** : nom ou raison sociale, forme, n° RCCM, adresse, et
n° de récépissé de la déclaration ARTCI. Les trois textes (`site/privacy.html`, `site/cgu.html`,
`src/app/legal.tsx`) portent un commentaire « À COMPLÉTER » à l'endroit exact où les ajouter ; rien
n'y est inventé en attendant.

## 2. « App Privacy » — les étiquettes de confidentialité (à remplir une fois)

App Store Connect → **App Privacy** → _Get Started_. Réponds exactement ceci (c'est le
fonctionnement réel de l'app aujourd'hui) :

**Suivi (Tracking) :** **NON** — l'app ne suit pas l'utilisateur entre apps/sites, aucun SDK
publicitaire. → « Data is **not** used to track you ».

**Données collectées** (pour chacune : _Linked to the user_ = OUI ; _Used for tracking_ = NON ;
_Purpose_ = **App Functionality**) :

| Catégorie Apple              | Donnée             | Pourquoi                                                 |
| ---------------------------- | ------------------ | -------------------------------------------------------- |
| **Contact Info**             | Email address      | Compte / connexion                                       |
| **Contact Info**             | Phone number       | Le club te recontacte pour tes réservations              |
| **Contact Info**             | Name               | Affichage du profil                                      |
| **User Content**             | Photos             | Photo de profil / de club (facultatif)                   |
| **User Content**             | Customer Support   | Messages envoyés au support                              |
| **User Content**             | Gameplay Content   | Scores de match, niveau, points de classement            |
| **User Content**             | Other user content | Avis, annonces de club, demandes d'inscription de club   |
| **Purchases**                | Purchase History   | Réservations (créneau et prix du terrain, réglé au club) |
| **Financial Info**           | Other Financial    | Lien de paiement Wave collé par un créateur (facultatif) |
| **Identifiers**              | User ID            | Identifier ton compte                                    |
| **Identifiers**              | Device ID          | Jeton de notification push (recevoir les notifs)         |
| **Contacts**                 | Contacts           | Retrouver un ami par son numéro (contact choisi par toi) |
| **Other Data Types**         | Date de naissance  | Profil (facultatif)                                      |
| **Other Data Types**         | Sexe               | Profil (facultatif)                                      |
| **Health & Fitness** / autre | _(rien)_           | —                                                        |

- **Sensitive Info / Location / Browsing history** : **rien** (l'app n'utilise pas le GPS et n'a
  pas de navigateur). Aucun paiement ne passe par l'app : les réservations et le lien Wave sont
  déclarés par prudence (ils sont stockés), pas parce qu'un paiement serait traité. La date de
  naissance et le sexe (facultatifs) se déclarent en **Other Data Types** — voir le tableau
  ci-dessus — pas en Sensitive Info.
- ⚠️ Les lignes **Customer Support, Gameplay Content, Purchase History et Other Financial Info**
  ont été ajoutées en octobre 2026 (audit de conformité) : les cocher dans App Store Connect →
  App Privacy → _Edit_ avant la soumission de la version qui embarque le build #69.

**Données collectées mais NON reliées à l'identité** (_Not Linked to You_, _Used for tracking_ =
NON, _Purpose_ = App Functionality / Analytics) — journal de diagnostics self-hosted dans Supabase,
sans identifiant utilisateur :

| Catégorie Apple | Donnée              | Pourquoi                                       |
| --------------- | ------------------- | ---------------------------------------------- |
| **Diagnostics** | Crash Data          | Détecter et corriger les bugs                  |
| **Usage Data**  | Product Interaction | Compter inscriptions / réservations / tournois |

## 3. Autorisations (déjà en place dans l'app ✅)

Les textes demandés à l'utilisateur sont déjà rédigés (Réglages → app) :

- **Photos** : « …accède à tes photos pour ta photo de profil et, côté gérant, les photos de ton club ».
- **Contacts** : « …uniquement pour t’aider à retrouver et inviter tes amis par leur numéro ».
- **Calendrier** : « …ajoute tes réservations de padel à ton calendrier, avec ton accord » (et un texte
  « Rappels » en français, exigé par le module calendrier même si l'app ne lit jamais tes rappels).
- **Langue** : l'app se déclare en **français** (`CFBundleDevelopmentRegion` + `fr.lproj`) : les
  fenêtres système (calendrier, copier/coller) s'affichent en français. Effet au prochain build.
- **Notifications** : demandées au bon moment.

## 4. Suppression de compte (obligatoire Apple ✅)

Déjà dans l'app : **Profil → Supprimer mon compte** (efface le compte et les données côté serveur,
immédiat et définitif). Depuis les `92`, `97` et `98` (appliquées en production le 2026-10-23), ce
qui ne peut pas disparaître sans casser l'historique des autres est **anonymisé** : tournois publiés
ou clôturés de l'organisateur (« Compte supprimé », sans téléphone ; ceux en attente ou refusés sont
supprimés), matchs passés joués avec des partenaires (sa place devient « Ancien joueur », ses saisies
de score restent comptées sans nom — `98`), remises fidélité déjà servies par un club (sans nom —
`92`), messages au support (sans nom ni numéro), demandes de club (non traitées supprimées, téléphone
retiré des autres). La fiche d'un club qu'il gérait, ses photos et ses annonces restent en ligne
(retrait sur demande). La politique, les CGU et l'écran légal de l'app reprennent cette liste ; la
**page publique de suppression** (ci-dessous) fait référence, car elle seule cite aussi les
diagnostics anonymes (30 jours).

**Page publique de suppression** (exigée par Google Play, utile aussi pour Apple) :
`https://padelconnectci.com/supprimer-mon-compte` (`site/supprimer-mon-compte.html`) — suppression
depuis l'app OU par e-mail à `contact@padelconnectci.com` depuis l'adresse du compte.

**Traiter une demande reçue par e-mail** (sans terminal) :

1. Vérifier que l'e-mail vient bien de l'adresse du compte (Dashboard Supabase → **Authentication →
   Users** → rechercher l'adresse) et copier son **User UID**.
2. **SQL Editor → New query** → coller ce bloc en remplaçant `UUID-DU-COMPTE` → **Run** :

```sql
do $$
begin
  -- Rejoue EXACTEMENT le bouton « Supprimer mon compte » de l'app, au nom de ce compte :
  -- mêmes annulations (clubs prévenus), mêmes anonymisations, photo comprise.
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'UUID-DU-COMPTE', 'role', 'authenticated')::text, true);
  perform public.delete_account();
end $$;
```

3. Attendu : « Success. No rows returned ». Répondre à l'e-mail pour confirmer la suppression.
   ⚠️ Ne PAS utiliser « Delete user » de la page Authentication : il efface le compte sans annuler
   ses réservations à venir (clubs non prévenus), sans retirer sa photo ni anonymiser ses tournois.

## 4-BIS. Modération du contenu généré par les joueurs (obligatoire — Apple Guideline 1.2 ✅)

L'app affiche du contenu écrit par les joueurs (avis de club, prénom dans les matchs ouverts). Elle
fournit désormais les contrôles exigés par Apple et Google Play :

- **Signaler** un avis inapproprié (bouton sur chaque avis d'un autre joueur) → les signalements
  arrivent dans **ton Espace opérateur, onglet Demandes → « Avis signalés »** (SQL 53), où tu
  peux **retirer l'avis** ou le **classer** — c'est là que tu tiens la promesse « sous 24 h ».
- **Signaler / Bloquer** aussi sur les **matchs ouverts** (bouton « ⋮ » sur chaque match d'un
  autre joueur — le signalement arrive dans « Signalements » de l'Espace opérateur).
- **Bloquer** l'auteur (ses avis et ses matchs ouverts disparaissent aussitôt de la vue du joueur ;
  amitié, demandes d'ami et favoris rompus dans les deux sens).
- Les **CGU** (dans l'app et sur le site) posent la règle **tolérance zéro** : contenu retiré sans
  préavis ; en cas de récidive, le compte peut être supprimé par PadelConnect. Il n'existe pas
  (encore) d'outil de **suspension** : ne jamais promettre une suspension.

**Procédure de modération** (opérateur, sans terminal) :

1. **Retirer un avis** : Espace opérateur → **Demandes → « Avis signalés »** → **Retirer**.
2. **Récidive** (même auteur signalé à nouveau pour un contenu retiré) : supprimer son compte avec le
   bloc SQL du §4 (« Traiter une demande reçue par e-mail », étapes 1 à 3), en partant de son nom
   (Table Editor → `profiles` → copier son `id`). Garder une trace (date, avis retirés) dans la
   boîte `contact@`.

À la soumission, indique dans **App Review Information** (Apple) et la **politique UGC** (Play) :
_« L'app permet de signaler tout contenu joueur (avis, matchs ouverts) et de bloquer son auteur ;
les signalements sont traités sous 24 h. »_ Rien d'autre à coder — c'est en place (SQL 51 + 53).
⚠️ Pense à ouvrir l'Espace opérateur **chaque jour** au début : c'est toi le modérateur.

## 5. Divers à cocher dans App Store Connect

- **Age Rating** : viser **13 ans ou plus** (c'est la limite d'âge posée par les CGU et la
  politique de confidentialité — ne pas déclarer 4+, ça les contredirait). Dans le questionnaire,
  déclarer le **contenu généré par les utilisateurs** (avis, matchs ouverts) avec la **modération
  en place** (Signaler/Bloquer + traitement dans l'Espace opérateur, §4-BIS). Côté Google Play,
  répondre la même chose dans le questionnaire **IARC** (l'équivalent Play de l'Age Rating).
- **Export Compliance / chiffrement** : `usesNonExemptEncryption = false` est déjà dans `app.json`
  (HTTPS standard uniquement) → répondre **Non** à « utilise-t-il un chiffrement non exempté ».
- **Content Rights** : tu détiens les droits du contenu.
- **Coordonnées de contact** (Support URL / email) : `contact@padelconnectci.com` (adresse publique
  officielle, routée vers ta boîte — n'expose jamais ton e-mail perso dans les stores).

## 6. Récapitulatif — ce qu'il te reste à faire

- [x] `site/privacy.html` hébergée et URL collée dans App Store Connect (app publiée).
- [x] Étiquettes **App Privacy** remplies à la v1.0 ; Age Rating / Export Compliance répondus.
- [ ] Ajouter les 4 lignes d'octobre 2026 aux étiquettes **App Privacy** (§2) avant la version du
      build #69.
- [ ] Redéployer `site/` (politique, CGU, page de suppression) le jour où les SQL `92` → `98`
      (collées ensemble) sont en production (§1).
- [ ] Fournir l'identité juridique de l'éditeur et le récépissé ARTCI, puis les reporter dans les
      trois textes (§1, décision n° 22).
- [ ] Google Play : questionnaire « Sécurité des données » et URL de suppression de compte —
      réponses prêtes dans `docs/ANDROID-LANCEMENT.md` §5.
