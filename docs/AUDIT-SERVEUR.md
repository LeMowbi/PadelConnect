# Audit — actions serveur (sans terminal)

## 0) NOUVEAU (2026-07-02/03) — SQL `42` à `47` + notify-club + 2 webhooks (8 min) — ⏳ À FAIRE

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

État au 2026-07-02 : les migrations `30 → 36` sont appliquées, `notify-club` est redéployée
(confirmé par le porteur). **Reste à faire : le §1 (coachs & photos, avec la 37 au passage) —
puis, optionnel, le §3.**

---

## 1) Activer « Coachs & cours » + photos club (10 min) — ⏳ À FAIRE

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
   (`reservations`, `reservation_participants`, `competitions`, `friend_requests`, `lessons`) :
   **Edit** → **HTTP Headers** → ajoute **`x-webhook-secret`** = **le même secret** → **Save**.
4. Vérifie : une action qui envoie un push (ex. réservation de test) → la notification arrive
   toujours. Si plus rien n'arrive, un webhook n'a pas le bon en-tête.

> Astuce : garde le secret en lieu sûr (le même sur la fonction ET sur tous les webhooks).

---

## Historique (déjà fait, confirmé le 2026-07-01/02)

- ✅ Migrations `30` → `36` appliquées (dont `34_level_integrity` anti-triche niveau et
  `36_audit_hardening` : niveau borné [1,7] à l'inscription + anti-collision de noms).
- ✅ Edge Function `notify-club` redéployée (push des demandes d'ami renvoyées après refus).
- ✅ Webhook `friend_requests` branché (INSERT + UPDATE).
