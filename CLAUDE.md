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
- **React Compiler** : le flag `experiments.reactCompiler` est **désactivé** dans `app.json`
  (stabilité), mais on **respecte quand même ses règles** pour pouvoir l'activer plus tard —
  pièges à respecter :
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
- **Dernier build : #42** (= #41 + audit n°4 : durcissements serveur SQL 48 + corrections app).
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
  **SQL Editor → Run**. Migrations actuelles : `02` → `49` (voir dossier `supabase/`).
- **Edge Function** `supabase/functions/notify-club/index.ts` (Deno) : envoie les push via
  l'API Expo. Déclenchée par des **Database Webhooks** (INSERT + UPDATE). Redéploiement **sans
  terminal** : Dashboard → Edge Functions → notify-club → Edit → coller le code → Deploy.
  Webhooks à brancher (voir `docs/PUSH-SETUP.md`) : `reservations`, `reservation_participants`,
  `competitions`, **`friend_requests`**, **`lessons`**, **`match_results`**, **`operator_news`**.
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
- **Coachs** : annuaire de coachs partenaires (`src/data/coaches.ts` : type `Coach`, `getCoach`,
  `coachClubName`). Écrans `src/app/coachs/index.tsx` (liste, tri par `levelValue`) et
  `src/app/coachs/[id].tsx` (fiche + contact WhatsApp/appel direct). Accès depuis la fiche club et
  l'accueil. **Aucun profil fictif** : `coaches: Coach[] = []` au lancement (comme les tournois),
  les vrais coachs sont ajoutés par les gérants (`clubCoaches`) ou en dur ici quand ils existent.
- **Coachs & cours (serveur, 38)** : le club **promeut un compte joueur** en coach (par téléphone,
  `club_add_coach`) → le compte gagne son **Espace Coach** (`src/app/coach-admin.tsx` : demandes,
  cours à venir, fiche/dispos). L'élève demande un cours (`src/app/cours/[coachId].tsx`,
  `request_lesson`) : **le terrain n'est réservé QUE quand le coach accepte** — `respond_lesson`
  crée alors une réservation STANDARD (mêmes barrières anti double-résa, commission inchangée),
  que le club confirme ensuite = **double validation coach + club**. Client :
  `src/lib/coachesServer.ts` ; état : `coachProfile` + `myLessons` (session + premier plan) ;
  push via webhook `lessons` (INSERT + UPDATE). Le tarif du cours se règle au coach, hors app.
- **Photos club (38)** : `cover_url` = photo « de profil » (carte ClubCard + héros fiche ;
  `''` = retrait côté serveur) et `court_photos` = **une photo par terrain** (vignettes étiquetées
  sur la fiche, gérées ligne par ligne dans l'Espace Club). Store : `clubCovers`/`clubCourtPhotos`.
- **Padelta d'abord** : `compareClubs` (data/clubs.ts) épingle Padelta en tête de toutes les
  listes joueurs (décision du porteur) ; les tris « Sponsorisé d'abord » restent prioritaires.
- **Matchs ouverts (45, modèle Playtomic)** : terrain bloqué direct par le créateur, places
  restantes rejoignables (`join_open_match` → participant 'accepted' + prénom dans `invited`,
  push au créateur). GRATUIT pour tous — un futur Gold les ÉPINGLERA (jamais ne les verrouille).
  UI : toggle dans le tunnel + section `src/components/OpenMatches.tsx` (onglet Réserver).
- **Classement (46, remplace la 44)** : par **POINTS** gagnés dans l'app (modèle « Race » FIP —
  le niveau, plafonné à 7 et auto-déclaré, ne peut pas servir de rang) : 100 = tournoi officiel
  gagné (winner_user_id ancré), 10 = tournoi officiel joué, 3 = victoire de match confirmée,
  2 = partie jouée. `fetch_leaderboard`/`my_leaderboard_rank`, écran `/classement`.
