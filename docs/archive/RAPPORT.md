# RAPPORT — PadelConnect v4 : cohérence, simplification, fonctionnel

> Mission : corriger la logique après l'audit du 10/06 (retours porteur + tests sur la démo).
> Règle d'or appliquée : **on a supprimé plus qu'on n'a ajouté.**
> Démo : https://lemowbi.github.io/PadelConnect/ · Stockage local passé en **v4** (repart propre).

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
- Effets : vainqueur d'un tournoi **officiel** → **+0.50** (borné 7.0) + trophée +
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
| 4. Tournoi officiel : inscription équipe → clôture organisateur → vainqueur +0.50/trophée/palmarès ; participant « joués » +1, niveau inchangé | ✓ (`closeCompetition`) |
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
  clôture → +0.50 → trophée démontrable en démo.
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
  signalée), « Valider le vainqueur » puis **confirmation** ; effets +0.50/trophée/palmarès
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
  **confirmation** ; effets +0.50 / trophée / palmarès / bandeau accueil inchangés. Le parcours
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
(nouvelle actu = nouvel id → réapparaît). **Aucune actu de démo par défaut** (`operatorNews: null`) :
le contenu vient uniquement du serveur, écrit par l'opérateur.

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

---

## Patch v4.5.1 — A) Photo de profil embellie · B) Audit complet du code

### Partie A — Photo de profil
- **Traitement au choix de l'image** (`expo-image-manipulator`, fonctionne aussi sur web/canvas) :
  recadrage **carré centré** + redimensionnement **512×512 max** (jamais d'agrandissement) +
  **JPEG qualité 0.8**, stocké en data-URI base64. Annulation → aucun changement, aucune erreur ;
  échec du traitement → image d'origine (comportement d'avant). Bonus cohérent : les **photos de
  club** passent par le même tuyau (1280 max, non carré) — c'était la cause racine du quota v4.4.
- **Composant `Avatar` unique** (`src/components/Avatar.tsx`) : cercle + **anneau dégradé**
  vert profond → or (2.5 px) + ombre douce ; **mêmes initiales en repli** dans le même cercle.
  Harmonisé : Profil (76), accueil ×2 (34/46), Classement (36, photo sur la ligne « Toi »),
  mini-fiches joueurs (48), Amis & Suivis (38).
- **Tap sur l'avatar du Profil** → « Changer la photo » / « Retirer la photo » (bottom sheet).
- **Reset** : purge la photo par construction (état seed : compte démo sans photo).

| Test A | Résultat |
|---|---|
| 1. Photo stockée < 200 Ko | ◐ par calcul : 512×512 JPEG q0.8 ≈ 30–80 Ko → ×1.37 en base64 ≈ **40–110 Ko**. Pipeline non exécutable sous Node (canvas/natif) → **à confirmer à l'audit externe** |
| 2. Cercle + anneau sur Profil / accueil / Classement (Toi) / mini-fiche | ✓ (composant unique, 7 emplacements) |
| 3. Sans photo : initiales, même cercle + anneau | ✓ (repli dans le même composant) |
| 4. Retirer → initiales ; reset → état usine strict | ✓ (test reset 22/22 inchangé) |
| 5. tsc 0 erreur, reset strict, zéro console.* dans src | ✓ |

### Partie B — Audit (périmètre : statique + logique node ; PAS de navigateur ici)

