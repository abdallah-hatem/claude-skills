#!/usr/bin/env python3
"""Claude Code statusline: 5-hour block burn tracker.

Reads all recent transcripts (so parallel sessions are counted), weights tokens
by real cost, reconstructs the current 5h block, and reports pace.

"Normal" and "heavy" are learned from his own recent blocks, not fixed: every scan
folds the blocks it can see into ~/.claude/.burn-history.json, and the median / 85th
percentile of the working blocks in the last 45 days become the thresholds. They drift
as his usage drifts. `--rebuild-history` replays every transcript to seed that file,
`--stats` prints what is currently learned.

Tunables (env):
  BURN_MEDIAN   pin the "normal" full block instead of learning it   (effective tokens)
  BURN_HEAVY    pin the "heavy" full block instead of learning it    (effective tokens)
  BURN_CTX_WARN context size that makes /clear worth it              (default 120000)
  BURN_HISTORY  path to the learned-history file
"""
import json, os, sys, glob, time

HOME = os.path.expanduser("~")
ROOT = os.path.join(HOME, ".claude", "projects")
CACHE = os.environ.get("BURN_CACHE") or os.path.join(HOME, ".claude", ".burn-cache.json")

FIVE_H = 5 * 3600
RETAIN = 12 * 3600
COLD_TAIL = 16 * 1024 * 1024   # on first sight of a big file, only read its tail

# effective-cost weights: what each token type actually costs vs a plain input token
W = {"input_tokens": 1.0, "cache_read_input_tokens": 0.1,
     "cache_creation_input_tokens": 2.0, "output_tokens": 5.0}

CTX_WARN = float(os.environ.get("BURN_CTX_WARN", 120000))

HISTORY = os.environ.get("BURN_HISTORY") or os.path.join(HOME, ".claude", ".burn-history.json")
HISTORY_DAYS = 45      # how far back a block still counts as "what he usually does"
MIN_BLOCKS = 6         # below this, the learned numbers are noise — fall back
WORKING_FLOOR = 2e6    # a block under this was idle, not a working block
FALLBACK_MEDIAN, FALLBACK_HEAVY = 30e6, 94e6

# set by refresh_thresholds(): the learned (or pinned) thresholds and how they were found
MEDIAN = HEAVY = 0.0
N_BLOCKS = 0
LEARNED = False

USE_COLOR = os.environ.get("NO_COLOR") is None
def c(code, s):
    return f"\033[{code}m{s}\033[0m" if USE_COLOR else s
DIM, GREEN, YELLOW, RED, BOLD = "2", "32", "33", "31", "1"


def parse_ts(s):
    # "2026-08-31T18:14:11.035Z" -> epoch seconds, without pulling in datetime parsing cost
    try:
        d, t = s[:19].split("T")
        y, mo, dy = int(d[0:4]), int(d[5:7]), int(d[8:10])
        hh, mm, ss = int(t[0:2]), int(t[3:5]), int(t[6:8])
        # days since epoch (civil algorithm, UTC)
        yy = y - (mo <= 2)
        era = (yy if yy >= 0 else yy - 399) // 400
        yoe = yy - era * 400
        doy = (153 * (mo + (-3 if mo > 2 else 9)) + 2) // 5 + dy - 1
        doe = yoe * 365 + yoe // 4 - yoe // 100 + doy
        days = era * 146097 + doe - 719468
        return days * 86400 + hh * 3600 + mm * 60 + ss
    except Exception:
        return None


def load_cache():
    try:
        with open(CACHE) as f:
            return json.load(f)
    except Exception:
        return {}


