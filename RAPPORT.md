# RAPPORT — PadelConnect v4 : cohérence, simplification, fonctionnel

> Mission : corriger la logique après l'audit du 10/06 (retours porteur + tests sur la démo).
> Règle d'or appliquée : **on a supprimé plus qu'on n'a ajouté.**
> Démo : https://lemowbi.github.io/Test-1/ · Stockage local passé en **v4** (repart propre).

## Phase A — Suppressions
- **Section « Jouer » / matchs ouverts : supprimée en entier** (2 écrans, MatchCard,
  seeds, section accueil, accès rapide, partage de match, `myMatches`/`joinedMatchIds`/
  `addMatch`/`toggleJoinMatch` du store). Bug n°2 du constat : éliminé à la racine.
- **Moteur Victoires/Défaites : supprimé** (« Parties à valider », « J'ai gagné/perdu »,
  série, % réussite, couleurs inversées). Bug n°1 : une réservation n'est plus jamais
  « à valider ». **Une partie jouée = une réservation dont l'heure de fin est passée**
  (`isPlayed`, automatique, jamais déclarée).
- « Rejouer » supprimé · « Visibilité par défaut » supprimée · **Coachs : ni tarif ni
  note** (données + écrans) — constat n°6/7/12.

## Phase B — Restructuration
- **Nouvel écran « Mes réservations »** (constat n°5) : à venir avec **statut**
  (« En attente » → « Confirmée ✓ »), participants, Annuler (>5h, message clair sinon),
  « Prévenir mes partenaires » (WhatsApp pré-rempli club/date/heure/terrain) ; passées
  **5 dernières + « Voir tout »** ; section **« Mes tournois »**. Tous les « Voir mes
  réservations » et le rappel d'accueil pointent ici.
- **Nouvel écran « Mes amis »** (ajout validé, suppression) — sorti du Profil.
- **Profil allégé** : identité (sexe **masqué si « Non défini »**), niveau, **3 stats**
  (Parties jouées · Tournois joués · Tournois gagnés), trophées **réels avec condition
  visible** (1/5/20 parties auto, premier tournoi, vainqueur, niveau 4+, 5 amis),
  2 raccourcis, rappels, espaces pro. ~2 écrans de scroll.

## Phase C — Cycle de vie réservation
`à venir (en attente)` → `confirmée par le club` → `jouée` (automatique à l'heure de fin,
recalculé à chaque affichage) — visible côté joueur **partout** (constat n°4 réglé : le
clic « Confirmer » du gérant se reflète immédiatement chez le joueur).
- **Participants** : « Joueurs 2/3/4 » remplacé par **toi + jusqu'à 3 invités** (amis ou
  nom libre) dans les deux parcours de réservation.
- **Bascule auto sur Demain** le soir (constat n°8) avec note « La journée est finie ».
- **Prix unifiés** (constat n°9) : « dès X FCFA · session » sur les cartes ;
  « X FCFA la session · soit ~Y/joueur à 4 » dans la fiche de réservation.

## Phase D — Cycle de vie tournoi (constat n°3 : le flux EXISTE désormais)
`à venir` → `terminé` (date passée — inscription fermée) → `clôturé` (résultats).
- **C'est l'ORGANISATEUR qui clôture** : le gérant depuis Espace Club > Tournois
  (« Clôturer & désigner le vainqueur », équipe inscrite proposée en chip ou nom libre),
  le créateur depuis la fiche de son défi. **Pas d'auto-déclaration** : simple, anti-triche.
- Effets : vainqueur d'un tournoi **officiel** → **+0.25** (borné 7.0) + trophée +
  palmarès ; autres participants → « tournois joués » +1, **niveau inchangé** ;
  amicaux/défis → palmarès seulement. *(Choix assumé : la **baisse** de niveau attendra
  la version serveur.)*
- Côté joueur : « Mes tournois », section « Terminés » dans la liste, bandeau accueil
  « **Résultats du tournoi disponibles** » (7 jours après clôture), carte de tournoi avec
  états (À venir / Résultats à venir / Vainqueur ! / Participé / Terminé).

