#!/usr/bin/env bash
# Déploiement MANUEL du web (Espace Club / opérateur) sur Cloudflare Pages.
# En temps normal c'est AUTOMATIQUE via .github/workflows/deploy-web.yml à chaque push.
# Ce script sert de secours (déploiement à la demande depuis une machine).
#
# Prérequis : deux variables d'environnement (jamais écrites dans le dépôt) :
#   CLOUDFLARE_API_TOKEN   jeton Cloudflare avec « Cloudflare Pages: Edit »
#   CLOUDFLARE_ACCOUNT_ID  ID de compte Cloudflare
#
# Usage :
#   CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… ./scripts/deploy-web.sh

set -euo pipefail

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" || -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  echo "Erreur : définis CLOUDFLARE_API_TOKEN et CLOUDFLARE_ACCOUNT_ID avant de lancer." >&2
  exit 1
fi

echo "→ Export web (npm run build:web)…"
npm run build:web

echo "→ Déploiement sur Cloudflare Pages (padelconnect-club)…"
npx wrangler@latest pages deploy dist \
  --project-name=padelconnect-club \
  --branch=main \
  --commit-dirty=true

echo "✓ Web en ligne : https://club.padelconnectci.com"