def scan():
    """Return (events, per_session_last, per_file_cache). events = [(epoch, eff, ctx)]."""
    cache = load_cache()
    now = time.time()
    fresh = {}
    events = []
    session_last = {}   # session file -> (last_epoch, last_ctx_tokens)

    for path in glob.glob(os.path.join(ROOT, "**", "*.jsonl"), recursive=True):
        try:
            st = os.stat(path)
        except OSError:
            continue
        if st.st_mtime < now - RETAIN:
            continue

        ent = cache.get(path)
        off = 0
        evs = []
        if ent and ent.get("size_seen", 0) <= st.st_size:
            off = ent.get("off", 0)
            evs = [e for e in ent.get("evs", []) if e[0] > now - RETAIN]
        elif st.st_size > COLD_TAIL:
            off = st.st_size - COLD_TAIL   # cold + huge: only read the tail

        try:
            with open(path, "rb") as f:
                f.seek(off)
                data = f.read()
        except OSError:
            continue

        # only consume up to the last complete line
        cut = data.rfind(b"\n")
        if cut == -1:
            fresh[path] = {"off": off, "size_seen": st.st_size, "evs": evs}
            events.extend(evs)
            continue
        consumed = data[: cut + 1]
        new_off = off + cut + 1

        first = True
        for raw in consumed.split(b"\n"):
            if off == 0 and first:
                first = False
            elif first:
                first = False
                continue   # mid-line garbage from a tail seek
            if b'"usage"' not in raw:
                continue
            try:
                o = json.loads(raw)
            except Exception:
                continue
            msg = o.get("message") or {}
            u = msg.get("usage")
            ts = o.get("timestamp")
            if not isinstance(u, dict) or not ts:
                continue
            ep = parse_ts(ts)
            if ep is None or ep < now - RETAIN:
                continue
            eff = 0.0
            for k, w in W.items():
                v = u.get(k)
                if v:
                    eff += w * float(v)
            if eff <= 0:
                continue
            ctx = float(u.get("cache_read_input_tokens") or 0) + float(u.get("input_tokens") or 0)
            evs.append([ep, eff, ctx])

        evs = [e for e in evs if e[0] > now - RETAIN]
        fresh[path] = {"off": new_off, "size_seen": st.st_size, "evs": evs}
        events.extend(evs)

    # derive per-session state from the cache, so it survives renders with no new
    # bytes. subagent logs roll up into their parent session rather than counting
    # as separate ones.
    for path, ent in fresh.items():
        if os.sep + "subagents" + os.sep in path:
            continue
        evs = ent.get("evs") or []
        if not evs:
            continue
        last = max(evs, key=lambda e: e[0])
        session_last[path] = (last[0], last[2] if len(last) > 2 else 0)

    try:
        tmp = CACHE + ".tmp"
        with open(tmp, "w") as f:
            json.dump(fresh, f)
        os.replace(tmp, CACHE)
    except Exception:
        pass

    return events, session_last, fresh


def replay_blocks(events):
    """[(start, end, total)] — 5h blocks the way Claude Code anchors them (floor to the hour)."""
    if not events:
        return []
    events.sort(key=lambda e: e[0])
    out = []
    start = end = None
    for ep, eff in ((e[0], e[1]) for e in events):
        if start is None or ep >= end:
            start = ep - (ep % 3600)
            end = start + FIVE_H
            out.append([start, end, 0.0])
        out[-1][2] += eff
    return [tuple(b) for b in out]


def current_block(events):
    blocks = replay_blocks(events)
    return blocks[-1] if blocks else None


def load_history():
    try:
        with open(HISTORY) as f:
            return json.load(f).get("blocks", {})
    except Exception:
        return {}


def record_blocks(events, now=None):
    """Fold the blocks this scan can see into the rolling history, and prune old ones."""
    now = now or time.time()
    blocks = load_history()
    for start, _end, total in replay_blocks(list(events)):
        k = str(int(start))
        # a scan only sees the last RETAIN hours, so an early view of a block can be
        # partial — never let it shrink what was already recorded
        blocks[k] = max(total, blocks.get(k, 0.0))
    cutoff = now - HISTORY_DAYS * 86400
    blocks = {k: v for k, v in blocks.items() if float(k) > cutoff}
    try:
        tmp = HISTORY + ".tmp"
        with open(tmp, "w") as f:
            json.dump({"blocks": blocks, "updated": now}, f)
        os.replace(tmp, HISTORY)
    except Exception:
        pass
    return blocks