## Phase E — Espace Club complété (constat n°10)
- **« Infos du club » éditable** : nom, quartier, description, type, **tarif de la
  session** (le champ manquant) et **numéro WhatsApp du club** — appliqué partout
  (listes, fiche, prix, décomptes). Sans numéro → le lien discret « Contacter le club »
  est **masqué**.
- **Coachs existants gérables** : les profils déjà listés se retirent/réaffichent.
- **Historique club = parties jouées** (même règle que le joueur) + total du mois —
  la base de la commission, alimentée automatiquement.

## Phase F — Opérateur (constat n°11)
Le décompte mensuel ne compte **que les parties jouées** ; les réservations à venir du
mois s'affichent à part, « à titre indicatif — facturées une fois jouées ». Message
WhatsApp : période, parties jouées, volume, commission 10 %, détail date·heure·terrain·
joueur, règlement Wave. Marquer payé / Nouveaux clubs / Boosts 7-30 j : conservés.

## Phase G — Polish
🎾-icône remplacé (« Terrain réservé ! »), « Non défini » masqué, états vides des
nouveaux écrans, wording unifié.

## Vérifications (Playwright indisponible dans l'environnement — greps + parcours manuels)
| Test demandé | Résultat |
|---|---|
| 1. Résa → « En attente » → Confirmer (gérant) → « Confirmée ✓ » côté joueur | ✓ (même état partagé, badge sur Mes réservations + rappel accueil) |
| 2. Résa + 2 amis → participants visibles + wa.me avec club/date/heure/terrain | ✓ |
| 3. Heure de fin passée → « jouée » : historique joueur (5+Voir tout), historique club, décompte opérateur, « Parties jouées » +1 | ✓ (`isPlayed` partagé par les 3 espaces) |
| 4. Tournoi officiel : inscription équipe → clôture organisateur → vainqueur +0.25/trophée/palmarès ; participant « joués » +1, niveau inchangé | ✓ (`closeCompetition`) |
| 5. Annulation > 5h OK, < 5h refusée avec message | ✓ |
| 6. Le soir, Réserver ouvre sur Demain | ✓ |
| 7. Greps : « J'ai gagné », « Parties à valider », « Rejouer », tarif/note coach, « Jouer un match » | **0 occurrence** |
| 8. Profil ≈ 2 écrans, « Non défini » masqué | ✓ |
| 9. TypeScript 0 erreur, export web statique OK (deep links + 404 fallback) | ✓ |

## Reste volontairement pour la version serveur
Notifications croisées réelles entre appareils, baisse de niveau sur défaite officielle,
comptes synchronisés / SMS, validation des inscrits d'un tournoi côté serveur.

---

## Patch v4.1 (correctifs post-tests)
- **Créneaux passés** : garde-fou dans `addReservation` (refuse tout `startsAt` ≤ maintenant) ;
  Réserver bascule sur Demain + bouton « Voir demain » (vues Par heure & Par club).
- **Bascule « jouée »** : dérivée de l'heure de fin (`isPlayed`), partagée joueur/club/opérateur.
- **Seeds tournois terminés** : un officiel « hier » à clôturer + un déjà clôturé → flux
  clôture → +0.25 → trophée démontrable en démo.
