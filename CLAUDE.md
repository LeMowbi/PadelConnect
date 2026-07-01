# PadelConnect — Guide du projet (CLAUDE.md)

Mémoire de contexte pour toute session d'assistant IA. À lire en entier avant de coder.
Tenir ce fichier À JOUR quand un objectif, une règle ou l'architecture change.

## 1. Le projet

- **PadelConnect** : application 100 % Expo / React Native de **réservation de terrains de
  padel à Abidjan (Côte d'Ivoire)**. Réservation de créneaux, tournois, amis, avis, espace
  club (gérant) et espace opérateur.
- **Propriétaire** : Moustapha (moustaphabitar01@gmail.com) — **non technique, francophone**.
  Il travaille **sans terminal** : toutes les actions serveur se font depuis le **Dashboard
  Supabase** (SQL Editor, Webhooks, Edge Functions). Toujours lui donner des étapes cliquables.
- **Statut** : en production sur **TestFlight** (iOS). Backend **Supabase**.

## 2. Objectif permanent

Construire la version **finale de production** : tout doit être **réel et fonctionnel** — aucune
donnée factice, aucune incohérence. On vise le « littéralement fonctionnel et réel », prêt à
shipper sur TestFlight.

## 3. Règles absolues (demandées par le propriétaire, verbatim)

- « **tu n'as pas le droit a l'erreur tout doit etre fait parfaitement** »
- « **le code doit etre lisible et bien ranger** »
- « **pour chaque chose que t'ajoute et tu changes vérifie bien l'impact sur le reste** — on ne
  veut pas de code qui ne sert à rien ou de doublons inutiles »
- « **continue, ne t'arrête que lorsque tu as besoin de moi** »
- Écrire un code qui **ressemble au code existant** (mêmes idiomes, densité de commentaires, noms).
- Commentaires **en français** (comme tout le code du projet).

## 4. Contraintes de sécurité / process (NE JAMAIS enfreindre)

- **Branche de dev** : `claude/padelconnect-v4-17-4zblgh`. Développer et pousser UNIQUEMENT ici.
  Ne jamais pousser sur une autre branche sans permission explicite.
- **Ne pas créer de Pull Request** sauf demande explicite.
- Dépôt GitHub : `LeMowbi/PadelConnect` (anciennement `Test-1`).
- Ne jamais mettre de **secret** (token EAS, clés…) ni d'**identifiant de modèle** dans un
  fichier commité, un message de commit, un commentaire ou une PR.
- `git push` : toujours `git push -u origin claude/padelconnect-v4-17-4zblgh`.
- Messages de commit : terminer par les trailers `Co-Authored-By:` et `Claude-Session:`.

## 5. Stack technique

- **Expo SDK ~56**, **React Native 0.85**, **expo-router**, **TypeScript strict**.
- **React Compiler activé** — pièges à respecter :
  - pas de `useCallback` avant un `return` anticipé ;
  - **jamais** de `setState` synchrone dans le corps d'un effet (utiliser un callback après
    `await`, ou un initialiseur `useState`).
- **react-native-reanimated 4** dispo. Animations simples via l'API `Animated` (composants
  réutilisables : `src/components/Reveal.tsx` = fondu, `src/components/PopIn.tsx` = ressort).
- État global : Context + `AsyncStorage` (`src/store/AppContext.tsx`, ~1700 lignes ; helpers purs
  et testables dans `src/store/helpers.ts`).
- Deep links : **scheme `padelco`** (choix assumé). `reset-password` routé vers
  `padelco://reset-password`.

## 6. Cadence de VÉRIFICATION (obligatoire après chaque lot, avant commit)

```bash
npx tsc --noEmit
npm run lint
TZ=UTC npm run test:logic
# bundle « eager » pour détecter un souci d'empaquetage runtime :
npx expo export:embed --eager --platform ios --dev false \
  --entry-file node_modules/expo-router/entry.js \
  --bundle-output <scratchpad>/ios.jsbundle
npx prettier --write <fichiers modifiés>
```

Tout doit passer AVANT de commit. Commiter par lot cohérent, puis pousser.

## 7. Build & déploiement (EAS)

- Profil **production** dans `eas.json` (`autoIncrement: true`, `appVersionSource: "local"` →
  bump automatique de `buildNumber` dans `app.json`). Auto-submit vers l'App ID `6785261310`.
