# Notifications push réelles (#38/#41) — guide de mise en route

Le **code de l'app est prêt** : à la connexion, l'appareil enregistre son *jeton de push Expo*
dans `profiles.expo_push_token` (cf. `src/lib/push.ts`). Il reste à activer **l'envoi** côté
serveur. Tout passe par l'**API Push d'Expo**, donc pas besoin de manipuler les certificats
Apple à la main — Expo route vers Apple (APNs) et Google (FCM).

## 1. Base de données (déjà fait si tu as lancé les SQL)

Exécuter **`supabase/16_push_token.sql`** (ajoute la colonne `expo_push_token`).

## 2. Clé de notifications Apple (APNs) — ⚠️ OBLIGATOIRE, à faire UNE FOIS (10 min, sans terminal)

> ✅ **Réglé** — la clé APNs a été créée par le porteur et liée sur EAS : les push sont vérifiés
> depuis le build **#45**. Les étapes ci-dessous restent comme référence (rien à refaire).

**Correction importante (2026-07-03)** : contrairement à ce que disait ce guide, la clé APNs
n'est PAS créée automatiquement — nos builds tournent en mode non-interactif, qui SAUTE cette
étape. Vérifié en direct via l'API Expo : `pushKey: null` → **Apple refuse toutes les
notifications** (la fonction dit « ok », Expo transmet, Apple jette). Tant que cette clé
n'existe pas, AUCUN push n'arrive sur iPhone (actus, réservations, demandes d'ami…).

### a. Créer la clé chez Apple (5 clics, dans le navigateur)

1. Va sur **developer.apple.com** → connecte-toi → **Account**.
2. **Certificates, Identifiers & Profiles** → menu **Keys** → bouton **+** (Create a key).
3. **Key Name** : `PadelConnect Push` → coche **Apple Push Notifications service (APNs)** →
   **Continue** → **Register**.
4. **Download** : tu obtiens un fichier **`AuthKey_XXXXXXXXXX.p8`** (garde-le précieusement,
   Apple ne le redonne JAMAIS) et note le **Key ID** affiché (10 caractères).

### b. Donner la clé à Expo (dans le navigateur aussi)

1. Va sur **expo.dev** → connecte-toi avec le compte **padelconnect-ci** → projet
   **padelconnect** → menu **Credentials**.
2. Onglet/section **iOS** → application **ci.padelco.app** → bloc **Push Key** →
   **Add a Push Key** (ou « Upload »).
3. Renseigne : le fichier **.p8** téléchargé, le **Key ID** noté, et le **Team ID Apple**
   (`R77YWZ9487`).
4. Enregistre. **Effet immédiat, sans nouveau build ni mise à jour de l'app** : les jetons déjà
   enregistrés par les téléphones se mettent à recevoir les notifications.

### c. Vérifier (1 min)

Publie une actu (nouveau texte, case « notification » cochée) → elle doit arriver sur ton
téléphone, app fermée. Sinon, dis-le à l'assistant : il revérifiera `pushKey` via l'API Expo.

> **Android (pour la sortie Google Play)** : même principe côté Google — il faudra ajouter les
> identifiants **FCM** dans la même page Credentials, section Android, au moment du build
> Android. Sinon aucun push n'arrivera sur les téléphones Android.

## 3. Déployer la fonction d'envoi (SANS terminal — Dashboard)

La fonction est dans `supabase/functions/notify-club/`. On la déploie depuis le **Dashboard**,
pas en ligne de commande :

1. Dashboard Supabase → **Edge Functions** → clique **notify-club**.
2. Bouton **Edit** (éditeur de code).
3. **Tout sélectionner / supprimer**, puis **coller** le contenu à jour de
   `supabase/functions/notify-club/index.ts` (l'assistant peut te le fournir prêt à coller).
4. **Deploy**.

(Les variables `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont injectées automatiquement
par Supabase dans la fonction — rien à configurer.)

## 4. Brancher les déclencheurs (Database Webhooks)

Dashboard Supabase → **Database → Webhooks** → *Create a new hook* :

- **Réservation → club** ET **Confirmation → joueur** ET **Annulation → club** : table
  `reservations`, événements **INSERT _et_ UPDATE** (coche les deux) → appelle la fonction
  `notify-club`.
  - INSERT = nouvelle réservation → notifie le **gérant** du club.
  - UPDATE = le gérant confirme (case `club_confirmed`) → notifie le **joueur** (« Réservation
    confirmée ✅ »).
  - UPDATE = le joueur annule (`status → cancelled`, depuis `booked`) → notifie le **gérant**
    du club (« Réservation annulée »).
  - UPDATE = le **club** annule pour chevauchement hors app (`status → club_cancelled`, depuis
    `booked`, 75) → notifie le **joueur** ET les participants (« Créneau annulé par le club »,
    avec motif + proposition d'alternative).
  - ⚠️ Si tu avais déjà créé le hook `reservations` en INSERT seul, **édite-le** pour cocher
    aussi **UPDATE** (sinon les notifs de confirmation et d'annulation ne partiront pas).
    ✅ Corrigé en base le 2026-07-16 : le hook `reservations` écoutait INSERT SEUL (confirmation
    + annulations joueur/club ne partaient pas) et `reservation_participants` UPDATE SEUL
    (invitations/rejoint-match muets) → les deux écoutent désormais **INSERT + UPDATE**.
- **Invitation → invité** ET **Invitation acceptée → auteur** (notifs sociales) : table
  `reservation_participants`, événements **INSERT _et_ UPDATE** (coche les deux) → même
  fonction `notify-club`.
  - INSERT (un ami est rattaché à une résa partagée) → notifie l'**invité** (« Invitation à
    jouer 🎾 »).
  - UPDATE `→ accepted` → notifie l'**auteur** de la réservation (« Invitation acceptée ✅ »).
  - ⚠️ Si tu avais créé ce hook en UPDATE seul, **édite-le** pour cocher aussi **INSERT**
    (sinon l'invité ne reçoit jamais rien).
- **Tournois** : table `competitions`, événements **INSERT _et_ UPDATE** (coche les deux) →
  même fonction `notify-club`.
  - INSERT d'un tournoi **joueur** (en attente) → notifie le **gérant** du club hôte (« à
    valider »).
  - UPDATE `pending → published` (le club valide) → notifie l'**organisateur** (« Tournoi
    validé ✅ ») **et l'opérateur** (« frais à encaisser », montant Wave) — on ne facture donc
    que les tournois réellement confirmés.
  - UPDATE `pending → rejected` (le club refuse) → notifie l'**organisateur** (« Tournoi non
    retenu »).
- **Demandes d'ami** (notif sociale) : table `friend_requests`, événements **INSERT _et_
  UPDATE** (coche les deux) → même fonction `notify-club`.
  - INSERT d'une demande (`pending`) → notifie le **destinataire** (« Nouvelle demande d'ami »).
  - UPDATE `→ pending` (demande **renvoyée** après un refus — le serveur fait un UPDATE, pas un
    INSERT) → re-notifie le **destinataire** (« Nouvelle demande d'ami »). C'est pour CE cas
    aussi qu'il faut cocher UPDATE, pas seulement pour l'acceptation.
  - UPDATE `→ accepted` (la personne accepte) → notifie l'**expéditeur** (« Demande acceptée »).
- **Cours avec un coach** : table `lessons`, événements **INSERT _et_ UPDATE** (coche les
  deux) → même fonction `notify-club`.
  - INSERT d'une demande (`pending`) → notifie le **coach** (« Nouvelle demande de cours 🎾 »).
  - UPDATE `→ accepted` (le coach accepte, le terrain est réservé) → notifie l'**élève**
    (« Cours accepté ✅ »).
  - UPDATE `→ declined` (le coach refuse — ou est retiré par son club avec des demandes en
    attente, refusées d'office) → notifie l'**élève** (« Cours non disponible »).
  - UPDATE `→ cancelled` → notifie le **coach** (cours annulé par l'élève / demande retirée).
- **Promotion coach** : table `coaches`, événements **INSERT _et_ UPDATE** (coche les deux) →
  même fonction `notify-club`.
  - INSERT (le club déclare un coach) ou UPDATE `active → true` (re-promotion) → notifie le
    **joueur promu** (« Tu es maintenant coach 🎾 » — le tap ouvre son Espace Coach).
- **Scores de match** : table `match_results`, événements **INSERT _et_ UPDATE** (coche les
  deux) → même fonction `notify-club`.
  - INSERT d'une première saisie → notifie les **autres joueurs** du match (score à confirmer).
  - UPDATE qui valide le match (la règle du serveur est atteinte) → notifie **les joueurs**
    (« Match validé »).
  - UPDATE avec des saisies **en désaccord** → notifie les joueurs (le score est à revoir).
- **Actu opérateur** : table `operator_news`, événements **INSERT _et_ UPDATE** (coche les
  deux) → même fonction `notify-club`.
  - INSERT ou UPDATE d'une actu dont la case **« Envoyer aussi en notification »** était cochée
    (colonne `push`) → push d'actu à tous les joueurs. Case décochée = aucun push.
  - Garde **anti-doublon** sur `news_id` : la même actu ne part jamais deux fois.

La fonction lit la table + le type d'événement et envoie au bon destinataire (gérant du club,
joueur, auteur de la réservation, opérateur, organisateur du tournoi, ami invité, coach ou élève).
**Au total, 8 webhooks** doivent exister : `reservations`, `reservation_participants`,
`competitions`, `friend_requests`, `lessons`, `coaches`, `match_results`, `operator_news`.

## 4 bis. ✅ FAIT (2026-07-06) — Webhook sécurisé par secret

La fonction `notify-club` exige un secret : sans lui, n'importe qui connaissant l'URL (la clé
publique est dans l'app) pouvait **envoyer de faux push aux gérants** avec un contenu arbitraire
(risque de phishing : « Réservation annulée, appelez ce numéro »). Un audit l'a confirmé comme
faille réelle. **Configuré par le porteur le 2026-07-06** :
1. `WEBHOOK_SECRET` posé dans les **secrets des Edge Functions**
   (`…/dashboard/project/<ref>/functions/secrets` → « Add new secret »). Valeur aléatoire, hors dépôt.
2. En-tête HTTP `x-webhook-secret` (même valeur) ajouté aux **8** Database Webhooks
   (`reservations`, `reservation_participants`, `competitions`, `friend_requests`, `lessons`,
   `coaches`, `match_results`, `operator_news`).
3. `notify-club` redéployée.

Comportement : tant que `WEBHOOK_SECRET` n'est pas défini, la fonction marche comme avant (compat) ;
une fois défini, tout appel sans le bon en-tête reçoit **401**. ⚠️ Si tu ajoutes un 9ᵉ webhook plus
tard, pense à lui mettre l'en-tête, sinon ses push seront bloqués.

## 5. Tester

1. Installe un **build EAS** sur un vrai téléphone (les push ne marchent pas dans le
   simulateur ni dans Expo Go).
2. Connecte-toi avec un compte **gérant** d'un club, accepte la permission notifications.
3. Avec un autre compte joueur, réserve un créneau dans ce club → le gérant reçoit le push.

## Notes

- Si un compte n'a pas accepté les notifications, `expo_push_token` reste vide et la fonction
  l'ignore simplement (aucune erreur).
- Les **rappels de match** (avant le créneau) restent des notifications *locales* (déjà en
  place, sans serveur) — ce guide concerne uniquement les push *à distance*.
