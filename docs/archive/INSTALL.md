# Installer / montrer le prototype PadelConnect

Trois façons, de la plus simple à la plus « pro ». **Recommandé : le lien web.**

> Déjà en ligne : **https://lemowbi.github.io/PadelConnect/** (tu peux partager ce lien directement).

---

## 1) Lien web (recommandé) — un lien à ouvrir sur n'importe quel téléphone
La version web est livrée dans le fichier **`PadelConnect-web.zip`** (dossier `dist`).
C'est la façon la plus simple de montrer l'app aux clubs : pas besoin d'ordinateur côté club.

### Le plus rapide : Netlify Drop (gratuit, 1 minute)
1. Décompresse `PadelConnect-web.zip` → tu obtiens un dossier `dist`.
2. Va sur **https://app.netlify.com/drop**
3. **Glisse le dossier `dist`** dans la page. Tu obtiens aussitôt un lien public (ex. `https://padelconnect-xyz.netlify.app`).
4. Ouvre ce lien sur ton téléphone → menu **Partager** → **« Ajouter à l'écran d'accueil »**.
   Une icône PadelConnect apparaît : ça s'ouvre comme une vraie app.

> Astuce : crée un compte Netlify (gratuit) pour garder le lien et pouvoir le mettre à jour.

### Alternative : GitHub Pages (lien lié à ton dépôt)
Possible aussi — dis-le-moi et je te prépare le déploiement (je pousse une branche `gh-pages`,
tu actives Pages en 1 clic dans les réglages du dépôt).

---

## 2) Expo Go — tester sur TON téléphone tout de suite (besoin d'un ordinateur)
1. Installe l'app **« Expo Go »** depuis l'App Store (iPhone) ou le Play Store (Android).
2. Sur un ordinateur, dans le dossier du projet :
   ```bash
   npm install
   npx expo start
   ```
3. Scanne le QR code affiché avec l'appareil photo (iPhone) ou depuis Expo Go (Android).
   Téléphone et ordinateur doivent être sur le **même Wi-Fi**.

---

## 3) APK Android (vrai fichier installable) — via EAS Build
À faire depuis un ordinateur, avec un compte Expo gratuit (je ne peux pas le générer ici car
l'API d'Expo est bloquée dans cet environnement) :
```bash
npm install -g eas-cli
eas login
eas build -p android --profile preview
```
EAS te renvoie un lien pour télécharger l'**.apk**, à installer sur un téléphone Android
(autoriser « sources inconnues »).

> **iPhone** : pas d'APK. Pour installer hors App Store, il faut un compte Apple Developer et
> passer par **TestFlight**. Pour une démo iPhone, utilise plutôt le **lien web** (méthode 1).

---

## Publier sur les stores (plus tard)
Quand le projet sera validé : `eas build` puis `eas submit` vers l'App Store (compte Apple ~99 $/an)
et Google Play (25 $ une fois). Voir **STRATEGIE.md**.
