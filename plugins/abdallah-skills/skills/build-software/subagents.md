# Subagents

Use them where they buy real parallelism or keep noise out of the main context. Every subagent
rebuilds context from scratch and multiplies token spend — so batch small work, and run independent
work at the same time rather than one task after another.

## When

**Build tasks run in subagents** — that is what keeps a long run's main thread small. Each task's file
reads, test output, and debugging are discarded when the subagent reports back.

- **Related small tasks go into one subagent together.** A brief for a two-line change costs more than
  the change; five of them in one brief doesn't.
- **Tasks that depend on each other run one after another**, each in its own subagent.
- **Independent tasks run in parallel**, each in its own worktree, or they overwrite each other's
  changes. Backend and frontend tasks become independent once the Contract stage has fixed the API.
- **Broad investigations and reviews** also go to subagents — only the conclusion comes back.

**Stay in the main thread for anything that needs the user:** intake, approvals, any open decision. A
subagent cannot ask the user anything.

## The parallel check — before every dispatch

Run it before the first task and again every time a subagent reports back — not only when parallel
work looks likely:

1. **Ready tasks** — every task whose dependencies are committed and checked (and, for frontend work,
   whose contract exists).
2. **Separate the ones that collide.** Two ready tasks can't run side by side when they edit the same
   files. The usual shared ones: `prisma/schema.prisma` and migrations, `package.json` and the
   lockfile, shared layouts and navigation, the i18n locale files, the generated API client — and a
   signature change to a symbol another ready task calls (`graft callers <symbol> --depth all`). Colliding
   tasks go into one subagent together, or one waits for the next wave.
3. **Dispatch the rest in one message** — one `Agent` call per task (or batch), each with
   `isolation: "worktree"` and its own `feature/<name>` branch, at most five at once. A task that
   depends on an earlier wave's task is cut from that task's branch, or from a local merge of several,
   not from `dev` — nothing is pushed before Ship.
4. **Log the wave** in the build log, including what waits and why:
   `Wave 3: T4 T5 T6 T7 in parallel · T8 waits on T4 · T9 after T6 (both edit ar.json)`. One ready
   task is still a wave: `Wave 5: T11 alone — T10 not done`.

**`superpowers:subagent-driven-development` dispatches implementers one at a time.** Use its brief and
review loop for each task, but let the parallel check decide what is dispatched together.

**Parallel agents share one machine.** Inside a worktree, a subagent runs its unit and component
tests only. Anything that binds a port, starts a dev server, or migrates the local database — e2e and
smoke specs, `prisma migrate` — waits until the wave is back, and the main thread runs it once on the
merged result.

## Briefing a subagent

A subagent starts with none of this conversation, so the brief has to stand alone:

- **Goal and done-criteria** — the task from the plan, and what proves it is finished.
- **Scope** — the repo path, the `feature/<name>` branch or worktree it works in, the files or
  domain it owns, and what it must not touch.
- **The skill to load first** — `building-backends` or `building-frontends`. It won't know to.
- **The Graft block** — subagents don't get the repo map or the per-prompt pointers Graft injects
  into the main session, so without it they explore file by file ([graft.md](graft.md)):
  - In a worktree, run `DO_NOT_TRACK=1 graft build` at its root first, then use the CLI there
    (`graft ask`, `graft skeleton <file>`) — not the `graft_*` MCP tools, which read the main checkout.
    Outside a worktree, `graft_repo_map` and `graft_find_code` work.
  - Query Graft before reading a file.
  - Before changing a symbol other code uses: `graft callers <symbol> --depth all`, and update every
    caller it returns.
  - Prefix every `graft` command with `DO_NOT_TRACK=1`. Never `graft build --deep`.
  - End the report with the tokens-saved line from `DO_NOT_TRACK=1 graft stats`.
- **The business doc** — `docs/BUSINESS_LOGIC.md`, to read before starting.
- **For frontend tasks, the design system** — `docs/DESIGN.md` and the tokens in `globals.css`.
  Screens use tokens only; no new colours, sizes, or curves.
- **The contract** it builds against, pasted in rather than pointed at.
- **The task's class and its tests** — `logic`: unit and full-flow tests plus **the edge-case list
  from the plan, pasted in**, one test per case named after it · `ui`: component tests for the
  behavior and a smoke spec · `surface`: no new tests.
- **No credentials.** Never paste values from `CREDENTIALS.local.md`. Tests that need a signed-in
  user create one in their own setup.
- **Run the test suite in the foreground and commit before reporting.** A subagent that starts a
  long test run in the background stops mid-turn and leaves its work uncommitted.
- **Don't push, open PRs, or merge.** Shipping happens once, from the main thread, after Verify.
- **Report back in ten lines or fewer:** the files changed, the test command with the runner's summary
  line and any failures in full, the commit hash, and the `graft stats` tokens-saved line. No narrative, no recap of the brief.
- **Keep test output quiet** — full log to a file, summary and failures only ([efficiency.md](efficiency.md)).

## After it reports

Check, don't trust — cheaply. Confirm the commit exists with `git show --stat`, re-run the tests with
quiet output, and for a `logic` task let the alignment review read the diff. "All tests pass" without
the runner's summary line is a claim, not evidence.

## Red flags

- A dispatch with no parallel check and no wave line in the build log before it
- Ready, independent tasks sent one per message, one after another
- A subagent spawned for one tiny task that could have been batched with others
- Parallel subagents editing the same files, or sharing one worktree
- Parallel subagents each running e2e specs, dev servers, or migrations on the same machine
- A brief that doesn't say which skill to load, or has no Graft block
- A frontend brief that doesn't point the subagent at the design system
- A brief that contains a credential value
- A subagent running its tests in the background
- A subagent that pushes, opens a PR, or merges
- A subagent's "done" accepted without checking the commit and re-running the tests
- A report longer than about ten lines, or one that pastes a full test log
