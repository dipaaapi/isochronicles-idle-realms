#!/bin/sh
# Re-install when package.json / package-lock.json changed since the image (or last start),
# so the anonymous node_modules volume never goes stale after a dependency update.
set -e
STAMP=/app/node_modules/.deps-hash
HASH=$(cat package.json package-lock.json 2>/dev/null | md5sum | cut -d' ' -f1)
if [ ! -f "$STAMP" ] || [ "$(cat "$STAMP")" != "$HASH" ]; then
  echo "[entrypoint] dependencies changed, running npm install..."
  npm install --no-audit --no-fund
  echo "$HASH" > "$STAMP"
fi
exec "$@"
