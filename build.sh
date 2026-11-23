#!/bin/sh
# Copies src/ into dist/ (the deploy folder). No compiling, only a copy
# plus a version stamp so browsers and Cloudflare fetch fresh files after a deploy.
set -e
cd "$(dirname "$0")"

V=$(date +%Y%m%d%H%M%S)
rm -rf dist
mkdir dist
# shared/fake-db.js is a local test stand-in for Firebase and never ships.
rsync -a --exclude '.DS_Store' --exclude 'shared/fake-db.js' src/ dist/

# Source files link with "?v=__V__"; replace the placeholder with this build's stamp.
# (sed -i '' is the macOS form.)
find dist -type f \( -name '*.html' -o -name '*.js' -o -name '*.css' \) \
  -exec sed -i '' "s/__V__/$V/g" {} +

echo "dist/ built (v=$V)"
