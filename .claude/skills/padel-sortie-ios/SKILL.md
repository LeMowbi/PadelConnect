---
name: padel-sortie-ios
description: Sortie d'une version PadelConnect — build iOS EAS production avec auto-submit, suivi, soumission en revue via l'API App Store Connect, vérification publique, redéploiement web Cloudflare Pages (Espace Club et site vitrine), mise à jour de CLAUDE.md §7, repères Android. À utiliser quand le porteur demande un build, un « TestFlight », une mise en revue ou une publication, ou un redéploiement de club.padelconnectci.com / padelconnectci.com.
---

# Sortie iOS (+ web, + repères Android)

Méthode générique EAS / stores : `eas-app-stores` (références `testflight.md`, `ios-app-store.md`,
`play-store.md`). Ici, le spécifique PadelConnect. Écarts assumés : `appVersionSource: "local"` (PAS
`remote`) → `app.json` fait foi ; pas d'`expo-updates` → AUCUNE mise à jour OTA (`eas-update` ne
s'applique pas), tout correctif part avec un build.

## 0. Pré-requis bloquants

- HEAD vert à la cadence, commité, poussé, `git status` propre (`padel-cadence-verification`).
- Tout SQL dont dépend le build est appliqué ET prouvé en base (`padel-preuve-en-base`) : une RPC
  dont la signature a changé sans sa migration = fonctionnalité cassée dès l'installation.
- Nouveau module natif depuis le dernier build → config plugin dans `app.json` (chaîne de permission
  en français) ; sinon crash au lancement.
- Version : `autoIncrement` ne bumpe QUE `ios.buildNumber`. Si `expo.version` est déjà publiée (ou si
  on ouvre une nouvelle version store), bumper `expo.version` (ex. 1.0.2 → 1.0.3) AVANT le build,
  commit `chore(release): version X.Y.Z (…)`.
- Secrets fournis par le porteur pour la session, en variables d'environnement seulement :
  `EXPO_TOKEN` (compte CI `padelconnect-ci`), clé App Store Connect (`ASC_KEY_PATH` vers un `.p8` HORS
  dépôt, `ASC_KEY_ID`, `ASC_ISSUER_ID`), jeton Cloudflare. L'état du shell ne persiste pas d'un appel
  à l'autre : redéfinir variables et fonctions dans chaque commande.

## 1. Build + suivi

```bash
npx eas-cli@latest build --platform ios --profile production --auto-submit --non-interactive --no-wait
npx eas-cli@latest build:list --platform ios --limit 3 --json --non-interactive \
  | jq '.[] | {id, status, appVersion, appBuildVersion, createdAt}'
```

- `app.json` vient d'être modifié localement (buildNumber + 1) : commit immédiat
  `Build #NN : bump buildNumber (EAS autoIncrement)` puis push.
- `status` : `NEW` / `IN_QUEUE` / `IN_PROGRESS` → `FINISHED` ; `ERRORED` → lire les logs
  (`npx eas-cli@latest build:view <id>` ou la page expo.dev du build). Attente : outil Monitor ou
  relance espacée, jamais de `sleep` long en avant-plan.
- L'auto-submit envoie le binaire à App Store Connect (TestFlight, traitement Apple ~10-30 min). Ce
  n'est PAS une soumission en revue.

## 2. Soumission en revue (API App Store Connect, App ID `6785261310`)

JWT ES256, durée ≤ 20 min, à régénérer dans chaque commande :

```bash
ASC_JWT=$(node -e '
const c = require("crypto"), fs = require("fs");
const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const u = b({ alg: "ES256", kid: process.env.ASC_KEY_ID, typ: "JWT" }) + "." +
  b({ iss: process.env.ASC_ISSUER_ID, iat: now, exp: now + 1140, aud: "appstoreconnect-v1" });
const s = c.sign("sha256", Buffer.from(u), { key: fs.readFileSync(process.env.ASC_KEY_PATH), dsaEncoding: "ieee-p1363" });
process.stdout.write(u + "." + s.toString("base64url"));')
asc() { curl -sS -X "$1" "https://api.appstoreconnect.apple.com$2" -H "Authorization: Bearer $ASC_JWT" \
  -H "Content-Type: application/json" ${3:+--data "$3"}; }
```

1. Build traité : `asc GET "/v1/builds?filter[app]=6785261310&filter[version]=<buildNumber>"` →
   `attributes.processingState = VALID` ; noter `BUILD_ID`.
2. Version : `asc GET "/v1/apps/6785261310/appStoreVersions?filter[versionString]=X.Y.Z&filter[platform]=IOS"` ;
   si absente :
   `asc POST /v1/appStoreVersions '{"data":{"type":"appStoreVersions","attributes":{"platform":"IOS","versionString":"X.Y.Z","releaseType":"AFTER_APPROVAL"},"relationships":{"app":{"data":{"type":"apps","id":"6785261310"}}}}}'`
   → `VERSION_ID` (`AFTER_APPROVAL` = publication automatique, choix du porteur).
3. Rattacher le build :
   `asc PATCH /v1/appStoreVersions/$VERSION_ID/relationships/build '{"data":{"type":"builds","id":"'$BUILD_ID'"}}'` (204).
