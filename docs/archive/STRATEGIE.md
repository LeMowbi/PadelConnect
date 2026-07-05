# PadelConnect — Stratégie, faisabilité & mise en marché

Ce document répond à tes questions : **est-ce possible ?**, **comment coder l'app ?**,
**comment la mettre en ligne sur Apple et Android ?**, **comment la présenter aux terrains ?**,
**comment la vendre ?** et **comment tout relier ?**

> 💡 Pour une version courte et orientée action (présenter au club, installer, qui fait quoi pour
> construire la vraie app), commence par **[GUIDE-LANCEMENT.md](./GUIDE-LANCEMENT.md)**.

---

## 1. Est-ce possible ? — Oui, clairement.

- Le padel est en pleine explosion à Abidjan : on compte déjà ~9 clubs (Padelta, Padel Magic,
  District Club, Padel Zone 4, Abidjan Padel, PadelHouse, Ivoire Padel Club, Elite Club, Padel
  Palmeraie…).
- Des apps de réservation existent déjà **mais par club** (PadelHouse, Abidjan Padel via Doinsport).
  **Aucune ne regroupe tous les clubs + partenaires + coachs + compétitions.** C'est exactement
  ton opportunité : devenir **l'app unique du padel à Abidjan** (l'équivalent local d'un
  « Playtomic », l'app de référence mondiale du padel).
- Techniquement, tout ce que tu décris est standard et réalisable.

**Ce qui est déjà construit dans ce dépôt** : un **prototype mobile complet et cliquable**
(iOS + Android + Web) avec toutes tes fonctionnalités (voir le README). C'est la version à
montrer aux clubs et à d'éventuels investisseurs.

---

## 2. Comment l'app est codée

- **Technologie : React Native + Expo** (langage TypeScript). Un **seul code** produit l'app
  **iOS ET Android** (et même une version web). C'est le choix le plus rapide et le moins cher
  pour une première app, utilisé par des milliers d'apps en production.
- **Navigation** : `expo-router` (onglets en bas : Accueil, Réserver, Jouer, Compétitions, Profil).
- **Réservation** : parcours **jour → créneau → club disponible → terrain**, calculé terrain par
  terrain. **Sans paiement en ligne** : on réserve, le tarif (indicatif) se règle au club.
- **Données du prototype** : simulées et stockées sur le téléphone (pas encore de serveur).
- **Design** : thème **clair** « luxe + sport » (vert profond du terrain + touche de vert lime de la balle).

---

## 3. Comment la mettre en ligne (Apple + Android)

