# Plan — Créneaux modulables 1h / 1h30, par terrain

Fonction demandée par le porteur (2026-07-07). Chaque **terrain** d'un club a **sa propre grille** ;
chaque créneau peut être **1h (60 min) ou 1h30 (90 min)**, mélangés librement sur un même terrain,
modifiables quand on veut ; **aucun chevauchement** possible sur un terrain ; chaque **réservation
fige sa durée et son prix** au moment de la réservation ; le gérant fixe **deux prix** (1h et 1h30) ;
les **tournois** aussi peuvent être 1h/1h30.

> ⚠️ Fonction trop grosse pour le build #57 (en revue Apple). Part dans un **build suivant**. La
> partie SERVEUR (SQL 68) peut être posée avant sans rien casser (tout est rétro-compatible).

---

## 1. Règles validées avec le porteur

1. **Grille manuelle par terrain** : le gérant ajoute chaque créneau (heure + durée 1h/1h30), l'app
   empêche tout chevauchement sur le terrain.
2. **Deux prix** : le gérant fixe un prix 1h et un prix 1h30 (par plage tarifaire).
3. **Tournois modulables** : les créneaux de tournoi peuvent aussi être 1h/1h30.
4. **Réservation figée** : une réservation garde SA durée et SON prix, même si le gérant change la
   grille ensuite. Une réservation existante n'est **jamais** cassée ni modifiée.
5. **Créneau déjà réservé = verrouillé** : on refuse de le modifier/raccourcir/supprimer tant qu'il
   n'est pas passé ou annulé (message clair), comme la fermeture d'un créneau aujourd'hui.
