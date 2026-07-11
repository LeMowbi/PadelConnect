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
- **Animations** via l'API `Animated` du cœur React Native (composants réutilisables :
  `src/components/Reveal.tsx` = fondu, `src/components/PopIn.tsx` = ressort). ⚠️ `react-native-reanimated`
  est dans les deps mais **PAS câblé** (aucun `babel.config.js` avec le plugin worklets, jamais
  importé dans `src/`) : ne PAS l'importer tel quel — il faudrait d'abord ajouter le plugin Babel.
  Suppression des deps `react-native-reanimated`/`react-native-worklets` à décider post-lancement.
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
- **`app.json` `buildNumber` courant : 61** (EAS `autoIncrement` le bump à chaque build — ne PAS
  s'en remettre au suivi manuel ci-dessous, c'est `app.json` qui fait foi). Le build **créneaux
  1h/1h30** (soumissions #58→#61) a REMPLACÉ le #57 en revue. Historique : #46 = lancement audit
  n°7 ; #47 = créneaux modulables + multi-clubs ; #48+ = chantier v2 (comptes club, 1v1, Wave,
  stats) ; tours 2→10 « chaque audit renforce le précédent » ; #58→#61 = créneaux à durée variable
  1h/1h30 + audits (tours 1→BLANC). ✅ **Tout le SQL `02`→`74` est appliqué EN BASE** (`68`→`72` =
  campagne créneaux durée variable ; `73`+`74` = audit complet 2026-07-11, appliqués via l'API
  Management le 2026-07-11, table `reservations` vide → risque nul). ⚠️ **NE JAMAIS recoller
  `68_creneaux_duree.sql` SEUL** : ses `create or replace` ÉCRASERAIENT les durcissements `69`→`72`
  (validation `d∈{60,90}`, gardes anti-orphelin, verrou commun, retrait de terrain) ; si on doit
  recoller la 68, recoller ENSUITE `69`→`74` dans l'ordre. Reste au porteur : le lien Wave (Espace
  opérateur), redéployer `notify-club`
  (compare HMAC en temps constant), FCM Android + empreinte assetlinks.
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
  **SQL Editor → Run**. Migrations actuelles : `02` → `64` (voir dossier `supabase/`) — **toutes
  appliquées en base** (vérifié le 2026-07-06). `60`→`64` couvrent des durcissements de sécurité
  (61 diagnostics anonymes, 62 téléphone organisateur privé, 63 `with check` sur les policies
  UPDATE de Storage, 64 cycle de vie compte/tournoi).
