#!/usr/bin/env sh
# Regenerates the water art with Aseprite (headless) for every biome and exports the
# sheets + JSON that Phaser's Aseprite loader reads (public/tiles/).
# Usage: sh art/water/build.sh   (set ASEPRITE=/path/to/aseprite when it is not on PATH)
set -e
cd "$(dirname "$0")/../.."
A="${ASEPRITE:-aseprite}"
command -v "$A" >/dev/null 2>&1 || A="/c/Program Files (x86)/Steam/steamapps/common/Aseprite/Aseprite.exe"
for biome in ocean magma frost astral; do
  for name in water-surface fish; do
    "$A" -b --script-param biome="$biome" --script-param out="art/water/$name-$biome.aseprite" --script "art/water/$name.lua"
    "$A" -b "art/water/$name-$biome.aseprite" --sheet "public/tiles/$name-$biome.png" --data "public/tiles/$name-$biome.json" \
      --format json-array --sheet-type packed --list-tags --filename-format "{tag}-{tagframe}"
  done
done
