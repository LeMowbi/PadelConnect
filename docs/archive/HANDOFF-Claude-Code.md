# PadelConnect — Handoff design → Claude Code

> Document à coller tel quel dans Claude Code. Il décrit **uniquement le design et l'UX** à appliquer.
> **Ne change pas la logique métier existante.** Tout passe par les **tokens** (zéro couleur en dur), et tout réutilise/fait évoluer le **kit maison** (pas de lib externe, pas de composant jetable).
> Référence visuelle : maquettes HTML `PadelConnect — Maquettes.dc.html` (24 écrans, 7 sections).
>
> **⚠️ Ce document est rangé par NATURE, pas par priorité brute :**
> - **§A — Refonte visuelle (à faire maintenant, prototype)** : pur design, fort impact, faisable en mono-appareil.
> - **§B — Fonctions à réserver à la vraie version (serveur / Supabase)** : n'ont de sens qu'avec un backend (notifications réelles, fiabilité entre appareils, hors-ligne synchronisé). En prototype on ne ferait que de l'apparence « fausse » — **ne pas implémenter pour de vrai maintenant**.
>
> **🚫 Décision actée — pas d'auto-déclaration de résultat.** Le système « Victoire / Défaite / parties à valider » a été **supprimé en v4** (c'était le bug n°1 du tout premier audit). **Une partie jouée = une réservation passée, jamais déclarée.** Le **niveau de jeu ne bouge QUE via les tournois officiels** (**+0.50** en cas de victoire de tournoi, **−0.25** sinon). Ne réintroduire sous aucune forme l'auto-déclaration de match.

---

## 0. Décisions verrouillées (ne pas remettre en cause)
- **Pas de barre d'onglets** : l'Accueil est le hub, tout s'ouvre par-dessus, le retour ramène à l'Accueil.
- **Aucun paiement dans l'app** (réservation seule, tarif réglé au club). Sessions **1h30**.
- **Aucun classement public** de joueurs ni de clubs (clubs présentés à égalité, ordre alphabétique).
- **100 % français** (apostrophes/guillemets typographiques `'` `«  »`), prix en **FCFA**.
- **Niveau de jeu 1.0–7.0** affiché ; mini-fiches « Suivre » conservées.
- **Le niveau ne bouge QUE via les tournois officiels** : **+0.50** (victoire de tournoi) / **−0.25** (sinon). C'est **le créateur du tournoi** (club OU joueur organisateur) qui **désigne l'équipe gagnante** à la fin — validation unique et irréversible qui applique les ajustements. **Aucune** auto-déclaration de match Victoire/Défaite, aucune « partie à valider » — supprimé en v4, ne pas réintroduire.
- **Tournois créés par joueur → validés par le club** : un joueur peut créer un tournoi, mais il reste *en attente* jusqu'à validation du club hôte (modération). Un club crée directement.
- **Réserver garde ses deux entrées** : onglets **« Par heure »** et **« Par club »** (SegmentedControl). Le parcours guidé en étapes (ci-dessous) vient *après* ce choix, il ne le remplace pas.
- Mobile-first (téléphone réel) mais doit rendre correctement sur le web.

---

## 1. TOKENS

### 1.1 Couleurs (existant — inchangé)
```
bg            #F4F1E8   // fond crème chaud
surface       #FFFFFF   // cartes
surfaceAlt    #ECE8DC
border        #D8D2C4   // contour de carte

signature     #0A6B5D   // CTA, héros, sélection, prix  (clé historique « gold » → à renommer, voir 1.4)
signatureDark #00544D   // dégradés signature
onSignature   #FFFFFF

success       #1E9E73   // disponibilité, victoire, validé
blue          #3C85D4   // univers Coachs / info
coral         #E0653A   // univers Découvrir / alertes douces
violet        #7C5CD6   // univers Tournois / récompenses
goldChampagne #C2922B   // Sponsorisé, trophées, commissions opérateur
lime          #C6F24A   // énergie / logo / pastille « live » (usage RARE)

text          #0C1A16
muted         #5C6B62
danger        #E5484D
```
Chaque couleur garde sa version **« soft »** (fond translucide 10–16 %) pour tags/puces.

### 1.2 Couleurs — MODIFIÉ / NOUVEAU
```
faint     #97A096 → #7C857B   // MODIFIÉ : ~4,6:1 sur le crème, passe WCAG AA
hairline  #ECE7DB             // NOUVEAU : séparateurs INTERNES (lignes de listes/tarifs) ≠ border de carte
scrim     rgba(12,26,22,0.55) // NOUVEAU : overlay bas de photo + fond des bottom sheets
```
Règle : texte essentiel = `muted` ; `faint` réservé aux libellés ≥ 15px.

