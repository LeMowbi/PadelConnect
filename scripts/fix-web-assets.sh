#!/usr/bin/env bash
# Répare l'export web AVANT déploiement Cloudflare : wrangler EXCLUT silencieusement tout
# dossier nommé `node_modules` — or Metro y range les polices d'icônes (Ionicons…). Sans ce
# correctif, le site sert la page HTML de repli à la place des .ttf → toutes les icônes
# s'affichent en carrés vides (bug vu en production). On renomme le dossier en `vendor` et on
# réécrit les références dans tous les fichiers texte de dist/.
set -euo pipefail
DIST="${1:-dist}"
if [[ -d "$DIST/assets/node_modules" ]]; then
  rm -rf "$DIST/assets/vendor"
  mv "$DIST/assets/node_modules" "$DIST/assets/vendor"
  grep -rlZ 'assets/node_modules' "$DIST" --include='*.js' --include='*.json' --include='*.html' --include='*.css' 2>/dev/null \
    | xargs -0 -r sed -i 's#assets/node_modules#assets/vendor#g'
  echo "✓ polices déplacées vers assets/vendor + références réécrites"
else
  echo "rien à faire (pas de $DIST/assets/node_modules)"
fi
