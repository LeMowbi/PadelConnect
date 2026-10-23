# Espace Club & Espace opérateur sur le web (Chantiers 2 & 4)

L'app PadelConnect tourne **aussi dans un navigateur** grâce à l'export web d'Expo
(react-native-web). **Le même code** sert l'app mobile ET le web → zéro duplication,
tout reste synchronisé via Supabase. Un gérant gère son club depuis son ordinateur ;
l'opérateur pilote tout depuis le sien.

## Comment ça marche (sécurité)

- On ne construit PAS un site séparé : c'est **l'application elle-même**, servie sur
  `club.padelconnectci.com`.
- L'accès aux espaces reste **protégé par le RÔLE vérifié côté serveur** (comme sur mobile) :
  - un **gérant** (`role='club'`) voit le bouton **Espace Club** dans son profil ;
  - **toi** (`role='operator'`) vois le bouton **Espace opérateur** — invisible pour tout le monde
    d'autre. Pas besoin d'URL secrète : personne ne peut ouvrir ton espace sans **ton compte
    opérateur + ton mot de passe**.
- Le web est d'abord pensé pour la gestion, mais il sert AUSSI de **pont joueur** : tant que la
  fiche Google Play n'est pas ouverte, les pages `padelconnectci.com/get` et `/invite` envoient les
  joueurs **Android et ordinateur** vers `club.padelconnectci.com` (version navigateur, **sans
  notifications**). Sur iPhone, l'expérience joueur reste l'app de l'App Store. Au lancement de
  Google Play, le bouton Play redevient l'action principale sur Android (voir
  `docs/ANDROID-LANCEMENT.md` §6).

## Générer le build web

```bash
npm run build:web
# → produit le dossier dist/
./scripts/fix-web-assets.sh dist
# → OBLIGATOIRE avant tout dépôt : renomme dist/assets/node_modules en dist/assets/vendor
```

> ⚠️ **Jamais de `dist/` déposé sans `fix-web-assets.sh`.** Cloudflare (wrangler comme le
> glisser-déposer) ignore tout dossier nommé `node_modules` — or l'export y range les polices
> d'icônes (Ionicons…). Sans le correctif, le site sert la page HTML à la place des `.ttf` et
> **toutes les icônes s'affichent vides** (vu en production le 2026-10-21). Le script écrit
> « ✓ polices déplacées : assets/node_modules → assets/vendor » quand il a corrigé ; « rien à
> faire » si `dist/` est déjà corrigé.

Le document HTML du web (langue `fr`, titre, description, couleur de thème, message sans
JavaScript) vit dans `public/index.html` : avec `web.output: "single"`, c'est CE fichier que
l'export reprend. `public/_headers` et
`public/_redirects` sont copiés à la racine de `dist/` par l'export.

## Déployer sur Cloudflare Pages (sans terminal, glisser-déposer)

1. Générer `dist/` **puis exécuter `./scripts/fix-web-assets.sh dist`** (section ci-dessus).
2. Cloudflare → **Workers & Pages** → **Create application** → **Pages** → **Upload assets**.
3. Nom du projet : `padelconnect-club`. Glisser le contenu du dossier `dist/` **corrigé** (il doit
   contenir `assets/vendor/`, et aucun `assets/node_modules/`).
4. **Custom domains** → ajouter `club.padelconnectci.com` (Cloudflare crée le DNS tout seul si le
   domaine est déjà chez eux).
5. **Contrôle** : ouvrir `club.padelconnectci.com` → les icônes de la barre d'onglets doivent
   s'afficher (pas de carrés vides). Contrôle précis : ouvrir dans le navigateur
   `club.padelconnectci.com/assets/vendor/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/`
   suivi du nom du fichier `Ionicons.<empreinte>.ttf` présent dans ce même dossier de `dist/` : le
   navigateur doit TÉLÉCHARGER un fichier, pas afficher l'app.
6. C'est en ligne. Le gérant va sur `club.padelconnectci.com`, se connecte avec **son numéro ou
   e-mail et son mot de passe** (les mêmes que dans l'app), et retrouve son Espace Club.

> ⚠️ Ce glisser-déposer manuel n'est plus nécessaire au quotidien : voir « Redéploiement
> automatique » ci-dessous. Il reste utile pour la **toute première** mise en ligne du projet
> Cloudflare Pages et pour ajouter le domaine.

## Redéploiement automatique (le web suit chaque build de l'app)

Pour que `club.padelconnectci.com` soit **toujours à jour** avec le dernier code (mêmes écrans,
mêmes règles que l'app mobile — ex. les créneaux 1h/1h30), le dépôt contient une **GitHub Action**
`.github/workflows/deploy-web.yml` qui, à **chaque push** (donc à chaque build), ré-exporte le web
(`npm run build:web`), applique `scripts/fix-web-assets.sh`, le redéploie sur Cloudflare Pages, puis
**contrôle le site en ligne** : le job échoue (croix rouge dans l'onglet Actions) si la police
d'icônes n'est pas servie en `font/ttf` ou si la page d'accueil ne pointe pas vers le bundle qui
vient d'être exporté. Plus rien à re-déposer à la main.

**À faire UNE seule fois** (GitHub → Settings → Secrets and variables → Actions → _New repository
secret_) :

| Secret                  | Valeur                                                                |
| ----------------------- | --------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | un jeton Cloudflare avec la permission **« Cloudflare Pages: Edit »** |
| `CLOUDFLARE_ACCOUNT_ID` | l'**ID de compte** Cloudflare (Workers & Pages → colonne de droite)   |

Rien de secret n'est écrit dans le dépôt : les jetons vivent uniquement côté GitHub. On peut aussi
lancer le déploiement à la main depuis l'onglet **Actions → « Déployer le web (Espace Club) » → Run workflow**, ou
en secours depuis une machine avec `scripts/deploy-web.sh` (voir l'en-tête du script).

## Espace opérateur

Aucune adresse séparée : tu vas sur `club.padelconnectci.com`, tu te connectes avec **ton compte
opérateur**, et le bouton **Espace opérateur** apparaît dans ton profil (finances, clubs, demandes,
signalements, lien Wave). Invisible pour les autres comptes.