### 1.3 Élévations — NOUVEAU (remplace l'ombre unique)
```
shadow.e1  0 4px 12px rgba(26,42,32,0.06)    // cartes au repos
shadow.e2  0 10px 24px rgba(26,42,32,0.10)   // héros, CTA primaire, carte club, entrée Espace Club
shadow.e3  0 20px 40px rgba(12,26,22,0.18)   // bottom sheets, modales
```

### 1.4 Espacements / rayons / typo
```
spacing   xs4  sm8  md12  lg16  xl24  xxl32  xxxl48
radius    xs6 (NOUVEAU, petites puces/tags)  sm10  md14  lg20  xl28  pill999
typo      titres/chiffres/boutons = « Bricolage Grotesque » (600/700/800), corps = système
tailles   xs11 sm13 md15 lg17 xl22 xxl26 display32
gradient.hero       [#CBE7DB → #EFE9DA → #F4F1E8]   // un cran plus profond en haut
gradient.signature  [#0A6B5D → #00544D]
```

### 1.5 Refactor à faire
- Renommer la clé `gold` → **`signature`** (c'est le vert profond). Pur refactor, supprime une dette de confusion design↔dev.

---

## 2. ÉVOLUTIONS DU KIT (faire évoluer l'existant, pas de composant jetable)
- **Button** : `primary` reçoit `shadow.e2` ; ajouter une variante **`pill`** (rayon `pill999`) utilisée pour tous les CTA pleine largeur.
- **Card** : `shadow.e1` par défaut + séparateurs internes en **`hairline`** (plus en `border`).
- **SegmentedControl** : piste active = pastille `signature` blanc dessus + légère ombre.
- **CTA collant (sticky bottom bar)** : barre fixe blanche en bas (bordure haute `border`, `shadow` montante), **prix à gauche + bouton pill à droite**. À utiliser sur Fiche club, Réserver, Tournoi, Coach, Onboarding, Édition club.
- **BottomSheet** : poignée + titre + corps + 2 boutons (neutre `surfaceAlt` / action). Fond = `scrim` + sheet `shadow.e3`.
- **PhotoHeader** (NOUVEAU) : photo plein cadre + `scrim` bas + titre/badges en surimpression.
- **Stepper** (NOUVEAU) : barre de progression à N segments (réservation guidée, création tournoi).
- **StatTile** (NOUVEAU) : grand chiffre Bricolage 800 + libellé `muted` (Profil, Fiche club, Stats club, Console).
- **PlanningGrid** (NOUVEAU) : terrains × créneaux, états `réservé`(signature) / `libre`(surface+border) / `bloqué`(hachures `surfaceAlt`).
- **BarChart** (NOUVEAU, minimal) : barres verticales remplissage par plage (Stats club).
- **EmptyState** : illustration ronde douce + titre + 1 phrase + **1 CTA** (jamais une page morte).

---

## 3. MODÈLE D'ACCÈS DES RÔLES (important — sécurité)

**Un seul compte, des permissions côté serveur.** Tout le monde installe la même app et s'inscrit comme joueur. Le rôle est un flag serveur : `role: player | manager | operator`. **Jamais déductible depuis l'app installée.**

- **Joueur** : vue par défaut. Aucune trace des autres rôles dans le rendu.
- **Gérant** : c'est un joueur dont un club a été **validé par l'opérateur** → son compte reçoit `manager:true` + `clubId`. L'app affiche alors **une seule entrée en plus** : la carte **« Espace Club »** dans Réglages. Pour tous les autres, cette carte est **absente du DOM** (pas masquée en CSS). Aucune URL publique.
- **Opérateur (toi seul)** : `role:operator` lié à **ton numéro +225**, validé serveur. **Aucun bouton nulle part.** Accès via **geste secret** (appui long 3 s sur le logo) → écran **code PIN**. Le PIN est une 2ᵉ barrière. La Console ne fait jamais partie de la navigation normale.

> **Règle dev** : le gating est **serveur**, pas seulement visuel. Ne jamais livrer au client les écrans/données d'un rôle qu'il ne possède pas.

---

## 4. INVENTAIRE DES ÉCRANS (par rôle) + ce qui change

### Joueur — parcours principal
| Écran | Évolutions design |
|---|---|
| **Accueil (hub)** | Un seul héros (dégradé `gradient.hero` + CTA `signature` pill) ; rangée d'accès rapide 4 icônes (1 univers/couleur) ; carte « Votre prochain match » ; clubs proches en cartes horizontales. |
| **Réserver** | Garder le SegmentedControl **Par heure / Par club**. Prix **sur chaque créneau**. Créneau pris = barré + « Complet ». Parcours guidé (Stepper) après le choix. |
| **Fiche club** | `PhotoHeader` + `scrim` ; chips infos (note/terrains/distance) ; tarifs par plage en SegmentedControl ; offre `Sponsorisé` (or) ; **sticky bottom** « Réserver ». |
| **Profil** | Bandeau signature + avatar anneau dégradé ; carte **Niveau** (bouge uniquement via tournois officiels, voir §5) ; 3 `StatTile` ; trophées (or) ; palmarès. |

### Joueur — gérer / jouer / découvrir
Mes réservations (à venir/passées + **annulation en bottom sheet**, politique visible) · Fiche tournoi (univers violet, inscription par équipe, clôture, places) · Fiche coach (contact **appel**, **pas de réservation in-app**) · Amis & Suivis (+ **mini-fiche joueur** « Suivre » / « Inviter à jouer ») · Découvrir le padel (éditorial) · Onboarding (téléphone +225, niveau dès le départ).

### Gérant — Espace Club
Planning (`PlanningGrid` + réception de réservation à confirmer) · Page & tarifs (édition vitrine, visibilité, tarifs par plage) · **Créer un tournoi** (nom, date, format, places, récompenses, inscription, niveau → Publier) · **Demandes de tournoi** (valider/refuser les tournois créés par des joueurs avant publication) · **Valider l'équipe gagnante** (à la fin du tournoi, l'organisateur désigne le vainqueur → applique +0.50 / −0.25 ; irréversible).

