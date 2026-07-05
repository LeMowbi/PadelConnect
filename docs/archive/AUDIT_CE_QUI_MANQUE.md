# PadelConnect — Ce qui manque sur l'app actuelle vs design Claude Design

> **À lire avec** `HANDOFF-Claude-Code.md` (dans le zip). Ce document-là dit **quoi construire** ; celui-ci dit **ce qui n'y est pas encore**, dans quel ordre, et propose des améliorations. Les deux se complètent.
>
> **Source de vérité visuelle** = la maquette `PadelConnect — Maquettes.dc.html` + le thème `src/theme/index.ts` + les 4 écrans `src/app/*.tsx` du bundle. Tout passe par les **tokens** (zéro couleur en dur), tout réutilise le **kit maison**.

---

## 0. Lecture rapide (3 points + 2 corrections)

**La bonne nouvelle :** ce n'est **pas** une refonte à partir de zéro. Les écrans cibles utilisent **les mêmes données, le même store, les mêmes libs** que l'app actuelle (Avatar, CompetitionCard, BookingSheet, RatingStars, ContactButtons, Chip, zodiac, etc. existent déjà). Le chantier est surtout **visuel** + **quelques composants/écrans nouveaux**. C'est tenable.

**Les 3 plus gros écarts (par impact) :**
1. **Socle design** : passer de l'ombre unique à une échelle d'élévations `e1/e2/e3`, ajouter `hairline` + `scrim`, renommer `gold → signature`, appliquer les dégradés `heroSoft`/`deepGreen`. C'est invisible isolément mais c'est ce qui donne le rendu « premium » partout d'un coup.
2. **Fiche club** : remplacer l'en-tête plat par un **PhotoHeader** (photo plein cadre + scrim + nom superposé) + **galerie** + **visionneuse plein écran** + **barre collante « dès {prix} · Réserver »**.
3. **Profil** : **bandeau dégradé signature** + **zodiaque** + **jauge de niveau** (avec historique des résultats officiels) + carte **« La suite »**.

**Correction n°1 — les photos.** Les 21 images dans `project/uploads/` ne sont **pas** des photos de clubs : ce sont des **captures de ton app actuelle** (servies de référence « avant »). **Le bundle ne fournit donc aucune vraie photo à brancher.** Le design insiste sur « photos réelles = 80 % de l'effet premium », mais il faudra **collecter ces photos séparément** (2–3 par club, récupérées au moment d'embarquer chaque club). En attendant, le repli doré (`PhotoPlaceholder`) est volontairement « pas une fausse photo » → il reste correct.

**Correction n°2 — le FIP.** Les captures actuelles montrent encore la bannière **« FIP Gest Abidjan »** sur l'accueil. C'est une **décision verrouillée : on ne parle plus du FIP**. À retirer si ce n'est pas déjà fait sur le build en ligne.

---

## 1. SOCLE — tokens (Lot 1, à faire en premier)

| Token | Actuel | Cible (handoff v4.6) | État |
|---|---|---|---|
| Clé du vert profond | `gold` (prête à confusion) | **`signature`** `#0A6B5D` | ⛔ à renommer |
| `faint` | `#97A096` (trop clair) | **`#7C857B`** (passe WCAG AA) | ⛔ à modifier |
| Séparateurs internes | = `border` | **`hairline` `#ECE7DB`** (NOUVEAU) | ⛔ à ajouter |
| Overlay photo / fond sheet | — | **`scrim` `rgba(12,26,22,.55)`** + `scrimStrong` | ⛔ à ajouter |
| Ombres | une seule | **`e1` / `e2` / `e3`** | ⛔ à remplacer |
| Rayon puce | — | **`radius.xs = 6`** (NOUVEAU) | ⛔ à ajouter |
| Dégradés | — | **`heroSoft`** (accueil/onboarding) + **`deepGreen`** (profil/rappels) | ⛔ à appliquer |
| Police titres/chiffres/boutons | système | **Bricolage Grotesque** 600/700/800 | ⚠️ à brancher (poids) |

