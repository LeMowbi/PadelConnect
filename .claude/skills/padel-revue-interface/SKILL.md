---
name: padel-revue-interface
description: Relecture d'un écran ou d'un composant PadelConnect — langage « luxe sportif » et tokens de src/theme, composants maison à réutiliser, états obligatoires (chargement, vide, erreur, hors-ligne, envoi), accessibilité, textes FR, tablette/web, animations Animated, règles React Compiler, check-list avant de rendre. À utiliser avant de livrer ou de valider un écran de src/app ou src/components, pendant une revue d'interface, ou quand un écran « fait générique ».
---

# Revue d'interface PadelConnect

Principes visuels généraux : `frontend-design` ; dérive de design system : `expo-design-system`
(références `audit.md`, `native-slop.md`). ⚠️ `expo-animation` écrit ses recettes en Reanimated :
ne PAS les copier ici — Reanimated n'est pas câblé (aucun plugin Babel) ; transposer sur `Animated`.

## 1. Langage visuel « luxe sportif » — tokens réels (`src/theme/index.ts`)

`import { colors, gradients, spacing, radius, font, shadows } from '@/theme';` — zéro hex, taille ou
rayon en dur dans un écran ; un manque = nouveau token commenté dans le thème.

- **Couleurs PAR RÔLE** — VERT `signature` / `signatureDark` / `signatureSoft` (navigation, réservation,
  sélection ; texte dessus `onSignature`) ; `green` / `greenSoft` (dispo, succès) ; OR `amber` (accent :
  étoiles, trophées, jauges), `amberDark` (texte sur `amberSoft`), `goldBright` (texte sur vert sombre) ;
  VIOLET `purple` / `purpleDark` / `purpleSoft` (tournois, récompenses) ; CORAIL `coral` / `coralDark` /
  `coralSoft` (urgence, places limitées) = `danger` / `dangerSoft` (erreurs) ; `lime` / `limeGlow` (« live »).
- **Fonds et texte** — `bg` (beige app), `surface` / `bgElevated` (cartes), `surfaceAlt` (champs,
  squelettes), `surfaceBeige` (track segmenté), `border` (contour) vs `hairline` (séparateur interne) ;
  `text`, `textMuted` (secondaire, AA sur `bg`), `textFaint` (DÉCORATIF uniquement) ; photo : `scrim`,
  `scrimStrong`, `onPhoto`, `onPhotoSoft` ; feuilles : `overlay`.
- **Dégradés** — `gradients.deepGreen` (héros), `gradients.deepPurple` (univers Tournois).
- **Échelles** — `spacing` xs 4 · sm 8 · md 12 · lg 16 · xl 24 · xxl 32 · xxxl 48 ; `radius` xs 6 · sm 10 ·
  md 14 · lg 20 · xl 28 · pill 999 ; `shadows.e1` (cartes), `e2` (héros, CTA primaire), `e3` (feuilles, modales).
- **Typo** — titres/chiffres Bricolage Grotesque, corps Schibsted Grotesk : passer par `<Txt variant>`
  (`display`, `h1`, `h2`, `h3`, `body`, `small`, `muted`, `label`, `price`), jamais un `fontFamily` à la main.

## 2. Composants à RÉUTILISER (ni composant jetable, ni lib UI externe)

