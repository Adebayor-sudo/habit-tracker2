#!/bin/bash
# Database maintenance script for Tracker v3.0
# Runs VACUUM, ANALYZE, and cleans up expired sessions

set -e

DB_PATH="${DB_PATH:-/opt/habit-tracker/data/tracker.db}"
LOG_FILE="/var/log/habit-tracker/db-maintenance.log"
BACKUP_DIR="/opt/habit-tracker/backups"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=== Database Maintenance Started ==="

# Check if database exists
if [ ! -f "$DB_PATH" ]; then
    log "ERROR: Database not found at $DB_PATH"
    exit 1
fi

# Get database size before
SIZE_BEFORE=$(du -h "$DB_PATH" | cut -f1)
log "Database size before: $SIZE_BEFORE"

# Cleanup expired sessions
log "Cleaning up expired sessions..."
sqlite3 "$DB_PATH" "DELETE FROM sessions WHERE expires_at < datetime('now');" 2>&1 | tee -a "$LOG_FILE"
DELETED=$(sqlite3 "$DB_PATH" "SELECT changes();")
log "Deleted $DELETED expired sessions"

# Run ANALYZE to update query planner statistics
log "Running ANALYZE..."
sqlite3 "$DB_PATH" "ANALYZE;" 2>&1 | tee -a "$LOG_FILE"

# Run VACUUM to reclaim space
log "Running VACUUM..."
sqlite3 "$DB_PATH" "VACUUM;" 2>&1 | tee -a "$LOG_FILE"

# Get database size after
SIZE_AFTER=$(du -h "$DB_PATH" | cut -f1)
log "Database size after: $SIZE_AFTER"

# Check database integrity
log "Checking database integrity..."
INTEGRITY=$(sqlite3 "$DB_PATH" "PRAGMA integrity_check;")
if [ "$INTEGRITY" = "ok" ]; then
    log "✓ Database integrity: OK"
else
    log "⚠ Database integrity check failed: $INTEGRITY"
    exit 1
fi

log "=== Database Maintenance Completed Successfully ==="
