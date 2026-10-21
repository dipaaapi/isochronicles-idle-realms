#!/usr/bin/env sh
# Regenerate animated battle-skill and Kirov airship sheets plus Phaser/Aseprite metadata.
set -e
cd "$(dirname "$0")/../.."
A="${ASEPRITE:-aseprite}"
if ! command -v "$A" >/dev/null 2>&1; then
  A="/c/Program Files (x86)/Steam/steamapps/common/Aseprite/Aseprite.exe"
fi
mkdir -p public/skills art/skills
for effect in poison-smoke bone-cage kirov kirov-ordnance caterpillar-skills parachute projectiles fire; do
  "$A" -b --script-param out="art/skills/$effect.aseprite" --script "art/skills/$effect.lua"
  "$A" -b "art/skills/$effect.aseprite" --sheet "public/skills/$effect.png" --data "public/skills/$effect.json" \
    --format json-array --sheet-type rows --list-tags --filename-format "{tag}-{tagframe}"
done
