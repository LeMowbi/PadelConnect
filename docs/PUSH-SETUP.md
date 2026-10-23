# Notifications push réelles (#38/#41) — guide de mise en route

Le **code de l'app est prêt** : à la connexion, l'appareil enregistre son _jeton de push Expo_
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

Dashboard Supabase → **Database → Webhooks** → _Create a new hook_ :

- **Réservation → club** ET **Confirmation → joueur** ET **Annulation → club** : table
  `reservations`, événements **INSERT _et_ UPDATE** (coche les deux) → appelle la fonction
  `notify-club`.
  - INSERT = nouvelle réservation → notifie le **gérant** du club (statut relu d'abord, v49 : une
    résa déjà annulée à l'arrivée du webhook ne pousse plus rien).
  - UPDATE = le gérant confirme (case `club_confirmed`) → notifie le **joueur** (« Réservation
    confirmée ✅ »).
  - UPDATE = la résa n'a plus lieu (`status → cancelled`, depuis `booked` — annulation joueur,
    mais aussi `delete_club` : textes NEUTRES) → notifie le **gérant** du club (« Réservation
    annulée ») et les **participants** (« Match annulé ») — et alerte la **liste d'attente** du
    créneau libéré (81). Club retiré de PadelConnect (marqueur `cancel_reason = 'club_deleted'`, 97) → l'**auteur** reçoit aussi « Ton créneau … n'a plus lieu ». Créateur qui supprime son
    compte (participants déjà effacés par la cascade) → les joueurs sont retrouvés dans
    `invited` (v49).
  - UPDATE `no_show → booked` (87, un « pas venu » dé-marqué) → notifie le **joueur**
    (« Réservation rétablie ✅ ») — résa SIMPLE seulement : un cours rattaché passe par la branche
    `lessons` (pas de doublon). Transition produite par le bouton gérant « Annuler l’absence »
    (Espace Club → Réservations → Absences, confirmation « Rétablir la réservation »).
  - UPDATE = le **club** annule (`status → club_cancelled`, depuis `booked`, 75 — pluie, panne,
    chevauchement hors app…) → notifie le **joueur** (« {club} a dû annuler ton créneau », motif +
    proposition d'alternative) ET les participants (texte neutre, sans motif). Pour un **cours** :
    jamais de proposition (« redemande un créneau à ton coach ») ; cours annulé **par le coach**
    (96, `lessons.cancelled_by = 'coach'`) → push dédié à l'élève « Cours annulé par ton coach » ;
    cours d'un **coach supprimé** (97) → élèves des cours collectifs relus dans
    `lesson_cancel_notices`. Si le créneau est réellement **libéré** (aucune fermeture posée —
    voies coach), le gérant et la liste d'attente sont prévenus.
  - UPDATE `booked → no_show` (le club marque « pas venu », borné au créneau + 48 h, 96) →
    notifie le **créateur** (« Absence signalée par le club — une erreur ? Contacte le club »).
  - ⚠️ Si tu avais déjà créé le hook `reservations` en INSERT seul, **édite-le** pour cocher
    aussi **UPDATE** (sinon les notifs de confirmation et d'annulation ne partiront pas).
    ✅ Corrigé en base le 2026-07-16 : le hook `reservations` écoutait INSERT SEUL (confirmation
    et annulations joueur/club ne partaient pas) et `reservation_participants` UPDATE SEUL
    (invitations/rejoint-match muets) → les deux écoutent désormais **INSERT + UPDATE**.
- **Invitation → invité** ET **Invitation acceptée → auteur** (notifs sociales) : table
  `reservation_participants`, événements **INSERT _et_ UPDATE** (coche les deux) → même
  fonction `notify-club`.
  - INSERT (un ami est rattaché à une résa partagée) → notifie l'**invité** (« Invitation à
    jouer 🎾 »).
  - INSERT déjà `accepted` (`join_open_match`, match ouvert 45) → notifie le **créateur** du
    match (« Un joueur a rejoint ton match 🎾 »).
  - UPDATE `→ accepted` → notifie l'**auteur** de la réservation : « Un joueur a rejoint ton
    match 🎾 » si c'est un match ouvert (re-rejoint après un départ), sinon « Invitation
    acceptée ✅ » en NOMMANT l'ami (v49). Rien si la résa n'est plus active.
  - UPDATE `accepted → declined` → notifie le **créateur** : « Un joueur a quitté ton match »
    (match ouvert — une place se libère) ou « Un joueur s'est retiré » (partie privée).
  - UPDATE `invited → declined` (partie privée encore active) → notifie le **créateur**
    (« Invitation déclinée », v49).
  - ⚠️ Si tu avais créé ce hook en UPDATE seul, **édite-le** pour cocher aussi **INSERT**
    (sinon l'invité ne reçoit jamais rien).
- **Tournois** : table `competitions`, événements **INSERT _et_ UPDATE** (coche les deux) →
  même fonction `notify-club`.
  - INSERT d'un tournoi **joueur OU PadelConnect** (opérateur, 43 — en attente) → notifie le
    **gérant** du club hôte (« à valider »).
  - UPDATE `pending → published` (le club valide) → notifie l'**organisateur** (« Tournoi
    validé ✅ ») **et l'opérateur** (« frais à encaisser », montant Wave) — on ne facture donc
    que les tournois réellement confirmés.
  - UPDATE `pending → rejected` (le club refuse) → notifie l'**organisateur** (« Tournoi non
    retenu »).
  - UPDATE `published → cancelled` (97 : `cancel_competition` ou club retiré) → notifie
    l'**organisateur** et les **inscrits** (« Tournoi annulé », motif joint ; inscrits bloqués
    avec l'organisateur exclus). Annulé par le **club** ou l'**opérateur** alors que les frais
    PadelConnect étaient déjà encaissés (98 : `payment_status = 'refund_due'`) → notifie aussi
    l'**opérateur** (« Frais de tournoi à rembourser », montant — remboursement Wave à faire).
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
  - UPDATE `→ cancelled` → notifie le **coach** (cours annulé par l'élève / demande retirée —
    formulation neutre, le « pas venu » marqué par le club passe aussi par là) ; pour un cours
    COLLECTIF (capacity > 1), les **élèves inscrits** aussi (« Cours collectif annulé »). Rien
    quand c'est le coach lui-même qui annule (`cancelled_by = 'coach'`, 96) : l'élève est prévenu
    par la branche `reservations`.
  - UPDATE `cancelled → accepted` (85 C3, un « pas venu » dé-marqué) → notifie le **coach**
    (« Cours rétabli ») et l'**élève** (« Cours rétabli ✅ ») ou les **élèves inscrits**
    (« Cours collectif rétabli »).
