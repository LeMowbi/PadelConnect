---
name: padel-audit-adversarial
description: Méthode d'audit adversarial PadelConnect « tour après tour jusqu'au tour BLANC » — agents frais par secteur, constats prouvés fichier:ligne, réfutation à 3 lentilles, sévérités, classes de défauts récurrentes, convergence et format de rapport. À utiliser quand le porteur demande un audit, une contre-expertise ou une « vérification complète », avant un build de sortie, ou après un gros lot pour traquer les régressions.
---

# Audit adversarial jusqu'au tour BLANC

Prolonge `requesting-code-review` (briefer un relecteur sans historique) et `systematic-debugging`
(cause racine avant correctif) avec la méthode rodée sur les campagnes journalisées dans CLAUDE.md §10.
L'agent `silent-failure-hunter` est une lentille utile sur les `catch`/replis silencieux.

## 1. Déroulé d'un tour

1. **Périmètre + journal** : ce qui a changé depuis le dernier tour blanc (`git log --oneline <commit>..HEAD`,
   `git diff --stat <commit>`) ; relire le journal des tours (CLAUDE.md §10) : corrigé, assumé, gardé.
2. **Un agent FRAIS par secteur** (tableau ci-dessous), en parallèle, sans historique de conversation.
3. **Brief** de chaque agent (gabarit `requesting-code-review/code-reviewer.md` adapté) : lire CLAUDE.md
   en entier ; périmètre exact ; classes du §4 ; liste du §5 ; journal des tours ; exigences de preuve
   du §2 ; LECTURE SEULE ; rendu au format du §7.
4. **Réfutation** de chaque constat par un agent sceptique DISTINCT (§2).
5. **Correctifs** regroupés par fichier (§7), appliqués, puis `padel-cadence-verification` ; tout SQL /
   notify-club prouvé par `padel-preuve-en-base`.
6. **Journal** : une puce « Tour N » dans CLAUDE.md §10 (constats, sévérités, correctifs, SQL et versions).
7. **Tour suivant** : (a) un agent re-vérifie CHAQUE correctif du tour précédent (régressions,
   effets de bord) ; (b) au moins une lentille FRAÎCHE : un secteur non audité, ou le traçage
   exhaustif d'un flux (submit, passage de minuit, retour premier plan, hors-ligne, double-tap,
   déconnexion/bascule de compte). Boucler jusqu'à la convergence (§6).

Secteurs (la répartition sensible / écrans suit la décision du porteur, CLAUDE.md chantier v3) :

| Secteur                | Fichiers                                                                   | Profil   |
| ---------------------- | -------------------------------------------------------------------------- | -------- |
| Serveur SQL            | `supabase/NN_*.sql` récents + dernières définitions des fonctions touchées | sensible |
| Edge                   | `supabase/functions/notify-club/index.ts`                                  | sensible |
| Contrat client↔serveur | `src/lib/*Server.ts` et autres libs RPC ↔ signatures SQL live              | sensible |
| Cœur d'état            | `src/store/AppContext.tsx`, `src/store/helpers.ts`                         | sensible |
| Écrans / flux          | `src/app/**`, `src/components/**` du périmètre                             | écrans   |
| Libs pures + tests     | `src/lib/*` purs, `tests/`                                                 | écrans   |
| Site / config / docs   | `site/`, `app.json`, `eas.json`, `docs/`, CLAUDE.md                        | écrans   |

## 2. Preuve exigée et réfutation à 3 lentilles

Un constat sans preuve est rejeté d'office. Il porte :

- `fichier:ligne` + extrait (3 à 10 lignes) du code fautif ;
- un scénario concret : état initial → geste → ce que l'écran / la base montre → ce qui est vrai ;
- pour le SQL : la requête ou le DO-block qui reproduit (local ou transaction annulée) ;
- le correctif minimal proposé et les fichiers touchés.

Le sceptique cherche à RÉFUTER ; **le doute profite à la réfutation** :

