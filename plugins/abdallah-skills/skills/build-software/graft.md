# Graft

[Graft](https://github.com/NanoNets/Graft) builds a local graph of the repo — who calls what, plus a
short card per file — so an agent finds code with a query instead of reading file after file. It
parses with tree-sitter, runs on this machine, and needs no key.

**Every run uses it** — wired in at Build setup, or at the Context stage in feature mode. If the
install fails (no npm, no network), log `Graft: off — <reason>` in the build log and carry on reading
files; don't stop the run over it.

## What to expect

| Repo | Payoff |
|---|---|
| An existing app of tens of thousands of lines, or a monorepo | large — exploring the code is where the tokens go |
| A new app | small at first; the graph starts nearly empty and pays off as the code grows |
| A few thousand lines | about break-even — still on, so every run works the same way |

## Wiring it in

Once per repo. A repo that already has a `graft/` folder and a `graft` entry in `.mcp.json` is wired —
skip this.

```bash
command -v graft >/dev/null || npm install -g @nanonets/graft
graft telemetry disable
graft init --no-agents --no-global --no-statusline .
```

- **`--no-agents`** — Claude Code wiring only; no `AGENTS.md`, Cursor, or Copilot files.
- **`--no-global`** — nothing is written outside the repo.
- **`--no-statusline`** — the user's own status line stays.
- **Telemetry off** — Graft sends anonymous usage stats unless told not to.

`init` writes `.mcp.json`, hooks in `.claude/settings.json`, `.claude/helpers/`, `.claude/skills/graft/`,
`.ignore`, and a `.gitignore` entry for the `graft/` cache. The graph builds in seconds and brings itself
up to date on every query — nothing to rebuild by hand.

**The MCP tools arrive in the next session, not this one.** Claude Code loads `.mcp.json` when a session
starts, and asks the user once to approve a project's MCP servers. Until then, use the CLI through Bash
(`graft ask`, `graft callers`, `graft skeleton`). In a guided run, mention the restart at the next gate.

**Committing the wiring.** In the user's own repos, commit it — any fresh clone gets Graft after a
`graft build`. In a repo the user doesn't own, such as a client's, keep it out of every commit: add the
untracked files to `.git/info/exclude`, and leave a tracked `.claude/settings.json` that `init` changed
unstaged.

## Using it

- **Query before reading.** `graft_repo_map` to get oriented, `graft_find_code` or `graft ask "<task>"` to
  locate code, `graft_file_api` or `graft skeleton <file>` for a file's signatures without the bodies.
- **Scope a change before making it.** `graft_trace_calls`, or `graft callers <symbol> --depth all`, for
  everything that depends on a symbol; `graft blast` on a diff.
- **Subagents don't get Graft's automatic context.** The repo map injected at session start and the
  pointers injected for each prompt reach only the main session, so every brief carries the Graft block
  ([subagents.md](subagents.md)).
- **Prefix every `graft` command with `DO_NOT_TRACK=1`**, on top of `graft telemetry disable` — a
  worktree or a fresh machine may not have the setting.

## In a worktree

Parallel subagents work in worktrees, where Graft needs two adjustments:

1. **Build the graph there first.** The `graft/` cache is gitignored, so a new worktree has none.
   `DO_NOT_TRACK=1 graft build` at the worktree root takes seconds and needs no key.
2. **Use the CLI, not the `graft_*` MCP tools.** The MCP server the session loaded reads the main
   checkout, which doesn't have the wave's changes. From the worktree root: `graft ask`, `graft skeleton
   <file>`, `graft callers <symbol> --depth all`, `graft blast`.
- **`graft stats`** shows how much of a session went through Graft and the tokens it estimates were saved.
- **Never run `graft build --deep`.** It sends source code to an LLM provider and costs money — neither is
  part of what the user agreed to.

## Red flags

- A run that explores the code file by file because Graft was never wired in
- `graft init` without `--no-global`, or with telemetry left on
- `graft build --deep`
- Graft's wiring committed to a repo the user doesn't own
- A subagent brief without the Graft block
- A worktree subagent using the `graft_*` MCP tools, or querying before `graft build`
- A `graft` command without `DO_NOT_TRACK=1`
- Waiting on the MCP tools in the same session that ran `init`, instead of using the CLI
