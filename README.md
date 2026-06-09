# PadelConnect 🎾 — l'app du padel à Abidjan

Application mobile (iOS + Android, et web) pour **réserver un terrain de padel à Abidjan, trouver
un partenaire / adversaire / coéquipier, trouver un coach, organiser des compétitions** et suivre
ses résultats. Conçue avec un design sobre « luxe + sport ».

> **Statut : prototype cliquable** (interface complète, données simulées stockées sur l'appareil —
> pas encore de serveur ni de paiement réel). Pour la stratégie, la mise en ligne sur les stores,
> la vente aux clubs et la suite technique, voir **[STRATEGIE.md](./STRATEGIE.md)**.

## Fonctionnalités (toutes présentes ✅)

- **Création de compte** : prénom, nom, numéro de téléphone (+225), photo optionnelle.
- **Réservation par créneau** : parcours **jour → créneau horaire → club disponible → terrain**,
  calculée **terrain par terrain** (pas de double-réservation). **Sans paiement en ligne** : le tarif
  (indicatif) se règle directement au club.
- **Tous les clubs réels** d'Abidjan, présentés **à égalité, sans classement « meilleur club »**.
- **Photos réelles** des terrains (libres de droits, avec repli automatique) + **Google Maps**.
- **Favoris** : enregistre tes clubs préférés.
- **Trouver un match** : partenaire / adversaire / coéquipier, **visibilité Public ou Amis**, **invitation par lien**.
- **Niveau de jeu (1–7)** + filtre « à mon niveau ».
- **Coachs** : classés par niveau, avec **numéro à appeler et club** (pas de réservation dans l'app).
- **Compétitions avec récompenses**, **inscription par équipe** et **places limitées**, créées **par
  les clubs OU par les joueurs**.
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
    (tabs)/            # Accueil, Réserver, Jouer, Compétitions, Profil
    clubs/             # annuaire des clubs (carte, photos, favoris)
    club/[id].tsx      # fiche club (photos, Maps, avis, coachs, réserver)
    reserver/[clubId]  # réservation (jour → créneau → terrain)
    match/nouveau      # créer un match (réserve un terrain + ouvre des places)
    coachs/            # liste + fiche coach (contact : numéro + club)
    competition/       # détail (inscription par équipe) + création (joueur ou club)
    decouvrir.tsx      # règles du padel
    club-admin/        # Espace Club (gérants : terrains, créneaux, offres, coachs…)
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
- `npx expo export --platform web` : 25 écrans rendus sans erreur.

## Aller plus loin

- **[GUIDE-LANCEMENT.md](./GUIDE-LANCEMENT.md)** — présenter aux clubs, installer, ce qui manque
  pour une vraie app, et qui fait quoi pour la construire.
- **[STRATEGIE.md](./STRATEGIE.md)** — stratégie, modèle économique, juridique, technique.
- **kit/** — page de présentation imprimable, argumentaire, accord pilote, feuille de route technique.
