#!/usr/bin/env bash
# Starts Backstage loading .env and exposing the TechDocs Python venv on PATH.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
else
  echo "Warning: .env not found. Copy .env.example to .env and fill it in." >&2
fi

TECHDOCS_VENV="${TECHDOCS_VENV:-$HOME/.venvs/techdocs}"
if [ -x "$TECHDOCS_VENV/bin/mkdocs" ]; then
  export PATH="$TECHDOCS_VENV/bin:$PATH"
else
  echo "Warning: mkdocs not found in $TECHDOCS_VENV. TechDocs generation will fail." >&2
fi

exec yarn start "$@"
