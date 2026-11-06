# Object storage, email, backups, monitoring

## Object storage (Cloudflare R2)

- Enabling R2 needs a card even on the free tier. **Set a budget alert ($1).** Class A = writes and
  lists, Class B = reads, egress free. Surprise bills come from tools listing buckets every few
  minutes, not from websites.
- **Two buckets:** `<app>-uploads` (public through a custom domain) and `<app>-backups` (private).
  Region next to the server.
- **One account API token per bucket**, Object Read & Write, scoped to that bucket only. Keys are
  shown once → local `chmod 600` file. **Test each key:** write + delete on its own bucket works, the
  other bucket is refused.
- **Public files need a custom domain** (`files.example.com`), which needs the zone on Cloudflare.
  `r2.dev` is rate-limited, testing only. Min TLS 1.2; Cloudflare adds the CNAME.
- **CORS** for presigned browser uploads: origins (apex, `www`, staging), methods PUT/GET/HEAD, header
  `content-type`, expose `ETag`. Reopen and check it saved.
- The public files URL feeds `images.remotePatterns` → it is **build-time**: changing it = redeploy.
- **Verify end to end:** upload with the site's key → public GET via the custom domain → CORS
  preflight from the site origin (204) → delete; `/_next/image?url=<files-domain>/…` works while an
  unknown host is refused (400).

**Migrating files from another store** (Vercel Blob, S3):

1. Backup the DB first. Dry run, then apply: copy each object and rewrite its DB URL.
2. **Land files inside the paths the app's image allow-list expects** (e.g. `uploads/**`). Keeping
   the source keys (`seed/...`) gives `/_next/image` **400 "url parameter is not allowed"**.
3. **Redeploy without cache** — prerendered pages still hold the old URLs.
4. Request a resized version of **every** migrated image through the optimizer and look for 400s.
   SVGs aren't optimized and won't show the problem.

## Transactional email (Resend)

- The client's mailboxes stay where they are. Resend only sends the site's automatic emails.
- **Manual domain setup** (not auto-configure) so you see every record. **Receiving off** — it would
  need the root MX, which belongs to the existing mail. Tracking off.
- Its records live on **subdomains only** (`resend._domainkey` TXT, `send` MX/TXT or CNAMEs per the
  dashboard) — nothing of the existing mail changes. The dashboard truncates values: use its copy
  buttons, then check the records byte for byte on the nameserver.
- API key with **Sending access** only. The same key can serve the panel's alert emails and the backup
  failure email.
- The sender (`notifications@…`) is not a mailbox: set **Reply-To to the visitor's email** on lead
  notifications, or "Reply" bounces.
- **Test to an inbox:** submit the real form → the email arrives in the inbox (not spam), status
  Delivered, and its link opens the right record in the admin. Watch the daily limit at launch;
  fallback is SMTP through the client's own mailbox.

## Backups

The server should be nearly stateless (code in git, DB managed, files in object storage). What still
needs a nightly copy: **the database** and **the panel** (Coolify's DB + `/data/coolify/source/.env`).

[templates/backup.sh](templates/backup.sh), run by a systemd timer:

- `pg_dump --format=custom` with the app container's own direct (unpooled) DB URL, so it follows the
  panel's env. **Client major version = server major** (`postgres:<major>-alpine`); an older
  `pg_dump` refuses a newer server.
- Check the dump with `pg_restore --list` (table count above a floor) before uploading.
- Upload with the `rclone` Docker image to the private bucket; compare remote and local size.
- **Retention:** keep N days in the bucket, fewer on disk; each run deletes only files older than N.
  Never "replace last night's" — one bad night would overwrite the only good copy.
- **On failure, email** through the app's own mail key (read from the container), so there is no extra
  service or account.
- A sourced env file needs **quotes** around values with `<`, `>` or spaces
  (`ALERT_FROM="Server <sender-address>"`) or the service fails with "syntax error near newline".

```ini
# /etc/systemd/system/app-backup.timer
[Timer]
OnCalendar=*-*-* 02:30
Persistent=true
[Install]
WantedBy=timers.target
```

**Prove it by restoring** — once at setup and after any change to the script:

```bash
# download from the BUCKET (not the local copy), then:
docker run -d --name restore-test -e POSTGRES_PASSWORD=x postgres:<major>-alpine
# wait for the SECOND "ready to accept connections" — the image restarts once after initdb
docker cp <dump> restore-test:/tmp/db.dump
docker exec restore-test pg_restore -U postgres -d postgres --no-owner /tmp/db.dump
```

Then compare **every table's row count** with live (`query_to_xml('select count(*) from …')` over
`information_schema.tables` on both sides). Remove the container afterwards.

Also: the managed DB's own point-in-time restore, and a **provider snapshot before big changes**.
Coolify restore = reinstall, restore its DB dump into `coolify-db`, put the `.env` back (its
`APP_KEY` decrypts the stored secrets).

## Monitoring

- **Uptime monitor** (UptimeRobot free, 5 min) on **`/api/health`**: never cached, queries the DB.
  The home page would keep answering from the edge cache while the server is down.
- **Panel alert emails** (deploy failed, scheduled task failed, backup failed, disk, unreachable).
- **Metrics** (Coolify Sentinel) for CPU/memory/disk history.
- Optional: error tracking (Sentry) — only on the owner's go.

Don't over-build: one monitor, the panel alerts, the backup failure email, and a monthly look at disk
and the cache hit ratio cover a single-server site.
