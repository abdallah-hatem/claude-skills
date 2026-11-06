#!/bin/bash
# Monthly cleanup of Next.js's resized-image cache kept on the host by a directory mount
# (host DIR -> /app/.next/cache/images in the app container), so images aren't resized again after
# every deploy. Removes resized files nobody has read in DAYS days (deleted or replaced images,
# sizes no screen asks for any more), then empty folders. Safe: a removed file is simply resized
# again on its next request. Needs read times on the disk (relatime, the default, is enough).
# Install: /usr/local/sbin/image-cache-cleanup.sh, run by a timer (OnCalendar=*-*-01 04:45).
set -euo pipefail
DIR="/data/<app>/next-image-cache"    # owned by the image's app uid (often 1001)
DAYS=60
LOG=/var/log/image-cache-cleanup.log
exec >>"$LOG" 2>&1
before=$(du -sh "$DIR" | cut -f1)
removed=$(find "$DIR" -type f -atime +"$DAYS" -print -delete | wc -l)
find "$DIR" -mindepth 1 -type d -empty -delete
echo "$(date -Is) removed $removed files unread for $DAYS days; $before -> $(du -sh "$DIR" | cut -f1)"
