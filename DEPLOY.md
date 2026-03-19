# Floppy Wings - Guide de Déploiement iOS & Android

## Architecture

```
floppy-wings/
├── index.html              # Point d'entrée principal
├── src/
│   ├── style.css           # Styles (mobile-first, safe areas)
│   ├── skins.js            # Définition des skins (dessinés en canvas)
│   ├── iap.js              # Système IAP (StoreKit / Google Play Billing)
│   ├── shop.js             # Interface boutique
│   ├── game.js             # Moteur de jeu (physique, rendu, collisions)
│   └── main.js             # Contrôleur principal de l'app
├── capacitor.config.json   # Configuration Capacitor
├── package.json            # Dépendances npm
├── ios/                    # Projet Xcode généré par Capacitor
│   └── App/App/Info.plist  # Configuration iOS (IAP, orientations, etc.)
└── android/                # Projet Android généré par Capacitor
    └── app/src/main/
        └── AndroidManifest.xml
```

---

## Prérequis

- Node.js 18+
- Xcode 15+ (pour iOS)
- Android Studio (pour Android)
- Compte Apple Developer ($99/an)
- Compte Google Play Developer ($25 unique)

---

## Installation

```bash
npm install
npx cap add ios
npx cap add android
npx cap sync
```

---

## Lancer en local (navigateur)

```bash
npm start
# Ouvre http://localhost:3000
```

---

## Build iOS

```bash
npx cap sync ios
npx cap open ios
# Dans Xcode : Product > Archive > Distribute App
```

**Étapes App Store Connect :**
1. Créer l'app sur https://appstoreconnect.apple.com
2. Configurer les produits IAP :
   - `com.floppywings.coins_100` (Consommable, 0,99€)
   - `com.floppywings.coins_300` (Consommable, 2,99€)
   - `com.floppywings.coins_600` (Consommable, 4,99€)
   - `com.floppywings.coins_1500` (Consommable, 9,99€)
   - `com.floppywings.skin_phoenix` (Non-consommable, 0,99€)
   - `com.floppywings.skin_ice` (Non-consommable, 0,99€)
   - `com.floppywings.skin_golden` (Non-consommable, 1,99€)
   - `com.floppywings.skin_neon` (Non-consommable, 1,99€)
   - `com.floppywings.skin_rainbow` (Non-consommable, 2,99€)
   - `com.floppywings.bg_night` (Non-consommable, 0,99€)
   - `com.floppywings.bg_underwater` (Non-consommable, 0,99€)
   - `com.floppywings.bg_space` (Non-consommable, 1,99€)
   - `com.floppywings.bg_jungle` (Non-consommable, 1,99€)
   - `com.floppywings.bg_volcano` (Non-consommable, 2,99€)
3. Activer StoreKit dans les entitlements Xcode
4. Soumettre pour review

---

## Build Android

```bash
npx cap sync android
npx cap open android
# Dans Android Studio : Build > Generate Signed Bundle/APK
```

**Étapes Google Play Console :**
1. Créer l'app sur https://play.google.com/console
2. Configurer la monétisation : même liste de produits qu'iOS
3. Ajouter la bibliothèque Google Play Billing dans build.gradle
4. Soumettre pour review

---

## Intégration IAP réelle (Production)

Le fichier `src/iap.js` contient les stubs pour l'intégration native.
Pour la production, décommenter et adapter le code dans `IAP.purchase()`.

### iOS (StoreKit 2)
```bash
npm install @capacitor-community/in-app-purchases
```

### Android (Google Play Billing)
```bash
npm install capacitor-android-iap
```

### Vérification serveur (recommandée)
Déployer un backend pour valider les reçus côté serveur avant de créditer :
```
POST /verify-iap
{ receipt, platform: 'ios'|'android', productId }
→ { valid: true, transactionId }
```

---

## Skins disponibles

| ID | Nom | Prix | Type |
|----|-----|------|------|
| classic | Canary | Gratuit | Perso |
| phoenix | Phénix 🔥 | 0,99€ | Perso |
| ice | Cryo ❄️ | 0,99€ | Perso |
| golden | Aigle d'Or 🦅 | 1,99€ | Perso |
| neon | Cyber 🤖 | 1,99€ | Perso |
| rainbow | Arc-en-Ciel 🌈 | 2,99€ | Perso |

## Décors disponibles

| ID | Nom | Prix | Type |
|----|-----|------|------|
| classic | Ciel Bleu ☀️ | Gratuit | Décor |
| night | Nuit Urbaine 🌃 | 0,99€ | Décor |
| underwater | Sous les Mers 🐠 | 0,99€ | Décor |
| space | Galaxie 🚀 | 1,99€ | Décor |
| jungle | Jungle 🌿 | 1,99€ | Décor |
| volcano | Volcan 🌋 | 2,99€ | Décor |

---

## Revenus potentiels

- Pièces de jeu : 0,99€ → 9,99€ (consommables, achetables infiniment)
- Skins : 0,99€ → 2,99€ (non-consommables, 1 achat)
- Décors : 0,99€ → 2,99€ (non-consommables, 1 achat)
- **Total maximum par utilisateur : ~35€**

---

## RGPD / Conformité

- Aucune donnée personnelle collectée sans consentement
- Les achats sont traités par Apple/Google (conformité PCI DSS)
- Politique de confidentialité requise pour les stores
- Mentions légales IAP affichées dans la modale d'achat
- Âge minimum : 4+ (contenu approprié)
