---
name: build-software
description: Use when the user runs /build-software to take a product from idea to a tested, deployed app — intake, spec, API contract, plan, backend, frontend, verification, and deploy — on the NestJS + Next.js stack.
disable-model-invocation: true
---

# Build Software

The pipeline from an idea to a deployed app. This skill owns the **order**, the **gates**, and
**which skill to load when** — not the rules. Those live in the stack skills, loaded at the
stage that needs them, never all up front.

**In an existing repo, read its `CLAUDE.md` first.** Its branching, test commands, and
verification steps override anything here.

## Stages

| # | Stage | Load | Gate |
|---|---|---|---|
| 1 | Intake | `grilling` (or `superpowers:brainstorming`) | — |
| 2 | Spec | — | **user approves** |
| 3 | Contract | `abdallah-skills:building-backends` | — |
| 4 | Plan | `superpowers:writing-plans` | — |
| 5 | Build | `abdallah-skills:building-backends` / `building-frontends`, per task | — |
| 6 | Verify | `superpowers:verification-before-completion` | **all green** |
| 7 | Ship | `abdallah-skills:deploying-to-vercel` | **user says go** |

### 1. Intake

Ask only what changes the architecture: who it's for, what the first version includes, where
it runs, and whether it's multi-tenant. Decide everything smaller yourself with the recommended
default and record each choice in the spec. Intake is not a questionnaire about rounding rules.

### 2. Spec

Write `docs/specs/YYYY-MM-DD-<topic>.md`: users and roles, entities, flows, what is out of
scope, and the defaults chosen at intake. **Stop for approval.** No code before it is agreed.

### 3. Contract

Before splitting work, fix the seam between backend and frontend: every endpoint, its DTO, and
its response shape inside the envelope. Write it into the spec. This is what lets the two sides
be built independently — and what stops them disagreeing when they meet.

### 4. Plan

Break the spec into tasks, each tagged `backend` / `frontend` / `infra` and each marked with
what it depends on. The dependency marks decide what can run in parallel.

### 5. Build

Backend tasks load `building-backends`; frontend tasks load `building-frontends`. One task, one
commit. Decide per batch whether to run it inline or through subagents — see below.

### 6. Verify

Full test suite green, with the real output shown. For UI, drive the changed flow in a browser
at mobile and tablet, in LTR and RTL. A task is done when the flow works, not when its tests do.

### 7. Ship

Push and deploy only on the user's explicit go-ahead.

## Subagents

Use them where they buy real parallelism or keep noise out of the main context — not by
default. Every subagent rebuilds context from scratch and multiplies token spend.

**Use a subagent when:**

- Tasks are independent: no shared files, no task waiting on another's output. Backend and
  frontend tasks become independent once the Contract stage has fixed the API.
- An investigation sweeps many files and only the conclusion matters.
- Reviewing a finished task — a fresh context catches what the author's context explains away.
- A plan has many independent tasks → `superpowers:subagent-driven-development`.

**Stay in the main thread when:**

- Two tasks touch the same files, or one needs the other's result.
- The task is small — writing the brief costs more than doing the work.
- The stage needs the user: intake, spec approval, any open decision. A subagent cannot ask
  the user anything.

**Parallel subagents in one repo each get their own worktree** (`superpowers:using-git-worktrees`),
or they overwrite each other's changes.

### Briefing a subagent

A subagent starts with none of this conversation, so the brief has to stand alone:

- **Goal and done-criteria** — the task from the plan, and what proves it is finished.
- **Scope** — the repo path, the files or domain it owns, and what it must not touch.
- **The skill to load first** — `building-backends` or `building-frontends`. It won't know to.
- **The contract** it builds against, pasted in rather than pointed at.
- **Run the test suite in the foreground and commit before reporting.** A subagent that starts
  a long test run in the background stops mid-turn and leaves its work uncommitted.
- **Report back** the files changed, the test command with its real output, and the commit hash.

### After it reports

Check, don't trust. Confirm the commit exists, re-run the tests yourself, and read the diff
against the contract. "All tests pass" with no output is a claim, not evidence.

## Red flags

- Code written before the spec is approved
- Backend and frontend built in parallel before the API contract exists
- Every stack skill loaded at the start instead of at its stage
- A subagent spawned for a task smaller than its brief
- Parallel subagents editing the same files, or sharing one worktree
- A brief that doesn't say which skill to load
- A subagent running its tests in the background
- A subagent's "done" accepted without checking the commit and re-running the tests
- Pushing or deploying without the user's go-ahead
