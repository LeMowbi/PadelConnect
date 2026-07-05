# AUDIT — PadelConnect (Phase 0)

> Audit complet avant la refonte visuelle premium. **Aucun code modifié dans cette phase.**
> Chiffres mesurés sur le code au commit courant. Référence visuelle : la démo en ligne
> (https://lemowbi.github.io/PadelConnect/) — les captures 390×844 automatiques ne sont pas
> générables dans l'environnement de travail (pas de navigateur headless) ; à capturer sur
> téléphone pour le comparatif avant/après.

## 1. Architecture
- **Stack** : Expo SDK 56, React Native 0.85, expo-router (Stack, plus de tab bar), TypeScript.
- **État** : un seul `AppContext` (`src/store/AppContext.tsx`, ~380 lignes) persisté via AsyncStorage
  (`STORAGE_KEY = padelco_state_v3`), hydraté par `{...initialState, ...JSON.parse(raw)}`.
- **Données** : seeds dans `src/data/` (`clubs.ts`, `coaches.ts`, `competitions.ts`, `matches.ts`,
  `reviews.ts`, `user.ts`, `padel.ts`). **Les écrans lisent les seeds en direct** (ex. `seedCompetitions`,
  `seedMatches` importés dans une dizaine d'écrans) → pas de couche d'accès unique.
- **Logique métier** bien centralisée : `src/lib/availability.ts` (dispo terrain par terrain, blocage
  tournoi), `src/lib/days.ts` (clé de jour stable AAAA-MM-JJ), `src/lib/zodiac.ts`, `src/lib/format.ts`.
- **Composants partagés** : `src/components/ui.tsx` (Txt, Button, Card, Tag, IconCircle, SectionHeader,
  Divider, EmptyState), + ClubCard, MatchCard, CompetitionCard, BookingSheet, ContactButtons, Chip,
  SegmentedControl, RatingStars, ClubPhoto, Screen, Logo, Confetti, Reveal, LevelStepper.
- **19 écrans** sous `src/app/`. Pas de duplication grave ; quelques patterns recopiés (styles d'input,
  lignes de contact) déjà partiellement factorisés (ContactButtons).

**Verdict archi** : saine et lisible. Le seul manque structurant pour préparer le serveur est une
**couche d'accès `lib/data/` (repository)** — les écrans ne devraient pas importer les seeds directement.

## 2. Parcours JOUEUR — frictions
- **Inscription** : complète (prénom, nom, tel, photo, date de naissance → âge + signe astro, sexe,
  niveau). Bon. Le niveau se règle via `LevelStepper` (peu visuel). La saisie de date en texte
  JJ/MM/AAAA est correcte mais sans masque.
- **Réserver — vue « Par heure »** : **principal point faible UX**. Pour chaque horaire, on réaffiche
  les ~9 clubs en chips quasi identiques, **sans prix**, difficile à scanner (mur de chips).
- **Réserver — vue « Par club »** : liste de chips d'horaires par club, correct.
- **Bottom sheet** : 2 gestes, terrain présélectionné, confettis — très bon.
- **Fiche club** : riche (galerie plein écran, avis + barres, offres, événements & tournois, coachs).
  Tarif affiché « dès X / heure » alors que la session est 1h30 → **ambigu** (voir §5).
- **Matchs / Tournois / Coachs / Profil** : parcours complets, sans blocage.
- **États vides** présents (EmptyState) mais **pas d'états de chargement (skeleton)** ni d'erreur — peu
  visible aujourd'hui car tout est local et instantané.

## 3. Parcours GÉRANT
- Activation par interrupteur « mode gérant » (sinon écran verrouillé clair).
- 3 onglets (Réservations / Mon club / Tournois) : réservations reçues avec **nom + numéro du joueur**,
  bouton **Confirmer** (statut visible côté joueur), **WhatsApp joueur**, **planning hebdo** en grille,
  historique, gestion complète (photos, offres/actus/événements, coachs, terrains, créneaux, tarif), boost.
- **« Un gérant de Padelta serait-il bluffé en 2 min ? »** : oui sur la richesse (planning + confirmation +
  WhatsApp), **mais** ce qui le ferait hésiter = le rendu visuel « template » (typo système, cases de
  planning petites et non cliquables, pas de mini-stats d'occupation pour justifier la commission).

## 4. Parcours OPÉRATEUR
- Totaux (réservations, volume, commission 10%), détail par club + « Te doit ≈ X », **« Envoyer
  l'historique au club »** (Share), validation des nouveaux clubs, activation des boosts.
- **Ce qui ferait gagner du temps chaque fin de mois** : un **suivi de règlement par mois**
  (À facturer → Envoyé → Payé Wave), un **filtre par mois**, et un **message Wave formaté prêt à
  envoyer** (aujourd'hui le message est basique, sans période ni montant dû structurés).

## 5. Cohérence métier
- ✅ Sessions **1h30** : grille `SAMPLE_SLOTS` / `ALL_TIMES` alignée ; seeds (matchs) réalignés.
- ⚠️ **Affichage tarif incohérent** : 10 occurrences de `« dès X FCFA/h » / « / heure »` pour les
  **clubs** alors que l'unité réelle est la **session 1h30** (`ClubCard.tsx:62,100`, `BookingSheet.tsx:82`,
  `club/[id].tsx:135`, `reserver/[clubId].tsx:84,162`, `operateur.tsx:115`, `club-admin/index.tsx:589`).
  → à passer en **« X FCFA · la session (1h30) »** + « soit Y/joueur ». (Les coachs, eux, restent /heure.)
- ✅ Anti-double-réservation terrain par terrain, blocage tournoi, annulation 5h, niveau ±0.25 **uniquement**
  via tournoi officiel, sponsorisés en tête : vérifiés OK.
- ⚠️ **Prix des seeds** : 10 000–20 000 « /h ». Face au marché réel (Padelta : 10 000 creux / 30 000 prime /
  15 000 soir, la session 1h30), les seeds doivent être requalifiés **par session** et étalés 10 000–30 000.

## 6. Design — écran par écran
- **Typographie système** sans caractère → l'app fait « template ». **Le levier visuel n°1.**
- **17 couleurs hex hors `theme.ts`** : 2 dégradés héros (`#D8EEE4/#F2EEDE` dans `index.tsx`,
  `onboarding.tsx`), 1 noir visionneuse (`club/[id].tsx:375`), et les **accents data** des clubs/coachs
  (`#1FB57A`, `#C9A24B`…) + la palette d'accents dans `AppContext.tsx:323`. À regrouper dans le thème.
- **8 emoji** dont certains en décor (`🎾` `BookingSheet:58`, `reserver/[clubId]:71` ; `✅`
  `club-admin:376` ; `👋` `onboarding`) — à harmoniser (les `✓` dans des libellés sont tolérables).
- **Stats profil** : « 0 Défaites » en **rouge** (sémantique inversée) ; trophées en chips ternes.
- **Planning gérant** : cases petites, **non cliquables**.
- **États** : pas de skeleton/erreur (cf. §2).
- Points forts à conserver : galerie plein écran, confettis, planning coloré, color-coding amorcé.

## 7. Performance
- Bundle web : **dist 7,6 Mo** (dont `_expo` JS 2,8 Mo). Une **seule famille d'icônes** déjà utilisée
  (**103 Ionicons**, aucune autre) → le « une seule famille » du prompt est **déjà acquis**.
- Images clubs = URLs **Pexels distantes** (non embarquées) → peu d'impact bundle, mais dépendance réseau.
- **Réalisme** : l'objectif « bundle −30% » est **optimiste** (le gros = moteur RN web + police d'icônes).
  Gains réalistes : sous-ensemble d'icônes, lazy-load, et ne pas ajouter de 2ᵉ police lourde (titres en
  Bricolage Grotesque sous-ensemblé). Je viserai une **réduction mesurée et documentée**, sans promettre 30%.

## 8. Verdict — Top 10 par impact
| # | Problème | Impact | Effort | Phase |
|---|---|---|---|---|
| 1 | Typo système (pas de police signée) | Élevé | M | 2 |
| 2 | Tarif « /h » vs session 1h30 (10 endroits) | Élevé | S | 1 |
| 3 | Vue « Par heure » = mur de chips sans prix | Élevé | M | 2 |
| 4 | Pas de design system unifié (hex épars, tokens) | Élevé | M | 2 |
| 5 | Espace Opérateur : message Wave + suivi paiement mensuel | Élevé | M | 3 |
| 6 | Stats profil : couleurs sémantiques inversées | Moyen | S | 1 |
| 7 | Planning gérant non cliquable + mini-stats | Moyen | M | 3 |
| 8 | Pas de couche `lib/data/` (repository) | Moyen | M | 1 |
| 9 | Seeds de prix peu plausibles vs marché | Moyen | S | 1 |
| 10 | Emoji-décor + états (skeleton/erreur) | Faible | S | 1‑2 |

**Décision à valider avant Phase 2** : lien discret « Contacter le club » (§2.4.9) — par défaut **non
ajouté** (respect de la décision « pas de contact club »). À confirmer.

**Hors périmètre (vraie version serveur)** : notifications push réelles, vérification SMS, comptes
synchronisés multi-appareils.
