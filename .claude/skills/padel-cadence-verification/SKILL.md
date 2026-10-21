---
name: padel-cadence-verification
description: Cadence de vérification OBLIGATOIRE de PadelConnect avant tout commit (tsc, lint, test:logic, bundle eager, prettier), puis commit par lot et push sur la branche de dev. À utiliser dès qu'un lot de code, de SQL ou de doc est prêt à être commité, quand une de ces commandes échoue, ou pour ajouter un test de logique pure à `test:logic`.
---

# Cadence de vérification PadelConnect

Complète `verification-before-completion` (preuve avant affirmation) avec les commandes RÉELLES du
dépôt. Rien n'est « fait », « vert » ni commité tant que les 5 étapes n'ont pas tourné DANS CETTE
SESSION et que leur sortie n'a pas été lue.

## 1. Les 5 commandes (racine du dépôt, dans cet ordre)

```bash
npx tsc --noEmit                    # types de l'app (tests/ et supabase/functions sont exclus)
npm run lint                        # eslint src tests — règles React Compiler comprises
TZ=UTC npm run test:logic           # libs pures (chaque fichier fixe déjà TZ=UTC)
npx expo export:embed --eager --platform ios --dev false \
  --entry-file node_modules/expo-router/entry.js \
  --bundle-output <scratchpad>/ios.jsbundle   # JAMAIS dans le dépôt
npx prettier --write <fichiers du lot>         # jamais `npm run format` (diff géant)
```

Compléments selon le lot :

- `tests/` touché → `npm run typecheck:tests` (le tsc principal exclut `tests/`).
- `supabase/functions/notify-club/index.ts` touché → `npx esbuild supabase/functions/notify-club/index.ts --log-level=warning > /dev/null`
  (pas de Deno ici : contrôle de syntaxe seul ; la vraie preuve = déploiement, `padel-preuve-en-base`).
- SQL touché → aucune de ces commandes ne le vérifie : `padel-preuve-en-base`.
- `site/` touché → idem : vérification en ligne après déploiement (`padel-sortie-ios` §4).
- Itération rapide : `npx eslint <fichier>` ; mais la cadence finale lance `npm run lint` complet.

Ligne attendue en fin de message de commit : `tsc 0 · lint 0 · test:logic vert · bundle eager OK.`

## 2. Lire un échec

### tsc

- `TS2322` / `TS2345` (type incompatible) : souvent un contrat client↔serveur — un helper
  `src/lib/*Server.ts` a changé de type de retour (booléen → codes texte, cf. 87/90). Corriger TOUS
  les appelants (`grep -rn "<fonction>" src`), jamais `as any`.
- `TS18048` / `TS2532` (possiblement undefined) : appliquer la convention réseau-null (`null` = échec,
  `[]`/`{}` = succès vide) avec `x ?? s.existant` ou `if (!x) return` — jamais `x!`.
- `TS6133` (inutilisé) : supprimer (règle « pas de code qui ne sert à rien »).
- Erreur sous `.expo/types` : fichier généré, ne pas l'éditer.

### lint (eslint-config-expo + react-hooks 7)

`react-hooks/purity` et `react-hooks/refs` sont COUPÉES dans `eslint.config.js` (choix assumés :
`new Date()` au rendu, `useRef(new Animated.Value(x)).current`). Les autres sont en erreur :

