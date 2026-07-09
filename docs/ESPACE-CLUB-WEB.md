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
- Un joueur peut techniquement se connecter sur le web, mais le web est pensé pour la gestion :
  la vraie expérience joueur reste l'app mobile (App Store / Google Play).

## Générer le build web

```bash
npm run build:web
# → produit le dossier dist/ (site statique, à déployer tel quel)
```

## Déployer sur Cloudflare Pages (sans terminal, glisser-déposer)

1. Cloudflare → **Workers & Pages** → **Create application** → **Pages** → **Upload assets**.
2. Nom du projet : `padelconnect-club`. Glisser le contenu du dossier `dist/`.
3. **Custom domains** → ajouter `club.padelconnectci.com` (Cloudflare crée le DNS tout seul si le
   domaine est déjà chez eux).
4. C'est en ligne. Le gérant va sur `club.padelconnectci.com`, se connecte avec **son numéro/e-mail
   + son mot de passe** (le même que dans l'app), et retrouve son Espace Club.

> ⚠️ Ce glisser-déposer manuel n'est plus nécessaire au quotidien : voir « Redéploiement
> automatique » ci-dessous. Il reste utile pour la **toute première** mise en ligne du projet
> Cloudflare Pages et pour ajouter le domaine.

## Redéploiement automatique (le web suit chaque build de l'app)

Pour que `club.padelconnectci.com` soit **toujours à jour** avec le dernier code (mêmes écrans,
mêmes règles que l'app mobile — ex. les créneaux 1h/1h30), le dépôt contient une **GitHub Action**
`.github/workflows/deploy-web.yml` qui, à **chaque push** (donc à chaque build), ré-exporte le web
(`npm run build:web`) et le redéploie sur Cloudflare Pages. Plus rien à re-déposer à la main.

**À faire UNE seule fois** (GitHub → Settings → Secrets and variables → Actions → *New repository
secret*) :

| Secret | Valeur |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | un jeton Cloudflare avec la permission **« Cloudflare Pages: Edit »** |
| `CLOUDFLARE_ACCOUNT_ID` | l'**ID de compte** Cloudflare (Workers & Pages → colonne de droite) |

Rien de secret n'est écrit dans le dépôt : les jetons vivent uniquement côté GitHub. On peut aussi
lancer le déploiement à la main depuis l'onglet **Actions → « Déployer le web » → Run workflow**, ou
en secours depuis une machine avec `scripts/deploy-web.sh` (voir l'en-tête du script).

## Espace opérateur

Aucune adresse séparée : tu vas sur `club.padelconnectci.com`, tu te connectes avec **ton compte
opérateur**, et le bouton **Espace opérateur** apparaît dans ton profil (finances, clubs, demandes,
signalements, lien Wave). Invisible pour les autres comptes.