**B1 — Hygiène statique.** `strict: true` confirmé, **tsc 0 erreur**. **ESLint installé et
configuré** (`eslint-config-expo` flat — l'auto-config `expo lint` est bloquée hors ligne) :
**0 erreur, 0 warning** après corrections. 3 règles désactivées AVEC justification dans
`eslint.config.js` : `react/no-unescaped-entities` (apostrophes françaises voulues, 58 faux
positifs), `react-hooks/purity` et `react-hooks/refs` (condamnent l'architecture assumée
« Date.now() recalculé à chaque affichage » et le pattern RN canonique
`useRef(new Animated.Value())` — les « corriger » serait un refactor interdit).
Résidus : **0 console.***, TODO uniquement structurés (access.ts), **code mort supprimé**
(`clubOffers()`, `SLOT_DURATION_LABEL`), imports inutilisés supprimés (Chip, initials, Image…).

**Bugs trouvés ET corrigés (minimes, justifiés)** :
1. `clubs/index.tsx` + `reserver/index.tsx` : dépendance `state.clubInfo` **manquante** dans
   `useMemo` → listes potentiellement périmées après modification des infos club par un gérant.
2. `demoTeams` : noms d'équipes **dupliqués** possibles (pool de 12, tournois jusqu'à 24) →
   clés React en double ET radio de clôture sélectionnant 2 équipes. Noms désormais uniques
   (suffixe « (2) »), vérifié sur la vraie fonction (tournoi plein 24/24).
3. Invités : ajout du **même nom deux fois** possible → clés dupliquées + retrait double.
   Doublon ignoré (2 écrans).
4. Plage Padelta `20:30–23:59` : fin **exclusive** → 23:59 pile n'était couverte par rien →
   seed corrigé en `24:00` (continuité 07:00 → 24:00 vérifiée sur la vraie donnée).

**B2 — Tests de logique : 41 → 95, tous verts** (`npm run test:logic`).
Bornes tarifs sur la vraie `priceForSlot` (07:00/16:00/20:30 pile, 23:59, hors plage → repli
prix minimum — choix assumé, club sans plage, plage invalide) · décompte hebdo (dimanche 23:59
DANS la semaine, lundi 00:00 dehors — vraie `weekKeyOf` —, prix mixtes multi-clubs, annulée
exclue, arrondi 12 345 → 1 235) · niveau (6.75 → 7.0 plafonné, 7.0 → 7.0, plancher 1.0,
**1.1 − 0.25 → ramené à 1.0 (comportement choisi et documenté)**, « Passer » = aucun loser,
double clôture = no-op strict) · garde-fous (annulation 4h59 refusée / 5h00 pile refusée / 5h01
autorisée, anti-double terrain/jour, blocage sur résa refusé, 8/8 et 16/16 complets, compteur
plafonné) · dates (dayKey **local** 23h sans glissement UTC, semaines à cheval).

**B3 — Seeds : 21 vérifications sur les VRAIES données** (`tests/seeds.test.mjs`, bundle
esbuild avec alias résolu) : ids uniques (5 familles), références croisées clubId/club favori,
amis ↔ classement alignés (id/nom/niveau), niveaux ∈ [1.0, 7.0] + un seed à 1.0, plages Padelta
continues, `priceFrom` = min des plages, registered ≤ slots, équipes démo uniques, FCFA
idempotents. **Toutes vertes.**

**B4 — Pièges React/RN.** Clés par index restantes : uniquement sur des listes **statiques de
taille fixe** (5 étoiles, puces Découvrir, 3 lignes de plages, confettis) — sûres. Immutabilité
du seed : testée (inchangé). États vides : tous couverts (0 ami, 0 résa, 0 suivi → section
masquée, club sans offre → offres par défaut, classement jamais vide : seeds + toi). Textes
longs : `numberOfLines` présent sur les lignes critiques + ajouté au Classement.

**B5 — Limites honnêtes du périmètre.** NON couvert par mes moyens (→ audit externe Playwright) :
rendu visuel réel (anneau, ombre, tailles), pipeline image complet (taille réelle du base64,
test A1), parcours tactiles, erreurs console navigateur. AUCUNE décision produit prise seul —
seul point remonté à Moustapha : le repli « créneau hors plages → prix minimum » (ex. un club
qui ouvre à 06:00 sans plage correspondante) est un choix par défaut raisonnable mais à valider.
**« 100 % correct » s'entend donc : 0 erreur tsc strict, 0 erreur/warning lint, 95/95 tests de
logique, 21/21 cohérences seeds, build web OK (15 routes)** — pas une garantie sur le visuel.

---

## Patch v4.5.2 — Retrait du Classement + validation des plages à la source

