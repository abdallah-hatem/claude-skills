#!/bin/bash
# PreCompact — tell the summarizer what must survive the compaction.
# Claude Code appends a PreCompact hook's stdout to the compaction's custom instructions.
# The session-state.sh SessionStart hook reloads the durable state right after.
set -uo pipefail

input=$(cat)
dir=$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null) || dir=""
[ -z "$dir" ] && dir="${CLAUDE_PROJECT_DIR:-$PWD}"
root=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null) || root="$dir"
log="$root/docs/BUILD_LOG.md"

cat <<'EOF'
The summary must let the next turn continue without the conversation. Keep, precisely:
- the goal, in the user's words, and any standing instruction they gave this session
- what was just finished, with commit hashes
- what is in progress: the branch, the files being changed, any command or subagent still running
- decisions made this session and their reasons; questions still open to the user
- the exact next step
Name files by path. Drop exploration that led nowhere and output that is already on disk.
EOF

if [ -s "$log" ]; then
  stage=$(grep -m1 '^Current stage:' "$log")
  printf '\nA /build-software run is in progress; docs/BUILD_LOG.md says: %s\n' "${stage:-no Current stage line}"
  printf 'State which tasks, waves, or decisions happened after that line, so the log can be brought up to date.\n'
fi
exit 0