| Besoin         | Composant                                                                                                                          | Props principales                                                                                                                                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Écran          | `Screen`                                                                                                                           | `title`, `subtitle`, `back` (repli accueil si pile vide), `scroll`, `headerRight`, `overlay`, `refreshControl`, `scrollRef` ; contenu plafonné à 640                                                                    |
| Texte          | `Txt` (`ui.tsx`)                                                                                                                   | `variant`, `color`, `numberOfLines`, `accessibilityRole="header"`                                                                                                                                                       |
| Carte / bouton | `Card`, `Button`                                                                                                                   | `Card` : `onPress` (devient bouton), `accessibilityLabel` · `Button` : `label`, `onPress`, `variant` (primary, secondary, ghost, danger, tournament), `icon`, `full` (⇒ pill), `size`, `disabled`, `accessibilityLabel` |
| Badge / puce   | `Tag`, `Chip`                                                                                                                      | `Tag` : `label`, `tone`, `icon` · `Chip` : `label`, `active`, `onPress`, `size`, `icon`, `disabled`, `accessibilityLabel` (haptique + 44 pt intégrés)                                                                   |
| Choix exclusif | `SegmentedControl`                                                                                                                 | `options`, `value`, `onChange`                                                                                                                                                                                          |
| CTA collant    | `StickyBar` (via `Screen overlay`)                                                                                                 | `label` (prix), `hint`, `cta`, `onPress`, `disabled` — padding bas ≈ 92 + insets                                                                                                                                        |
| Feuille        | `BottomSheet`                                                                                                                      | `visible`, `title`, `subtitle`, `onClose` (largeur max 480)                                                                                                                                                             |
| Vide           | `EmptyState` (`ui.tsx`)                                                                                                            | `icon`, `title`, `text`, `actionLabel` + `onAction`, `tone`                                                                                                                                                             |
| Chargement     | `Skeleton`, `SkeletonLines`, `SkeletonCard`                                                                                        | `width`/`height`/`radius` · `lines` · `banner`                                                                                                                                                                          |
| Chiffres       | `StatTile`, `BarChart`                                                                                                             | `value` numérique ⇒ compteur animé, `label` · `data`, `color`, `height`                                                                                                                                                 |
| Structure      | `SectionHeader`, `Divider`, `IconCircle`, `Stepper`                                                                                | `title` + `actionLabel`/`onAction` · `icon` · `steps`, `current`                                                                                                                                                        |
| Date           | `CalendarPicker`                                                                                                                   | `value`, `onSelect`, `minKey`, `maxKey` (clés UTC AAAA-MM-JJ)                                                                                                                                                           |
| Visuels        | `ClubPhoto`, `Avatar`                                                                                                              | `uri`, `accent`, `initials`, `overlay`, `caption` (repli si pas de photo) · `uri`, `name`, `size`                                                                                                                       |
| Mouvement      | `Reveal`, `PopIn`, `Confetti`                                                                                                      | `delay` (via `staggerDelay(i)`), `disabled` (lignes « Voir plus ») · `delay`, `style` · `onDone`                                                                                                                        |
| Retours        | `useToast().show(msg, { icon })` ; `hapticSuccess` / `hapticWarning` / `hapticLight` ; `confirmAsync` / `alertAsync`               | icône `alert-circle` ou `cloud-offline-outline` ⇒ toast rouge ; jamais `Alert.alert` (no-op web)                                                                                                                        |
| Hooks / format | `usePullToRefresh(extra)` (+ `webRefreshButton` en `headerRight`), `useTodayKey()`, `fcfa`, `perPlayerOf`, `pctLabel`, `levelText` | `src/lib/`                                                                                                                                                                                                              |

Avant d'écrire un helper ou un composant : `grep -rn "<idée>" src/components src/lib` — pas de doublon.

## 3. États obligatoires (toute section qui lit le serveur)

1. **Chargement** (`undefined`) : squelette aux proportions du contenu ; jamais « 0 » ni « aucun ».
2. **Vide** (`[]`) : `EmptyState` chaleureux AVEC une action.
3. **Erreur / hors-ligne** (`null`) : le miroir local reste affiché (`x ?? s.existant`) + toast
   `cloud-offline-outline` ; jamais de liste vidée ni d'écran blanc.
4. **Pendant l'envoi** : bouton `disabled`, double-tap bloqué par `useRef` ; l'écran de succès lit un
   instantané FIGÉ ; chaque puce/bascule est gardée (`if (submitting) return`) ; aucun état dérivé
   (complet, « · pris », « plus aucun terrain ») ne bascule à cause de SA PROPRE écriture.
