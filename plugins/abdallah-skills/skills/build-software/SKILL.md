---
name: build-software
description: Use when the user runs /build-software to take a product from idea to a tested, deployed app — intake, spec, business doc, API contract, design system, plan, backend, frontend, verification, and deploy — on the NestJS + Next.js stack.
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
| 4 | Design system | `frontend-design` (or `epic-design` for a marketing site) | **user approves the look** |
| 5 | Plan | `superpowers:writing-plans` | **edge cases listed + alignment review** |
| 6 | Build | `abdallah-skills:building-backends` / `building-frontends`, per task | **tests + alignment review** |
| 7 | Verify | `superpowers:verification-before-completion` | **all green** |
| 8 | Ship | `abdallah-skills:deploying-to-vercel` | **user says go** |

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

### 4. Design system

Skip this only when the project already has one. Load `frontend-design` — or `epic-design` for a
marketing site — and set the direction from the spec: who the users are and what the product
should feel like. Then put it into code before any screen exists, following
`building-frontends` → `design-system.md`:

- colour tokens in `globals.css` for light and dark, mapped into Tailwind
- fonts through `next/font`, covering Arabic
- the easing curve and durations in the theme and `lib/motion.ts`
- `docs/DESIGN.md` with the feel, colour roles, type, motion, and what to avoid — no values

Show the user the palette, the type scale, and one representative screen in light and dark — a
preview page, or a mockup through the `design` skill. **Stop for approval.** A look agreed now
is cheap; a look changed after twenty screens is a rewrite.

### 5. Plan

Break the spec into tasks, each tagged `backend` / `frontend` / `infra` and each marked with what
it depends on — the dependency marks decide what can run in parallel.

**Every task lists its edge cases in the plan, before any code is written.** Derive them from
three sources, in this order:

| Source | Rule |
|---|---|
| **Business doc** | every invariant the task touches gets a test that tries to break it · every failure path in its flows gets a test · every money rule gets boundary tests · every role gets a test proving a role without the permission is refused |
| **Contract** | every request field the task accepts: missing, `null`, wrong type, at the limit, one past the limit |
| **Stack checklist** | the generic cases in `building-backends` → `testing.md`, or `building-frontends` → Testing |

Write each case as one line with its expected outcome and where it came from:

```markdown
#### Task 7 — Cancel a booking (backend)
Edge cases:
- [ ] Cancel a booking whose wash has started → 409, status unchanged   (invariant: cancel only before start)
- [ ] Cancel another customer's booking → 404                            (role: customers see only their own)
- [ ] Cancel a paid booking → refund created for the full amount         (money: cancellation refunds in full)
- [ ] Cancel an already-cancelled booking → 409                          (checklist: wrong state)
- [ ] Unknown booking id → 404                                           (checklist: not found)
```

Business-doc cases come first because no generic checklist can produce them. The source in
brackets shows why each case is there — and makes a missing one easy to spot.

Keep the edge-case lists in the plan file and include them when you summarise the plan, so the
user sees them before any code and can add one that was missed. Then run the alignment review
on the plan.

### 6. Build

Backend tasks load `building-backends`; frontend tasks load `building-frontends`. Every task ships
with three kinds of test:

- **Unit** — the logic, branch by branch
- **Edge cases** — every case the plan lists for this task, one test each, named after the case.
  A case discovered while building is added to the plan *and* tested; the list only grows.
- **Full flow** — the feature driven end to end the way a user would

One task, one commit, then the alignment review on that task's diff. Decide per batch whether to
run tasks inline or through subagents — see below.

### 7. Verify

Full test suite green, with the real output shown. Then tick off each planned edge case against
the test that covers it, by test name. A case with no matching test fails verification, however
green the suite is. For UI, drive the changed flow in a browser at mobile and tablet, in LTR
and RTL, and in light and dark mode.

### 8. Ship

Push and deploy only on the user's explicit go-ahead.

## Alignment review

The `business-alignment-reviewer` agent ships with this plugin — subagent type
`abdallah-skills:business-alignment-reviewer`. Give it the business doc's path and either the
plan's path or the task's commit range. It reports; it never edits.

Run it:

- **after the plan**, before any code — including whether the edge cases cover every rule in the doc
- **after each task**, on that task's diff — including whether each planned edge case has a test
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
- **For frontend tasks, the design system** — `docs/DESIGN.md` and the tokens in `globals.css`.
  Screens use tokens only; no new colours, sizes, or curves.
- **The contract** it builds against, pasted in rather than pointed at.
- **Tests** — unit and full-flow, plus **the task's edge-case list from the plan, pasted in** —
  one test per case, named after it.
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
- A task in the plan with no edge-case list
- Edge cases taken only from the generic checklist, none from the business doc
- A rule in the business doc that must never break, with no test that tries to break it
- A planned edge case ticked off without a test named for it
- A green suite accepted as proof without ticking each planned edge case against a test
- A `CONFLICTS` verdict overridden without asking the user
- The alignment review run on every step instead of every task
- Every stack skill loaded at the start instead of at its stage
- A subagent spawned for a task smaller than its brief
- Parallel subagents editing the same files, or sharing one worktree
- A brief that doesn't say which skill to load
- A subagent running its tests in the background
- A subagent's "done" accepted without checking the commit and re-running the tests
- Pushing or deploying without the user's go-ahead
- Frontend screens built before the design system is approved
- A frontend brief that doesn't point the subagent at the design system
