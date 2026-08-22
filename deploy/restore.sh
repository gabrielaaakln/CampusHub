#!/usr/bin/env bash
# puts a dump back over the campushub database
#
#   ./restore.sh backups/campushub-20260806-120000.dump
#
# the application must be stopped first or prisma will hold connections and the drop fails
set -euo pipefail

DUMP="${1:-}"
DB_CONTAINER="${DB_CONTAINER:-campushub-db-1}"
DB_USER="${DB_USER:-campushub}"
DB_NAME="${DB_NAME:-campushub}"

if [[ -z "$DUMP" || ! -f "$DUMP" ]]; then
  echo "usage: $0 <fisier.dump>" >&2
  exit 1
fi

echo "about to overwrite $DB_NAME in $DB_CONTAINER with $DUMP"
if [[ "${ASSUME_YES:-no}" != "yes" ]]; then
  read -r -p "type the database name to confirm: " typed
  [[ "$typed" == "$DB_NAME" ]] || { echo "aborted"; exit 1; }
fi

# other sessions keep the database alive and DROP would wait forever behind them
docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();"

docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS $DB_NAME;" \
  -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"

# --exit-on-error so a half restored database is never mistaken for a working one
docker exec -i "$DB_CONTAINER" pg_restore -U "$DB_USER" -d "$DB_NAME" --no-owner --exit-on-error < "$DUMP"

echo "restored, checking that the data is actually there"
docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -A -c \
  "SELECT 'users=' || (SELECT count(*) FROM users)
       || ' rooms=' || (SELECT count(*) FROM rooms)
       || ' schedule=' || (SELECT count(*) FROM schedule_entries)
       || ' posts=' || (SELECT count(*) FROM forum_posts);"
echo "start the application again"