**Flux de création de tournoi** : un **club** crée → publié directement. Un **joueur** crée (même formulaire) → statut *en attente* → le **club hôte valide** (ou refuse) → publié. Un tournoi créé par un joueur n'est **jamais visible** avant validation du club.

### Opérateur
Console (décompte hebdo, **commission cumulée** en `DataHero` or, clubs à valider, boosts).

### Accès & rôles
Réglages joueur · Réglages gérant (carte conditionnelle Espace Club) · Déverrouillage opérateur (PIN).

---

## 5. FONCTIONNALITÉS — par nature

> Classées selon la réalité de faisabilité, pas par envie. **§A** = design pur, faisable maintenant en prototype. **§B** = dépend du serveur, à garder pour la vraie version.

### §A — À FAIRE MAINTENANT (refonte visuelle, prototype mono-appareil)
Du design à fort impact, sans backend requis :
- **Accueil (hub)** : un seul héros, accès rapide 4 univers, prochain match, clubs proches.
- **Fiche club** : `PhotoHeader` + `scrim` + sticky bottom bar « Réserver ».
- **Réserver** : SegmentedControl **Par heure / Par club** conservé + `Stepper` après le choix + prix par créneau.
- **Profil** : carte Niveau (affichage tournois-only, voir ci-dessous) + 3 `StatTile` + trophées + palmarès.
- **États vides chaleureux**, bottom sheets (annulation + politique visible), micro-animations `Reveal`.
- **Mes réservations** : à venir / passées. *(Une partie jouée = une réservation passée — jamais un résultat à déclarer.)*

**Niveau de jeu — affichage (tournois uniquement)**
- La carte Profil montre le niveau actuel (1.0–7.0) et **d'où il vient** : « Évolue via les tournois officiels (**+0.50** victoire / **−0.25** sinon) ».
- Le niveau **peut monter ou descendre**, mais **uniquement** sur résultat de tournoi officiel.
- ⛔ **NE PAS** implémenter : bouton/écran « Victoire / Défaite », « parties à valider », confettis de match auto-déclaré, ajustement de niveau hors-tournoi. (Supprimé en v4, ne pas revenir en arrière.)
- Le moment « waw » (confettis `Confetti` + carte partageable) reste possible mais **rattaché à un résultat de tournoi officiel**, pas à un match déclaré.
- **Source unique du mouvement de niveau** : l'écran organisateur **« Valider l'équipe gagnante »** (voir §4, Espace Club). C'est le seul endroit qui écrit un changement de niveau.

### §B — À RÉSERVER À LA VRAIE VERSION (serveur / Supabase)
N'ont de sens qu'avec un backend ; en prototype on ne ferait que de l'apparence « fausse ». **Maquettes dispo comme référence, mais ne pas câbler maintenant.**

**Confiance & qualité** (multi-appareils → serveur)
- **Score de fiabilité PRIVÉ** (présences/absences), visible par le club uniquement, **jamais public**.
- **Avis vérifiés** : noter un club **seulement après une réservation honorée**.
- **Signalement / litige** discret remontant à l'opérateur.

