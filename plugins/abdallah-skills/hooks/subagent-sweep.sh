#!/bin/bash
# SubagentStop: kill processes a finished sub-agent left behind, so nothing sits idle for hours.
#   1. anything whose command line or working directory is inside that agent's worktree
#      (<repo>/.claude/worktrees/agent-<agent_id>/)
#   2. jest processes re-parented to launchd (ppid 1) that belong to any agent worktree
#   3. safety net for agents without a worktree: any jest idle (0% CPU) for 45+ minutes
# Never touches Claude, its MCP servers, or anything outside these patterns. Always exits 0.
LOG="$HOME/.claude/logs/subagent-sweep.log"
mkdir -p "$(dirname "$LOG")"
input=$(cat)
agent_id=$(printf '%s' "$input" | /usr/bin/python3 -c 'import json,sys
try: print(json.load(sys.stdin).get("agent_id") or "")
except Exception: print("")' 2>/dev/null)

safe() { # never kill Claude, MCP servers, or shells that run Claude itself
  case "$1" in
    *Claude.app*|*claude-code*|*/.claude/local/*|*mcp*|*MCP*|*"@anthropic-ai"*) return 1 ;;
  esac
  return 0
}

descendants() { # pid -> all descendant pids, depth first
  local c
  for c in $(pgrep -P "$1" 2>/dev/null); do descendants "$c"; echo "$c"; done
}

kill_pid() { # pid reason — kills the process and its whole tree (children first)
  local pid=$1 reason=$2 cmd p
  [ "$pid" = "$$" ] && return
  cmd=$(ps -o command= -p "$pid" 2>/dev/null) || return
  [ -z "$cmd" ] && return
  safe "$cmd" || return
  for p in $(descendants "$pid"); do kill "$p" 2>/dev/null; done
  kill "$pid" 2>/dev/null && echo "$(date '+%F %T') [$reason] killed $pid (+tree): ${cmd:0:160}" >> "$LOG"
}

tree_idle() { # pid -> 0 when it and every descendant show 0.0% CPU
  local p c
  for p in "$1" $(descendants "$1"); do
    c=$(ps -o pcpu= -p "$p" 2>/dev/null | tr -d ' ')
    [ -n "$c" ] && [ "$c" != "0.0" ] && return 1
  done
  return 0
}

# 1. the finished agent's worktree
if [ -n "$agent_id" ]; then
  wt="/.claude/worktrees/agent-${agent_id}"
  ps -Ao pid=,command= | while read -r pid cmd; do
    case "$cmd" in *"$wt"/*|*"$wt") kill_pid "$pid" "worktree $agent_id" ;; esac
  done
  lsof -d cwd -Fpn 2>/dev/null | awk -v wt="$wt" '
    /^p/ { pid = substr($0, 2) }
    /^n/ { if (index($0, wt "/") || substr($0, length($0) - length(wt) + 1) == wt) print pid }' |
    while read -r pid; do kill_pid "$pid" "cwd in worktree $agent_id"; done
fi

# 2. orphaned jest from any agent worktree
ps -Ao pid=,ppid=,command= | while read -r pid ppid cmd; do
  [ "$ppid" = "1" ] || continue
  case "$cmd" in *jest*/.claude/worktrees/*|*/.claude/worktrees/*jest*) kill_pid "$pid" "orphan jest" ;; esac
done

# 3. a node/npm jest process idle for 45+ minutes with its whole tree idle — a live run uses CPU
#    somewhere in its tree; shells that merely mention jest are never matched
ps -Ao pid=,etime=,pcpu=,command= | while read -r pid etime pcpu cmd; do
  case "$cmd" in "npm exec jest"*|node*jest*|*/node\ *jest*) ;; *) continue ;; esac
  tree_idle "$pid" || continue
  # etime: [[dd-]hh:]mm:ss
  secs=$(printf '%s' "$etime" | awk -F'[-:]' '{ n=NF; s=$n+60*$(n-1); if(n>=3) s+=3600*$(n-2); if(n>=4) s+=86400*$(n-3); print s }')
  [ "${secs:-0}" -ge 2700 ] && kill_pid "$pid" "idle jest ${etime}"
done
exit 0
