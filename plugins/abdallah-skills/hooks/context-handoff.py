#!/usr/bin/env python3
"""Stop + PreToolUse — write the handoff BEFORE auto-compaction, while the full context exists.

Sessions auto-compact at CLAUDE_AUTOCOMPACT_PCT_OVERRIDE (70% here). When the main session's
context passes HANDOFF_AT_PCT (default 60%) of the window, this hook interrupts once — the next
tool call is denied, or the stop is held — with the instruction to write the state down: the
docs/BUILD_LOG.md in a /build-software run, otherwise ~/.claude/handoffs/<repo>.md. Then work
continues; nothing waits for the user, so unattended runs keep going.

Fires once per compaction cycle: it re-arms when the context drops below 40% (after a compaction
or /clear). Skips subagents (agent_id set) and sessions with no transcript. Never blocks on error.

Window size: HANDOFF_CONTEXT_WINDOW (tokens), else 1,000,000 once the transcript has passed
200k, else 200,000.
"""
import json, os, subprocess, sys

REARM_BELOW = 0.40


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        return
    event = data.get("hook_event_name", "")
    if data.get("agent_id"):
        return  # a subagent's tool call — its context is its own
    if event == "Stop" and data.get("stop_hook_active"):
        return
    transcript = data.get("transcript_path") or ""
    if not transcript or not os.path.isfile(transcript):
        return

    ctx, peak = context_tokens(transcript)
    if ctx <= 0:
        return
    window = int(os.environ.get("HANDOFF_CONTEXT_WINDOW") or (1_000_000 if peak > 200_000 else 200_000))
    at = float(os.environ.get("HANDOFF_AT_PCT") or 60) / 100
    frac = ctx / window

    state_dir = os.path.expanduser("~/.claude/handoffs/.state")
    os.makedirs(state_dir, exist_ok=True)
    state = os.path.join(state_dir, (data.get("session_id") or "unknown") + ".json")
    fired = False
    try:
        fired = json.load(open(state)).get("fired", False)
    except Exception:
        pass

    if frac < REARM_BELOW and fired:
        json.dump({"fired": False}, open(state, "w"))
        return
    if frac < at or fired:
        return
    json.dump({"fired": True, "at_tokens": ctx}, open(state, "w"))

    cwd = data.get("cwd") or os.getcwd()
    root = git_root(cwd) or cwd
    log = os.path.join(root, "docs", "BUILD_LOG.md")
    pct = round(frac * 100)
    if os.path.isfile(log):
        target = (f"bring {log} up to date — Current stage, every finished task and wave, new decisions "
                  f"with their reasons, and anything Blocked")
    else:
        note = os.path.expanduser("~/.claude/handoffs/") + root.strip("/").replace("/", "-") + ".md"
        target = (f"update the handoff note at {note} — only the part above its \"## Facts\" line (create it "
                  f"with a \"# Handoff — <repo>\" title if missing): the goal in the user's words, what is "
                  f"done (with commit hashes), what is in progress (branch, files, running commands), "
                  f"decisions and why, and the exact next step, in at most 15 lines")
    reason = (f"Context is at {pct}% and the session will auto-compact soon, losing detail. Before anything "
              f"else, {target}. Then carry on with the work exactly where you were — do not stop, do not "
              f"ask the user anything, and do not mention this in your reply.")

    if event == "PreToolUse":
        print(json.dumps({"hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }}))
    elif event == "Stop":
        print(json.dumps({"decision": "block", "reason": reason}))


def context_tokens(path, tail=2_000_000):
    """(current, peak) context tokens of the main thread, from the transcript's last ~2 MB."""
    size = os.path.getsize(path)
    with open(path, "rb") as f:
        f.seek(max(0, size - tail))
        lines = f.read().splitlines()
    current, peak = 0, 0
    for raw in lines:
        if b'"usage"' not in raw or b'"assistant"' not in raw:
            continue
        try:
            o = json.loads(raw)
        except Exception:
            continue
        if o.get("type") != "assistant" or o.get("isSidechain"):
            continue
        m = o.get("message") or {}
        u = m.get("usage")
        if not u or m.get("model") == "<synthetic>":
            continue
        c = (u.get("input_tokens") or 0) + (u.get("cache_creation_input_tokens") or 0) \
            + (u.get("cache_read_input_tokens") or 0)
        current = c
        peak = max(peak, c)
    return current, peak


def git_root(cwd):
    try:
        return subprocess.run(["git", "-C", cwd, "rev-parse", "--show-toplevel"],
                              capture_output=True, text=True, timeout=2).stdout.strip() or None
    except Exception:
        return None


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass  # never block a tool call or a stop because the guard broke
    sys.exit(0)
