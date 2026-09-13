# Subagents

Use them where they buy real parallelism or keep noise out of the main context — not by default.
Every subagent rebuilds context from scratch and multiplies token spend.

## When

**Build tasks run in subagents** — that is what keeps a long run's main thread small. Each task's file
reads, test output, and debugging are discarded when the subagent reports back.

- **Related small tasks go into one subagent together.** A brief for a two-line change costs more than
  the change; five of them in one brief doesn't.
- **Tasks that depend on each other run one after another**, each in its own subagent.
- **Independent tasks run in parallel**, each in its own worktree (`superpowers:using-git-worktrees`),
  or they overwrite each other's changes. Backend and frontend tasks become independent once the
  Contract stage has fixed the API. For many at once: `superpowers:subagent-driven-development`.
- **Broad investigations and reviews** also go to subagents — only the conclusion comes back.

**Stay in the main thread for anything that needs the user:** intake, approvals, any open decision. A
subagent cannot ask the user anything.

## Briefing a subagent

A subagent starts with none of this conversation, so the brief has to stand alone:

- **Goal and done-criteria** — the task from the plan, and what proves it is finished.
- **Scope** — the repo path, the `feature/<name>` branch or worktree it works in, the files or
  domain it owns, and what it must not touch.
- **The skill to load first** — `building-backends` or `building-frontends`. It won't know to.
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
  line and any failures in full, and the commit hash. No narrative, no recap of the brief.
- **Keep test output quiet** — full log to a file, summary and failures only ([efficiency.md](efficiency.md)).

## After it reports

Check, don't trust — cheaply. Confirm the commit exists with `git show --stat`, re-run the tests with
quiet output, and for a `logic` task let the alignment review read the diff. "All tests pass" without
the runner's summary line is a claim, not evidence.

## Red flags

- A subagent spawned for one tiny task that could have been batched with others
- Parallel subagents editing the same files, or sharing one worktree
- A brief that doesn't say which skill to load
- A frontend brief that doesn't point the subagent at the design system
- A brief that contains a credential value
- A subagent running its tests in the background
- A subagent that pushes, opens a PR, or merges
- A subagent's "done" accepted without checking the commit and re-running the tests
- A report longer than about ten lines, or one that pastes a full test log
