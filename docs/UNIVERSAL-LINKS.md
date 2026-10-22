# Universal Links & site padelconnectci.com

Objectif : un lien `https://padelconnectci.com/invite/CODE` **ouvre directement l'app** si elle est
installée (le code de parrainage se pré-remplit tout seul), sinon la page `/invite` affiche le code,
le copie et renvoie vers l'App Store (sur iPhone) ou vers la version navigateur (Android, ordinateur).

Domaine : **padelconnectci.com** (acheté sur Cloudflare). Identifiant d'app :
**`R77YWZ9487.ci.padelco.app`**.

## ✅ ACTIFS depuis le build #34 — rien à faire

Tout est en place et vérifié :

- Capacité **« Associated Domains »** activée sur l'App ID `ci.padelco.app` (portail Apple).
- Profil de provisioning **régénéré** avec cette capacité (builds ≥ #33).
- `app.json` contient `"associatedDomains": ["applinks:padelconnectci.com"]` —
  **ne jamais retirer cette ligne**, sinon les liens cesseraient d'ouvrir l'app.
- Site **déployé** sur Cloudflare Pages : AASA servi en JSON, `/invite/*` est réécrit (200) vers la
  page `/invite` (code de parrainage affiché et copié) et `/club/*` vers la page `/get`. Sur iPhone,
  les deux mènent à l'App Store ; sur Android et ordinateur (pas de fiche Google Play pour l'instant),
  l'action principale est la **version navigateur** `club.padelconnectci.com`, qui reçoit le chemin
  du lien : `/invite/CODE` pré-remplit le code à l'inscription ; `/club/ID` n'ouvre la fiche que pour
  un compte **déjà connecté** (sans compte, l'app web passe d'abord par l'inscription et la fiche
  n'est pas reprise ensuite).

> Historique (résolu) : les builds #29/#30 avaient échoué car le profil de provisioning de
> l'époque n'incluait pas Associated Domains et EAS ne le régénérait pas seul. Réglé en
> activant la capacité dans le portail Apple Developer puis en supprimant l'ancien profil sur
> expo.dev — EAS en a régénéré un valide au build suivant (penser à `EXPO_APPLE_TEAM_ID`).

## Côté app — routes ouvertes par les liens

- `/invite/[code]` → met le code de parrainage de côté et pré-remplit l'inscription.
- `/club/[id]` → un lien `padelconnectci.com/club/ID` (bouton Partager d'une fiche club)
  ouvre directement la fiche du club dans l'app.
- `/auth-callback` → lien de confirmation d'e-mail : ouvre l'app (qui connecte le joueur) ; sans
  l'app ou sur ordinateur, la page web « Adresse confirmée » s'affiche.

## Côté hébergement — DÉPLOYÉ (Cloudflare Pages)

Le dossier **`site/`** du dépôt contient tout :

```
site/
  apple-app-site-association               ← fichier Apple (déclare les chemins qui ouvrent l'app),
                                             servi à /.well-known/… par une réécriture de _redirects
  .well-known/apple-app-site-association   ← copie IDENTIQUE (garder les deux fichiers alignés)
  assetlinks.json                          ← équivalent Android (même réécriture /.well-known/…)
  _headers                                 ← en-têtes de sécurité + bon type MIME du fichier Apple
  _redirects                               ← réécritures /.well-known/*, /invite/* → /invite, /club/* → /get
  get.html                                 ← page « Télécharger » (iPhone → App Store ; ailleurs → version navigateur)
  invite.html                              ← page d'invitation (affiche et copie le code de parrainage)
  auth-callback.html                       ← page « Adresse confirmée » (lien d'e-mail sans l'app)
  index.html, cgu.html, privacy.html       ← accueil, CGU, politique de confidentialité
  404.html                                 ← « Page introuvable » (vrai code 404 pour toute URL inconnue)
  assets/                                  ← style.css, site.js (clubs en direct, langue FR/EN)
```

⚠️ Si le déploiement a été fait par **glisser-déposer** (pas connecté à GitHub), toute
modification du dossier `site/` dans le dépôt doit être **re-déployée à la main** :
Cloudflare → Workers & Pages → le projet → _Create new deployment_ → re-glisser le contenu
de `site/`. (S'il est connecté à GitHub avec _Build output directory_ = `site`, c'est
automatique à chaque push.)

### Vérifier (n'importe quand)

- `https://padelconnectci.com/.well-known/apple-app-site-association` renvoie du JSON.
- `https://padelconnectci.com/invite/0123456789AB` (navigateur, sans l'app) répond 200 et affiche
  la page d'invitation avec le code `0123456789AB` (12 caractères hexadécimaux ; un autre texte
  n'affiche pas de code) : sur iPhone, « Copier le code et télécharger » mène à l'App Store ; sur
  Android/ordinateur, l'action principale « Utiliser la version navigateur » ouvre
  `club.padelconnectci.com/invite/0123456789AB`.
- `https://padelconnectci.com/club/TEST` répond 200 et affiche la page `/get` (redirection vers
  l'App Store sur iPhone ; ailleurs, « Utiliser la version navigateur » en tête, vers
  `club.padelconnectci.com/club/TEST`).
- Une adresse inconnue (`/nimporte`) répond **404** (page « Page introuvable »).
- Sur iPhone avec l'app : un lien `padelconnectci.com/invite/CODE` collé dans Notes/WhatsApp
  ouvre l'app, code pré-rempli.