4. Notes de version : `asc GET /v1/appStoreVersions/$VERSION_ID/appStoreVersionLocalizations` → id de la
   locale `fr-FR` →
   `asc PATCH /v1/appStoreVersionLocalizations/$LOC_ID '{"data":{"type":"appStoreVersionLocalizations","id":"'$LOC_ID'","attributes":{"whatsNew":"…"}}}'`.
   Texte FR, tutoiement, 3 à 6 puces vues du joueur / du club, aucun jargon (SQL, audit, build).
5. Soumission : `asc POST /v1/reviewSubmissions '{"data":{"type":"reviewSubmissions","attributes":{"platform":"IOS"},"relationships":{"app":{"data":{"type":"apps","id":"6785261310"}}}}}'`
   → `SUB_ID` (une soumission déjà ouverte : `asc GET "/v1/reviewSubmissions?filter[app]=6785261310&filter[state]=READY_FOR_REVIEW"`, la réutiliser).
6. Élément : `asc POST /v1/reviewSubmissionItems '{"data":{"type":"reviewSubmissionItems","relationships":{"reviewSubmission":{"data":{"type":"reviewSubmissions","id":"'$SUB_ID'"}},"appStoreVersion":{"data":{"type":"appStoreVersions","id":"'$VERSION_ID'"}}}}}'`.
7. Envoi : `asc PATCH /v1/reviewSubmissions/$SUB_ID '{"data":{"type":"reviewSubmissions","id":"'$SUB_ID'","attributes":{"submitted":true}}}'`.
8. Contrôle : `asc GET /v1/appStoreVersions/$VERSION_ID` → `appStoreState = WAITING_FOR_REVIEW`.

Erreurs fréquentes : `409 ENTITY_ERROR…` = métadonnée manquante (whatsNew, captures, compte démo de
revue — `docs/CHECKLIST-STORES.md` §b-bis) ; build pas encore `VALID` → attendre ; le chiffrement est
déjà déclaré (`usesNonExemptEncryption: false` dans `app.json`). Ne jamais afficher le JWT ni la clé.

## 3. Vérification publique (après approbation)

```bash
curl -s "https://itunes.apple.com/lookup?id=6785261310&country=ci&_=$(date +%s)" \
  | jq '.results[0] | {version, currentVersionReleaseDate}'
```

Cache iTunes : quelques heures de retard possibles. Stores CI/SN/US ; l'UE dépend de la vérification
« commerçant » DSA d'Apple (hors de notre main).

## 4. Redéploiement web (Cloudflare Pages)

`CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` en variables d'environnement ; wrangler exige Node ≥ 22.
(`deploy-web.yml` échoue tant que les secrets GitHub sont vides : déploiement manuel.)

```bash
# Espace Club / opérateur — club.padelconnectci.com (ou scripts/deploy-web.sh qui enchaîne tout)
npm run build:web && ./scripts/fix-web-assets.sh dist      # sans le correctif : icônes en carrés vides
npx wrangler@latest pages deploy dist --project-name=padelconnect-club --branch=main --commit-dirty=true
# Site vitrine — padelconnectci.com : le dossier site/ TEL QUEL et EN ENTIER
npx wrangler@latest pages deploy site --project-name=padelconnect-site --branch=main --commit-dirty=true
```

Nom de projet refusé → `npx wrangler@latest pages project list`. Contrôle en ligne (le CDN met en cache,
toujours un `?v=`) :

```bash
curl -s "https://padelconnectci.com/cgu?v=$(date +%s)" | grep -c "<phrase modifiée>"      # ≥ 1
curl -sI "https://padelconnectci.com/.well-known/apple-app-site-association" | grep -i content-type   # application/json
curl -s -o /dev/null -w "%{http_code}\n" "https://padelconnectci.com/get?v=$(date +%s)"   # 200 (boucle clean-URLs déjà vécue)
```

Un texte légal in-app (`src/app/legal.tsx`) ne part qu'avec le PROCHAIN build : le dire au porteur.

## 5. CLAUDE.md §7 après la sortie

Un paragraphe « 🆕 Build #NN (vX.Y.Z) » : buildNumber lu dans `app.json`, date, auto-submit oui/non,
ce que le build EMBARQUE (lots, correctifs, SQL requis), ce qui attend le PROCHAIN build, état de revue
Apple, état web/site + date ; l'ancien build devient « supplanté ». Pas de jeton, pas de clé, pas d'ID
de clé.

## 6. Android (repères — `docs/ANDROID-LANCEMENT.md`)

- APK de test : `npx eas-cli@latest build --platform android --profile preview --non-interactive --no-wait`
  (`preview` = `buildType: apk`, signé par la clé EAS ; artefacts ~30 jours).
- Production Play : profil `production` (`.aab`) ; bumper `android.versionCode` (1 au premier envoi) ;
  FCM obligatoire (`google-services.json` + clé de service sur expo.dev), sinon aucun push Android.
- Play App Signing : Google re-signe → AJOUTER son empreinte SHA-256 dans `site/assetlinks.json` à côté
  de celle d'EAS, puis redéployer `site/`.
- `site/get.html` : activer la redirection Android le jour où la fiche Play existe.
- Compte personnel neuf : ~14 jours de test fermé imposés par Google.

## Fait quand

- Build `FINISHED`, `processingState = VALID`, bump commité et poussé.
- Si une revue était demandée : `appStoreState = WAITING_FOR_REVIEW` (puis version vue par le lookup).
- Web / site redéployés ET vérifiés en ligne avec anti-cache, s'ils étaient concernés.
- CLAUDE.md §7 à jour ; aucun jeton, clé, JWT ni ID de clé dans le dépôt, un commit ou un rapport.
