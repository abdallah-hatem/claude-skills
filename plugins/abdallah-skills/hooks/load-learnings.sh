#!/bin/bash
# SessionStart — force-load recorded corrections into context.
# A file nothing reads prevents nothing.
#
# Two tiers: global rules (~/.claude/LEARNINGS.md) apply in every project;
# project rules (<cwd>/.claude/LEARNINGS.md) apply only to the project in cwd.
set -uo pipefail

dir=$(cat | jq -r '.cwd // empty' 2>/dev/null) || dir=""
[ -z "$dir" ] && dir="${CLAUDE_PROJECT_DIR:-$PWD}"

gf="$HOME/.claude/LEARNINGS.md"
pf="$dir/.claude/LEARNINGS.md"

body=""
if [ -s "$gf" ]; then
  body="Global corrections (~/.claude/LEARNINGS.md) — these apply in EVERY project:

$(cat "$gf")"
fi

if [ -s "$pf" ] && [ "$pf" != "$gf" ]; then
  [ -n "$body" ] && body="$body
"
  body="${body}
Corrections for this project ($pf):

$(cat "$pf")"
fi

[ -z "$body" ] && exit 0

jq -n --arg b "$body" '{
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: ("These are standing instructions from the user — follow them without being asked again:\n\n" + $b)
  }
}'
exit 0
