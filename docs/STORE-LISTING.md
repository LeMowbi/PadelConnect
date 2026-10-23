# Fiches stores — PadelConnect v1.0.3 (build #69)

Source de vérité des textes App Store (iOS) et Google Play (Android), lot **H2** du plan
(`docs/PLAN-PRE-LANCEMENT-2026-10.md` §4, validé par le porteur). Chaque bloc ci-dessous se colle
**tel quel** : le texte entre les balises de code, sans les balises. Les comptes du §5 sont
**calculés** sur ce fichier par un script (pas estimés) : après toute retouche, relancer le script du §5.

Règles tenues dans tous les textes :

- **Aucune donnée factice** : seulement des fonctionnalités relues dans le code du #69 (voir §0),
  aucun chiffre d'utilisateurs, aucune note, aucun « n°1 », aucun avis ou citation.
- **Aucun nom de concurrent ni de marque tierce** dans le nom, le sous-titre, les mots-clés et la
  description courte Play (Apple 2.3.7, Play 9898842). Les noms des clubs fondateurs sont aussi des
  apps publiées sur le store CI : **jamais dans les mots-clés**.
- **Pas d'autre plateforme** : ni « Android » ni « Google Play » dans la fiche iOS, ni « iPhone » ni
  « App Store » dans la fiche Play (Apple 2.3.10).
- **Pas de prix ni de promotion** dans le nom, le sous-titre, la description courte Play ni les
  légendes des captures. La fidélité (−50 %) n'apparaît que dans le texte promotionnel, la
  description et les nouveautés.
- Tutoiement, apostrophe ’, « FCFA », pas de majuscules criardes, pas d'emoji.
- **Typographie des blocs à coller** (sauf nom et mots-clés) : espace insécable U+00A0 dans
  « 5 000 FCFA » (milliers et devise), dans « −50 % », avant « : » et « ? », et à l'intérieur des
  guillemets « », pour qu'aucune coupure de ligne ne les sépare sur le store. Heures écrites comme
  dans l'app, sans espace : « 1h », « 1h30 », « 5h », « 48h ». Ne jamais retaper ces blocs à la main
  (l'espace insécable disparaîtrait) : les copier depuis ce fichier, ou par l'API (§4.2).

---

## 0. Conditions avant de pousser (à cocher le jour de la soumission)

Ces textes décrivent le **binaire #69**. Ils ne doivent partir qu'une fois ces points vrais :

- [ ] Le build #69 est produit depuis une branche qui contient les commits de `wip/vague3b`
      (relus ici au commit `b9ee70b`) : fidélité « 10 réservations créées et jouées »
      (`src/lib/loyalty.ts`, `LoyaltyServeCard`), écran Bienvenue (`src/app/bienvenue.tsx`), rappel
      « Alors, ce match ? » (`src/lib/notifications.ts`), planning club à 60 jours
      (`SectionReservations.tsx`, `PLANNING_HORIZON_DAYS = 60`), app déclarée en français
      (`app.json` : `CFBundleDevelopmentRegion: "fr"`). Si l'un manque dans le binaire, retirer la
      phrase correspondante (description, nouveautés, texte promotionnel).
      ✅ **Fusionné dans `claude/padelconnect-v4-17-4zblgh`** (vérifié le 2026-10-23 : `b9ee70b` y
      est contenu ; `src/app/bienvenue.tsx`, `src/lib/loyalty.ts`, `LoyaltyServeCard`,
      `supabase/92_fidelite_cible.sql`, « Alors, ce match ? », `PLANNING_HORIZON_DAYS = 60` et
      `CFBundleDevelopmentRegion: "fr"` présents). C'est cette branche qui fait foi pour le build ;
      la case reste à cocher sur le **binaire #69** lui-même.
- [ ] **SQL `92` (fidélité) appliquée et prouvée en production** : sans elle, le compteur et le code
      de fidélité ne marchent pas, et la promesse serait fausse.
- [ ] Le **plafond de fidélité** réglé par l'opérateur vaut toujours **5 000 FCFA** (Espace
      opérateur → Finances). S'il change, corriger « jusqu’à 5 000 FCFA » partout dans ce fichier
      (4 blocs : texte promotionnel, description iOS, nouveautés, description Play ; garder les
      espaces insécables).
