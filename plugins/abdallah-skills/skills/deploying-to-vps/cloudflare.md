# Cloudflare: DNS, SSL, cache, purge

## Moving DNS without breaking email

The domain stays **registered** where it is; only the **nameservers** move. Mail stays on its
current host. The risk is entirely in records Cloudflare doesn't copy.

1. **Capture the current zone first**, from the old authoritative nameserver:

   ```bash
   NS=<old-ns>; D=example.com
   for n in "" www mail webmail cpanel whm ftp autodiscover autoconfig cpcalendars cpcontacts webdisk \
            _dmarc default._domainkey; do
     host=${n:+$n.}$D
     for t in A AAAA CNAME MX TXT CAA; do
       dig +noall +answer @$NS $t "$host"
     done
   done
   for s in _autodiscover._tcp _caldav._tcp _caldavs._tcp _carddav._tcp _carddavs._tcp; do
     dig +noall +answer @$NS SRV "$s.$D"
   done
   ```

   Add any DKIM selector the mail host uses. The point is a written list of every record.
2. **Add the zone.** The automatic scan **misses records** (SPF, DKIM keys, SRV are common) and turns
   the **proxy on for every A/CNAME** — which breaks FTP, mail clients and cPanel ports. Set every
   record to **DNS only**, then import the missing ones from a BIND zone file built from step 1
   (Import, "Proxy imported records" unchecked).
3. **Compare record by record** against the new nameserver (`dig @<name>.ns.cloudflare.com`) before
   switching. Every answer identical.
4. **DNSSEC off at the registrar** (`dig DS example.com` empty), or the switch breaks resolution.
5. Switch the nameservers at the registrar. Mail keeps flowing because both sides answer the same.
   Then send a test email in and out and open webmail.

- **Never enable Cloudflare Email Routing** on a domain whose mail lives elsewhere — it replaces MX.
- New records can take ~30 s to appear on the edge; poll before concluding they failed.

## Pointing the apex at the server

**List every CNAME that targets the apex before changing it.** `mail`, `www`, `ftp` are often
`CNAME example.com`; moving the apex moves them too, and IMAP/SMTP clients start hitting the web
server. Repoint mail hosts to the mail server's A record first.

## SSL, then proxy

1. SSL/TLS mode **Full (strict)** *before* proxying anything. Flexible + an origin that redirects to
   HTTPS = redirect loop; Full = no certificate check. Reopen the page — the selection sometimes needs
   a second try.
2. Let Coolify issue the Let's Encrypt cert while the record is **DNS only**.
3. Then turn the proxy on. Check with `openssl s_client -connect host:443 -servername host` →
   "Verify return code: 0".
4. Test through the edge while your machine's DNS cache still has the old answer:
   `curl -sI --resolve example.com:443:<cloudflare-ip> https://example.com/` → `cf-cache-status`
   present.

"Not Secure" after the cert is fixed is the browser remembering the placeholder cert (Traefik
default) or a "continue anyway" exception: private window, "Turn on warnings", or quit the browser.

Turn on **Smart Tiered Cache** (free): edges fill from an upper tier instead of the origin.

## Cache rules for Next.js

Cloudflare caches static files by extension. It does **not** cache `/_next/image` (no extension) or
HTML. Rules (Caching → Cache Rules → Edit expression):

