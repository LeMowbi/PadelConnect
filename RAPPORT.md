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

