# Notifications push réelles (#38/#41) — guide de mise en route

Le **code de l'app est prêt** : à la connexion, l'appareil enregistre son *jeton de push Expo*
dans `profiles.expo_push_token` (cf. `src/lib/push.ts`). Il reste à activer **l'envoi** côté
serveur. Tout passe par l'**API Push d'Expo**, donc pas besoin de manipuler les certificats
Apple à la main — Expo route vers Apple (APNs) et Google (FCM).

## 1. Base de données (déjà fait si tu as lancé les SQL)

Exécuter **`supabase/16_push_token.sql`** (ajoute la colonne `expo_push_token`).

## 2. Identifiants push (une seule fois)

Dans un terminal, à la racine du projet :

```bash
# Génère/charge la clé APNs (iOS) et la clé FCM (Android) côté Expo
eas credentials
```

Choisis la plateforme iOS → « Push Notifications » → laisse EAS créer/gérer la clé APNs.
(Pour Android plus tard : configure FCM de la même manière.)

> Avec EAS, les credentials push sont gérés automatiquement au build — en général il n'y a
> rien d'autre à faire que de builder l'app une fois ces clés en place.

## 3. Déployer la fonction d'envoi

La fonction est dans `supabase/functions/notify-club/`. Déploie-la :

```bash
supabase functions deploy notify-club
```

(Les variables `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont injectées automatiquement
par Supabase dans la fonction — rien à configurer.)

## 4. Brancher les déclencheurs (Database Webhooks)

Dashboard Supabase → **Database → Webhooks** → *Create a new hook* :

- **Réservation → club** : table `reservations`, événement **INSERT** → appelle la fonction
  `notify-club`.
- **Invitation acceptée → auteur** (notif sociale, optionnel) : table
  `reservation_participants`, événement **UPDATE** → même fonction `notify-club`.

La fonction lit la table d'origine et envoie au bon destinataire (gérant du club, ou auteur
de la réservation).

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