**1. Resized images** — path equals `/_next/image`:
- Eligible for cache; **Vary for images: on** (Next serves AVIF/WebP/JPEG/PNG by `Accept` — without
  Vary the first requester's format is served to everyone).
- Edge TTL 30 days (safe when every upload gets a unique file name); **status ≥ 400 → No store**.

**2. Public pages** — no query string, never admin/api/_next, never RSC or signed-in:

```
(http.host in {"example.com"})
and (http.request.method in {"GET" "HEAD" "PURGE"})
and (http.request.uri.query eq "")
and not (http.request.uri.path in {<listing paths>})
and not starts_with(http.request.uri.path, "/admin")
and not starts_with(http.request.uri.path, "/api")
and not starts_with(http.request.uri.path, "/_next")
and not (http.request.uri.path contains ".")
and not any(http.request.headers["rsc"][*] ne "")
and not any(http.request.headers["next-router-prefetch"][*] ne "")
and not any(http.request.headers["next-router-state-tree"][*] ne "")
and not any(http.request.headers["next-router-segment-prefetch"][*] ne "")
and not any(http.request.headers["next-action"][*] ne "")
and not (http.cookie contains "__prerender_bypass")
and not (http.cookie contains "<auth-cookie-name>")
and not (http.cookie contains "<preview-cookie-name>")
```

- Edge TTL: **use cache-control if present, bypass if not**. No override and no status TTL here —
  either makes Cloudflare strip `Set-Cookie` and cache.
- Browser TTL: **Bypass cache.** "Respect origin" lets the zone default (`max-age=14400`) fill in
  when the origin sends only `s-maxage`; browsers then keep stale HTML for hours after a save.

**3. Listing pages** (filters, `?page=`, which Next serves `private, no-store`) — same guards, path
in the listing set, query allowed except `_rsc` (`not (http.request.uri.query contains "_rsc")`):
- Edge TTL: **ignore cache-control, use this TTL** — short (10 min). Purges keep it correct; the TTL
  only bounds staleness when a purge is lost.
- **Status ≥ 300 → No store** (an out-of-range `?page=` redirects; never cache that).
- Browser TTL: **Bypass cache.**
- The override strips `Set-Cookie` and caches — the cookie and header guards are what keep a signed-in
  or RSC response out. A listing page that must set a cookie leaves this rule.

Why the RSC guards matter: Next serves HTML and RSC payloads **on the same URL**, and Cloudflare
ignores `Vary` for them. Without the guards a browser can receive raw RSC as a page.

**`PURGE` must be in every rule's method list.** A single-URL purge evaluates cache rules with method
`PURGE`; a rule matching only `GET HEAD` doesn't match, and the purge answers `success` while the page
stays cached. Prefix purges aren't affected, which hides the bug.

If the editor rejects `any(http.request.headers[...][*] ne "")`, try
`not any(lower(http.request.headers.names[*])[*] in {"rsc" "next-router-prefetch" "next-router-state-tree" "next-router-segment-prefetch" "next-action"})`.
Without a working header guard, don't create rule 3.

## Free plan facts

- 10 cache rules. Operators: `eq`, `in`, `contains`, `starts_with()`, `any()`; regex `matches` needs
  Business; `http.request.cookies` needs Pro → use `http.cookie contains`.
- Custom cache keys are Enterprise; Free keys on the full URL including the query.
- **The Edge TTL dropdown starts at 2 h, but typing `600` offers "10 minutes" and saves.** Always type
  the value before settling for a preset.
- Purge by URL: ≤100 per request, high rate. Purge by prefix/host/tag/everything: **~5 requests per
  minute per account** (staging and production share it). Prefix purge clears every query variant.
- The editor's keyboard shortcuts catch typing that misses the textarea: click into it, check focus,
  then type.

## The purge token

My Profile → API Tokens → Custom token:
- Permission **Zone → Cache Purge → Purge**, nothing else; **one zone**.
- Client IP filtering: the server's **IPv4 and IPv6**. The container may leave over IPv6 even with
  `ipv4first`, and a missing address fails at random with `10000 Authentication error`. Typed IPs are
  kept only if you pick "Add <ip>" from the dropdown — check the summary before Create.
- Shown once: into the local `chmod 600` env file, then the panel.
- **Test a real purge from inside the app container**, not `tokens/verify` from your laptop (the IP
  filter refuses it):
  `docker exec <c> node -e "fetch('https://api.cloudflare.com/client/v4/zones/'+process.env.CLOUDFLARE_ZONE_ID+'/purge_cache',{method:'POST',headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_PURGE_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({files:['https://example.com/']})}).then(r=>r.json()).then(console.log)"`

## Proving the cache works

`success` from the API proves nothing. Prove each with headers (`curl -sD- -o/dev/null`):

- [ ] A page twice → `MISS` then `HIT`, `age` grows, no `set-cookie`, browser gets no `max-age` > 0
- [ ] **URL purge → the next request is `MISS`** and `age` resets
- [ ] A listing with a real filter → `MISS` then `HIT`; `?fbclid=x` on a normal page → `DYNAMIC`
- [ ] `-H 'RSC: 1'` → never HIT, `text/x-component`; the plain URL right after still starts
      `<!DOCTYPE html>`
- [ ] Signed in: admin and public pages `DYNAMIC`; `/api/health` `DYNAMIC`
- [ ] An admin edit visible in a private window within seconds
- [ ] Forms still POST from cached pages; client navigation works with no console errors
- [ ] Wrong token on purpose → the save still succeeds and the log names Cloudflare's error

## Warm images on a new host

Cloudflare caches **per host** and, with Vary, **per browser family**. After a new domain (or a big
content change), list the `/_next/image?…` URLs from every sitemap page and GET each with a Chrome
`Accept` (`image/avif,image/webp,…`) **and** a Safari `Accept`, a few at a time. On macOS `xargs -I`
fails on long lines — use `xargs -n 2 ./warm-one.sh`.

Deleted images stay reachable by their direct `/_next/image` URL until the edge TTL; purge that URL
by hand if one must vanish now.