def percentile(vals, q):
    if not vals:
        return 0.0
    s = sorted(vals)
    i = q * (len(s) - 1)
    lo, hi = int(i), min(int(i) + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (i - lo)


def refresh_thresholds(blocks=None, now=None):
    """Learn 'normal' and 'heavy' from his own finished working blocks. Env pins win."""
    global MEDIAN, HEAVY, N_BLOCKS, LEARNED
    now = now or time.time()
    if blocks is None:
        blocks = load_history()
    done = [v for k, v in blocks.items()
            if float(k) + FIVE_H < now and v >= WORKING_FLOOR]
    N_BLOCKS = len(done)
    LEARNED = N_BLOCKS >= MIN_BLOCKS
    median = percentile(done, 0.5) if LEARNED else FALLBACK_MEDIAN
    heavy = percentile(done, 0.85) if LEARNED else FALLBACK_HEAVY
    heavy = max(heavy, median * 1.5)   # "heavy" must stay clear of "normal"
    env_med, env_hvy = os.environ.get("BURN_MEDIAN"), os.environ.get("BURN_HEAVY")
    MEDIAN = float(env_med) if env_med else median
    HEAVY = float(env_hvy) if env_hvy else heavy
    if env_med or env_hvy:
        LEARNED = False
    return MEDIAN, HEAVY


def rebuild_history():
    """One-off: replay every transcript on disk to seed the learned history."""
    now = time.time()
    cutoff = now - HISTORY_DAYS * 86400
    events = []
    for path in glob.glob(os.path.join(ROOT, "**", "*.jsonl"), recursive=True):
        try:
            if os.stat(path).st_mtime < cutoff:
                continue
            with open(path, "rb") as f:
                for raw in f:
                    if b'"usage"' not in raw:
                        continue
                    try:
                        o = json.loads(raw)
                    except Exception:
                        continue
                    u = (o.get("message") or {}).get("usage")
                    ts = o.get("timestamp")
                    if not isinstance(u, dict) or not ts:
                        continue
                    ep = parse_ts(ts)
                    if ep is None or ep < cutoff:
                        continue
                    eff = sum(w * float(u.get(k) or 0) for k, w in W.items())
                    if eff > 0:
                        events.append([ep, eff, 0.0])
        except OSError:
            continue
    blocks = {str(int(s)): tot for s, _e, tot in replay_blocks(events)}
    try:
        tmp = HISTORY + ".tmp"
        with open(tmp, "w") as f:
            json.dump({"blocks": blocks, "updated": now, "rebuilt": now}, f)
        os.replace(tmp, HISTORY)
    except Exception:
        pass
    return blocks


def fmt_m(v):
    return f"{v/1e6:.1f}M" if v >= 1e5 else f"{v/1e3:.0f}k"


def main():
    try:
        stdin = json.load(sys.stdin) if not sys.stdin.isatty() else {}
    except Exception:
        stdin = {}

    events, session_last, _ = scan()
    refresh_thresholds(record_blocks(events))
    blk = current_block(events)
    if not blk:
        print(c(DIM, "5h block · idle"))
        return
    start, end, burned = blk

    now = time.time()
    elapsed = max(now - start, 60)
    left = max(end - now, 0)
    projected = burned * (FIVE_H / elapsed)

    if projected < MEDIAN:
        col, verdict = GREEN, "easy"
    elif projected < HEAVY:
        col, verdict = YELLOW, "normal"
    else:
        col, verdict = RED, "HEAVY"

    reset = time.strftime("%H:%M", time.localtime(end))
    bits = [
        c(DIM, f"{left/3600:.1f}h left"),
        c(col, f"{fmt_m(burned)} → ~{fmt_m(projected)} by {reset}"),
        c(BOLD + ";" + col, verdict),
    ]

    active = [p for p, (ep, _) in session_last.items() if ep > now - 900]
    if len(active) > 1:
        bits.append(c(RED, f"⧉{len(active)} sessions"))

    tpath = stdin.get("transcript_path")
    ctx = 0
    if tpath and tpath in session_last:
        ctx = session_last[tpath][1]
    elif len(active) == 1:
        ctx = session_last[active[0]][1]
    if ctx >= CTX_WARN:
        bits.append(c(RED, f"ctx {fmt_m(ctx)} ⚠ /clear"))
    elif ctx:
        bits.append(c(DIM, f"ctx {fmt_m(ctx)}"))

    print(" · ".join(bits))


if __name__ == "__main__":
    if "--rebuild-history" in sys.argv:
        blocks = rebuild_history()
        refresh_thresholds(blocks)
        print(f"rebuilt {len(blocks)} blocks over the last {HISTORY_DAYS} days")
    if "--stats" in sys.argv or "--rebuild-history" in sys.argv:
        refresh_thresholds()
        src = f"learned from {N_BLOCKS} working blocks" if LEARNED else "fallback / pinned"
        print(f"normal ~{fmt_m(MEDIAN)} · heavy ~{fmt_m(HEAVY)} ({src})")
    else:
        main()