Avec Expo, on utilise **EAS Build** (le service de compilation d'Expo) pour générer les fichiers
installables, puis on les dépose sur les magasins.

### Étapes
1. **Créer les comptes développeurs**
   - **Apple Developer Program** : ~**99 USD / an** (obligatoire pour publier sur l'App Store).
   - **Google Play Console** : **25 USD une seule fois**.
2. **Préparer l'app** : nom, icône, écran de démarrage, captures d'écran, description, politique
   de confidentialité (URL obligatoire).
3. **Compiler** : `eas build --platform ios` et `eas build --platform android`.
4. **Soumettre** : `eas submit` (ou dépôt manuel sur App Store Connect / Play Console).
5. **Validation** : Apple révise en quelques jours ; Google souvent plus vite. Prévoir des
   allers-retours sur la 1re soumission.

> Note : la publication store nécessite un Mac (ou EAS, qui compile iOS dans le cloud sans Mac).

---

## 4. Comment la présenter aux terrains (le point clé)

Ton argument fort : **tu leur apportes des joueurs et tu leur simplifies la gestion, gratuitement
au départ.** L'app contient déjà un **Espace Club** (gestion des créneaux, des réservations et des
compétitions) à leur montrer.

### Argumentaire en 4 points
1. **Visibilité gratuite** : « Votre club est présenté **à égalité** avec les autres, sans
   classement ni hiérarchie. » (C'est ta règle anti-discrimination, et c'est un argument commercial :
   aucun club n'est défavorisé.)
2. **Plus de réservations** : les joueurs qui n'ont pas de partenaire trouvent un match chez vous.
3. **Outil de gestion offert** : créneaux, réservations reçues, et création de **compétitions avec
   récompenses** directement depuis l'app.
4. **Sans risque** : gratuit pour démarrer, vous gardez vos tarifs et vos règles.

### Plan d'approche concret
- Commence par **2-3 clubs pilotes** (idéalement les plus actifs) → fais-leur signer un accord
  simple pour utiliser **leur nom, logo et photos** dans l'app (indispensable juridiquement).
- Récupère leurs **vrais créneaux, tarifs et photos officielles** (le prototype utilise des
  visuels provisoires et des tarifs « indicatifs » à remplacer).
- Mets en avant un **QR code** dans le club pour télécharger l'app.

---

## 5. Comment la vendre (modèle économique)

Plusieurs sources de revenus, à activer progressivement :

| Source | Comment | Quand |
|---|---|---|
| **Commission sur réservation** | 5–15 % par créneau réservé — **calculée par l'app, réglée hors app** (historique transmis au club, qui te paie par **Wave**) | dès les premières réservations |
| **Abonnement club** | forfait mensuel pour l'Espace Club (gestion + visibilité) | dès quelques clubs convaincus |
| **Compétitions** | frais d'organisation / billetterie / sponsors | à la 1re compétition |
| **Premium joueur** | stats avancées, recherche de partenaire prioritaire | quand la communauté grandit |
| **Coachs** | commission sur les séances réservées | quand les coachs sont à bord |
| **Publicité locale** | marques de sport, boissons, équipementiers | à fort trafic |

> Conseil : **gratuit au lancement** pour amasser des utilisateurs et des clubs, puis introduire
> la commission / l'abonnement une fois la valeur prouvée.

> **Comment tu encaisses la commission (sans prélèvement automatique).** Au lieu de prélever sur
> chaque réservation, l'**Espace opérateur** te donne, par club, l'**historique des réservations** et
> le **montant de commission** correspondant. Tu **transmets cet historique au club**, et le **club te
> règle** (par Wave, par exemple). Simple, transparent, et tu ne touches pas à l'argent des clubs.

---

## 6. Comment tout relier (l'architecture, en clair)

Aujourd'hui le prototype fonctionne **seul sur le téléphone**. Pour une vraie app reliée, il faut
ajouter un **back-end** (le « cerveau » central) :

```
   App joueur (iOS/Android)  ─┐
                              ├─►  BACK-END (serveur + base de données)  ─►  Paiement
   Espace Club (gérants)     ─┘            │                                  (mobile money / carte)
                                           └─►  Notifications, comptes, créneaux en temps réel
```

- **Comptes & connexion** : email/téléphone (ex. Firebase Auth ou Supabase).
- **Base de données** : clubs, créneaux, réservations, matchs, compétitions, amis, stats
  (ex. **Supabase**/PostgreSQL ou **Firebase** — rapides à mettre en place).
- **Réservation en temps réel** : un créneau réservé devient indisponible pour les autres.
- **Pas de paiement dans l'app (choix assumé)** : l'app sert uniquement à **réserver**. Ta
  **commission s'encaisse hors app**, par **Wave**, via l'historique transmis au club (déjà géré par
  l'« Espace opérateur »). → Pas d'agrégateur, pas de données bancaires, pas de KYC : projet plus
  simple et plus sûr.
- **Notifications push** : rappels de match, confirmation de résa (via Expo Notifications).

---

## 7. Feuille de route conseillée

1. **Phase 1 — Prototype (FAIT ✅)** : l'app cliquable de ce dépôt, à montrer aux clubs.
2. **Phase 2 — Pilote** : accords avec 2-3 clubs, vraies photos/tarifs, back-end + comptes +
   réservation réelle. Test avec un groupe restreint de joueurs.
3. **Phase 3 — Lancement public** : publication App Store + Play Store, communication (réseaux,
   QR codes en club, ambassadeurs).
4. **Phase 4 — Croissance** : compétitions régulières, coachs, fonctionnalités premium,
   ouverture à d'autres villes.

### Ordre de grandeur des coûts de démarrage
- Comptes stores : ~99 USD/an (Apple) + 25 USD (Google).
- Back-end (Supabase/Firebase) : **gratuit** au début, puis quelques dizaines d'USD/mois.
- Nom de domaine + page web + politique de confidentialité : faible.
- Le plus gros « coût » reste le **temps de développement** (back-end + intégrations).

---

## 8. Points juridiques à ne pas oublier

- **Droits sur les photos et logos des clubs** : il faut **leur accord écrit** avant d'utiliser
  leurs images. (Le prototype utilise donc des **visuels provisoires**.)
- **Données personnelles** : politique de confidentialité claire (obligatoire pour les stores) +
  respect de la réglementation ivoirienne (ARTCI) sur les données.
- **Conditions Générales d'Utilisation** (responsabilité, annulations, litiges).
- **Résultats auto-déclarés** : comme tu l'as demandé, victoires/défaites sont déclarées par les
  joueurs ; préciser dans les CGU que l'app ne garantit pas leur exactitude.
- **Paiements** : **aucun paiement n'a lieu dans l'app** (uniquement des réservations). Ta commission
  s'encaisse **hors app**, par Wave — donc pas de conformité « paiement » à gérer côté application.

---

## 9. En résumé

- ✅ **Faisable**, et le marché est déjà là.
- ✅ Un **prototype complet** est prêt à être montré (ce dépôt).
- 👉 Prochaine étape recommandée : **signer 2-3 clubs pilotes** puis brancher le **back-end**
  (comptes SMS, base partagée, dispo temps réel) pour passer de la démo à une vraie app utilisable.
  *(Pas de paiement dans l'app : ta commission se règle par Wave, hors app.)*

Tu n'es pas seul pour la suite : chaque étape ci-dessus peut être développée progressivement.
