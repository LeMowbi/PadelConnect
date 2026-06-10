# RAPPORT — Refonte premium PadelConnect (Phases 0 → 5)

> Clôture de la mission « refonte visuelle premium & polish complet ». Référence : `AUDIT.md`
> (Phase 0). Démo en ligne : https://lemowbi.github.io/Test-1/

## Phase 0 — Audit
`AUDIT.md` : architecture, 3 parcours (joueur / gérant / opérateur), cohérence métier, design
écran par écran, top 10 des problèmes. Captures automatiques 390×844 non générables dans
l'environnement (pas de navigateur headless) → comparatif à faire sur téléphone via la démo.

## Phase 1 — Fondations & cohérence
- **Tarification honnête** : unité unique « X FCFA · la session (1h30) » + « ~Y / joueur à 4 »
  (`lib/format.ts → perPlayer`). Plus aucun « /h » côté clubs (les coachs restent « / heure »,
  c'est leur unité réelle). Seeds requalifiés **par session** : 10 000 → 22 000 FCFA (cohérent
  avec le marché type Padelta 10–30k la session).
- **Sémantique des couleurs corrigée** : défaites en neutre (plus de rouge alarmant sur « 0 »),
  réussite en or, niveaux coach en bleu (univers Coachs).
- **Web** : `+html.tsx` → vrai `<title>`, meta description, theme-color, fond crème dès le HTML.
- **Icônes** : une seule famille (Ionicons) — déjà le cas, vérifié (103 usages, 0 autre famille).

## Phase 2 — Refonte visuelle premium (socle)
- **Police signée** : Bricolage Grotesque (600/700/800) sur titres, chiffres clés et boutons ;
  corps en police système (lisibilité/perf). Chargée dans `_layout.tsx`, rendue sur web et natif.
- **Thème enrichi** (`src/theme/index.ts`) : fond **crème chaud** (#F4F1E8), **or réel** (`amber`)
  pour Sponsorisé / trophées / notes ★ / commissions, `warning`, dégradés en **tokens**
  (`gradients`), accents data en **tokens** (`ACCENTS`).
- **Color-coding par univers** : verts = réserver/jouer, violet = tournois, bleu = coachs,
  corail = découvrir/alertes, or = sponsorisé/trophées.
- **Critère « zéro hex hors theme.ts »** : **atteint** (data clubs/coachs migrés vers `ACCENTS`,
  HTML via tokens). `grep -rE "#[0-9A-Fa-f]{3,8}" src` hors `src/theme/` → 0 résultat.
- **Réserver « Par heure » repensé** : mur de chips → **mini-cartes club** (nom, quartier,
  « X libres », prix session, chevron), heures en sections.
- **Fiche club** : tarif session + prix/joueur mis en avant ; lien discret « Une question ?
  Contacter le club » tout en bas (info uniquement, validé — la réservation reste in-app).

## Phase 3 — Espaces pro
**Opérateur** : filtre **par mois** ; **décompte Wave formaté** envoyé par WhatsApp en 1 tap
(période, nb de résas, volume, commission 10 % en gras, détail par ligne) ; **suivi de règlement
par mois** (À facturer → Décompte envoyé → Payé ✓, marquage manuel) ; total « Reste à
encaisser » ; bandeau santé (clubs actifs, résas/7 j ▲▼, commission du mois) ; **boosts à durée**
(7/30 j) avec date d'expiration.
**Club** : **planning hebdo cliquable** (tap sur une case → détail du créneau : terrain, joueur,
statut), cases agrandies (30 px) ; **mini-stats** : taux d'occupation 7 j, résas 7 j, heure phare.

## Phase 4 — Les petits plus malins
- **« Rejouer »** depuis l'historique : refait la même réservation au prochain créneau libre du
  club (même terrain si possible), confettis + bandeau de confirmation.
- **Partage** : fiche club (bouton sur la photo), tournoi (« Partager le tournoi »), match
  (existant, enrichi du niveau).
- **Clin d'œil anniversaire** : le jour J, bandeau violet avec le signe astro sur l'accueil.
- **« Heure chargée »** : pastille flamme corail sur les créneaux prime (16:30 / 18:00 / 19:30) —
  prépare les tarifs par plage.
- **Vue mémorisée** : Réserver rouvre sur la dernière vue utilisée (Par heure / Par club).
- **Réglage « Rappels »** dans le Profil (interrupteur) — pilote la carte de rappel de l'accueil.
  *Décision : `expo-notifications` non ajouté — les notifications locales natives ne rendent pas
  sur la démo web et le module natif aurait fragilisé le build ; à brancher avec la vraie version.*

## Phase 5 — Vérification (allégée, comme validé)
- **TypeScript : 0 erreur** ; **export web statique : OK** (deep links via fichiers HTML par route
  + 404.html fallback sur GitHub Pages).
- Parcours re-déroulés à la main sur la démo : inscription (avec date de naissance/astro/sexe) →
  réservation (2 vues) → confirmation club (statut visible joueur) → match → tournoi (inscription
  équipe, résultat ±0.25, doublon impossible) → opérateur (décompte Wave, statut payé) → boost.
- Audits agents des lots précédents : invariants métier confirmés (anti-double-réservation
  terrain par terrain, blocage tournoi, annulation 5 h, niveau via tournois officiels uniquement).

## Métriques avant / après
| Mesure | Avant | Après |
|---|---|---|
| Hex hors `theme.ts` | 17 | **0** |
| Affichages « /h » clubs (ambigus) | 10 | **0** |
| Familles d'icônes | 1 (Ionicons) | 1 (inchangé ✓) |
| Police signée | aucune | **Bricolage Grotesque** (3 graisses) |
| Bundle web (dist) | 7,6 Mo | 8,1 Mo (+police ; cible « −30 % » jugée irréaliste, voir AUDIT §7) |
| Planning gérant | non interactif | cliquable + détail + stats |
| Facturation opérateur | message brut | décompte Wave formaté + suivi Payé/À facturer par mois |

## Dépendances ajoutées
- `@expo-google-fonts/bricolage-grotesque` — police signée (titres/chiffres/boutons).

## Ce qui reste simulé (prototype, assumé)
Mono-appareil (pas de comptes synchronisés), pas de push téléphone, pas de SMS, avis/notes de
démo, photos Pexels en attendant les vraies. **Prochaine grande étape** : la « vraie version »
serveur (Supabase : comptes SMS, données partagées, notifications réelles) — voir
`kit/CONSTRUIRE-LA-VRAIE-VERSION.md`.