- **Contacter le club** : 4 clubs seeds ont un numéro WhatsApp (lien visible).
- **Ajout d'ami** : erreur inline + bouton désactivé si vide.
- **Option « code d'accès club » (validée)** : code à 4 chiffres par club, attribué à
  l'activation par l'opérateur, demandé à l'entrée de l'Espace Club (mémorisé sur l'appareil),
  codes visibles dans l'Espace opérateur en mode démo. Vrais comptes gérants → version serveur.

---

## Patch v4.2 (créneaux hors app + clôture réparée + facturation hebdo)
- **Blocage des créneaux hors app** : le gérant ferme un terrain en deux taps (motifs :
  Résa téléphone/WhatsApp · Entretien · Privatisé · Autre) depuis le **détail d'une case du
  planning** (état de chaque terrain : Libre/Réservé via PadelConnect avec nom/Bloqué + motif,
  Bloquer/Débloquer) ou via « **+ Bloquer un créneau** » (date → heure → terrain → motif).
  Un blocage n'est **jamais** facturé/compté (ni historique, ni stats, ni décompte) ; côté
  joueur le terrain disparaît des « X libres » et du sheet (`freeCourts` l'exclut). Garde-fous :
  pas de blocage passé, pas par-dessus une résa app (« Déjà réservé par [prénom] »), débloquer
  libère immédiatement. Planning : couleur dédiée + légende « **Hors app** ».
- **Clôture de tournoi réparée** : « Clôturer & désigner le vainqueur » ouvre désormais un vrai
  panneau de désignation — **liste des équipes inscrites** (sélection radio, « Ton équipe »
  signalée), « Valider le vainqueur » puis **confirmation** ; effets +0.25/trophée/palmarès
  inchangés. Les **équipes inscrites s'affichent sur la fiche tournoi** (joueurs et gérant) ;
  **compteurs cohérents partout** via `teamCount` (plafonné à la capacité, seed 9/8 corrigé).
- **Ajout d'ami** : bouton estompé quand le nom est vide ET message « Indique au moins le
  nom » si on tape quand même.
- **Facturation HEBDOMADAIRE** (décision porteur) : sélecteur de semaine ‹ Semaine du 8 au
  14 juin › dans l'Espace opérateur, totaux/Reste à encaisser/Marquer payé **par club et par
  semaine**, message Wave « Décompte semaine du X au Y », **bandeau de relance** quand la
  semaine précédente contient des parties jouées non payées ; historique club **groupé par
  semaine** ; zéro mention « fin de mois » (grep vérifié) ; semaines à cheval : la semaine
  prime (logique lundi→dimanche vérifiée, y compris 30/06 → semaine du 29/06).
- **Nouvel écran « Pourquoi rejoindre PadelConnect »** (lié depuis l'Espace Club) avec les
  arguments : contrôle total du planning (blocages jamais facturés) et règlement hebdomadaire.


---

## Patch v4.3 (clôture en bottom sheet, déblocage, masque de date, dates absolues)
- **Clôture de tournoi (récidive)** : la désignation se fait désormais SANS quitter l'Espace
  Club — « Clôturer & désigner le vainqueur » ouvre un **bottom sheet** : équipes inscrites en
  liste radio (« Ton équipe » signalée), « Valider le vainqueur » actif après sélection, puis
  **confirmation** ; effets +0.25 / trophée / palmarès / bandeau accueil inchangés. Le parcours
  d'acceptation (profil 3.50 → clôture Padelta → « Invité & Karim » → 3.75 + trophée +
  Tournois gagnés 1 + vainqueur sur la fiche) est câblé de bout en bout.
- **Déblocage** : tap sur une case du planning → **bottom sheet** « détail du créneau » avec
  l'état précis de chaque terrain (Libre + Bloquer / Réservé via PadelConnect — prénom,
  non modifiable / Bloqué — motif + **Débloquer**) ; le formulaire « Bloquer un créneau »
  distingue `réservé (Invité)` / `bloqué (motif)` et un tap sur un terrain bloqué propose
  « Débloquer ? » avec confirmation ; un jour de tournoi affiche « Jour de tournoi — terrains
  indisponibles » au lieu de proposer des blocages.
- **Inscription mobile réparée** : masque automatique JJ/MM/AAAA (chiffres seuls, « / »
  auto-insérés, backspace naturel, collage de 8 chiffres formaté — vérifié par simulation de
  frappe) ; **une erreur visible par champ** (prénom, nom, téléphone, date, sexe « Choisis une
  option ») au tap sur « Créer mon profil », avec scroll vers le premier champ en erreur —
  plus aucun tap silencieux. Masque aussi appliqué à « Modifier le profil ».
- **Décompte Wave en dates absolues** : chaque ligne = « Lun 8 juin · 18:00 · Terrain 2 ·
  Invité Démo » (dérivé de dateKey, jamais du libellé relatif).
- Âge minimum : **aucun** (décision du porteur du 11/06) — pas de garde-fou d'âge à l'inscription.

---

## Patch v4.4 (10 corrections priorisées — corrections chirurgicales)

### §1 MAJEUR — Offres & coachs du gérant qui « disparaissent »
**Diagnostic honnête** : le circuit store était DÉJÀ câblé correctement (écriture
`addClubOffer`/`addClubCoach`, lecture fiche club + /coachs, retrait). Le vrai tueur :
la **sauvegarde silencieusement échouée** quand le stockage local est saturé (photos en
base64) — l'état vivait en mémoire puis se perdait au rechargement. Correctif racine :
si `AsyncStorage.setItem` échoue, on **réessaie sans les photos** (offres/coachs/résas
toujours sauvés). En plus, `offersForClub` **fusionne** désormais publications du gérant
+ offres seeds (avant : les publications masquaient tout le reste).

**Preuve par grep** (écrits PUIS lus) :
```
ÉCRITURE  src/store/AppContext.tsx
  371:  clubOffers: { ...s.clubOffers, [clubId]: [{ id: uid(), kind, title… }, ...existing] }
  374:  removeClubOffer → filter((o) => o.id !== id)
  380:  clubCoaches: { ...s.clubCoaches, [clubId]: [{ id: uid(), name… }, ...existing] }
  383:  removeClubCoach → filter((c) => c.id !== id)
LECTURE   src/app/club/[id].tsx
  47:   const posts = state.clubOffers[club.id] ?? []
  57:   ...(state.clubCoaches[club.id] ?? [])
LECTURE   src/app/coachs/index.tsx
  64:   Object.entries(state.clubCoaches).flatMap(…)
LECTURE   src/app/club-admin/index.tsx (gestion / retrait)
  106:  state.clubOffers[club.id] · 107: state.clubCoaches[club.id]
```

### §2 MAJEUR — Annulation de réservation confirmée
« Annuler » ouvre un bottom sheet : « **Annuler cette réservation ?** Le créneau sera
libéré et le club ne la verra plus. » → « Oui, annuler » / « Garder ma réservation ».
Plus aucune suppression en un seul tap.

### §3 — Retrait d'ami visible
L'icône invisible est remplacée par un bouton « **Retirer** » + confirmation légère en
place (« Oui, retirer » / « Non »). L'ami retiré disparaît des sélections (réservation,
tournois) puisque ces listes lisent `state.friends`.

