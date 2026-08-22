#!/usr/bin/env bash
# dumps the campushub database out of its container and keeps the last N copies
#
#   ./backup.sh                 writes into ./backups next to this script
#   BACKUP_DIR=/data_pool/... ./backup.sh
#
# the dump is custom format so restore.sh can use pg_restore and stop on the first error
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$HERE/backups}"
KEEP="${KEEP:-14}"
DB_CONTAINER="${DB_CONTAINER:-campushub-db-1}"
DB_USER="${DB_USER:-campushub}"
DB_NAME="${DB_NAME:-campushub}"

stamp="$(date +%Y%m%d-%H%M%S)"
target="$BACKUP_DIR/campushub-$stamp.dump"
mkdir -p "$BACKUP_DIR"

echo "dump  $DB_NAME from $DB_CONTAINER"
# to a temporary name first so a half written file is never mistaken for a backup
docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc > "$target.partial"
mv "$target.partial" "$target"

size="$(du -h "$target" | cut -f1)"
echo "wrote $target ($size)"

# a dump that cannot be read is not a backup so the table of contents is listed every time
if ! docker exec -i "$DB_CONTAINER" pg_restore --list > /dev/null < "$target"; then
  echo "REFUSED: the dump just written cannot be read back" >&2
  exit 1
fi
echo "verified the dump is readable"

# shellcheck disable=SC2012
ls -1t "$BACKUP_DIR"/campushub-*.dump 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
  echo "prune $old"
  rm -f "$old"
done
