#!/usr/bin/env bash
# Applique la migration LLM sur bughunt UNIQUEMENT (Session pooler IPv4).
# Usage: BUGHUNT_DB_PASSWORD='…' ./scripts/apply-llm-migration-bughunt.sh
set -euo pipefail

BUGHUNT_REF="dkcfcifsrnnaqaipfuzi"
PROD_REF="woawmhuntajpiezmmgzm"
POOLER_HOST="aws-0-eu-west-1.pooler.supabase.com"
MIGRATION="supabase/migrations/20260613131601_c8a88d10-524b-48a3-9186-a740162bc08c.sql"

if [[ -z "${BUGHUNT_DB_PASSWORD:-}" ]]; then
  echo "❌ BUGHUNT_DB_PASSWORD manquant (mot de passe DB bughunt, jamais prod)." >&2
  exit 1
fi

if [[ "${SUPABASE_URL:-}" == *"$PROD_REF"* ]]; then
  echo "❌ ABORT: SUPABASE_URL pointe la PROD." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SQL_FILE="$ROOT/$MIGRATION"
if [[ ! -f "$SQL_FILE" ]]; then
  echo "❌ Fichier migration introuvable: $SQL_FILE" >&2
  exit 1
fi

export PGPASSWORD="$BUGHUNT_DB_PASSWORD"
PSQL_USER="postgres.${BUGHUNT_REF}"

echo "→ Application migration LLM sur bughunt (${BUGHUNT_REF}) via ${POOLER_HOST}…"

psql \
  "host=${POOLER_HOST} port=5432 dbname=postgres user=${PSQL_USER} sslmode=require" \
  -v ON_ERROR_STOP=1 \
  -f "$SQL_FILE"

# Vérification tables
psql \
  "host=${POOLER_HOST} port=5432 dbname=postgres user=${PSQL_USER} sslmode=require" \
  -v ON_ERROR_STOP=1 \
  -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('llm_usage','llm_cache') ORDER BY 1;"

echo "✅ Migration LLM terminée."