- [ ] `app.json` → `expo.version` passé à **`1.0.3`** AVANT le build #69 (la 1.0.2 est publiée :
      App Store Connect refuse un binaire 1.0.2). `autoIncrement` ne touche que `buildNumber`.
- [ ] Le parcours rapide tient réellement en **moins de 2 minutes** sur le #69 (chronométré : ouvrir
      l'app connectée → onglet Réserver → réservation confirmée). Sinon le sous-titre « en 2 min » est
      une promesse invérifiable (Apple 2.3.7) : prendre le sous-titre de repli du §1.2. C'est la
      SEULE promesse de durée de la fiche : les légendes des captures (§3) n'en portent aucune, et
      la capture 3 montre le tunnel guidé, pas ce parcours rapide. Le **site** porte la même promesse
      (« réservé en 2 minutes » : `site/index.html` titre et description, `site/get.html`,
      `site/invite.html`, `site/og.svg`) : même chronométrage, sinon la remplacer partout par « en
      quelques gestes » et redéployer `site/`. ⚠️ L'**app** la porte aussi, et ces textes-là sont
      FIGÉS dans le binaire : message WhatsApp de parrainage (`src/app/parrainage.tsx`) et
      d'invitation d'un ami (`src/app/(tabs)/amis.tsx`), tous deux envoyés à des non-utilisateurs,
      et pied de page du profil (`src/app/(tabs)/profil.tsx`) — « en 2 minutes ». Leur sort se
      décide **AVANT de lancer le #69** : chronométrer le même parcours sur un build de
      préproduction (natif, compte joueur connecté), sinon passer d'office ces trois textes à « en
      quelques gestes » avant le build. Un chronométrage raté APRÈS le build laisse ces trois
      promesses en circulation jusqu'au build suivant : le noter alors dans ce fichier et les
      corriger au #70. (« Découvrir les règles en 2 minutes » de l'accueil et de
      `decouvrir.tsx` est un temps de LECTURE, hors de cette condition.)
- [ ] Mots-clés de quartier (`cocody`, `marcory`) et phrase de quartiers de la description Play :
      au moins un club **actif** (ni « Bientôt » ni masqué) dans chaque quartier cité, vérifié dans
      l'app le jour de la soumission. Sinon prendre la variante « sans quartiers » (§1.4) et retirer
      le quartier de la phrase Play.
- [ ] Fiche Play seulement : identifiants **FCM** posés (sinon aucune alerte n'arrive sur Android et
      les phrases sur les alertes seraient fausses).

---

## 1. App Store (iOS) — français (fr-FR)

### 1.1 Nom (30 caractères max — « Informations sur l’app », modifiable seulement avec une version)

<!-- champ:ios.name -->

```text
PadelConnect CI: Padel Abidjan
```

### 1.2 Sous-titre (30 caractères max)

<!-- champ:ios.subtitle -->

```text
Réserve ton terrain en 2 min
```

Repli si le chronométrage du §0 échoue (aucune promesse de durée) :

<!-- champ:ios.subtitle.repli -->

```text
Réserve ton terrain de padel
```

### 1.3 Texte promotionnel (170 caractères max — non indexé, modifiable sans nouvelle version)

<!-- champ:ios.promo -->

```text
Nouveau : 10 réservations créées et jouées = −50 % sur ton prochain match, jusqu’à 5 000 FCFA, offert par PadelConnect. Montre ton code au club.
```

### 1.4 Mots-clés (100 OCTETS max, virgules sans espaces)

Sans accents (la recherche CI les ignore et un accent coûte 2 octets), au singulier, aucun mot déjà
dans le nom ou le sous-titre (padel, abidjan, ci, réserve, ton, terrain, en, min), aucune marque.

<!-- champ:ios.keywords -->

```text
reservation,match,tournoi,club,cocody,marcory,partenaire,joueur,americano,classement,coach,babi
```

