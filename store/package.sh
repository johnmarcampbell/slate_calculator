#!/usr/bin/env bash
# Builds the Chrome Web Store upload zip containing only runtime files.
# Run from the repo root: bash store/package.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="$(node -p "require('./manifest.json').version")"
OUT="dist/slate-calculator-v$VERSION.zip"

mkdir -p dist
rm -f "$OUT"

zip -X "$OUT" \
  manifest.json \
  popup.html \
  styles.css \
  evaluator.js \
  formatter.js \
  grapher.js \
  history.js \
  settings.js \
  popup.js \
  lib/jsep.iife.min.js \
  icons/icon16.png \
  icons/icon32.png \
  icons/icon48.png \
  icons/icon128.png

# Refresh the loadable copy for local development. The repo root can't be
# loaded unpacked because Chrome reserves names starting with "_" and
# rejects the __tests__ directory; dist/unpacked contains runtime files only.
rm -rf dist/unpacked
unzip -q "$OUT" -d dist/unpacked

echo ""
echo "Package ready: $OUT"
echo "Unpacked copy for chrome://extensions -> Load unpacked: dist/unpacked"
unzip -l "$OUT"
