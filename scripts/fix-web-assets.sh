#!/usr/bin/env bash
# Répare l'export web AVANT déploiement Cloudflare : wrangler (comme le glisser-déposer) EXCLUT
# silencieusement tout dossier nommé `node_modules` — or Metro y range les polices d'icônes
# (Ionicons…). Sans ce correctif, le site sert la page HTML de repli à la place des .ttf → toutes
# les icônes s'affichent en carrés vides (bug vu en production). On renomme chaque dossier
# `node_modules` de dist/assets en `vendor` et on réécrit les références dans tous les fichiers
# texte de dist/.
# Cas courant (CI, `npm ci`) : dist/assets/node_modules → dist/assets/vendor. Cas d'un node_modules
# en LIEN SYMBOLIQUE (copie de travail) : Metro suit le chemin réel → dist/assets/______home/…/
# node_modules — renommé de la même façon, là où il est (…/vendor), quelle que soit sa profondeur.
set -euo pipefail
DIST="${1:-dist}"

# Échappe une chaîne pour la partie MOTIF (regex) puis pour la partie REMPLACEMENT de sed.
echapper_motif() { printf '%s' "$1" | sed 's/[][\.*^$#]/\\&/g'; }
echapper_rempl() { printf '%s' "$1" | sed 's/[\&#]/\\&/g'; }

# Liste COLLECTÉE d'abord (on ne renomme pas pendant que `find` parcourt l'arborescence).
# `-prune` : on ne descend pas dans un node_modules déjà trouvé (un seul renommage par branche).
# Boucle `while read` (et non `mapfile`) : compatible avec le bash 3 de macOS.
DOSSIERS=()
while IFS= read -r DOSSIER; do
  [[ -n "$DOSSIER" ]] && DOSSIERS+=("$DOSSIER")
done < <(find "$DIST/assets" -type d -name node_modules -prune 2>/dev/null)

if [[ ${#DOSSIERS[@]} -eq 0 ]]; then
  echo "rien à faire (pas de dossier node_modules dans $DIST/assets)"
  exit 0
fi
for DOSSIER in "${DOSSIERS[@]}"; do
  REL="${DOSSIER#"$DIST"/}"          # ex. assets/node_modules
  NOUVEAU="$(dirname "$REL")/vendor" # ex. assets/vendor
  rm -rf "${DIST:?}/$NOUVEAU"
  mv "$DOSSIER" "$DIST/$NOUVEAU"
  MOTIF="$(echapper_motif "$REL/")"
  REMPL="$(echapper_rempl "$NOUVEAU/")"
  grep -rlZF "$REL/" "$DIST" --include='*.js' --include='*.json' --include='*.html' --include='*.css' 2>/dev/null \
    | xargs -0 -r sed -i "s#$MOTIF#$REMPL#g"
  echo "✓ polices déplacées : $REL → $NOUVEAU (références réécrites)"
done