Variante « sans quartiers » (si la condition du §0 n'est pas remplie) :

<!-- champ:ios.keywords.sans-quartiers -->

```text
reservation,match,tournoi,club,partenaire,joueur,americano,classement,coach,cours,niveau,babi
```

Mesure : relever le rang sur chaque terme 4 semaines après la mise en ligne (recherche du store CI)
et remplacer les termes qui ne bougent pas par les candidats suivants, dans cet ordre : `cours`,
`niveau`, `creneau`, `ivoire`, `raquette`, `reserver` (à tester contre `reservation`). Termes exclus
et pourquoi : noms des clubs, whatsapp, wave, maps (marques et apps tierces) ; dakar, senegal,
france (aucun club) ; tennis, squash, foot (non proposés) ; ligue, division (pas dans le binaire) ;
gratuit, promo, meilleur, top (prix ou classement) ; app, sport (catégorie) ; android.

### 1.5 Description (4000 caractères max, texte brut)

<!-- champ:ios.description -->

```text
Réserve ton terrain de padel à Abidjan en quelques gestes : l’heure, le club, le terrain, c’est fait.
Tu vois les créneaux libres et les tarifs publiés par les clubs, en 1h ou 1h30, et tu règles le terrain directement au club : aucun paiement dans l’app.
Trouve des partenaires de ton niveau, joue des tournois et suis ta progression, au même endroit.

Pour les joueurs
• Vue « Par heure » : tous les clubs libres à l’heure qui t’arrange, sur les 7 prochains jours. Ou vue « Par club » : les créneaux libres et le prix de chaque club. Chaque club a sa fiche avec photos, tarifs et avis.
• Réservation guidée en 4 étapes (jour, créneau, terrain, confirmation), ou express en une seule feuille depuis l’onglet Réserver.
• La part de chaque joueur est calculée d’avance, avec un message prêt à envoyer à tes partenaires.
• Ajoute ton match au calendrier de ton téléphone en un geste, et un rappel te prévient avant de jouer.
• Créneau complet ? Mets-toi sur la liste d’attente : tu es prévenu dès qu’un terrain se libère.
• Annulation possible jusqu’à 5h avant le match.
• Fidélité : 10 réservations créées et jouées = −50 % sur ton prochain match, jusqu’à 5 000 FCFA, offert par PadelConnect. Tu montres ton code au club, il applique la remise.
• Cours avec un coach du club : le terrain n’est réservé que si le coach accepte, puis le club confirme. Des cours collectifs sont aussi à rejoindre.

Matchs ouverts et niveau
• Ouvre ton match en 1 contre 1 ou en 2 contre 2, avec la fourchette de niveau que tu veux : les joueurs concernés le rejoignent.
• Rejoins les matchs ouverts des autres, avec la fiabilité de l’organisateur dès qu’il a assez de parties jouées.
• Un court quiz fixe ton niveau de départ, puis ton niveau évolue avec les matchs dont l’adversaire a confirmé le score, et avec les tournois officiels.
• Suis tes clubs et tes partenaires habituels : active les alertes et tu es prévenu quand un match à ton niveau s’ouvre dans un de tes clubs, ou quand un de tes partenaires ouvre un match.
• Amis par demande et acceptation, ajout depuis tes contacts. Tu peux signaler un avis ou un match, et bloquer son auteur.

Tournois et classement
• Chaque joueur saisit le score, l’app désigne le vainqueur, et le match est validé quand l’adversaire le reconnaît (ou après 48h sans réponse).
• Après un match avec un partenaire inscrit, un rappel t’invite à saisir le score.
• Partage l’image du résultat, équipe contre équipe.
• Grimpe au classement grâce aux points gagnés dans l’app, et retrouve tes statistiques et tes badges.
• Inscris ton équipe aux tournois des clubs, des joueurs et aux tournois officiels PadelConnect. Crée le tien : le club hôte le valide, et les frais éventuels sont annoncés avant la création.
• Tournois en format americano, avec un podium proposé par l’app à la clôture.

Pour les clubs
• Espace Club : planning avec une ligne par terrain, consultable et bloquable jusqu’à 60 jours, et confirmation des réservations en un geste.
• Bloque un créneau pris par téléphone, ferme un terrain ou le club sur une période, garde un créneau récurrent pour tes habitués.
• Grille de chaque terrain en 1h ou 1h30, deux prix par plage horaire, photos du club et de chaque terrain.
• Annonces aux joueurs qui suivent ton club, carnets de séances, coachs réservables.
• Tes coachs ont leur Espace Coach : demandes de cours, cours à venir, cours collectifs.
• Statistiques d’occupation et de remplissage par créneau. Un seul compte peut gérer plusieurs clubs.
• L’Espace Club marche aussi dans le navigateur, sur club.padelconnectci.com.

Ton prochain match commence ici : ouvre l’onglet Réserver et choisis ton créneau.
```

### 1.6 Nouveautés de la version 1.0.3 (build #69)

<!-- champ:ios.whatsnew -->

```text
• Fidélité : 10 réservations créées et jouées = −50 % sur ton prochain match, jusqu’à 5 000 FCFA, offert par PadelConnect.
• Bienvenue : dès l’inscription, choisis tes clubs, active les alertes de matchs à ton niveau et les notifications.
• Après un match avec un partenaire inscrit, un rappel t’invite à saisir le score.
• Clubs : le planning se consulte et se bloque jusqu’à 60 jours à l’avance.
• Les menus du système (partage, copier-coller) s’affichent en français.
• Et de nombreuses corrections et finitions dans toute l’app.
```

### 1.7 Autres champs de la fiche

| Champ                       | Valeur                                                        |
| --------------------------- | ------------------------------------------------------------- |
| URL marketing               | `https://padelconnectci.com`                                  |
| URL d’assistance            | `https://padelconnectci.com/cgu` (contact@padelconnectci.com) |
| URL de confidentialité      | `https://padelconnectci.com/privacy.html`                     |
| Langue principale           | Français (vérifier dans « Informations sur l’app »)           |
| Catégorie                   | Sports (secondaire : Style de vie) — inchangée                |
| Compte de démo (App Review) | Identifiants communiqués à part, JAMAIS dans ce fichier       |
| In-App Event                | Aucun (décision H2)                                           |

---

## 2. Google Play — français (fr-FR)

Play n'a pas de champ mots-clés : il indexe le titre, la description courte et la description
longue. Les mots utiles (Abidjan, Cocody, Marcory, terrain de padel, réserver, match, tournoi, coach)
sont donc écrits naturellement dans le texte, jamais en liste.

### 2.1 Titre (30 caractères max)

<!-- champ:play.title -->

```text
PadelConnect CI: Padel Abidjan
```

### 2.2 Description courte (80 caractères max, sans emoji, sans appel à installer)

<!-- champ:play.short -->

```text
Réserve un terrain de padel à Abidjan, rejoins des matchs et joue des tournois
```

### 2.3 Description longue (4000 caractères max)

<!-- champ:play.full -->

```text
Réserve un terrain de padel à Abidjan en quelques gestes : l’heure, le club, le terrain, c’est fait.
Tu vois les créneaux libres et les tarifs publiés par les clubs de Cocody, de Marcory et d’ailleurs à Abidjan, en 1h ou 1h30, et tu règles le terrain directement au club : aucun paiement dans l’app.
Trouve des partenaires de ton niveau, joue des tournois de padel et suis ta progression, au même endroit.

Pour les joueurs
• Vue « Par heure » : tous les clubs de padel libres à l’heure qui t’arrange, sur les 7 prochains jours. Ou vue « Par club » : les créneaux libres et le prix de chaque club. Chaque club a sa fiche avec photos, tarifs et avis.
• Réservation guidée en 4 étapes (jour, créneau, terrain, confirmation), ou express en une seule feuille depuis l’onglet Réserver.
• La part de chaque joueur est calculée d’avance, avec un message prêt à envoyer à tes partenaires.
• Ajoute ton match au calendrier de ton téléphone en un geste, et un rappel te prévient avant de jouer.
• Créneau complet ? Mets-toi sur la liste d’attente : tu es prévenu dès qu’un terrain se libère.
• Annulation possible jusqu’à 5h avant le match.
• Fidélité : 10 réservations créées et jouées = −50 % sur ton prochain match, jusqu’à 5 000 FCFA, offert par PadelConnect. Tu montres ton code au club, il applique la remise.
• Cours de padel avec un coach du club : le terrain n’est réservé que si le coach accepte, puis le club confirme. Des cours collectifs sont aussi à rejoindre.

Matchs ouverts et niveau
• Ouvre ton match en 1 contre 1 ou en 2 contre 2, avec la fourchette de niveau que tu veux : les joueurs concernés le rejoignent.
• Rejoins les matchs ouverts des autres, avec la fiabilité de l’organisateur dès qu’il a assez de parties jouées.
• Un court quiz fixe ton niveau de départ, puis ton niveau évolue avec les matchs dont l’adversaire a confirmé le score, et avec les tournois officiels.
• Suis tes clubs et tes partenaires habituels : active les alertes et tu es prévenu quand un match à ton niveau s’ouvre dans un de tes clubs, ou quand un de tes partenaires ouvre un match.
• Amis par demande et acceptation, ajout depuis tes contacts. Tu peux signaler un avis ou un match, et bloquer son auteur.

Tournois et classement
• Chaque joueur saisit le score, l’app désigne le vainqueur, et le match est validé quand l’adversaire le reconnaît (ou après 48h sans réponse).
• Après un match avec un partenaire inscrit, un rappel t’invite à saisir le score.
• Partage l’image du résultat, équipe contre équipe.
• Grimpe au classement grâce aux points gagnés dans l’app, et retrouve tes statistiques et tes badges.
• Inscris ton équipe aux tournois des clubs, des joueurs et aux tournois officiels PadelConnect. Crée le tien : le club hôte le valide, et les frais éventuels sont annoncés avant la création.
• Tournois en format americano, avec un podium proposé par l’app à la clôture.

Pour les clubs
• Espace Club : planning avec une ligne par terrain, consultable et bloquable jusqu’à 60 jours, et confirmation des réservations en un geste.
• Bloque un créneau pris par téléphone, ferme un terrain ou le club sur une période, garde un créneau récurrent pour tes habitués.
• Grille de chaque terrain en 1h ou 1h30, deux prix par plage horaire, photos du club et de chaque terrain.
• Annonces aux joueurs qui suivent ton club, carnets de séances, coachs réservables.
• Tes coachs ont leur Espace Coach : demandes de cours, cours à venir, cours collectifs.
• Statistiques d’occupation et de remplissage par créneau. Un seul compte peut gérer plusieurs clubs.
• L’Espace Club marche aussi dans le navigateur, sur club.padelconnectci.com.

Ton prochain match de padel à Abidjan commence ici : ouvre l’onglet Réserver et choisis ton créneau.
```

### 2.4 Autres champs Play

| Champ                     | Valeur                                                             |
| ------------------------- | ------------------------------------------------------------------ |
| Catégorie                 | Sports                                                             |
| E-mail de contact         | contact@padelconnectci.com                                         |
| Site web                  | `https://padelconnectci.com`                                       |
| Règles de confidentialité | `https://padelconnectci.com/privacy.html`                          |
| Accès pour la revue       | Compte de démo communiqué à part (Play Console → Contenu de l’app) |

---

## 3. Plan de captures

**Principes** : l'app RÉELLE du build #69 (TestFlight pour iOS, build interne pour Android), sur des
**comptes de démo** (prénoms seulement), avec de **vrais clubs fondateurs** et leur **accord écrit**
pour apparaître. Jamais de club, d'avis, de note, de tournoi ou de joueur inventé ; aucun nom de
vrai joueur à l'écran (d'où pas de capture du Classement). Pas d'écran de connexion ni de démarrage
(Apple 2.3.3). Thème clair uniquement (l'app n'a pas de mode sombre). Légendes en surimpression
courtes, sans prix ni remise, sans « Télécharge », « Nouveau », « n°1 », « Top » ; sur Play, texte
≤ 20 % de l'image. Les 3 premières captures s'affichent dans les résultats de recherche iOS : elles
portent l'essentiel (heures libres, club, réservation).

