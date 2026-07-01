# Universal Links & site padelconnectci.com

Objectif : un lien `https://padelconnectci.com/invite/CODE` **ouvre directement l'app** si elle est
installée (le code de parrainage se pré-remplit tout seul), sinon la page renvoie vers l'App Store.

Domaine : **padelconnectci.com** (acheté sur Cloudflare). Identifiant d'app :
**`R77YWZ9487.ci.padelco.app`**.

## ⚠️ BLOQUEUR credentials (à régler avant de réactiver l'entitlement)
Les builds #29 et #30 ont ÉCHOUÉ car le **profil de provisioning Apple** (généré le 2026-06-29) ne
contient pas la capacité **Associated Domains**, et EAS **ne le régénère pas automatiquement** (la
clé App Store Connect configurée sert à la soumission, pas à gérer les capacités/profils).
Tant que ce n'est pas réglé, `associatedDomains` est **retiré d'app.json** pour que les builds
passent. Le parrainage marche quand même (le lien renvoie vers l'App Store via `site/_redirects`).

**Pour réactiver les Universal Links (ouverture directe de l'app) :**
1. Régénérer le profil de provisioning AVEC « Associated Domains » — via `eas credentials`
   (iOS → production → provisioning profile → recréer), OU activer la capacité dans le portail
   Apple Developer sur l'App ID `ci.padelco.app` puis régénérer le profil.
2. Remettre dans `app.json` (ios) : `"associatedDomains": ["applinks:padelconnectci.com"]`.
3. Rebuild. (Le site `site/` + le fichier AASA sont déjà en ligne, rien à refaire côté hébergement.)

## Côté app — code DÉJÀ prêt (indépendant de l'entitlement)
- Route entrante `/invite/[code]` → met le code de côté et pré-remplit l'inscription.
- Lien de parrainage = `padelconnectci.com/invite/CODE` (repli App Store si pas d'app).
- Reste juste à remettre `associatedDomains` une fois le profil régénéré (voir bloqueur ci-dessus).

## Côté hébergement — À FAIRE (toi, sur Cloudflare Pages)

Le dossier **`site/`** du dépôt contient tout, prêt à déployer :
```
site/
  .well-known/apple-app-site-association   ← fichier Apple (déclare que le domaine ouvre l'app)
  _headers                                 ← force le bon type MIME du fichier Apple
  _redirects                               ← /invite/* → App Store (visiteurs sans l'app)
  index.html                               ← page d'accueil du site
  privacy.html                             ← politique de confidentialité (pour l'App Store)
```

### Déployer (2 façons)
- **A — Glisser-déposer (le plus simple)** : Cloudflare → **Workers & Pages** → *Create* → *Pages* →
  *Upload assets* → glisse le **contenu du dossier `site/`** → *Deploy*. Puis **Custom domains** →
  ajoute `padelconnectci.com`.
- **B — Connecter le dépôt GitHub** : Cloudflare Pages → *Connect to Git* → dépôt `PadelConnect` →
  *Build output directory* = `site` → Deploy. (Se met à jour tout seul à chaque push.)

### Vérifier
- `https://padelconnectci.com/.well-known/apple-app-site-association` s'ouvre et renvoie du JSON.
- `https://padelconnectci.com/invite/TEST` (dans un navigateur, sans l'app) redirige vers l'App Store.

## Dernière étape — un nouveau build
Les Universal Links exigent l'entitlement `associatedDomains` → il faut un **nouveau build EAS**
(#29) APRÈS que le fichier Apple est en ligne. Test final sur iPhone : ouvrir un lien
`padelconnectci.com/invite/CODE` depuis Notes/WhatsApp → l'app s'ouvre, code pré-rempli.

> Ordre conseillé : (1) déployer `site/` sur Cloudflare Pages + domaine → (2) je lance le build #29.