6. **Affichage** : partout on montre `début → fin` + badge `1h`/`1h30` + le bon prix (au lieu de
   « juste l'heure de début » + « 1h30 » codé en dur).

---

## 2. Nouveau modèle de données

### Serveur (SQL 68, idempotent, appliqué APRÈS 67)
- `reservations.duration_min int not null default 90` — les résas existantes deviennent 90 d'office.
- `lessons.duration_min int not null default 90`.
- `blocked_slots.duration_min int not null default 90` (pour que l'intervalle fermé soit non ambigu).
- `competitions.slot_durations int[]` (parallèle à `slots`, vide ⇒ 90 par créneau).
- `club_config.court_slots jsonb` = `{ "Terrain 1":[{"t":"08:00","d":90},{"t":"09:30","d":60}], … }`.
  **`null` ⇒ on dérive de l'ancienne grille `slots` à 90 min pour chaque terrain** (rétro-compat).
  Un créneau fermé est porté soit par un flag `"x":true` dans `court_slots`, soit par `court_closed`
  (on garde `court_closed`/`blocked_ranges` tels quels pour les fermetures ponctuelles/périodes).
- `create extension if not exists btree_gist;`
- **Anti-chevauchement DUR (le cœur)** : on remplace l'index unique `reservations_slot_unique`
  (qui ne sait comparer que des heures égales) par une **contrainte d'exclusion GiST** :
  ```sql
  alter table reservations add constraint reservations_no_overlap
    exclude using gist (
      club_id with =, court with =,
      int8range(starts_at, starts_at + duration_min*60000) with &&
    ) where (status = 'booked');
  ```
  → deux réservations `booked` sur le **même terrain** dont les **intervalles se chevauchent** sont
  impossibles, **course concurrente comprise** (garantie par la base, pas seulement par un trigger).

### Client
- `Reservation` gagne `durationMin: number` (figé à la réservation, comme `price`).
- `ClubConfig` / store : nouvelle tranche `courtSlots: Record<terrain, {t,d,x?}[]>`.
- `PriceTier` gagne un 2ᵉ prix (`price60` à côté de `price90`), défaut `price60 = round(price90*2/3)`.
- Nouveau module PUR `src/lib/courtSchedule.ts` : intervalles, `overlaps(a,b)`,
  `canAddCourtSlot(existing, t, d)` (fin avant minuit, ≥ 05:00, pas de chevauchement),
  `openCourtSlots(courtSlots, court)`, `slotEnd(t,d)`, `resolveCourtSlots(cfg, courts)`
  (null ⇒ ancienne grille @90).

---

## 3. Découpage en lots (vérifiés, poussés sur la branche de dev)

### Lot 1 — Logique pure + tests (aucun impact visible)
- `src/lib/courtSchedule.ts` (intervalles, anti-chevauchement, dérivation rétro-compat).
- `src/lib/pricing.ts` : `priceForSlot(club, time, durationMin)`, `minPrice` sur les 2 durées,
  `validateTiers` sur les 2 prix.
- `src/lib/slots.ts` : garder `SESSION_MIN=90` comme **défaut**, généraliser les libellés (plus de
  « 1h30 » forcé), `inferOpenClose` ajoute la durée du dernier créneau.
- Tests : `courtSchedule.test.ts` (chevauchement 1h/1h30), maj `slots.test.ts`, `pricing.test.ts`.

### Lot 2 — SQL 68 (serveur) — posé et vérifié en base
- Colonnes ci-dessus + `btree_gist` + contrainte d'exclusion (après vérif : aucune résa existante ne
  se chevauche → sûr).
- `resolve_court_slots(club_id, court)` (helper partagé : null ⇒ `slots`@90).
- `reservations_insert_guard` : valider `(time,duration)` = un créneau **ouvert de CE terrain** +
  durée ∈ {60,90} + tenant avant fermeture ; garder le verrou consultatif.
- `reservations_availability_guard` (INSERT **et** UPDATE) : blocked_slots + tournois en **overlap
  d'intervalle**, en **excluant la ligne elle-même** (`id <> new.id`) pour ne pas s'auto-bloquer à la
  confirmation.
- `request_lesson` (+ `p_duration`, drop ancienne signature), `respond_lesson` (busy coach → overlap,
  INSERT porte `duration_min`).
- `competition_overlaps_reservations`, `competition_slot_conflict`, `create_competition`,
  `approve_competition`, `block_range` : overlap avec durées par créneau.
- `submit_match_score`, `fetch_leaderboard`, `my_leaderboard_rank` : remplacer `90*60000` par
  `duration_min*60000` (⚠️ 4 occurrences dans `fetch_leaderboard`).
- `upsert_club_config` (+ `p_court_slots`, drop ancienne signature, merge null-préserve, valide
  forme + taille + `d∈{60,90}`) ; re-grant/revoke selon la convention.
- `mark_no_show` / handlers : le retour à `booked` déclenche désormais l'exclusion (23P01) et non
  plus `unique_violation` (23505) → adapter les `exception when`.

### Lot 3 — App : store + disponibilité par intervalle
- `Reservation.durationMin`, `addReservation` (persiste la durée, anti-dup en overlap, occupation avec
  durée, rappel agenda avec la vraie fin).
- `availability.ts` : `freeCourts`/`clubsFreeAt`/`competitionBlockedCourts` en **overlap par terrain**.
- `reservations.ts` : colonne `duration_min` aller-retour ; occupation/blocked portent la durée.
- `clubsServer.ts`/`helpers.ts` : tranche `courtSlots`, `upsert_club_config` (nouveaux params).
- `AppContext` : `SESSION_MS` → durée par réservation ; `isPlayed(r)` = `startsAt + durationMin*60000`.

### Lot 4 — Espace Club : éditeur horaires PAR TERRAIN + double prix
- `SectionMonClub.tsx` : remplacer la grille club unique par un **sélecteur de terrain** → grille du
  terrain (liste `heure · 1h/1h30`, ajouter avec choix de durée + garde anti-chevauchement, retirer,
  fermer/rouvrir), bouton **« copier sur tous les terrains »**. Refus si créneau déjà réservé.
- `ClubInfoCard.tsx` : 2ᵉ colonne de prix (1h) par plage tarifaire.

### Lot 5 — Joueur + cours + tournois
- `reserver.tsx` (« Par heure »/« Par club »), `reserver/[clubId].tsx`, `BookingSheet.tsx`,
  `BookingConfirmation.tsx` : par terrain, `début→fin`, badge durée, bon prix, agenda avec vraie fin.
- `cours/[coachId].tsx`, `coach-admin.tsx` : durée du cours (réservation créée avec sa durée).
- `competition/nouvelle.tsx`, `competitionsServer.ts` : créneaux de tournoi 1h/1h30.
- Textes « 1h30 » codés en dur (~20) : `reservations.tsx`, `SectionReservations.tsx`,
  `OpenMatches.tsx`, `matchMessages.ts`, `(tabs)/index.tsx`, `onboarding.tsx`, `inscrire-club.tsx`…

### Lot 6 — Docs + vérif complète + build
- Maj `CLAUDE.md` §9, `docs/`. Cadence : tsc + lint + `test:logic` + bundle eager.
- Build EAS + soumission (nouveau build, après #57).

---

## 4. Checklist « rien oublié » (points sensibles vérifiés)

| Risque | Couvert par |
|---|---|
| Overlap avec la durée PROPRE de chaque côté (pas 90 fixe) | Contrainte d'exclusion + guards (Lot 2), `freeCourts` (Lot 3) |
| Course concurrente (2 résas simultanées) | Contrainte d'exclusion GiST DB-enforced + verrou consultatif (Lot 2) |
| `btree_gist` non installé en base | `create extension` dans SQL 68 (appliqué via Management API) |
| `isPlayed` (passé/à venir, commission, no-show) | Durée par réservation (Lot 3, risque n°2 client) |
| Fin d'événement agenda (60 min → bloc 90 faux) | `durationMin` passé à `addReservationToCalendar` (Lot 3/5) |
| Points/score : `90*60000` en dur (×4 dans leaderboard) | Remplacés par `duration_min*60000` (Lot 2) |
| Cours coach « busy » en heure exacte | Overlap d'intervalle (Lot 2) |
| Tournoi vs résa/blocked/range/autre tournoi (4 branches) | Overlap partout (Lot 2) |
| Convention `!` créneau fermé | Repensée dans `court_slots` (`x:true`) / `court_closed` (Lot 2/4) |
| `blocked_slots`/tournois sans durée | Ajout `duration_min` / `slot_durations` (Lot 2) |
| Guard availability sur UPDATE s'auto-bloque | `id <> new.id` (Lot 2, risque n°12) |
| `respond_lesson` `exception when others` (23P01) | Vérifier que l'exclusion tombe bien en `conflict` (Lot 2) |
| Signatures RPC changées (overloads PostgREST) | `drop function` ancienne signature + re-grant (Lot 2) |
| Rétro-compat clubs/résas/tournois existants | Tous les défauts = 90 ; `court_slots` null ⇒ `slots`@90 (Lot 2/3) |
| Règle d'annulation 5h (start-based) | **Inchangée** (ne pas « corriger ») |
| « Par heure » : une même heure = durées différentes selon terrain | Modèle heure→terrains→durée revu (Lot 5, risque n°7) |
| Coach ∩ grille club quand terrains diffèrent | Choix : le cours crée une résa avec durée du créneau choisi (Lot 5) |

---

## 5. Ce qui touchera le porteur
- **Aucune manip serveur** : je pose SQL 68 en base via l'API (comme 65/66/67), y compris
  l'extension `btree_gist`. Je te confirme après vérification en base.
- **Nouveau build** iOS (la fonction est côté app) — après la revue du #57.
- Aucune donnée à migrer : tout est rétro-compatible (défaut 90).