- **Edge Function** `supabase/functions/notify-club/index.ts` (Deno) : envoie les push via
  l'API Expo. Déclenchée par des **Database Webhooks** (INSERT + UPDATE). Redéploiement **sans
  terminal** : Dashboard → Edge Functions → notify-club → Edit → coller le code → Deploy.
  Webhooks à brancher (voir `docs/PUSH-SETUP.md`, 8 au total) : `reservations`,
  `reservation_participants`, `competitions`, **`friend_requests`**, **`lessons`**,
  **`coaches`**, **`match_results`**, **`operator_news`**.
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
  club ; frais opérateur encaissés **après validation** du club (paiement Wave, notifié). Le club
  voit TOUTES les infos (dates, terrains, créneaux, frais, contact WhatsApp de l'organisateur)
  AVANT de décider ; un refus porte un **motif** (52, `reject_reason`) montré à l'organisateur
  (fiche + push), qui peut alors **supprimer** son tournoi refusé et le recréer. Les frais
  opérateur sont annoncés à l'organisateur dans un encadré AVANT la création (dus seulement si
  le club valide, rien s'il refuse).
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
- **Horaires modulables par club (50, réglés à l'audit 7)** : chaque club règle SES heures via
  deux sélecteurs « Ouverture (pas de 30 min) / Fermeture (pas d'une session, 1h30) » dans
  l'Espace Club → `buildSlots` (`src/lib/slots.ts`, PUR) découpe la plage en sessions de 1h30
  (`SESSION_MIN`, un créneau ne déborde jamais la fermeture) — deux clubs peuvent avoir des
  grilles décalées (8h→9h30 vs 8h30→10h). STOCKAGE : `club_config.slots` porte la grille
  COMPLÈTE, un créneau fermé étant préfixé `!` (ex. `'!12:30'` = pause déjeuner) — les heures
  se DÉRIVENT de la grille (`inferOpenClose`, aucun état local → plus de « réinitialisation »
  au retour sur l'écran) et un créneau fermé reste rouvrable. `openSlotsFor` (availability.ts)
  filtre les `!` ; côté serveur `'!12:30'` ne matche jamais `= any(slots)` → refusé d'office.
  AUCUN SQL pour les horaires. Les **plages tarifaires** ne sont plus forcées à 07:00→24:00 :
  `validateTiers(tiers, openMin, closeMin)` exige une couverture des HEURES D'OUVERTURE du club
  (bornes passées par `ClubInfoCard`). Fermer un créneau portant une résa à venir est refusé.
- **Créneaux modulables (54, demande porteur)** : trois briques. 1) **Fermeture sur PÉRIODE**
  (`blocked_ranges` : terrain précis ou club entier, du jour A au jour B, toute la journée ou
  certaines heures — `src/lib/ranges.ts` pur + testé, miroir `state.blockedRanges`, RPC
  `block_range` qui refuse si une résa à venir vit dans la période, garde à l'INSERT +
  `competition_slot_conflict`). 2) **Grille LIBRE** (`canAddSlot` dans slots.ts : le gérant
  ajoute/retire n'importe quel horaire, sessions de 1h30 sans chevauchement — aucun SQL,
  la garde `= any(slots)` accepte toute grille). 3) **Fermetures récurrentes PAR TERRAIN**
  (`club_config.court_closed` : { 'Terrain 1': ['18:00'] }, miroir `state.clubCourtClosed`,
  action `setCourtClosed`). La durée de session reste 1h30 PARTOUT (tarifs, commission,
  anti double-résa) — décision assumée. `upsert_club_config` gagne `p_court_closed` (⚠️ 54 à
  coller AVANT le build #47). La dispo joueur filtre tout ça dans `freeCourts` (availability.ts).
- **Créneaux à DURÉE VARIABLE 1h/1h30 PAR TERRAIN (68, demande porteur 2026-07-07)** : REMPLACE la
  durée fixe 1h30 de la 54. Chaque TERRAIN a SA grille (`club_config.court_slots` jsonb :
  `{ 'Terrain 1': [{ t:'08:00', d:90 }, { t:'09:30', d:60, x?:true }] }`) — durée 60 ou 90 par créneau,
  mélangeables, modifiables à tout moment, sans chevauchement sur un terrain. Chaque **réservation FIGE
  sa durée** (`reservations.duration_min`) comme son prix. Le gérant règle **DEUX prix par plage**
  (`price_tiers[].price` = 1h30, `price60` = 1h ; 1h dérive à 2/3 si vide). Logique PURE
  `src/lib/courtSchedule.ts` (types + `overlaps` demi-ouvert strict `[t,t+d)`, `canAddCourtSlot`,
  `resolveCourtSlots` rétrocompatible : `court_slots` null ⇒ dérive de l'ancienne grille `slots`@90, les
  fermetures héritées `'!'`/`court_closed` RESTENT fermées). Anti double-vente = **contrainte d'exclusion
  GiST** `reservations_no_overlap` (`int8range(starts_at, starts_at+duration_min*60000)`, SQLSTATE **23P01**,
  `btree_gist`) + gardes serveur réécrites en CHEVAUCHEMENT D'INTERVALLE (miroir EXACT côté client :
  `availability.ts` `freeCourtSlotsAt`/`freeCourts(club,dateKey,time,durationMin,ctx)`, `AvailCtx.courtSlots`,
  `ranges.rangeBlocks(...,durationMin)`, `slot_occupancy`+`duration_min`). Tournois AUSSI modulables
  (`competitions.slot_durations int[]`, aligné sur `slots` ; `create_competition`/`fetch_competitions`+durées).
  `resolve_court_slots(club_id,court)` = grille effective serveur. `upsert_club_config` gagne `p_court_slots`
  (null=préserve, `'{}'`=efface→dérivation, objet=grille validée + dérive le miroir `slots` + vide `court_closed`).
  Store : tranche `state.courtSlots`, action `setCourtSlots`. `isPlayed(r)` = `startsAt + durationMin*60000`.
  ✅ **SQL 68 appliqué en base** (avec les durcissements `69`→`72` de la campagne créneaux ; ne jamais
  recoller la 68 seule, cf. §7). Tests : `courtSchedule`/`availability`/`ranges`/`audit`/`pricing`
  (overlap prouvé, adjacence OK, asymétrie 1h↔1h30, rétrocompat null≡@90).
- **Multi-clubs (55, demande porteur)** : un compte gère PLUSIEURS clubs. `manager_clubs` liste
  les clubs autorisés ; `profiles.managed_club_id` reste le club ACTIF (un seul à la fois) →
  aucun contrôle serveur existant ne change. `grant_club_access_by_phone` AJOUTE (plus de
  remplacement), `revoke` retire tout, `switch_managed_club` bascule (le client fait ensuite
  `refreshSession()` : le périmètre RLS des résas suit). Sélecteur dans Espace Club → « Club
  géré » (visible à 2+ clubs). ⚠️ 55 à coller APRÈS la 54, AVANT le build #47.
- **Coachs « fiche simple » RETIRÉS (audit 7, décision porteur)** : un coach doit AVOIR
  l'application. Plus d'annuaire de contact sans compte dans l'Espace Club (`clubCoaches`
  supprimé du store/`ClubConfig` ; `upsert_club_config` omet `p_coaches`, defaulted côté SQL).
  Seuls restent les coachs RÉSERVABLES (comptes promus, table `coaches`) — dont le CLUB fixe le
  tarif de la session via `club_set_coach_price` — et l'annuaire statique `src/data/coaches.ts`.
