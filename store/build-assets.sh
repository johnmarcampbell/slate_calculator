#!/usr/bin/env bash
# Regenerates all Chrome Web Store assets (icons, screenshots, promo tile).
# Requires Google Chrome. Run from the repo root: bash store/build-assets.sh
set -euo pipefail

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STORE="$ROOT/store"
OUT="$STORE/assets"
mkdir -p "$ROOT/icons" "$OUT"

shoot() { # url, width, height, out
  "$CHROME" --headless --disable-gpu --hide-scrollbars \
    --default-background-color=00000000 \
    --window-size="$2,$3" --screenshot="$4" "$1" 2>/dev/null
}

# --- Extension icons (transparent background) ---
for s in 16 32 48 128; do
  shoot "file://$STORE/icon.html?size=$s" "$s" "$s" "$ROOT/icons/icon$s.png"
done
# Icon badge used inside the screenshot frame and promo tile — rendered
# large so it stays crisp when the pages are captured at 2x scale
shoot "file://$STORE/icon.html?size=256" 256 256 "$STORE/icon_badge.png"

# --- popup_shot.html: real popup.html with paths rewritten and the
#     chrome.storage shim injected before any extension script runs ---
sed -E \
    -e 's|href="styles.css"|href="../styles.css"|' \
    -e 's|<script src="lib/jsep.iife.min.js"></script>|<script src="shot-shim.js"></script>\n    <script src="../lib/jsep.iife.min.js"></script>|' \
    -e 's#<script src="(evaluator|history|settings|formatter|grapher|popup)\.js"></script>#<script src="../\1.js"></script>#' \
    "$ROOT/popup.html" > "$STORE/popup_shot.html"

# --- Store screenshots: rendered at 2x (2560x1600), downscaled to 1280x800 ---
for scene in calc graph light; do
  "$CHROME" --headless --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=2 \
    --window-size=1280,800 --screenshot="$OUT/screenshot-$scene.png" \
    "file://$STORE/shot.html?scene=$scene" 2>/dev/null
  sips -z 800 1280 "$OUT/screenshot-$scene.png" --out "$OUT/screenshot-$scene.png" >/dev/null
done

# --- Small promo tile (440x280), rendered at 2x then downscaled ---
"$CHROME" --headless --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=2 \
  --window-size=440,280 --screenshot="$OUT/promo-tile-small.png" \
  "file://$STORE/tile.html" 2>/dev/null
sips -z 280 440 "$OUT/promo-tile-small.png" --out "$OUT/promo-tile-small.png" >/dev/null

# --- Marquee promo tile (1400x560), rendered at 2x, downscaled, and
#     saved as JPEG (the store requires no alpha channel for promo tiles) ---
"$CHROME" --headless --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=2 \
  --window-size=1400,560 --screenshot="$OUT/promo-marquee.png" \
  "file://$STORE/marquee.html" 2>/dev/null
sips -z 560 1400 "$OUT/promo-marquee.png" --out "$OUT/promo-marquee.png" >/dev/null
sips -s format jpeg -s formatOptions 92 "$OUT/promo-marquee.png" --out "$OUT/promo-marquee.jpg" >/dev/null
rm -f "$OUT/promo-marquee.png"

# --- Store icon (the listing's icon field wants exactly 128x128) ---
cp "$ROOT/icons/icon128.png" "$OUT/store-icon-128.png"

echo "Icons written to icons/, store images to store/assets/"