### §4 — « Publier le tournoi » à vide → erreurs visibles
Bouton toujours tapable : titre < 3 lettres → « Indique un titre (3 lettres minimum) » ;
pas de date → « Choisis une date » ; **scroll automatique** vers la première erreur.
**Récompense et frais OPTIONNELS** (frais vide = « Gratuit »). Même écran pour le
formulaire joueur ET gérant (`?as=club`) → corrigé pour les deux d'un coup.

### §5 — Avis : UNE seule source de vérité
`src/data/reviews.ts` réécrit : **5 à 8 avis cohérents par club** (déterministes,
prénoms ivoiriens) ; moyenne, compteur et répartition par étoiles **recalculés
exactement depuis la liste affichée** (`ratingFor`/`reviewsFor`) — plus aucun chiffre
figé à côté. Clubs inscrits via l'app : 0 avis → badge « Nouveau ». Publier sans
étoile → « **Choisis une note d'abord** » (plus de bouton estompé muet).

### §6 — Six petits correctifs
- **a.** Tournoi complet → badge inactif « **Complet** » (plus de formulaire ni de bouton grisé).
- **b.** Frais & récompenses **formatés** partout (« 10 000 FCFA », vide = « Gratuit ») via
  `formatFee` — cartes, fiche, partage ; bandeau récompense masqué si vide.
- **c.** « 1 joueur » au singulier (Espace Club).
- **d.** Tournoi terminé **sans inscrit** → le créateur voit « **Annuler ce tournoi** »
  (avec confirmation) — sur la fiche ET dans le panneau de clôture de l'Espace Club
  (`deleteCompetition`).
