#!/bin/bash
# Stop — after a reply that made real progress, have the model write the meaning half of the
# repo's handoff note (why, what's half-done, decisions, next step). Git only shows what changed.
#
# Fires only when, since the later of the session start and the note's last write:
#   - a commit landed, or
#   - a tracked or new file changed and the note is more than 30 minutes old.
# Silent otherwise. Skipped outside git, in a /build-software run (docs/BUILD_LOG.md), and when
# this hook already fired for this stop (stop_hook_active) — so it can't loop.
set -uo pipefail

input=$(cat)
active=$(printf '%s' "$input" | jq -r '.stop_hook_active // false' 2>/dev/null) || active=false
[ "$active" = "true" ] && exit 0
dir=$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null) || dir=""
transcript=$(printf '%s' "$input" | jq -r '.transcript_path // empty' 2>/dev/null) || transcript=""
[ -z "$dir" ] && dir="${CLAUDE_PROJECT_DIR:-$PWD}"

root=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null) || exit 0
[ -s "$root/docs/BUILD_LOG.md" ] && exit 0

note="$HOME/.claude/handoffs/$(printf '%s' "$root" | tr '/' '-' | sed 's/^-//').md"
now=$(date +%s)

since=0
if [ -n "$transcript" ] && [ -s "$transcript" ]; then
  first=$(jq -r 'select(.timestamp) | .timestamp' "$transcript" 2>/dev/null | head -1)
  [ -n "$first" ] && since=$(date -j -u -f '%Y-%m-%dT%H:%M:%S' "${first%%.*}" +%s 2>/dev/null || echo 0)
fi
note_m=0
[ -f "$note" ] && note_m=$(stat -f %m "$note")
[ "$note_m" -gt "$since" ] && since=$note_m

progress=""
last_commit=$(git -C "$root" log -1 --format=%ct 2>/dev/null || echo 0)
if [ "${last_commit:-0}" -gt "$since" ]; then
  progress="a commit landed"
elif [ $(( now - note_m )) -gt 1800 ]; then
  while IFS= read -r f; do
    [ -e "$root/$f" ] || continue
    if [ "$(stat -f %m "$root/$f")" -gt "$since" ]; then progress="files changed"; break; fi
  done < <(git -C "$root" status --porcelain 2>/dev/null | cut -c4- | sed 's/.* -> //' | head -50)
fi
[ -z "$progress" ] && exit 0

reason="Before stopping ($progress): update the handoff note at $note so the next session in this repo can
continue without this conversation. Write only the part ABOVE its \"## Facts\" line (create the file
with a \"# Handoff — <repo>\" title if it doesn't exist; the Facts section is filled in by a hook at
session end). At most 12 lines, plain prose or bullets: the goal in the user's words, what got done
this session, what is in progress, decisions made and why, and the exact next step. Then stop — don't
mention the note in your reply."

jq -n --arg r "$reason" '{decision: "block", reason: $r}'
exit 0