**Fait quand :** plus aucune valeur hex en dur dans les écrans ; recherche de `gold` = 0 résultat ; cartes au repos en `e1`, héros/CTA/cartes mises en avant en `e2`, sheets/modales en `e3`.

---

## 2. KIT — composants (Lot 1, en parallèle du socle)

**Déjà présents** (à faire évoluer, pas à recréer) : `Txt, Card, Button, Tag, SectionHeader, Divider, IconCircle, EmptyState, StatTile, SegmentedControl, Avatar, Chip, RatingStars, ContactButtons, CompetitionCard, BookingSheet, Logo, Reveal`.

**À faire évoluer :**
- **Button** → ajouter variante **`pill`** (rayon 999) pour tous les CTA pleine largeur ; `primary` reçoit `shadow.e2`.
- **Card** → `shadow.e1` par défaut + séparateurs internes en **`hairline`** (plus `border`).
- **SegmentedControl** → piste active = pastille **`signature`** (texte blanc) + légère ombre.
- **EmptyState** → toujours **illustration ronde douce + titre + 1 phrase + 1 CTA** (jamais une page morte).

**Nouveaux composants à créer :**
- **StickyBar** ✅ (fourni dans le bundle) — barre fixe bas : **prix à gauche + bouton pill à droite**. À poser via le slot `overlay` de `Screen`. À utiliser sur **Fiche club, Réserver, Fiche tournoi, Fiche coach, Onboarding, Édition club**.
- **ClubPhoto / PhotoHeader** ✅ (fourni) — photo plein cadre + repli doré auto + `scrim` + légende superposée. **C'est le composant clé du rendu premium.**
- **BottomSheet** — poignée + titre + corps + 2 boutons (neutre `surfaceAlt` / action) ; fond `scrim`, sheet `e3`. (Utilisé pour l'annulation de réservation, le choix de photo, l'anti no-show.)
- **Stepper** (NOUVEAU) — barre de progression à N segments (réservation guidée, création de tournoi).
- **PlanningGrid** (NOUVEAU, §B) — terrains × créneaux ; états réservé `signature` / libre `surface+border` / bloqué hachures `surfaceAlt`.
- **BarChart** (NOUVEAU, §B) — barres verticales minimalistes (Stats club).

**Fait quand :** un seul `StickyBar` couvre les 6 écrans listés ; aucune barre d'action dupliquée ; `BottomSheet` partagé par tous les tiroirs.

---

## 3. ÉCRANS — §A (à faire MAINTENANT, design pur, mono-appareil)

### 3.1 Accueil (raffiner, structure déjà proche)
- **Cible :** héros **dégradé `heroSoft`** + Logo + **pastille « live »** (point `lime` qui pulse, « N clubs près de toi ») + **un seul CTA pill** « Trouver un créneau » ; accès rapide = **4 univers en icônes colorées** (Réserver/`signature`, Tournois/`purple`, Coachs/`blue`, Amis/`coral`) ; **clin d'œil anniversaire/zodiaque** ; carte **« Ton prochain match »** (pastille date + **pile d'avatars** + pastille statut Confirmé/En attente) ; **clubs proches en cartes photo horizontales** (sponsorisés en tête, puis alpha).
- **Actuel :** logo + texte + bouton, 4 tuiles simples, carte prochain match basique, **bannière FIP**.
- **Manque :** le dégradé + pastille live + CTA unique pill ; les 4 tuiles en **icônes colorées par univers** ; les **cartes club avec photo** ; le **clin d'œil zodiaque** ; **retirer le FIP**.
- **Fait quand :** l'accueil affiche le héros dégradé avec pastille `lime` animée, 4 icônes d'univers, une carte « prochain match » avec pile d'avatars, et des cartes club à photo ; zéro mention FIP.

