# Audit — actions serveur (sans terminal)

> ✅ **À JOUR au 2026-08-14 — plus rien à coller ici.** TOUT le SQL `02`→`78` est **appliqué en
> base** (Management API), `notify-club` est déployée (v32 — push gérant avec nom du club), et les 8 Database Webhooks écoutent
> **INSERT + UPDATE**. Les sections datées ci-dessous (« ⏳ À FAIRE » d'avant le 2026-07-06) sont
> un HISTORIQUE conservé pour la trace — elles ne sont plus des actions en attente. Reste au
> porteur (hors SQL) : lien Wave, FCM Android + empreinte SHA-256 d'assetlinks.

## 0-OCTIES) MULTI-CLUBS (2026-07-03) — coller SQL `55` (1 min) — ⏳ À FAIRE

Un même compte (même numéro) peut désormais **gérer plusieurs clubs** (demande porteur) :
tu donnes l'accès gérant club par club depuis ton Espace opérateur (un 2ᵉ club **s'ajoute**
au lieu de remplacer le premier), et le gérant **bascule de club** depuis son Espace Club
(section « Club géré »). « Retirer l'accès » retire tous ses clubs d'un coup.

1. Dashboard Supabase → **SQL Editor** → **New query** → ouvre `supabase/55_multi_clubs.sql`
   du dépôt → copie **tout** → colle → **Run** (« Success. No rows returned »). Idempotente,
   et elle reprend automatiquement les gérants actuels (chacun garde son club).

À coller **APRÈS la 54** et **AVANT d'installer le build #47** (sans elle, donner un 2ᵉ club
continue de REMPLACER le premier, et le sélecteur de l'Espace Club reste vide).
Aucun webhook, aucun redéploiement de notify-club.

---

## 0-SEPTIES) CRÉNEAUX MODULABLES (2026-07-03) — coller SQL `54` (1 min) — ⏳ À FAIRE

Trois nouveautés pour les clubs (demande porteur) : **fermer un terrain sur une période**
(travaux, événement…), **grille d'horaires libre** (ajouter/retirer n'importe quel créneau),
et **fermetures récurrentes par terrain** (« Terrain 1 réservé aux cours à 18h00 »).

1. Dashboard Supabase → **SQL Editor** → **New query** → ouvre `supabase/54_creneaux_modulables.sql`
   du dépôt → copie **tout** → colle → **Run** (« Success. No rows returned »). Idempotente.

⚠️ **Colle la 54 APRÈS la 53 et AVANT d'installer le build #47** : elle change la fonction
d'enregistrement de la config club — sans elle, l'enregistrement des horaires/terrains depuis
le nouveau build échouerait (« Enregistrement impossible »). Aucun webhook, aucun redéploiement
de notify-club ici.

---

## 0-SEXIES) AUDIT n°7 (2026-07-03) — recoller `49`, coller `50` → `53`, redéployer notify-club — ✅ FAIT (confirmé porteur, 2026-07-03)

Le plus gros audit du projet (125 vérifications croisées) avant la sortie stores. Cette section
REMPLACE le 0-QUINQUIES ci-dessous (mêmes étapes + la nouvelle `53`). Dans **SQL Editor**, colle
et **Run** dans CET ORDRE (chaque fichier est idempotent — le recoller est sans risque) :