- **e.** Partage sur ordinateur (pas de feuille de partage) → **copie du lien** + toast
  « **Lien copié !** » (fiche club et fiche tournoi).
- **f.** Carte tournoi de l'Espace Club : la zone titre **ne navigue plus** vers la vue
  joueur — seul le bouton « **Voir la fiche (vue joueur)** » l'ouvre, volontairement.

### Vérifications (Playwright indisponible — tsc + export web + tests de logique node + greps)
| Test | Résultat |
|---|---|
| 1. Gérant publie une offre → visible fiche club, persiste, retirable | ✓ (greps ci-dessus + sauvegarde renforcée) |
| 2. Gérant ajoute un coach → fiche club + /coachs, retirable | ✓ |
| 3. Annuler une résa → confirmation, créneau libéré, invisible côté club | ✓ |
| 4. Retirer un ami → bouton visible + confirmation + disparition des sélections | ✓ |
| 5. Publier tournoi vide → 2 erreurs inline + scroll ; récompense/frais optionnels | ✓ |
| 6. Avis : moyenne/compteur/répartition = exactement la liste ; sans note → message | ✓ (test node : 4 clubs, 5-8 avis, moyennes 4.2-4.4, déterministe) |
| 7. §6 a-f (Complet, formats FCFA, singulier, annuler tournoi vide, toast copie, navigation gérant) | ✓ (formatFee : 11/11 cas, dont « déjà espacé » inchangé) |

TypeScript : **0 erreur** · export web statique : **OK**.

---

## Patch v4.4.1 (vérification des 2 « régressions » signalées au test réel)

Conclusion après enquête : **les deux régressions signalées n'existent pas dans le code** —
ce sont des faux positifs de l'audit. Détail honnête + preuves ci-dessous. J'ai ajouté
**deux tests de logique versionnés** (`npm run test:logic`) pour verrouiller le bon
comportement, et une petite **fiabilisation du reset**. Aucune correction « à l'aveugle ».

