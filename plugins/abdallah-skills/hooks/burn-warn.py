#!/usr/bin/env python3
"""UserPromptSubmit hook: warn when the 5-hour window is burning too fast.

Silent unless the pace is actually bad, so it costs nothing on a normal day.
Re-warns at most every 10 minutes, or immediately if severity gets worse.
"""
import os, sys, json, time, importlib.util

HOME = os.path.expanduser("~")
STATE = os.path.join(HOME, ".claude", ".burn-warn-state.json")
COOLDOWN = 600

try:
    spec = importlib.util.spec_from_file_location(
        "burn", os.path.join(HOME, ".claude", "statusline-burn.py"))
    burn = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(burn)

    events, session_last, fresh = burn.scan()
    blk = burn.current_block(events)
    if not blk:
        sys.exit(0)

    start, end, burned = blk
    now = time.time()
    elapsed = max(now - start, 60)
    projected = burned * (burn.FIVE_H / elapsed)

    # how far through the window vs how much of a usual block is already gone
    time_frac = elapsed / burn.FIVE_H
    burn_frac = burned / burn.MEDIAN

    if projected >= burn.HEAVY:
        sev, word = 2, "BURNING HOT"
    elif burn_frac > time_frac * 1.25 and burned > burn.MEDIAN * 0.25:
        sev, word = 1, "running fast"
    else:
        sev = 0

    if sev == 0:
        sys.exit(0)

    try:
        st = json.load(open(STATE))
    except Exception:
        st = {}
    if st.get("block") == start and sev <= st.get("sev", 0) and now - st.get("at", 0) < COOLDOWN:
        sys.exit(0)
    try:
        json.dump({"block": start, "sev": sev, "at": now}, open(STATE, "w"))
    except Exception:
        pass

    n_active = sum(1 for p, (ep, _) in session_last.items() if ep > now - 900)
    big_ctx = [c for _, (ep, c) in session_last.items() if ep > now - 900 and c >= burn.CTX_WARN]

    m = lambda v: f"{v/1e6:.0f}M"
    bits = [f"5h window {word}: {m(burned)} burned, on pace for ~{m(projected)} by "
            f"{time.strftime('%H:%M', time.localtime(end))} (a usual block is ~{m(burn.MEDIAN)})."]
    if n_active > 1:
        bits.append(f"{n_active} sessions running at once.")
    if big_ctx:
        bits.append(f"{len(big_ctx)} session(s) over {burn.CTX_WARN/1000:.0f}k context — /clear would cut the per-turn cost a lot.")
    bits.append("Tell Abdallah this at the START of your reply, in one short line, then carry on with what he asked.")

    print("[burn-monitor] " + " ".join(bits))
except Exception:
    sys.exit(0)   # never block a prompt because the monitor broke
