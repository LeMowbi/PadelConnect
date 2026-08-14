# Chantier v3 — 19 fonctionnalités validées par le porteur (2026-08-14)

> Plan d'exécution DÉTAILLÉ, rédigé par Fable — les agents d'implémentation (Opus) exécutent ces
> specs à la lettre ; Fable garde : moteur de niveau, gardes serveur sensibles, migrations SQL,
> contre-expertises. Validé par le porteur : « tout sauf 8 (Ce soir à prix creux), 9 (promos
> heures creuses), 10 (carte des clubs — plus tard) ».
>
> RÈGLES TRANSVERSES (rappel CLAUDE.md) : commentaires FR · idiomes existants · convention
> réseau-null §8 · gardes d'époque/compteurs d'écriture pour toute tranche resynchronisée ·
> SQL idempotent, `search_path` figé, RLS partout · cadence §6 avant CHAQUE commit ·
> migrations appliquées via l'API Management PUIS vérifiées par requête catalogue ·
> nouveaux webhooks créés via l'API Management (`x-webhook-secret` + INSERT+UPDATE).

## Ordre de livraison

| Lot | Contenu | SQL | Build |
|---|---|---|---|
| A | Niveau calculé (1) · Quiz (4) · Fiabilité publique (5) · Joueurs favoris (6) | 80 | #68 |
| B | Fourchette niveau (2) · Alertes match (3) · Liste d'attente (7) | 81 | #68 |
| C | Americano (13) · Fidélité (15) · Agenda (16) | 82 | #68 |
| D | Filtres (11) · Récurrent (12) · Carnets (17) · Parts Wave (18) · Cours collectifs (19) · Annonces club (20) · Avis structurés (21) · Fiche hub (22) | 83 | #68 |
| E | Ligue par divisions (14) — APRÈS rodage du niveau calculé en production | 84 | post-#68 |

Chaque lot : implémentation → cadence §6 → contre-expertise (agent Opus, lecture seule) →
corrections → commit + push → SQL appliqué + vérifié → webhooks créés → lot suivant.

---

## LOT A — Fondations niveau & confiance (SQL 80)

### 1 · Niveau calculé automatiquement 【Fable】

**Principe.** Le niveau [1..7] s'ajuste au moment où un match devient VALIDÉ par le pipeline
anti-triche existant (`submit_match_score` : un perdant reconnaît, plafond `least(2, joueurs-1)`).
Le chemin « saisie unique gagnante à 48 h » est LAZY (aucune écriture à T+48 h) → réconciliation.