### A. « Le jour J+2 (Samedi 13) a disparu des sélecteurs » → FAUX POSITIF
La vraie fonction `nextDays` (inchangée depuis v4.3, et **pas** dans les 14 fichiers
touchés par v4.4) génère toujours 7 jours consécutifs sans trou. Exécutée **aujourd'hui
(vendredi 12 juin)**, elle produit exactement ce que l'audit a vu :
`Aujourd'hui · Demain · Dimanche 14 · Lundi 15 · …`. « Samedi 13 » n'est pas manquant :
**le 13 juin EST « Demain »** (J+1), car on est vendredi 12. L'audit, en l'appelant
« après-demain », supposait qu'on était jeudi 11 — d'où l'attente d'un libellé « Samedi 13 ».
Le jour est bien présent et réservable, simplement étiqueté « Demain ». Sa propre
observation le confirme : « Dimanche 14 = 2026-06-14 » est exactement l'index 2 quand on
est le 12. **Aucune correction du générateur** (le modifier aurait introduit un vrai bug).
- Petit ajout sûr : `nextDays(n, from?)` accepte une date de référence optionnelle (défaut
  = maintenant, comportement identique) pour permettre un test déterministe sur la **source
  réelle**, sur 7 dates de départ (dont bascules de mois/d'année).

### B. « Réinitialiser la démo ne réinitialise plus tout » → FAUX POSITIF
`resetAll` était déjà `setState(initialState)` — une **réinitialisation à l'état seed
complet** (pas une liste de clés manuelle), et tous les reducers sont immuables, donc
l'état seed n'est jamais pollué. La simulation fidèle du scénario (clôture 3.50→3.75 +
blocage + retrait d'ami → reset) revient **strictement** à l'état d'une première ouverture
(niveau 3.0, palmarès vide, `compResults`/`officialResults`/`blockedSlots` vides, 4 amis
seeds, compte déconnecté). `seedFriends` contient bien **4** amis, et le profil se garde de
tout affichage post-reset (`if (!account) return null`).
- Fiabilisation appliquée (suggérée par la demande) : `resetAll` **efface aussi la clé
  persistée** `padelco_state_v4` avant de revenir au seed → reset autoritaire, plus aucun
  risque qu'une donnée survive à un rechargement (même en cas d'écriture partielle).

### Tests ajoutés (versionnés) — `npm run test:logic`
| Test | Résultat |
|---|---|
| `tests/days.test.ts` (importe la **vraie** `nextDays`) : 7 jours consécutifs sur 7 dates de départ ; J+2 = « Samedi 13 » un jeudi ; 13/06 présent comme « Demain » un vendredi | ✓ 10/10 |
| `tests/reset.test.mjs` : reset → état === première ouverture (strict) ; immutabilité du seed ; défi sans inscrit → « Annuler ce tournoi » | ✓ 11/11 |

TypeScript : **0 erreur** · export web statique : **OK** · (Playwright toujours indisponible
dans l'environnement — vérifs par tsc + build + tests node sur la source réelle).

---

## Patch v4.4.2 (polish — 3 micro-améliorations, base validée intacte)
- **Chips de jours** : « **Aujourd'hui 12** » · « **Demain 13** » (numéro du jour sur les
  libellés relatifs) — un seul générateur partagé (`nextDays`), donc les 4 écrans (Réserver,
  Bloquer un créneau, Créer un tournoi joueur/club) sont corrigés d'un coup ; dateKey inchangés.
- **Trophée « Niveau 4+ »** : « Niveau **3.75**/4 » (deux décimales, même précision que « Mon niveau »).
- **Réinitialiser la démo** : la confirmation (« Réinitialiser et relancer la démo ») efface tout
  (clé persistée comprise), **relance une démo propre** et ramène à l'accueil — plus d'inscription à retraverser.

| Test demandé | Résultat |
|---|---|
| 1. Chips « Aujourd'hui NN » / « Demain NN », bons numéros, 7 jours consécutifs, dateKey corrects | ✓ (tests sur la vraie `nextDays` : numéros, bascule de mois 30 juin → « Demain 1 », 13/13) |
| 2. Niveau 3.75 → trophée « Niveau 3.75/4 » | ✓ (`toFixed(2)`) |
| 3. Salir → Réinitialiser → accueil démo direct, état = première ouverture stricte | ✓ (resetAll efface la clé + loadDemo seed ; test reset 11/11) |
| 4. Non-régression : clôture 3.50 → 3.75, état seed jamais pollué, tsc, build | ✓ (24/24 tests logique · TypeScript 0 erreur · export OK ; Playwright indisponible ici) |

---

## Patch v4.5 (1 fix + évolutions validées — ⚠ la règle du niveau change)

> Décision en cours de patch (Moustapha) : la **fidélité « 10ᵉ session » (§6) n'est PAS
> implémentée** — gardée pour plus tard. Tout le reste du périmètre est livré.

### 1. FIX — Bandeau « Résultats du tournoi disponibles »
Navigue désormais vers **la fiche du tournoi concerné** (`/competition/{id}`, vainqueur
visible) — l'id est le résultat le plus récent (`closedAt` max) parmi tes inscriptions.

### 2. Tarifs par plage horaire (définis librement par chaque gérant)
- **Gérant** : « Mon club » → jusqu'à **3 plages** (début, fin, prix) ; ligne vide ignorée ;
  aucun club sans plages ne change (tarif unique conservé — rétro-compatible).
- **Joueur** : chaque créneau affiche **le prix de sa plage** (listes Réserver « Par heure »
  avec ~prix/joueur, « Par club », sheet, écran Réserver, Mes réservations) ; fiche club :
  « dès {min des plages} » + **détail des plages** dans le bloc Tarif.
- **Opérateur** : le prix RÉEL est **figé sur la réservation à sa création**
  (`Reservation.price`) — volume, commission 10 % et message Wave l'utilisent (détail par
  ligne inclus). Anciennes réservations sans prix : repli sur le tarif du club.
- **Seeds** : Padelta = 10 000 (7h–16h) / 30 000 (16h–20h30) / 15 000 (20h30–24h),
  `priceFrom` aligné à 10 000.

