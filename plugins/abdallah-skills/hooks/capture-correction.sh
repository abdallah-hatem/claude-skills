#!/bin/bash
# UserPromptSubmit — nudge to record a correction in the global or project LEARNINGS.md.
# Silent unless the prompt is correction-shaped. Never blocks.
set -uo pipefail
# Windows: winget installs jq without always putting it on PATH for hook shells.
if ! command -v jq >/dev/null 2>&1 && [ -n "${LOCALAPPDATA:-}" ]; then
  for d in "$(cygpath -u "$LOCALAPPDATA")"/Microsoft/WinGet/Packages/jqlang.jq_*; do [ -d "$d" ] && PATH="$PATH:$d"; done
fi

prompt=$(cat | jq -r '.prompt // empty' 2>/dev/null) || exit 0
[ -z "$prompt" ] && exit 0

lower=$(printf '%s' "$prompt" | tr '[:upper:]' '[:lower:]')

# Standalone words are anchored so "no" can't match "note"/"know"/"now".
# Phrases are matched literally.
if printf '%s' "$lower" | grep -Eq \
  '(^|[[:space:]])(no|nope|wrong|instead|stop)([[:space:][:punct:]]|$)|i meant|i said|i told you|i already|you forgot|you keep|not what i|don.?t (do|use|add|call|touch|change|put)|never (do|use|add|call|put)|stop doing'
then
  printf '%s' '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"[capturing-corrections] This message reads as a course correction. Once you have resolved it, invoke the capturing-corrections skill to record the durable rule: in ~/.claude/LEARNINGS.md if it is about the user, or <repo>/.claude/LEARNINGS.md if it is about this codebase. Skip it only if the point was a one-off that could not recur."}}'
fi
exit 0