| #   | Écran (route)          | État à préparer                                                                                                                                                                                                                                | Légende                                |
| --- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 1   | `/(tabs)/reserver`     | Vue « Par heure », aujourd’hui ou demain, un créneau du soir SÉLECTIONNÉ (les prix « dès » n’apparaissent qu’après ce choix) : liste des vrais clubs libres visible, prix lus en base. Aucun badge Sponsorisé si aucun boost réel n’est actif. | Les terrains libres, heure par heure   |
| 2   | `/club/[id]`           | Fiche d’un vrai club fondateur (badge Partenaire réel), photos fournies par le club, tarifs 1h / 1h30 réels. Cadrer au-dessus des avis s’il y en a moins de 3 vrais ; n’en saisir aucun pour la capture.                                       | Chaque club : photos, tarifs, créneaux |
| 3   | `/reserver/[clubId]`   | Tunnel guidé, étape Confirmer : terrain réel, 1h30, prix réel, format 2v2, part par joueur. Ne pas valider (ou annuler aussitôt). Légende sans durée : ce tunnel n’est pas le parcours chronométré du §0.                                      | Jour, créneau, terrain : c’est réservé |
| 4   | `/matchs-ouverts`      | Match ouvert créé par un 2ᵉ compte de démo sur un vrai club, fourchette de niveau, 2v2, « Rejoindre » actif. Pas de « Fiable · N % » sans historique réel. Annuler le match après.                                                             | Rejoins un match à ton niveau          |
| 5   | `/reservations`        | « Scores à saisir · 1 » : le 2ᵉ compte de démo a déjà saisi son score ; capture depuis le 1ᵉʳ compte, feuille des sets ouverte (ou image de résultat après validation).                                                                        | Saisis le score, grimpe au classement  |
| 6   | `/statistiques`        | Statistiques du compte de démo après ce match : rang réel (ou « non classé »), points, badges.                                                                                                                                                 | Ton rang, tes points, tes badges       |
| 7   | `/(tabs)/competitions` | Un tournoi RÉELLEMENT publié (idéalement officiel PadelConnect, bandeau doré). **Si aucun tournoi réel n’est publié, ne pas faire cette capture.**                                                                                             | Tournois : inscris ton équipe          |
| 8   | `/club-admin`          | Compte gérant de démo sur un vrai club (accord écrit) : planning du jour, une ligne par terrain, uniquement des blocages ou réservations des comptes de démo, aucun revenu réel ; flèches jusqu’à 60 jours.                                    | Espace Club : planning par terrain     |