- **Promotion coach** : table `coaches`, événements **INSERT _et_ UPDATE** (coche les deux) →
  même fonction `notify-club`.
  - INSERT (le club déclare un coach) ou UPDATE `active → true` (re-promotion) → notifie le
    **joueur promu** (« Tu es maintenant coach 🎾 » — le tap ouvre son Espace Coach).
- **Scores de match** : table `match_results`, événements **INSERT _et_ UPDATE** (coche les
  deux) → même fonction `notify-club`.
  - INSERT de la première saisie (la plus ancienne : deux saisies simultanées n'envoient qu'une
    fois) → notifie les joueurs **sans saisie** (« Si tu étais dans l'autre camp, confirme-le ;
    coéquipiers : inutile, il sera validé sous 48 h » — la confirmation d'un coéquipier du
    gagnant bloquerait la validation).
  - UPDATE qui valide le match (la règle du serveur est atteinte) → notifie **les joueurs**
    (« Match validé »).
  - UPDATE avec des saisies **en désaccord** → notifie les joueurs (le score est à revoir).
- **Actu opérateur** : table `operator_news`, événements **INSERT _et_ UPDATE** (coche les
  deux) → même fonction `notify-club`.
  - INSERT ou UPDATE d'une actu dont la case **« Envoyer aussi en notification »** était cochée
    (colonne `push`) → push d'actu à tous les comptes qui ont laissé **« Actus et agenda »**
    activé (`profiles.news_push`, 98 — activé par défaut, désactivable dans Profil →
    Notifications). Case décochée = aucun push.
  - Garde **anti-doublon** sur `news_id` : la même actu ne part jamais deux fois.

La fonction lit la table + le type d'événement et envoie au bon destinataire (gérant du club,
joueur, auteur de la réservation, opérateur, organisateur du tournoi, ami invité, coach ou élève).

