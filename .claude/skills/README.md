# Compétences du dépôt (`.claude/skills/`)

Chargées automatiquement par Claude Code dans TOUTE session ouverte sur ce dépôt (terminal, bureau,
cloud) et par les agents. Deux familles :

- **`padel-*`** : compétences-maison PadelConnect (cadence de vérification, audit adversarial, preuve
  en base, sortie iOS, revue d'interface) — écrites pour ce projet, mises à jour avec lui.
- **Vendorisées** (copies figées de dépôts publics, licence conservée dans chaque dossier, aucun
  script, aucun accès réseau — uniquement du texte de méthode) :
  - `systematic-debugging`, `test-driven-development`, `verification-before-completion`,
    `requesting-code-review` — `obra/superpowers` (MIT, instantané du 2026-10-20).
  - `frontend-design`, `claude-md-improver` — `anthropics/claude-plugins-official` (Apache-2.0,
    instantané du 2026-10-20).
  - `eas-update`, `eas-app-stores`, `expo-animation`, `expo-design-system`, `expo-router`,
    `expo-project-structure`, `expo-upgrade` — `expo/skills` (plugin officiel Expo, MIT, instantané du
    2026-10-21 ; Markdown seul, aucun script copié).
  - `supabase`, `supabase-postgres-best-practices` — `supabase-community/supabase-plugin` (plugin
    officiel Supabase, MIT, Markdown seul).
  - Agents `silent-failure-hunter`, `pr-test-analyzer` (`.claude/agents/`) — même dépôt Anthropic.

Règles d'application :

- En cas de conflit entre une compétence vendorisée et `CLAUDE.md`, **`CLAUDE.md` l'emporte**
  (jamais de Pull Request sans demande explicite, branche de dev unique, commentaires en français,
  pas de réécriture de zéro, écritures honnêtes, convention réseau-null).
- `test-driven-development` s'applique aux **libs pures** (`src/lib` + `tests/`, script `test:logic`) ;
  les écrans React Native (sans harnais de test de composants) sont vérifiés par la cadence §6 et
  les audits adversariaux (`padel-audit-adversarial`).
- `requesting-code-review` : le gabarit `code-reviewer.md` sert à briefer l'agent `reviewer` du dépôt.
