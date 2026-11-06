# Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Provider setup "on hold" after paying | Identity verification email | Reply to that email with the documents |
| Root password from the order unknown | Generated in the form, never saved | Reinstall with an SSH key; log in as the image's user (`ubuntu`) |
| SSH "Too many authentication failures" | Agent offers every key | `-o IdentitiesOnly=yes -i <key>` |
| SSH "REMOTE HOST IDENTIFICATION HAS CHANGED" | `known_hosts` holds the pre-reinstall key | Match `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` on the server, then `ssh-keygen -R <ip>` |
| Password SSH still accepted | Cloud-init drop-in sets `PasswordAuthentication yes` | Fix the drop-in; check `sshd -T` |
| Panel port reachable from anywhere despite ufw | Docker's iptables rules run before ufw | `DOCKER-USER` lock, IPv4 + IPv6 |
| Panel spins forever from the allowed IP | Lock rule also drops container replies | `--ctorigdstport` + `--ctdir ORIGINAL`; `conntrack -L` shows `SYN_RECV` |
| Panel stops loading one day / "Cannot connect to real-time service" | Home IP changed | Update `ALLOW=` over SSH, or `ssh -N -L 8000:localhost:8000` |
| Coolify sign-up page gone | 10-minute first-admin window passed | `docker restart coolify`, sign up at once |
| Every page redirects to onboarding | Wizard's last step not clicked | **Skip setup** |
| Coolify chose Docker Compose | Repo has a local-DB compose file | Build pack → Dockerfile |
| Push doesn't deploy | Webhook blocked by the panel lock, or no webhook yet | Allow GitHub `hooks` ranges on 8000 (daily refresh); meanwhile Redeploy |
| Deploy click did nothing | Tab closed too fast | Confirm a new deployment row before waiting |
| Deploy fails in seconds: P1001 can't reach DB | Managed DB blip during `migrate deploy` | Retry loop in the pre-deployment command |
| Deploy fails: `Could not resolve host: github.com` | Provider DNS resolver hiccup | Redeploy; recurring → Docker daemon `dns` |
| Build: npm `ECONNRESET` | Flaky server network | npm retry ENV in the base stage |
| Build: "Module not found … font/google" | `next/font/google` downloads at build time | `next/font/local` |
| Build: downloads hang or fail on IPv6 | Container has no IPv6 route | `NODE_OPTIONS=--dns-result-order=ipv4first` |
| Env var changed, app behaves the same | Restart didn't recreate the container | Redeploy; check `StartedAt` and env names |
| Data migrated, pages still show old values | Same commit reused the cached build layer | Redeploy **without cache** |
| DB fixed by hand, page unchanged | Caches refresh only through the app's save path | Re-save in the admin, or rebuild without cache |
| "Cross-site request refused" on a POST | Origin check compares `https://` with internal `http://` | Compare to the forwarded public origin |
| Redirect to `https://0.0.0.0:3000/...` | `new URL(path, request.url)` behind the proxy | Build from `X-Forwarded-Proto`/`Host` |
| Pages slow after adding a mount; `EACCES … .next/cache/fetch-cache` | Docker created the mount's parents as root | Create `.next/cache/images` owned by the app user in the Dockerfile |
| Admin login fails on the temporary address | `sslip.io` is HTTP; secure cookies dropped | Test on an HTTPS subdomain |
| Junk `www.` domains, certificate errors | Panel adds `www.` variants of every domain | Delete them (untick "delete DNS record") |
| Redirects are 302 | Panel default is Temporary | Redirect type Permanent |
| "Not Secure" after the cert is fixed | Browser remembers the placeholder cert or an exception | Private window, "Turn on warnings", quit the browser; `openssl s_client` |
| Redirect loop after proxying | SSL mode Flexible + origin forces HTTPS | Full (strict) before proxying |
| Mail clients break after launch | `mail` was a CNAME to the apex | Repoint mail hosts to the mail server before moving the apex |
| Records missing after the zone import | Cloudflare scan skips SPF/DKIM/SRV | Zone-file import; compare every record with `dig` |
| FTP / cPanel / mail broke right after adding the zone | Scan proxied every A/CNAME | Set everything DNS only |
| Pages always `DYNAMIC` | A `Set-Cookie` on the page | Remove it (locale cookie); `curl -sI \| grep -i set-cookie` |
| Listing pages never cached | Query-string pages are `no-store` | Separate rule with an Edge TTL override + purge |
| URL purge says `success`, page stays cached | Rule methods are `GET HEAD` only | Add `PURGE` |
| Browsers keep HTML for hours after a save | Browser TTL "Respect origin" fills in the zone default | Browser TTL Bypass on page rules |
| Free plan offers no 10-min Edge TTL | Presets start at 2 h | Type `600` |
| `?page=2` shows `BYPASS` | Out-of-range page redirects; ≥300 No store | Correct; test with a real filter |
| Purge `10000 Authentication error`, only sometimes | Token IP filter lacks the server's IPv6 | Add IPv6; test from inside the container |
| 429 on prefix purges | 5/min per account, shared by staging + production | Queue and merge, ≤1 per 30 s per process |
| Proxied, but no `cf-cache-status` from your machine | Local DNS cache | `curl --resolve host:443:<cf-ip>` |
| Safari slow on images, Chrome fast | One edge copy per browser family + image cache lost per deploy | Keep Vary; persistent image-cache mount; warm with both `Accept` headers |
| First image views slow on a new domain | Edge cache is per host | Warm from the sitemap |
| `/_next/image` 400 "url parameter is not allowed" after a migration | Files landed outside the image allow-list paths | Move under the allowed prefix; update rows; re-save |
| Backup service fails: "syntax error near newline" | Unquoted `<`/`>` in a sourced env file | Quote the value |
| `pg_dump` refuses the server | Client older than the server's major | `postgres:<server-major>-alpine` |
| Restore test: "database system is shutting down" | Postgres image restarts once after initdb | Wait for the second "ready to accept connections" |
| Scheduled task fails with `wget` | Image has `curl` only | Use `curl -fsS` |
| Scheduled task runs at the wrong hour | Coolify cron is UTC | Convert the time |
| Panel version changed overnight | Coolify auto-update | Note it; check the panel |
| Snapshot "Create" does nothing | Hidden duplicate form in the panel | Use the visible button; confirm "created" |
| `git push` hangs silently | Stalled SSH to GitHub / port 22 blocked | `GIT_SSH_COMMAND="ssh -o ConnectTimeout=15 -o ServerAliveInterval=10"`; or `ssh.github.com:443` with the key |
| Admin pages slow, public pages fast | Server far from the DB; sequential queries | `Promise.all`, fewer awaits in a row, `loading.tsx`; or move server/DB together |
