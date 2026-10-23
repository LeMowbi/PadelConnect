# PadelConnect 🎾 — l'app du padel à Abidjan

Application mobile (iOS **et** Android, Expo/React Native) pour **réserver un terrain de padel à Abidjan,
s'inscrire à des tournois, jouer entre amis et trouver un coach**. Design « luxe sportif »
(vert signature, crème, or). Espace dédié pour les **gérants de clubs** et console pour
**l'opérateur** de la plateforme.

> **Statut : production (TestFlight)** — backend **Supabase** : comptes par e-mail
> (confirmation par lien, mot de passe oublié in-app), réservations cross-device, tournois réels
> validés par les clubs, avis vérifiés, demandes d'ami avec notifications push, parrainage avec
> **Universal Links** (padelconnectci.com). Matchs ouverts 1v1/2v2, classement par points, coachs
> & cours, comptes club à l'inscription, paiement Wave manuel des frais de tournoi. **Sans paiement
> en ligne pour les réservations** : le tarif du terrain se règle au club. Sécurité par rôle
> (joueur / club / opérateur) via Row Level Security ; migrations SQL numérotées à partir de `02`
> dans `supabase/` (à appliquer dans l'ordre — état en base : CLAUDE.md §8).

## Fonctionnalités

**Joueur**

- **Réservation** de sessions de 1h ou 1h30 selon la grille de chaque terrain : par créneau
  (jour → heure → club → terrain) ou depuis la fiche d'un club, avec anti double-réservation
  côté serveur, limite anti-accaparement (6 résas à venir), annulation jusqu'à 5 h avant,
  rappels locaux et ajout au calendrier.
- **Réservations partagées** : invite jusqu'à 3 amis — ils voient la résa chez eux et
  acceptent/refusent.
- **Tournois** réels créés par les clubs ou les joueurs (validés par le club hôte) ; le vainqueur
  d'un tournoi officiel gagne **+0.50 de niveau** (attribué côté serveur, anti-triche).
- **Amis** par demande (accepter/refuser), recherche par numéro, sélecteur de contacts.
- **Avis vérifiés** : seuls ceux qui ont vraiment joué au club (réservataire ou invité) notent.
- **Parrainage** : lien `padelconnectci.com/invite/CODE` qui ouvre l'app, code pré-rempli.
- **Profil** : niveau (1–7, initialisé par un quiz à l'inscription puis ajusté côté serveur par
  les matchs validés et les tournois officiels), trophées évolutifs (Bronze → Platine), palmarès.
- **Coachs & cours** réservables (coachs promus par leur club : le terrain n'est réservé que si
  le coach accepte, puis le club confirme), règles du padel (Découvrir), favoris, notifications push.

**Gérant de club (Espace Club)**

- Planning terrains × créneaux, confirmation des réservations, blocage des créneaux pris hors
  app, marquage des absences (no-show), fiabilité des joueurs.
- Grille de créneaux par terrain (1h / 1h30). Fiche du club éditable : infos, tarifs (plages
  horaires nommées, prix 1h et 1h30), photos réelles, offres/actus, coachs (comptes promus) ; stats
  (revenu, taux d'occupation, créneaux creux) ; validation des tournois joueurs.

**Opérateur**

- Décomptes de commission hebdomadaires par club (envoi WhatsApp, marquer payé), demandes
  d'inscription de nouveaux clubs, statuts (actif / bientôt / masqué), boosts sponsorisés,
  signalements des joueurs, actu de l'accueil, frais des tournois joueurs, diagnostics anonymes.

## Lancer en développement

```bash
npm install
npx expo start        # 'w' pour l'aperçu web ; sur téléphone : build TestFlight / APK (CHECKLIST-STORES §7)
```

Vérifications (obligatoires avant tout commit — voir CLAUDE.md §6) :

```bash
npx tsc --noEmit && npm run lint && TZ=UTC npm run test:logic
```

## Structure

```
src/
  app/                     # écrans (expo-router)
    (tabs)/                # barre d'onglets : Accueil / Réserver / Tournois / Amis / Profil
      index.tsx            #   Accueil (héro, accès rapides, prochain match, clubs, tournois)
      reserver.tsx         #   Réserver (par heure / par club) · reserver/[clubId] = tunnel guidé
      competitions.tsx     #   Tournois (liste) · competition/[id] + nouvelle
      amis.tsx             #   demandes d'ami, recherche par numéro, contacts
      profil.tsx           #   compte, niveau, trophées, palmarès, espaces pro
    onboarding.tsx         # inscription e-mail + connexion (+ reset-password.tsx)
    clubs/ + club/[id]     # annuaire (recherche, filtres) + fiche club (avis, tarifs, galerie)
    reservations.tsx       # Mes réservations (annuler, partager, calendrier) + mes tournois
    classement.tsx, statistiques.tsx  # classement par points + stats joueur
    parrainage.tsx         # code + lien d'invitation · invite/[code] = route entrante
    cours/ (+ coachs → /cours) # coachs réservables + demande de cours · coach-admin (Espace Coach)
    club-admin/            # Espace Club (gérants) · operateur.tsx = console opérateur
    support.tsx, legal.tsx, pourquoi.tsx, decouvrir.tsx, inscrire-club.tsx
  components/              # kit UI (ui.tsx, Chip, Toast, Skeleton, Reveal, PopIn, Stepper…)
  data/                    # clubs réels (9 fondateurs), tournois
  lib/                     # serveur (Supabase), disponibilité, prix, haptiques, partage…
  store/                   # AppContext (état global + appels serveur) + helpers purs testés
  theme/                   # tokens (couleurs par rôle, typo, ombres) — zéro couleur en dur
supabase/                  # migrations SQL numérotées + Edge Function notify-club (push)
site/                      # padelconnectci.com (AASA Universal Links, redirections, privacy)
docs/                      # guides opérateur (push, serveur, App Store, Universal Links)
```

## Données — tout est réel

- Les **9 clubs fondateurs** sont réels (noms, quartiers vérifiés) et portent le badge
  « Partenaire » ; tarifs indicatifs à confirmer par chaque club depuis son Espace Club.
- **Aucune donnée factice** : coachs et avis sont **vides au lancement** (pas de seed de
  démonstration) — ils ne viennent que de vrais coachs partenaires et d'avis vérifiés serveur.
- Photos : uniquement les vraies photos ajoutées par les clubs (sinon repli doré maison).
- Parties jouées comptées **automatiquement** (réservation dont l'heure de fin est passée) —
  aucune déclaration manuelle.

## Aller plus loin

- **CLAUDE.md** — mémoire du projet : règles, architecture, feuille de route, état serveur.
- **docs/** — guides cliquables pour l'opérateur (sans terminal) : push, serveur, App Store.
- **kit/** — supports de présentation aux clubs. Les anciens docs de la phase prototype
  (stratégie, lancement, handoff…) sont archivés dans **docs/archive/** (historique — voir CLAUDE.md
  pour l'état réel).
