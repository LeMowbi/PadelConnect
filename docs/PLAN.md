# PadelConnect — Plan : prochaine micro-vague (prototype, design/UX, sans serveur)

> Établi le 2026-06-19. Le §A (refonte visuelle, écrans cœur) est quasi terminé : tokens v4.6 OK,
> `gold`→`signature` fait, FIP retiré, légal corrigé, BarChart présent, modération tournoi joueur→club faite.
> Décisions porteur respectées : accès opérateur = carte dans le Profil (pas de PIN) · Espace Club = code 4 chiffres.
> DIFFÉRÉS (vraie version) : gating serveur, notifications réelles, avis vérifiés, fiabilité, hors-ligne. Non touchés ici.

> **MISE À JOUR 2026-06-27 — micro-vague TERMINÉE.** T1 `Reveal` + T2 `StickyBar` livrées en v4.17 ;
> T3 (tarifs en onglets) livrée en **v4.18** dans sa version « plages nommées » (décision porteur :
> de vraies plages éditables par le gérant, sans tarif week-end — ce dernier resterait du §B serveur
> car il toucherait au prix réel/commission). Plus rien d'ouvert dans cette vague.

Cette vague ne contient que des finitions **chirurgicales, à faible risque, sans serveur**, pour aligner
les 2 derniers écarts visibles vs maquette. Aucune logique métier modifiée.

---

## Tâche 1 — `Reveal` sur les écrans de réservation (cohérence micro-anim)
- **Objectif :** harmoniser l'apparition des écrans `Réserver`. L'Accueil/Notifications/Parrainage utilisent déjà
  `Reveal` (cartes qui montent au montage) ; les deux écrans de réservation ne l'ont pas → rupture de feeling premium.
- **Fichiers :** `src/app/reserver/index.tsx`, `src/app/reserver/[clubId].tsx`.
- **Portée :** envelopper le contenu principal dans `<Reveal>` (composant existant, déjà importé ailleurs), sans
  toucher à la logique (jours/créneaux/store inchangés). Zéro nouveau composant, zéro token.
- **Agent :** coder.
- **Dépend de :** rien.
- **Fait quand :** à l'ouverture de `/reserver` et `/reserver/[clubId]`, le contenu apparaît avec le même fondu+glissement
  que l'Accueil ; aucun changement de comportement de sélection ; lint OK.

## Tâche 2 — `StickyBar` sur le parcours guidé `/reserver/[clubId]`
- **Objectif :** le CTA final « Réserver le terrain » est aujourd'hui un bouton en fin de ScrollView (ligne ~212),
  alors que la maquette « Réserver · B » et Fiche club imposent une **barre collante prix-à-gauche / CTA-pill-à-droite**.
  Composant `StickyBar` déjà existant et déjà utilisé sur la Fiche club → réemploi direct, pas de duplication.
- **Fichiers :** `src/app/reserver/[clubId].tsx` (+ éventuellement n'aligner que le `paddingBottom` du contenu).
- **Portée :** poser `<StickyBar label={fcfa(slotPrice)} hint="session · 1h30" cta="Réserver le terrain" onPress={confirm} disabled={!ready} />`
  via le slot `overlay` de `Screen` ; ajouter `contentStyle={{ paddingBottom: 96 }}` pour ne pas masquer le bas ;
  retirer le bouton dupliqué en bas de flux (garder le micro-texte « sans paiement en ligne… annulation 5h avant »).
  L'écran de confirmation `done` reste inchangé (pas de StickyBar dessus).
- **Agent :** coder.
- **Dépend de :** rien (peut se faire en parallèle de la T1).
- **Fait quand :** sur le parcours guidé, le prix + « Réserver le terrain » restent collés en bas pendant le défilement,
  le bouton est désactivé tant que jour+créneau+terrain ne sont pas choisis, et aucun second CTA « Réserver » ne subsiste dans le flux.

## Tâche 3 — `SegmentedControl` des tarifs sur la Fiche club (plages Journée/Soirée/Week-end)
- **Objectif :** la maquette Fiche club montre les tarifs **regroupés par plage via un SegmentedControl**
  (Journée / Soirée / Week-end) ; l'app liste aujourd'hui toutes les lignes à plat avec des séparateurs `hairline`.
  C'est le seul écart visuel restant sur la Fiche club. Réutilise `SegmentedControl` (existant) — purement présentation.
- **Fichiers :** `src/app/club/[id].tsx` (bloc « Tarifs par créneau », ~l.209–245). Vérifier d'abord la forme de
  `priceTiersFor(club)` dans `src/lib/pricing.ts` pour savoir si une notion de plage existe déjà.
- **Portée (à faible risque) :** si `priceTiersFor` n'expose pas de plages nommées, **NE PAS** inventer un modèle de
  données : se contenter d'un regroupement d'affichage par tranche horaire (ex. < 17h = Journée, ≥ 17h = Soirée) côté écran,
  sans modifier le store ni `pricing.ts`. Le tarif unique (tiers vide) garde le rendu actuel.
- **Agent :** coder (designer en appui si besoin sur le mapping plages).
- **Dépend de :** lecture préalable de `src/lib/pricing.ts` (question ouverte ci-dessous).
- **Fait quand :** la Fiche club affiche un SegmentedControl au-dessus des tarifs ; basculer d'onglet change la liste
  affichée ; le repli « tarif unique » reste correct ; aucune écriture dans le store ; lint OK.

---

## Questions ouvertes (à trancher AVANT la T3)
1. **Modèle de tarifs :** `priceTiersFor(club)` renvoie-t-il des plages nommées (Journée/Soirée/Week-end) ou seulement
   des lignes horaires `{start,end,price}` ? Si seulement des lignes → on fait un **regroupement d'affichage** (T3 version
   sûre), sans toucher au store. Si le porteur veut de vraies plages éditables → cela devient une tâche §B (gérant/données)
   et **sort de cette vague**.
2. **Priorité T3 :** si le porteur juge le regroupement par tranche horaire « inventé », on **abandonne la T3** et la vague
   se limite aux T1+T2 (toutes deux 100 % sûres et fidèles à la maquette).

## Hors périmètre (rappel — ne pas faire maintenant)
- Tout gating serveur, PIN opérateur, notifications réelles, avis vérifiés, score de fiabilité, hors-ligne.
- Aucune réintroduction d'auto-déclaration Victoire/Défaite ni de « partie à valider ».
- Pas de nouvelles photos inventées (garder le repli doré `ClubPhoto`/`PhotoPlaceholder`).
