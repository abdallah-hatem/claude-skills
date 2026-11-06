---
name: deploying-to-vps
description: Use when self-hosting a web app on a VPS with Coolify or Docker behind Cloudflare — choosing the server, hardening it, deploying, moving DNS, edge caching, object storage, email, backups, monitoring, launch — or when a self-hosted deploy, panel, certificate, cache purge or redirect misbehaves.
---

# Deploying to a VPS

## Overview

A managed platform hides five things a VPS hands back to you: the edge network, the HTTPS proxy in
front of the app, the firewall, backups, and the database sitting next to the code. Every expensive
failure on a VPS is one of those five showing up unannounced — **the app is fine and the platform
contract changed**.

The second rule: **verify every "done" against real state.** A deploy click that didn't register, a
restart that didn't restart, a purge that answered `success` and cleared nothing, an SSL mode that
saved as a different option. After each step, read the actual state: a deployment row, a `dig`
answer, a response header, a container's start time.

Written for a Next.js app (+ Prisma/Postgres, object storage, transactional email) on Coolify,
Traefik and Cloudflare. The rules carry to any Docker app behind a reverse proxy.

## Choosing: VPS or Vercel

| Question | VPS fits when | Vercel fits when |
|---|---|---|
| Cost | One flat server bill matters more than ops time | Hobby/Pro limits are comfortable |
| Audience far from the server | Only with a CDN (Cloudflare proxy) **from day one** | Edge is built in |
| Pages cacheable at the edge | Public pages, few logged-in users — see [cloudflare.md](cloudflare.md) | Either |
| Admin / logged-in pages | The server is in the **same region as the database** | Functions sit next to the DB |
| Long-running work, cron, disk | Needed | Avoid |

- **Put the server in the database's region**, or the database on the server. Uncacheable pages pay
  the round trip once per *sequential* query: 8 ms × 7 awaits in a row is felt on every click.
- A CDN fixes public pages and static files. It cannot fix admin pages — reduce query **depth**
  instead (`Promise.all`, not `$transaction([...])`, which is sequential) and add a `loading.tsx`.
- **Shared hosting (cPanel) can't run a Next.js server.** Keep it for the domain and mailboxes only.
- Size: 4 vCPU / 8 GB / 100 GB holds Coolify, Traefik and one Next.js app with room for builds.
  Start on a **monthly** term: providers don't allow downgrades.
- Sharing one server with another person: they get a Coolify account scoped to their project, never
  root.

## The order that works

1. **Server** — reinstall with SSH key only, sudo user, ufw, fail2ban, unattended upgrades, verify
   password auth is really off → [server.md](server.md)
2. **Docker, then the panel lock, then Coolify** — Docker bypasses ufw → [server.md](server.md)
3. **App build** — Dockerfile hardening and proxy-aware code → [app-behind-proxy.md](app-behind-proxy.md)
4. **Storage, email** — buckets, scoped keys, CORS, sending domain → [services.md](services.md)
5. **DNS to Cloudflare** — every record DNS-only, compared record by record → [cloudflare.md](cloudflare.md)
6. **HTTPS subdomain for staging**, noindex, test the production setup on it
7. **Backups proven by a restore, monitors, alerts** → [services.md](services.md)
8. **Launch day** in its fixed order, then SEO checks → [launch.md](launch.md)

Templates (placeholders only; fill in and install with a systemd unit):
[templates/panel-lock.sh](templates/panel-lock.sh) ·
[templates/backup.sh](templates/backup.sh) ·
[templates/image-cache-cleanup.sh](templates/image-cache-cleanup.sh). Run them as
`sudo bash <script>`.

## Traps worth knowing before you start

| Trap | Rule |
|---|---|
| Docker publishes ports straight past ufw | Lock the panel in iptables `DOCKER-USER` with `--ctdir ORIGINAL`, IPv4 and IPv6 |
| Cloud-init drop-in re-enables SSH passwords | Read `sshd -T`, not `sshd_config` |
| Coolify's first sign-up claims the admin, 10-minute window | Claim it the moment the installer finishes |
| Env var changed, app unchanged | **Redeploy**, not Restart; confirm the container's start time |
| Data changed that prerendered pages contain | **Redeploy without cache** — the same commit reuses the build layer |
| Behind Traefik `request.url` is `http://0.0.0.0:3000` | Build origins and redirects from `X-Forwarded-*` |
| Any `Set-Cookie` on a page | Cloudflare won't cache it — find and remove the stray cookie first |
| Cache rule matches `GET HEAD` only | URL purge returns `success` and clears nothing — add `PURGE` |
| Purge token IP filter has the IPv4 only | Random `10000 Authentication error` — add the server's IPv6 |
| CNAMEs pointing at the apex (`mail`) | Repoint them before moving the apex, or mail moves too |
| A backup never restored | Not a backup — restore into a throwaway DB and compare row counts |
| Uptime monitor on the home page | Cloudflare answers from cache while the server is down — monitor `/api/health` |

The full symptom → cause → fix table: [troubleshooting.md](troubleshooting.md).

## Working with Claude on a server

- **Secrets never pass through a web form typed by Claude.** Claude writes values into a local
  `chmod 600` env file and puts it on the clipboard; the owner pastes into the panel and saves;
  Claude then verifies variable **names and flags** (from the panel's DB or `docker exec … env`),
  never values.
- **The owner's steps:** account sign-ups and sign-ins, passkeys, card details, claiming the panel
  admin, deleting DNS records, deleting backups. Claude can edit DNS records with manual approval
  but can't delete them.
- **Auto mode refuses** firewall changes, DNS proxy changes, reinstalls, `git push` and resources
  the owner didn't name. Switch that one step to manual, get the approval, switch back.
- **Log every problem → fix as it happens** in a git-ignored lessons file, and keep a `SERVER.md`
  with what is configured and why, **no secret values** — only where each secret lives.
- Scripts that run in the background: write them to a file and `bash -n` them; inline command
  strings break on quoting. Close browser tabs and stop helper processes after each step.

## Common Mistakes

- **Waiting on a deploy that never started.** Confirm a new row in the deployment history first.
- **Testing a proxy change through the local DNS cache.** `curl --resolve host:443:<cf-ip>`.
- **Concluding a DNS record failed** 10 s after adding it. Poll the authoritative nameserver for ~30 s.
- **Connecting with `StrictHostKeyChecking=no` as a habit.** It hides a real man-in-the-middle the
  same way it hides a reinstall.
- **Trusting the dashboard after save.** Reopen the page; some selections need a second try.
- **Fixing data directly in the DB** and expecting pages to change. Pages and caches refresh through
  the app's save path: re-save in the admin, or rebuild without cache.