1. **Reproduction** — le chemin se produit-il vraiment ? Tracer jusqu'au bout ; une garde en amont
   a-t-elle été oubliée ? L'état est-il atteignable via l'app (ou seulement par appel forgé) ?
2. **Contexte / décisions** — décision assumée (CLAUDE.md §9-§10, « gardé pour plus tard »,
   « résiduel assumé ») ? Déjà corrigé plus loin ? La DERNIÈRE définition fait foi :
   `grep -ln "function public.<f>" supabase/*.sql | sort -V | tail -1`.
3. **Impact / correctif** — l'impact justifie-t-il la sévérité ? Le correctif casse-t-il un autre
   appelant, le miroir client↔serveur, la rétrocompatibilité, un test ?

Verdict : **CONFIRMÉ** (sévérité éventuellement révisée) · **RÉFUTÉ** (raison) · **DÉJÀ ASSUMÉ** (réf. CLAUDE.md).

## 3. Sévérités

| Sévérité | Définition PadelConnect                                                                                                                     | Exemples vécus                                                                                    |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| HIGH     | Perte/corruption de données, faille exploitable, argent faux, fonction cœur ou exigence store cassée pour tous                              | `delete_account` en échec à chaque appel (App Store 5.1.1) ; double-vente d'un créneau            |
| MEDIUM   | Écran qui MENT sur un cas réaliste via l'app ; « réessaie » en boucle sur un refus définitif ; miroir ≠ serveur ; régression d'un invariant | puce « · pris » sur son propre terrain pendant le submit ; carnet « Épuisé » jamais resynchronisé |
| LOW      | Seulement par appel forgé, course rare, défense en profondeur, message imprécis mais pas faux                                               | borne `price60` absente côté SQL ; double-tap dans la même frame                                  |
| COSMETIC | Libellé, alignement, typo sans effet sur la compréhension                                                                                   | toast « réessaie » issu d'une closure périmée                                                     |

## 4. Classes de défauts récurrentes (à chercher EN PREMIER)

**Client**

- **Écran menteur pendant le submit** : `addReservation` pousse le miroir PUIS attend le serveur →
  rendu intermédiaire. Figer tout ce que l'écran de succès lit (instantané `booked` : terrain, jour,
  heure, `startsAt`, durée, prix, équipe, format, ouvert/privé) ; garder chaque puce/bascule
  (`if (submitting) return`) ; exclure `submitting` des états dérivés (complet, « plus aucun terrain »).
- **« Réessaie » sur refus définitif** : un booléen confond réseau et refus légitime → codes TEXTE
  (`'ok' | 'played' | 'gone' | 'taken' | 'forbidden'`, patron 87/90) et un message PAR code ; `'error'`
  = réseau seulement.
- **Convention réseau-null** : `null` = échec, `[]`/`{}` = succès vide ; l'appelant fait `x ?? s.existant`
  ou `if (!x) return` — jamais vider le miroir hors-ligne.
- **Écritures honnêtes** : gérant / opérateur / profil ATTENDENT le serveur avant « enregistré » ;
  optimiste seulement avec retour arrière + toast d'erreur.
- **Gardes d'époque** : toute écriture asynchrone du store vérifie `sessionEpochRef` (`stillCurrent()`),
  sinon la réponse d'une session précédente écrase la nouvelle (déconnexion, bascule de compte/club).
- **Temps** : listes de jours via `useTodayKey()` ; un instantané fige jour/heure au submit ; `new Date()`
  au rendu est assumé (règle `purity` coupée), le stockage d'un « maintenant » ne l'est pas.
- **Premier plan** : ce qui se resynchronise en session doit aussi l'être au retour premier plan,
  côté joueur ET côté club (parité).
- **Tri-état** : `undefined` = chargement, `null` = échec, valeur = succès — jamais « 0 » / « aucun »
  pendant un chargement.
- **Web** : `Alert.alert` est un no-op sous react-native-web → `confirmAsync` / `alertAsync`.