1. **Recoller `supabase/49_audit5_hardening.sql`** (re-corrigé à l'audit n°7) : anti-triche du
   score verrouillé (deux « je gagne » ne valident jamais un match) **et** le classement sait
   maintenant dire « non classé » (l'écran n'affiche plus un ancien rang périmé).
2. Coller **`supabase/50_club_maps_query.sql`** (position Google Maps éditable).
3. Coller **`supabase/51_moderation.sql`** (signaler un avis / bloquer un joueur — exigé stores).
4. Coller **`supabase/52_tournoi_refus_commente.sql`** (motif de refus d'un tournoi).
5. Coller **`supabase/53_audit7_hardening.sql`** — la grosse migration de l'audit n°7 :
   - un joueur **bloqué** ne peut plus t'envoyer de demande d'ami ni rejoindre tes matchs ;
   - **suppression de compte** complète (photo effacée, résas à venir annulées, clubs prévenus) ;
   - le serveur refuse une résa sur un **créneau fermé** ou un **terrain retiré** ;
   - plus de **double occupation** tournoi-vs-tournoi ni tournoi-vs-créneau bloqué ;
   - désinscription d'un tournoi **refusée une fois qu'il a commencé** (anti-esquive du −0.25) ;
   - `delete_club` nettoie TOUT (avis, boosts, coachs, demandes de cours) ;
   - les **signalements d'avis** arrivent dans ton Espace opérateur (onglet Demandes) ;
   - un cours de coach ne peut plus être « ouvert » en match ouvert ;
   - le **jeton de notification** suit le compte connecté (bascule de compte sur un téléphone) ;
   - les lectures « communauté » (matchs ouverts, classement, coachs, tournois) exigent un compte.
6. **Edge Functions → notify-club → Edit** → recoller **tout**
   `supabase/functions/notify-club/index.ts` → **Deploy** (nom du club fondateur dans le push
   « Tu es coach », push « un joueur a quitté ton match », règle de score alignée).

Aucun nouveau webhook. Ordre : **49 → 50 → 51 → 52 → 53, puis notify-club**.
⚠️ À coller AVANT d'installer le build #46 (la 50 change une fonction que l'app appelle).

---

## 0-QUINQUIES) AUDIT n°6 (2026-07-03) — recoller `49`, coller `50` + `51`, redéployer notify-club — ✅ REMPLACÉ PAR LE 0-SEXIES

Dernier audit avant la sortie stores. Côté serveur :

1. **Recoller `supabase/49_audit5_hardening.sql`** (corrigé) : l'anti-triche du score est renforcé —
   **deux « je gagne » ne valident plus jamais un match** sans qu'un camp perdant reconnaisse le
   score (sinon deux perdants complices se créditaient chacun +3). Idempotente : la recoller est sans
   risque même si tu l'avais déjà passée.
2. Coller **`supabase/50_club_maps_query.sql`** (position Google Maps éditable — voir ci-dessous).
3. Coller **`supabase/51_moderation.sql`** : signaler un avis / bloquer un joueur (exigé par les
   stores) + **confidentialité des matchs ouverts** (on ne stocke plus le numéro du créateur).
4. Coller **`supabase/52_tournoi_refus_commente.sql`** : quand tu (ou un club) refuses un tournoi
   joueur, un **motif** peut être joint (« ces créneaux sont pris — possible du 12 au 14 après
   18h ») — l'organisateur le voit sur sa fiche et dans la notification, puis peut supprimer son
   tournoi refusé et le recréer.
5. **Edge Functions → notify-club → Edit** → recoller **tout** `supabase/functions/notify-club/index.ts`
   → **Deploy** (la notif « Match validé » suit désormais exactement la règle du serveur, et la
   notif de refus de tournoi porte le motif).

Aucun nouveau webhook. Ordre conseillé : 49 → 50 → 51 → 52, puis notify-club.

---

## 0-QUATER) Horaires modulables + position Maps (2026-07-03) — coller SQL `50` (1 min) — ✅ FAIT (confirmé porteur, 2026-07-03)

Chaque club règle **ses propres horaires d'ouverture** (l'app découpe la plage en créneaux de 1h30)
et peut **corriger sa position Google Maps** — y compris les 9 clubs fondateurs (utile quand tu
renommes un club). Les horaires ne demandent **aucune** action serveur (déjà stockés dans
`club_config.slots`). La position Maps, elle, ajoute **une seule** migration :

1. Dashboard Supabase → **SQL Editor** → **New query** → ouvre `supabase/50_club_maps_query.sql`
   du dépôt → copie **tout** → colle → **Run** (« Success. No rows returned »). Elle ajoute la
   colonne `maps_query` aux surcharges de page et l'expose dans `upsert_club_override`. Idempotente.

