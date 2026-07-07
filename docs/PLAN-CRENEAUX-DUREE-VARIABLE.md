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

---

# 7. Révision 2 — verrouillage après ronde 2 (2026-07-07)

2ᵉ ronde (5 relectures sur le plan révisé : découpage 68/69, boucle chevauchement, contradictions,
implémentabilité, tests). Elle a **résolu les forks ouverts** et fourni les specs concrètes. **Ces
décisions sont FINALES** (plus aucun « à décider »). Priment sur §2-§6.

## 7.1 Forks tranchés (définitif)
- **UNE seule représentation de créneau fermé** = entrée `court_slots` avec `"x":true`.
  `court_closed` est **retiré** : l'éditeur écrit les fermetures récurrentes en `x:true` et **vide
  `court_closed` à la sauvegarde** ; `resolveCourtSlots(null)` fusionne à la dérivation **les `!`
  hérités ET `court_closed`** en `{t,d:90,x:true}` (sinon les fermetures récurrentes des clubs non
  re-sauvegardés redeviennent réservables — même classe de bug que les `!`). `availability.ts` lit
  **uniquement** `court_slots` résolu, plus jamais `courtClosed`. (`blocked_slots`/`blocked_ranges`
  restent : axe DATE-spécifique, ≠ récurrent.)
- **`blocked_ranges`** : une heure fermée `T` ferme l'intervalle **`[T, T+90)`** (session max) ;
  overlap d'intervalle des DEUX côtés (`rangeBlocks` client + les 3 branches serveur). Pas de
  changement de schéma `times`, juste l'interprétation. (Option « donner une durée » écartée.)
- **`court_slots` = seule source de vérité** quand non-null ; le nouveau client ne lit plus `slots`
  pour les horaires. À chaque sauvegarde, `upsert_club_config` écrit AUSSI un `slots` dérivé
  (projection 90 min, créneaux fermés en `'!'`) comme **miroir compat ancien client**. Le guard
  serveur valide contre `court_slots` → un ancien client qui tente un créneau invalide est refusé
  (dégradation propre : les anciens builds ne voient juste pas les créneaux 1h).
- **`validateTiers` sensible à la durée** : n'exiger un prix que pour les durées **réellement
  présentes** dans la grille résolue (union des terrains) → cohérent avec `minPrice` par construction.
- **Règle 5 « créneau réservé » définie IDENTIQUE client+serveur** = toute entrée `court_slots` dont
  l'intervalle `[t,t+d)` **chevauche** l'intervalle d'une réservation `booked` à venir sur ce terrain ;
  appliquée à retirer/raccourcir/déplacer **ET à AJOUTER** (sinon on affiche un créneau non réservable).
  Calculée côté client depuis la **même** `slot_occupancy` (avec durée) que le serveur → jamais de
  désaccord.

## 7.2 Rollout — précisions finales
- **CHECK non idempotents** aussi : `drop constraint if exists` avant chaque `add constraint … check`
  (`reservations`/`lessons`/`blocked_slots`) ; `drop index if exists reservations_slot_unique`.
- **`create extension if not exists btree_gist`** = tout en HAUT de **SQL 69** (juste avant la
  contrainte).
- **Appliquer SQL 69 seulement quand le nouveau build est la version LIVE/minimale** (pas juste
  soumis) — sinon un #57 encore actif voit un conflit 23P01 non mappé. Table vide → risque faible,
  mais on respecte l'ordre.
- `reservations.ts:139` : **ajouter** `'23P01'` (OR, ne PAS remplacer `23514`/`P0001`).

## 7.3 Contrat de chevauchement — explicite
- `overlaps(a,b)` : **demi-ouvert strict** `aStart < bEnd && bStart < aEnd` (adjacents OK, comme
  `int8range [)`). UNE seule convention client+serveur.
- `freeCourts(club, dateKey, time, durationMin, ctx)` + `AvailCtx.courtSlots` : la dispo doit
  connaître la durée candidate et la grille du terrain (sinon l'app propose un créneau que le serveur
  refuse). Signature à changer au Lot 3.
