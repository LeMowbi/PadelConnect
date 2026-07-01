# Audit — actions serveur (sans terminal)

Trois choses à faire côté **Dashboard Supabase** (tout se fait à la souris, aucun terminal).
Rien n'est urgent au point de casser l'app : ce sont des durcissements de sécurité/robustesse.

---

## 1) Coller la migration `36_audit_hardening.sql` (2 min)

Corrige deux points :

- **Niveau à l'inscription** : le niveau de départ est désormais **forcé à 3.0 côté serveur**
  (on n'écoute plus une valeur envoyée par l'app). Le niveau n'évolue plus que par les tournois.
- **Clôture de tournoi** : le +0.50 / −0.25 n'est attribué que si le nom d'équipe désigne **une
  seule** inscription du tournoi (empêche un « vol » de points par deux équipes de même nom).

**Étapes :**
1. Dashboard Supabase → **SQL Editor** → **New query**.
2. Ouvre le fichier `supabase/36_audit_hardening.sql` du dépôt, copie **tout** son contenu.
3. Colle dans l'éditeur → **Run**. Le script est **idempotent** (on peut le relancer sans risque).
4. Message attendu : « Success. No rows returned ».

---

## 2) Redéployer l'Edge Function `notify-club` (2 min)

Corrige : une **demande d'ami renvoyée après un refus** n'envoyait aucune notification push.

**Étapes :**
1. Dashboard → **Edge Functions** → **notify-club** → **Edit** (ou « Code »).
2. Ouvre le fichier `supabase/functions/notify-club/index.ts` du dépôt, copie **tout**.
3. Colle (remplace tout l'ancien code) → **Deploy**.
4. Le webhook `friend_requests` doit écouter **INSERT ET UPDATE** (c'est déjà le cas puisque la
   notif « demande acceptée » fonctionne). Si besoin : Dashboard → **Database → Webhooks** →
   `friend_requests` → cocher **Insert** et **Update**.

---

## 3) (Recommandé) Sécuriser le webhook push (3 min)

Aujourd'hui, tant qu'aucun secret n'est posé, **n'importe qui** connaissant l'URL de la fonction
peut déclencher des notifications. On ferme ce trou en exigeant un en-tête secret. Le code de la
fonction gère déjà ce cas : dès que le secret est posé, il est **obligatoire**.

**Étapes :**
1. Choisis un secret (une longue suite aléatoire, ex. généré sur un gestionnaire de mots de passe).
2. Dashboard → **Edge Functions** → **notify-club** → **Settings** (ou « Secrets ») → ajoute une
   variable : **Nom** `WEBHOOK_SECRET`, **Valeur** = ton secret → **Save**.
3. Dashboard → **Database → Webhooks** → pour **chaque** webhook qui appelle `notify-club`
   (`reservations`, `reservation_participants`, `competitions`, `friend_requests`) :
   **Edit** → section **HTTP Headers** → ajoute un en-tête
   **`x-webhook-secret`** = **le même secret** → **Save**.
4. Vérifie : fais une action qui envoie un push (ex. une réservation de test) → la notification
   arrive toujours. Si plus rien n'arrive, c'est qu'un webhook n'a pas le bon en-tête.

> Astuce : garde le secret quelque part de sûr (le même sur la fonction ET sur tous les webhooks).

---

## 4) Vérifier que les migrations `33` / `34` / `35` sont bien passées

Si tu ne l'as pas déjà fait, colle aussi (SQL Editor → Run, dans l'ordre) :
`33_diagnostics.sql`, `34_level_integrity.sql`, `35_hardening3.sql`.
**`34` est le plus important** : c'est lui qui verrouille l'écriture du niveau (anti-triche).
Tous sont idempotents — les relancer ne casse rien.

---

## Ordre conseillé

1 → 2 → (3) → 4. Une fois fait, préviens-moi : je pourrai lancer le prochain build de l'app
(il contient toutes les corrections et améliorations de cet audit).
