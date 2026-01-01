#!/usr/bin/env bash
set -euo pipefail

# Simple backup helper for cron/systemd timers
# Usage: DB_PATH=/opt/habit-tracker/data/tracker.db /opt/habit-tracker/scripts/backup.sh

DB_PATH=${DB_PATH:-/opt/habit-tracker/data/tracker.db}
BACKUP_DIR="$(dirname "$DB_PATH")/backups"
TIMESTAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
BASENAME="tracker-${TIMESTAMP}.db"
TARGET="${BACKUP_DIR}/${BASENAME}"
RETENTION=${RETENTION:-14} # number of most-recent backups to keep

mkdir -p "$BACKUP_DIR"

cp "$DB_PATH" "$TARGET"
echo "✓ Backup created: $TARGET"

# prune old backups beyond retention
mapfile -t backups < <(ls -1t "$BACKUP_DIR"/tracker-*.db 2>/dev/null || true)
if (( ${#backups[@]} > RETENTION )); then
  for old in "${backups[@]:RETENTION}"; do
    rm -f "$old"
    echo "✓ Removed old backup: $(basename "$old")"
  done
fi