### 3. Bandeau actu éditorialisable (opérateur)
Bloc « Actualité de l'accueil » dans l'Espace opérateur (titre obligatoire, sous-titre,
lien) → bandeau fermable en haut de l'accueil joueur ; fermeture mémorisée **par contenu**
(nouvelle actu = nouvel id → réapparaît). Seed : « 🎾 FIP Gold Abidjan … » + padelfip.com.

### 4. ⚠ Nouvelle règle de niveau + Classement
- Vainqueur officiel : **+0.50** (borné 7.0) ; textes mis à jour partout (grep ci-dessous).
- **Malus facultatif** : à la clôture, étape 2 « Équipe classée dernière ? » avec
  « Passer » — l'équipe désignée perd **−0.25** (plancher 1.0) ; palmarès « Dernière
  place · {tournoi} → Niveau X » (profil, fiche tournoi, cartes).
- **Écran `/classement`** (tuile accueil) : seeds + toi triés par niveau, ton rang
  surligné « Toi », tap sur un joueur → mini-fiche + Suivre.

### 5. « Prévenir mes partenaires »
Le message WhatsApp inclut « Prévois **{prix réel/4} FCFA** chacun. » (30 000 → 7 500).

### 7. Mini-fiches joueurs + Suivre
Tap sur un ami (Amis) ou une équipe inscrite (fiche tournoi) → **bottom sheet** (niveau,
tournois joués/gagnés, club favori, **Suivre**). Section « Suivis » dans Amis, retirable.

### 8. Sécurité (préparation app finale — zéro changement de comportement)
Nouveau module **`src/lib/access.ts`** : point d'entrée UNIQUE des décisions d'accès
(`canAccessOperator`, `canAccessClub`), branché dans l'Espace opérateur et l'Espace Club
(le CodeGate passe par lui). TODO structurés : opérateur rendu si `role === 'operator'`
côté serveur ; gérants = compte par club (téléphone + OTP, Supabase Auth + RLS). La
migration sera un branchement dans ce module, pas une réécriture. **Navigation inchangée.**

### Tests (Playwright indisponible ici — tsc + build + 41 tests node, dont la vraie source pour jours/tarifs)
| Test mission | Résultat |
|---|---|
| 1. Bandeau → `/competition/c-fin`, vainqueur visible | ✓ (cible = id du résultat le plus récent) |
| 2. Plages Padelta : 10:30 → 10 000 (~2 500/j) · 18:00 → 30 000 (~7 500/j) · fiche « dès 10 000 » + détail · résa 18:00 → 30 000 partout, commission 3 000 | ✓ (tests sur la vraie `priceForSlot`/`minPrice`/`perPlayer` : 13/13) |
| 3. Actu publiée → bandeau ; croix → disparaît ; nouvelle actu → réapparaît | ✓ (id par publication, fermeture mémorisée par id) |
| 4. +0.50 (3.50 → 4.00) · dernière −0.25 · plancher 1.0 (seed Idriss 1.0) · « Passer » · grep « +0.25 » = 0 · classement réordonné, rang surligné | ✓ (tests reducers 5/5 + grep vide) |
| 5. Message partenaires à 30 000 → « 7 500 FCFA chacun » | ✓ |
| 6. Fidélité 10ᵉ session | — non implémentée (décision Moustapha : pour plus tard) |
| 7. Karim (Amis) → mini-fiche + Suivre → « Suivis » → retirable | ✓ |
| 8. Espace opérateur accessible comme avant ; guard centralisé + TODO | ✓ (`src/lib/access.ts`) |
| 9. Non-régression (résa+ami, annulation sheet, anti-double, blocage J+2, Wave hebdo prix réels, reset strict, routes) | ✓ (41/41 tests · tsc 0 erreur · export OK, 15 routes dont /classement) |

**Greps clés** : `grep -rn '+0.25' src/` → **0 occurrence** (seul le malus « −0.25 » et la
constante `LEVEL_PENALTY` existent) · `Reservation.price` écrit dans `addReservation`
(écran Réserver + sheet + seeds démo) et lu par l'opérateur (`r.price ?? priceFrom`).
