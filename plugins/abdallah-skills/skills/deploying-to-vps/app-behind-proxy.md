# The app behind a self-hosted proxy

Traefik terminates HTTPS. Inside the container the app sees `http://0.0.0.0:3000`. Vercel hid all
of this; on a VPS it breaks things that worked.

## Dockerfile hardening

Builds run on the server's network, which is less reliable than a CI provider's. Each of these
failed a real build:

```dockerfile
FROM node:<lts>-alpine AS base
# Containers often have no IPv6 route while DNS returns AAAA records.
ENV NODE_OPTIONS=--dns-result-order=ipv4first
# In the BASE stage, so every npm command in every stage inherits them (npm ci AND later installs).
ENV NPM_CONFIG_FETCH_RETRIES=6 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000 \
    NPM_CONFIG_MAXSOCKETS=6

# ... deps, build stages ...

FROM base AS runner
RUN addgroup -g 1001 nodejs && adduser -u 1001 -G nodejs -D nextjs
# Create the FULL cache path owned by the app user before anything is mounted into it.
RUN mkdir -p /app/.next/cache/images && chown -R nextjs:nodejs /app/.next
USER nextjs
```

- **Self-host fonts** with `next/font/local` (same woff2 files, subsets, preloads). `next/font/google`
  downloads during the build with its own fetcher, ignores `NODE_OPTIONS`, and fails
  intermittently ("Module not found … font/google"). Prove it: build with outbound HTTP blocked.
- **`ECONNRESET` in npm** at any step → the base-stage ENV above, not a retry flag on one command.
- Test network theories **from the server**, not your laptop:
  `docker run --rm curlimages/curl -4 …` vs `-6`, repeated; MTU with `ping -M do -s 1472`.

**The mount trap.** Mounting a *subfolder* (`/app/.next/cache/images`, to keep resized images across
deploys) makes Docker create the missing parents as **root**. The app can no longer write
`.next/cache/fetch-cache`, so every ISR/fetch cache write fails and pages re-render from the DB.
Symptom: pages slow, logs full of `EACCES … mkdir '/app/.next/cache/fetch-cache'`. Create the path
in the Dockerfile (above), chown the host folder to the uid, and **grep the logs for `EACCES` after
adding any mount**. Hotfix: `docker exec -u 0 <c> chown nextjs:nodejs /app/.next/cache`.

The image cache grows with every size × format; clean it monthly by access time —
[templates/image-cache-cleanup.sh](templates/image-cache-cleanup.sh). Deleting it is always safe.

## Proxy-aware origins

```ts
// The public origin as the browser sees it — never request.url behind a proxy.
export function publicOrigin(req: Request): string {
  const h = req.headers;
  const proto = h.get('x-forwarded-proto')?.split(',')[0].trim() ?? 'https';
  const host = h.get('x-forwarded-host')?.split(',')[0].trim() ?? h.get('host');
  return `${proto}://${host}`;
}
```

- **Same-origin / CSRF checks** comparing `Origin` (`https://site`) to `request.url` (`http://0.0.0.0`)
  refuse every legitimate request. Compare to `publicOrigin(req)`.
- **Absolute redirects** built with `new URL(path, request.url)` send the browser to
  `https://0.0.0.0:3000/...`. Build them from `publicOrigin(req)`. Middleware/proxy redirects that
  stay relative are fine.
- **Before going live: grep route handlers for `request.url` / `req.url`.**
- Reproduce from the signed-in browser tab (`fetch('/route', {method: 'POST', body: new FormData()})`);
  an anonymous curl hits the auth guard first and proves nothing.

## Edge-cacheable pages

- **No cookie on public pages.** One stray `Set-Cookie` makes Cloudflare refuse to cache the page. The
  usual culprit is an i18n library writing a locale cookie when the language already comes from the
  URL (next-intl: `localeCookie: false`). Check: `curl -sI <url> | grep -i set-cookie` → nothing.
- **Purge on save, env-gated.** On every admin save, purge **all public URLs** (one request per 100),
  not a targeted guess — one missed dependency is a silently stale page. Run it after the response
  (`after()`), never failing the save; **repeat ~10 s later** (a request in flight during the save
  may be stored after the first purge); retries with backoff, then a prefix purge as fallback.
  Purge again on server start (+20 s, +2 min: pages from the old build name old chunks).
- **Re-warm after the last purge** of a cycle: GET the key pages like a first visit (no cookies, no
  RSC headers, `Accept: text/html`), a few at a time, so no visitor pays the slow first load.
- **Nightly backstop**: a scheduled task runs the full purge + warm, bounding staleness if a purge
  was lost.
- **Gate on env** (`CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_PURGE_TOKEN`, optional hosts list): unset
  locally, in CI and on other hosts → nothing is sent; log once at start that purge is off.
- **Prefix purges are rate-limited per account** (shared by staging and production): queue and merge
  them, at most one per ~30 s per process.

Cache rules and purge tokens: [cloudflare.md](cloudflare.md).

## Coming-soon mode

For a live domain whose content isn't real yet:

- An env flag (`COMING_SOON=1`, runtime) makes the request proxy/middleware **rewrite** (not
  redirect) every public URL to one minimal page, sent with `noindex`.
- **Bypass for admins:** a request carrying the auth session cookie sees the real site. Cloudflare
  never caches cookie requests, so admins and visitors don't mix. Not a security boundary.
- Never touch `/admin`, `/api` (health, cron, auth), `/_next`, static files, `robots.txt`,
  `sitemap.xml`.
- Turning it off is one Redeploy (with the domain set back to Indexable) — the deploy purge clears
  the cached coming-soon copies.

## Health endpoint

`/api/health`: runs one cheap DB query, answers `200 {"status":"ok"}` or `503`, sends `no-store`,
and is excluded from every cache rule. Coolify's health check and the uptime monitor both use it.
