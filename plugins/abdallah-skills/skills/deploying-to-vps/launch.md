# Staging, launch day, SEO

## Before launch: a real HTTPS staging host

- `staging.example.com` on the same app is the fastest way to test the production setup (secure-cookie
  login, uploads, preview, caching). Mark it **Noindex** in the panel.
- Same app = same DB, files and email. Fine before launch; at launch remove the domain, or split a
  proper staging app (own DB branch, bucket, branch `dev`).
- After each deploy: read-only smoke specs against the live URL. Load tests (k6) from another
  machine before launch, against pages not raw files. The full e2e suite stays on test databases.

## Launch order

This order avoids certificate failures, mail outages and a cached broken site:

1. **Provider snapshot.**
2. App deploys from the **production branch**.
3. Apex + `www` records → server, **DNS only**. First list every CNAME pointing at the apex and
   repoint mail hosts ([cloudflare.md](cloudflare.md)).
4. Panel: domains (`https://example.com`, `https://www.example.com`), www redirect, redirect type
   **Permanent**, delete junk `www.` variants the panel added (untick "delete DNS record"), indexing
   setting, and env (`NEXT_PUBLIC_SITE_URL`, auth URL, purge hosts) → **Redeploy without cache**.
5. Certificates issued (`openssl s_client` → verify 0) on both names.
6. **SEO checks** (below) against the origin.
7. Records → **Proxied**; SSL Full (strict) already set.
8. Cache rules' host lists include the domain; prove HIT / purge / DYNAMIC
   ([cloudflare.md](cloudflare.md)); warm images for the new host.
9. Uptime monitor and alerts switched to the real domain.
10. Retire the old host (preview platform, old file store) once the copy is checked.

## SEO checks

- [ ] No `x-robots-tag: noindex` and no `<meta name="robots" content="noindex">` on `/` — through
      Cloudflare (unless the site is deliberately noindex for now)
- [ ] `robots.txt` allows crawling and names the sitemap on the real domain
- [ ] `sitemap.xml` lists real-domain URLs only (no staging, sslip or preview host)
- [ ] Canonical and `hreflang` (with `x-default`) point at the real domain
- [ ] `http://` → `https://` and `www` → apex are **301**, keeping path and query
- [ ] Old URLs that moved answer 301 to the new ones
- [ ] Favicon / `icon.png` / `apple-icon.png` served; Google picks the icon up weeks later
- [ ] **Search Console: Domain property** verified by a DNS **TXT** on the apex (keep the record or
      verification is lost), owned by the client's Google account; submit the sitemap; request
      indexing for the key pages (a handful a day)

## While the content isn't real

Two independent switches:

- **Noindex** per domain in the panel (`X-Robots-Tag: noindex, nofollow`). Keep `robots.txt`
  allowing crawling so Google can *see* the noindex.
- **Coming-soon mode** in the app ([app-behind-proxy.md](app-behind-proxy.md)): visitors see one page,
  signed-in admins see the real site. Keep the page minimal.

**Opening the site is one deploy:** the client has replaced the sample content **and** settings
(phone, email, socials) → remove the coming-soon flag → set the domain Indexable → Redeploy → check
`/` through Cloudflare shows the real page with no `x-robots-tag` → Search Console request indexing +
resubmit the sitemap → warm images.

## After launch

- Production test accounts removed, or passwords rotated; a second admin as the recovery path when
  there is no password-reset email.
- Watch the email volume against the provider's daily limit, and Delivered vs spam.
- `SERVER.md` updated: what is configured, why, and where each secret lives.