### 3.2 Fiche club (plus gros chantier visuel)
- **Cible :** **PhotoHeader** (photo plein cadre + `scrim` + nom/quartier superposés) + **galerie miniatures** + **visionneuse plein écran** ; boutons **favori/partage** sur la photo ; **rangée de 3 info-chips** (note · terrains · localisation) ; **Tarifs par créneau** (lignes séparées en `hairline`) ; Offres & actus ; Événements & tournois ; Coachs (appel/WhatsApp) ; Avis (grande note + **répartition des étoiles** + formulaire) ; **StickyBar « dès {prix} · Réserver »**.
- **Actuel :** en-tête plat coloré, « Voir sur la carte », tarifs, offres & actus, bouton Réserver **dans le flux** (pas collant), **pas de galerie/visionneuse**, **pas d'info-chips**, **pas de répartition d'étoiles**.
- **Manque :** PhotoHeader + galerie + visionneuse ; **barre collante** ; trio d'info-chips ; résumé note + barres d'étoiles.
- **Fait quand :** la fiche ouvre sur une photo plein cadre (ou repli doré) avec nom superposé, on peut ouvrir les photos en plein écran, et « Réserver » reste collé en bas pendant le défilement.

### 3.3 Réserver (déjà bien, à raffiner + Stepper)
- **Cible :** garder **Par heure / Par club** ; **pastilles jour** ; **grille de créneaux 2 colonnes** (icône **flamme** sur 16:30/18:00/19:30, « N clubs libres » / « Complet ») ; au choix d'un créneau → **clubs en mini-cartes** avec **prix + ~/joueur** ; **Stepper** (parcours guidé *après* le choix) ; `BookingSheet` ; bouton secondaire « Parcourir les clubs ».
- **Actuel :** Par heure/Par club ✓, pastilles jour ✓, créneaux + prix + clubs ✓ (proche).
- **Manque :** le **Stepper** (« Choisissez l'heure » en étapes) ; la **flamme heure chargée** ; la grille en **tuiles 2 colonnes** ; le **prix/joueur** sous le créneau ; le style premium (sélection en `signature` + `e2`).
- **Fait quand :** un créneau prime-time montre la flamme, la sélection passe en vert surélevé, et le parcours guidé apparaît après le choix sans supprimer le SegmentedControl.

### 3.4 Profil (raffiner + ajouts)
- **Cible :** **bandeau dégradé `deepGreen`** + avatar (anneau) + **zodiaque** (emoji · signe · âge · sexe si renseigné) ; carte **« Mon niveau »** avec **jauge** (progression dans la tranche) + **historique des résultats officiels** + rappel **« +0.50 / −0.25, tournois uniquement »** ; **3 StatTiles** (Parties/`green`, Tournois joués/`purple`, Tournois gagnés/`amber`) ; **Trophées** ; raccourcis ; **rappels (switch)** ; espaces pro ; carte **« La suite »** (→ écran `/a-venir`).
- **Actuel :** « Invité Démo », niveau 3.50 (grand chiffre, **pas de jauge**), 3 stats basiques, trophées, mes réservations/amis, rappels. **Pas de bandeau dégradé, pas de zodiaque, pas de jauge, pas d'historique officiel, pas de « La suite ».**
- **Manque :** bandeau dégradé + zodiaque ; **jauge de niveau + historique des tournois officiels** ; style StatTile ; carte/écran **« La suite »**.
- **Fait quand :** le profil ouvre sur un bandeau vert dégradé avec le zodiaque, la carte niveau montre une jauge + l'historique officiel, et « La suite » mène à un écran listant les fonctions de la version connectée.

### 3.5 Transverse §A
- **États vides chaleureux** partout (icône + phrase + 1 CTA).
- **BottomSheet d'annulation** de réservation avec **politique visible**.
- **Micro-animations `Reveal`** (cartes qui montent à l'apparition) + pression sur les boutons + pastille `lime` qui pulse.
- ⛔ **Ne PAS** ajouter d'écran « Victoire / Défaite » ni « parties à valider » (supprimé en v4 — rester supprimé).

---

## 4. ÉCRANS — §B (maquettés OUI, câblés NON : dépendent du serveur)

Ces écrans **existent dans la maquette** et peuvent être posés en **statique** pour la démo, mais leur **logique relève du serveur** — ne pas faire de « faux » fonctionnel maintenant :

- **Espace Club** : Planning (`PlanningGrid` + réception de réservation à confirmer) · Page & tarifs (édition vitrine) · **Créer un tournoi** · **Demandes de tournoi** (valider/refuser les tournois créés par des joueurs) · **Valider l'équipe gagnante** (seul endroit qui écrit +0.50 / −0.25, irréversible).
- **Console opérateur** : décompte hebdo + **commission cumulée (or)** + clubs à valider · accès par **geste secret** (appui long 3 s sur le logo) + **code PIN**. **Aucun bouton visible ailleurs.**
- **Croissance/qualité** : Centre de notifications · Anti no-show (doux, après 2 absences) · **Parrainage WhatsApp** · Score de fiabilité **privé** (club only, jamais public) · Avis vérifiés (après réservation honorée) · Heures creuses · **Stats club** (`BarChart`) · Décompte exportable (PDF/WhatsApp).
- **Robustesse** : mode hors-ligne léger · onboarding 100 % téléphone (+225, au branchement de l'auth).

**Règle de sécurité :** le gating des rôles est **serveur**, pas seulement visuel. La carte « Espace Club » est **absente du DOM** pour un non-gérant (pas masquée en CSS). La Console n'est jamais dans la navigation normale.

---

## 5. « Et mieux encore » — mes suggestions (optionnel, sur la même ligne, sans FIP ni auto-déclaration)

1. **Photos réelles = le vrai levier premium.** Le bundle n'en fournit pas → mets en place une mini-collecte : à l'embarquement d'un club, demande-lui **3 photos par WhatsApp** (terrain, ambiance, extérieur). Le composant `ClubPhoto` les affiche déjà avec repli automatique. Tant qu'elles manquent, garde le repli doré.
2. **Animation `Reveal` + pastille `lime` qui pulse** = le « waw » le moins cher. À généraliser (apparition des cartes, dispo en direct).
3. **Pression bouton** (léger scale au `:active`) pour un feeling « natif » même sur le web.
4. **Skeletons** de chargement sur les cartes club (au lieu d'un blanc).
5. **Accessibilité** : le passage `faint → #7C857B` est important ; vérifier le contraste du texte blanc sur photo (d'où le `scrimStrong`).
6. **Une seule action principale par écran**, toujours en bas, en pill `signature` (cohérence totale).
7. **Cohérence du tutoiement** (« ton prochain match », « choisis un créneau ») — déjà adopté, à garder partout.

---

## 6. Ordre d'exécution conseillé (lots vérifiables)

- **Lot 1 — Socle + Kit** *(impact fort, risque faible)* : tokens (e1/e2/e3, hairline, scrim, radius.xs, renommer `gold`), dégradés, Button pill + e2, Card e1 + hairline, SegmentedControl, **StickyBar**, **ClubPhoto/PhotoHeader**, **BottomSheet**.
  *Validé quand :* l'app entière « respire » premium sans qu'aucun écran ait encore été retouché en profondeur.
- **Lot 2 — Écrans cœur §A** : Accueil → Fiche club (PhotoHeader + sticky) → Réserver (Stepper) → Profil (jauge + zodiaque + « La suite »). États vides + sheet annulation + `Reveal`.
  *Validé quand :* les 4 écrans correspondent à la maquette à l'œil, et « Réserver »/« dès {prix} » collent en bas sur la fiche club.
- **Lot 3 — Maquettage §B (statique)** *(optionnel pour la démo)* : Espace Club, Console opérateur, Notifications, Parrainage… **sans logique serveur**.
- **Plus tard — Vraie version (serveur/Supabase)** : câblage §B (gating rôles, PIN, notifications, fiabilité, avis vérifiés, hors-ligne, décompte exportable).

---

## 7. Garde-fous (à ne jamais casser)
- **Zéro couleur en dur** : tout via tokens. **Aucune lib de composants externe** : kit maison.
- **Niveau = tournois officiels uniquement** (+0.50 / −0.25). **Jamais** d'auto-déclaration de match.
- Pas de paiement dans l'app · pas de classement public · 100 % français · prix en **FCFA** · sessions **1h30**.
- **Ne plus jamais parler du FIP.** Commission **10 %** hors app (jamais au-dessus), par semaine, WhatsApp + Wave.
- **Pas de barre d'onglets** : l'Accueil est le hub.