- **Score de match (46, durci en 48)** : CHAQUE joueur du match saisit les sets de SON point de
  vue (`submit_match_score`) ; l'app calcule la forme CANONIQUE (score vu du vainqueur) et
  **désigne le vainqueur automatiquement**. RÈGLE ANTI-TRICHE (48) : un match n'est validé que
  si un camp PERDANT reconnaît le score (une saisie « j'ai perdu » en miroir), OU si une saisie
  UNIQUE reste 48 h sans réponse ; tout match où > 2 comptes revendiquent la victoire est GELÉ.
  Deux « je gagne » identiques ne valident donc jamais (un perdant ne peut pas se créditer). Les
  +3 ne comptent que si la résa est encore 'booked' (pas « pas venu »). Contestation ouvrable
  au-delà de 14 j dès qu'une 1ʳᵉ saisie existe (la fenêtre 14 j ne borne que la 1ʳᵉ saisie).
  UI « Mes réservations » (`src/lib/matchResults.ts`), push via webhook **`match_results`**.
- **Durcissements audit n°4 (48)** : contrainte `competitions.organizer_type` élargie à
  'operator' (les tournois officiels PadelConnect fonctionnent enfin) ; garde d'insertion des
  réservations RÉORDONNÉE (passe avant la garde de disponibilité) + refus des créneaux passés +
  plafond serveur ; `respond_invitation` libère la place d'un match ouvert ; `leave_open_match`
  / `set_match_open` (quitter / fermer un match) ; `respond_lesson` refuse la double-résa coach
  ('busy') et refuse proprement un conflit ; `coach_update_profile` borné [1000,1000000] ;
  `club_add_coach` renvoie 'other_club' (coach déjà pris ailleurs). Côté client : écritures
  gérant/opérateur honnêtes (attendent le serveur : infos club, blocage créneau, « payé »,
  retrait d'actu), jour recalé après minuit, `pctLabel` (pourcentage exact), routes /legal &
  /decouvrir publiques, écran auth-callback, bornes de requêtes (occupation, réservations).
- **Push d'actu (47)** : case « Envoyer aussi en notification » dans l'éditeur d'actu
  opérateur (OPTIONNEL, décochée par défaut, jamais mémorisée) → colonne `operator_news.push`
  lue par notify-club via le webhook **`operator_news`** (INSERT + UPDATE, garde anti-doublon
  sur news_id). Tap sur la notif → accueil (kind 'news').
- **Tournois officiels PadelConnect (43)** : organizer_type 'operator' — créés par l'opérateur
  EN TANT QUE PadelConnect, VALIDÉS par le club hôte dans son Espace Club (jamais en entrant
  dans son planning sans accord). Présentation premium (bandeau doré) — futur canal FIP.
- **Abonnement Gold (3 500 F/mois, Wave)** : GARDÉ POUR PLUS TARD (décision porteur) — statut
  + avantages (badge, matchs épinglés, priorité tournois), jamais de verrou sur le cœur de l'app.
- **Barre d'onglets** : groupe `(tabs)` (Accueil/Réserver/Tournois/Amis/Profil) ; les détails
  glissent par-dessus. Espace opérateur en 4 onglets (Aperçu/Finances/Clubs/Demandes).
- **Calendrier appareil** : `createEventInCalendarAsync` (fiche système pré-remplie, AUCUNE
  permission — l'ancienne voie échouait sur iOS 17+). `CalendarPicker` maison pour les dates
  de tournoi (grille mensuelle UTC).

## 10. État actuel / à faire

- **Build #34** livré (auto-submit TestFlight) : audit complet (lots A/B/C/D/E) + amis-demande, contacts, badge Partenaire, actu
  serveur, uploads réparés, sécurité stockage, animations, diagnostics, **Universal Links actifs**
  (profil de provisioning régénéré avec « Associated Domains »).
- **Depuis le #34 (build #35 lancé)** : audit n°2 COMPLET appliqué (1 HIGH reset-password +
  13 moyens + ~90 finitions basses + 24 propositions design + 16 améliorations par rôle,
  SQL 37 et 39), demandes porteur (« Créneaux disponibles », « Clubs près de toi » remonté,
  **Padelta premier partout**), inscription en 3 étapes, notes moyennes réelles sur les
  cartes, carte « Santé de l'app » opérateur, et la grosse feature **Coachs & cours +
  photos club** (SQL 38, Espace Coach, réservation de cours, cover + photo par terrain,
  annulations synchronisées cours ↔ réservation).
- Serveur appliqué le 2026-07-01 (confirmé par le porteur) : SQL `30` → `36` (dont
  `34_level_integrity` anti-triche et `36_audit_hardening` : niveau borné [1,7] à l'inscription
  + anti-collision de noms à la clôture), webhook `friend_requests`, notify-club redéployé
  (push des demandes d'ami renvoyées).
- **Audit n°3 (2026-07-02, ultracode)** : 4 agents spécialisés (matrice serveur↔app 31 RPC +
  21 tables, designer, testeur, planner) + workflow 50 agents (8 angles × sceptiques). Résultat :
  SQL `41_reservations_hardening` (plus de DELETE direct d'une résa + insertion forcée
  'booked'/non confirmée), tri-états réseau (ami introuvable ≠ hors-ligne), tarifs bornés à la
  saisie, `useTodayKey` (listes de jours recalées après minuit), zodiac en UTC, purge disque
  immédiate à la déconnexion, perfs (agrégats opérateur mémoïsés, tunnel de résa, planning club,
  historiques paginés), quick wins UX (guide gérant « 4 gestes », « Chercher des joueurs »,
  preuves de confiance, skeletons, EmptyState actionnables, maxWidth tablette 640/480).
- **Reste à faire par le porteur (docs/AUDIT-SERVEUR.md §1)** : coller SQL `37` + `38` + `39` +
  `40` + `41`, redéployer notify-club, créer les **webhooks `lessons` et `coaches`** (INSERT +
  UPDATE). Optionnel plus tard : `WEBHOOK_SECRET` + en-tête `x-webhook-secret` sur les webhooks (§3).

### Feuille de route (décidée avec le porteur le 2026-07-01)

- ✅ **Stats club** (revenu + créneaux creux) — fait.
- ✅ **Skeletons** de chargement — fait (`src/components/Skeleton.tsx`).
- ✅ **Conformité App Store** (confidentialité) — `site/privacy.html` +
  `docs/APP-STORE-CONFORMITE.md` (le porteur héberge le site + remplit App Privacy).
- ✅ **Suivi bugs + usage** (idée 3) — fait, **self-hosted** (choix du porteur) : `33_diagnostics.sql`
  (app_errors + app_events, appliqué en base), `src/lib/diagnostics.ts` (logError/track),
  ErrorBoundary racine + handler global. Anonyme, lecture opérateur uniquement.
- ✅ **Universal Links** (idée 6) — **actifs depuis le build #34**. `associatedDomains` (app.json),
  routes `/invite/[code]` (parrainage pré-rempli) et `/club/[id]` (partage de fiche), site
  **déployé** sur Cloudflare Pages (padelconnectci.com : AASA + redirections App Store).
  Guide/vérifications : `docs/UNIVERSAL-LINKS.md`. ⚠️ si le site a été déployé par glisser-déposer,
  re-déployer `site/` à la main après toute modification du dossier.
- 🔒 **Programme de fidélité** (idée 5) — **gardé pour plus tard** (X parties jouées = récompense).
- ❌ **Paiement en ligne** (idée 7) — pas pour l'instant.
- Autres post-lancement : vrai SMTP de confirmation, perf, éventuel kit `PlanningGrid`.

## 11. Où regarder

- `docs/PUSH-SETUP.md` — configuration des push & webhooks (étapes Dashboard).
- `docs/SERVEUR-*.md` — notes serveur (clubs, amis/boosts/fiabilité…).
- `src/store/AppContext.tsx` — cœur de l'état + tous les appels serveur.
- `src/data/clubs.ts` — les 9 clubs fondateurs + modèle Club.
- `src/data/coaches.ts` — annuaire des coachs (modèle `Coach`, vide au lancement) + écrans `src/app/coachs/`.
- `supabase/` — toutes les migrations (numérotées) et l'Edge Function.