Comptes : 2 comptes joueurs de démo (dont celui de la revue Apple) + 1 compte gérant de démo,
identifiants hors dépôt. Après les captures : annuler les réservations et matchs de démo, retirer
les blocages.

**Formats** (PNG ou JPEG, sans transparence) :

| Store       | Appareil                                  | Taille (portrait)                               | Nombre |
| ----------- | ----------------------------------------- | ----------------------------------------------- | ------ |
| App Store   | iPhone 6,9" (16/17 Pro Max)               | 1320 × 2868 (ou 1290 × 2796)                    | 7 ou 8 |
| App Store   | iPhone 6,5"                               | 1284 × 2778 (ou 1242 × 2688)                    | 7 ou 8 |
| App Store   | iPad 13" (obligatoire : `supportsTablet`) | 2064 × 2752 (ou 2048 × 2732)                    | 7 ou 8 |
| Google Play | Téléphone                                 | 1080 × 1920 (9:16), 24 bits sans alpha          | 4 à 8  |
| Google Play | Image de présentation                     | 1024 × 500, sans maquette de téléphone ni badge | 1      |
| Google Play | Icône                                     | 512 × 512, PNG 32 bits                          | 1      |

La 6,5" peut être omise si la 6,9" est fournie (App Store Connect la réduit) ; la fournir quand même
évite un recadrage. Les captures iPad montrent la colonne plafonnée à 640 pt : vérifier qu'elles
restent lisibles avant de les envoyer.

