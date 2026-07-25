#!/usr/bin/env bash
# Push pending Supabase migrations to the linked remote (bughunt in CI).
# - Streams CLI output (no silent capture)
# - Retries once on transient CLI/telemetry failures (PostHog shutdown, etc.)
# - Surfaces a clear error when remote history is ahead of this commit's files
set -euo pipefail

if [[ -z "${SUPABASE_PROJECT_ID:-}" ]]; then
  echo "::error::SUPABASE_PROJECT_ID is required"
  exit 1
fi

supabase link --project-ref "$SUPABASE_PROJECT_ID"

is_remote_ahead() {
  grep -q "Remote migration versions not found" <<<"$1"
}

is_transient_cli_noise() {
  # Supabase CLI sometimes exits non-zero with only telemetry shutdown noise
  # and no migration error (seen as "Timeout while shutting down PostHog").
  grep -qiE 'Timeout while shutting down PostHog|Try rerunning the command with --debug' <<<"$1" \
    && ! grep -qiE 'ERROR:|Error:|Remote migration|duplicate key|conflict|permission denied|password authentication' <<<"$1"
}

for attempt in 1 2; do
  log="$(mktemp)"
  echo "::group::supabase db push (attempt ${attempt})"
  set +e
  supabase db push --include-all --yes 2>&1 | tee "$log"
  RC=${PIPESTATUS[0]}
  set -e
  echo "::endgroup::"
  OUT="$(cat "$log")"
  rm -f "$log"

  if [[ "$RC" -eq 0 ]]; then
    echo "db push succeeded (attempt ${attempt})"
    exit 0
  fi

  if is_remote_ahead "$OUT"; then
    echo "::error::Bughunt has migration version(s) missing from this commit's supabase/migrations/. Common causes: (1) Lovable merge/revert deleted an already-applied migration file — restore it from git history; (2) schema ahead of this SHA — rebase/re-run on latest main. Do NOT run 'supabase migration repair' from CI."
    exit 1
  fi

  if [[ "$attempt" -eq 1 ]] && is_transient_cli_noise "$OUT"; then
    echo "::warning::db push failed with transient Supabase CLI/telemetry noise — retrying once"
    sleep 3
    continue
  fi

  echo "::error::supabase db push failed (exit ${RC}). See log above."
  exit "$RC"
done

exit 1
