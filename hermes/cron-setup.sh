#!/usr/bin/env bash
set -euo pipefail

NAME="career-agency-owner-digest"
SCHEDULE="30 7 * * *"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROMPT="Run node scripts/agency-status.mjs from the repository root. Return its stdout exactly. Do not send or mutate product data."

print_review() {
  printf 'Crontab equivalent: %s cd %q && node scripts/agency-status.mjs | deliver telegram\n' "$SCHEDULE" "$ROOT"
  printf 'Hermes command: hermes cron create %q %q --name %q --deliver telegram --skill career-computa-ops --workdir %q\n' "$SCHEDULE" "$PROMPT" "$NAME" "$ROOT"
}

if [[ "${1:-}" == "--dry-run" ]]; then
  print_review
  exit 0
fi

if hermes cron list --all 2>/dev/null | grep -Fq "$NAME"; then
  printf 'Cron already registered: %s\n' "$NAME"
  print_review
  exit 0
fi

hermes cron create "$SCHEDULE" "$PROMPT" \
  --name "$NAME" \
  --deliver telegram \
  --skill career-computa-ops \
  --workdir "$ROOT"
printf 'Cron registered: %s\n' "$NAME"
print_review
