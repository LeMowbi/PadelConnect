# PadelConnect 🎾 — l'app du padel à Abidjan

Application mobile (iOS + Android, et web) pour **réserver un terrain de padel à Abidjan, trouver
un partenaire / adversaire / coéquipier, trouver un coach, organiser des compétitions** et suivre
ses résultats. Conçue avec un design sobre « luxe + sport ».

> **Statut : prototype cliquable** (interface complète, données simulées stockées sur l'appareil —
> pas encore de serveur ni de paiement réel). Pour la stratégie, la mise en ligne sur les stores,
> la vente aux clubs et la suite technique, voir **[STRATEGIE.md](./STRATEGIE.md)**.

## Fonctionnalités (toutes présentes ✅)

- **Création de compte** : prénom, nom, numéro de téléphone (+225), photo optionnelle.
- **Réservation** d'un terrain par créneau horaire, partout à Abidjan.
- **Paiement (simulé)** : Wave, Orange Money, MTN/Moov Money, carte ou espèces — + **partage de l'addition** entre joueurs. Prêt à brancher sur CinetPay/PayDunya.
- **Tous les clubs réels** d'Abidjan, présentés **à égalité, sans classement « meilleur club »**.
- **Photos réelles** des terrains (libres de droits, avec repli automatique) + **Google Maps**.
- **Favoris** : enregistre tes clubs préférés.
- **Trouver un match** : partenaire / adversaire / coéquipier, **visibilité Public ou Amis**, **invitation par lien**.
- **Niveau de jeu (1–7)** + filtre « à mon niveau ».
- **Coachs** : liste + réservation de séance.
- **Compétitions avec récompenses**, créées **par les clubs OU par les joueurs**.
- **Notation & avis** des terrains (sans réordonner la liste des clubs).
- **Victoires / défaites validées par partie jouée** (après une réservation) + historique & série.
- **Espace Club** : les terrains gèrent leurs **photos, créneaux, réservations et compétitions**.
- **Découvrir le padel** : définition + règles essentielles.

## Lancer le prototype

```bash
npm install
npx expo start        # puis 'w' pour le web, ou QR code avec l'app Expo Go (iOS/Android)
```

> Astuce : `npx expo start --web` ouvre directement la version navigateur.

## Structure

```
src/
  app/                 # écrans (expo-router)
    (tabs)/            # Accueil, Terrains, Jouer, Compétitions, Profil
    club/[id].tsx      # fiche club (photos, Maps, avis, réserver)
    reserver/[clubId]  # réservation par créneau
    match/nouveau      # créer un match (Public / Amis)
    coachs/            # liste + détail coach
    competition/       # détail + création (joueur ou club)
    decouvrir.tsx      # règles du padel
    club-admin/        # Espace Club (gérants)
  components/          # UI réutilisable (Card, Button, ClubCard, RatingStars…)
  data/                # clubs (réels), coachs, matchs, compétitions, avis, règles
  store/               # état global + sauvegarde locale (AsyncStorage)
  theme/               # couleurs, typographie, espacements
```

## Données

- Les **noms et quartiers des clubs sont réels** (vérifiés) ; **tarifs indicatifs** et **photos
  illustratives libres de droits** sont à confirmer/remplacer par les visuels officiels de chaque club.
- Compte, coachs, matchs et certains avis sont des **exemples de démonstration** (profil local,
  téléphone non vérifié — la vraie auth SMS viendra avec le back-end).

## Vérifié

- `npx tsc --noEmit` : OK.
- `npx expo export --platform web` : 22 écrans rendus sans erreur.
