#!/usr/bin/env bash
# Renders docs/images/*.svg to PNG with headless Chromium, and copies the
# plugin/category icons into the plugin. Run after `npm run render:showcase`.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
# The chromium snap can only read files under ~/snap/chromium/common.
work="${HERDR_PNG_WORKDIR:-$HOME/snap/chromium/common/herdr-png}"
chrome="${CHROMIUM:-chromium}"
mkdir -p "$work"
for svg in "$root"/docs/images/*.svg; do
  name="$(basename "$svg" .svg)"
  read -r w h < <(grep -o 'width="[0-9]*" height="[0-9]*"' "$svg" | head -1 | tr -dc '0-9 ' | awk '{print $1, $2}')
  cp "$svg" "$work/$name.svg"
  printf '<html><body style="margin:0;background:transparent"><img src="%s.svg" style="display:block"></body></html>' "$name" > "$work/$name.html"
  "$chrome" --headless --disable-gpu --hide-scrollbars --default-background-color=00000000 \
    --window-size="$w,$h" --screenshot="$work/$name.png" "file://$work/$name.html" 2>/dev/null
  cp "$work/$name.png" "$root/docs/images/$name.png"
done
imgs="$root/packages/streamdeck-plugin/plugin/imgs"
mkdir -p "$imgs"
cp "$root/docs/images/icon.png" "$imgs/plugin-icon.png"
cp "$root/docs/images/icon@2x.png" "$imgs/plugin-icon@2x.png"
cp "$root/docs/images/category-icon.png" "$imgs/category-icon.png"
cp "$root/docs/images/category-icon@2x.png" "$imgs/category-icon@2x.png"
echo "PNGs in docs/images and $imgs"