> 🆕 **v50 (2026-10-22, décisions du porteur — SQL 98)** — sans nouveau webhook. ⚠️ Coller la
> **98 AVANT** de déployer la v50 : la v50 lit `profiles.news_push` (sans la colonne, chaque
> diffusion d'actu ou d'agenda échoue et est journalisée — rien n'est envoyé).
>
> - **actus et agenda** : envoyés seulement aux comptes `news_push = true` (réglage « Actus et
>   agenda PadelConnect » du profil, activé par défaut — exigence Apple 4.5.4) ;
> - **tournoi annulé** par le club ou l'opérateur avec des frais déjà encaissés → push à
>   l'opérateur « Frais de tournoi à rembourser » ;
> - **compte supprimé** : ses places dans les matchs passés deviennent anonymes (`user_id` NULL,
>   « Ancien joueur ») — jamais une cible de push ; la reprise d'une résa passée par un partenaire
>   et l'anonymisation ne changent ni statut ni confirmation → **aucun push**.

> **v49 (2026-10-22, audit des règles métier)** — comportement d'envoi, sans nouveau webhook :
>
> - la fonction **répond 202 tout de suite** (après le contrôle du secret) et travaille en
>   arrière-plan (`EdgeRuntime.waitUntil`) : une grosse diffusion ne dépasse plus le délai du
>   déclencheur. Dans les journaux de `net._http_response`, **202 = normal** (avant : 200) ;
> - push transactionnels en **priorité haute**, canal Android `default`, durée de vie jusqu'au
>   début de la partie (rien n'est envoyé si elle a commencé) ; actus, agenda et annonces club :
>   priorité normale, 72 h ;
> - push d'un gérant avec `clubId` (multi-clubs) ; push d'annulation avec `event: 'cancelled'`
>   (l'app retire ses rappels locaux) ;
> - lots Expo réessayés (429/5xx : 2 fois ; réseau : 1 fois) ; lectures en échec, diffusion
>   partielle, lot perdu ou instance coupée → journal `app_errors` (contexte `notify-club`, carte
>   « Santé de l'app » de l'opérateur) ;
> - `supabase-js` épinglé à la version exacte de l'app.

> 🆕 Chantier v3 (2026-08-14) : le webhook `reservations` alimente AUSSI, sans configuration
> supplémentaire, les push « partenaire suivi a créé un match » + « un match à ton niveau vient
> d'ouvrir » (INSERT, notify-club v33/v34) et « un créneau s'est libéré » (UPDATE → toute
> transition `booked → cancelled` : joueur, `delete_club`, coach disparu — liste d'attente 81 ;
> jamais sur une annulation CLUB `club_cancelled`, qui re-bloque le créneau).

> 🆕 Chantier v3, lots C-D (2026-08-14, DÉJÀ CRÉÉS via l'API — rien à faire) : 3 webhooks de plus,
> clonés avec le même en-tête secret :
>
> - **`events`** (INSERT + UPDATE) → push d'un événement de l'AGENDA publié avec la case « push »
>   (anti-doublon + anti-phishing par relecture en base, notify-club v35 ; depuis la v50, aux seuls
>   comptes `news_push`).
> - **`club_news`** (INSERT **seul**, décision assumée : le push ne part qu'à la création d'une
>   annonce) → annonce d'un club à ses SUIVEURS (cœur favori), notify-club v38.
> - **`share_payments`** (INSERT + UPDATE) → « part déclarée payée » au créateur du match partagé,
>   « ta part est confirmée » au payeur (notify-club v38). Le webhook `lessons` existant pousse
>   AUSSI, depuis la v38, l'annulation d'un cours COLLECTIF à ses élèves inscrits.

**Au total, 11 webhooks** doivent exister : `reservations`, `reservation_participants`,
`competitions`, `friend_requests`, `lessons`, `coaches`, `match_results`, `operator_news`,
`events`, `club_news`, `share_payments`.

## 4 bis. ✅ FAIT (2026-07-06) — Webhook sécurisé par secret

La fonction `notify-club` exige un secret : sans lui, n'importe qui connaissant l'URL (la clé
publique est dans l'app) pouvait **envoyer de faux push aux gérants** avec un contenu arbitraire
(risque de phishing : « Réservation annulée, appelez ce numéro »). Un audit l'a confirmé comme
faille réelle. **Configuré par le porteur le 2026-07-06** :

1. `WEBHOOK_SECRET` posé dans les **secrets des Edge Functions**
   (`…/dashboard/project/<ref>/functions/secrets` → « Add new secret »). Valeur aléatoire, hors dépôt.
2. En-tête HTTP `x-webhook-secret` (même valeur) ajouté aux **11** Database Webhooks
   (`reservations`, `reservation_participants`, `competitions`, `friend_requests`, `lessons`,
   `coaches`, `match_results`, `operator_news`, **`events`**, **`club_news`**, **`share_payments`**).
   🆕 Les 3 derniers (chantier v3, lots C-D) ont été **créés en base via l'API avec l'en-tête
   secret déjà présent** (clonés à l'identique des webhooks existants) — rien à faire côté porteur.
3. `notify-club` redéployée.

Comportement : tant que `WEBHOOK_SECRET` n'est pas défini, la fonction marche comme avant (compat) ;
une fois défini, tout appel sans le bon en-tête reçoit **401**. ⚠️ Si tu ajoutes un **12ᵉ** webhook
plus tard, pense à lui mettre l'en-tête, sinon ses push seront bloqués.

## 5. Tester

1. Installe un **build EAS** sur un vrai téléphone (les push ne marchent pas dans le
   simulateur ni dans Expo Go). Depuis la v49, un appel de test direct à la fonction répond
   **202 « accepted »** : le résultat de l'envoi se lit dans les journaux de la fonction (et dans
   `app_errors` en cas d'incident), plus dans la réponse HTTP.
2. Connecte-toi avec un compte **gérant** d'un club, accepte la permission notifications.
3. Avec un autre compte joueur, réserve un créneau dans ce club → le gérant reçoit le push.

## Notes

- Si un compte n'a pas accepté les notifications, `expo_push_token` reste vide et la fonction
  l'ignore simplement (aucune erreur).
- Les **rappels de match** (avant le créneau) restent des notifications _locales_ (déjà en
  place, sans serveur) — ce guide concerne uniquement les push _à distance_.
