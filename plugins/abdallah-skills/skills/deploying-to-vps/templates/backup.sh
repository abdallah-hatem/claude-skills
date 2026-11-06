#!/bin/bash
# Nightly backup: the app's Postgres database + Coolify (its DB and /data/coolify/source/.env),
# uploaded to a private object-storage bucket, size-checked, with retention, and a failure email
# sent through the app's own transactional-mail key.
# Install: /usr/local/sbin/app-backup.sh, run by app-backup.service + app-backup.timer.
# Credentials: /etc/app-backup.env (root, chmod 600), sourced below. QUOTE values that contain
# spaces, < or > (ALERT_FROM="Server <sender-address>") or sourcing fails.
#   R2_BACKUP_ACCESS_KEY_ID, R2_BACKUP_SECRET_ACCESS_KEY  key scoped to the backup bucket only
#   R2_ENDPOINT                                           https://<account-id>.r2.cloudflarestorage.com
#   R2_BACKUP_BUCKET, ALERT_TO, ALERT_FROM
# Prove it works by restoring a downloaded dump into a throwaway Postgres (see services.md).
set -euo pipefail

ENV_FILE=/etc/app-backup.env
DIR=/var/backups/app
APP_FILTER="name=<app-container-name-or-coolify-uuid>"
DB_URL_VAR=DIRECT_URL              # the app's unpooled DB URL, read from the running container
MAIL_KEY_VAR=RESEND_API_KEY
PG_IMAGE="postgres:<server-major>-alpine"   # client major must equal the server's
RCLONE_IMAGE="rclone/rclone:<version>"
MIN_TABLES="<expected-table-count-floor>"
KEEP_REMOTE_DAYS=30
KEEP_LOCAL_DAYS=7
STAMP=$(date +%Y-%m-%d_%H%M)
LOG=/var/log/app-backup.log

# shellcheck disable=SC1090
. "$ENV_FILE"
mkdir -p "$DIR"
exec >>"$LOG" 2>&1
echo "== $(date -Is) backup start"

app_container() { docker ps --filter "$APP_FILTER" --format '{{.Names}}' | head -1; }

alert() {
  local message="$1" container key
  container=$(app_container || true)
  key=$( [ -n "$container" ] && docker exec "$container" printenv "$MAIL_KEY_VAR" 2>/dev/null || true)
  if [ -z "$key" ]; then echo "alert not sent (no mail key): $message"; return; fi
  curl -s -o /dev/null -w "alert email: %{http_code}\n" -X POST https://api.resend.com/emails \
    -H "Authorization: Bearer $key" -H "Content-Type: application/json" \
    --data "$(printf '{"from":"%s","to":["%s"],"subject":"Backup FAILED on %s","text":"%s\\n\\nLog: %s"}' \
      "$ALERT_FROM" "$ALERT_TO" "$(hostname)" "$message" "$LOG")" || true
}

fail() { echo "FAILED: $1"; alert "Nightly backup failed at $(date -Is): $1"; exit 1; }
trap 'fail "line $LINENO exited with an error"' ERR

rclone() {
  docker run --rm -v "$DIR:/data" \
    -e RCLONE_CONFIG=/dev/null -e RCLONE_CONFIG_R2_TYPE=s3 -e RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
    -e RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_BACKUP_ACCESS_KEY_ID" \
    -e RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_BACKUP_SECRET_ACCESS_KEY" \
    -e RCLONE_CONFIG_R2_ENDPOINT="$R2_ENDPOINT" -e RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true \
    "$RCLONE_IMAGE" "$@"
}

# 1. Application database
container=$(app_container)
[ -n "$container" ] || fail "app container not running (needed for $DB_URL_VAR)"
db_url=$(docker exec "$container" printenv "$DB_URL_VAR")
db_file="db-$STAMP.dump"
docker run --rm -v "$DIR:/out" "$PG_IMAGE" \
  pg_dump --format=custom --no-owner --no-privileges --file="/out/$db_file" "$db_url"
tables=$(docker run --rm -v "$DIR:/out" "$PG_IMAGE" pg_restore --list "/out/$db_file" | grep -c "TABLE DATA" || true)
[ "$tables" -ge "$MIN_TABLES" ] || fail "database dump looks wrong ($tables tables)"
echo "db: $db_file $(du -h "$DIR/$db_file" | cut -f1), $tables tables"

# 2. Coolify (needed to restore the panel: its DB + the .env whose APP_KEY decrypts stored secrets)
coolify_file="coolify-$STAMP.tar.gz"
tmp=$(mktemp -d)
docker exec coolify-db pg_dump -U coolify --format=custom coolify >"$tmp/coolify-db.dump"
cp /data/coolify/source/.env "$tmp/coolify.env"
tar -czf "$DIR/$coolify_file" -C "$tmp" .
rm -rf "$tmp"
chmod 600 "$DIR"/*
echo "coolify: $coolify_file $(du -h "$DIR/$coolify_file" | cut -f1)"

# Upload, then check both objects exist with the right size
rclone copyto "/data/$db_file" "r2:$R2_BACKUP_BUCKET/db/$db_file"
rclone copyto "/data/$coolify_file" "r2:$R2_BACKUP_BUCKET/coolify/$coolify_file"
for f in "db/$db_file" "coolify/$coolify_file"; do
  remote=$(rclone size --json "r2:$R2_BACKUP_BUCKET/$f" | sed -n 's/.*"bytes":\([0-9]*\).*/\1/p')
  local_size=$(stat -c %s "$DIR/$(basename "$f")")
  [ "$remote" = "$local_size" ] || fail "upload size mismatch for $f ($remote vs $local_size)"
done
echo "uploaded to r2:$R2_BACKUP_BUCKET"

# Retention: each run deletes only files older than N days, never last night's copy
rclone delete --min-age "${KEEP_REMOTE_DAYS}d" "r2:$R2_BACKUP_BUCKET/db/"
rclone delete --min-age "${KEEP_REMOTE_DAYS}d" "r2:$R2_BACKUP_BUCKET/coolify/"
find "$DIR" -type f -mtime +"$KEEP_LOCAL_DAYS" -delete
echo "== $(date -Is) backup ok"
