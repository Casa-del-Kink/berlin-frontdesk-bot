#!/usr/bin/env bash
set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-dicxsxmdyjleigelwaya}"
DB_HOST="db.${PROJECT_REF}.supabase.co"
DB_NAME="${SUPABASE_DB_NAME:-postgres}"
DB_USER="${SUPABASE_DB_USER:-postgres}"
DB_PORT="${SUPABASE_DB_PORT:-5432}"

load_db_env_file() {
  local file="$1"
  [[ -f "$file" ]] || return 0

  local line key value
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ -z "$line" || "$line" == \#* || "$line" != *=* ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
      value="${value:1:${#value}-2}"
    fi
    case "$key" in
      DATABASE_URL|POSTGRES_URL|SUPABASE_DB_PASSWORD|PGSSL)
        export "${key}=${value}"
        ;;
    esac
  done < "$file"
}

load_db_env_file "${SUPABASE_POSTGRES_ENV_FILE:-.env}"

if [[ -z "${SUPABASE_DB_PASSWORD:-}" && -z "${DATABASE_URL:-}" && -z "${POSTGRES_URL:-}" ]]; then
  printf '%s\n' \
    "SUPABASE_POSTGRES_SMOKE_FAILED" \
    "Missing database credentials." \
    "Set either:" \
    "  SUPABASE_DB_PASSWORD='***'" \
    "or:" \
    "  DATABASE_URL='postgresql://postgres:***@${DB_HOST}:${DB_PORT}/${DB_NAME}'" \
    "" \
    "Do not commit either value." >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" && -z "${POSTGRES_URL:-}" ]]; then
  ENCODED_PASSWORD="$(SUPABASE_DB_PASSWORD="${SUPABASE_DB_PASSWORD}" python3 - <<'PY'
import os
from urllib.parse import quote
print(quote(os.environ["SUPABASE_DB_PASSWORD"], safe=""))
PY
)"
  export DATABASE_URL="postgresql://${DB_USER}:${ENCODED_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
fi

export PGSSL="${PGSSL:-true}"
exec npm run postgres:smoke