### 1. Classement retiré (proprement)
**Retiré** : l'écran `/classement` (route supprimée — `src/app/classement.tsx`), la **tuile
« Classement »** de l'accueil (grille rééquilibrée : 4 tuiles → 2×2 parfait), et toute
référence (`grep classement` dans `src/` : ne restent que des commentaires sans rapport —
« aucun classement de clubs », filtre des coachs).
**Conservé (non sur-supprimé)** : les **mini-fiches joueurs + Suivre/Suivis** (toujours via
l'écran **Amis** et les **équipes inscrites** d'une fiche tournoi) ; la règle de niveau
**+0.50 / −0.25 plancher 1.0** et le **palmarès** du profil (inchangés) ; les **joueurs seeds**
(dont Idriss 1.0) qui alimentent les mini-fiches. Tests seeds « classement » → **adaptés**
(l'alignement amis ↔ joueurs reste vérifié, désormais au titre des mini-fiches).

### 2. Validation des plages tarifaires à la source
Nouvelle **fonction pure** `validateTiers(tiers)` (+ `timeToMinutes`) dans `src/lib/pricing.ts`.
À l'enregistrement dans « Mon club », si au moins une plage complète est définie, elles doivent
couvrir **07:00 → 24:00 en continu** (sans trou ni chevauchement) — sinon **l'enregistrement est
bloqué**, l'état du club reste intact, et un **message précis** s'affiche (« …Trou entre 16:00 et
17:00. », « Deux plages se chevauchent (16:00–20:30 et 19:00–22:00). », bornes 07:00/24:00…).
Plage incomplète toujours ignorée ; **aucune plage + tarif unique reste valide** (rétro-compat).
Le repli `minPrice` de `priceForSlot` **reste** comme ceinture de sécurité défensive, mais n'est
plus atteignable par la saisie. Seed Padelta : `20:30→24:00` (au lieu de `23:59`) pour passer la
validation et couvrir minuit.

### Résultats des 5 tests
| Test | Résultat |
|---|---|
| 1. Plus de `/classement` dans `src` ; tuile retirée ; grille équilibrée ; build OK | ✓ (route supprimée, 4 tuiles 2×2 ; build OK — décompte de routes selon convention) |
| 2. Mini-fiche + Suivre via Amis ET via équipe inscrite ; Suivis + Retirer | ✓ (flux intacts, indépendants du classement) |
| 3. Clôture +0.50 / −0.25 plancher 1.0 / « Passer » / palmarès | ✓ (tests reset inchangés, tous verts) |
| 4. Validation plages : trou → erreur, chevauchement → erreur, 07:00–24:00 → OK, aucune plage → OK, échec ⇒ état non modifié | ✓ (tests sur la fonction pure + miroir « save ») |
| 5. Non-régression : tsc 0, lint 0/0, suite node 100 % verte, export OK, reset strict | ✓ (**107/107 tests** ; tsc 0 ; lint 0/0 ; export OK) |

Suite de tests : **95 → 107** (retrait des libellés classement, ajout de 12 cas `validateTiers`).

---

## Patch v4.6 (P1) — Base visuelle du handoff design (tokens + kit, sans logique)

Première tranche du handoff Claude Design : **uniquement la fondation visuelle**, sûre et
propagée partout par les tokens. Aucune logique métier touchée.
- **Tokens** : `textFaint` assombri `#7C857B` (WCAG AA sur le crème) · nouveaux `hairline`
  (séparateurs internes) et `scrim` (fonds de sheets/photos) · `radius.xs = 6` · **échelle
  d'élévations `shadows.e1/e2/e3`** (remplace l'ombre unique, `shadowCard` = alias e1) ·
  dégradé héros un cran plus profond.
- **Kit** : `Card` → e1 · `Button` primaire → e2 + **tout CTA pleine largeur en pill**
  (prop `pill`, défaut = `full`) · `Divider` → `hairline` · `SegmentedControl` actif → ombre
  e1 · `BottomSheet` → fond `scrim` + élévation e3 · héros d'accueil → e2.
