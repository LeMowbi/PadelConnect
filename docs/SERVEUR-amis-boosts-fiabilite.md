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
4. `supabase/26_competitions.sql` — les TOURNOIS vivent désormais côté serveur (visibles par
   tous, synchronisés). Un tournoi de club est publié directement ; un tournoi de joueur reste
   « en attente » (invisible des autres) jusqu'à la validation du club hôte, et un frais fixe
   PadelConnect (par défaut 10 000 FCFA, réglable dans l'Espace opérateur) s'y applique.
5. `supabase/27_blocked_slots.sql` — les créneaux **fermés hors app** par un club sont enregistrés
   côté serveur, visibles par tous, et un **verrou serveur** empêche vraiment toute réservation
   sur un créneau fermé ou réservé à un tournoi publié (fini la double réservation possible).
6. `supabase/28_operator_payments.sql` — le suivi **« Payé / à facturer »** de tes commissions
   et tournois encaissés est enregistré côté serveur (plus perdu à la réinstallation).
7. `supabase/29_hardening.sql` — durcissements de sécurité : l'accès gérant par numéro est refusé
   si le numéro est **ambigu** (anti-usurpation), et un club ne peut lire la fiabilité **que de
   ses propres** joueurs.

> Remarque : `29_hardening.sql` remplace des fonctions de `19` et `24` (create or replace) — c'est
> normal et sans risque de relancer.

## Réglage Supabase (une seule fois) — mot de passe oublié

Pour que le lien « Mot de passe oublié ? » rouvre l'app sur l'écran de nouveau mot de passe :

**Authentication → URL Configuration → Redirect URLs** → ajoute :
- `padelco://reset-password`

(en plus de `padelco://auth-callback` et `padelco://` déjà présents).

## Ce que ça change pour toi

- **Boosts** : dans l'Espace opérateur, activer un boost le rend visible par **tous** les
  joueurs (avant, il restait sur ton seul téléphone). Il expire automatiquement à la date prévue.
- **Fiabilité** : un joueur qui annule/ne vient pas voit son compteur **retomber à 0 après
  deux semaines**. Les clubs ne voient donc que les comportements *récents*.
- **Amis** : un joueur retrouve ses amis même après avoir changé/réinstallé son téléphone.

> Les fichiers `17` à `22` ont déjà été exécutés lors des étapes précédentes.
