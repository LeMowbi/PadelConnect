# Mise en service — Amis synchronisés · Boosts · Fiabilité temporaire

Trois nouveautés serveur, livrées ensemble. Tout est **idempotent** (relançable sans risque).

## SQL à exécuter (Supabase → SQL Editor → Run), dans cet ordre

1. `supabase/23_club_boost.sql` — boosts « Sponsorisé » réels, visibles par tous les joueurs
   (le club boosté remonte en tête avec son badge doré), avec date d'expiration. Écriture
   réservée à l'opérateur.
2. `supabase/24_reliability_window.sql` — le flag de fiabilité (annulations **et** absences)
   ne compte plus que les **14 derniers jours** : une erreur ponctuelle ne colle plus à un
   joueur pour toujours. Remplace la fonction de `21_reliability.sql`.
3. `supabase/25_friends.sql` — la liste d'amis vit désormais côté serveur : synchronisée
   d'un appareil à l'autre, conservée à la réinstallation. Chacun ne voit que ses propres
   amis (RLS). L'ajout se fait par numéro, sans jamais exposer la table des profils.

## Ce que ça change pour toi

- **Boosts** : dans l'Espace opérateur, activer un boost le rend visible par **tous** les
  joueurs (avant, il restait sur ton seul téléphone). Il expire automatiquement à la date prévue.
- **Fiabilité** : un joueur qui annule/ne vient pas voit son compteur **retomber à 0 après
  deux semaines**. Les clubs ne voient donc que les comportements *récents*.
- **Amis** : un joueur retrouve ses amis même après avoir changé/réinstallé son téléphone.

> Les fichiers `17` à `22` ont déjà été exécutés lors des étapes précédentes.