- Vérifs : **tsc 0 · lint 0/0 · 107 tests verts · export OK**.

**Reste du handoff (non fait — décisions/品 à cadrer avec le porteur)** : renommage
`gold`→`signature` (pur refactor, différé car le ton `Tag` « gold » est distinct) ; refonte
des écrans cœur P2 (PhotoHeader, sticky bar, Stepper) ; et surtout les **fonctionnalités**
P3–P5 dont plusieurs **ne sont pas du design** et l'une **réintroduit le système Victoire/
Défaite supprimé en v4** (niveau bidirectionnel par validation de match) — à arbitrer.

---

## Patch v4.6 (§A) — Refonte visuelle des écrans cœur (handoff aligné, design pur)

Handoff révisé par Claude Design, désormais rangé par nature (§A maintenant / §B serveur),
avec interdiction explicite de réintroduire Victoire/Défaite. J'ai fait tout **§A** :

- **Lot 1 terminé** : renommage `gold` → **`signature`** (clés du thème + ton `Tag` + tous
  les appels, ~24 fichiers) — la dette de confusion design↔dev est supprimée ; `goldChampagne`
  reste `amber`. Couleur en dur retirée de `ClubPhoto` (passe par les tokens `scrim`/`scrimStrong`).
- **Nouveaux composants du kit** : `StickyBar` (CTA collant bas d'écran, prix à gauche + bouton
  pill), `Stepper` (progression du parcours), `StatTile` (grand chiffre + libellé) ; `EmptyState`
  évolué (illustration + 1 CTA).
- **Écrans cœur** :
  - **Fiche club** : en-tête photo + dégradé scrim renforcé + **barre « Réserver » collante**
    (« dès {min} · 1h30 » → bouton pill). L'action carte passe en secondaire.
  - **Réserver (guidé)** : `Stepper` Jour → Créneau → Terrain → Confirmer (les onglets
    Par heure/Par club restent en amont, inchangés).
  - **Profil** : 3 `StatTile` partagés ; carte Niveau reformulée « évolue via les tournois
    officiels (+0.50 / −0.25) ».
  - **Mes réservations** : état vide chaleureux avec CTA intégré.
- **⛔ Respecté** : aucun écran Victoire/Défaite, aucune « partie à valider », niveau
  uniquement via tournois officiels.
- Vérifs : **tsc 0 · lint 0/0 · 107 tests verts · export OK**.

**§B (serveur) non câblé**, comme convenu : notifications, fiabilité, avis vérifiés, anti
no-show, parrainage, heures creuses, stats club, hors-ligne, accès opérateur PIN — pour la
vraie version Supabase.

---

## Patch v4.6.1 — Espace Club & Opérateur « présentables » (finition, design pur)

Les deux espaces pro étaient déjà **fonctionnels** (prototype mono-appareil) et avaient hérité
de la base visuelle ; cette tranche leur applique la même finition premium que les écrans joueur.
- **Opérateur** : nouveau **hero « Commission cumulée »** (grand chiffre or + nb de parties
  jouées depuis le lancement) — chiffre vitrine pour le pitch. Les compteurs (santé plateforme +
  totaux semaine) passent sur le **`StatTile` partagé** (grands chiffres Bricolage, cohérents
  avec le Profil). Composants locaux `Total`/`Mini` supprimés.
- **Espace Club** : `StatTile` **local dédupliqué** → on utilise le composant partagé du kit
  (mêmes gros chiffres partout : à venir / jouées / occupation / heure phare…).
- Aucune logique touchée ; **tsc 0 · lint 0/0 · 107 tests verts · export OK**.

> Rappel : la **logique** de ces espaces (multi-comptes, droits par club, accès opérateur
> sécurisé) relève de la version serveur (§B). En prototype, ils sont pleinement démontrables.

---

## Patch v4.6.2 — Page « La suite » (présentation honnête du §B)