**Croissance / rétention** (push & état partagé → serveur)
- **Centre de notifications** unifié (réservation confirmée, place libérée, réponse club, rappel de match, niveau MAJ).
- **Anti no-show (doux)** : après **2 absences non annulées**, confirmation de présence à la réservation suivante (ton non punitif).
- **Parrainage** : lien partageable via **WhatsApp** + compteur d'amis ayant rejoint.
- **Rappel + itinéraire** : push J-1 et H-2 avec bouton Maps.

**Business (gérant / opérateur)** (données centralisées → serveur)
- **Heures creuses dynamiques** : remise H-2 sur créneau vide ; prix remisé en `success`.
- **Stats club** : remplissage par plage (`BarChart`), créneau le plus demandé, KPI semaine.
- **Décompte hebdo exportable** (PDF / partage WhatsApp).
- **Boost / Sponsorisé** d'un club ou tournoi (tag or `goldChampagne`).

**Robustesse terrain ivoirien**
- **Mode hors-ligne léger** : cache clubs + créneaux + file d'actions à resynchroniser (nécessite la couche serveur pour la synchro).
- **Onboarding 100 % téléphone** (+225), pas d'email — ça, faisable au moment de brancher l'auth.

**Accès opérateur** (gating serveur → vraie version)
- Geste secret (appui long logo) + **code PIN** ; rôle lié à ton numéro côté serveur (voir §3).

---

## 6. RÈGLES TRANSVERSES (waw, cool, simple)
1. **Une action principale par écran**, toujours en bas, bouton pill `signature`.
2. **Micro-animations discrètes** (composant `Reveal` existant) : cartes qui montent à l'apparition, légère pression sur les boutons, pastille `lime` « live » qui pulse sur les dispos.
3. **Photos réelles plein cadre** sur clubs/coachs (remplacer les placeholders) — c'est 80 % de l'effet premium. Toujours sous `scrim` quand du texte est par-dessus.
4. **Un univers = un accent.** Le vert `signature` est le seul fil rouge transversal (CTA, sélection, prix). Les autres couleurs restent cantonnées à leur univers.
5. **États vides chaleureux** : jamais une page morte, toujours une illustration + une action.
6. **Zéro jargon, tout en FCFA**, phrases courtes — pensé pour le grand public débutant.

---

## 7. CHECKLIST D'IMPLÉMENTATION

### ▶ MAINTENANT — prototype (design pur)
**Lot 1 — base visuelle (impact fort, risque faible)**
- [ ] `faint` → `#7C857B` ; ajouter `hairline`, `scrim`, `radius.xs`.
- [ ] Remplacer l'ombre unique par `shadow.e1/e2/e3`.
- [ ] Renommer `gold` → `signature`.
- [ ] Faire évoluer Button (pill + e2), Card (e1 + hairline), SegmentedControl, sticky bottom bar.

**Lot 2 — écrans cœur (§A)**
- [ ] Accueil ; Fiche club (PhotoHeader+scrim+sticky) ; Réserver (Par heure/Par club + Stepper) ; Profil (carte Niveau **tournois-only**).
- [ ] États vides + bottom sheet annulation (politique visible) + micro-animations `Reveal`.
- [ ] ⛔ Ne PAS ajouter d'écran Victoire/Défaite ni « partie à valider ».

### ⏸ PLUS TARD — vraie version serveur (§B, ne pas câbler maintenant)
- [ ] Centre de notifications (push).
- [ ] Score de fiabilité (vue club) ; avis vérifiés ; signalement.
- [ ] Anti no-show ; parrainage WhatsApp ; rappel + itinéraire.
- [ ] Espace Club câblé : Planning live, Heures creuses, Stats club, Décompte exportable.
- [ ] Modèle d'accès (gating serveur) + Console opérateur (PIN + geste secret).
- [ ] Mode hors-ligne + file d'actions ; onboarding téléphone (à l'auth).

> Note : les écrans Espace Club / opérateur peuvent être **maquettés** maintenant (statique) si tu veux les montrer, mais leur **logique** relève du serveur.

---

### Rappels finaux
- Zéro couleur en dur : **tout via tokens**.
- Aucune lib de composants externe : **kit maison** uniquement.
- Ne pas casser la logique existante : ce handoff est **visuel/UX**.
- **Niveau = tournois officiels uniquement** (+0.50 / −0.25). Pas d'auto-déclaration de match.
- Conformité produit : pas de paiement, pas de classement public, 100 % FR, FCFA, sessions 1h30.
