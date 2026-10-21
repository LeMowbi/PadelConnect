# PadelConnect — Plan de pré-lancement (21 octobre 2026)

Document de pilotage pour le porteur, rédigé à partir des six cartes de l'existant (joueur, gestion,
design, serveur, compte, site & web), des constats confirmés par les auditeurs et des propositions
retenues après contre-expertise. Il ne contient aucun secret ni aucune information technique
confidentielle : il peut être partagé tel quel.

Comment le lire :

- **§1** dit où on en est, en trois lignes.
- **§2** inventorie ce que l'app fait déjà, rôle par rôle, en langage courant.
- **§3** liste les défauts confirmés à corriger maintenant, à destination des codeurs, avec
  les regroupements de fichiers pour travailler à plusieurs sans se gêner.
- **§4** présente les améliorations proposées, en huit lots, classées par priorité, avec pour
  chacune : ce que ça change pour l'utilisateur, l'exemple de référence, l'effort, le risque,
  et s'il faut un build, du SQL ou une décision de ta part. Un « ordre recommandé » termine.
- **§5** liste les décisions attendues de toi, en questions courtes (oui / non).

---

## 1. Où on en est

- **L'app iOS est en ligne** : version 1.0.2 (build #68) publiée sur l'App Store depuis le
  22 août 2026 (stores Côte d'Ivoire, Sénégal, États-Unis ; l'Europe attend toujours la
  vérification « commerçant » d'Apple). Android : compte Google Play pas encore créé, guide prêt.
- **Le serveur est à jour** : toutes les migrations SQL 02 → 90 sont appliquées et prouvées en base,
  les 11 webhooks sont en place, la fonction de notifications (notify-club) est déployée en v45.
- **Prochaine étape** : corriger les défauts du §3, livrer les améliorations « avant lancement »
  du §4, puis **lancer le build #69** (iOS) et redéployer le web (club.padelconnectci.com) et le
  site (padelconnectci.com), qui sont tous deux en retard sur le code.

---

## 2. Ce qui existe déjà

### 2.1 Joueur

**Compte et profil**

- Inscription en 3 étapes (compte, profil, parrainage) ou « Je gère un club » ; confirmation par
  lien e-mail ; connexion par e-mail (ou téléphone pour les anciens comptes) ; mot de passe oublié.
- Un numéro de téléphone = un seul compte (vérifié à l'inscription et à la modification du profil).
- Quiz de 4 questions qui fixe le niveau de départ (plafonné à 5,5 ; 2,0 si on n'a jamais joué).
- Profil : photo, nom, téléphone, date de naissance (âge et signe affichés), genre ; changement
  d'e-mail par lien ; déconnexion ; suppression définitive du compte depuis l'app.
- Niveau affiché avec jauge, ajusté uniquement par le serveur (matchs validés et tournois officiels).
- Statistiques (parties, matchs gagnés, points, tournois), activité sur 6 mois, historique des
  ajustements de niveau, 9 badges, trophées à paliers (Bronze → Platine), série de semaines jouées.
- Carte de fidélité « 10 parties = 1 récompense » avec réclamation et justificatif à montrer au club.
- Parrainage : code personnel, partage WhatsApp, compteur d'amis inscrits ; un lien d'invitation
  pré-remplit le code à l'inscription.
- Aide & support : message à PadelConnect avec suivi du statut, ou e-mail direct.

**Réserver un terrain**

- Onglet Réserver : 7 jours, vue « Par heure » (tous les clubs libres à une heure donnée) ou
  « Par club », heures chargées signalées, prix « dès », part par joueur.
- Créneaux de 1h ou 1h30 selon le terrain, prix propre à chaque durée et à chaque plage horaire.
- Voie rapide (feuille en bas d'écran) ou tunnel guidé (Jour → Créneau → Terrain → Confirmer).
- Invités : amis de l'app ou noms libres ; format 1v1 ou 2v2 ; match privé ou match ouvert avec
  fourchette de niveau.
- Liste d'attente sur un créneau complet : alerte « un terrain s'est libéré ».
- Écran de succès (récap, calendrier de l'iPhone, message WhatsApp aux partenaires) ; le club
  confirme ensuite depuis son Espace Club et le joueur reçoit une notification.
- Plafond de 6 réservations à venir ; annulation gratuite jusqu'à 5 h avant ; messages honnêtes
  quand un terrain vient d'être pris ou qu'un créneau est fermé.

**Matchs ouverts et social**

- Matchs ouverts (modèle Playtomic) : liste par club ou globale, niveau demandé, fiabilité du
  créateur (« Fiable · N % »), « Rejoindre », quitter ou fermer son match.
- Alertes : « un match à ton niveau vient d'ouvrir » (clubs suivis), « ton partenaire habituel a
  créé un match » (joueurs suivis).
- Amis par demande / acceptation, recherche par numéro, sélecteur de contacts, mini-fiche joueur
  (niveau, fiabilité, club favori, bouton Suivre).
- Signaler / bloquer un joueur (avis, matchs ouverts) ; les comptes bloqués disparaissent partout.
- Partage de la note d'un match par lien Wave (« J'ai payé », confirmation par l'organisateur).

**Mes réservations**

- Sections Invitations, Scores à saisir, Mes cours, Cours collectifs, À venir, Mes tournois,
  Passées, Annulées (dont « annulée par le club » avec motif et proposition de report).
- Saisie du score par chaque joueur, validation quand un perdant confirme (ou 48 h), points au
  classement, image de résultat partageable, message WhatsApp pré-rempli, « Rejouer ici ».
- Rappels locaux de match (5 h 15 avant et 2 h avant), rappel la veille pour l'agenda.

**Tournois et classement**

- Tournois créés par les joueurs (validés par le club hôte), par les clubs, ou officiels
  PadelConnect (bandeau doré) ; inscription en équipe ; clôture avec podium ; americano auto-géré.
- Classement par points (100 tournoi officiel gagné, 10 joué, 3 victoire, 2 partie), podium sur
  l'accueil, écran Classement.

**Clubs, coachs, cours**

- Liste des clubs (recherche, filtres, favoris, badges Partenaire / Sponsorisé / Bientôt), fiche
  club (photos, tarifs par plage et durée, offres, annonces, événements, coachs, cours collectifs,
  matchs ouverts, avis vérifiés avec 3 critères et réponse du club, carnet de séances).
- Réserver un cours avec un coach du club : le terrain n'est réservé que si le coach accepte, puis
  le club confirme (double validation) ; cours collectifs à rejoindre.

**Accueil**

- Salutation, invitations à confirmer, actu PadelConnect, agenda du padel 🇨🇮, héros « Réserve ton
  prochain match », accès rapides, un rappel utile (règles du padel, profil à compléter, trophée
  proche, parrainage), anniversaire, clubs près de toi, prochain match avec compte à rebours,
  tournois à venir, podium du classement.

### 2.2 Club (gérant)

- Accès réservé au rôle « club » validé par PadelConnect ; un compte peut gérer plusieurs clubs.
- Guide « Bien démarrer en 4 gestes » ; pastille « N réservations à confirmer » dans le profil.
- **Réservations** : planning du jour sur 7 jours (une ligne par terrain), fiche d'un créneau
  (réservé / bloqué / tournoi / libre) avec blocage direct, confirmation d'une réservation puis
  WhatsApp au joueur, « pas venu » (et annulation de l'absence), annulation pour chevauchement
  hors app avec motif et proposition d'alternative, décompte d'un carnet, fiabilité du joueur.
- Blocage d'un créneau (résa téléphone), fermeture sur une période (terrain ou club entier),
  créneau récurrent pour un habitué (nom visible du seul gérant).
- Statistiques 7 jours : occupation, heure phare, remplissage par créneau, revenu des parties
  jouées, historique par semaine (base de la commission).
- **Mon club** : infos (nom, quartier, description, type, WhatsApp, position Google Maps),
  3 plages tarifaires avec deux prix (1h / 1h30), photo de profil, galerie, photo par terrain,
  offres et actus, annonces aux suiveurs (avec notification), coachs réservables (par numéro,
  tarif de la séance), carnets de séances, terrains (ajout / retrait), horaires simples ou grille
  par terrain 1h/1h30, demande de boost « Sponsorisé ».
- **Tournois** : demandes à valider ou refuser (avec motif), création de tournois club, clôture
  avec vainqueur et podium.
- Notifications reçues : nouvelle réservation, annulation, demande de tournoi.

### 2.3 Coach

- Un joueur promu coach par son club gagne un Espace Coach : demandes de cours (accepter /
  refuser), cours à venir, cours collectifs (création, places, note), fiche (spécialité, tarif
  indicatif, créneaux de cours), historique.
- Notifications : nouvelle demande, demande retirée, cours annulé ou rétabli par le club.

### 2.4 Opérateur (PadelConnect)

- **Aperçu** : actu de l'accueil (avec notification à tous), agenda du padel, commission des
  6 derniers mois, santé plateforme, tournoi officiel, santé de l'app (erreurs anonymes).
- **Finances** : semaine par semaine, parties jouées, volume, commission par club, décompte envoyé
  par WhatsApp, « Marqué payé », export tableau, taux de commission par club, frais des tournois
  joueurs, lien Wave, récompense fidélité, tournois à encaisser.
- **Clubs** : ajout en « Bientôt », activation / mise en attente / suppression, statut des 9 clubs
  fondateurs, accès gérant par numéro de téléphone, boosts « Sponsorisé » 7/14/30 jours.
- **Demandes** : demandes de clubs (WhatsApp, approuver, écarter), avis signalés (retirer /
  classer), signalements support, récompenses fidélité à servir.

### 2.5 Site et version web

- Site padelconnectci.com (FR / EN) : clubs en direct depuis la base, « Pour les clubs », CGU,
  confidentialité, page /get (redirection App Store sur iPhone), liens d'invitation et de fiche
  club qui ouvrent l'app si elle est installée, page de confirmation d'e-mail.
- Version web club.padelconnectci.com : la même app dans le navigateur, pensée pour l'Espace Club
  et l'Espace opérateur (sans notifications, calendrier ni contacts).
- Liens universels iOS actifs (invitation, fiche club, confirmation e-mail) ; App Links Android
  déclarés pour invitation et fiche club.

### 2.6 L'interface aujourd'hui

- Un seul thème clair, « luxe sportif » : fond beige chaud, cartes blanches, **vert** pour la
  réservation et la navigation, **or** pour les notes et trophées, **violet** pour les tournois,
  **corail** pour l'urgence et les erreurs, lime pour la balle. Aucune couleur hors palette.
- Deux polices : Bricolage Grotesque pour les titres et chiffres, Schibsted Grotesk pour le texte.
- Un kit de composants maison réutilisé partout : cartes, boutons, puces, badges, en-têtes de
  section, états vides, squelettes de chargement, feuilles en bas d'écran, barre collante de prix,
  toasts annoncés aux lecteurs d'écran, sélecteur de calendrier, choix de fourchette de niveau.
- Animations avec l'API de base de React Native : fondus en cascade, ressorts, confettis, anneaux
  et reflets en boucle sur l'accueil et les écrans de succès ; vibrations légères à la sélection,
  franches au succès ou à l'erreur.
- 5 onglets (Accueil, Réserver, Tournois, Amis, Profil) ; les détails glissent par-dessus ; la
  colonne est plafonnée à 640 pt pour la tablette et le web.
- Accessibilité de base en place (rôles, libellés, cibles 44 pt sur les puces, toasts annoncés) ;
  pas encore de respect de « Réduire les animations » ni de plafond pour le texte agrandi.

---

## 3. Défauts confirmés à corriger maintenant

À destination des codeurs. Tous ces constats ont été relus et confirmés ; le correctif indiqué est
la version retenue après contre-expertise (parfois plus prudente que le constat initial). Aucun ne
demande de décision du porteur sauf mention « DÉCISION » (voir §5).

### 3.0 Regroupements pour travailler en parallèle

Dix lots « K ». Deux lots ne touchent jamais le même fichier, sauf les deux points chauds
signalés en bas. Chaque lot se termine par la cadence complète (tsc, lint, typecheck des tests,
test:logic, bundle eager, prettier) puis un commit.

| Lot                                | Périmètre                                        | Fichiers                                                                                                                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **K1** Réservation                 | tunnel, voie rapide, onglet Réserver             | `src/app/reserver/[clubId].tsx`, `src/components/BookingSheet.tsx`, `src/app/(tabs)/reserver.tsx`, `src/lib/slots.ts`, `src/lib/pricing.ts`, `tests/availability.test.ts`                                                                    |
| **K2** Fiche club                  | avis, photos, matchs ouverts                     | `src/app/club/[id].tsx`, `src/components/OpenMatches.tsx`                                                                                                                                                                                    |
| **K3** Tournois & stats            | fiche, création, clôture, statistiques           | `src/app/competition/[id].tsx`, `src/app/competition/nouvelle.tsx`, `src/components/club-admin/ClosePanel.tsx`, `src/app/statistiques.tsx`, `src/lib/badges.ts`, `src/data/competitions.ts`                                                  |
| **K4** Mes réservations & accueil  | scores, invitations, messages WhatsApp           | `src/app/reservations.tsx`, `src/app/(tabs)/index.tsx`, `src/lib/matchMessages.ts` (+ test), `src/components/PlayerSheet.tsx`                                                                                                                |
| **K5** Compte, amis, profil, store | **toutes** les modifications de `AppContext.tsx` | `src/store/AppContext.tsx`, `src/store/helpers.ts`, `src/app/(tabs)/profil.tsx`, `src/app/(tabs)/amis.tsx`, `src/lib/friends.ts`, `src/lib/notifications.ts`, `src/lib/levelQuiz.ts`, `src/app/reset-password.tsx`, `src/app/onboarding.tsx` |
| **K6** Espace Club                 | planning, Mon club, formulaires                  | `src/app/club-admin/index.tsx`, `src/components/club-admin/*` (sauf ClosePanel), `src/lib/clubNews.ts`, `src/lib/reservations.ts`, `src/lib/clubConstants.ts`, `src/app/inscrire-club.tsx`, `src/app/clubs/index.tsx`                        |
| **K7** Opérateur & coach           |                                                  | `src/app/operateur.tsx`, `src/components/operator/*`, `src/app/coach-admin.tsx`, `src/app/cours/[coachId].tsx`, `src/lib/competitionsServer.ts`, `src/lib/groupLessons.ts`, nouveau `src/lib/waveLink.ts`                                    |
| **K8** Serveur                     | migration 91 + notify-club v46                   | `supabase/91_*.sql` (nouveau), `supabase/RESET-DONNEES-TEST.sql`, `supabase/functions/notify-club/index.ts`, commentaires de `schema.sql` et `80`                                                                                            |
| **K9** Site, stores, config, docs  |                                                  | `site/*`, `app.json`, `.github/workflows/deploy-web.yml`, `docs/*`, `CLAUDE.md`, `README.md`, `src/app/legal.tsx`, `src/app/+html.tsx`                                                                                                       |
| **K10** Outillage & nettoyage      | tests, dépendances, doublons purs                | `tests/*`, `package.json`, `src/theme/index.ts`, `src/lib/days.ts`, `src/lib/format.ts`, `src/data/clubs.ts`, `src/components/ui.tsx`                                                                                                        |

Points chauds :

- `src/store/AppContext.tsx` est touché par K1 (branche « conflit »), K3 (inscription tournoi),
  K6 (retrait de `requestClub`, statut de `unblockRange` / `clubCancelReservation`) et K5. **Règle :
  seul K5 écrit dans ce fichier** ; les autres lots lui transmettent leurs quelques lignes.
- `src/app/reservations.tsx` est touché par K3 (badge des tournois) et K4 : **K4 seul y écrit**.
- K8 (migration 91) doit être **prouvé en base** (local puis transaction annulée) avant d'écrire
  « appliqué » ; notify-club v46 se redéploie en une fois avec tous les textes du lot.
- K9 et K10 n'ont aucun conflit avec les autres.

### 3.1 MEDIUM (à corriger avant le build #69)

| Lot | Fichier (ligne)                                     | Problème                                                                                                                                                                   | Correctif retenu                                                                                                                                                                                                                                                                                        |
| --- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K3  | `src/app/competition/[id].tsx:199`                  | Clôture americano : si le vainqueur choisi est l'équipe pré-remplie en 2ᵉ/3ᵉ place, elle reste envoyée aussi en 2ᵉ/3ᵉ → podium faux, incorrigible.                         | Dériver les places en excluant celles déjà prises (`secondName` ≠ vainqueur ; `thirdName` ≠ vainqueur et ≠ 2ᵉ). Le choix manuel et le flux non-americano ne changent pas.                                                                                                                               |
| K3  | `src/components/club-admin/ClosePanel.tsx:114`      | Même défaut dans l'Espace Club : changer le vainqueur vers l'équipe cochée en 2ᵉ/3ᵉ ne vide pas `second`/`third`.                                                          | Calculer au rendu `effSecond` / `effThird` (exclusion du vainqueur et doublon) et les utiliser pour les coches, le filtre et l'envoi ; le pré-remplissage revient si on remet le vainqueur d'origine.                                                                                                   |
| K3  | `src/app/competition/[id].tsx:108`                  | « Annuler ce tournoi » (terminé sans inscrit) boucle sur « réessaie » : le serveur refuse tant que les frais PadelConnect sont impayés.                                    | Une constante `feeDue` (déjà testée par la carte Frais) ; si vraie, remplacer le bouton par « Règle d'abord les frais d'organisation (ci-dessus) ou contacte PadelConnect pour annuler ce tournoi. ».                                                                                                   |
| K4  | `src/app/reservations.tsx:403`                      | Partie passée sans autre compte (résa solo, cours) affiche « Mettre le score » ; le serveur répond `no_players` et la feuille reste ouverte avec un conseil impossible.    | 1) Masquer le bouton si propriétaire sans invité, ou cours (`coachName`), sauf si un score existe déjà ; ligne honnête « Partie sans autre compte PadelConnect — le score ne peut pas être compté. » 2) Traiter `no_players` comme final : toast dédié, fermer la feuille, corriger les commentaires.   |
| K6  | `src/components/club-admin/ClubInfoCard.tsx:69`     | L'instantané `initial` n'est jamais recalé après un enregistrement : revenir à la valeur d'origine puis réenregistrer n'envoie rien, écran « Enregistré ✓ » mensonger.     | Dans la branche succès du `.then`, recaler `initial` avec les valeurs **capturées au tap** (même forme que les comparaisons : `price` brut, `tiers` stringifiés) ; recaler le commentaire.                                                                                                              |
| K6  | `src/components/club-admin/SectionMonClub.tsx:1112` | Galerie : retirer une photo pendant un envoi (ou deux retraits rapides) ressuscite une photo dont le fichier est supprimé → image cassée pour tous.                        | Verrou unique `galleryBusy` (ref + état) autour des trois écritures (ajout appareil après `pickImage`, ajout par lien, retrait) avec `finally`, boutons désactivés pendant l'écriture.                                                                                                                  |
| K8  | `supabase/81_matchs_ouverts_intelligents.sql:27`    | La contrainte de la 81 rend « Fermer le match aux nouveaux joueurs » IMPOSSIBLE sur un match portant une fourchette de niveau (« Action impossible — réessaie » à jamais). | **Variante B retenue** : migration 91 qui remplace la contrainte sans la clause `open_match and` (bornes 1–7 et min ≤ max conservées). Aucune fonction touchée, fourchette conservée à la réouverture, rien côté client. Noter dans la 81 que la clause est relâchée (ne jamais recoller la 81 seule).  |
| K9  | `site/assets/site.js:465`                           | Le prix « dès » du site ignore les plages tarifaires et le prix 1h : Elite Club affiche 30 000 au lieu de 20 000 dans l'app.                                               | Lire `price_tiers` (overrides et clubs) et `court_slots`/`slots`/`court_closed` (config) ; recopier la règle de `pricing.minPrice` et `resolveCourtSlots` (durées réellement ouvertes, prix 1h = `price60` ou ⅔ borné à 1 000) sur les deux chemins (fondateurs et clubs ajoutés) ; redéployer le site. |
| K9  | `site/privacy.html:73` (+ `cgu.html`, `legal.tsx`)  | La confidentialité et les CGU ne disent pas que le taux de présence (« Fiable · N % »), le niveau et le club favori sont visibles des autres joueurs.                      | Compléter la phrase « visibles par la communauté » aux 4 endroits (privacy, cgu FR + EN, legal.tsx) après vérification du seuil (5 parties) dans la 80. Redéployer le site ; l'app suit au build.                                                                                                       |
| K4  | `src/lib/matchMessages.ts:20`                       | Le modèle WhatsApp « On joue ! » divise la note par 1 + invités même pour un match OUVERT ; tous les autres écrans divisent par la capacité.                               | `heads = r.openMatch ? cap : Math.max(1, 1 + invited.length)` ; ajouter un test pur (voir K10).                                                                                                                                                                                                         |

### 3.2 LOW (à corriger avant le build #69, sauf mention « peut attendre »)

| Lot                  | Fichier (ligne)                                                                                            | Problème                                                                                                                                                                                                                           | Correctif retenu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| K5 (pour K1)         | `src/store/AppContext.tsx:1731`                                                                            | Un refus 23514 (créneau fermé hors app ou réservé à un tournoi) est classé « conflit » et seule l'occupation est rechargée : le terrain reste affiché libre, boucle « vient d'être pris ».                                         | `insertReservation` renvoie `blocked: true` sur 23514 (toujours `conflict: true`) ; dans la branche conflit, `Promise.all([fetchOccupancy(), res.blocked ? fetchBlockedSlots() : null])` puis un seul `setState` sous garde d'époque ; si `blocked`, `void refreshCompetitions(userId)` (ajouté aux dépendances). Ne PAS passer par la branche `closed`.                                                                                                                                                                                                     |
| K1                   | `src/app/reserver/[clubId].tsx:78`                                                                         | Un `?dateKey=` explicite hors fenêtre retombe en silence sur le repli « Rejouer » ; une heure passée peut être présélectionnée avec un bouton actif.                                                                               | `initialDayKey` : correspondance exacte si `dateKey`, sinon repli « première date où l'heure est à venir » ; heure présélectionnée seulement si à venir. Calcul dans les initialiseurs `useState`.                                                                                                                                                                                                                                                                                                                                                           |
| K1                   | `src/app/reserver/[clubId].tsx:85`                                                                         | L'heure venue de « Rejouer » n'est pas vérifiée dans la grille du club → créneau fantôme (prix sans « dès », étape Terrain, rien de sélectionnable).                                                                               | Après `openSlots` : `pickedSlot = slot && (openSlots.includes(slot) \|\| submitting) ? slot : null` ; l'utiliser dans durationsAtSlot, free, effectiveCourt, slotPrice, ready, step, libellés, `confirm`. Laisser `slot` brut pour les puces, `slotFull`, l'alerte.                                                                                                                                                                                                                                                                                          |
| K1                   | `src/app/reserver/[clubId].tsx:54`                                                                         | `useMemo` de `club` sans la dépendance indirecte `state.clubStatus` (les deux autres écrans la déclarent).                                                                                                                         | Ajouter `state.clubStatus` avec le même commentaire et le même `eslint-disable` que `(tabs)/reserver.tsx:48`. Grep des autres `findClub` dans un `useMemo` pour traiter la classe d'un coup.                                                                                                                                                                                                                                                                                                                                                                 |
| K1                   | `src/app/(tabs)/reserver.tsx:353`                                                                          | Vue « Par club » : « La journée est terminée » affiché même quand il reste des créneaux, tous complets.                                                                                                                            | Utiliser `todayOver` (l.65) : « Plus de créneaux aujourd'hui / La journée est terminée. » sinon « Aucun créneau libre / Tout est complet pour le reste de la journée. » ; garder « Voir demain » sur `isToday`.                                                                                                                                                                                                                                                                                                                                              |
| K1                   | `tests/availability.test.ts:9`                                                                             | Le commentaire prétend que la cohérence du miroir de test « est tenue par tsc » : faux (`tests/` hors tsc).                                                                                                                        | « ⚠️ Copie manuelle (tests/ est hors tsc) : toute modification de competitionBlockedCourts / courtIntervalFree dans availability.ts DOIT être répercutée ici. » Grep des autres « tenue par tsc ».                                                                                                                                                                                                                                                                                                                                                           |
| K1                   | `src/app/reserver/[clubId].tsx:855` + `BookingSheet.tsx:403`                                               | « Format du match » déclaré `radiogroup` avec des enfants `button` : pas d'annonce de choix exclusif.                                                                                                                              | Retirer `accessibilityRole="radiogroup"` aux DEUX endroits (garder le label du groupe). Ne pas toucher `Chip`.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| K1                   | `src/app/reserver/[clubId].tsx:812`                                                                        | La puce d'un invité saisi à la main le SUPPRIME au toucher sans le dire aux lecteurs d'écran.                                                                                                                                      | `accessibilityLabel={\`Retirer ${n} des invités\`}`. Vérifier par grep la voie rapide (même puce → même libellé).                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| K2                   | `src/app/club/[id].tsx:887`                                                                                | « Modifier mon avis » rouvre un formulaire VIDE ; un simple changement d'étoiles écrase texte et critères.                                                                                                                         | Dans `submit()`, ne plus vider les champs après succès (supprimer les 5 setters l.359-363) : le formulaire rouvert reflète exactement ce qui a été publié. Vérifier que `removeMyReview` vide bien lui-même les champs.                                                                                                                                                                                                                                                                                                                                      |
| K2                   | `src/app/club/[id].tsx:450`                                                                                | La photo héros ouvre la visionneuse même sans photo → écran noir « 0 photo ».                                                                                                                                                      | `canView = viewerPhotos.length > 0` (pas `gallery`) ; `onPress`, `disabled`, rôle et label conditionnés ; ceinture `viewer !== null && viewerPhotos.length > 0` sur la Modal.                                                                                                                                                                                                                                                                                                                                                                                |
| K2                   | `src/app/club/[id].tsx:333`                                                                                | `hasPlayedHere` ne lit que le miroir 180 j : un joueur avec avis publié voit « Joue une première fois ici… ».                                                                                                                      | `hasPlayedHere = !!myReview \|\| myReservations.some(...)` (myReview déclaré avant) ; recaler le commentaire ; le refus serveur `not_played` reste géré.                                                                                                                                                                                                                                                                                                                                                                                                     |
| K2                   | `src/app/club/[id].tsx:71`                                                                                 | `RatingBar` n'anime qu'au montage : les barres ne suivent plus les avis (publié, modifié, supprimé, auteur bloqué).                                                                                                                | Dépendances `[pct, delay, width]`, retirer l'eslint-disable, `return () => anim.stop()` ; réécrire le commentaire.                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| K2                   | `src/app/club/[id].tsx:399`                                                                                | Commentaire « publier / retirer une réponse » mais l'UI interdit l'envoi vide : un gérant ne peut jamais retirer sa réponse.                                                                                                       | Minimum : commentaire « Gérant : publier / modifier une réponse à un avis. ». **DÉCISION** (§5) : option bouton « Retirer la réponse » (fonction dédiée `removeReply`, garde `replying`, confirmation, toasts dédiés) sans assouplir `sendReply`.                                                                                                                                                                                                                                                                                                            |
| K2                   | `src/components/OpenMatches.tsx:201`                                                                       | Mode d'emploi de la section vide : case « Ouvrir ce match aux autres joueurs » qui n'existe plus ; promet « n'importe quel joueur ».                                                                                               | « Aucun match ouvert pour l'instant. Réserve un terrain et choisis « Match ouvert » dans « Type de match » : ta partie s'affichera ici et d'autres joueurs pourront rejoindre les places restantes. »                                                                                                                                                                                                                                                                                                                                                        |
| K1                   | `src/components/BookingSheet.tsx:303`                                                                      | Terrain épinglé en tête même HORS envoi : pris par un autre entre-temps, il reste affiché actif.                                                                                                                                   | `pinned = submitting && court && !free.includes(court)` ; `courtGone = !submitting && court && !free.includes(court)` ; `effCourt = courtGone ? null : court` ; puces `active={c === effCourt}`, bouton `disabled={!effCourt \|\| submitting}`, garde dans `confirm`. Pas de « · pris » (le libellé serait faux pour une fermeture).                                                                                                                                                                                                                         |
| K3                   | `src/app/statistiques.tsx:33`                                                                              | « Évolution du niveau » affiche une défaite comme une victoire quand le delta vaut 0 (plancher / plafond).                                                                                                                         | delta 0 = neutre : « niveau inchangé », icône `remove`, couleur `textMuted`, `±0,00` ; garder `tournoi` prioritaire ; comparer sur la valeur arrondie.                                                                                                                                                                                                                                                                                                                                                                                                       |
| K4 (pour K3)         | `src/app/reservations.tsx:916`                                                                             | « Mes tournois » affiche « À venir » pour un tournoi REFUSÉ ou EN ATTENTE.                                                                                                                                                         | Avant `result ? …`, branches `rejected` → Tag « Refusé » et `pending` → « En attente », mêmes libellés/icônes que `CompetitionCard`.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| K3                   | `src/app/competition/[id].tsx:146`                                                                         | `canClose` ignore le statut : un pending/refusé dépassé affiche « Tournoi terminé sans inscrit » (et deux « Supprimer » pour un refusé).                                                                                           | `canClose = … && isTournamentPublic(comp)` ET, sous le bandeau pending quand `createdByMe && played`, phrase « La date est passée sans validation du club » + le même bouton « Supprimer ce tournoi » (sinon un pending dépassé n'est plus supprimable) ; masquer « Contacter le club » dans ce cas.                                                                                                                                                                                                                                                         |
| K5 (pour K3)         | `src/app/competition/[id].tsx:1134` + `AppContext.registerCompetition`                                     | Inscription refusée (complet, dépublié) : « réessaie » en boucle, écran non rafraîchi.                                                                                                                                             | `competitionsServer.registerCompetition` → `'ok' \| 'refused' \| 'network'` ; le store relaie, lance `refreshCompetitions` sur `'refused'` (sous garde d'époque) ; fiche : « Ce tournoi est complet ou n'accepte plus d'inscriptions. » sur refus, « réessaie » seulement sur réseau. Seul appelant : la fiche.                                                                                                                                                                                                                                              |
| K3                   | `src/app/competition/[id].tsx:1142`                                                                        | « Le règlement se fait au club. » affiché même pour un tournoi gratuit ou organisé par un joueur / PadelConnect ; contredit le bloc une fois inscrit.                                                                              | Phrase de règlement seulement si `hasEntryFee(comp.fee)`, libellé selon l'organisateur (club / PadelConnect / organisateur) via un petit helper partagé avec le bouton l.1006.                                                                                                                                                                                                                                                                                                                                                                               |
| K8                   | `supabase/59_concurrency_hardening.sql:108`                                                                | `register_competition` n'a aucune garde de date : un appel forgé s'inscrit le jour J ou après et récolte +10 pts. Résiduel non suivi.                                                                                              | **DÉCISION** (§5) : dans la migration 91, `create or replace` au corps identique à la 59 + garde `date_key <= today(UTC)` → false (même borne que `unregister_competition`), revoke/grant conservés, preuve en base (J-1 accepté, J et après refusés). À défaut : consigner le résiduel dans CLAUDE.md §10.                                                                                                                                                                                                                                                  |
| K3 (+K5)             | `src/app/statistiques.tsx:98`                                                                              | « Tournois joués » compte amicaux inclus, « Tournois gagnés » seulement les officiels ; doublon de `computeStats`.                                                                                                                 | Corriger à la source : champ `won?: boolean` dans `OfficialResult` (helpers + chemin local), `computeStats.tournamentsWon` sur `won ?? result === 'win'`, Statistiques lit `stats.*`, commentaire de `badges.ts` recalé ; « Participé » → « Vainqueur ! » pour un amical gagné (sans delta de niveau). Ne pas toucher `result 'win'`.                                                                                                                                                                                                                        |
| K4                   | `src/app/reservations.tsx:381`                                                                             | Le toast « validé » promet « ajuste ton niveau », faux après une validation déjà faite ou au plafond hebdomadaire.                                                                                                                 | « Score validé ✓ — le match compte au classement. » (Statistiques montre l'ajustement réel).                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| K3                   | `src/app/competition/nouvelle.tsx:302`                                                                     | On peut créer un tournoi pour AUJOURD'HUI alors que les inscriptions ferment le jour J : jamais d'inscrit possible.                                                                                                                | **DÉCISION** (§5) : soit borner à demain (`minKey={dates[1].key}` + garde `day.key <= dates[0].key` avec message), soit avertissement sous le calendrier quand `day.key === dates[0].key`. Ne pas toucher `started` dans la fiche.                                                                                                                                                                                                                                                                                                                           |
| K3                   | `src/app/competition/nouvelle.tsx:42`                                                                      | Les champs Titre / Récompense / Frais (composant `Field`) n'ont pas de libellé d'accessibilité.                                                                                                                                    | `accessibilityLabel={label}` et `accessibilityHint={error \|\| undefined}` sur le TextInput de `Field`.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| K5 (+K8)             | `src/store/AppContext.tsx:2022`                                                                            | Bloquer un AMI ne casse pas l'amitié : il reste dans Amis, dans les sélecteurs d'invitation, et lit mon numéro.                                                                                                                    | Migration 91 : `block_user` fait aussi les deux `delete` (friends dans les deux sens, friend_requests dans les deux sens, patron `remove_friend` 30), même signature, grant/revoke reposés, preuve en base. Client : `friends: s.friends.filter(...)` et purge de `favoritePlayerIds` dans le même setState. Assumé : un déblocage ne restaure pas l'amitié.                                                                                                                                                                                                 |
| K5                   | `src/app/(tabs)/amis.tsx:120` + `friends.ts`                                                               | Répondre à une demande d'ami disparue : « Action impossible — réessaie » sans fin.                                                                                                                                                 | `respondFriendRequest` → `'ok' \| 'gone' \| null` ; store : sur `'gone'`, purger la demande du miroir (garde d'époque) et faire quand même `fetchFriends()` si `accept` ; écran : tester `res === 'ok'`, « Connexion impossible — réessaie » sur null, « Cette demande n'est plus valable. » sur gone (jamais « bloqué »). Type l.396 à aligner.                                                                                                                                                                                                             |
| K5                   | `src/store/AppContext.tsx:1986`                                                                            | Même famille : sur un refus définitif, la carte reste et invite à réessayer.                                                                                                                                                       | Couvert par le correctif précédent (purge sur `'gone'`). Vérifier qu'il ne reste pas de chemin `!ok` sans purge.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| K5                   | `src/store/AppContext.tsx:533`                                                                             | « Parties jouées » (profil, trophées, nudges, Statistiques) compte les invitations jamais acceptées et se limite à 180 j : contredit la carte Fidélité, les trophées peuvent régresser.                                            | 1) Passer `pendingInvitationIds` à `computeStats` (et à `streakWeeks`), filtrer `!pending.includes(r.id)` ; ne PAS filtrer `myReservations`. 2) Une tranche de store `loyalty` (chargée en session + premier plan, null = garder) lue par `LoyaltyCard` ET `computeStats` : `played = max(serveur, miroir filtré)`. Statistiques recalcule son propre `played` l.95 : l'aligner aussi.                                                                                                                                                                       |
| K4                   | `src/app/(tabs)/index.tsx:207`                                                                             | « Ton prochain match » me traite toujours comme organisateur : je m'affiche deux fois, l'organisateur disparaît ; un cours affiche « Équipe incomplète ».                                                                          | `iOwn` = EXACTEMENT la règle `isOwner` de `reservations.tsx:194` (extraite dans `helpers.ts`) ; `matchPlayers` = `[organisateur, ...invited]` si pas à moi ; `teamIncomplete` exige `iOwn && !coachName` ; `notifyPartners` préfixe l'organisateur quand `!iOwn`.                                                                                                                                                                                                                                                                                            |
| K5                   | `src/store/AppContext.tsx:1287`                                                                            | Un échec serveur sur la photo de profil laisse l'avatar optimiste affiché.                                                                                                                                                         | Branche retrait (l.1287) : restaurer `prev?.photoUri` sous garde d'époque avant le `return`. Branche upload (l.1280) : le fichier Storage est déjà écrasé (upsert même chemin) → ne restaurer que si `!prevPhoto`, sinon garder l'URL neuve et commenter. Dans la sortie 23505 (l.1256), restaurer aussi la photo et renvoyer `photoSaved: !('photoUri' in patch)`.                                                                                                                                                                                          |
| K5                   | `src/app/(tabs)/profil.tsx:253` (+ commentaire l.225)                                                      | La carte « Mon niveau » se contredit : « ne bouge qu'en tournoi officiel » vs « après tes matchs validés ».                                                                                                                        | Une seule phrase citant les deux sources réelles (moteur 80 sur les matchs validés, écrêté ±0,5 / 7 j ; tournois officiels) avec les deltas vérifiés dans `close_competition` (SQL 59 : +0,50 / −0,25) ; commentaire l.225 recalé.                                                                                                                                                                                                                                                                                                                           |
| K5                   | `src/app/(tabs)/profil.tsx:881`                                                                            | Une date de naissance invalide ou effacée est ignorée en silence, puis « Profil mis à jour ✓ ».                                                                                                                                    | Dans `save()` : `if (birth.trim() && !parseBirthDate(birth)) { setError('Date invalide — vérifie le jour, le mois et l'année.'); return; }` ; envoyer `birthDate: birth.trim()` ('' = retrait, déjà mappé en null). Voir aussi `AppContext.tsx:719` ci-dessous.                                                                                                                                                                                                                                                                                              |
| K5                   | `src/app/(tabs)/profil.tsx:441`                                                                            | « Rappels de match » reste ON sans prévenir quand la permission iOS est refusée.                                                                                                                                                   | Au basculement vers ON, en natif seulement (`Platform.OS !== 'web'`) : `ensureNotificationPermission().then(ok => !ok && toast « Autorise les notifications dans les réglages pour recevoir tes rappels. »)`. Ne pas changer `syncMatchReminders`. Ligne d'état sous l'interrupteur = amélioration E1.                                                                                                                                                                                                                                                       |
| K5                   | `src/app/(tabs)/amis.tsx:235`                                                                              | Boutons Retirer / Accepter / Refuser et champ numéro sans libellé nommant la personne.                                                                                                                                             | `accessibilityLabel` « Retirer X de tes amis », « Accepter la demande de X », « Refuser la demande de X » (libellé fixe pendant l'envoi), « Numéro de téléphone de ton ami » sur le champ ; idem « Oui, retirer » / « Non ».                                                                                                                                                                                                                                                                                                                                 |
| K5                   | `src/store/AppContext.tsx:238, 255, 321, 1211`                                                             | Code mort : `userReviews` (jamais lu), `hiddenCoachIds` (jamais écrit depuis c14fef8), action `setAccount` (jamais appelée).                                                                                                       | Supprimer les trois (type, initialState, resets, filtres de `coachs/index.tsx:64` et `club/[id].tsx:259`, imports devenus inutiles) ; les anciennes clés persistées sont absorbées par le spread de chargement. tsc confirme.                                                                                                                                                                                                                                                                                                                                |
| K6                   | `src/components/club-admin/QuickBlock.tsx:171`                                                             | Un créneau fermé par une PÉRIODE affiche « Bloqué · Débloquer ? » ; le déblocage ne fait rien et confirme un succès.                                                                                                               | `CourtStatus.source?: 'slot' \| 'range'` ; dans `courtStatusFor`, calculer la période AVANT le blocage ponctuel (`'range'` dès qu'une période couvre) ; QuickBlock affiche le texte non actionnable de `index.tsx:593` ; ceinture : `onUnblock` renvoie false si aucun `blk`. Ne pas toucher `unblock_slot`.                                                                                                                                                                                                                                                 |
| K6                   | `src/app/club-admin/index.tsx:524` et `:594`                                                               | Fiche d'un créneau : un terrain dont le créneau COUVRE l'heure (sans commencer dessus) est dit « Fermé » ; renvoi vers une section absente en mode grille par terrain.                                                             | Garder `slotDurationAt` pour le cas exact ; sinon chercher le créneau couvrant (`overlaps`) : aucun → « Pas de créneau à cette heure sur ce terrain » ; fermé (`x` ou hérité) → « Fermé sur ce terrain — voir « Horaires d'ouverture » (Mon club) » ; ouvert → « Créneau HH:MM · durée — touche sa case dans le planning », SANS bouton Bloquer (ne jamais bloquer `covering.t` depuis une fiche intitulée autrement). Commentaires recalés.                                                                                                                 |
| K6                   | `src/components/club-admin/SectionMonClub.tsx:1392`                                                        | Même course sur les photos par terrain (× actif pendant un envoi, carte réécrite).                                                                                                                                                 | `uploadingCourt` devient le verrou des trois déclencheurs (×, `changeCourtPhoto`, « Retirer le terrain » → `removeCourt`) : garde en tête de handler + `disabled`. Pas de « fusion » dans le store.                                                                                                                                                                                                                                                                                                                                                          |
| K7                   | `src/components/club-admin/SectionTournois.tsx:59`                                                         | Un échec RÉSEAU à la validation d'un tournoi affiche le message de conflit.                                                                                                                                                        | `approveCompetition` → `'ok' \| 'refused' \| 'error'` (lib, type du store, branche locale) ; séparer les deux branches de `decide` (`reject` reste booléen) ; « Publication impossible — vérifie ta connexion puis réessaie » sur error, conflit sur refused. Vérifier si la RPC signale le conflit par exception.                                                                                                                                                                                                                                           |
| K6 (+K5, K8)         | `src/components/club-admin/ClubCancelForm.tsx:60`                                                          | Annulation club : « réessaie » pour tout refus, y compris définitif (déjà annulée, pas venu, terminée).                                                                                                                            | **Peut attendre** (demande une migration) : patron 87/90, `club_cancel_reservation` → texte `'ok' \| 'gone' \| 'played' \| 'forbidden'` (drop+create, grant/revoke, note anti-recollage 75/77/78), client aligné, rafraîchissement du miroir sur gone/played. Sans migration : message neutre « Cette réservation n'est peut-être plus active — tire pour rafraîchir ».                                                                                                                                                                                      |
| K6 (+K5)             | `src/components/club-admin/SectionReservations.tsx:675`                                                    | « Rouvrir » une période déjà rouverte ailleurs : « Action impossible — réessaie » sans fin.                                                                                                                                        | Dans `unblockRange` (store) : sur échec, relire `fetchBlockedRanges` (null = garder le message) ; si l'id a disparu, retirer du miroir et renvoyer `'gone'` → « Période déjà rouverte ✓ ». Signature texte + appelants (grep) + type. Garde d'époque.                                                                                                                                                                                                                                                                                                        |
| K6                   | `src/components/club-admin/ClubPassesCard.tsx:62`                                                          | Panne réseau au crédit d'un carnet : « Numéro introuvable ou ambigu ».                                                                                                                                                             | `clubGrantPass` → `string \| 'refused' \| 'error'` ; « Connexion impossible — réessaie » sur error. Commentaire l.59 recalé.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| K6 (+K5)             | `src/app/club-admin/index.tsx:181`                                                                         | « Inscrire mon club » crée un club LOCAL fantôme en plus de la demande serveur ; promesse fausse.                                                                                                                                  | Retirer `requestClub(...)`, reformuler l.371 (« Ta demande part chez PadelConnect : dès l'activation, ton club apparaît ici… »), commentaire l.166 ; purger une fois au chargement les `customClubs` `!fromServer && status==='pending'`, puis retirer `requestClub`, `cancelOwnClubRequest`, le bandeau `pendingOwn` et leurs imports. Garder le libellé « · en attente » opérateur.                                                                                                                                                                        |
| K6                   | `src/components/club-admin/SectionMonClub.tsx:99` (8 toasts)                                               | Huit refus orientent vers une impasse (« vois avec les joueurs pour qu'ils annulent ») alors que le gérant a « Annuler ce créneau ».                                                                                               | Constante partagée, sujet ajusté par cas : « Des réservations à venir occupent ce créneau — annule-les d'abord (« Annuler ce créneau » sur leur carte, onglet Réservations), puis réessaie. » (cf. `SectionReservations:547`).                                                                                                                                                                                                                                                                                                                               |
| K6                   | `src/app/club-admin/index.tsx:136`                                                                         | Notes privées des récurrents chargées DEUX fois ; la fiche détail montre l'ancien nom après une re-pose.                                                                                                                           | Une seule source dans `index.tsx` : `reloadSlotNotes()` (setState dans le callback), props `slotNotes` + `onNotesChanged` vers `SectionReservations`, suppression de son état / effet / `blockedCount` / import.                                                                                                                                                                                                                                                                                                                                             |
| K6 (ClosePanel → K3) | `src/components/club-admin/ClosePanel.tsx:73`                                                              | « Oui, annuler le tournoi » sans garde anti double-tap : « Annulation impossible » juste après « Tournoi annulé ».                                                                                                                 | `onDelete?: () => Promise<boolean>` ; état `deleting` (déclaré avant le return anticipé) + ref ; `runDelete` dégèle seulement sur échec ; « Le garder » désactivé pendant l'envoi ; `club-admin/index.tsx:680` retourne la promesse.                                                                                                                                                                                                                                                                                                                         |
| K6                   | `src/components/club-admin/SectionMonClub.tsx:941`                                                         | Rollback de `removeCourt` sur l'instantané du tap, pas sur la liste courante (terrain ajouté pendant la confirmation perdu).                                                                                                       | Sous le verrou : `before = courtsRef.current`, `remaining` dérivé de `before`, garde `before.length <= 1`, rollback `setClubCourts(club.id, before)` ; commentaire recalé.                                                                                                                                                                                                                                                                                                                                                                                   |
| K6                   | `src/components/club-admin/SectionReservations.tsx:559`                                                    | `block_range` renvoie `'invalid'` aussi quand 100 périodes actives existent, mais le toast parle de dates.                                                                                                                         | Sans SQL : « Période refusée — dates invalides (1 an maximum) ou trop de périodes de fermeture actives (100) : rouvre-en d'anciennes ». (Un code `'limit'` serveur attendrait un client déjà livré.)                                                                                                                                                                                                                                                                                                                                                         |
| K6 / K7 / K5         | `ClubNewsEditor.tsx:206`, `operator/NewsEditor.tsx:131`, `operator/AgendaEditor.tsx:224`, `profil.tsx:439` | Quatre interrupteurs sans rôle ni libellé pour les lecteurs d'écran.                                                                                                                                                               | `accessibilityRole="switch"` + libellé fidèle à la cible : « Envoyer aussi en notification aux joueurs qui suivent ton club » (club), « … à tous les joueurs » (actu, agenda), « Rappels de match » (profil). Jamais « tous les joueurs » pour l'annonce club.                                                                                                                                                                                                                                                                                               |
| K7                   | `src/app/cours/[coachId].tsx:136`                                                                          | Un coach peut dérouler tout le tunnel sur SA fiche ; refus serveur présenté comme une panne.                                                                                                                                       | `isSelf = !!serverUserId && coach.userId === serverUserId` après `if (!coach)` ; garder la carte coach et les cours collectifs, remplacer le tunnel par un encadré « Tu ne peux pas réserver un cours avec toi-même » + lien Espace Coach ; Tag « Toi » à la place de « Réserver » dans `cours/index.tsx:93` et `club/[id].tsx:748`.                                                                                                                                                                                                                         |
| K7                   | `src/app/cours/[coachId].tsx:217`                                                                          | Demande en double (même coach, jour, heure, en attente) refusée pour de bon mais présentée comme un souci réseau.                                                                                                                  | Pré-contrôle avant `setSubmitting` sur `state.myLessons` (`pending`, `studentId === moi`, même coach/jour/heure) → toast information « Tu as déjà une demande en attente pour ce créneau — retrouve-la dans « Mes réservations ». » ; garder le toast générique sinon ; commentaire recalé.                                                                                                                                                                                                                                                                  |
| K7                   | `src/app/operateur.tsx:175`                                                                                | Signalements, avis signalés, fidélité : « Aucun … · 0 » pendant le chargement initial.                                                                                                                                             | Trois drapeaux `*Loaded` (patron `loadingReq`), passés à `true` dans le `.then` (jamais remis à false au pull-to-refresh) ; squelette + titre sans « · 0 » tant que non chargé. Ne pas passer les tableaux en `undefined`.                                                                                                                                                                                                                                                                                                                                   |
| K7                   | `src/lib/competitionsServer.ts:117`                                                                        | Le lien Wave opérateur ne se lit qu'à travers les tournois : sans tournoi, le champ est vide alors qu'un lien existe.                                                                                                              | Fonction dédiée `fetchWaveLinkConfig()` (`undefined` = échec, `''` = vide, sinon la chaîne) ajoutée au `Promise.all` de `refreshMirror`, posée APRÈS `competitionSlices` (`''` → null). Ne pas changer `fetchTournamentFee` (second appelant `nouvelle.tsx:168`).                                                                                                                                                                                                                                                                                            |
| K7                   | `src/components/operator/WaveLink.tsx:32`                                                                  | Lien Wave enregistré sans normalisation : sans « https:// », il casse « Payer par Wave » pour chaque organisateur.                                                                                                                 | Extraire `normalizeWaveLink` dans `src/lib/waveLink.ts` (pur, testé, message générique « Seuls les liens Wave (pay.wave.com) sont acceptés. », préfixe https si absent) ; `save` normalise avant `setSaving`, envoie `res.link`, puis `setValue(res.link)`. Pas de SQL. Vérifier la valeur actuellement en base.                                                                                                                                                                                                                                             |
| K7                   | `src/app/operateur.tsx:95`                                                                                 | Tarif d'un club « Bientôt » : « 12 500 » → NaN → club créé à 10 000 en silence ; « 12.500 » → échec.                                                                                                                               | Nettoyer à la saisie (`onChangeText` sans non-chiffres, `number-pad`), `Number(ncPrice)`, refus avec toast si rempli mais hors [1 000 ; 1 000 000] (le serveur `create_club` ne borne pas), vide = 10 000 par défaut documenté.                                                                                                                                                                                                                                                                                                                              |
| K7                   | `src/app/operateur.tsx:979`                                                                                | « Rouvrir » une demande de club APPROUVÉE la repasse à « Contacté » sans rien défaire : le club et l'accès restent.                                                                                                                | Pour `approved`, remplacer le bouton par « Club créé — gère-le dans l'onglet Clubs ». `markRequest` reste utilisé (WhatsApp, Écarter). Ne pas toucher le « Rouvrir » du support.                                                                                                                                                                                                                                                                                                                                                                             |
| K7                   | `src/app/operateur.tsx:1353`                                                                               | Texte faux : « Activer » (clubs démo locaux) ne vaut que sur l'appareil.                                                                                                                                                           | « Ici, « Activer » ne vaut que sur cet appareil (démo locale). » ; garder le renvoi vers « Demandes ».                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| K7                   | `src/components/operator/DiagnosticsCard.tsx:83`                                                           | Résumé chargé mais liste d'erreurs en échec → « tout roule 🎾 » sous une tuile rouge.                                                                                                                                              | `errors: RecentError[] \| null \| undefined` ; `setErrors(e)` sans filtre ; `undefined` → squelette, `null` → « Dernières erreurs indisponibles — vérifie ta connexion. » ; « tout roule » seulement si liste vide ET `errors7d === 0`. Pas de « tire pour rafraîchir » (la carte ne se recharge qu'au montage).                                                                                                                                                                                                                                             |
| K7                   | `src/app/coach-admin.tsx:553`                                                                              | Dispos du coach absentes de la grille du club : invisibles, impossibles à décocher, renvoyées à chaque enregistrement.                                                                                                             | Afficher les orphelines comme puces actives décochables (« 18:00 · hors horaires du club »), alerte sur `visibleSlots.length === 0`, envoyer `slots` tel quel. **Ne jamais filtrer à l'enregistrement** (le miroir local peut être périmé → perte de données).                                                                                                                                                                                                                                                                                               |
| K7                   | `src/app/coach-admin.tsx:183` + `groupLessons.ts`                                                          | Échec réseau à la création d'un cours collectif présenté comme un refus métier.                                                                                                                                                    | `createGroupLesson` → `{ id } \| 'refused' \| 'error'` (retour discriminé, pas `string \| 'error'`) ; écran : « Connexion impossible — vérifie ton réseau et réessaie » sur error ; élargir le texte du refus (« indisponible, passé ou en chevauchement »).                                                                                                                                                                                                                                                                                                 |
| K7                   | `src/components/operator/ManagerAccess.tsx:71`                                                             | Champ « Numéro du gérant » sans libellé d'accessibilité.                                                                                                                                                                           | `accessibilityLabel="Numéro de téléphone du gérant"`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| K5                   | `src/store/AppContext.tsx:2459`                                                                            | `submitSupportMessage` / `submitClubRequest` font un appel réseau (`getUser`) pour vérifier la connexion : hors ligne, « Connecte-toi… » à un joueur connecté.                                                                     | Utiliser `state.serverUserId` (ou `serverUserIdRef`), ajouter aux dépendances ; la RLS vérifie toujours `auth.uid()` ; hors ligne → « Envoi impossible — réessaie ».                                                                                                                                                                                                                                                                                                                                                                                         |
| K4                   | `src/app/reservations.tsx:198`                                                                             | Accepter / Refuser une invitation restent affichés jusqu'à la FIN du match ; le serveur refuse dès le début.                                                                                                                       | Garder la carte dans Invitations mais remplacer les boutons par « Le match a commencé — invitation close » quand `r.startsAt <= now` ; ceinture dans `respond()` (toast honnête si déjà commencé) ; compteur du titre sur les invitations encore répondables. Ne pas les retirer de la liste (elles disparaîtraient 90 min).                                                                                                                                                                                                                                 |
| K5                   | `src/store/AppContext.tsx:719`                                                                             | Un retrait de photo fait sur un autre appareil ne se propage jamais (repli local sur null serveur).                                                                                                                                | `photoUri: prof.photo_uri ?? undefined` uniquement (ne pas toucher birthDate/gender : un ancien compte perdrait ses valeurs locales). Note : pour la date de naissance, le retrait tient déjà grâce au `''` local.                                                                                                                                                                                                                                                                                                                                           |
| K5                   | `src/store/AppContext.tsx:645`                                                                             | Session révoquée pendant l'initialisation d'auth : compte fantôme à l'écran.                                                                                                                                                       | Lire `error` de `getSession` ; si `!userId && !sessErr && stillCurrent() && serverUserIdRef.current` → même reset que SIGNED_OUT via une fonction locale partagée `forceLoggedOut()` (pas de doublon). Jamais sans `serverUserIdRef` (sinon la photo d'inscription en attente serait perdue).                                                                                                                                                                                                                                                                |
| K5                   | `src/store/helpers.ts:39, 47`                                                                              | `frAuthError` : la branche `phone_taken` est inatteignable (GoTrue masque en « Database error saving new user »), le repli renvoie de l'anglais, un cas cite « la config Supabase ».                                               | Avant le repli : `database error saving new user` → « Inscription impossible — ce numéro est peut-être déjà utilisé par un autre compte. Réessaie ou connecte-toi. » ; repli → « Une erreur est survenue. Réessaie. » (journaliser le brut chez l'appelant, helpers reste pur) ; « disabled » → « Inscriptions momentanément fermées — réessaie plus tard ou écris-nous. » ; restreindre la branche `password` à `password should be` / `at least` ; identifiants incorrects + « — vérifie-les ou touche « Mot de passe oublié ? » ». Vérifier `test:logic`. |
| K5                   | `src/app/reset-password.tsx:74`                                                                            | Tout échec = « le lien a peut-être expiré », même « même mot de passe que l'ancien ».                                                                                                                                              | `same_password` (code ou `/different from the old/i`) → « Choisis un mot de passe différent de l'ancien. » ; erreur réseau → message réseau ; `weak_password` → la règle ; try/finally sur `setSubmitting`.                                                                                                                                                                                                                                                                                                                                                  |
| K5                   | `src/app/onboarding.tsx:622, 975` + `ClubInfoCard.tsx:265` + `SectionMonClub.tsx:1101`                     | Texte corail sur fond corail clair : contraste 4,15:1 < AA.                                                                                                                                                                        | `color={colors.coralDark}` sur les quatre `Txt` (icônes inchangées) ; grep des autres `Txt` en `danger` sur `dangerSoft`.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| K5                   | `src/app/onboarding.tsx:1250`                                                                              | Bouton œil sans `accessibilityRole="button"` (parité reset-password).                                                                                                                                                              | Ajouter le rôle.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| K8                   | `supabase/83_club_monetisation.sql:526`                                                                    | `create_group_lesson` écrit l'IDENTIFIANT technique (« padelta ») comme nom de club pour les 9 fondateurs (élèves, coach, push).                                                                                                   | Migration 91 : drop de la signature à 9 paramètres, recréation avec `p_club_name text default ''` (dernier), `coalesce(nullif(trim(p_club_name),''), clubs.name, p_club_id)` borné `left(…,80)`, revoke/grant sur la nouvelle signature ; client `groupLessons.ts` + `coach-admin.tsx:168` passent `clubName: club.name`. Repli client via `findClub` pour les lignes déjà écrites ; notify-club : `record.club_name \|\| clubName(record.club_id)`. Ne pas recoller la 83 ensuite.                                                                          |
| K8                   | `supabase/89_waitlist_purge_a_la_resa.sql:20` + `90`                                                       | La purge de l'alerte d'attente se fait sur l'ÉGALITÉ d'heure alors que l'alerte se déclenche sur le CHEVAUCHEMENT : alerte « créneau libéré » reçue pour une heure où l'on joue.                                                   | Migration 91 : `create or replace` du trigger 89 et recopie stricte de `join_group_lesson` (90) avec le chevauchement demi-ouvert via `hhmm_to_min` et `duration_min` (sur-ensemble de l'égalité, adjacence préservée) ; preuve locale (égal purgé, chevauchant purgé, adjacent conservé). Optionnel : même filtre dans le nettoyage local du tunnel.                                                                                                                                                                                                        |
| K8                   | `supabase/RESET-DONNEES-TEST.sql:55`                                                                       | La section « Aperçu » ne compte aucune des 14 tables v3 pourtant vidées par la section 2.                                                                                                                                          | 14 lignes `union all select '… à effacer', count(*)` (libellés FR : parts Wave, élèves de cours collectifs, notes privées, historique de niveau, favoris, suivis de club, alertes d'attente, réclamations fidélité, agenda, décomptes et carnets, annonces, réglages tournoi/app) ; étendre le récapitulatif final de même. Lecture seule.                                                                                                                                                                                                                   |
| K8                   | `supabase/functions/notify-club/index.ts:440, 427`                                                         | Push « Match annulé » attribue l'annulation « à son créateur » alors que `delete_club` et `delete_account` (coach) produisent la même transition.                                                                                  | Textes neutres : « … a été annulé. » (participants) et « Le créneau de X du … a été annulé » (gérant) ; commentaire l.421 recalé. Ne PAS passer `delete_club` en `club_cancelled`. Redéploiement v46.                                                                                                                                                                                                                                                                                                                                                        |
| K8                   | `supabase/functions/notify-club/index.ts:202`                                                              | `clubName()` ignore `club_overrides.name` : les push « Tu es maintenant coach » et « annonce club » portent l'ANCIEN nom d'un club renommé.                                                                                        | Lire d'abord `club_overrides.name` (`maybeSingle`), puis la chaîne actuelle ; vérifier qu'aucune autre branche ne compose un nom de club autrement. v46.                                                                                                                                                                                                                                                                                                                                                                                                     |
| K8                   | `supabase/functions/notify-club/index.ts:830`                                                              | Push de conflit de score : accuse toujours un score « différent » (le plafond de vainqueurs est aussi une cause), mélange « votre / du tien ».                                                                                     | « Les saisies de ton match {when} ne concordent pas (score différent ou plusieurs vainqueurs déclarés) — vérifiez ensemble dans Mes réservations. » v46.                                                                                                                                                                                                                                                                                                                                                                                                     |
| K9                   | `src/app/legal.tsx:56`                                                                                     | Les CGU in-app divergent du site : commission club et « frais réglés à PadelConnect par Wave » (retirés du site) restent publics sur club.padelconnectci.com/legal ; clauses « annulation par le club » et « lien Wave » absentes. | Recopier mot pour mot les textes FR de `site/cgu.html` (apostrophes typographiques) : frais « dus seulement si le club valide », retrait de la phrase commission, paragraphe annulation club, phrase « PadelConnect n'encaisse ni ne traite aucun paiement ». Effet au redéploiement web et au build.                                                                                                                                                                                                                                                        |
| K9                   | `site/assets/site.js:416`                                                                                  | Le site exclut les clubs serveur en « Bientôt » alors que l'app les montre.                                                                                                                                                        | `status=in.(active,coming_soon)` + `status` au select ; `comingSoon = statusById === 'coming_soon' \|\| (r.status === 'coming_soon' && statusById !== 'active')` (priorité de `club_status` comme l'app) ; filtre `hidden` conservé ; commentaires l.415/488 recalés.                                                                                                                                                                                                                                                                                        |
| K9                   | `site/assets/site.js:267`                                                                                  | À chaque chargement, les 9 fondateurs (y compris retirés) s'affichent d'abord, puis la liste se réduit.                                                                                                                            | `liveClubs = null` ; `renderClubs` ne rend rien tant que null (aussi au changement de langue) ; branche « échec total » → `liveClubs = CLUBS.slice(); renderClubs()` ; `index.html:136` badge neutre « ⭐ Clubs à Abidjan » ; commentaires l.265 / 388 recalés.                                                                                                                                                                                                                                                                                              |
| K9                   | `app.json:32`                                                                                              | Le lien de confirmation e-mail `/auth-callback` n'est déclaré que côté iOS : pas d'App Link Android.                                                                                                                               | Ajouter `{ scheme https, host padelconnectci.com, path /auth-callback }` dans `intentFilters[0].data` (prend effet au premier build Android) ; recaler `docs/ANDROID-LANCEMENT.md §4` et le commentaire `AppContext.tsx:596`. Test sur Android réel au moment du Play.                                                                                                                                                                                                                                                                                       |
| K9                   | `docs/CHECKLIST-STORES.md:122`                                                                             | Consigne périmée : « remplacer » un placeholder disparu ; promesse « Android envoyé vers Google Play » ; en-tête 1.0.0 / build 55.                                                                                                 | « AJOUTER l'empreinte Play App Signing à côté de celle d'EAS » ; « au lancement Play, remettre le bouton Android de get.html » ; en-tête : 1.0.2, build = app.json, SQL 02→90, 11 webhooks, renvoi CLAUDE.md §7 (pas de numéro de notify-club figé).                                                                                                                                                                                                                                                                                                         |
| K9                   | `.github/workflows/deploy-web.yml:20`                                                                      | `paths` sans `public/**` ni `scripts/fix-web-assets.sh` : une modif des en-têtes ou du correctif de polices ne redéploie pas.                                                                                                      | Ajouter `'public/**'` et `'scripts/fix-web-assets.sh'` (pas `scripts/**`) ; épingler `wrangler` sur une version exacte. Inerte tant que les secrets Cloudflare ne sont pas créés (voir §5).                                                                                                                                                                                                                                                                                                                                                                  |
| K9                   | `app.json:12`                                                                                              | Aucune localisation iOS déclarée : l'app est « anglaise » pour iOS (éléments système en anglais, fiche « Langues : Anglais »).                                                                                                     | `ios.infoPlist`: `CFBundleDevelopmentRegion: "fr"`, `CFBundleLocalizations: ["fr"]` (sans « en ») + `locales/fr.json` avec les chaînes de permission tutoyées et `NSRemindersUsageDescription` ; vérifier `fr.lproj` au prebuild ; build natif. (= amélioration H3.)                                                                                                                                                                                                                                                                                         |
| K10                  | `tests/reservations.test.ts:16`                                                                            | `npm run typecheck:tests` ÉCHOUE : `base()` n'a pas `open_level_min/max` ; le remappage de la fourchette n'est pas testé.                                                                                                          | Ajouter les deux champs à null ; trois cas (nombre, null/null, chaîne numeric castée `as unknown as number` → 3).                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| K10 (+K9)            | `CLAUDE.md:73` + skill cadence                                                                             | La cadence §6 ne liste pas `npm run typecheck:tests` (cause du constat précédent).                                                                                                                                                 | Ajouter la commande après `npx tsc --noEmit` dans CLAUDE.md §6, dans le bloc obligatoire de la compétence de cadence et dans l'agent testeur ; corriger d'abord le test ci-dessus.                                                                                                                                                                                                                                                                                                                                                                           |
| K10                  | `tests/reset.test.mjs:8`                                                                                   | Le test « Réinitialiser la démo » vérifie un miroir PÉRIMÉ (`resetAll` n'existe plus, « 4 amis seeds », équipes fictives).                                                                                                         | Garder les seules assertions de clôture locale (vérifier qu'elles sont encore justes), supprimer `seedFriends`/`resetAll`/`demoTeams`, renommer en-tête et message final ; sinon retirer le fichier de `test:logic`.                                                                                                                                                                                                                                                                                                                                         |
| K10 (+K4)            | `src/lib/matchMessages.ts:6`                                                                               | Module « pur, testable » sans test et inchargeable par node (imports sans `.ts`).                                                                                                                                                  | Imports en `.ts` (comme `levelRange.ts`) ; `tests/matchMessages.test.ts` (privé à 2 → /2 ; ouvert 2v2 vide → /4 dans les deux modèles, après le correctif MEDIUM ; équipe complète → pas de « find » ; singulier/pluriel ; capacité absente → 4) ; `TZ=UTC` ; ajouter à `test:logic`.                                                                                                                                                                                                                                                                        |
| K10                  | `package.json:13`                                                                                          | `expo-doctor` : 14 paquets en retard sur le SDK 56 ; Hermes du RN 0.85.3 touché par une régression mémoire connue.                                                                                                                 | **DÉCISION** (§5) : `npx expo install --fix` avant le #69 (react-native-screens passe en 4.26 : tester la navigation sur TestFlight), commit package.json + lock, cadence complète + `build:web`. Hermes : seul le SDK 57 corrige → chantier séparé, pas avant le lancement ; ne jamais forcer Hermes à la main.                                                                                                                                                                                                                                             |
| K3                   | `src/app/competition/[id].tsx:346`                                                                         | Le toast local de la fiche tournoi affiche les erreurs sur le fond VERT des succès.                                                                                                                                                | `style={[styles.toast, toast.tone === 'error' && styles.toastError]}` + `toastError: { backgroundColor: colors.danger }`. Ne pas factoriser les deux toasts locaux dans ce lot.                                                                                                                                                                                                                                                                                                                                                                              |
| K6                   | `src/components/club-admin/SectionMonClub.tsx:612` + `operator/ManagerAccess.tsx:30`                       | Validation du numéro « Déclarer ce coach » compte des caractères, pas des chiffres ; `ManagerAccess` recode la règle.                                                                                                              | `isValidPhone` de `@/lib/phone` aux l.612 et 1276 ; dans ManagerAccess, remplacer `digits.length < 8` (l.33, 50, 95, 104) et supprimer `digits` l.30 (grep).                                                                                                                                                                                                                                                                                                                                                                                                 |
| K6                   | `src/app/inscrire-club.tsx:15` (+ `clubs/index.tsx:16`, `onboarding.tsx:592`)                              | `CLUB_TYPES` redéfini sous le MÊME nom alors que `lib/clubConstants.ts` l'exporte « pour un seul endroit ».                                                                                                                        | Importer `CLUB_TYPES` aux trois endroits, retirer les imports `Club` devenus inutiles ; **ne pas** l'importer dans `data/clubs.ts` (cycle) ; commentaire de `clubConstants.ts` recalé.                                                                                                                                                                                                                                                                                                                                                                       |

### 3.3 COSMETIC (à grouper avec les lots ci-dessus ; aucun n'est bloquant)

| Lot | Fichier (ligne)                                                                                            | Problème                                                                                                                                                                                                                                             | Correctif                                                                                                                                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K1  | `reserver/[clubId].tsx:614, 615, 952, 957, 962`                                                            | Deux durées offertes, aucune choisie : prix sans « dès » et « Session de 1h ».                                                                                                                                                                       | `durationKnown = !slot \|\| !!effectiveDuration` : « dès » sur label et part par joueur, « choisis la durée » sur les trois mentions de durée.                                                                                                              |
| K1  | `reserver/[clubId].tsx:440`                                                                                | Commentaire justifiant `leaveSlotWaitlist` après succès, redondant depuis le trigger 89.                                                                                                                                                             | Garder `setWaitlist` (miroir), réécrire le commentaire, supprimer l'appel RPC (import encore utilisé par `toggleWaitlist`).                                                                                                                                 |
| K1  | `reserver/[clubId].tsx:59` (+ 4 occurrences sœurs)                                                         | Commentaires renvoyant à `reserver/index.tsx`, déplacé dans `(tabs)/reserver.tsx`.                                                                                                                                                                   | Remplacer la référence (vérifier que le motif todayKey y est).                                                                                                                                                                                              |
| K1  | `src/lib/slots.ts:13` (+ en-tête)                                                                          | « 1h30, comme partout » périmé depuis la 68.                                                                                                                                                                                                         | « durée de session de l'ANCIENNE grille club (slots, @90) et repli quand une résa n'a pas de durée — les créneaux réels sont 1h ou 1h30 par terrain (courtSchedule.ts, 68) ».                                                                               |
| K1  | `src/lib/pricing.ts:1`                                                                                     | En-tête : une plage = (début, fin, prix) alors qu'elle porte deux prix.                                                                                                                                                                              | « (heure de début, heure de fin, prix 1h30 + prix 1h optionnel — dérivé à ⅔ si vide) ».                                                                                                                                                                     |
| K1  | `reserver/[clubId].tsx:648`                                                                                | Bannière tournoi journée entière : « le terrain n'est pas réservable » (singulier).                                                                                                                                                                  | « … — aucun terrain n'est réservable. »                                                                                                                                                                                                                     |
| K1  | `reserver/[clubId].tsx:954`                                                                                | « ~X / joueur » avec espaces, contre « ~X/joueur » partout ailleurs.                                                                                                                                                                                 | « }/joueur à ».                                                                                                                                                                                                                                             |
| K1  | `src/components/BookingSheet.tsx:177`                                                                      | Pas de `hapticSuccess` au succès (le tunnel l'a).                                                                                                                                                                                                    | Importer et appeler en tête de `if (res.ok)`.                                                                                                                                                                                                               |
| K1  | `BookingSheet.tsx:518` (+ 2 autres)                                                                        | « 5h » sans espace.                                                                                                                                                                                                                                  | « 5 h » (espace insécable), harmoniser les commentaires.                                                                                                                                                                                                    |
| K3  | `competition/[id].tsx:854, 941`                                                                            | Branches « Tournoi officiel » mortes dans la carte de clôture (`canClose` impose non officiel).                                                                                                                                                      | Supprimer le bloc l.854-858, l.941 → « Facultatif. Tu peux passer. ».                                                                                                                                                                                       |
| K3  | `statistiques.tsx:292`                                                                                     | « 10 pour un tournoi joué » : seuls les officiels rapportent 10 points.                                                                                                                                                                              | « 10 pour un tournoi officiel joué ».                                                                                                                                                                                                                       |
| K3  | `competition/[id].tsx:1207, 1200, 1206` + `statistiques.tsx:255`                                           | « perd −0.25 » (double négation), points décimaux vs virgule française.                                                                                                                                                                              | « ton niveau perd 0,25 » ; virgule sur +0,50 / −0,25 ; `levelText(n, decimals)` partagé plutôt que `toFixed` ad hoc (grep des autres `toFixed` affichés).                                                                                                   |
| K3  | `competition/[id].tsx:413`                                                                                 | Puce « Clôture » pour la DATE du tournoi (plage entière), alors que « Clôturer » = désigner le vainqueur.                                                                                                                                            | Libellé « Date » dans tous les cas.                                                                                                                                                                                                                         |
| K3  | `competition/[id].tsx:322, 171` + `ClosePanel.tsx:10`                                                      | Commentaire faux (niveau en jeu) et typo « 1ᵉ ».                                                                                                                                                                                                     | « Clôture americano (amical, non officiel) : vainqueur + 2ᵉ/3ᵉ place — aucun niveau en jeu » ; « 1ʳᵉ » ; dans ClosePanel « niveau : seul le 1ᵉʳ, et seulement en tournoi officiel ».                                                                        |
| K4  | `reservations.tsx:885` + `(tabs)/competitions.tsx:37`                                                      | Règle « terminé » recodée au lieu d'`isCompFinished`.                                                                                                                                                                                                | `isCompFinished(c, today)` aux deux endroits (et `!isCompFinished` pour « à venir »).                                                                                                                                                                       |
| K4  | `reservations.tsx:42`                                                                                      | Tableau des mois copié de `lib/days.ts` ; 3ᵉ jeu différent dans Statistiques.                                                                                                                                                                        | Exporter `MONTHS` et `MONTHS[Number(mm)-1]?.toUpperCase() ?? ''` ; laisser la forme courte de Statistiques avec un commentaire.                                                                                                                             |
| K4  | `(tabs)/index.tsx:57, 813`                                                                                 | Deux comptes à rebours avec une branche de pluriel morte.                                                                                                                                                                                            | `dans ${diffDays} jours` aux deux endroits ; ne PAS fusionner (calculs volontairement différents).                                                                                                                                                          |
| K4  | `src/components/PlayerSheet.tsx:31`                                                                        | Deux helpers « prénom seul » qui divergent (`' '` vs `/\s+/`).                                                                                                                                                                                       | Un seul `firstName(name)` (`/\s+/`) dans `lib/format.ts` (grep d'abord).                                                                                                                                                                                    |
| K5  | `AppContext.tsx:1966`                                                                                      | « Tu es déjà ami avec X » mais X n'est pas ajouté au miroir.                                                                                                                                                                                         | Élargir la condition à `'already_friends'` ; commentaire l.1964 recalé.                                                                                                                                                                                     |
| K5  | `(tabs)/amis.tsx:87`                                                                                       | Toast accordé au masculin.                                                                                                                                                                                                                           | « Demande envoyée à X — en attente de sa réponse ✓ ».                                                                                                                                                                                                       |
| K5  | `amis.tsx:23` + `ClubPassesCard.tsx:17` + `onboarding.tsx:43, 89`                                          | `'+225 '` dupliqué quatre fois.                                                                                                                                                                                                                      | `export const DEFAULT_DIAL` depuis `lib/phone.ts` (grep d'abord).                                                                                                                                                                                           |
| K5  | `src/lib/notifications.ts:1` + `levelQuiz.ts:17`                                                           | En-têtes périmés (un seul rappel ; niveaux 6-7 « gagnés en tournoi » seulement).                                                                                                                                                                     | « deux notifications programmées par réservation à venir (fin de l'annulation gratuite, puis ~2 h avant) » ; « matchs validés — moteur 80, delta plafonné ±0,5 / 7 j — et tournois officiels, côté serveur ».                                               |
| K5  | `AppContext.tsx:1815, 1, 297, 862, 1151, 505, 322`                                                         | Commentaires périmés (« false si refusé » pour `markNoShow`, « (prototype) », « 3 chiffres », « coachs », « false = » sur setClubSlots) et doc de `updateAccount` en double.                                                                         | Recaler chacun (vérifier le corps de `markNoShow` et le contenu réel de `clubConfigSlices`) ; supprimer l.322-323.                                                                                                                                          |
| K5  | `(tabs)/profil.tsx:225`                                                                                    | Commentaire « n'évolue que par les tournois officiels ».                                                                                                                                                                                             | `{/* Mon niveau — ajusté côté serveur : moteur de niveau (80, matchs validés) + tournois officiels */}` (avec le LOW l.253).                                                                                                                                |
| K6  | `SectionMonClub.tsx:1194`                                                                                  | « les offres par défaut sont affichées aux joueurs » : aucune offre par défaut n'existe.                                                                                                                                                             | « Aucune publication pour l'instant : les joueurs ne voient aucune offre tant que tu n'en publies pas. » (vérifier la position du formulaire avant « ci-dessus »).                                                                                          |
| K6  | `SectionMonClub.tsx:1588`                                                                                  | Légende « gris » pour une puce blanche ; l'éditeur par terrain dit « clair ».                                                                                                                                                                        | « … ; les clairs sont fermés. »                                                                                                                                                                                                                             |
| K6  | `SectionReservations.tsx:1023` (+ commentaire l.115)                                                       | « sont de nouveau libres » pour une liste de 180 j incluant des créneaux passés ou repris.                                                                                                                                                           | « Ces créneaux ont été annulés par le joueur : ils ont été remis en vente au moment de l'annulation. » (sans « 5 h avant » non vérifié).                                                                                                                    |
| K6  | `src/lib/clubNews.ts:24`                                                                                   | Commentaire « refus à 100 max » alors que c'est un roulement.                                                                                                                                                                                        | « (droits, titre < 3, lien non-https ou > 300, annonce introuvable) ou échec réseau — au-delà de 100, les plus anciennes partent par roulement ».                                                                                                           |
| K6  | `SectionMonClub.tsx:387`                                                                                   | « finit avant minuit » : 22:30 + 1h30 = minuit pile.                                                                                                                                                                                                 | « 22:30 maximum : la dernière session de 1h30 finit à minuit pile (MAX_CLOSE). »                                                                                                                                                                            |
| K6  | `BlockRangeForm.tsx:142`                                                                                   | Champ Motif sans `maxLength` (le serveur tronque à 200).                                                                                                                                                                                             | `maxLength={200}`.                                                                                                                                                                                                                                          |
| K7  | `operator/TournamentFees.tsx:55`                                                                           | « Paiement reçu » sans garde anti double-tap.                                                                                                                                                                                                        | `useState` `busy` déclaré AVANT le return anticipé ; `try/finally` ; `disabled={busy !== null}` ; label accessible « Paiement reçu — {titre} ».                                                                                                             |
| K7  | `operateur.tsx:398`                                                                                        | Commentaire « DEPUIS LE LANCEMENT » pour une fenêtre de 6 mois.                                                                                                                                                                                      | « Commission cumulée sur la fenêtre du miroir (~6 derniers mois, MIRROR_WINDOW_MS) — chiffre vitrine. » (renommage `allTime*` facultatif, 4 usages).                                                                                                        |
| K7  | `operateur.tsx:490`                                                                                        | Cast inutile sur `findClub(...)?.contactPhone`.                                                                                                                                                                                                      | Même forme que `reservations.tsx:825`.                                                                                                                                                                                                                      |
| K7  | `coach-admin.tsx:209`                                                                                      | Toast `conflict` ne dit pas que la demande est refusée automatiquement.                                                                                                                                                                              | « Ce créneau n'est plus disponible (terrain pris ou fermé) — la demande a été refusée automatiquement, l'élève est prévenu. »                                                                                                                               |
| K7  | `operator/DiagnosticsCard.tsx:38, 13`                                                                      | Message « coller la migration 39 » visible du porteur.                                                                                                                                                                                               | « Diagnostics indisponibles — vérifie ta connexion. » ; commentaire « null = indisponible (hors-ligne) ».                                                                                                                                                   |
| K7  | `operator/TournamentFee.tsx:51, 9, 25`                                                                     | « Frais actuel », « Frais fixe », « un frais ».                                                                                                                                                                                                      | « Frais actuels », « Frais fixes », « des frais de tournoi ».                                                                                                                                                                                               |
| K7  | `operateur.tsx:745, 487` + `CommissionRates.tsx:77` (+ Espace Club)                                        | Espace avant « % » incohérente.                                                                                                                                                                                                                      | « X % » avec espace insécable partout (sauf l'en-tête CSV « Taux(%) »).                                                                                                                                                                                     |
| K7  | `operateur.tsx:970`                                                                                        | Message WhatsApp sans tiret après « PadelConnect » (contrairement à l.1278).                                                                                                                                                                         | « Bonjour 👋 PadelConnect — à propos de l'inscription de « X ». Es-tu dispo pour en parler ? »                                                                                                                                                              |
| K6  | `SectionTournois.tsx:133`                                                                                  | Message club → joueur au tutoiement (ailleurs vouvoiement).                                                                                                                                                                                          | « … au sujet de votre demande de tournoi « X ». »                                                                                                                                                                                                           |
| K8  | `schema.sql:2`, `80_moteur_niveau.sql:14`                                                                  | « 02→89 » ; « journalisation avec la ligue (SQL 84) ».                                                                                                                                                                                               | « 02→90 » ; « (lot E, migration à venir) ». Recaler CLAUDE.md §8 en cohérence.                                                                                                                                                                              |
| K8  | `notify-club/index.ts:453, 884`                                                                            | Deux formats de date dans la même phrase (libellé FR + clé ISO).                                                                                                                                                                                     | Mini helper `dateKeyLabel(key)` miroir de `src/lib/days.ts:55` (repli sur la clé brute si format invalide).                                                                                                                                                 |
| K8  | `notify-club/index.ts:490, 518, 607`                                                                       | Apostrophes droites contre « ’ » partout ailleurs.                                                                                                                                                                                                   | Remplacer.                                                                                                                                                                                                                                                  |
| K8  | `notify-club/index.ts:63, 783, 314, 393`                                                                   | Commentaire `data` périmé ; règle « least(2, joueurs-1) » commentée deux fois ; `if (fanIds.length)` toujours vrai ; fourchette « 3.5–4.5 » formatée différemment de l'app (« 3,5 – 4,5 », « 3 et plus », « 4 maximum », « niveau 3 » si min = max). | Recaler / supprimer / aligner (helper local miroir de `levelRangeLabel`). Tout dans la même v46.                                                                                                                                                            |
| K9  | `docs/PUSH-SETUP.md:117`                                                                                   | Matrice des déclencheurs incomplète (rétablissement résa, cours rétabli, join/leave match ouvert, tournoi opérateur).                                                                                                                                | Ajouter les puces (préciser que no_show→booked passe par « Annuler l'absence », livré e9cc14b).                                                                                                                                                             |
| K9  | `CLAUDE.md:129, 409, 61` ; `docs/AUDIT-SERVEUR.md` en-tête ; `README.md:20` ; `docs/UNIVERSAL-LINKS.md:34` | « HMAC temps constant » (c'est un secret partagé comparé à temps constant) ; état dépassé (redirection `padelco://`, 02→88, « aucun bouton Annuler l'absence ») ; README (1h30, 02→64, Expo Go) ; arbre du site faux.                                | Recaler sans réécrire l'historique daté (ajouter « depuis … ») ; vérifier avant d'écrire un numéro de version de notify-club ; README : « sessions 1h ou 1h30 », « 02 → 90 », niveau « quiz puis serveur », coachs réservables, build de dev / TestFlight.  |
| K9  | `site/get.html:4` (+ privacy, auth-callback)                                                               | Pas de `404.html` (soft-404, `/favicon.ico` renvoie du HTML) ; pas d'icône d'onglet sur 3 pages.                                                                                                                                                     | `site/404.html` autonome (chemins absolus, `noindex`, style inline compatible CSP) ; copier le `<link rel="icon">` d'index.html ; vérifier au curl que les réécritures `/invite/*`, `/club/*`, `/.well-known/*` répondent toujours 200.                     |
| K9  | `site/assets/site.js:412`                                                                                  | « 3 requêtes » alors qu'il y en a 4.                                                                                                                                                                                                                 | « les requêtes Supabase ».                                                                                                                                                                                                                                  |
| K9  | `app.json:72` + `docs/APP-STORE-CONFORMITE.md:64`                                                          | Texte de permission Photos qui vouvoie ; apostrophe ASCII dans Contacts.                                                                                                                                                                             | « PadelConnect accède à tes photos pour ta photo de profil et, côté gérant, les photos de ton club. » ; « t’aider ». Natif → prochain build.                                                                                                                |
| K9  | `src/app/+html.tsx:5`                                                                                      | « version web (démo) ».                                                                                                                                                                                                                              | « Document HTML racine de la version web (export Expo déployé sur club.padelconnectci.com)… ».                                                                                                                                                              |
| K10 | `src/theme/index.ts:114`                                                                                   | `shadowCard`, `theme`, `export default` sans consommateur.                                                                                                                                                                                           | Supprimer les lignes 114-118 (tsc confirme).                                                                                                                                                                                                                |
| K10 | `src/lib/days.ts:8`                                                                                        | Commentaire « plus de 86400000 en dur » faux : `MINUTE_MS`/`HOUR_MS` jamais importés, 7 fichiers avec des durées en dur.                                                                                                                             | Remplacer les littéraux par `DAY_MS`/`HOUR_MS`/`MINUTE_MS` (sans toucher le commentaire SQL de `reservations.tsx:210`).                                                                                                                                     |
| K10 | `src/lib/format.ts:4` + `data/competitions.ts:142` + `competition/[id].tsx:485`                            | Deux séparateurs de milliers (espace fine insécable dans `fcfa`, espace ordinaire dans `formatFee`) ; commentaire de test faux.                                                                                                                      | `competition/[id].tsx:485` → `fcfa(comp.commission ?? 0)` (vérifier que le bloc n'est rendu que si défini) ; `competitions.ts:142` → même séparateur que `fcfa` ; `tests/format.test.ts:28` recalé. Ne pas changer `fcfa` (16 fichiers, messages WhatsApp). |
| K10 | `reserver/[clubId].tsx:985` + `cours/[coachId].tsx`                                                        | `Label` et `Row` copiés octet pour octet.                                                                                                                                                                                                            | Exporter `RecapLabel` / `RecapRow` depuis `ui.tsx` (noms non génériques), retirer les copies et la clé `row` (grep avant).                                                                                                                                  |
| K10 | `src/lib/pricing.ts:138, 162`                                                                              | Messages mélangeant « F » et « FCFA » ; seule apostrophe ASCII des textes.                                                                                                                                                                           | `fcfa()` dans les messages (vérifier l'absence de cycle `format` ↔ `pricing` et les tests) ; « après l’ouverture ».                                                                                                                                         |
| K10 | `src/app/clubs/index.tsx:20`                                                                               | Diacritiques combinants littéraux invisibles dans la regex.                                                                                                                                                                                          | Plage en échappements ASCII (`̀-ͯ`), comportement identique.                                                                                                                                                                                                  |
| K10 | `src/data/clubs.ts:316`                                                                                    | `SAMPLE_SLOTS` présentée comme « démo » alors que c'est la grille de repli de production.                                                                                                                                                            | « Grille de REPLI (sessions 1h30) d'un club qui n'a encore réglé ni club_config.slots ni court_slots — cf. resolveCourtSlots. »                                                                                                                             |
| K10 | `tests/reset.test.mjs:66`                                                                                  | « (3.50 → 3.75) » alors que l'assertion donne 4.00.                                                                                                                                                                                                  | « (3.50 → 4.00) » (sans objet si le bloc est réécrit).                                                                                                                                                                                                      |

---

## 4. Améliorations proposées avant le lancement

Huit lots. Chaque proposition porte un numéro (lettre du lot + rang de priorité). Les doublons
entre lots ont été fusionnés (mention « fusion »). La ligne **Quand** dit si l'amélioration entre
dans le build #69 ou si elle est reportée après le lancement, d'après l'avis des relecteurs.

Légende : **Effort** S (quelques heures) / M (1 à 3 jours) / L (plus d'une semaine) ·
**Build** : « JS » = part avec le prochain build iOS sans rien de plus ; « natif » = nouveau build
obligatoire ; « web/site » = redéploiement seulement ; « aucun » = réglage hors code.

### Lot A — Interface

**A1 — Les messages restent visibles quand une feuille ou une modale est ouverte**
(fusion UI-1 + FX-2) · Priorité ★★★★★ · Effort S · Risque faible · Build JS · SQL non · Décision non

- _Pour l'utilisateur_ : au moment le plus sensible (réserver), si ça ne passe pas (terrain pris,
  pas de réseau, trop de réservations), le joueur voit enfin pourquoi, au lieu d'un bouton qui
  redevient actif sans rien dire. Même chose pour « Ajouté à ton calendrier ✓ » sur l'écran de succès.
- _Référence_ : Playtomic affiche le refus dans la feuille de réservation elle-même ; les règles
  d'Apple demandent un retour visible au-dessus de la vue présentée.
- _Ce qu'on fait_ : confirmer d'abord le défaut sur un iPhone (feuille rapide en mode avion,
  2 minutes). Puis une **pile de surfaces** dans le fournisseur de toast : chaque feuille (BottomSheet,
  BookingSheet, BookingConfirmation) héberge un `ToastOutlet` qui s'enregistre au montage et se
  retire dès que la fermeture commence ; seule la surface la plus haute dessine le message ; l'annonce
  vocale reste faite une seule fois. On ne touche PAS aux deux toasts locaux de la fiche club et de la
  fiche tournoi (ils marchent ; harmonisation plus tard).
- _Quand_ : avant le build #69.

**A2 — Premier écran : logo lisible, contenu hors de l'encoche, numéro guidé**
(fusion UI-3 + TXT-1) · Priorité ★★★★★ · Effort S · Risque faible · Build JS · SQL non · Décision : valider l'exemple de numéro

- _Pour l'utilisateur_ : la toute première impression. Aujourd'hui le mot « Connect » du logo est
  de la couleur exacte du fond vert (quasi invisible) sur les 4 héros de l'inscription, et le haut de
  l'écran passe sous la Dynamic Island. Le message « Numéro invalide — au moins 8 chiffres » ne dit
  ni la règle locale ni quoi faire.
- _Référence_ : Playtomic et Anybuddy ouvrent sur un héros sombre avec logo blanc et un format de
  numéro attendu.
- _Ce qu'on fait_ : `tone="light"` sur les 4 logos ; marge haute = zone sûre + 24 sur les héros hors
  `Screen` (onboarding, email-confirmed) ; message « Numéro incomplet — en Côte d'Ivoire : 10 chiffres
  après +225 (ex. 07 07 07 07 07) » sans changer la règle (numéros étrangers acceptés) ;
  `accessibilityLabel` sur les deux champs de reset-password ; e-mail de connexion en
  `textContentType="username"`. Pas de mise en forme automatique pendant la saisie (retirée).
- _Quand_ : avant le build #69.

**A3 — Photos de club : repli sans chevauchement**
(UI-4 réduit) · Priorité ★★★★ · Effort S · Risque faible · Build JS · SQL non · Décision : voir §5 (photos des 9 clubs)

- _Pour l'utilisateur_ : tant qu'un club n'a pas de photo, le visuel de repli dessine ses initiales
  en gros SOUS le nom du club écrit en blanc : deux textes se superposent. On ne passe plus les
  initiales quand une légende est fournie ; les initiales du placeholder deviennent centrées et
  atténuées. Le vrai levier est d'obtenir une photo de couverture et une photo par terrain de chacun
  des 9 clubs et de les poser via l'Espace Club avant l'ouverture publique.
- _Référence_ : chez Playtomic la photo est le premier repère (carte plein cadre, vignette par ligne).
- _Reporté après lancement_ : vignettes 56×56 et note dans les listes de l'onglet Réserver, une fois
  que les clubs ont de vraies photos.
- _Quand_ : correctif de repli avant le #69 ; photos à collecter maintenant (porteur).

**A4 — Fiche club : note affichée une seule fois** (UI-5 réduit) · Priorité ★★ · Effort S · Risque faible · Build JS

- _Pour l'utilisateur_ : la note apparaît deux fois en haut de la fiche (badge et info-chip) ; on garde
  l'info-chip.
- _Reporté après lancement_ : bloc « Disponibilités » réservable directement en haut de la fiche
  (7 pastilles de jour + puces « 18:00 · dès 12 000 F » qui ouvrent le tunnel pré-rempli), en
  réutilisant strictement le sélecteur de dispo de l'onglet Réserver. Référence : l'onglet « Book »
  du profil club Playtomic. Risque moyen : un tour d'audit dédié ensuite.

### Lot B — Effets et micro-interactions

**B1 — Respecter « Réduire les animations » de l'iPhone**
(fusion FX-1 + TXT-6 + partie UI-7) · Priorité ★★★ · Effort S · Risque faible · Build JS · SQL non · Décision non

- _Pour l'utilisateur_ : les joueurs sensibles au mouvement (vertiges, migraines) ne subissent plus
  les boucles infinies de l'accueil et des écrans de succès ; la batterie est épargnée.
- _Référence_ : Apple HIG « Motion » ; Playtomic suit le réglage système.
- _Ce qu'on fait_ : hook `useReduceMotion` (valeur initiale posée dans le `.then`, abonnement retiré au
  démontage) appliqué aux 4 boucles infinies, aux confettis (rien + `onDone`), à Reveal / PopIn
  (fondu seul). Mise en pause de la boucle de l'accueil quand l'onglet n'est pas affiché
  (`useFocusEffect`), quel que soit le réglage. On ne touche ni à la transition du Stack, ni au
  splash, ni aux compteurs.
- _Quand_ : avant le #69 si le temps le permet, sinon juste après. Ne rien déclarer dans App Store
  Connect avant que tout soit en place.

**B2 — Retour en haut au second tap sur l'onglet** (FX-4 réduit) · Priorité ★★ · Effort S · Risque faible · Build JS

- _Pour l'utilisateur_ : retaper l'onglet actif remonte la liste en haut, comme dans toutes les
  grandes apps ; petite vibration au changement d'onglet.
- _Ce qu'on fait_ : `useScrollToTop` sur les 5 onglets via la `scrollRef` que `Screen` expose déjà
  (vérifier que chaque onglet passe par `Screen`), `hapticLight` au `tabPress`. Fondu entre onglets,
  rebond d'icône et pastille animée : abandonnés.
- _Quand_ : peut entrer dans le #69 (lot minuscule), sinon après.

**B3 — Le moment « Ton niveau a bougé »** (FX-3 réduit) · Priorité ★★ · Effort M · Risque moyen · Build JS · Décision : montrer aussi les baisses (recommandé, ton neutre)

- _Pour l'utilisateur_ : la jauge et le chiffre de « Mon niveau » s'animent de l'ancien au nouveau
  niveau (dernière entrée de l'historique), avec un petit badge « +0,13 » (ou « −0,08 » en neutre).
  C'est la boucle qui donne envie de rejouer et qui met en valeur le moteur de niveau déjà construit.
- _Référence_ : Playtomic met en scène le changement de niveau après chaque match.
- _Abandonné_ : confettis à la validation du score (le niveau ne bouge pas forcément à ce moment-là),
  bouton « Partager l'image » (il existe déjà). Le toast de validation ne doit pas promettre un
  ajustement de niveau (corrigé en §3).
- _Quand_ : après le lancement.

**B4 — Feuilles « glisser pour fermer »** (FX-7) · Priorité ★★ · Effort M · Risque moyen · Build JS

- _Avant le #69_ : une seule ligne, `accessibilityViewIsModal` sur la feuille de réservation rapide
  (les lecteurs d'écran restent dans la feuille).
- _Après le lancement_ : geste de fermeture sur la poignée et le titre de BottomSheet (PanResponder du
  cœur RN, jamais Reanimated), reconstruction de BookingSheet sur ce socle, le geste passant par le
  même `requestClose` que le bouton ✕ (garde pendant l'envoi). À rejouer contre les invariants de
  submit de la campagne d'audit.

### Lot C — Fonctionnalités joueur

**C1 — Fiche « match ouvert » dédiée + lien partageable padelconnectci.com/m/{id}**
(fusion J1 + G2) · Priorité ★★★★ · Effort M · Risque moyen · Build natif (lien Android) + site · SQL : lot 2 seulement · Décision : voir §5

- _Pour l'utilisateur_ : un joueur qui cherche un 4ᵉ poste le lien dans son groupe WhatsApp ; le
  copain tape et rejoint en deux secondes. Les push « match à ton niveau » ouvrent enfin le bon
  match. Avant de s'engager, on voit qui est inscrit (prénom, niveau, fiabilité).
- _Référence_ : Playtomic — chaque match a sa page et un lien de partage, première boucle virale du
  padel (« Sharing a Match to increase participants »).
- _Ce qu'on fait_, en trois lots : (1) sans SQL : écran `/match/[id]` alimenté par
  `fetch_open_matches` filtré sur l'id (« Ce match n'est plus disponible » sinon), même bouton
  Rejoindre et mêmes messages que la liste, boutons gelés pendant l'envoi ; tap sur une ligne de la
  liste ; routage du push `open_match` vers la fiche ; (2) RPC `fetch_open_match(p_id)` pour les
  participants acceptés (prénom + initiale + niveau, jamais de téléphone, bloqués masqués dans les
  deux sens, anon fermé, preuve en base) ; afficher « Joueurs inscrits (n/cap) » et non des
  équipes A/B qui n'existent pas en base ; (3) lien universel `/m/*` (AASA racine ET `.well-known`,
  `_redirects`, préfixe Android) + bouton « Partager le match » + modèle WhatsApp « Il manque des
  joueurs » sur ce lien. Déployer le site AVANT le build, sinon le lien tombe en 404. Lien différé
  après inscription : plus tard.
- _Quand_ : lot 1 avant le #69 si possible ; lots 2 et 3 juste après (la boucle n'a de valeur que si
  les matchs ouverts sont utilisés).

**C2 — Rappel après le match : « Alors, ce match ? Saisis le score »**
(fusion J2 + G3) · Priorité ★★★★ · Effort S · Risque faible · Build JS · SQL non · Décision : délai (+20 min) et texte

- _Pour l'utilisateur_ : plus de scores saisis, donc un niveau plus juste, un classement vivant et des
  badges débloqués. Un tap sur la notification ouvre « Mes réservations ».
- _Référence_ : Playtomic invite à enregistrer le résultat après chaque match ; Strava et sa boucle
  « activité terminée → partage ».
- _Ce qu'on fait_ : 3ᵉ notification locale à fin du créneau + 20 min, `kind` distinct
  `score-reminder` avec id stable (`score-{id}`), posée seulement si au moins un partenaire a un
  compte et a accepté (sinon le serveur répondrait « aucun joueur ») et si la résa est encore
  « booked » sans score saisi ; annulée par `cancelMatchReminder`, au « pas venu » et à l'annulation
  club ; texte honnête « il compte pour le classement et, une fois confirmé par l'adversaire, pour ton
  niveau ». Budget iOS : 18 réservations × 3 + 8 agenda = 62 < 64, commentaires recalés, test pur sur
  le budget. Pas de « Rejouer la semaine prochaine » nouveau (le bouton existe).
- _Quand_ : avant le build #69.

**C3 — Joueurs cliquables partout** (J5 réduit) · Priorité ★★★ · Effort S · Risque faible · Build JS · SQL non (phase 1)

- _Pour l'utilisateur_ : le créateur d'un match ouvert et les lignes du classement ouvrent la
  mini-fiche joueur (niveau, fiabilité, Suivre), sans rien inventer (les champs non fournis ne sont
  pas affichés).
- _Reporté après lancement_ : RPC `public_player_card` (points, rang, parties, victoires, club
  favori — jamais d'âge, de genre ni de téléphone), participants tappables dans Mes réservations,
  « Vous avez joué N fois ensemble ». Décision sur les champs publics : §5.
- _Quand_ : phase 1 avant le #69 si le temps le permet.

**C4 — Bloc « Matchs pour toi » sur l'accueil** (J8) · Priorité ★★ · Effort S · Risque faible · Build JS

- _Pour l'utilisateur_ : dès l'ouverture, une partie qui correspond à son niveau et à ses clubs.
- _Ce qu'on fait_ : réutiliser `OpenMatches` en mode compact (3 cartes, filtrées dans ma fourchette,
  tri pur testé : joueur suivi, club favori, dans les 48 h), masqué si vide ou hors ligne ; cartes
  vers la fiche C1.
- _Quand_ : après C1.

### Lot D — Club et opérateur

**D1 — Planning et blocage au-delà de 7 jours** (C3) · Priorité ★★★★ · Effort S · Risque faible · Build JS · SQL non · Décision : horizon 60 jours ?

- _Pour l'utilisateur_ : un client qui appelle pour « samedi dans 12 jours » peut être bloqué en
  trois gestes, au même endroit que d'habitude ; sans ça le gérant revient à l'agenda papier et la
  double vente réapparaît.
- _Référence_ : Playtomic Manager — planning navigable sur tout le mois.
- _Ce qu'on fait_ : 8ᵉ pastille « Autre date » (CalendarPicker existant, aujourd'hui → +60 j) et
  flèches ‹ › sur le planning du jour et dans QuickBlock seulement ; les calculs par jour
  (fermetures, tournoi, périodes, passage de minuit) prennent la date choisie. L'horizon des
  joueurs reste à 7 jours. ClubCancelForm inchangé.
- _Quand_ : avant le build #69.

**D2 — Réservation hors app NOMINATIVE** (C2, phase 1) · Priorité ★★★ · Effort M · Risque moyen · Build JS · SQL oui · Décision : §5

- _Pour l'utilisateur_ : « Bloqué · Awa » avec un bouton WhatsApp au lieu d'un blocage anonyme ; le
  gérant abandonne son cahier.
- _Référence_ : la « réservation manuelle » de Playtomic Manager porte un client.
- _Ce qu'on fait_ (phase 1) : nom du client (et téléphone en option) sur un blocage ponctuel, stockés
  dans `blocked_slot_notes` (table privée déjà utilisée par les récurrents, colonnes ajoutées), via un
  paramètre optionnel de la RPC existante ; `blocked_slots.reason` reste générique. Pas de prix ni de
  tuile de revenu hors app. Mention dans la confidentialité AVANT la mise en ligne ; prévoir le sort de
  ces données dans `delete_club`.
- _Quand_ : après le lancement, sur décision.

**D3 — Confirmation automatique des réservations (réglage par club)** (C1) · Priorité ★★★ · Effort M · Risque moyen · Build JS · SQL oui · Décision : §5

- _Pour l'utilisateur_ : le joueur a sa confirmation à la seconde ; le gérant ne garde la main que
  sur les exceptions.
- _Référence_ : chez Playtomic, Matchi, Book&Go la réservation est confirmée instantanément.
- _Ce qu'on fait_ : colonne `club_config.auto_confirm` (défaut off) + RPC dédiée (on ne touche pas
  `upsert_club_config`) ; trigger BEFORE INSERT nommé pour passer après les gardes, qui EXCLUT les
  réservations nées d'un cours (double validation coach + club conservée) et celles posées par le club
  lui-même ; push « Réservation confirmée ✅ » au joueur sur INSERT sans doublon avec l'UPDATE ; le
  gérant garde son push « nouvelle réservation » ; libellé « Confirmée automatiquement par le club » ;
  guide « 4 gestes » adapté ; ordre des triggers et tous les chemins d'insertion prouvés en base.
- _Quand_ : après le lancement, quand un gérant le demande.

**D4 — Fichier clients du club (mini-CRM)** (C4) · Priorité ★★ · Effort M · Risque faible · Build JS · SQL non · Décision : message WhatsApp de relance

- _Pour l'utilisateur_ : qui sont mes habitués, qui décroche depuis 30 jours, relance en un WhatsApp,
  créditer un carnet ou poser un créneau fixe. Version réduite : joueurs de l'app seulement, calcul
  côté client sur le miroir (l'écran dit « 6 derniers mois »), réservations annulées exclues des
  dépenses.
- _Quand_ : après 2-3 mois de données.

**D5 — Statistiques du club par période + export tableur** (C5) · Priorité ★★ · Effort M · Risque faible · Build JS · Décision : téléphone dans l'export ?

- Commencer par les puces 7 / 30 jours et l'export CSV (logique CSV factorisée avec l'export
  opérateur, testée) ; carte de chaleur et comparaison ▲/▼ plus tard.
- _Quand_ : après le lancement.

**D6 — Relevé de commission visible dans l'Espace Club** (C6) · Priorité ★★ · Effort S · Risque faible · SQL oui (2 policies) · Décision : §5 (afficher le taux au club ?)

- Rien tant que la décision n'est pas prise. Si oui : calcul extrait dans une lib commune
  opérateur/club (test d'égalité), policies SELECT strictement filtrées par `can_manage_club`,
  prouvées en base. Ne pas réutiliser le lien Wave des tournois sans accord.
- _Quand_ : après décision.

**D7 — Espace Club web en pleine largeur : planning terrains × heures**
(fusion C7 + web-04) · Priorité ★★ · Effort L · Risque moyen · Build web seulement · Décision : colonnes de la feuille imprimée

- _Pour l'utilisateur_ : sur l'ordinateur de l'accueil, toute la journée d'un regard (une colonne
  par terrain, blocs à la hauteur de leur durée, nom du client), jour suivant au clavier, feuille du
  jour imprimable (prénom seul par défaut, téléphone sur option).
- _Référence_ : Playtomic Manager, Doinsport, Matchi.
- _Ce qu'on fait_ : d'abord demander à 1 ou 2 gérants s'ils utilisent l'ordinateur ; puis lot 1 =
  prop `wide` sur `Screen` (web ≥ 1024 px seulement, 640 pt inchangé ailleurs) + grille en lecture
  cliquant sur le BottomSheet existant (bornes et positions en logique pure testée) ; lot 2 =
  raccourcis clavier ; lot 3 = impression.
- _Quand_ : après le lancement.

### Lot E — Croissance et notifications

**E1 — Écran « Bienvenue » après l'inscription : clubs, alertes de niveau, notifications au bon moment**
(G1) · Priorité ★★★★★ · Effort M · Risque moyen · Build JS · SQL non · Décision : textes et clubs mis en avant

- _Pour l'utilisateur_ : aujourd'hui la fenêtre iOS « Autoriser les notifications ? » surgit à froid
  dès la première connexion ; un refus est définitif et prive de toutes les notifications
  (confirmation du club, place libérée, score à saisir). Et l'alerte « match à ton niveau » ne touche
  personne tant que le joueur n'a ni suivi un club ni trouvé l'interrupteur au fond du profil.
- _Référence_ : Playtomic fait choisir niveau et clubs avant de proposer des matchs ; Apple et tous
  les guides d'opt-in recommandent une explication avant la fenêtre système.
- _Ce qu'on fait_ : route `bienvenue` montrée une fois par compte (drapeau local en try/catch),
  2 cartes : « Tes clubs » (cœurs → `follow_club`, Padelta en tête) + interrupteur « Matchs à ton
  niveau » (écriture honnête), puis « Reste au courant » (aperçu de 3 vraies notifications, bouton
  « Activer les notifications » qui SEUL demande la permission, « Plus tard »). Les deux points de
  demande actuels (`push.ts`, `notifications.ts`) deviennent muets et passent par un helper unique.
  Profil → Notifications : ligne « Notifications désactivées sur cet iPhone » + « Ouvrir les
  Réglages » et interrupteur affiché selon l'état réel ; les comptes déjà inscrits qui n'ont jamais vu
  la fenêtre la reçoivent une fois depuis cette carte. Pas de rappel sur l'écran de succès de la
  1ʳᵉ réservation (zone fragile).
- _Quand_ : avant le build #69.

**E2 — Parrainage qui survit à l'installation** (G4, partie site + client) · Priorité ★★★ · Effort S · Risque faible · Build JS + site · SQL non (phase 1) · Décision : récompense (§5, plus tard)

- _Pour l'utilisateur_ : sur un iPhone SANS l'app, le lien d'invitation redirige vers l'App Store et
  le code est perdu ; le filleul doit retaper 12 caractères. Désormais `/invite/CODE` affiche « Ton
  ami t'invite — ton code : XXXX » + « Copier le code et télécharger », et l'inscription a un bouton
  « Coller mon code » (presse-papiers lu au tap, regex existante).
- _Reporté après lancement_ (décision) : demande d'ami automatique parrain ↔ filleul (pas amitié
  directe), push au parrain à la 1ʳᵉ partie jouée du filleul, récompense via `app_config`, 12ᵉ webhook —
  avec preuve en base.
- _Quand_ : phase 1 avant le #69 (le site se redéploie sans build).

**E3 — Demande d'avis App Store au bon moment + ligne « Noter PadelConnect »** (G5) · Priorité ★★★ · Effort S · Risque faible · Build natif (module `expo-store-review`) · Décision : accepter le module natif

- _Pour l'utilisateur_ : la fiche n'a qu'UNE note face aux 5 400 de Playtomic ; une fiche crédible
  augmente directement les installations venues d'un lien WhatsApp.
- _Ce qu'on fait_ : d'abord la ligne « Noter PadelConnect ⭐ » dans Profil (lien direct, sans module) ;
  puis, si un build est prévu de toute façon, `expo-store-review` avec un seul déclencheur au départ
  (score validé sur une victoire), plafond local en try/catch (1 demande / 120 j, 3 / an, jamais dans
  les 7 premiers jours, jamais après une erreur).
- _Quand_ : ligne Profil avant le #69 ; module dans le #69 si accepté.

### Lot F — Fiabilité et backend

**F1 — Sauvegardes de la base vérifiées** (FIA-6) · Priorité ★★★★★ · Effort S · Risque faible · Build aucun · SQL non · Décision : plan Supabase (§5)

- _Pour l'utilisateur_ : les réservations, carnets payés, commissions et classements survivent à une
  fausse manipulation ou à un incident chez l'hébergeur.
- _Ce que le porteur fait_ : Dashboard → Settings → Billing : vérifier le plan et passer en Pro s'il
  n'y a pas de sauvegardes quotidiennes ; Database → Backups : vérifier qu'une sauvegarde de moins de
  24 h existe AVANT chaque collage de migration (règle à ajouter à `docs/AUDIT-SERVEUR.md`) ; garder
  l'export CSV hebdo de Finances comme filet comptable. L'exercice de restauration est fait par
  l'assistant (jamais le bouton « Restore » du Dashboard sur la production). PITR : plus tard.
- _Quand_ : maintenant.

**F2 — Plafonds anti-abus par compte + coupe-circuit des diagnostics** (FIA-3) · Priorité ★★★★ · Effort M · Risque moyen · Build JS (messages) · SQL oui · Décision : valider les chiffres

- _Pour l'utilisateur_ : personne ne peut aspirer la liste des joueurs par numéro, ni harceler un
  membre par demandes d'ami répétées, ni noyer l'opérateur de spam, ni remplir la base d'erreurs
  forgées.
- _Référence_ : table de compteurs par (utilisateur, action, fenêtre) recommandée par Supabase.
- _Ce qu'on fait_, serveur d'abord (protège dès le collage) : (1) `send_friend_request` refuse de
  ré-armer une demande refusée depuis moins de 7 jours, en silence (pas de nouveau statut révélant le
  refus, pas de push) ; (2) `app_errors` / `app_events` : longueurs bornées (CHECK posés `not valid`
  puis validés), coupe-circuit > 300 lignes / 10 min, purge > 30 jours en tête de
  `operator_diag_summary` ; (3) triggers 5 messages support / jour, 10 signalements / jour,
  3 demandes de club / jour (clé sur l'utilisateur, ignoré quand `auth.uid()` est nul pour ne pas
  casser l'inscription compte-club) ; (4) `find_player_by_phone` 30 / h, compteur partagé avec les
  demandes d'ami. Plafond `join_open_match` : reporté. Client : « Doucement 😊 — réessaie dans une
  heure » au lieu d'un faux « vérifie ta connexion ». Preuve en base.
- _Quand_ : SQL avant le lancement ; messages client dans le #69.

**F3 — Résilience réseau du client** (FIA-4) · Priorité ★★★★ · Effort M · Risque faible · Build JS · SQL non · Décision non

- _Pour l'utilisateur_ : sur un réseau capricieux, une lecture ratée est rejouée en moins d'une
  seconde, aucune requête ne pend plus de 15 secondes, un gérant qui garde l'Espace Club ouvert toute
  la journée n'est jamais déconnecté en silence.
- _Référence_ : la doc Supabase impose `startAutoRefresh` / `stopAutoRefresh` sur AppState en
  React Native.
- _Ce qu'on fait_, dans cet ordre : (1) écouteur AppState unique (natif seulement) — le plus rentable
  et le moins risqué ; (2) `withRetry` pur et testé, appliqué UNIQUEMENT aux lectures de session /
  premier plan et d'écran, jamais aux écritures ; (3) timeout 15 s sur les lectures seulement
  (Storage exempté ou 60-90 s). Pas de trace `session_load` dans `app_events`.
- _Quand_ : (1) avant le #69 ; (2) et (3) dans le #69 si le temps le permet.

**F4 — Index SQL manquants + fenêtre de lecture bornée** (FIA-2) · Priorité ★★★ · Effort S · Risque faible · Build JS (borne) · SQL oui · Décision non

- _Pour l'utilisateur_ : l'app reste instantanée à l'ouverture avec 10 × plus de réservations et les
  dispos restent justes quand l'app décolle ; moins de data consommée.
- _Ce qu'on fait_ : migration 92 limitée aux index réellement manquants sur les prédicats chauds
  (`reservations(date_key)` et `(starts_at)` partiels sur booked, `reservation_participants(user_id)`,
  `friend_requests(to_user)` partiel, `manager_clubs(club_id)`, `profiles(managed_club_id)` partiel,
  `lessons(reservation_id)`, `reviews(club_id)`, `match_results(user_id)`, `blocked_slots(date_key)`)
  - re-pose idempotente des index historiques ; prouvée par EXPLAIN. Puis borne
    `date_key ≤ aujourd'hui + 14 j` sur `fetchOccupancy` et `fetchBlockedSlots` APRÈS avoir vérifié
    par grep qu'aucun écran (coach, cours, ClubCancelForm, planning) ne lit plus loin.
- _Quand_ : index tout de suite ; borne dans le #69 après vérification.

**F5 — Chaîne de notifications surveillée depuis l'Espace opérateur** (FIA-1 réduit) · Priorité ★★★ · Effort M · Risque moyen · Build JS · SQL oui · Décision non

- _Pour l'utilisateur_ : aujourd'hui une panne de notifications se découvre quand un gérant appelle ;
  notify-club répond même « ok » quand Expo tombe. Demain : carte « Notifications » sous « Santé de
  l'app » : « dernier push réel il y a X » par table (un webhook désactivé se voit par l'absence de
  ligne), totaux 24 h / 7 j, dernière erreur.
- _Ce qu'on fait_ : table `push_log` écrite en fin d'exécution avec des compteurs honnêtes (ok / err /
  jetons morts), réponse « ok N / err M » (contrat HTTP 200 conservé), RPC `operator_push_health()`
  qui lit `push_log` ET vérifie dans le catalogue que les 11 triggers de webhook existent et écoutent
  INSERT + UPDATE ; branche `HEARTBEAT` sans secret appelée à l'ouverture de l'Espace opérateur. Pas
  de pg_cron, pas de Vault. Relecture des reçus Expo : après lancement (ou ≤ 100 tickets sur les
  envois de masse seulement). Preuve en base, `verify_jwt` préservé.
- _Quand_ : après le lancement.

**F6 — Santé de l'app lisible par un non-technicien** (FIA-5 réduit) · Priorité ★★ · Effort S · Risque faible · Build JS · SQL oui (même migration que F7)

- `operator_diag_summary` sépare bugs et coupures réseau (rouge seulement sur les bugs) ; table de
  traduction FR pure et testée (« Network request failed » → « Réseau du joueur coupé (pas un bug) ») ;
  bouton « Copier le rapport » (via `Share.share` si `expo-clipboard` manque). Suivi de route, tag
  régression, regroupement serveur : plus tard.
- _Quand_ : après le lancement.

**F7 — E-mails d'inscription : message honnête et plafond surveillé** (FIA-7) · Priorité ★★★ · Effort S · Risque faible · Build JS · SQL (tuile, plus tard) · Décision : Brevo Starter avant campagne (§5)

- _Pour l'utilisateur_ : quand Brevo refuse (300 e-mails / jour sur le plan gratuit), le joueur lit
  aujourd'hui une erreur en anglais. Demain : « Impossible d'envoyer l'e-mail pour le moment —
  réessaie dans une heure. » (formulaire conservé), avec un test. Ne PAS désactiver « Secure email
  change ». Tuile « Inscriptions 24 h » avec alerte à 200 : après lancement. Ligne J-1 dans la
  checklist : « vérifier le quota Brevo ».
- _Quand_ : message avant le #69 ; upgrade Brevo avant toute communication grand public.

**F8 — Bandeau « Données de HH:MM — Réessayer »** (FIA-8 réduit) · Priorité ★★ · Effort M · Risque faible · Build JS

- `lastSyncAt` seul, bandeau sur l'onglet Réserver et le planning de l'Espace Club uniquement, seuil
  30 min ; ni le tunnel ni la feuille rapide (invariants du submit). Message d'échec de réservation
  hors ligne : « Pas de réseau — vérifie dans Mes réservations si elle a été prise ».
- _Quand_ : après F3, après le lancement.

### Lot G — Textes et accessibilité

**G1 — Messages d'erreur qui disent quoi faire** (TXT-3 réduit) · Priorité ★★★ · Effort S · Risque faible · Build JS · Décision : ton des phrases

- _Avant le #69_ : les 4 toasts de l'Espace Club qui disent « réessaie plus tard » pour un refus
  définitif (une réservation à venir bloque la grille) → texte dédié ; `frAuthError` (branche
  `password` restreinte, jargon « config Supabase » remplacé, repli en français, « — vérifie-les ou
  touche « Mot de passe oublié ? » ») — déjà listé en §3.
- _Après le lancement_ : module `errorCopy` à 4 familles (réseau / refus définitif / session expirée /
  inattendu), réécriture des ~100 chaînes « X impossible — réessaie », toast d'erreur tenu 5 s
  minimum et sans disparition automatique quand un lecteur d'écran est actif.

**G2 — Passe VoiceOver sur les 5 tâches courantes** (TXT-5) · Priorité ★★★ · Effort M · Risque faible · Build JS · Décision : déclarations App Store Connect (plus tard)

- _Avant le #69_ : `accessibilityViewIsModal` + scrim masqué sur BookingSheet (comme BottomSheet),
  `accessibilityLabel` sur les champs décrits seulement par leur placeholder (création de tournoi,
  reset-password, numéro d'ami — partagés avec §3 et A2), bouton « Ignorer » des nudges sorti du
  Pressable parent, `accessibilityRole="header"` sur les libellés de section du tunnel,
  `accessibilityState selected` sur les choix de ClosePanel et QuickBlock.
- _Si le temps le permet_ : libellé long des pastilles de jour (« Dimanche 12 octobre »), hitSlop sur
  `Button size="sm"` (40 pt, 52 usages), contraste du texte blanc sur le violet clair de la fiche
  tournoi.
- _Après_ : recette VoiceOver réelle sur iPhone (s'inscrire, se connecter, réserver, rejoindre un
  match, annuler) ; ne déclarer dans App Store Connect que ce que la recette prouve.

**G3 — Formats locaux homogènes** (TXT-7) · Priorité ★★★ · Effort S · Risque faible · Build JS · Décision : décimales du niveau (§5)

- Prix insécables (U+00A0 entre milliers et avant FCFA, test), `levelText(n, decimals)` avec virgule
  partout (profil, Statistiques, PlayerSheet, fiche tournoi, Amis, Classement), texte du niveau du
  profil réécrit après vérification des deltas réels en SQL, `formatPhoneCI()` d'AFFICHAGE seulement
  (« +225 07 07 07 07 07 »), sur les numéros déjà visibles (vue gérant), jamais réinjecté.
- _Quand_ : avant le #69 (petit lot, partagé avec les COSMETIC de §3).

**G4 — Texte agrandi maîtrisé** (fusion TXT-4 + partie UI-7) · Priorité ★★ · Effort M · Risque moyen · Build JS

- _Avant le #69_ : plafonds `maxFontSizeMultiplier` (≈ 1,3 – 1,5) sur les libellés à hauteur fixe
  (Button, Chip, Tag, barre d'onglets, pastilles de jour), testés au réglage maximal.
- _Après_ : `minHeight` à la place de `height`, plafond 2,0 sur le texte courant, recette sur 6 écrans
  — condition pour déclarer « Texte plus grand » sur la fiche.

**G5 — Remplissage automatique iOS des identifiants** (TXT-8) · Priorité ★★ · Effort S · Risque moyen · Build natif + site · Décision : accepter le redéploiement AASA avant le build

- `webcredentials:padelconnectci.com` (et `club.padelconnectci.com` si on veut le trousseau partagé
  avec l'Espace Club web, avec une AASA sur ce projet) dans `associatedDomains` + bloc `webcredentials`
  dans les deux AASA, déployés AVANT le build ; champs `newPassword` à l'inscription et au reset.
  Test sur vrai iPhone (le CDN d'Apple peut mettre 24 h).
- _Quand_ : dans le #69 si l'AASA est redéployée à temps, sinon au suivant.

### Lot H — Site et stores

**H1 — Redéployer l'Espace Club web (icônes cassées, version en retard) et fiabiliser le déploiement**
(fusion web-01 + UI-2) · Priorité ★★★★★ · Effort S · Risque faible · Build web · SQL non · Décision : secrets GitHub ou jeton Cloudflare (§5)

- _Pour l'utilisateur_ : vérifié en ligne le 21/10 : la police d'icônes de club.padelconnectci.com
  répond du HTML, donc TOUTES les icônes (onglets, cadenas, coche, trophée, boutons) sont vides, et le
  bundle en ligne n'a ni les badges ni « Annuler l'absence ». On ne peut pas montrer l'Espace Club à un
  gérant dans cet état.
- _Ce qu'on fait_ : (1) tout de suite, redéploiement par `scripts/deploy-web.sh` (qui applique déjà le
  correctif de polices) puis contrôle au curl (police en `font/ttf`, hash du bundle dans l'index) ;
  (2) workflow : `public/**` et `scripts/fix-web-assets.sh` dans les déclencheurs, wrangler épinglé,
  étape de contrôle après déploiement qui FAIT ÉCHOUER le job si la police n'est pas servie ;
  (3) `public/index.html` via `expo customize` (lang fr, titre, description, theme-color, noscript
  en français — vérifier dans l'export local que l'export « single » le reprend) ;
  (4) `docs/ESPACE-CLUB-WEB.md` : la procédure glisser-déposer doit exécuter le correctif de polices.
- _Quand_ : maintenant.

**H2 — Fiche App Store refaite : sous-titre, mots-clés, description juste, vraies captures**
(fusion store-01 + G6) · Priorité ★★★★★ · Effort M · Risque faible · Build aucun (métadonnées) · Décision : §5

- _Pour l'utilisateur_ : sur « padel » dans le store CI, PadelConnect est absent du top 25 ; sur
  « abidjan padel » il est 8ᵉ derrière 5 apps de club ; une homonyme « PADELCONNECT. » brouille la
  marque. La description parle encore de « sessions de 1h30 » et vouvoie ; la 1ʳᵉ capture montre des
  clubs FICTIFS (« Central Padel ★4.9 (126) ») — contraire à la règle « aucune donnée factice ».
- _Référence_ : Anybuddy (8 captures, URL de site), Playtomic (description par bénéfices).
- _Ce qu'on fait_ : phase 1, sans attendre : texte promotionnel, URL marketing (`padelconnectci.com`)
  et d'assistance (`/cgu`), remplacement des captures fictives par 5 à 8 captures de l'app RÉELLE sur
  un compte de démo avec de vrais clubs (accord des clubs), légendes FR ; phase 2 avec la 1.0.3 : nom
  « PadelConnect CI: Padel Abidjan », sous-titre « Réserve ton terrain en 2 min », mots-clés
  ≤ 100 caractères (quartiers des clubs visibles seulement), description au « tu » par bénéfices ne
  citant que ce qui est dans le binaire soumis. Source de vérité : `docs/CHECKLIST-STORES.md §3`,
  poussée par l'API App Store Connect avec la clé d'équipe hors dépôt. Pas d'In-App Event.
- _Quand_ : phase 1 maintenant ; phase 2 avec le #69.

**H3 — Déclarer l'app en FRANÇAIS** (fusion store-02 + TXT-2) · Priorité ★★★★ · Effort S · Risque faible · Build natif + web · Décision : fiche anglaise « App in French » (plus tard)

- _Pour l'utilisateur_ : la fiche affiche « Langues : Anglais » pour une app 100 % française ; les
  éléments système (feuille de partage, copier/coller, boutons d'alertes) sortent en anglais, et la
  version web est servie en `lang="en"` (voix anglaise des lecteurs d'écran).
- _Ce qu'on fait_ : `app.json` → `CFBundleDevelopmentRegion: "fr"`, `CFBundleLocalizations: ["fr"]`,
  `locales/fr.json` reprenant les chaînes de permission tutoyées + `NSRemindersUsageDescription`
  (aujourd'hui en anglais) ; contrôle au prebuild que `fr.lproj/InfoPlist.strings` reprend tout et que
  le nom affiché reste « PadelConnect » ; web : `lang="fr"` via `public/index.html` (H1). Le site
  gère déjà sa langue. Pas de traduction de l'app avant le lancement (≈ 2 400 chaînes).
- _Quand_ : dans le #69 (pas de build dédié).

**H4 — Page /get : chemin immédiat pour Android et ordinateur via la version web** (web-02) · Priorité ★★★★ · Effort M · Risque moyen · Build web/site · Décision : §5

- _Pour l'utilisateur_ : 3 invités sur 4 sont sous Android ; aujourd'hui ils tombent sur « la version
  Android arrive bientôt » et le code de parrainage est perdu. Ce pont NE remplace PAS Google Play
  (gardé pour plus tard).
- _Ce qu'on fait_, après H1 : étape A — `get.html` conserve le chemin et propose « Utiliser la version
  navigateur » vers `club.padelconnectci.com` + même chemin, texte honnête (« sans notifications »),
  `pickImage` passe par `alertAsync` sur le web, et `/club/ID` soit rendu public en lecture seule, soit
  renvoyé vers `/` sans promettre la fiche ; étape B OBLIGATOIRE — recette sur un Android réel
  (inscription, confirmation e-mail, réservation, matchs ouverts, parrainage, photo) ; étape C
  optionnelle — manifest installable, icône d'accueil, Smart App Banner Apple (posée ici une seule
  fois). Garder le domaine `club.` (liste blanche Supabase inchangée). Prévoir le retrait du pont au
  lancement Play.
- _Quand_ : étapes A + B avant le lancement public si la recette passe ; sinon après.

**H5 — Site vitrine : vraies photos, vrais prix, captures réelles, « comment ça marche »** (web-05) · Priorité ★★★ · Effort M · Risque faible · Build site · Décision : photos des clubs, terrains d'Elite Club, témoignages réels (§5)

- _Pour l'utilisateur_ : la maquette du héros affiche du contenu inventé (« 6 équipes inscrites »), le
  sous-titre cite un club masqué, les cartes n'ont ni photo ni prix réel, Elite Club compte 8
  « terrains » dont PADBOL / BASKET / VOLLEY, « Inscrire mon club » envoie vers l'App Store alors
  qu'un gérant sur ordinateur peut s'inscrire sur la web app.
- _Ce qu'on fait_ : lot 1 — retirer tout contenu inventé (captures réelles de H2), corriger le
  sous-titre, « Inscrire mon club » → `club.padelconnectci.com` (après H1), comptage des terrains à
  trancher ; lot 2 — photo `cover_url` et « dès » calculé sur `price_tiers` avec mention 1h / 1h30
  (fusionné avec le MEDIUM de §3), CSP `img-src https://*.supabase.co` ; plus tard — QR code, badge
  App Store officiel, section « Comment ça marche », témoignages uniquement s'ils sont réels.
- _Quand_ : lots 1 et 2 avant le lancement public (le site se redéploie sans build).

**H6 — Pages publiques par club et socle SEO** (web-03) · Priorité ★★ · Effort L · Risque moyen · Build site · Décision : §5 (exception anon, plus tard)

- _Tout de suite (S, statique)_ : `robots.txt` et `sitemap.xml` statiques, `404.html` (déjà en §3),
  redirection 301 www → apex (Redirect Rule Cloudflare, pas faisable dans `_redirects`).
- _Plus tard_ : Pages Function `/club/[id]` rendue côté serveur (titre « Padel à {quartier} — {club} »,
  photo en aperçu WhatsApp, horaires, prix, JSON-LD, échappement strict), en gardant le repli `/get`
  pour les visiteurs sans app. Pas de « créneaux libres publics » (exception à la règle anon de la 84).
- _Référence_ : Playtomic publie une page par club ; sur Google, « padel Abidjan réserver » n'a aucune
  page de réservation — la place est libre.

**H7 — Liens de tournoi partageables** (web-06) · Priorité ★★ · Effort M · Risque moyen · Build natif (lien) + site · SQL (version complète) · Décision : §5

- _Version minimale sans SQL_ (à embarquer dans un futur build) : `shareCompetition` pointe vers
  `padelconnectci.com/competition/ID`, `/competition/*` ajouté aux DEUX AASA (réalignées — la copie
  `.well-known` est aujourd'hui divergente) et réécrit vers `/get` ; l'iPhone qui a l'app ouvre la fiche
  directement.
- _Après le lancement, sur décision_ : RPC `public_competition` (tournois publiés seulement, champs en
  liste blanche, jamais le téléphone de l'organisateur) + page avec aperçu.

### Ordre recommandé

1. **Tout de suite, sans build** (semaine 1) : F1 sauvegardes (porteur) · H1 redéploiement web +
   contrôle · H2 phase 1 (promo, URL, captures réelles) · H5 lots 1-2 et le MEDIUM « prix dès » du
   site · H6 statique (robots, sitemap, 404, www) · F4 index SQL · F2 SQL anti-abus · migration 91
   (K8) et notify-club v46 · secrets GitHub ou jeton Cloudflare (porteur). Pourquoi : ce qui est
   public et faux (icônes vides, captures fictives, prix faux, CGU divergentes) se corrige sans
   attendre le build, et le serveur protège dès le collage.
2. **Correctifs du §3** (lots K1 → K10 en parallèle, semaine 1-2) : d'abord les 10 MEDIUM, puis les
   LOW, les COSMETIC groupés par lot. Pourquoi : ils ferment des écrans menteurs et des boucles
   « réessaie » qui coûtent la confiance ; ils sont tous prouvés et petits.
3. **Améliorations « avant le #69 »** (semaine 2-3), par rendement : A1 toasts dans les feuilles ·
   A2 premier écran · E1 écran Bienvenue (notifications et alertes de niveau, le plus gros levier de
   rétention) · C2 rappel post-match · D1 planning au-delà de 7 jours · F3 (1) AppState · F7 message
   e-mail · E2 parrainage (site + bouton Coller) · E3 ligne « Noter » · G2 et G3 petits lots · H3
   localisation FR · A3 repli photo · B1 / B2 / C1 lot 1 / C3 phase 1 si le temps le permet ·
   `expo install --fix` (décision) · G5 si l'AASA part à temps. Pourquoi : tout est JS ou config
   native embarquée dans le même build, risque faible, et chaque item touche un moment où l'on perd
   aujourd'hui des joueurs (première ouverture, permission, réservation, score).
4. **Build #69** : cadence complète (tsc, lint, typecheck des tests, test:logic, bundle eager),
   TestFlight sur iPhone réel (navigation si `expo install --fix`, conflit à deux téléphones pour A1,
   texte agrandi, VoiceOver sur les 5 tâches), puis soumission avec la fiche H2 phase 2.
5. **Après le lancement**, dans cet ordre : H4 pont Android (recette Android d'abord) · C1 lots 2-3
   et C4 · D3 confirmation automatique (sur demande d'un gérant) · D2 réservation nominative · F5
   surveillance des notifications · B3, B4, G1 complet, G4 complet, F6, F8 · D4-D7 quand les clubs
   ont des données et utilisent l'ordinateur · H6-H7 pages publiques sur décision · SDK 57 (Hermes)
   en chantier séparé.

---

## 5. Décisions attendues du porteur

Réponds par oui / non (ou par le choix indiqué). Rien ne bloque les correctifs du §3 sauf les
points 1 à 4.

1. **Tournoi créé pour le jour même** : on interdit (date à partir de demain) — ou on avertit
   seulement ? Recommandé : interdire.
2. **Fermer un match ouvert avec fourchette de niveau** : on relâche la contrainte (variante B,
   fourchette conservée à la réouverture, rien côté client) ? Recommandé : oui.
3. **Inscription à un tournoi le jour J par appel forgé** : on ajoute la garde serveur dans la
   migration 91 ? Recommandé : oui (sinon on le consigne seulement).
4. **Bloquer un ami rompt l'amitié** (dans les deux sens, un déblocage ne la restaure pas) ? Recommandé : oui.
5. **Gérant : bouton « Retirer la réponse » à un avis** (aujourd'hui impossible) ? Oui / non.
6. **Niveau affiché aux autres joueurs** : 1 décimale (« 3,3 ») ou 2 (« 3,25 ») ? Recommandé : 1.
7. **Mettre à jour les dépendances** (`expo install --fix`) avant le #69, avec test de navigation sur
   TestFlight ? Recommandé : oui.
8. **Supabase** : vérifier le plan (Settings → Billing) et passer en Pro (≈ 25 $/mois) s'il n'y a pas
   de sauvegardes quotidiennes ? Recommandé : oui, maintenant.
9. **Brevo Starter** (≈ 9 $/mois, plus de plafond 300 e-mails/jour) avant toute campagne grand
   public ? Recommandé : oui, avant les affiches.
10. **Déploiement web** : créer les deux secrets GitHub (Cloudflare) pour que le déploiement
    automatique marche enfin — ou fournir le jeton à chaque fois ? Recommandé : les secrets.
11. **Photos des 9 clubs** : peux-tu obtenir de chacun une photo de couverture et une photo par
    terrain (droits compris), et leur accord pour le site et les captures ? Combien en ont déjà une ?
12. **Fiche App Store** : valides-tu le nom « PadelConnect CI: Padel Abidjan », le sous-titre
    « Réserve ton terrain en 2 min », les mots-clés et la description au « tu » (texte dans
    `docs/CHECKLIST-STORES.md §3`) ? La clé d'équipe reste hors dépôt.
13. **Écran Bienvenue** : valides-tu les textes des cartes et la liste des clubs mis en avant
    (Padelta en tête) ?
14. **Rappel après le match** : 20 minutes après la fin et le texte proposé — ok ?
15. **Plafonds anti-abus** : 30 recherches par numéro / heure, 20 demandes d'ami / jour,
    5 messages support / jour, 3 demandes de club / jour — ok ?
16. **Horizon de blocage côté club** : 60 jours ? (les joueurs restent à 7 jours)
17. **Module d'avis App Store** (`expo-store-review`, nouveau module natif dans le #69) : oui / non.
18. **Pont Android via la version navigateur** en attendant Google Play (après une recette sur un
    vrai Android) : oui / non.
19. **Elite Club** : ses lignes PADBOL / BASKET / VOLLEY sont-elles des terrains de padel ? Sinon on
    les exclut du comptage sur le site.
20. **À trancher plus tard, pas maintenant** : confirmation automatique des réservations (D3) et
    activation par les clubs fondateurs ; réservation hors app nominative avec le numéro du client
    (D2, mention confidentialité) ; relevé de commission visible du club, taux compris (D6) ; export
    club avec téléphone des clients (D5) ; récompense de parrainage et amitié automatique (E2) ;
    pages publiques club / tournoi avec une lecture anonyme limitée (H6, H7) ; déclarations
    d'accessibilité dans App Store Connect (après recette) ; fiche App Store en anglais « App in
    French » ; SDK 57 pour Hermes.