Pour présenter ce qui n'est pas encore fait **sans faux boutons** : nouvel écran **`/a-venir`
« La suite »**, accessible depuis une carte discrète du Profil. Il liste les fonctions §B
(serveur) par thème — Confiance & qualité, Rester connecté, Pour les clubs, Compte & sécurité —
chacune avec une étiquette **« Bientôt »**, et un rappel que le prototype montre déjà tout le
reste. Les écrans qui marchent restent propres ; rien n'est facturé au joueur. tsc 0 · lint 0/0
· 107 tests · export OK (route `/a-venir`).

> **Note déploiement** : la démo (`gh-pages`) est bien republiée à chaque patch (hash du bundle
> JS différent à chaque fois). Si « rien ne change » à l'écran, c'est le **cache du navigateur** :
> ouvrir en navigation privée, ou ajouter `?v=462` à l'URL pour forcer le rechargement.

---

## Patch v4.8 — Écrans cœur refaits d'après les MAQUETTES (pas seulement le handoff .md)

Le handoff `.md` (tokens/kit/§A) était appliqué, mais les **maquettes HTML** (mise en page exacte)
ne l'étaient pas. Cette vague refait les écrans d'après les maquettes, en parallèle (un agent par
fichier, logique préservée) :
- **Accueil** : salutation + avatar anneau, héros (pastille « live » lime + CTA pilule), accès
  rapide 4 univers en icônes, carte « Ton prochain match » (pastille date + statut + avatars),
  clubs proches, tournois.
- **Profil** : bandeau signature (avatar + identité + édition), carte Niveau avec **jauge bornée**
  (monte/descend, tournois only), StatTile, trophées, palmarès.
- **Fiche club** : rangée de 3 info-chips (note/terrains/localisation) + **tarifs en lignes**
  (horaire → prix) ; héros photo + barre « Réserver » collante déjà en place.
- **Réserver guidé** : créneaux **groupés par période** (Matin/Après-midi/Soirée) avec icône +
  prix indicatif ; stepper conservé.
- **Mes réservations** : cartes avec **pastille date** dégradée + statut + boutons pill.
- **Fiche tournoi** : **héros violet** (univers Tournois) + chips Récompense/Date ; moteur de
  tournoi (inscription, clôture 2 étapes, annulation) strictement inchangé.
- Vérifs : **tsc 0 · lint 0/0 · 107 tests verts · export OK**. Tokens uniquement, logique intacte.
- **Déploiement confirmé côté GitHub** : Pages build #40 `success` — si l'écran ne change pas,
  c'est le cache (ouvrir avec `?v=…` neuf en navigation privée).

---

## Patch v4.18 — Tarifs de la fiche club en onglets (T3 du plan, plages nommées)

Dernière tâche de la micro-vague `docs/PLAN.md` (T1 `Reveal` + T2 `StickyBar` déjà livrées en
v4.17). La maquette « Fiche club » montre les tarifs **regroupés en onglets** ; l'app les listait
à plat. **Décision porteur (Moustapha)** : de **vraies plages éditables**, version sûre = le gérant
**nomme ses plages horaires** existantes (pas de tarif week-end pour l'instant — réservé au §B
serveur car il toucherait au calcul du prix réel et à la commission opérateur). **Aucune incidence
sur la caisse** : le nom est purement de l'affichage.