**Serveur (80).**
- Table `level_history(id, reservation_id, user_id, delta numeric, level_before, level_after,
  reason text default 'match', created_at)` + **`unique(reservation_id, user_id)`** = idempotence
  dure (un match n'ajuste jamais deux fois). RLS : lecture self ; écriture via SECURITY DEFINER.
- Fonction `apply_match_level(p_reservation_id)` SECURITY DEFINER, `search_path` figé :
  1. Vérifie la validation avec LA MÊME règle que `fetch_leaderboard` (miroir strict : 1 canon,
     ≥1 « je perds » OU saisie unique > 48 h ; résa encore `booked`).
  2. Entrants = comptes ayant saisi (les joueurs sans app ne bougent pas — on ne connaît pas
     leur camp de façon fiable).
  3. `diff = avg(niveau perdants) − avg(niveau gagnants)` ;
     `delta = clamp(0.10 + 0.05 × diff, 0.02, 0.30)` ; gagnants `+delta`, perdants `−delta`,
     arrondi 0.01, clampé [1,7].
  4. **Anti-farming** : si `sum(delta) des 7 derniers jours du joueur ≥ 0.5` → delta écrêté pour
     ne pas dépasser +0.5/7 j (les pertes ne sont pas écrêtées).
  5. Verrou consultatif par réservation (`pg_advisory_xact_lock(hashtext('lvl:'||id))`).
- Appels : (a) dans `submit_match_score` quand la saisie courante fait basculer le match en
  validé ; (b) RPC `reconcile_my_levels()` — balaye MES matchs validés sans ligne
  `level_history` (couvre le chemin 48 h), appelée par le client à l'ouverture de session
  (motif « purge à l'ouverture » existant). Bornée aux 90 derniers jours.
- Tournois officiels : `close_competition` (±0.5) INCHANGÉ ; il journalise aussi dans
  `level_history` (`reason='tournament'`) pour un historique unifié — sans changer sa logique.
- `36_audit_hardening` bornait le niveau à l'inscription : inchangé.

**Client (Opus).**
- `statistiques.tsx` : bloc « Évolution du niveau » (dernier delta + mini-historique via RPC
  `my_level_history(limit 10)`).
- `profil` : sous le niveau, mention « Ajusté automatiquement après tes matchs ».
- `AppContext.loadSession` : `void reconcileMyLevels()` fire-and-forget puis relecture du niveau
  (déjà relu par `loadSession`).
- Textes : l'écran de saisie de score mentionne « le résultat validé ajuste ton niveau ».

**Tests.** SQL vérifié en base par transactions annulées (scénarios : validation miroir, 48 h,
double application refusée, écrêtage hebdo, clamp [1,7]). Client : rien de pur à tester (affichage).

**Risques.** Divergence avec la règle de validation → le miroir est COPIÉ depuis
`fetch_leaderboard` et commenté « à modifier ENSEMBLE » ; farming 1v1 entre complices → écrêtage
hebdo + les +3 pts restent bornés par ailleurs ; niveau utilisé par la fourchette (2) → livrer
A avant B.

### 4 · Quiz de niveau à l'inscription 【Opus — lib livrée, écran à brancher】

- `src/lib/levelQuiz.ts` (fait, testé) : 4 questions, barème additif, plafonds (« jamais joué »
  ≤ 2, max 5.5).
- `onboarding.tsx` : à l'étape niveau, remplacer le stepper libre par les 4 questions (chips,
  une par écran de l'étape ou empilées) → `levelFromQuiz` → aperçu « Ton niveau de départ : X »
  avec le message d'honnêteté existant. Le stepper reste en ÉDITION DE PROFIL (ajustement manuel
  possible, borné serveur [1,7] comme avant).
- Aucun SQL.

### 5 · Badge de fiabilité public 【Opus, RPC simple】

**Serveur (80).** `public_reliability(p_user_ids uuid[]) returns table(user_id uuid, played int,
presence_pct int)` SECURITY DEFINER : `played` = résas `booked` passées où le joueur était
créateur/participant accepté ; `presence_pct = round(100 × played / (played + no_shows))`.
AGRÉGAT UNIQUEMENT (jamais le détail annulations — réservé au club via `fetch_reliability`).
Borne : 50 ids max par appel.

**Client.** Badge « Fiable · 98 % » (Tag vert sobre) sur `PlayerSheet` et les cartes
`OpenMatches` (créateur) — AFFICHÉ SEULEMENT si `played ≥ 5` (un nouveau n'est pas pénalisé).
Cache session simple (Map en état d'écran, convention réseau-null).

### 6 · Joueurs favoris 【Opus】

**Serveur (80).** Table `favorite_players(user_id, fav_user_id, created_at,
pk(user_id, fav_user_id))`, FK profiles, RLS self (select/insert/delete where user_id=auth.uid()),
refus de s'auto-suivre + garde blocage (pas de favori sur un compte qui m'a bloqué — même règle
que `send_friend_request` 53). RPC `toggle_favorite_player(p_user_id) returns boolean`.

**notify-club (Fable, branche INSERT reservations existante).** Si `record.open_match` : requête
`favorite_players where fav_user_id = record.user_id` × `push_tokens` − bloqués → push
« 🎾 {prénom} a créé un match ouvert — {club} · {date} à {heure} » (`kind:'open_match'`,
tap → onglet Réserver). DÉDUP avec l'alerte niveau (3) : un favori éligible aux deux ne reçoit
QUE la version « partenaire habituel » (priorité), via exclusion d'ids dans la 2ᵉ requête.

**Client.** Cœur sur `PlayerSheet` (état `favoritePlayerIds` en store, purgé à la déconnexion,
chargé en session) ; tri `OpenMatches` : matchs des favoris d'abord (puis récence).

---

## LOT B — Matchs ouverts intelligents (SQL 81)

### 2 · Fourchette de niveau 【garde Fable, UI Opus】

**Serveur (81).** `reservations.open_level_min numeric null`, `open_level_max numeric null`
(+ check `1 ≤ min ≤ max ≤ 7`, cohérent seulement si `open_match`). `reservations_insert_guard` :
accepte/normalise les deux champs (null = ouvert à tous). `join_open_match` : si fourchette
définie et `profiles.level` hors bornes → retourne `'level'` (nouveau statut). `fetch_open_matches`
expose min/max.

**Client.** Tunnel + BookingSheet : quand « match ouvert » est coché, deux mini-steppers
« Niveau min / max » (préréglés autour de MON niveau ±1, effaçables → ouvert à tous) — remplace
le champ texte libre `openLevel` (la colonne reste, plus alimentée). Cartes OpenMatches :
« Niveau 2,5 – 4 » + bouton désactivé avec message honnête si je suis hors fourchette (miroir du
refus serveur) ; statut `'level'` → toast « Ce match cherche un niveau {min}–{max} ».

### 3 · Alerte « un match à ton niveau vient d'ouvrir » 【ciblage Fable】

**Serveur (81).**
- `profiles.match_alerts boolean not null default false` (RLS self-update déjà en place).
- Table `club_followers(user_id, club_id, created_at, pk(user_id, club_id))`, RLS self —
  **partagée avec les annonces club (20)** : suivre un club = une seule notion.
  RPC `toggle_club_follow(p_club_id) returns boolean`.
- Client : le CŒUR favori existant (local `favoriteClubIds`) écrit AUSSI `club_followers`
  (best-effort, réseau-null → le local reste la vérité d'affichage).

**notify-club (Fable, même branche INSERT que le 6).** Cibles = `profiles.match_alerts = true`
× `club_followers(club) ` × niveau dans [min,max] (fourchette null = tous niveaux) × token
présent − créateur − bloqués (2 sens) − déjà notifiés « favori ». Corps :
« Un match à ton niveau vient d'ouvrir — {club} · {date} à {heure} ({n} place(s)) ».
LIMITE dure 100 destinataires (tri par récence de follow) + log si écrêté.

**Client.** Profil → « Notifications » : interrupteur « Matchs à mon niveau dans mes clubs
suivis » (écriture honnête, attend le serveur).

### 7 · Liste d'attente sur créneau complet 【Opus + branche notify-club Fable】

**Serveur (81).** Table `slot_waitlist(id, user_id, club_id, date_key, time, duration_min,
created_at, unique(user_id, club_id, date_key, time))`, RLS self. RPC
`join_slot_waitlist(p_club_id, p_date_key, p_time, p_duration)` (refus créneau passé, purge
best-effort de MES entrées passées au passage) et `leave_slot_waitlist(...)`.

**notify-club (Fable).** Branches UPDATE existantes `cancelled` ET `club_cancelled` : après les
pushes actuels, requête `slot_waitlist` du même club/jour dont l'intervalle [time, +duration)
CHEVAUCHE le créneau libéré (même arithmétique que la garde 68) → push « Un créneau s'est
libéré — {club} · {date} à {heure} 🏃 » (`kind:'waitlist'`, tap → tunnel du club pré-rempli
jour/heure) → DELETE des entrées notifiées (alerte one-shot, premier arrivé premier servi).

**Client.** Tunnel : quand (jour, heure) choisis et AUCUN terrain libre → bouton
« Complet — me prévenir si ça se libère » (toggle, état visible « Alerte posée ✓ »).
Deep link du push : réutilise les query params existants (dateKey/time).

---

## LOT C — Compétition & rétention (SQL 82)

### 13 · Americano auto-géré 【Opus — lib livrée】

**Serveur (82).** `competitions.americano jsonb null` (état : joueurs, rondes générées, scores
saisis) + RPC `save_americano_state(p_id, p_state jsonb)` — organisateur OU opérateur, taille
≤ 16 Ko, forme validée (objet avec clés attendues), tournoi format americano non clôturé.
`fetch_competitions` l'expose.

**Client.** `src/lib/americano.ts` (fait, testé : rotations équilibrées, byes équitables,
classement individuel, podium). Dans `competition/[id]` (organisateur, format americano) :
section « Gérer l'americano » → joueurs (pré-remplis du roster `teamNames`, éditables) →
« Générer les rondes » → saisie des scores par ronde (paires de champs numériques) → classement
live → à la clôture, `ClosePanel` pré-rempli avec le podium calculé (l'organisateur peut encore
corriger). Sauvegarde serveur à chaque étape (écriture honnête + debounce local).

### 15 · Fidélité « 10 parties = 1 récompense » 【Opus】

**Serveur (82).**
- Table générique `app_config(key text pk, value text)` + RPC `set_app_config` (opérateur,
  LISTE BLANCHE de clés : `loyalty_reward`) — servira aux réglages opérateur futurs.
- `my_loyalty() returns (played int, claimed int)` : `played` = MES résas `booked` passées
  (créateur ou participant accepté — même base que les +2 pts) ; `claimed` = lignes de
  `loyalty_claims(user_id, cycle int, claimed_at, served boolean default false,
  unique(user_id, cycle))`.
- `claim_loyalty()` : exige `floor(played/10) > claimed` → insère le cycle suivant.
- `fetch_loyalty_claims()` / `serve_loyalty_claim(p_id)` : opérateur (onglet Demandes).

**Client.** Profil : carte à tampons (10 cases, `played % 10`, animation PopIn au complet) +
texte de la récompense (`app_config.loyalty_reward`, réglé dans Espace opérateur → Finances) ;
à 10 : « Réclamer 🎁 » → écran « Récompense n°X — montre cet écran au club » ; opérateur : liste
des réclamations avec « Servie ✓ ».

### 16 · Agenda du padel ivoirien 【Opus】

**Serveur (82).** Table `events(id, title, date_key, place, link null, push boolean,
created_at, created_by)` ; RPC opérateur `upsert_event`/`delete_event` (validation lien comme
`operator_news`) ; `fetch_events()` public : à venir, limite 20. **Webhook `events` INSERT**
(créé via l'API) → notify-club : si `push`, broadcast « 📅 {titre} — {date} · {lieu} »
(garde anti-doublon par event_id, motif `operator_news`).

**Client.** Accueil : section « Agenda » (cartes date/titre/lieu/lien) sous l'actu opérateur ;
« Me rappeler » → notification LOCALE la veille 18 h (mécanique `matchReminders` existante,
resynchronisée pareil) ; éditeur dans Espace opérateur (motif NewsEditor).

---

## LOT D — Club & monétisation (SQL 83)

### 11 · Filtres équipements & type 【Opus, pur client】
`clubs/index.tsx` : rangée de chips « Couvert · Extérieur · Mixte » + équipements (dérivés des
`amenities` réellement présents dans les données) ; filtres combinables, état local d'écran,
compteur de résultats, EmptyState « Aucun club ne correspond » avec bouton reset.

### 12 · Réservation récurrente habitués 【garde Fable】
**Serveur (83).** RPC `block_recurring(p_club_id, p_court, p_time, p_duration, p_date_keys
text[], p_reason)` : `can_manage_club`, 1 ≤ dates ≤ 26, toutes futures, verrous `club:jour`
ORDONNÉS (anti-deadlock, motif 74), pour chaque date les MÊMES gardes que `block_slot`
(chevauchement résa → la date part en `conflicts`), insère le reste → retourne
`{blocked: text[], conflicts: text[]}`.
**Client.** Le client calcule les N dates (helper pur testé `recurringDates(weekday, weeks)`
dans `days.ts`) ; Espace Club → Réservations : formulaire « Créneau récurrent » (terrain, jour
de semaine, heure de la grille, durée, N semaines 4/8/12/26, nom du client → motif
« Récurrent · {nom} ») ; résultat honnête : « 11 posées, 1 conflit le {date} ».

### 17 · Carnets & abonnements club 【SQL Fable】
**Serveur (83).** Tables `club_passes(id, club_id, user_id, label, total int check 1..100,
remaining int check ≥ 0, created_at, created_by)` et `pass_uses(pass_id, reservation_id UNIQUE,
used_at)` (idempotence + audit). RPC : `club_grant_pass(p_club_id, p_phone, p_total, p_label)`
(can_manage_club, appariement téléphone 10 chiffres, REFUS d'ambiguïté — motif
`grant_club_access_by_phone`) ; `club_use_pass(p_reservation_id)` (résa du club, joueur porteur
d'un pass `remaining > 0`, pas déjà décomptée → décrément + trace, atomique `FOR UPDATE`) ;
`club_passes_list(p_club_id)` ; `my_passes()`. Décompte MANUEL v1 (un tap gérant) — décision
assumée : pas de décompte auto tant que le flux n'est pas rodé.
**Client.** Espace Club → Mon club : « Carnets » (créditer par téléphone, liste des porteurs,
soldes) ; carte résa à venir : « Décompter du carnet ({n} restants) » si le joueur en a un ;
joueur : solde par club sur la fiche club + profil.

### 18 · Parts Wave des matchs ouverts 【Opus】
**Serveur (83).** `reservations.wave_link text null` + RPC `set_reservation_wave_link(p_id,
p_link)` (créateur, validation URL wave comme `set_wave_link` 58, '' = effacer) ; table
`share_payments(reservation_id, user_id, status text check in ('declared','confirmed'),
declared_at, confirmed_at, pk(reservation_id, user_id))` ; RPC `declare_share_paid(p_resa)`
(participant accepté) / `confirm_share_paid(p_resa, p_user)` (créateur). **Webhook
`share_payments` INSERT+UPDATE** (créé via l'API) → notify-club : declared → push créateur
« {prénom} a déclaré avoir payé sa part » ; confirmed → push payeur « Ta part est confirmée ✓ ».
**Client.** Carte résa partagée (« Mes réservations ») : le créateur colle son lien Wave ;
chaque participant voit SA part (calcul `perPlayerOf` existant) + « Payer ma part » (ouvre Wave)
puis « J'ai payé » ; le créateur voit l'état par joueur et coche ; relance = message WhatsApp
pré-rempli (`matchMessages`, zéro serveur).

### 19 · Cours collectifs à places 【gardes Fable】
**Serveur (83).** `lessons.capacity int not null default 1 check (capacity between 1 and 8)` +
table `lesson_students(lesson_id, user_id, joined_at, pk)`. RPC `create_group_lesson(p_club_id,
p_court, p_date_key, p_time, p_duration, p_capacity, p_note)` : appelant = coach ACTIF de ce
club (table `coaches`), crée LA RÉSERVATION STANDARD au nom du coach (mêmes gardes 68→79, GiST
anti double-vente intacte, `club_confirmed=false` → double validation club préservée) + la
lesson `accepted` liée ; `join_group_lesson(p_lesson_id)` : élève ≠ coach, `FOR UPDATE` sur la
lesson, capacité non atteinte, pas bloqué par le coach, pas déjà inscrit → retourne
`'ok'|'full'|'gone'|'already'` ; `leave_group_lesson` avant le début ; annulation coach =
`cancel` existant → résa annulée + push élèves (webhook `lessons` UPDATE existant, nouvelle
cible = `lesson_students`).
**Client.** Espace Coach : « Créer un cours collectif » (créneau depuis la grille du club,
places, note) + liste de MES sessions avec inscrits ; fiche club + écran coachs : cartes
« Cours collectif — {date} {heure} · {n}/{cap} places » avec « Rejoindre » ; « Mes
réservations » élève : le cours rejoint avec « Se désinscrire ».

### 20 · Suivre un club + annonces 【Opus】
**Serveur (83).** Table `club_news(id, club_id, title, body, link null, push boolean,
created_at, created_by)` ; RPC `upsert_club_news`/`delete_club_news` (can_manage_club,
validation lien) ; `fetch_club_news(p_club_id)` public (limite 10). **Webhook `club_news`
INSERT** → notify-club : si `push`, cibles = `club_followers` du club − bloqués, garde
anti-doublon par id, corps « {club} : {titre} », tap → fiche club.
**Client.** Fiche club : bouton « Suivre » (= le cœur favori, un seul concept — le toggle écrit
local + `club_followers` serveur) + section « Annonces » ; Espace Club → Mon club : éditeur
d'annonces (motif NewsEditor : titre, texte, lien, case « Envoyer aussi en notification »
décochée par défaut).

### 21 · Avis structurés 【Opus】
**Serveur (83).** `reviews` + `rating_courts smallint null check 1..5`, `rating_service …`,
`rating_facilities …` ; `submit_review` : 3 paramètres OPTIONNELS ajoutés (default null — les
anciens clients continuent de marcher) ; `fetch_club_ratings` : recréée (drop + create, la
signature de retour change) avec moyennes par critère — CLIENT MIS À JOUR DANS LE MÊME BUILD
(risque de fenêtre : le client actuel ignore les nouvelles colonnes → rétrocompatible).
**Client.** Saisie d'avis : 3 rangées d'étoiles optionnelles (terrains / accueil / vestiaires)
sous la note globale ; fiche club : « Terrains 4,6 ★ · Accueil 4,8 ★ · Vestiaires 4,2 ★ » quand
≥ 3 avis structurés ; anciens avis inchangés.

### 22 · Fiche club « hub » 【Opus, pur client】
`club/[id].tsx` : 3 sections nouvelles sous les infos — « Ses coachs » (fetchBookableCoaches
filtré club, existant), « Prochains tournois ici » (état `myCompetitions` filtré clubId,
publiés, à venir), « Matchs ouverts ici » (réutilise le fetch + cartes d'`OpenMatches` filtrés
club) + « Cours collectifs » (19). Pagination courte (3 max + « Voir tout »).

---

## LOT E — Ligue par divisions (14) 【Fable, SQL 84, post-#68】

Esquisse (détaillée au lancement du lot) : `league_seasons(id, name, starts, ends, status)`,
`league_groups(season, level_band, name)`, `league_members(group, user_id, points)` ; les
matchs = résas normales entre membres, points = scores validés existants recomptés par groupe ;
clôture de saison (opérateur) : montée/descente automatique des 2 premiers/derniers.
PRÉREQUIS PRODUIT : niveau calculé (1) en production depuis plusieurs semaines — des poules
assises sur des niveaux auto-déclarés seraient déséquilibrées dès la saison 1.

---

## Webhooks à créer (API Management, `x-webhook-secret`, INSERT+UPDATE)
`events` (82) · `club_news` (83) · `share_payments` (83). Les branches favoris/alertes/waitlist
passent par les webhooks `reservations` EXISTANTS. `docs/PUSH-SETUP.md` à recaler (8 → 11).

## Récap modèle par tâche
- **Fable** : SQL 80→84, `apply_match_level`, gardes `join_open_match`/`block_recurring`/
  `create_group_lesson`/`club_use_pass`, toutes les branches notify-club, contre-expertises
  finales, application/vérification en base.
- **Opus** : tous les écrans, libs pures + tests, éditeurs, branchements store, contre-lectures
  intermédiaires.
