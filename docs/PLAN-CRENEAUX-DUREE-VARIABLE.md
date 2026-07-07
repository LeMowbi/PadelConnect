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

---

# 6. Révision après vérification 10 angles (2026-07-07)

10 relectures adversariales indépendantes (migration/rollout, concurrence, tarifs, tournois, cours,
fenêtres temporelles, UI, maths d'intervalle/éditeur, contrat app↔serveur, complétude) ont trouvé
**~40 manques réels**. Corrections ci-dessous — elles **priment** sur les §2-§5 quand il y a conflit.

## 6.0 ⚠️ Stratégie de déploiement CORRIGÉE (le plan initial était faux sur ce point)
« Poser tout le SQL avant le build » **casserait le #57 en revue**. On **scinde** :
- **SQL 68 (maintenant, rétro-compatible)** : uniquement les **colonnes** (`reservations.duration_min`,
  `lessons.duration_min`, `blocked_slots.duration_min` — tous `not null default 90` + **CHECK ∈ {60,90}**,
  `competitions.slot_durations int[]`, `club_config.court_slots jsonb`) et les **RPC rétro-compatibles**
  dont les **nouveaux paramètres sont DEFAULTés** (`p_court_slots jsonb default null`,
  `p_duration int default 90`) — l'ancienne signature est droppée mais tous les params existants
  restent défaultés (le #57 appelle en arité réduite → OK).
- **SQL 69 (livré AVEC le nouveau build)** : la **contrainte d'exclusion GiST** + le drop de
  `reservations_slot_unique` + les bascules de code d'erreur `23505→23P01` (guards, `mark_no_show`).
  Raison : la contrainte fait passer les conflits de **23505 à 23P01** ; or le #57 détecte « créneau
  pris » via `code === '23505'` (`reservations.ts:139`) → il faut le nouveau client (qui gère 23P01)
  en même temps. Tant que seul l'ancien client tourne, l'index unique suffit (il ne crée que des
  créneaux 90 exacts). La table `reservations` est **vide** en base → aucun conflit de données.

## 6.1 CRITIQUES (sécurité / intégrité) — à intégrer obligatoirement
- **`starts_at` nullable → range infini** (concurrence G1) : `int8range(NULL,…)` chevauche TOUT →
  un seul `booked` à `starts_at` null briquerait un terrain. Avant la contrainte (SQL 69) :
  `starts_at not null` (backfill depuis `date_key`+`time`, Abidjan=UTC) + `where starts_at is not null`
  dans l'exclusion. (0 ligne en base aujourd'hui → sûr.)
- **`starts_at` non validé vs `date_key`+`time`** (G2) : `starts_at` devient la clé d'unicité →
  `reservations_insert_guard` doit **recalculer `starts_at` serveur** depuis `date_key`+`time` (ou
  refuser un écart), sinon un `starts_at` forgé passe la contrainte et double-vend le vrai créneau.
- **CHECK `duration_min in (60,90)` + not null** (G4) : durée 0 → range `empty` → **double-vente
  silencieuse** ; durée nulle → range non borné. Sur `reservations`, `lessons`, `blocked_slots`.
- **Vue `slot_occupancy` doit exposer `duration_min`** (contrat #1) : sinon l'app ne peut PAS
  calculer le chevauchement des réservations des AUTRES joueurs — le cœur de la feature. `alter`
  la vue (`03_reservations.sql:66`) + `SlotOccupancy`/mapper client.
- **Créneaux fermés « ! » réouverts à la dérivation** (intervalle #2) : `resolve_court_slots`
  (serveur ET client) doit porter le flag fermé → `{t, d:90, x:true}` pour les entrées `!` des
  clubs pas encore re-sauvegardés. Sinon toutes les pauses déjeuner deviennent réservables.
- **`blocked_ranges` hors conversion intervalle** (intervalle #5, tournois G3) : `ranges.times`
  n'a pas de durée → une période fermée « 18:00 » ne bloque pas un 17:00·1h30 qui déborde.
  Décider : donner une durée aux ranges, ou définir « ferme la session commençant à cette heure »
  et l'appliquer partout (client `rangeBlocks` + guards serveur, dont `reservations_availability_guard`).
- **Garde « créneau déjà réservé » AUSSI côté serveur** (intervalle #8) : `upsert_club_config` doit
  refuser un `court_slots` qui retire/raccourcit un créneau couvrant une réservation `booked` à venir
  (la contrainte d'exclusion ne garde que les INSERT, pas les édits de grille). Rule 5 = client + serveur.
- **« Copier sur tous les terrains » sans garde** (intervalle #7) : refuser/sauter tout terrain cible
  portant une réservation à venir non couverte à l'identique par la grille source.
- **Client : mapper `23P01` en conflit** (contrat #2, concurrence G3) : `reservations.ts:139` ajouter
  `code === '23P01'` (dans le nouveau build) ; MAJ commentaires « 23505 ».

## 6.2 Tarifs (angle tarifs)
- `upsert_club_override` doit **valider les bornes de `price60`** (comme `price`), sinon un prix 1h à 0
  ou 5 M passe (SQL 66/40). `validateTiers` (client) idem.
- **Défaut `price60 = round(price90*2/3)` peut tomber < 1000** (plancher) → 1h irréservable en
  silence. Clamp `max(PRICE_MIN, …)` ou revoir le plancher 1h (client `pricing.ts:86` + guard serveur).
- **`minPrice`/`priceForSlot` en « Par heure »** ne connaissent pas la durée au point d'appel
  (`reserver.tsx`) : l'unité réservable devient un couple `(début, durée)` ; afficher « dès price60 »
  ou déplacer prix/durée à l'étape choix-du-club (voir 6.3 UI).
- **`minPrice` ne doit compter que les durées réellement proposées** par la grille (sinon « dès 1h »
  pour un club 100 % 1h30). `minPrice(club, courtSlots)`.
- **Bornes `validateTiers` = UNION des terrains** (min ouverture → max fermeture, fin = début+durée).

## 6.3 UI — surfaces oubliées + UX « Par heure »
- **`club/[id].tsx`** (fiche club, cible des liens `/club/*`) : double prix + `début→fin` + badge ;
  textes « 1h30 » (`:312,:523`). **Ajouté au Lot 5.**
- **Planning gérant `SectionReservations.tsx`** : grille `(heure×terrain)` à **repenser** (les
  terrains ne partagent plus un axe horaire), + stats d'occupation/`byHour`/BarChart + `QuickBlock`
  + `BlockRangeForm` (reçoivent la grille club unique). **Ajouté au Lot 4** (pas juste des textes).
- **Matchs ouverts** : `OpenMatch` + `fetch_open_matches` (RPC) + `OpenMatches.tsx` gagnent la durée
  (`début→fin`, badge) ; la capacité 1v1/2v2 est indépendante de la durée. **Ajouté.**
- **`club-admin/index.tsx:379`** placeholder « session 1h30 ». **3ᵉ appelant calendrier**
  `reservations.tsx:189` (durée manquante). Textes « 1h30 » internes à `SectionMonClub`
  (`:951-953,:970,:1098`).
- **« Par heure » (UX concrète)** : tuile = heure seule + « N clubs » ; le **choix 1h/1h30 + prix**
  passe à l'étape club (deux sous-lignes ou segment `1h/1h30`), chips « Par club » clés par
  `(heure,durée)`, `BookingSheet` reçoit un `durationMin` explicite.
- **Éditeur par terrain** : états **terrain vide** / **club à 1 terrain** ; a11y (cibles 44 pt,
  labels, erreurs annoncées) ; stepper d'ajout borné selon la durée (**23:00 pour 1h**, 22:30 pour 1h30).

## 6.4 Cours coach (angle cours + contrat)
- Modèle client `Lesson`/`LessonRow`/`toLesson`/`requestLesson` + `coachesServer.ts` gagnent
  `durationMin` (**fichier ajouté aux lots**) ; `coach-admin.tsx:120` fenêtre « à venir » en durée réelle.
- **Ambiguïté durée du cours** : `coaches.slots` = simples heures. Règle : l'heure coach n'est qu'un
  **filtre de disponibilité** ; la **durée+terrain+prix** se lient au `(terrain, heure)` que l'élève
  choisit (comme une résa), recalculés à la sélection du terrain. `request_lesson` envoie cette durée
  et valide contre `court_slots` (pas l'ancienne grille club).
- `respond_lesson` : re-valider `(court, time, duration)` contre `court_slots` ; si le club a changé la
  grille entre-temps → `'conflict'` (la règle « figée » ne vaut qu'APRÈS création de la résa) ;
  l'INSERT sélectionne `l.duration_min`.

## 6.5 Tournois — ⚠️ CADUC : voir DÉCISION §6.7 (tournois RESTENT 1h30 fixe)
> Le porteur a choisi de garder les tournois en 1h30 fixe. Tout ce §6.5 (slot_durations, parité,
> minutes-de-journée, divergence par terrain, sélecteur `nouvelle.tsx`) est ABANDONNÉ. Ne subsiste
> que le point « overlap tournoi(90) ↔ réservation(60/90) » décrit au §6.7.
- **Parité `slot_durations`↔`slots`** : CHECK `cardinality(slot_durations) in (0, cardinality(slots))`
  + `d∈{60,90}` par élément (sinon durée NULL → range non borné → double-vente).
- **Conflit tournoi↔tournoi en vrai intervalle** : `competition_slot_conflict` /
  `competition_overlaps_reservations` doivent enfiler les durées des DEUX côtés (double
  `unnest WITH ORDINALITY`, comparaison en **minutes-de-journée**, PAS `int8range` — un tournoi n'a
  pas de `starts_at`).
- **Modèle client `Competition`** (`timeSlots`, `CompetitionRow.slots`, `rowToCompetition`,
  `CreateCompetitionInput`, `createCompetition`, `fetch_competitions`) : câbler `slotDurations`.
- **`competitionBlockedCourts` (client)** : reçoit les durées des créneaux tournoi + la grille du
  terrain candidat → overlap par terrain (sinon un joueur réserve 09:00 sur un terrain qu'un
  tournoi 08:00·1h30 occupe encore).
- **Divergence par terrain** : un tournoi bloque le produit (terrains × créneaux) ; si deux terrains
  divergent à la même heure, la durée par créneau ne suffit pas → l'organisateur choisit une durée
  de créneau tournoi validée contre chaque terrain sélectionné.
- **`nouvelle.tsx`** : sélecteur de durée par créneau + garde anti-chevauchement des créneaux tournoi ;
  lit `court_slots` (pas l'ancienne grille).

## 6.6 Fenêtres temporelles + divers
- **`submit_match_score`** : ajouter `duration_min` au `SELECT INTO` (sinon ne compile pas).
- **Compte exact** des `90*60000` : **2** (`fetch_leaderboard`) + **2** (`my_leaderboard_rank`) +
  **1** (`submit_match_score`) = **5** sur 3 fonctions (le « 4 dans fetch_leaderboard » du plan était faux).
- Consommateurs `SESSION_MS` bruts à lister : `(tabs)/index.tsx:149`, `coach-admin.tsx:120`.
- `clubConfigSlices` : brancher `courtSlots` **avec** la branche « remise à défaut » (null ⇒ retirer
  du miroir) — corriger au passage le même oubli latent sur `courtClosed`.
- `blockSlot` (garde locale) + dédup local-mode (`AppContext:1553`) : passer en overlap.
- Push d'occupation optimiste (`AppContext:1535`) : porter `durationMin`.
- **`court_closed`** : replier la fermeture récurrente par terrain dans `court_slots` (`x:true`) et
  retirer `court_closed` pour ce cas (sinon double maintenance + match par chaîne exacte cassé).
- **Contrainte d'exclusion NON idempotente** : `drop constraint if exists` avant (SQL 69).
- **Verrou consultatif** : le GARDER (les tournois ne sont pas dans la contrainte → il sérialise
  encore résa↔tournoi). Ne pas ajouter d'`exists(reservations overlap)` redondant dans le guard.

## 6.7 DÉCISION PORTEUR (2026-07-07) — tournois en 1h30 FIXE ✅
Le porteur a tranché : **les tournois RESTENT en 1h30 fixe** ; la modularité 1h/1h30 ne concerne que
les **réservations joueur + cours coach**. Conséquences (le §6.5 tombe presque entièrement) :
- **PAS** de `competitions.slot_durations`, PAS de parité de tableaux, PAS de minutes-de-journée
  tournoi↔tournoi, PAS de sélecteur de durée dans `nouvelle.tsx`, PAS de changement du modèle client
  `Competition`. Les tournois gardent `slots text[]` @90 comme aujourd'hui.
- **SEUL** point restant côté tournoi : quand on teste le chevauchement **tournoi (90) ↔ réservation
  (60/90)**, traiter le créneau tournoi comme l'intervalle `[t, t+90)` et le comparer à l'intervalle
  de la réservation. Concerne : `competition_slot_conflict` / `competition_overlaps_reservations` /
  `reservations_availability_guard` (branche tournoi) serveur, et `competitionBlockedCourts` client
  (un tournoi 90 min bloque le terrain jusqu'à t+90 → masquer les créneaux joueur qui débordent).
  Changement contenu, pas 8 chantiers.

## 6.8 Docs / porteur / hors-scope
- **Porteur en plus** : re-déployer la **web app** (`npm run build:web` → Cloudflare Pages) après le
  build (le gérant édite ses horaires sur le web aussi).
- **Docs à réécrire** (pas juste appendre) : `CLAUDE.md` §5 + §9 (« 1h30 PARTOUT, décision assumée »
  → réversée), `docs/AUDIT-SERVEUR.md:93,257`, `docs/ESPACE-CLUB-WEB.md`, `docs/CHECKLIST-STORES.md`.
- **Diagnostics** (mineur) : ajouter `duration` à `reservation_created`, event `court_slots_edited`.
- **Hors-scope confirmé (ne rien toucher)** : `notify-club`, `ResultCard`/partage, liens
  `/invite`·`/club` (pas d'heure), **site vitrine** (n'affiche que le nombre de terrains), finances
  opérateur (somme des `price` figés), fiabilité/no-show/annulation-5h (basés sur le début),
  `submit_review` (début), rappels (avant match), `mark_no_show`/MAX_UPCOMING (début), seeds.