- **`reservations_insert_guard` RÉÉCRIT `new.starts_at := derive(date_key,time)`** (UTC/Abidjan),
  ne fait pas confiance à la valeur client (sinon `starts_at` forgé passe la contrainte au mauvais
  intervalle).
- **`block_slot`** pose `blocked_slots.duration_min` depuis `resolve_court_slots` (durée réelle du
  créneau), pas 90 par défaut → client et serveur d'accord.
- `int8range(starts_at, starts_at + duration_min*60000)` = **millisecondes** (`starts_at` epoch-ms).

## 7.4 API pure `courtSchedule.ts` (signatures FIGÉES — tests d'abord)
```ts
export type CourtSlot = { t: string; d: 60 | 90; x?: boolean };
export function slotEnd(t: string, d: number): number | null;            // toMin(t)+d
export function overlaps(a: CourtSlot, b: CourtSlot): boolean;           // [t,t+d) strict
export function canAddCourtSlot(existing: CourtSlot[], t: string, d: 60|90):
  { ok: true } | { ok: false; error: string };                          // format, ≥05:00, fin≤24:00, no-overlap (durée PROPRE), no-dup
export function openCourtSlots(cs: Record<string,CourtSlot[]>, court: string): CourtSlot[]; // !x, triés
export function resolveCourtSlots(
  cfg: { courtSlots?: Record<string,CourtSlot[]> | null; slots?: string[]; courtClosed?: Record<string,string[]> },
  courts: string[]
): Record<string,CourtSlot[]>;                                          // null ⇒ slots@90 ; '!' ET court_closed ⇒ {d:90,x:true}
export function slotDurationAt(cs: Record<string,CourtSlot[]>, court: string, t: string): 60|90|null;
```
⚠️ `canAddCourtSlot` chevauche avec la **durée propre** de chaque créneau (≠ tampon fixe 90 min de
l'ancien `canAddSlot`) — c'est une SÉMANTIQUE nouvelle, ne pas porter l'ancienne règle.

## 7.5 Schéma `court_slots` + validation `upsert_club_config`
- Objet JSON, **≤ 20 clés** (terrains) ; valeur = tableau **≤ 48 entrées** ;
  entrée `{ t: /^([01]\d|2[0-3]):(00|30)$/ , d: 60|90, x?: bool }` (**granularité 30 min**, rejeter :15/:45).
- Bornes : `toMin(t) ≥ 300` et `toMin(t)+d ≤ 1440` ; **anti-chevauchement par terrain** côté SQL
  (équivalent serveur de `canAddCourtSlot` — la contrainte d'exclusion ne garde QUE les réservations,
  pas la définition de grille) ; rejeter propriétés inconnues / non-array ; dédup `t` par terrain ;
  ignorer les clés orphelines à la LECTURE via `resolveCourtSlots(cfg, courts)`.
- **WRITE null-préserve ≠ READ null-dérive** : `p_court_slots = null` ⇒ **préserve** la colonne
  (comme SQL 66) ; `'{}'` ⇒ efface (retour au défaut). La branche « remise à défaut » du store
  (`clubConfigSlices`) doit matcher cette sémantique.

## 7.6 Specs UI concrètes (débloquent le code)
- **Planning gérant** (`SectionReservations`) : abandonner la matrice `heure×terrain` → **une ligne
  par terrain**, chips `début→fin · 1h/1h30` colorés par statut (`courtSlotStatusAt(court,{t,d})` en
  overlap, tournoi = `[t,t+90)`). `SelectedCell` gagne `durationMin`. Stats respécifiées :
  `sellable`/`byHour`/`quietHours` itèrent les créneaux PROPRES de chaque terrain (plus de
  `planTimes` partagé). `QuickBlock`/`BlockRangeForm` : prop `slotsForCourt(court): {t,d}[]` (choix
  du terrain d'abord). (Timeline proportionnelle = option premium, hors-scope sauf demande.)
- **« Par heure »** : tuiles = heures (union des débuts, `slotGrid` lit `courtSlots`) ; helper
  `freeCourtSlotsAt(club,dateKey,time,ctx): {court,durationMin}[]` ; à la sélection, **grouper les
  terrains libres par durée** → une chip par durée présente (`1h · 12 000` / `1h30 · 15 000`), résout
  d'un coup le cas inter-clubs ET intra-club mixte ; `BookingSheet` reçoit `durationMin` explicite.
- **Cours coach** : `durationMin`/`slotPrice`/hint/summary passent **en aval de `effectiveCourt`**
  (recalcul au changement de terrain) ; prix indéterminé avant choix terrain → StickyBar « Choisis un
  terrain » puis prix exact ; `requestCoachLesson` gagne `durationMin`.
- **`minPrice`** : `minPrice(club, offered: Set<60|90> = {90})` + helper `offeredDurations(courtSlots, club)`
  calculé au niveau connecté au store ; `ClubCard` gagne une prop optionnelle `offeredDurations`
  (défaut `{90}`) passée par les ~3 écrans-listes (accueil, favoris, liste clubs) — énumérer les
  sites d'appel pour n'en manquer aucun.

## 7.7 Plan de TESTS (barrière avant build — la garde anti-double-vente doit être PROUVÉE)
- **`courtSchedule.test.ts`** : overlap (adjacents OK ; `08:00·90` vs `09:00`/`09:29·60` = conflit) ;
  **asymétrie 1h-avant-1h30 ET 1h30-avant-1h** ; minuit (`23:00·60` OK, `23:00·90` refusé, `22:30·90`
  OK) ; min 05:00 ; `canAddCourtSlot` sur grille mixte ; **`resolveCourtSlots` : `!` ET `court_closed`
  restent fermés** (garde anti-régression double-vente) ; null ⇒ tout @90 identique à aujourd'hui.
- **NOUVEAU `availability.test.ts`** (n'existe pas — la garde côté app y vit) : `freeCourts` exclut un
  terrain pris `08:00·90` pour un candidat `09:00·60` mais pas `09:30·60` ; `competitionBlockedCourts`
  tournoi `08:00`(90) bloque `09:00` qui déborde, pas `09:30` ; occupation autres joueurs avec durée.
- **`pricing.test.ts`** : `priceForSlot(...,60)` vs `(...,90)` ; `minPrice` ne compte que les durées
  offertes ; clamp `price60 = max(PRICE_MIN, round(price90*2/3))` ; `validateTiers` 2 prix sur bornes union.
- **`audit.test.ts` RÉÉCRIT** (lignes 65-84) : le miroir `taken()` passe d'égalité exacte à overlap
  (sinon il reste vert à tort et cautionne les chevauchements).
- **Compat signatures** : `canAddSlot`/`priceForSlot`/`minPrice` gardent des params par défaut
  (90/legacy) pour que `slots.test.ts`/`pricing.test.ts`/`seeds.entry.ts` compilent ; le filtre
  `priceTiersFor` ne doit PAS se mettre à exiger `price60>0` (sinon les seeds sans price60 deviennent
  « invalides »).
- **Suite SERVEUR scriptée** (transactions annulées, technique 65/66/67, code d'erreur attendu) :
  (1) exclusion refuse `08:00·90`+`09:00·60` même terrain → **23P01** ; (2) adjacents `08:00·90`+`09:30`
  → OK ; (3) `duration_min=0`/null → refus CHECK ; (4) `starts_at` forgé ≠ `date_key+time` → refus ;
  (5) `upsert_club_config` retire/raccourcit un créneau sous une résa à venir → refus ; (6) tournoi
  90 vs résa 60 qui déborde → refus ; (7) `mark_no_show` retour `booked` → 23P01 ; (8) `starts_at null`
  → aucune ligne ne peut briquer un terrain.
- **Compat** : `court_slots=null` ≡ aujourd'hui ; `duration_min` absent ⇒ 90 (isPlayed/agenda/finances).

## 7.8 Textes périmés à corriger dans le doc (ménage)
- §2/Lot 2 mettaient la contrainte d'exclusion en « SQL 68 » → c'est **69** (voir §6.0). 
- §2 « ⚠️ 4 occurrences dans fetch_leaderboard » → **2+2+1=5 sur 3 fonctions** (§6.6).
- §2 « fermetures ponctuelles » pour `court_closed` → `court_closed` est **récurrent** (retiré, §7.1) ;
  le ponctuel = `blocked_slots`/`blocked_ranges`.