**React Compiler** (flag coupé, règles appliquées) : pas de setState synchrone dans un effet ; hooks
(y compris `useCallback`) avant tout `return` anticipé ; pas d'accès avant déclaration ; une valeur
capturée par un hook ou une closure est GELÉE à ce rendu (lire la fraîche via ref ou paramètre) ; un
drapeau posé dans un updater `setState(prev => …)` n'est pas lisible juste après (setState n'est pas
synchrone) → `useRef`.

**SQL / edge**

- Type de retour changé → `drop function if exists` avant `create`, sinon `42P13 cannot change return type` ;
  et un drop+create remet `EXECUTE` à PUBLIC → re-poser `revoke … from public, anon` + `grant … to authenticated`
  (piège déjà vécu deux fois).
- `security definer` + `set search_path = public` + contrôle `auth.uid()` ; RLS partout.
- Recopie STRICTE de la version live d'une fonction redéfinie ; jamais recoller la 68 seule (CLAUDE.md §7).
- TOCTOU : relire sous `for update` ou verrou `pg_advisory_xact_lock(hashtext('club:' || …))` ; un
  `UPDATE … FROM (table dérivée)` ne réévalue pas la dérivée → `perform … for update` AVANT (course C2).
- `create or replace` ne valide pas toutes les références d'un corps plpgsql → la preuve doit EXÉCUTER
  chaque branche modifiée.
- notify-club : exclusion des bloqués FAIL-CLOSED, fan-out paginé et plafonné, anti-doublon, contenu
  relu en base (anti-phishing), comparaison du secret en temps constant.

## 5. Gardés de côté par le porteur — NE PAS signaler

Ligue par divisions (lot E) · « trouver un partenaire » · abonnement Gold · OTP SMS / `profiles.phone`
non vérifié · tournoi bidon (+100 pts, plafond à décider) · API Wave (paiement manuel assumé) · carte
des clubs · prix creux / promos heures creuses · borne `price60` dans `upsert_club_override` · retrait
des dépendances reanimated/worklets · bouton retour pendant le submit (succès perdu, rien de faux) ·
confirmation d'une part Wave via l'UI après la fin du match. Plus tout ce que CLAUDE.md marque
« GARDÉ POUR PLUS TARD », « résiduel assumé » ou « décision assumée ». Signalé quand même → verdict
DÉJÀ ASSUMÉ, sans débat.

## 6. Convergence

- **Tour BLANC** = 0 HIGH et 0 MEDIUM confirmés après réfutation ; chaque LOW est fermé OU assumé
  et écrit dans CLAUDE.md §10 (« résiduel assumé : … »).
- Trajectoire saine : HIGH → MEDIUM → LOW → cosmétique → blanc. Un MEDIUM qui réapparaît après
  un tour LOW = un correctif a régressé → lentille dédiée au tour suivant.
- Un tour dont un agent a été interrompu (limite de session, erreur) n'est PAS blanc : relancer le secteur.

## 7. Rapport de tour

```markdown
### Tour N — AAAA-MM-JJ — BLANC | NON BLANC

| #   | Sév.   | Fichier:ligne                     | Constat (une phrase) | Preuve (extrait / scénario) | Réfutation |
| --- | ------ | --------------------------------- | -------------------- | --------------------------- | ---------- |
| 1   | MEDIUM | src/app/reserver/[clubId].tsx:256 | …                    | …                           | CONFIRMÉ   |

**Correctifs regroupés par fichier** (lots disjoints → un agent par lot, jamais deux sur un fichier)

| Lot | Fichiers | Constats | Profil | SQL / edge à prouver |
| --- | -------- | -------- | ------ | -------------------- |

**Rejetés / assumés** — une ligne chacun, avec la raison ou la référence CLAUDE.md.
**Lentilles du tour suivant** — re-vérification des correctifs + lentille fraîche.
```

## Fait quand

- Le dernier tour est BLANC (§6) et comportait au moins une lentille fraîche.
- Chaque correctif a passé la cadence ; le SQL est prouvé en base ; notify-club déployée et versions notées.
- CLAUDE.md §10 journalise chaque tour, résiduels assumés compris ; rien n'est commité sans la cadence.