5. **Refus serveur** : un message PAR code (« ce créneau vient d'être pris — choisis-en un autre ») ;
   « réessaie » réservé à l'échec réseau.
6. **Succès** : toast ou `PopIn` + `hapticSuccess`, puis état serveur relu (écriture honnête).

## 4. Accessibilité

- Tout élément tapable : `accessibilityRole="button"`, `accessibilityLabel` explicite quand le visuel
  ne suffit pas (icône seule, libellés répétés), `accessibilityState` (`selected`, `disabled`).
- Cible ≥ 44 pt : taille ou `hitSlop` (modèle `Chip`).
- Titres d'écran/section : `Txt accessibilityRole="header"`. Fonds tapables et scrims :
  `accessible={false}` + `importantForAccessibility="no-hide-descendants"` (modèle `BottomSheet`).
- Contraste AA : information en `text` / `textMuted`, jamais `textFaint` ; texte sur tint via les
  `*Dark` (comme `Tag`) ; texte sur photo via `scrim`.
- Un retour d'action passe par le toast (annoncé aux lecteurs d'écran), pas par une bannière muette.

## 5. Textes

- 100 % français, tutoiement côté joueur (« Réserve ton terrain »), précis et chaleureux, zéro jargon
  (RPC, SQL, codes d'erreur). Aucune donnée factice.
- Apostrophe TYPOGRAPHIQUE `’` dans tout texte affiché : convention dominante (~640 dans les chaînes
  de `src/`, quasi aucune apostrophe droite) ; l'apostrophe droite reste dans les commentaires.
- Guillemets « … » avec espaces. Avant `: ! ? »`, espace ORDINAIRE : c'est la convention réelle
  (0 espace insécable dans `src/`, ~300 espaces ordinaires) — ne pas en introduire isolément ; une
  bascule vers l'insécable se ferait en lot sur tout le projet, sur décision du porteur.
- Montants via `fcfa(n)` (« 10 000 FCFA »), jamais « F » ni « CFA » ; pourcentages `pctLabel` ;
  niveaux `levelText` (virgule décimale). Un match ouvert n'est jamais « gratuit » : « le prix du
  terrain se partage entre les joueurs ».

## 6. Tablette, web, plateforme

- `Screen` plafonne à 640, les feuilles à 480 ; un écran hors `Screen` reprend
  `maxWidth: 640, alignSelf: 'center'`.
- Web (`club.padelconnectci.com` sert l'Espace Club et l'opérateur) : `confirmAsync`, bouton
  « Actualiser » (`webRefreshButton`), haptique déjà no-op ; vérifier le parcours gérant à la souris.
- Safe areas via `useSafeAreaInsets` (déjà dans `Screen`, `StickyBar`, `BottomSheet`).

## 7. Animations

API `Animated` du cœur RN uniquement : `useRef(new Animated.Value(x)).current`, `useNativeDriver: true`
pour opacité/transform, cadence commune `staggerDelay`. Boucle infinie réservée à `Skeleton` ; une
célébration = `PopIn` (+ `Confetti` au plus). Jamais `react-native-reanimated`.

## 8. Règles React Compiler (flag coupé, règles respectées)

Pas de setState synchrone dans un effet ; hooks (dont `useCallback`) avant tout `return` anticipé ;
pas d'accès avant déclaration ; pas de composant défini dans un composant ; valeur capturée par une
closure = gelée (ref pour la fraîche) ; drapeau anti-double-tap en `useRef`, pas dans un updater.

## 9. Check-list « avant de rendre un écran »

- [ ] `grep -nE "#[0-9A-Fa-f]{3,8}\b" <fichier>` vide ; tokens et composants du §2 uniquement.
- [ ] Les 6 états du §3 parcourus, dont hors-ligne, refus serveur et double-tap.
- [ ] Écran de succès sur instantané figé ; puces/bascules gardées pendant l'envoi.
- [ ] Accessibilité §4 : rôles, labels, 44 pt, headers, contraste.
- [ ] Textes §5 : `’`, « », `fcfa`, tutoiement, aucun jargon, aucune donnée factice.
- [ ] Tablette 640/480, web (dialogues, actualisation), safe areas.
- [ ] `Animated` seulement ; `grep -rn "react-native-reanimated" src` vide.
- [ ] Règles React Compiler ; aucun doublon de helper/composant ; impact vérifié sur les écrans voisins.
- [ ] `padel-cadence-verification` verte.

## Fait quand

Chaque case est cochée avec sa preuve (commande lancée ou trajet d'état décrit), aucun constat MEDIUM
ou plus n'est ouvert au sens de `padel-audit-adversarial`, et l'écran ressemble à ses voisins (mêmes
composants, mêmes espacements, même ton).