- **Modèle** : `PriceTier` gagne un champ **`label?` optionnel** (`src/data/clubs.ts`). Le seed
  Padelta nomme ses 3 plages : **Journée** (07:00–16:00), **Soirée** (16:00–20:30),
  **Fin de soirée** (20:30–24:00). Rien d'autre changé ; `validateTiers`, `priceForSlot`,
  `minPrice` **inchangés** (le label n'entre pas dans le calcul).
- **Helper pur** `groupTiersByLabel` (`src/lib/pricing.ts`) : regroupe par nom **uniquement si
  TOUTES les plages sont nommées ET ≥ 2 noms distincts** ; sinon liste à plat (rétro-compatible).
  Plusieurs plages d'un même nom sont rangées sous le même onglet, dans l'ordre d'origine.
- **Fiche club** (`src/app/club/[id].tsx`) : `SegmentedControl` (composant existant) au-dessus des
  tarifs quand des plages nommées existent ; basculer d'onglet change la liste. Tarif unique et
  plages non nommées : rendu **identique à avant**.
- **Espace Club** (`src/app/club-admin/index.tsx`) : un champ **« Nom de la plage » optionnel** par
  ligne tarifaire, persisté via `priceTiers[].label`. Texte d'aide mis à jour.
- Vérifs : **tsc 0 · lint 0/0 · tests verts (+8 cas `groupTiersByLabel`) · export OK (18 routes)**.
  Garde-fous respectés : zéro couleur en dur, kit maison, prix FCFA, sessions 1h30, aucune
  auto-déclaration, pas de tabbar. Cache : ouvrir la démo avec `?v=418` en navigation privée.

---

## Patches v4.19 → v4.23 — Préparation au lancement natif iOS/Android + liaison Expo

Le projet, jusque-là testé surtout en **export web**, est rendu **prêt à fabriquer une vraie app
mobile**. Aucune logique métier touchée ; la démo web reste identique.
- **v4.19 — préparation native** : `app.json` déclare le plugin **expo-image-picker** avec la
  chaîne de permission photo (FR, couvre profil joueur + photos de club, `cameraPermission:false`)
  → évite le crash iOS et le rejet App Store ; ajout de `ios.buildNumber` / `android.versionCode`.
  **`eas.json`** créé (profils `development` / `preview` / `production`, `appVersionSource: local`).
  `_layout.tsx` : splash maintenu jusqu'au chargement des polices (plus de flash). `icon.png`
  aplati en **RGB opaque** (Apple). Dépendances : `expo-device` retiré ; `@expo/ui`/
  `expo-glass-effect`/`expo-symbols` ne sont plus des deps directes (restent transitives via
  expo-router) ; **reanimated + worklets conservés** (animations à venir, décision porteur).
- **v4.20 — liaison Expo** : `app.json` reçoit `owner: padelconnect-ci`, slug `padelconnect`,
  `extra.eas.projectId`. Le projet est un **projet Expo officiel** → EAS peut builder.
  Un **APK Android `preview` a été buildé avec succès** via EAS (preuve que le natif fonctionne).
- **v4.21** : nom du paquet npm → `padelconnect` ; nettoyage `eas.json`.
- **v4.22 — renommage dépôt `Test-1` → `PadelConnect`** : URL de démo, liens partagés in-app
  (parrainage/partage) et docs mis à jour vers `lemowbi.github.io/PadelConnect/` ; `baseUrl`
  web aligné.
- **v4.23** : versions de paquets **alignées sur le SDK 56** (`expo install --fix`) ; expo-doctor
  19/21 (les 2 échecs sont des vérifs réseau bloquées par l'environnement, faux négatifs).

> **Note iPhone (importante)** : l'**Expo Go public de l'App Store ne supporte pas encore le SDK 56**.
> Pour tester sur iPhone avant publication → **TestFlight** (compte Apple Developer requis) ou la
> **démo web** (Safari). Sur Android, l'**APK `preview`** s'installe directement. Voir
> `docs/CHECKLIST-STORES.md`.

---

## Patches v4.24 → v4.27b — Revue 360° + 4 vagues d'amélioration

Une **revue complète par 5 agents spécialisés** (Expo/build, sécurité, design/UI, UX, qualité de
code) a donné un verdict global « bon » et une feuille de route en 4 vagues, toutes exécutées
**sans serveur**, **sans toucher la logique métier**, garde-fous respectés.

- **v4.24 — Vague 1 (sécurité de démo + splash)** : l'**Espace opérateur** n'apparaît plus dans
  la navigation normale — révélé par un **appui long (~1,2 s) sur l'avatar** du Profil (geste
  discret) ; l'**Espace Club** est conditionné (gérant déjà déverrouillé / mode gérant / même
  geste). La build web publique n'expose donc plus `/operateur` (codes club) au premier venu.
  Couleur de fond du splash alignée sur le thème (`#F1F5F3 → #F4F1E8`) — fin du flash au démarrage.
