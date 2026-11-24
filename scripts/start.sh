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

if [ -z "${DOCS_STUDIO_REPOSITORY:-}" ]; then
  echo "Notice: DOCS_STUDIO_REPOSITORY is not set; using the default demo docs repository (private)." >&2
  echo "        Set it in .env to <owner>/<repo> of your own docs repository." >&2
fi

ORG_LOCAL=examples/docs-studio/org.local.yaml
if [ ! -f "$ORG_LOCAL" ]; then
  cp examples/docs-studio/org.example.yaml "$ORG_LOCAL"
  echo "Notice: created $ORG_LOCAL from org.example.yaml." >&2
  echo "        Replace the REPLACE_ME values (Entra object IDs, emails, logins) before signing in with Microsoft." >&2
fi

TECHDOCS_VENV="${TECHDOCS_VENV:-$HOME/.venvs/techdocs}"
if [ -x "$TECHDOCS_VENV/bin/mkdocs" ]; then
  export PATH="$TECHDOCS_VENV/bin:$PATH"
else
  echo "Warning: mkdocs not found in $TECHDOCS_VENV. TechDocs generation will fail." >&2
fi

exec yarn start "$@"
