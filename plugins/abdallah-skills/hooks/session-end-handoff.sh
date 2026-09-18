#!/bin/bash
# SessionEnd — write the facts half of this repo's handoff note, so no session ends unrecorded.
# The note lives outside the repo: ~/.claude/handoffs/<repo>.md. This script owns only its
# "## Facts" section (branch, commits, uncommitted files, the user's last requests); the text
# above it is the model's summary, written by stop-handoff.sh, and is kept as is.
# Skipped outside git and in a /build-software run (docs/BUILD_LOG.md is that run's record).
set -uo pipefail

input=$(cat)
dir=$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null) || dir=""
transcript=$(printf '%s' "$input" | jq -r '.transcript_path // empty' 2>/dev/null) || transcript=""
[ -z "$dir" ] && dir="${CLAUDE_PROJECT_DIR:-$PWD}"

root=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null) || exit 0
[ -s "$root/docs/BUILD_LOG.md" ] && exit 0

notes="$HOME/.claude/handoffs"
note="$notes/$(printf '%s' "$root" | tr '/' '-' | sed 's/^-//').md"
mkdir -p "$notes" || exit 0

# Since when: the later of this session's first transcript entry and the note's last write.
since=0
if [ -n "$transcript" ] && [ -s "$transcript" ]; then
  first=$(jq -r 'select(.timestamp) | .timestamp' "$transcript" 2>/dev/null | head -1)
  [ -n "$first" ] && since=$(date -j -u -f '%Y-%m-%dT%H:%M:%S' "${first%%.*}" +%s 2>/dev/null || echo 0)
fi
[ -f "$note" ] && { m=$(stat -f %m "$note"); [ "$m" -gt "$since" ] && since=$m; }

branch=$(git -C "$root" branch --show-current 2>/dev/null)
commits=$(git -C "$root" log --since="@$since" --format='- %h %s' -10 2>/dev/null)
status=$(git -C "$root" status --short 2>/dev/null | head -15)
stat=$(git -C "$root" diff --shortstat 2>/dev/null)

requests=""
if [ -n "$transcript" ] && [ -s "$transcript" ]; then
  requests=$(jq -r 'select(.type == "user" and (.message.content | type) == "string")
      | .message.content | gsub("\\s+"; " ") | .[0:200]' "$transcript" 2>/dev/null \
    | grep -v -e '^<' -e '^Caveat:' -e '^\[Request interrupted' | tail -3 | sed 's/^/- /')
fi

# Nothing happened and nothing to say: leave any existing note untouched.
[ -z "$commits" ] && [ -z "$status" ] && [ -z "$requests" ] && exit 0

summary=""
if [ -f "$note" ]; then
  summary=$(awk '/^## Facts/{exit} {print}' "$note")
fi
[ -z "$(printf '%s' "$summary" | tr -d '[:space:]')" ] && summary="# Handoff — ${root/#$HOME/~}

(No summary written yet — only the facts below. Check git before acting on them.)"

{
  printf '%s\n\n' "$summary"
  printf '## Facts (auto — %s, session end)\n' "$(date '+%Y-%m-%d %H:%M')"
  printf -- '- Branch: %s\n' "${branch:-detached}"
  printf '\nCommits since the last note:\n%s\n' "${commits:-- none}"
  printf '\nUncommitted:%s\n%s\n' "${stat:+ ($stat)}" "${status:-- clean}"
  [ -n "$requests" ] && printf '\nThe user'"'"'s last requests:\n%s\n' "$requests"
} > "$note.tmp" && mv "$note.tmp" "$note"
exit 0