---

## 4. Comment pousser

### 4.1 App Store Connect, à la main

1. Vérifier le §0 (toutes les cases).
2. App Store Connect → Apps → PadelConnect → **« + »** à côté de « App iOS » → version **1.0.3**.
3. **Informations sur l’app** (langue Français) : Nom (§1.1), Sous-titre (§1.2), langue principale
   Français. Ces deux champs ne sont modifiables que pendant qu’une version est en préparation.
4. Page de la version **1.0.3** (langue Français) : Texte promotionnel (§1.3), Description (§1.5),
   Mots-clés (§1.4), URL d’assistance et URL marketing (§1.7), Nouveautés (§1.6).
5. Captures (§3) : déposer les jeux 6,9", 6,5" et iPad 13" dans l’ordre du tableau.
6. Section **Build** : choisir le #69 (arrivé par l’auto-submit EAS, traité dans TestFlight).
7. **Informations pour la revue** : compte de démo (communiqué à part) et la phrase de modération
   (`docs/CHECKLIST-STORES.md` §6-BIS b).
8. **Ajouter pour la vérification** → **Soumettre**. Le texte promotionnel peut ensuite être changé à
   tout moment sans nouvelle revue.

### 4.2 Par l’API App Store Connect

L’API est utilisable avec la **clé d’équipe fournie par le porteur** (fichier `.p8`, ID de clé, ID
d’émetteur), passée en variables d’environnement pour la session seulement : **jamais dans le
dépôt**, un commit, un message ou ce fichier. JWT ES256 et fonction `asc` : compétence
`padel-sortie-ios` §2 (App ID `6785261310`, locale `fr-FR`).

