#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Updating source..."
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  if [[ "$BRANCH" == "HEAD" ]]; then
    git pull --rebase origin
  else
    git pull --rebase origin "$BRANCH"
  fi
else
  echo "Not a git repository; skipping git pull."
fi

echo "Rebuilding containers..."
docker compose up -d --build

echo "Cleaning old images..."
docker image prune -f

echo "Done."