- **Position Google Maps éditable (50)** : `mapsQuery` devient surchargeable par le gérant pour
  TOUS les clubs, fondateurs compris (le porteur peut renommer les fondateurs). Colonne
  `club_overrides.maps_query` + `upsert_club_override` (9ᵉ paramètre) ; `ClubInfo.mapsQuery` fusionné
  via `applyInfo` → `mapsUrl` ouvre la position saisie. ⚠️ la 50 change la signature de
  `upsert_club_override` : à coller AVANT le build (sinon l'enregistrement des infos club échoue).
- **Padelta d'abord** : `compareClubs` (data/clubs.ts) épingle Padelta en tête de toutes les
  listes joueurs (décision du porteur) ; les tris « Sponsorisé d'abord » restent prioritaires.
- **Matchs ouverts (45, modèle Playtomic)** : terrain bloqué direct par le créateur, places
  restantes rejoignables (`join_open_match` → participant 'accepted' + prénom dans `invited`,
  push au créateur — y compris au re-rejoint après un départ ; annulation par le créateur →
  push à tous les participants). La FONCTIONNALITÉ est sans frais — un futur Gold les ÉPINGLERA
  (jamais ne les verrouille) — mais l'UI ne dit plus « gratuit » (les joueurs croyaient le
  TERRAIN gratuit) : elle dit « le prix du terrain se partage entre les joueurs ».
  UI : toggle dans le tunnel + section `src/components/OpenMatches.tsx` (onglet Réserver).
- **Classement (46, remplace la 44)** : par **POINTS** gagnés dans l'app (modèle « Race » FIP —
  le niveau, plafonné à 7 et auto-déclaré, ne peut pas servir de rang) : 100 = tournoi officiel
  gagné (winner_user_id ancré), 10 = tournoi officiel joué, 3 = victoire de match confirmée,
  2 = partie jouée. `fetch_leaderboard`/`my_leaderboard_rank`, écran `/classement`.