1. Version : `GET /v1/apps/6785261310/appStoreVersions?filter[versionString]=1.0.3&filter[platform]=IOS`,
   sinon `POST /v1/appStoreVersions` (`versionString: "1.0.3"`, `releaseType: "AFTER_APPROVAL"`).
2. Nom et sous-titre : `GET /v1/apps/6785261310/appInfos` → l’appInfo à l’état modifiable →
   `GET /v1/appInfos/{id}/appInfoLocalizations` → locale `fr-FR` →
   `PATCH /v1/appInfoLocalizations/{id}` avec `name` et `subtitle`.
3. Textes de la version : `GET /v1/appStoreVersions/{VERSION_ID}/appStoreVersionLocalizations` →
   locale `fr-FR` → `PATCH /v1/appStoreVersionLocalizations/{id}` avec `description`, `keywords`,
   `promotionalText`, `whatsNew`, `marketingUrl`, `supportUrl`. Construire le JSON avec `jq --rawfile`
   (ou `node`) à partir des blocs de ce fichier, jamais en recopiant à la main (apostrophes ’, puces •
   et retours à la ligne doivent arriver intacts).
4. Relire : `GET` de chaque localisation et comparer octet par octet avec ce fichier.
5. Captures : à la main (§4.1 étape 5) — par l’API il faut réserver, téléverser puis valider chaque
   image (`appScreenshotSets`, `appScreenshots`), sans gain ici.
6. Build, puis soumission en revue : compétence `padel-sortie-ios` §2, étapes 3 et 5 à 8.

### 4.3 Google Play (au lancement Android)

Play Console → l’app → **Développer la présence sur le Play Store → Fiche principale du Play Store** :
titre (§2.1), description courte (§2.2), description longue (§2.3), icône, image de présentation,
captures téléphone (§3). Puis **Contenu de l’app** (accès pour la revue, confidentialité). Les règles
de Play interdisent prix, promotion et classement dans le titre et l’icône ; la mention factuelle de
la fidélité dans la description longue est permise.

---

## 5. Comptage des caractères (calculé)

Calculé par `node` sur les blocs de ce fichier (caractères = points de code Unicode ; octets = UTF-8 ;
une espace insécable compte 1 caractère et 2 octets). Une ligne « OK » = sous la limite. Le même
script fait les contrôles listés sous le tableau et affiche « Contrôles : tous passés » ou la liste
des échecs. Relancer depuis la racine du dépôt après toute retouche :

