#!/bin/sh
# Lock Coolify's panel (8000) and realtime ports (6001/6002) to one IP, because Docker publishes
# container ports past ufw. Rules go in DOCKER-USER, which Docker evaluates before its own.
#   - --ctdir ORIGINAL matches only incoming packets; without it the container's replies are
#     dropped too and the panel spins forever.
#   - Port 8000 also accepts GitHub's webhook senders (api.github.com/meta "hooks", IPv4) so a push
#     deploys. Coolify verifies each delivery's signature.
# Install: /usr/local/sbin/panel-lock.sh, run by a oneshot unit After=docker.service, and re-run
# daily by a timer so GitHub range changes are picked up.
# If your IP changes the panel stops loading: edit ALLOW and re-run, or use an SSH tunnel.

ALLOW="<your-public-ipv4>"
PORTS="8000 6001 6002"
# Used only if api.github.com/meta can't be read. Copy the current "hooks" IPv4 ranges from
# https://api.github.com/meta when installing.
GITHUB_HOOKS_FALLBACK="<cidr> <cidr>"

hooks=$(curl -fsS --max-time 15 https://api.github.com/meta 2>/dev/null |
  python3 -c 'import json,sys; print(" ".join(c for c in json.load(sys.stdin)["hooks"] if ":" not in c))' 2>/dev/null)
[ -n "$hooks" ] || hooks=$GITHUB_HOOKS_FALLBACK

iptables -F DOCKER-USER
ip6tables -F DOCKER-USER 2>/dev/null
for p in $PORTS; do
  iptables -I DOCKER-USER -p tcp -m conntrack --ctorigdstport "$p" --ctdir ORIGINAL ! -s "$ALLOW" -j DROP
  # No allowed IPv6 address: block these ports on IPv6 entirely.
  ip6tables -I DOCKER-USER -p tcp -m conntrack --ctorigdstport "$p" --ctdir ORIGINAL -j DROP 2>/dev/null
done
# Inserted after the drops, so they sit above them and are checked first.
for cidr in $hooks; do
  iptables -I DOCKER-USER -p tcp -m conntrack --ctorigdstport 8000 --ctdir ORIGINAL -s "$cidr" -j RETURN
done
iptables -A DOCKER-USER -j RETURN
ip6tables -A DOCKER-USER -j RETURN 2>/dev/null
echo "panel lock: $ALLOW + $(echo $hooks | wc -w) GitHub hook ranges on 8000"