⚠️ **Colle la 50 AVANT (ou en même temps que) la nouvelle version de l'app.** Tant qu'elle n'est
pas passée, l'ancienne fonction serveur (8 paramètres) ne reconnaît pas le nouveau champ et
l'enregistrement des **infos du club** échouerait (« Enregistrement impossible »). Une fois collée,
tout rentre dans l'ordre. Aucun webhook, aucun redéploiement de notify-club ici.

---

## 0-TER) AUDIT n°5 (2026-07-03) — coller SQL `49` + redéployer notify-club (3 min) — ✅ FAIT (confirmé porteur, 2026-07-03)

Nouvel audit complet. Côté serveur, **une migration à coller** + **notify-club à redéployer** :

1. Dashboard Supabase → **SQL Editor** → ouvre `supabase/49_audit5_hardening.sql` → copie
   **tout** → colle → **Run** (« Success. No rows returned »). Elle corrige : le **score d'un
   match en double** (2v2) qui n'était jamais validé quand les deux gagnants saisissaient ;
   `respond_invitation` rendu **idempotent** (un double refus ne fausse plus l'effectif) ; le
   **classement** (le niveau ne départage plus, les 0 point ne s'affichent plus) ; et les
   **cours** (un plafond atteint par l'élève renvoie un message honnête). Idempotente.
2. Dashboard → **Edge Functions** → **notify-club** → **Edit** → recolle **tout**
   `supabase/functions/notify-club/index.ts` → **Deploy** (anti-phishing sur le push d'actu :
   le texte vient désormais de la base, jamais d'un appel forgé ; et plus de « Score à saisir »
   en double quand le 1ᵉʳ saisisseur corrige son score).

⚠️ Colle la 49 APRÈS la 48 (elle s'appuie dessus). Aucun nouveau webhook à créer.

---

## 0-BIS) AUDIT n°4 (2026-07-03) — coller SQL `48` + redéployer notify-club (3 min) — ✅ FAIT (porteur)

Un audit complet (workflow multi-agents) a trouvé des correctifs. Côté serveur, **une seule
migration à coller** et **notify-club à redéployer** :

1. Dashboard Supabase → **SQL Editor** → **New query** → ouvre `supabase/48_audit4_hardening.sql`
   du dépôt → copie **tout** → colle → **Run**. Attendu : « Success. No rows returned ».
   (Elle corrige d'un coup : les **tournois officiels PadelConnect** qui échouaient toujours à la
   création — contrainte trop stricte ; le **classement infalsifiable** — un perdant ne peut plus
   se déclarer vainqueur ; la **double-réservation de coach** ; le fait de **quitter/fermer un
   match ouvert** ; et quelques bornes anti-triche. Idempotente, rejouable sans risque.)
2. Dashboard → **Edge Functions** → **notify-club** → **Edit** → recolle **tout**
   `supabase/functions/notify-club/index.ts` → **Deploy** (moins de push en double, envoi d'actu
   en tranches pour ne plus échouer au-delà de ~100 joueurs).
   (Aucun NOUVEAU webhook à créer ici — ceux de la section 0 suffisent.)

⚠️ Si tu n'as pas ENCORE fait la section 0 ci-dessous (SQL 42→47 + webhooks match_results et
operator_news), fais-la D'ABORD, puis colle la 48.

---

## 0) NOUVEAU (2026-07-02/03) — SQL `42` à `47` + notify-club + 2 webhooks (8 min) — ✅ FAIT (confirmé porteur, 2026-07-03)

### a. Coller les migrations `42`, `43`, `44`, `45`, `46` puis `47` (dans cet ordre)

1. Dashboard Supabase → **SQL Editor** → **New query**.
2. `supabase/42_club_coach_price.sql` (le club fixe le tarif du cours de ses coachs) :
   copie **tout** → colle → **Run**.
3. `supabase/43_padelconnect_tournaments.sql` (tournois officiels PadelConnect : créés par
   toi EN TANT QUE PadelConnect, validés par le club hôte dans son Espace Club) :
   copie **tout** → colle → **Run**.
4. `supabase/44_leaderboard_cours.sql` (classement général des joueurs + annuaire des
   coachs réservables pour l'écran « Réserver un cours ») : copie **tout** → colle → **Run**.
5. `supabase/45_open_matches.sql` (MATCHS OUVERTS façon Playtomic : un joueur réserve son
   terrain et les autres peuvent rejoindre les places restantes) : copie **tout** → colle → **Run**.
6. `supabase/46_leaderboard_points.sql` (classement **par POINTS** — le niveau plafonné à 7
   ne peut pas servir de rang — + **score de match** : CHAQUE joueur saisit les sets, l'app
   désigne le vainqueur automatiquement dès que les saisies concordent ; victoire = +3 pts).
   **Même si tu as déjà collé la 44** (ou une version précédente de la 46), colle celle-ci :
   elle REMPLACE proprement l'ancien classement (c'est prévu, ça ne casse rien).
7. `supabase/47_actu_push.sql` (case « Envoyer aussi en notification » quand tu publies une
   actu — le push aux joueurs devient un choix, actu par actu).
   Attendu à chaque fois : « Success. No rows returned ».

### b. Redéployer `notify-club` (push matchs ouverts + scores de match + actus)

1. Dashboard → **Edge Functions** → **notify-club** → **Edit**.
2. Remplace tout le code par `supabase/functions/notify-club/index.ts` du dépôt → **Deploy**.

### c. Créer les webhooks « match_results » et « operator_news »

1. Dashboard → **Database** → **Webhooks** → **Create a new hook**.
2. **Name** : `match_results` · **Table** : `public.match_results` · **Events** : coche
   **Insert** ET **Update**.
3. **Type** : Supabase Edge Functions → **notify-club** (mêmes réglages que les webhooks
   existants) → **Create**.
4. Recommence : **Name** : `operator_news` · **Table** : `public.operator_news` ·
   **Events** : **Insert** ET **Update** → **notify-club** → **Create**.
   (Sans lui, la case « Envoyer aussi en notification » de ton éditeur d'actu n'enverra rien.
   Le webhook `reservation_participants` existe déjà — rien d'autre à créer.)

---

État au 2026-07-03 (confirmé par le porteur) : les migrations `30 → 53` sont appliquées et
`notify-club` est redéployée.

**Reste à coller (v2, DANS CET ORDRE) — voir la liste cochable dans `docs/CHECKLIST-STORES.md` §a :**
`54` (créneaux modulables) → `55` (multi-clubs) → `56` (comptes club) → `57` (matchs 1v1) →
`58` (paiement Wave). Puis, dans l'app : **Espace opérateur → Finances → coller le lien Wave**.
Ces cinq fichiers sont idempotents (relançables sans risque).

---

## 1) Activer « Coachs & cours » + photos club (10 min) — ✅ FAIT (confirmé porteur, 2026-07-03)

La nouvelle version de l'app permet : photo « de profil » du club + une photo par terrain,
et la **réservation de cours avec un coach** (le club déclare ses coachs ; le terrain n'est
réservé que quand le coach accepte ; le club confirme ensuite comme d'habitude — ta commission
sur le terrain ne change pas).

### a. Coller les migrations `37`, `38`, `39`, `40` puis `41` (dans cet ordre)

1. Dashboard Supabase → **SQL Editor** → **New query**.
2. Ouvre `supabase/37_audit2_hardening.sql` du dépôt, copie **tout** → colle → **Run**.
   (Si tu l'avais déjà passée, la relancer ne casse rien : elle est idempotente.)
3. Même chose avec `supabase/38_coaches_lessons.sql` : copie **tout** → colle → **Run**.
4. Même chose avec `supabase/39_ratings_diagnostics.sql` (notes moyennes sur les cartes +
   carte « Santé de l'app » de ton Espace opérateur) : copie **tout** → colle → **Run**.
5. Même chose avec `supabase/40_price_guard.sql` (garde-fou anti-falsification du prix des
   réservations — protège ta commission) : copie **tout** → colle → **Run**.
6. Même chose avec `supabase/41_reservations_hardening.sql` (ferme deux portes dérobées :
   plus de suppression directe d'une réservation — l'annulation passe forcément par la
   règle des 5 h — et plus d'auto-confirmation « club » forgée) : copie **tout** → colle → **Run**.
   Attendu à chaque fois : « Success. No rows returned ».

### b. Redéployer la fonction `notify-club` (push des cours)

1. Dashboard → **Edge Functions** → **notify-club** → **Edit**.
2. Remplace tout le code par le contenu de `supabase/functions/notify-club/index.ts` du dépôt.
3. **Deploy**. (La fonction envoie maintenant aussi : « Nouvelle demande de cours 🎾 » au coach,
   « Cours accepté ✅ » / « Cours non disponible » à l'élève.)

### c. Créer les webhooks « lessons » et « coaches »

1. Dashboard → **Database** → **Webhooks** → **Create a new hook**.
2. **Name** : `lessons` · **Table** : `public.lessons` · **Events** : coche **Insert** ET **Update**.
3. **Type** : Supabase Edge Functions → **notify-club** (mêmes réglages que les webhooks
   existants `reservations`, `friend_requests`…). → **Create**.
4. Recommence pour le second : **Name** : `coaches` · **Table** : `public.coaches` ·
   **Events** : **Insert** ET **Update** → **notify-club** → **Create**.
   (Il annonce au joueur promu « Tu es maintenant coach 🎾 » — sinon il ne découvre son
   Espace Coach que par hasard.)
5. (Si tu as déjà posé `WEBHOOK_SECRET` (§3), ajoute aussi l'en-tête `x-webhook-secret`
   à ces deux webhooks.)

### d. Vérifier (2 min)

- Espace Club → **Mon club** → carte **« Coachs réservables »** : déclare un compte de test
  par son numéro → il voit « Espace Coach » dans son Profil.
- Avec un autre compte : fiche du club → « Réserver un cours » → envoie une demande →
  le coach reçoit le push, accepte → le terrain apparaît réservé (« Cours avec X »)
  dans le planning du club, à confirmer comme d'habitude.

---

## 2) Rappel — ce que corrige la migration `37_audit2_hardening.sql`

- **Avis des invités** : un ami invité qui a accepté et joué peut noter le club
  (avant, l'app le proposait mais le serveur refusait systématiquement).
- **Anti double-occupation** : un club ne peut plus créer/valider un tournoi par-dessus des
  créneaux déjà réservés par des joueurs.

---

## 3) (Recommandé, quand tu veux) Sécuriser le webhook push (3 min)

Tant qu'aucun secret n'est posé, **n'importe qui** connaissant l'URL de la fonction peut
déclencher des notifications. Le code de la fonction gère déjà le secret : dès qu'il est posé,
il devient **obligatoire** — rien à redéployer.

**Étapes :**

1. Choisis un secret (longue suite aléatoire, ex. générée par un gestionnaire de mots de passe).
2. Dashboard → **Edge Functions** → **notify-club** → **Settings** (ou « Secrets ») → ajoute :
   **Nom** `WEBHOOK_SECRET`, **Valeur** = ton secret → **Save**.
3. Dashboard → **Database → Webhooks** → pour **chaque** webhook qui appelle `notify-club`
   — les **8** : `reservations`, `reservation_participants`, `competitions`, `friend_requests`,
   `lessons`, `coaches`, `match_results`, `operator_news` (en oublier un = couper sa famille de
   push) : **Edit** → **HTTP Headers** → ajoute **`x-webhook-secret`** = **le même secret** → **Save**.
4. Vérifie : une action qui envoie un push (ex. réservation de test) → la notification arrive
   toujours. Si plus rien n'arrive, un webhook n'a pas le bon en-tête.

> Astuce : garde le secret en lieu sûr (le même sur la fonction ET sur tous les webhooks).

---

## Historique (déjà fait, confirmé le 2026-07-01/02)

- ✅ Migrations `30` → `36` appliquées (dont `34_level_integrity` anti-triche niveau et
  `36_audit_hardening` : niveau borné [1,7] à l'inscription + anti-collision de noms).
- ✅ Edge Function `notify-club` redéployée (push des demandes d'ami renvoyées après refus).
- ✅ Webhook `friend_requests` branché (INSERT + UPDATE).