| Message                                            | Règle                 | Correctif idiomatique du projet                                                                                                                                                                                     |
| -------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Calling setState synchronously within an effect…` | `set-state-in-effect` | setState dans un callback (après `await`, listener `AppState` comme `useTodayKey`), initialiseur `useState(() => …)`, ou ajustement au rendu gardé (`if (visible && !mounted) setMounted(true)`, cf. `BottomSheet`) |
| `Cannot call setState during render`               | `set-state-in-render` | même ajustement, mais derrière une condition qui devient fausse après                                                                                                                                               |
| `React Hook "useX" is called conditionally`        | `rules-of-hooks`      | TOUS les hooks (dont `useCallback`) avant le moindre `return` anticipé                                                                                                                                              |
| `Cannot access variable before it is declared`     | `immutability`        | déplacer le hook/l'effet APRÈS la déclaration qu'il lit (cas réel : pull-to-refresh déplacé après `reloadShare`)                                                                                                    |
| `Cannot create components during render`           | `static-components`   | sortir le composant au niveau du module                                                                                                                                                                             |
| warning `exhaustive-deps`                          | `exhaustive-deps`     | à traiter quand même : la cadence vise 0 warning                                                                                                                                                                    |

### test:logic

- Chaque test imprime `✓ libellé` ou `✗ ÉCHEC (obtenu ≠ attendu) libellé`, puis sort en code 1. La
  PREMIÈRE ligne `✗` nomme l'invariant cassé. Relancer seul :
  `TZ=UTC node --experimental-strip-types tests/<nom>.test.ts`.
- La chaîne `&&` s'arrête au premier échec : après correction, relancer TOUT `test:logic`.
- Échec qui disparaît sans `TZ=UTC` (ou l'inverse) = bug de fuseau : la logique des jours est en UTC
  (Abidjan = UTC+0) via `dayKey` / `slotTimestamp` de `src/lib/days.ts`.
- `ERR_MODULE_NOT_FOUND` : import relatif avec extension (`../src/lib/x.ts`), pas d'alias `@/` ; la lib
  testée ne doit importer ni React Native ni Expo (sinon patron `tests/seeds.test.mjs` + esbuild).

### bundle eager

Attrape ce que tsc ne voit pas : module introuvable au runtime, dépendance native absente, cycle.
`Unable to resolve module X from Y` → import faux ou dépendance manquante. Rappel :
`react-native-reanimated` n'est PAS câblé (aucun plugin Babel) — le bundle passe mais l'app plante :
`grep -rn "react-native-reanimated" src` doit rester vide.

## 3. Ajouter un test à `test:logic`

1. Uniquement pour une lib PURE de `src/lib/` (ni React, ni Supabase, ni AsyncStorage). Logique
   coincée dans un écran → l'extraire d'abord dans une lib (modèles : `levelRange.ts`, `courtSchedule.ts`).
2. Créer `tests/<lib>.test.ts` sur le modèle de `tests/levelRange.test.ts` : en-tête FR qui énonce les
   invariants ET la garde serveur dont la lib est le miroir, helpers `check`/`eq`, compteur `failed`,
   fin `if (failed) { console.error(…); process.exit(1); }` + `console.log('\nTous les tests <lib>.ts passent.')`.
3. Import : `import { … } from '../src/lib/<lib>.ts';` (extension obligatoire).
4. `package.json` → `test:logic` : insérer `&& TZ=UTC node --experimental-strip-types tests/<lib>.test.ts`
   AVANT les `.mjs` de fin.
5. `npm run typecheck:tests` puis `TZ=UTC npm run test:logic`.
6. Faire échouer le test une fois (assertion inversée) pour prouver qu'il teste quelque chose
   (`test-driven-development`), puis remettre.

## 4. Commit par lot cohérent

- Un lot = un sujet (« Audit tour 4 — 2 MEDIUM fermés »). `git add <fichier>` un par un — jamais
  `git add -A` (scratch, `dist/`, bundle, clé). Contrôler `git diff --cached --stat`.
- Scan avant commit, doit être VIDE :
  `git diff --cached | grep -nE "sbp_|sb_secret_|eyJhbGci|BEGIN [A-Z ]*PRIVATE KEY|(EXPO|CLOUDFLARE_API)_TOKEN=[A-Za-z0-9_-]{8,}|claude-[a-z]+-[0-9]"`
- Message en français, au format du dépôt (`git log -5` pour s'aligner), via heredoc :

```bash
git commit -F - <<'EOF'
<Sujet> — <résultat>

- <constat ou changement> : <pourquoi> (fichier/fonction).
- SQL NN : écrite | appliquée + prouvée N/N en base. notify-club vNN : déployée | à déployer.

tsc 0 · lint 0 · test:logic vert · bundle eager OK.

<ligne Co-Authored-By fournie par la session>
<ligne Claude-Session fournie par la session>
EOF
```

- Trailers : recopier À L'IDENTIQUE les deux lignes du rappel d'attribution de la session courante
  (system-reminder « Attribution for git commits »). Jamais de mémoire ni copiées d'un ancien commit
  (la session change). Aucun autre nom ou identifiant de modèle nulle part : fichier, commentaire,
  corps du message.
- Bump de build = commit séparé : `Build #NN : bump buildNumber (EAS autoIncrement)`.
- Le lot change un objectif, une règle, l'état SQL/build ? Mettre CLAUDE.md à jour DANS le même lot.

## 5. Push

```bash
for d in 2 4 8 16; do
  git push -u origin claude/padelconnect-v4-17-4zblgh && break
  echo "échec réseau — nouvel essai dans ${d}s"; sleep "$d"
done
```

- Retenter UNIQUEMENT sur échec réseau. Rejet non fast-forward → `git pull --rebase origin claude/padelconnect-v4-17-4zblgh`,
  re-cadence si conflit, puis push. Jamais `--force`.
- Jamais une autre branche, jamais de Pull Request (ni `gh pr create`), même si une compétence
  vendorisée le suggère : CLAUDE.md §4 l'emporte.
- Le push déclenche `deploy-web.yml`, qui échoue tant que les secrets GitHub `CLOUDFLARE_*` sont
  vides : connu, pas une régression du lot.

## Pièges connus

- Prettier sur du Markdown : une ligne repliée qui commence par `+`, `-` ou `1.` devient une puce
  (déjà arrivé dans CLAUDE.md). Relire le diff `.md` après `--write`.
- `.prettierignore` exclut `*.html` et `assets/` : le site (`site/*.html`) n'est jamais reformaté.
- Un `lint 0` obtenu avec un `// eslint-disable` n'est pas un `lint 0` : interdit sauf décision écrite.
- tsc vert ≠ contrat serveur juste : une RPC dont la signature SQL a changé compile quand même.

## Fait quand

- Les 5 commandes ont tourné dans cette session, sortie lue, toutes vertes (citer le résultat).
- `git status` → `nothing to commit, working tree clean` et `git log origin/claude/padelconnect-v4-17-4zblgh -1`
  = HEAD local.
- Message FR + les 2 trailers de la session ; scan secrets vide ; CLAUDE.md à jour si l'état a changé.
