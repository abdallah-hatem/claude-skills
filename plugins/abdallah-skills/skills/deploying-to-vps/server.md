# Server and Coolify

## Ordering the VPS

- **Monthly term first.** Long terms save little and you can't downgrade; upgrades are charged the
  difference.
- Pick plain **Ubuntu LTS**. Order links can pre-select odd images ("Docker", app images).
- Some providers (Contabo among them) put the order **on hold for identity verification** by email
  (ID + proof of address). Reply to that same email; nothing starts until you do.
- Provider disk backup add-ons are skippable when the server is nearly stateless (DB managed, files
  in object storage, code in git) **and** you back up the panel's own config yourself.

## Clean reinstall with an SSH key

Don't fight an unknown root password from the order form. **Reinstall** from the provider panel
(advanced/custom install) with the OS image, no password, and an SSH key saved in the provider's
key store. Many images then log in as **`ubuntu`** with passwordless sudo and refuse root.

```bash
ssh -o IdentitiesOnly=yes -i ~/.ssh/<key> ubuntu@<server-ip>
```

`IdentitiesOnly=yes`: with several keys in the agent the server cuts you off after too many tries.

**After any reinstall the host key changes.** "REMOTE HOST IDENTIFICATION HAS CHANGED" is expected
only if `known_hosts` was written before the reinstall. Confirm before removing it:

```bash
# on the server (via the provider's console if needed)
sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub     # must match the fingerprint in the warning
# then locally
ssh-keygen -R <server-ip>
ssh -o StrictHostKeyChecking=accept-new ubuntu@<server-ip>
```

## Hardening

```bash
sudo timedatectl set-timezone <Region/City>
sudo apt update && sudo apt -y upgrade
sudo apt -y install ufw fail2ban unattended-upgrades
sudo ufw default deny incoming && sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
sudo ufw enable
sudo dpkg-reconfigure -plow unattended-upgrades
sudo systemctl enable --now fail2ban
```

A non-root sudo user with the key only. If the image gave you root, create the user, copy
`authorized_keys`, test a second session, then `PermitRootLogin no`.

**Verify password auth is really off.** Cloud-init drops `/etc/ssh/sshd_config.d/50-cloud-init.conf`
with `PasswordAuthentication yes`, and drop-ins win over `sshd_config`. Read the effective config:

```bash
sudo sshd -T | grep -Ei 'passwordauthentication|permitrootlogin|kbdinteractive'
sudo passwd -S ubuntu root          # "L" = locked: no password can work even if auth is on
```

Fix the drop-in (or add `00-hardening.conf` that sorts first), `sudo systemctl reload ssh`, and test
`ssh -o PubkeyAuthentication=no` is refused. fail2ban will ban hundreds of bots in the first days —
that is normal noise, not an attack.

## Docker bypasses ufw — lock the panel in DOCKER-USER

Container ports are published through iptables rules that run **before** ufw. Coolify's panel
(8000) and realtime ports (6001/6002) answer the whole internet even with ufw "deny".

Order: install Docker (`curl -fsSL https://get.docker.com | sh`), **lock the ports**, then run the
Coolify installer (it reuses the existing Docker).

The lock goes in the `DOCKER-USER` chain — [templates/panel-lock.sh](templates/panel-lock.sh).
Three things it gets right that a first attempt gets wrong:

1. **`-m conntrack --ctorigdstport <port> --ctdir ORIGINAL`.** A plain "drop port 8000 unless source
   is my IP" also drops the container's **replies** (their source is the container). The panel just
   spins; `conntrack -L` shows connections stuck in `SYN_RECV`.
2. **IPv6 too** (`ip6tables` `DOCKER-USER`): Docker may publish on `::`.
3. **Persist** with a systemd unit `After=docker.service`, and re-run it on a daily timer if it pulls
   lists (below).

```ini
# /etc/systemd/system/panel-lock.service
[Unit]
After=docker.service
Requires=docker.service
[Service]
Type=oneshot
ExecStart=/bin/sh /usr/local/sbin/panel-lock.sh
RemainAfterExit=yes
[Install]
WantedBy=multi-user.target
```

**Push-to-deploy through the lock:** GitHub's webhook deliveries come from the `hooks` ranges in
`https://api.github.com/meta`. Allow them on 8000 only (Coolify verifies every delivery's
signature), refresh daily with a timer, keep a fallback list in the script. Without this, pushes
silently never deploy.

