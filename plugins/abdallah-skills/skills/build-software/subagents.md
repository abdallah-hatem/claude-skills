# Subagents

Use them where they buy real parallelism or keep noise out of the main context — not by default.
Every subagent rebuilds context from scratch and multiplies token spend.

## When

**Use a subagent when:**

- Tasks are independent: no shared files, no task waiting on another's output. Backend and
  frontend tasks become independent once the Contract stage has fixed the API.
- An investigation sweeps many files and only the conclusion matters.
- Reviewing a finished task — a fresh context catches what the author's context explains away.
- A plan has many independent tasks → `superpowers:subagent-driven-development`.

**Stay in the main thread when:**

- Two tasks touch the same files, or one needs the other's result.
- The task is small — writing the brief costs more than doing the work.
- The stage needs the user: intake, spec approval, any open decision. A subagent cannot ask the
  user anything.

**Parallel subagents in one repo each get their own worktree** (`superpowers:using-git-worktrees`),
or they overwrite each other's changes.

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
- **Tests** — unit and full-flow, plus **the task's edge-case list from the plan, pasted in** —
  one test per case, named after it.
- **No credentials.** Never paste values from `CREDENTIALS.local.md`. Tests that need a signed-in
  user create one in their own setup.
- **Run the test suite in the foreground and commit before reporting.** A subagent that starts a
  long test run in the background stops mid-turn and leaves its work uncommitted.
- **Don't push, open PRs, or merge.** Shipping happens once, from the main thread, after Verify.
- **Report back** the files changed, the test command with its real output, and the commit hash.

## After it reports

Check, don't trust. Confirm the commit exists, re-run the tests yourself, and read the diff
against the contract. "All tests pass" with no output is a claim, not evidence.

## Red flags

- A subagent spawned for a task smaller than its brief
- Parallel subagents editing the same files, or sharing one worktree
- A brief that doesn't say which skill to load
- A frontend brief that doesn't point the subagent at the design system
- A brief that contains a credential value
- A subagent running its tests in the background
- A subagent that pushes, opens a PR, or merges
- A subagent's "done" accepted without checking the commit and re-running the tests
