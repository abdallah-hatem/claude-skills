---
name: build-software
description: Use when the user runs /build-software to take a product from idea to a tested, deployed app — intake, spec, business doc, API contract, plan, backend, frontend, verification, and deploy — on the NestJS + Next.js stack.
disable-model-invocation: true
---

# Build Software

The pipeline from an idea to a deployed app. This skill owns the **order**, the **gates**, and
**which skill to load when** — not the rules. Those live in the stack skills, loaded at the
stage that needs them, never all up front.

**In an existing repo, read its `CLAUDE.md` and `docs/BUSINESS_LOGIC.md` first.** The repo's
branching, test commands, and verification steps override anything here.

## The business doc

`docs/BUSINESS_LOGIC.md` is the living source of truth for what the business is and how it
behaves. A spec is a dated record of one decision; this file is what is true **now**.

It holds:

- **The business** — what it does, for whom, and how it earns money
- **Roles** — who can do what
- **Entities and their rules** — the domain in business terms
- **Flows** — each process step by step, including what happens when a step fails
- **Invariants** — rules that must never break ("a paid booking is refunded, never deleted")
- **Money** — pricing, discounts, rounding, refunds
- **Scope** — what is built, what is **Planned**, and what is deliberately left out

Write it in business terms — no table names, endpoints, or components. Those belong to the spec
and the code, and a doc that mirrors them goes stale with every refactor.

Three rules keep it true:

1. **Read it before every task.** It is how a new session, or a subagent, recovers the business.
2. **Every behavior change updates it in the same commit** and bumps its `Last updated` line. A
   task that changes behavior without updating the doc is not done.
3. **When the business changes mid-build, the doc changes first.** Update it, run the alignment
   review on the plan to find the tasks the change affects, then change the code.

## Stages

| # | Stage | Load | Gate |
|---|---|---|---|
| 1 | Intake | `grilling` (or `superpowers:brainstorming`) | — |
| 2 | Spec + business doc | — | **user approves both** |
| 3 | Contract | `abdallah-skills:building-backends` | — |
| 4 | Plan | `superpowers:writing-plans` | **alignment review** |
| 5 | Build | `abdallah-skills:building-backends` / `building-frontends`, per task | **tests + alignment review** |
| 6 | Verify | `superpowers:verification-before-completion` | **all green** |
| 7 | Ship | `abdallah-skills:deploying-to-vercel` | **user says go** |

### 1. Intake

Ask only what changes the architecture: who it's for, what the first version includes, where it
runs, and whether it's multi-tenant. Decide everything smaller yourself with the recommended
default and record each choice in the spec. Intake is not a questionnaire about rounding rules.

### 2. Spec and business doc

Write `docs/specs/YYYY-MM-DD-<topic>.md`: users and roles, entities, flows, what is out of scope,
and the defaults chosen at intake. Then create `docs/BUSINESS_LOGIC.md` from it, or update it if
it already exists. **Stop for approval of both.** No code before they are agreed.

### 3. Contract

Before splitting work, fix the seam between backend and frontend: every endpoint, its DTO, and
its response shape inside the envelope. Write it into the spec. This is what lets the two sides
be built independently — and what stops them disagreeing when they meet.

### 4. Plan

Break the spec into tasks, each tagged `backend` / `frontend` / `infra` and each marked with what
it depends on — the dependency marks decide what can run in parallel. Then run the alignment
review on the plan, before any code is written.

### 5. Build

Backend tasks load `building-backends`; frontend tasks load `building-frontends`. Every task ships
with three kinds of test:

- **Unit** — the logic, branch by branch
- **Edge cases** — the checklist in the stack skill: empty and null input, bounds, duplicates,
  wrong state, pagination limits, access, and another user's data
- **Full flow** — the feature driven end to end the way a user would

One task, one commit, then the alignment review on that task's diff. Decide per batch whether to
run tasks inline or through subagents — see below.

### 6. Verify

Full test suite green, with the real output shown. Check that every task's three kinds of test
exist, not only that the suite passes — a suite with no edge-case tests passes too. For UI, drive
the changed flow in a browser at mobile and tablet, in LTR and RTL.

### 7. Ship

Push and deploy only on the user's explicit go-ahead.

## Alignment review

The `business-alignment-reviewer` agent ships with this plugin — subagent type
`abdallah-skills:business-alignment-reviewer`. Give it the business doc's path and either the
plan's path or the task's commit range. It reports; it never edits.

Run it:

- **after the plan**, before any code
- **after each task**, on that task's diff
- **after a business change**, on the plan, to find the tasks the change invalidated

Not after every step. A task is the smallest unit with a diff worth judging; reviewing smaller
pieces multiplies the cost without catching more.

| Verdict | Then |
|---|---|
| `ALIGNED` | continue |
| `CONFLICTS` | stop the task; fix the code — or, if the code is right and the doc is wrong, ask the user |
| `DOC OUT OF DATE` | update the doc in the same commit and review again |
| `NO BUSINESS DOC` | go back to stage 2 |

The reviewer finds disagreements; it doesn't decide which side is right. When code and doc
disagree because the business moved, that call belongs to the user.

## Subagents

Use them where they buy real parallelism or keep noise out of the main context — not by default.
Every subagent rebuilds context from scratch and multiplies token spend.

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

### Briefing a subagent

A subagent starts with none of this conversation, so the brief has to stand alone:

- **Goal and done-criteria** — the task from the plan, and what proves it is finished.
- **Scope** — the repo path, the files or domain it owns, and what it must not touch.
- **The skill to load first** — `building-backends` or `building-frontends`. It won't know to.
- **The business doc** — `docs/BUSINESS_LOGIC.md`, to read before starting.
- **The contract** it builds against, pasted in rather than pointed at.
- **Tests** — unit, edge-case, and full-flow, per the stack skill.
- **Run the test suite in the foreground and commit before reporting.** A subagent that starts a
  long test run in the background stops mid-turn and leaves its work uncommitted.
- **Report back** the files changed, the test command with its real output, and the commit hash.

### After it reports

Check, don't trust. Confirm the commit exists, re-run the tests yourself, and read the diff
against the contract. "All tests pass" with no output is a claim, not evidence.

## Red flags

- Code written before the spec and business doc are approved
- A behavior change committed without updating `docs/BUSINESS_LOGIC.md`
- A business change made in code before it is made in the doc
- Table names, endpoints, or components in the business doc
- Backend and frontend built in parallel before the API contract exists
- A task shipped without unit, edge-case, and full-flow tests
- A green suite accepted as proof when the edge-case tests don't exist
- A `CONFLICTS` verdict overridden without asking the user
- The alignment review run on every step instead of every task
- Every stack skill loaded at the start instead of at its stage
- A subagent spawned for a task smaller than its brief
- Parallel subagents editing the same files, or sharing one worktree
- A brief that doesn't say which skill to load
- A subagent running its tests in the background
- A subagent's "done" accepted without checking the commit and re-running the tests
- Pushing or deploying without the user's go-ahead