**Dynamic home IP:** when it changes the panel stops loading ("Cannot connect to real-time
service"). Update `ALLOW=` over SSH and re-run, or skip the lock entirely for one session:

```bash
ssh -N -L 8000:localhost:8000 ubuntu@<server-ip>      # then open http://localhost:8000
```

Long term: put the panel on its own HTTPS subdomain, update the GitHub App's webhook URL, drop the
IP lock. Check `ss -tlnp` / `docker ps` for other published ports (Traefik's 8080 dashboard port is
published but inert while `--api.insecure=false`; add it to the lock if an update ever enables it).

## Coolify

**Install and claim the admin immediately.** The first account to sign up becomes admin, and only
within ~10 minutes of Coolify starting. Have the owner ready; `sudo docker restart coolify` reopens
the window. In the onboarding wizard pick "This machine"; if it loops back to onboarding, **Skip
setup**. Copy `/data/coolify/source/.env` (its `APP_KEY` decrypts every stored secret) off the
server right away.

**GitHub:** Sources → GitHub App → install on **only the one repo**, read-only, PR previews off.

**New application:**

| Setting | Value |
|---|---|
| Build pack | **Dockerfile** — the scan picks Docker Compose if the repo has a local-DB compose file |
| Port | 3000 |
| Branch | the production branch (`production`), not `dev` — every push to it deploys |
| Pre-deployment command | migrations with a retry loop (below) |
| Health check | `GET /api/health` on 3000, 30 s interval, 3 retries, 30 s start period |
| Env vars | Developer View → **Production** section (not "Preview deployments"); Buildtime + Runtime |
| Domains | `https://` URLs; remove the auto-added `www.` variants you don't own |
| Redirect type | **Permanent (301)** — the default is Temporary |
| Search indexing | **Noindex** per domain for staging / pre-launch (sends `X-Robots-Tag`) |

```sh
sh -c 'for i in 1 2 3; do prisma migrate deploy && exit 0; echo "migrate failed, retry $i"; sleep 10; done; exit 1'
```

A managed DB is occasionally unreachable for a few seconds (P1001). A failed pre-deploy or health
check cancels the deploy and **keeps the old version running** — no downtime, but nothing shipped.

**Restart vs Redeploy vs Redeploy without cache:**

| You changed | Press | Why |
|---|---|---|
| Env vars | **Redeploy** | Restart can leave the old container with the old env |
| Code | push / Deploy | |
| DB data that prerendered pages contain (URL rewrite, migration script) | **Redeploy without cache** | Same commit → Docker reuses the cached `next build` layer and its old HTML |

Then check it took:

```bash
docker inspect <container> --format '{{.State.StartedAt}}'
docker exec <container> sh -c 'env | grep -o "^NAME_ONE\|^NAME_TWO"'     # names, never values
```

**Other Coolify facts:**

- **Persistent directory mounts:** the host folder must be owned by the image's app uid (often
  1001). Select-all in the Source field before typing — it is prefilled. See
  [app-behind-proxy.md](app-behind-proxy.md) for the parent-directory trap.
- **Scheduled tasks run in UTC** whatever the server time zone. The app image may have `curl` and not
  `wget`:
  `sh -c 'curl -fsS -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/cron/<job>'`
- **Nightly Docker cleanup:** Servers → the server → cleanup frequency `0 0 * * *`, force on.
  Build cache and old images fill the disk fast.
- **Auto-update is on by default.** Note version changes; check the panel after one.
- The env-var page sometimes never finishes loading; reload, or read Coolify's DB:
  `docker exec coolify-db psql -U coolify -d coolify -c "select key, is_buildtime, is_runtime from environment_variables where resourceable_id=(select id from applications where uuid='<app-uuid>')"`.
- Full deploy logs: `application_deployment_queues.logs` in the same DB, when the page lazy-loads.
- The temporary `*.sslip.io` address is plain HTTP — secure-cookie logins fail there. Test on a real
  HTTPS subdomain.
- Notifications → Email via the app's transactional mail key; pick deploy failure, scheduled-task
  failure, backup failure, disk usage, server unreachable. Send a test.
- Metrics: enable Sentinel for CPU/memory/disk history. Over SSH:
  `uptime; free -h; df -h /; docker system df; docker stats --no-stream`.
- Docker can't resolve `github.com` during a clone → provider resolver hiccup; redeploy. Recurring
  → `/etc/docker/daemon.json` `{"dns": ["1.1.1.1", "8.8.8.8"]}`.
- Roll back: Deployments → an older successful one → Redeploy.

## Snapshots

Take the provider's snapshot after setup and **before every big change** (launch, OS upgrade).
Cheap plans allow one, auto-deleted after ~30 days: delete the old one, take a new one, and check
the panel says it was created (some panels have a hidden duplicate form that does nothing).