````bash
node - docs/STORE-LISTING.md <<'JS'
const fs = require("fs"); const t = fs.readFileSync(process.argv.at(-1), "utf8");
const re = /<!-- champ:([\w.-]+) -->\s*```text\n([\s\S]*?)\n```/g; const f = {}; let m;
while ((m = re.exec(t))) { f[m[1]] = m[2]; console.log(m[1], [...m[2]].length, "car.", Buffer.byteLength(m[2]), "octets"); }
const ko = []; const chk = (ok, msg) => { if (!ok) ko.push(msg); };
const clubs = ["abidjan padel", "district club", "elite club", "ivoire padel", "padel magic", "palmeraie", "zone 4", "padelta", "padelhouse"];
const marques = ["whatsapp", "wave", "google maps", "facebook", "instagram", "tiktok"];
for (const [k, v] of Object.entries(f)) {
  const l = v.toLowerCase();
  if (k.startsWith("ios.")) chk(!/android|google/.test(l), k + " : android/google");
  if (k.startsWith("play.")) chk(!/iphone|app store|apple/.test(l), k + " : iphone/app store/apple");
  for (const w of [...clubs, ...marques]) chk(!l.includes(w), k + " : " + w);
  chk(!/\p{Extended_Pictographic}/u.test(v), k + " : emoji");
  chk(!v.includes("'"), k + " : apostrophe droite");
  chk(!/\d h\b|\d h\d/.test(v), k + " : heure espacée");
  if (!/^(ios|play)\.(name|title|subtitle|keywords)/.test(k)) {
    chk(!/ [:?!;»]|« |5 000|000 FCFA|50 %/.test(v), k + " : espace normale au lieu d’insécable");
  }
}
const nom = (f["ios.name"] + " " + f["ios.subtitle"]).toLowerCase().split(/[^a-zà-ÿ]+/).filter(Boolean);
for (const k of ["ios.keywords", "ios.keywords.sans-quartiers"]) {
  const mots = f[k].split(","); chk(!/\s/.test(f[k]), k + " : espace");
  chk(!/[^\x00-\x7f]/.test(f[k]), k + " : accent"); chk(new Set(mots).size === mots.length, k + " : doublon");
  for (const w of mots) chk(!nom.includes(w), k + " : « " + w + " » déjà dans le nom/sous-titre");
}
console.log(ko.length ? "ÉCHECS :\n" + ko.join("\n") : "Contrôles : tous passés");
JS
````

<!-- comptage:debut -->

| Champ                                | Caractères | Octets UTF-8 | Limite          | Verdict         |
| ------------------------------------ | ---------: | -----------: | --------------- | --------------- |
| App Store — nom                      |         30 |           30 | 30 caractères   | OK (reste 0)    |
| App Store — sous-titre               |         28 |           29 | 30 caractères   | OK (reste 2)    |
| App Store — sous-titre de repli      |         28 |           29 | 30 caractères   | OK (reste 2)    |
| App Store — texte promotionnel       |        144 |          157 | 170 caractères  | OK (reste 26)   |
| App Store — mots-clés                |         95 |           95 | 100 octets      | OK (reste 5)    |
| App Store — mots-clés sans quartiers |         93 |           93 | 100 octets      | OK (reste 7)    |
| App Store — description              |       3640 |         3852 | 4000 caractères | OK (reste 360)  |
| App Store — nouveautés 1.0.3         |        532 |          581 | 4000 caractères | OK (reste 3468) |
| Play — titre                         |         30 |           30 | 30 caractères   | OK (reste 0)    |
| Play — description courte            |         78 |           80 | 80 caractères   | OK (reste 2)    |
| Play — description longue            |       3731 |         3947 | 4000 caractères | OK (reste 269)  |

Contrôles automatiques du même script (tous passés au dernier calcul) : aucun « android »/« google »
dans la fiche iOS ; aucun « iphone »/« app store »/« apple » dans la fiche Play ; aucun nom de club
fondateur ni marque tierce (WhatsApp, Wave, Google Maps, réseaux sociaux) ; aucun emoji ; aucune
apostrophe droite ; heures sans espace (« 5h », « 48h ») ; espaces insécables en place dans les
blocs à coller (milliers, « FCFA », « % », « : », « ? », guillemets) ; mots-clés sans espace, sans
accent, sans doublon et sans mot du nom ou du sous-titre.

<!-- comptage:fin -->