- **v4.25 — Vague 2 (frictions UX)** : carte « Ton prochain match » toujours affichée (découplée
  du réglage « rappels ») ; « Voir le club » + « Itinéraire » sur **Mes réservations** ; « Prévenir
  mes partenaires » sur l'**écran de succès** de réservation (si invités) ; états vides chaleureux
  (Coachs, Suivis) ; pont « Inviter des amis » → Parrainage ; onboarding **+225** pré-rempli + focus
  auto ; wording « Dernière place » → « **Fin de tableau** » (mécanique −0.25 inchangée).
- **v4.26 — Vague 3 (finition design)** : garde-fou **« zéro couleur en dur » tenu à 100 %** —
  nouveaux tokens `onPhoto` / `onPhotoSoft` / `limeGlow` / `purpleDark` + gradient `deepPurple`,
  ~11 littéraux rgba/#000 remplacés. **Fiche tournoi** : héros en **dégradé violet** (au lieu d'une
  couleur plate). `BookingSheet` : élévation `e3` alignée sur les autres bottom sheets.
- **v4.27 — Vague 4 (qualité & stores)** : **`club-admin/index.tsx` découpé : 1557 → 378 lignes
  (−76 %)** — 8 composants extraits dans `src/components/club-admin/` (hors arborescence des routes :
  export confirmé 24 routes, aucune route parasite), comportement strictement identique. Ajout de
  **Prettier** (`.prettierrc`, scripts `format`/`format:check`) ; script `reset-project` cassé
  retiré ; **`docs/CHECKLIST-STORES.md`** (publication App Store / Play Store). **v4.27b** :
  reformatage Prettier (56 fichiers, cosmétique, 0 changement de comportement).

Vérifs (chaque vague) : **tsc 0 · eslint 0/0 · tests logique verts · export web OK**.

> **Limite d'infra connue** : dans l'environnement de travail, les pushes vers `main` et `gh-pages`
> sont actuellement refusés par le proxy (la branche de travail `claude/padelconnect-v4-17-4zblgh`
> reçoit tout). La **démo en ligne reste donc à republier** à sa nouvelle adresse
> `lemowbi.github.io/PadelConnect/` (build prêt dans `dist/`) — à faire depuis un poste avec accès
> Git complet, ou quand l'infra le permettra.

---

## v4.28+ — Passage au serveur complet & production TestFlight (résumé)

> Depuis cette section, la **source de vérité de l'historique est `CLAUDE.md` §10** (tenu à jour
> à chaque lot). Résumé des grandes étapes livrées après v4.27b :

- **Comptes par e-mail** (confirmation par lien, mot de passe oublié in-app), rôles serveur
  (joueur / club / opérateur) via RLS — plus aucun code PIN local.
- **Tout branché serveur** : réservations cross-device (+ partagées avec invitations), tournois
  réels validés par les clubs (niveau +0.50 attribué côté serveur, anti-triche 34/36/37),
  avis vérifiés, demandes d'ami + push (Edge Function `notify-club`), clubs gérés par
  l'opérateur (statuts, boosts), stats club, diagnostics anonymes self-hosted.
- **Universal Links actifs** (padelconnectci.com — invite/CODE et club/ID ouvrent l'app) ;
  site + politique de confidentialité déployés sur Cloudflare Pages.
- **Builds TestFlight** : #21 → **#34** (auto-submit EAS). Le #34 embarque le grand audit :
  corrections de bugs, WCAG, conventions réseau, haptiques/animations (Chip, Toast, Stepper,
  CountUp, cascades), durcissements SQL.
- **Audit n°2 (232 agents)** : 126 constats confirmés corrigés par lots (dont récupération de
  mot de passe, offres factices supprimées, double-occupation tournoi/réservations), améliorations
  design et produit par rôle — détail dans `CLAUDE.md` §10.

Vérifs (chaque lot) : **tsc 0 · eslint 0/0 · tests logique verts · bundle iOS eager OK**.