- Compte CI EAS : **padelconnect-ci** (le token EAS est fourni au moment du build ; ne pas
  l'écrire dans le dépôt).
- Lancer : `EXPO_TOKEN=… npx eas-cli@latest build --platform ios --profile production
  --auto-submit --non-interactive --no-wait`.
- **Dernier build : #28** (contient amis-demande, contacts, badge Partenaire, actu serveur, etc.).
- Un module natif nouveau (ex. `expo-contacts`) ⇒ **nouveau build requis** + config plugin dans
  `app.json` avec la chaîne de permission.

## 8. Conventions Supabase

- SQL **idempotent** : `create or replace`, `create table if not exists`, `drop policy if exists`,
  `alter table … add column if not exists`, `drop function if exists` si la signature change.
- **RLS** partout ; accès sensible via fonctions **SECURITY DEFINER** (on n'expose jamais
  `profiles`). Correspondance téléphone = **10 derniers chiffres**.
- Policies **UPDATE de Storage** : toujours `using` **ET** `with check` (sinon on peut déplacer un
  objet dans le dossier d'autrui).
- Les migrations sont des fichiers numérotés dans `supabase/` — l'opérateur les colle dans
  **SQL Editor → Run**. Migrations actuelles : `02` → `32` (voir dossier `supabase/`).
- **Edge Function** `supabase/functions/notify-club/index.ts` (Deno) : envoie les push via
  l'API Expo. Déclenchée par des **Database Webhooks** (INSERT + UPDATE). Redéploiement **sans
  terminal** : Dashboard → Edge Functions → notify-club → Edit → coller le code → Deploy.
  Webhooks à brancher (voir `docs/PUSH-SETUP.md`) : `reservations`, `reservation_participants`,
  `competitions`, **`friend_requests`**.
- **Convention réseau** : un fetch serveur renvoie `null` en cas d'échec réseau (≠ `[]`/`{}` =
  succès vide). Les appelants font `x ?? s.existant` ou `if (!x) return` pour ne pas écraser le
  miroir local hors-ligne.

## 9. Décisions d'architecture importantes

- **Niveau (level)** : attribué **UNE SEULE FOIS côté serveur** dans `close_competition` (tournois
  officiels, idempotent). Le client ne fait que **dériver l'affichage** du palmarès → sûr à la
  réinstallation, jamais de double attribution.
- **Upload photo/avatar** : `pickImage` renvoie une **URI `file://`** en natif (lue par
  `new File(uri).base64()`), un **data-URI** seulement sur le web. Ne jamais persister une URI
  locale côté serveur si l'upload échoue.
- **Amis** : plus d'ajout instantané. `send_friend_request` (30) → la personne **accepte/refuse**
  (`respond_friend_request`). Amitié **mutuelle** après acceptation ; auto-accept si demande
  croisée. `friendRequests` chargé en session + retour premier plan ; push via notify-club.
- **Contacts** : `expo-contacts` (sélecteur système) pour ajouter un ami vite ; champ pré-rempli
  `+225`.
- **Actu d'accueil opérateur** : **serveur** (`operator_news`, 32) — visible par tous, écrite par
  l'opérateur. Pas d'actu de démo par défaut (`operatorNews: null`).
- **Support** : signalements « résolus » **auto-supprimés après 7 jours** (31, purge déclenchée à
  l'ouverture de l'espace opérateur).
- **Commission** : l'opérateur la règle **librement** (0–100 %) ; il prévient le club lui-même.
- **Tournois** : réels, cross-device (serveur, 26) ; blocage terrains/créneaux (27) ; approbation
  club ; frais opérateur encaissés **après validation** du club (paiement Wave, notifié).
- **Clubs fondateurs** : les **9 clubs seed** portent `partner: true` → badge **« Partenaire »**
  (carte + fiche). Les clubs inscrits ensuite ne l'ont pas.

## 10. État actuel / à faire

- **Build #28** en cours de compilation + auto-submit TestFlight (remplace #27).
- Le propriétaire doit avoir lancé sur Supabase : SQL `30`, `31`, `32` ; webhook `friend_requests`
  (INSERT+UPDATE) → notify-club ; redéploiement de notify-club. **(fait le 2026-07-01)**
- Pistes restantes / post-lancement : Universal Links, vrai SMTP de confirmation, perf, un
  éventuel composant kit `PlanningGrid` (non prioritaire).

## 11. Où regarder

- `docs/PUSH-SETUP.md` — configuration des push & webhooks (étapes Dashboard).
- `docs/SERVEUR-*.md` — notes serveur (clubs, amis/boosts/fiabilité…).
- `src/store/AppContext.tsx` — cœur de l'état + tous les appels serveur.
- `src/data/clubs.ts` — les 9 clubs fondateurs + modèle Club.
- `supabase/` — toutes les migrations (numérotées) et l'Edge Function.
