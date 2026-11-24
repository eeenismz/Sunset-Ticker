#!/bin/sh
# Copies src/ into dist/ (the deploy folder). No compiling, only a copy
# plus a version stamp so browsers and Cloudflare fetch fresh files after a deploy.
set -e
cd "$(dirname "$0")"

V=$(date +%Y%m%d%H%M%S)
# The real Firebase config is kept out of git; on a fresh clone start from the empty
# template (the laptop then works keyboard-only until it is filled in).
if [ ! -f src/shared/firebase-config.js ]; then
  cp src/shared/firebase-config.example.js src/shared/firebase-config.js
  echo "Created src/shared/firebase-config.js from the template: fill it in, then build again."
fi

rm -rf dist
mkdir dist
# shared/fake-db.js is a local test stand-in for Firebase and never ships; neither does the config template.
rsync -a --exclude '.DS_Store' --exclude 'shared/fake-db.js' --exclude 'shared/firebase-config.example.js' src/ dist/

# Source files link with "?v=__V__"; replace the placeholder with this build's stamp.
# (sed -i '' is the macOS form.)
find dist -type f \( -name '*.html' -o -name '*.js' -o -name '*.css' \) \
  -exec sed -i '' "s/__V__/$V/g" {} +

echo "dist/ built (v=$V)"
