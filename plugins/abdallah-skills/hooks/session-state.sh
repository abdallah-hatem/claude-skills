#!/bin/bash
# SessionStart — put the work's state in front of the model, so a new session, a resume, a /clear,
# or a compaction never has to rebuild it from memory.
#
# - A repo with docs/BUILD_LOG.md: a /build-software run is in progress; load the log's header.
# - Otherwise: load this repo's handoff note from ~/.claude/handoffs/<repo>.md, if one exists.
# - After a compaction (source "compact"): also say to re-read the state and write it down first.
# Silent when there is no state to load. Never blocks.
set -uo pipefail

input=$(cat)
dir=$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null) || dir=""
source=$(printf '%s' "$input" | jq -r '.source // empty' 2>/dev/null) || source=""
[ -z "$dir" ] && dir="${CLAUDE_PROJECT_DIR:-$PWD}"

root=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null) || root="$dir"
log="$root/docs/BUILD_LOG.md"
handoff="$HOME/.claude/handoffs/$(printf '%s' "$root" | tr '/' '-' | sed 's/^-//').md"

body=""
if [ -s "$log" ]; then
  # Everything above "## Decisions" (run mode, goal, current stage, waves), the last 3 wave
  # lines, and the Blocked section — enough to resume, small enough to load every session.
  header=$(awk '/^## Decisions/{exit} /^## Waves/{w=1; next} w&&/^## /{w=0} !w{print}' "$log" | head -20)
  waves=$(awk '/^## Waves/{w=1; next} w&&/^## /{w=0} w&&NF{print}' "$log" | tail -3)
  blocked=$(awk '/^## Blocked/{b=1; next} b&&/^## /{b=0} b&&NF{print}' "$log" | head -10)
  body="A /build-software run is in progress in this repo — its state is docs/BUILD_LOG.md and the plan's
checkboxes, not memory. Run /build-software to resume it (it continues from Current stage without
re-asking the run mode).

$header"
  [ -n "$waves" ] && body="$body

Recent waves:
$waves"
  [ -n "$blocked" ] && body="$body

Blocked:
$blocked"
  if [ "$source" = "compact" ]; then
    body="$body

A compaction just happened. Before the next action: re-read docs/BUILD_LOG.md and the plan, and if
the log is behind what the summary says was done (a finished task, a new decision, a wave), update
it first."
  fi
elif [ -s "$handoff" ]; then
  age=$(( ( $(date +%s) - $(stat -f %m "$handoff") ) / 86400 ))
  body="Handoff note for this repo (~/.claude/handoffs/, written ${age} day(s) ago) — where the last
session left off. Verify it against git before acting on it; update it as work moves, and delete it
when the work it describes is done.

$(head -60 "$handoff")"
  if [ "$source" = "compact" ]; then
    body="$body

A compaction just happened. If the summary shows progress the note doesn't have, update it now."
  fi
elif [ "$source" = "compact" ]; then
  body="A compaction just happened and this repo has no build log or handoff note. If the work will
outlast this session, write $handoff now: the goal, what is done, what is in progress (branch,
files, running commands), open decisions, and the exact next step — short, in plain prose."
fi

[ -z "$body" ] && exit 0

jq -n --arg b "$body" '{
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: $b
  }
}'
exit 0
