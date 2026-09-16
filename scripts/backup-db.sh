#!/bin/bash
# Daily PostgreSQL backup for the TenderAI Docker Compose deployment.
# Dumps the `tender_db` database from the `tender_postgres` container,
# compresses it, and prunes backups older than RETENTION_DAYS.
#
# Intended to run via cron on the host (outside the container), e.g.:
#   0 3 * * * /opt/Tender/scripts/backup-db.sh >> /var/log/tender-db-backup.log 2>&1

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/backups/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
CONTAINER="${CONTAINER:-tender_postgres}"
DB_NAME="${DB_NAME:-tender_db}"
DB_USER="${DB_USER:-postgres}"
TIMESTAMP="$(date +%Y-%m-%d_%H%M%S)"
DEST="${BACKUP_DIR}/tender_db_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[$(date -Iseconds)] Starting backup of ${DB_NAME} from ${CONTAINER} -> ${DEST}"

docker exec "$CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$DEST"

if [ ! -s "$DEST" ]; then
  echo "[$(date -Iseconds)] ERROR: backup file is empty, removing and failing" >&2
  rm -f "$DEST"
  exit 1
fi

SIZE=$(du -h "$DEST" | cut -f1)
echo "[$(date -Iseconds)] Backup complete: ${DEST} (${SIZE})"

# Prune backups older than RETENTION_DAYS
find "$BACKUP_DIR" -name 'tender_db_*.sql.gz' -type f -mtime "+${RETENTION_DAYS}" -print -delete

echo "[$(date -Iseconds)] Retention cleanup done (keeping last ${RETENTION_DAYS} days)"