- **Score de match (46, durci en 48, réglé en 49/audits 6-7)** : CHAQUE joueur du match saisit les
  sets de SON point de vue (`submit_match_score`) ; l'app calcule la forme CANONIQUE (score vu du
  vainqueur) et **désigne le vainqueur automatiquement**. RÈGLE ANTI-TRICHE : un match n'est validé
  que si un camp PERDANT reconnaît le score (une saisie « j'ai perdu » en miroir), OU si une saisie
  UNIQUE et GAGNANTE reste 48 h sans réponse ; le plafond de « je gagne » est `least(2, joueurs-1)`
  (recalé à l'audit 7 : `floor(joueurs/2)` laissait un 1v1 à 2 comptes valider deux « je gagne ») —
  au-delà, GELÉ. **Deux « je gagne » identiques ne valident donc jamais** (invariant restauré à
  l'audit 6 — voir `submit_match_score`, `fetch_my_match_scores`, `fetch_leaderboard`,
  `my_leaderboard_rank` et notify-club, tous alignés). `my_leaderboard_rank` renvoie 0 = « non
  classé » (≠ null = échec réseau, audit 7).
  Les +3 ne comptent que si la résa est encore 'booked' (pas « pas venu »). Contestation ouvrable
  au-delà de 14 j dès qu'une 1ʳᵉ saisie existe (la fenêtre 14 j ne borne que la 1ʳᵉ saisie).
  UI « Mes réservations » (`src/lib/matchResults.ts`), push via webhook **`match_results`**.
- **Modération UGC (51 + 53, audits 6-7)** : tout avis d'un autre joueur porte « Signaler » /
  « Bloquer » (`src/lib/moderation.ts` → `report_review` / `block_user`) ; chaque match ouvert
  d'un autre joueur porte « ⋮ » → Signaler (via le canal support) / Bloquer. Les comptes bloqués
  sont masqués via le MIROIR persisté `state.blockedUserIds` (chargé session + premier plan —
  plus d'état local réinitialisable par un échec réseau) ; côté serveur (53) un bloqué ne peut
  plus envoyer de demande d'ami ni rejoindre les matchs du bloqueur. L'OPÉRATEUR traite les
  signalements dans Demandes → « Avis signalés » (`fetch_review_reports`, `operator_delete_review`,
  `operator_dismiss_report`). Requis par l'App Store (1.2) et Google Play. Confidentialité (51) : le téléphone du créateur d'un **match ouvert** n'est plus
  stocké (trigger `strip_open_match_phone`) — il était récoltable en rejoignant chaque match.
- **Liens de téléchargement multi-plateformes (audit 6)** : l'app sort sur iOS ET Android. Les
  partages d'invitation/parrainage pointent vers `padelconnectci.com/get` (`DOWNLOAD_URL`), page
  qui route vers l'App Store ou Google Play selon l'appareil ; `/invite/*` et `/club/*` réécrivent
  vers cette page (site `_redirects`). App Links Android déclarés (`app.json` `intentFilters` +
  `site/assetlinks.json`, empreinte SHA-256 à compléter par le porteur).
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
  - avantages (badge, matchs épinglés, priorité tournois), jamais de verrou sur le cœur de l'app.
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
  - anti-collision de noms à la clôture), webhook `friend_requests`, notify-club redéployé
    (push des demandes d'ami renvoyées).
- **Audit n°3 (2026-07-02, ultracode)** : 4 agents spécialisés (matrice serveur↔app 31 RPC +
  21 tables, designer, testeur, planner) + workflow 50 agents (8 angles × sceptiques). Résultat :
  SQL `41_reservations_hardening` (plus de DELETE direct d'une résa + insertion forcée
  'booked'/non confirmée), tri-états réseau (ami introuvable ≠ hors-ligne), tarifs bornés à la
  saisie, `useTodayKey` (listes de jours recalées après minuit), zodiac en UTC, purge disque
  immédiate à la déconnexion, perfs (agrégats opérateur mémoïsés, tunnel de résa, planning club,
  historiques paginés), quick wins UX (guide gérant « 4 gestes », « Chercher des joueurs »,
  preuves de confiance, skeletons, EmptyState actionnables, maxWidth tablette 640/480).
- **Audits n°4 à n°6** appliqués (SQL 42 → 52, builds #36 → #45) ; **APNs réparé** (clé push créée
  par le porteur, liée sur EAS — les notifications partent réellement depuis le #45).
- **Audit n°7 (2026-07-03, 125 agents / 22 angles — le plus gros)** : 94 constats corrigés
  (11 HIGH, 39 MEDIUM, 44 LOW). Serveur : SQL `53_audit7_hardening` (blocages appliqués côté
  serveur, delete_account/delete_club complets, garde créneau-fermé/terrain-retiré à l'INSERT,
  anti double-occupation tournois avec verrous consultatifs, désinscription refusée après début,
  signalements d'avis dans l'Espace opérateur, `register_push_token`, revokes anon) + 49
  re-corrigée (plafond `least(2, joueurs-1)`, rang 0 = non classé). App : écritures honnêtes
  partout (horaires/terrains/offres/profil/suppression de tournoi), refreshMirror en UN setState
  (~17 → 1 re-render), miroir `blockedUserIds`, Signaler/Bloquer sur les matchs ouverts, textes
  score/annulation alignés sur la règle réelle, part par joueur sur l'effectif réel, resync
  ClubInfoCard (patch limité aux champs modifiés), accessibilité (toasts annoncés, labels,
  cibles 44 pt, scrims masqués), CGU/privacy complétées, docs stores recalées.
- **Serveur post-audit 7 ✅ FAIT (confirmé porteur, 2026-07-03)** : SQL `49` (re-corrigée) → `53`
  collées DANS L'ORDRE, notify-club redéployée, dossier `site/` re-déployé (privacy + /get, AASA ok)
  — voir docs/AUDIT-SERVEUR.md §0-SEXIES.
- **SQL serveur ✅ FAIT** : `54`→`64` **tous appliqués en base** (vérifié à distance le 2026-07-06,
  Management API). Il ne reste au porteur que : le lien Wave (Espace opérateur → Finances), le
  redéploiement de `notify-club` (compare HMAC en temps constant), FCM Android + empreinte SHA-256
  d'assetlinks (Android).
- **Webhook sécurisé ✅ FAIT (2026-07-06)** : `WEBHOOK_SECRET` posé dans les secrets des Edge
  Functions + en-tête `x-webhook-secret` sur les 8 webhooks + `notify-club` redéployée (le secret
  vit UNIQUEMENT côté Supabase, jamais dans le dépôt) — cf. docs/PUSH-SETUP.md §4bis.

### Chantier v2 (2026-07-04) — comptes club, web, Wave, stats, 1v1

Gros chantier « personne ne peut rivaliser », décidé et planifié avec le porteur. Fait
sur la branche de dev (build #48, mise à jour day-1 après approbation du #47) :
- **Comptes club ≠ joueur (Chantier 1, SQL 56)** : choix « Joueur / Je gère un club » à
  l'inscription (`onboarding.tsx`) ; état `accountType` ; profil « club en cours de validation »
  tant que `role≠'club'`. Réutilise `club_requests` + `approve_club_request` (trigger crée la
  demande d'office). L'opérateur valide dans « Demandes ».
- **Statistiques joueur (Chantier 6)** : écran `/statistiques` (rang, points, matchs gagnés,
  tournois, activité mensuelle `BarChart`). Aucun SQL. Lien depuis le profil.
- **1v1 (SQL 57)** : matchs ouverts à 2 joueurs en plus du 2v2. `reservations.open_capacity`
  (2|4) ; `fetch_open_matches`/`join_open_match` généralisés ; sélecteur de format dans le tunnel.
- **Site vitrine (Chantier 3)** : `site/index.html` refait (héros, fonctionnalités, 9 clubs réels,
  « Pour les clubs »), `site/cgu.html`, `assets/style.css`+`site.js` (FR/EN, menu, clubs), `og.svg`.
- **Espace Club & opérateur web (Chantiers 2 & 4)** : `npm run build:web` (export Expo web —
  build vérifié). Même code app+web, accès protégé par le rôle (pas d'URL secrète). Déploiement :
  `docs/ESPACE-CLUB-WEB.md` (Cloudflare Pages → `club.padelconnectci.com`).
- **Paiement Wave (Chantier 5, SQL 58)** : version MANUELLE. `tournament_config.wave_link`
  (`set_wave_link`), `competitions.payment_status` + `operator_confirm_tournament_payment`,
  `fetch_competitions` renvoie les 2. Organisateur : carte « Frais à régler » (ouvre le lien Wave)
  une fois le club validé ; opérateur : champ lien Wave + « Paiement reçu ». API Wave = plus tard.
- **Frais tournoi joueur** : défaut passé de 5 000 à **10 000 FCFA** (`helpers.ts`, `26`).
- **Reste à faire par le porteur (v2)** : SQL `56`→`60` **✅ appliqués en base** (avec `54`→`64`,
  vérifié le 2026-07-06). Il reste : coller le **lien de paiement Wave** dans Espace opérateur →
  Finances ; **re-déployer `site/`** (retrait commission/Wave du CGU) + le build web sur
  `club.padelconnectci.com` ; WhatsApp Business « PadelConnect ». **✅ FAIT** : l'e-mail pro
  `contact@padelconnectci.com` est actif (Cloudflare Email Routing → transfert vers
  `padelconnect.civ@gmail.com`, destination vérifiée le 2026-07-05) — vérifié via l'API Cloudflare.
  Améliorations « en plus » **livrées** : **image de résultat partageable** (carte Équipe A vs
  Équipe B, `ResultCard`/`shareImage`, modules natifs `react-native-view-shot` + `expo-sharing`
  ⇒ nouveau build requis) et **messages types WhatsApp** (`matchMessages`). Reste en idée : carte
  clubs app, etc.

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
- 🔒 **2 durcissements sécurité MEDIUM (audit tour 9) — GARDÉS POUR PLUS TARD (décision porteur
  2026-07-07)** : (1) `profiles.phone` non vérifié → dans les flux « par téléphone »
  (`grant_club_access_by_phone`, `club_add_coach`) un squatteur peut recevoir un rôle destiné à
  une victime PAS encore inscrite ; fix = OTP SMS (idéal) ou trigger `protect_phone` (fige le
  numéro, mais bloque l'édition légitime). (2) un compte **club** validé + un joueur complice
  peuvent forger +100 pts de classement via un tournoi bidon (`create_competition` club publié
  direct + `close_competition`) ; fix = exiger un minimum d'inscrits distincts avant d'attribuer
  points/niveau, ou plafond de tournois officiels/club/mois. Barrières actuelles : garde
  d'ambiguïté téléphone (victime déjà inscrite → refus) et validation manuelle des clubs par
  l'opérateur. Non bloquant pour le lancement. SQL prêt à écrire le jour où le porteur tranche.
- Autres post-lancement : vrai SMTP de confirmation, perf, éventuel kit `PlanningGrid`.

### Campagne d'audit v2 (2026-07-07) — 5 gros audits « chaque tour renforce le précédent » ✅

Demande porteur : 2 bugs signalés + **5 audits complets** (app, site, serveur, mails, code) avec
tous les agents en parallèle et vérification adversariale, puis build + mise EN LIGNE sur iPhone.
- **Bug #1 (site figé)** : `site/assets/site.js` ne lisait plus les données live → rendu DYNAMIQUE
  (`liveCourts`/`liveBlurb` dérivés de `club_config.courts`/`club_overrides.blurb`, badge « N clubs »
  réel). Vérifié live : l'override « Temple de Padel » + 2 terrains s'affichent (tour 1 & 3).
- **Bug #2 (modifs opérateur qui se réinitialisent)** : `WaveLink.tsx` resync render-phase
  (`syncedLink`, ne clobbe plus la saisie), `NewsEditor` toast au niveau provider, et surtout SQL
  **66** `upsert_club_override` ON CONFLICT préserve les colonnes non touchées (null=garde, ''=efface)
  → la description ne se perd plus. SQL **65** rend `set_tournament_fee`/`set_wave_link` idempotents.
- **Tour 4** : boucle de redirection `/get` (Cloudflare clean-URLs) réparée dans `site/_redirects`
  + perf planning gérant (`pastByWeek` O(n²)→O(n)).
- **Tour 5 (gate final)** : 4 agents adversariaux (app / serveur+DB live / site+mails / contrat
  app↔serveur) → **TOUT CLEAN**, aucun défaut restant : 65 & 66 byte-identiques en base, classe
  « perte de donnée RPC » refermée, 76 RPC client alignées sur les signatures live, convention
  réseau-null respectée, redirections 200 partout. Aucune correction nécessaire = gate vert.
- SQL en base : `65`, `66` **appliqués et vérifiés live** (Management API, projet …ccxij).
- **Téléphone UNIQUE (67, demande porteur 2026-07-07)** : un numéro = un seul compte (le porteur
  donne l'accès via le numéro). Unicité sur les **10 derniers chiffres** (même convention que
  l'appariement amis/coachs/clubs → `+225 07…` et `07…` = même numéro). `phone10(text)` immuable +
  **index unique partiel** `profiles_phone10_uniq` (garde-fou dur, toutes voies : inscription,
  édition profil, appel forgé, course concurrente) + garde `PHONE_TAKEN` dans `handle_new_user`
  (refus atomique avant l'insert) + RPC `phone_available` (UX : message net à l'inscription).
  Client : pré-check à l'inscription + détection 23505 à l'édition profil (`updateAccount` renvoie
  `phoneTaken`) → « Ce numéro est déjà utilisé par un autre compte. ». **Appliqué et vérifié live**
  (0 doublon, blocage prouvé sur données réelles en transaction annulée). ⚠️ côté CLIENT = **build
  suivant** (le #57 en revue applique déjà la règle SERVEUR, juste le message est moins fin).

### Créneaux à durée variable 1h/1h30 par terrain (68, demande porteur 2026-07-07) — ✅ CODE FAIT

Chantier « créneaux modulables 1h/1h30, horaires PAR TERRAIN » (détail archi en §9). Fait sur la
branche de dev en 5 lots (tsc 0 · lint 0 · test:logic vert · bundle eager OK) :
- **Lot 1** — logique PURE `src/lib/courtSchedule.ts` (overlap `[t,t+d)`, `canAddCourtSlot`,
  `resolveCourtSlots` rétrocompat) + tarifs 2 durées (`pricing.ts` : `price60Of`, `priceForSlot(...,d)`,
  `minPrice(club, offered)`) + tests (`courtSchedule`/`pricing`).
- **Lot 2** — SQL `68_creneaux_duree.sql` : contrainte d'exclusion GiST (23P01), `court_slots` jsonb,
  `duration_min`, `resolve_court_slots`, gardes réécrites en intervalle, `upsert_club_config`+p_court_slots,
  `request_lesson`+p_duration, `create_competition`+p_slot_durations, `fetch_competitions`/`fetch_open_matches`
  exposent les durées, leaderboard `duration_min*60000`. **Vérifié adversarial (9/9 assertions live annulées)**.
- **Lot 3** — store + dispo par intervalle (`availability.ts` `freeCourtSlotsAt`/`freeCourts`,
  `Reservation.durationMin`, `isPlayed` durée réelle, tranche `courtSlots` + action `setCourtSlots`,
  overlap dedup) + tests (`availability` neuf, `audit`/`ranges` réécrits).
- **Lots 4-5** — écrans : Espace Club (éditeur grille par terrain, 2 prix, planning une ligne/terrain,
  QuickBlock/BlockRangeForm), joueur (« Par heure »/fiche club groupent par DURÉE via puces prix),
  coach (prix en aval du terrain), tournois modulables (durée par créneau), agenda à la durée réelle.
- **Reste porteur (créneaux)** : ✅ FAIT — `68`→`72` appliqués en base, build #58→#61 soumis (a
  remplacé le #57). (Le token EAS/ASC vit chez le porteur, jamais dans le dépôt.)
- **Campagne d'audit créneaux (2026-07-11, jusqu'au tour BLANC) ✅** : 7 tours adversariaux
  (logique pure, contrat client↔serveur, UI Espace Club, consommation joueur/coach/tournoi,
  intégrité de données). Corrigés : 1 MEDIUM (fiche club n'affichait que le prix 1h30 → les 2
  durées quand le club les offre), 1 HIGH (écran de succès du tunnel guidé qui RE-DÉRIVAIT
  terrain/durée/prix depuis la dispo déjà mutée par la résa → instantané `booked` figé), et
  finitions (resolveCourtSlots `{}`≡null, gridBounds exclut les créneaux fermés, switchDuration
  signale une pause absorbée, toast 'busy' sur l'éditeur de grille). **Tours 6 & 7 = BLANCS**
  (2 agents indépendants, aucun défaut d'intégrité, aucune double-vente, rien d'exploitable via
  l'app). Miroir dispo client↔serveur prouvé EXACT (`[t,t+d)` = GiST `int8range`).
- **Connu, non bloquant (défense en profondeur, GARDÉ POUR PLUS TARD)** : `upsert_club_override`
  (SQL 66, déjà en base) borne le prix 1h30 mais PAS le nouveau `price60` (1h) — écart de parité
  §8. Non atteignable via l'app (`validateTiers` borne `price60` ET `price60 ≤ price` à la saisie)
  et le prix de résa reste borné par `reservations_price_guard` (SQL 40) à l'insert ; seul un appel
  forgé stockerait un `price60` hors bornes, impact purement cosmétique. Fix = ajouter la borne
  `price60` (+ `≤ price`) dans une future migration si le porteur y tient.

### Audit COMPLET (2026-07-11) — app + serveur + site + config + docs — ✅ CORRIGÉ

Demande porteur : audit de TOUT (backend, frontend, serveur/SQL, edge, UI, site, config, docs).
Planifié avec **Fable** (8 agents adversariaux en parallèle, chacun vérifiant ses constats),
appliqué avec **Opus**. **19 constats confirmés : 1 HIGH · 7 MEDIUM · 11 LOW.**
- **Corrigés côté CLIENT (prochain build)** : effacement d'un champ fiche club (WhatsApp/Maps/plages
  tarifaires) qui ne partait jamais au serveur → envoi de `''`/`[]` (marqueur d'effacement SQL 66,
  `ClubInfoCard`) ; crash de l'écran de succès du tunnel au passage de minuit → jour/heure/startsAt
  FIGÉS dans l'instantané `booked` (`reserver/[clubId]`) ; photo d'inscription jetée si 1ᵉʳ upload
  échoue → clé retirée seulement au succès (`AppContext`) ; demande d'ami d'un bloqué non purgée du
  miroir → purge dans `blockUserAccount` ; actu opérateur à lien invalide droppé en silence → refus
  avec message (`setOperatorNews` → `{ ok, error }`, `NewsEditor`) ; QuickBlock « Débloquer » sans
  retour d'erreur → attend le serveur ; lien Wave effacé non propagé → `''` vs `null` distingués
  (`competitionsServer`) ; inscription tournoi le jour J masquée côté UI (`competition/[id]`, garde
  `started`).
- **Corrigés côté SERVEUR → `73_audit_complet_hardening.sql` (À COLLER en base par le porteur)** :
  `link_participants` oppose désormais le blocage aux invitations de résa (M1) ; `respond_invitation`
  recalcule `invited` sous `FOR UPDATE` (M4, plus de TOCTOU surbooking) ; `delete_competition` refuse
  la suppression par l'organisateur d'un tournoi `published` avec inscrits ou frais impayés (M5) ;
  **trigger** `competitions_date_range_guard` BEFORE INSERT qui borne l'ÉTENDUE des dates
  (`end ≥ start`, `end − start ≤ 366 j`, cast réel de `date_key`) → un tournoi joueur forgé (dates
  absurdes) ne peut plus être inséré, donc plus de DoS de verrous quand le club le valide (M6).
  Résiduel de la 73 (boucles de verrous PRÉ-INSERT non bornées en étendue : branche 'club' de
  `create_competition` ET `block_range`) → FERMÉ par la 74 (ci-dessous). Idempotent, `search_path`
  figé. ✅ **Appliquée en base le 2026-07-11** (API Management, vérifiée : trigger + `for update` +
  garde `blocked_users`).
- **`74_audit_complet_closures.sql`** — ferme les LOW « appel forgé » que la 73 reportait (décision
  porteur) : `respond_lesson` verrouille par `coach:jour` (plus `coach:jour:heure`) ;
  `block_range` ET la branche 'club' de `create_competition` bornent l'ÉTENDUE des dates AVANT leur
  boucle de verrous ; **trigger** `club_config_court_slots_guard` exige `court_slots.d` NOMBRE 60/90 ;
  + M2 (phone, ci-dessous). Reproductions SQL BYTE-fidèles (respond_lesson, block_range,
  create_competition, handle_new_user) vérifiées par Fable. Idempotent, `search_path` figé.
  ✅ **Appliquée en base le 2026-07-11** (vérifiée : trigger court_slots + verrou coach:jour + bornes
  366 j + M2 fantôme ; pré-vérif « 0 court_slots forgé » OK).
- **M2 (fermé côté serveur, décision porteur → SQL 74)** : une inscription jamais confirmée squattait
  le numéro à vie (`handle_new_user` crée le profil avant confirmation e-mail, aucune récupération
  in-app). La `74` : `phone_available` ignore un compte fantôme (e-mail non confirmé > 24 h) et
  `handle_new_user` le PURGE (best-effort) avant de refuser un numéro réellement pris.
- **Docs recalées** : ce fichier (build 61, SQL 02→72, anti-recollage 68) ; `docs/PLAN-CRENEAUX-DUREE-VARIABLE.md`
  (numérotation « SQL 69 » périmée) ; `site/get.html` (canonical `/get`).

## 11. Où regarder

- `docs/PUSH-SETUP.md` — configuration des push & webhooks (étapes Dashboard).
- `docs/SERVEUR-*.md` — notes serveur (clubs, amis/boosts/fiabilité…).
- `src/store/AppContext.tsx` — cœur de l'état + tous les appels serveur.
- `src/data/clubs.ts` — les 9 clubs fondateurs + modèle Club.
- `src/data/coaches.ts` — annuaire des coachs (modèle `Coach`, vide au lancement) + écrans `src/app/coachs/`.
- `supabase/` — toutes les migrations (numérotées) et l'Edge Function.
