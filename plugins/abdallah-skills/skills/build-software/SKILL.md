---
name: build-software
description: Use when the user runs /build-software to build a new app from idea to deployed — intake, spec, business doc, API contract, design system, plan, build, verify, ship — or to add a feature to an existing app through the lighter feature mode, on the NestJS + Next.js stack.
disable-model-invocation: true
---

# Build Software

The pipeline from an idea to a deployed app, and a shorter one for adding a feature to an app that
already exists. This skill owns the **order**, the **gates**, and **which skill to load when** —
not the rules. Those live in the stack skills, loaded at the stage that needs them, never all up
front.

**In an existing repo, read its `CLAUDE.md`, `docs/BUSINESS_LOGIC.md`, and `docs/DESIGN.md`
first.** The repo's branching, test commands, and verification steps override anything here.

## Modes

| | New app | Feature |
|---|---|---|
| **Use when** | the repo has no `docs/BUSINESS_LOGIC.md` yet | the repo already has a business doc and a design system |
| **Stages** | all eight, below | Context → Feature spec → Plan → Build → Verify → Ship |
| **Skips** | — | intake, the full contract, and the design system — it uses what exists |

Pick the mode from the repo, not from how the request is worded. If the request sounds like a new
app but the repo already has a business doc, ask which one is meant.

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

## Test credentials

Every login needed to test the app — local, preview, and production before launch — lives in
`CREDENTIALS.local.md` at the repo root, so the user can sign in to any environment without asking.

**It is never committed, and the repo is public.** Before writing a single value:

```bash
grep -qxF '*.local.md' .gitignore || echo '*.local.md' >> .gitignore
git check-ignore -q CREDENTIALS.local.md && echo "ignored — safe to write"
```

If that doesn't print, stop. A credential pushed to a public repo is exposed the moment it lands,
and deleting the file afterwards doesn't take it back.

```markdown
# Test credentials — never commit
Last updated: YYYY-MM-DD

## Local — http://localhost:3000
| Role  | Email            | Password | Notes                    |
|-------|------------------|----------|--------------------------|
| Owner | owner@test.local | …        | seeded by prisma/seed.ts |

## Preview — https://<app>-git-dev-<team>.vercel.app  (branch: dev)
| Role | Email | Password | Notes |

## Production — https://<app>.vercel.app  (branch: production)
| Role  | Email | Password | Notes                                   |
|-------|-------|----------|-----------------------------------------|
| Owner | …     | …        | pre-launch test account — remove at launch |
```

- **Test accounts only**, one per role. Never a real user's password.
- **Logins and URLs, not infrastructure secrets.** Database passwords and API keys live in
  `.env.local` and Vercel's environment settings.
- **Updated in the same step** that seeds an account, changes a password, or gives an environment
  a new URL.
- **Never copied** into a commit, a PR description, a code comment, a log, or a subagent brief.
- If the repo already keeps credentials under another gitignored name, follow the repo.

## Stages — new app

| # | Stage | Load | Gate |
|---|---|---|---|
| 1 | Intake | `grilling` (or `superpowers:brainstorming`) | — |
| 2 | Spec + business doc | — | **user approves both** |
| 3 | Contract | `abdallah-skills:building-backends` | — |
| 4 | Design system | `frontend-design` (or `epic-design` for a marketing site) | **user approves the look** |
| 5 | Plan | `superpowers:writing-plans` | **edge cases listed + alignment review** |
| 6 | Build | `abdallah-skills:building-backends` / `building-frontends`, per task | **tests + alignment review** |
| 7 | Verify | `superpowers:verification-before-completion` | **all green** |
| 8 | Ship | `abdallah-skills:deploying-to-vercel` | **dev: automatic after Verify · production: user says go** |

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

Before the first task, set up the repository and its `production` and `dev` branches —
[shipping.md](shipping.md) → Repository setup. Every task then happens on a `feature/<name>`
branch cut from `dev`.

Backend tasks load `building-backends`; frontend tasks load `building-frontends`. Every task ships
with three kinds of test:

- **Unit** — the logic, branch by branch
- **Edge cases** — every case the plan lists for this task, one test each, named after the case.
  A case discovered while building is added to the plan *and* tested; the list only grows.
- **Full flow** — the feature driven end to end the way a user would

One task, one commit, then the alignment review on that task's diff. Decide per batch whether to
run tasks inline or through subagents — see Subagents.

### 7. Verify

Full test suite green, with the real output shown. Then tick off each planned edge case against
the test that covers it, by test name. A case with no matching test fails verification, however
green the suite is. For UI, drive the changed flow in a browser at mobile and tablet, in LTR
and RTL, and in light and dark mode.

### 8. Ship

Everything reaches users by one path — full details in [shipping.md](shipping.md):

1. **feature → `dev`, by default.** Once Verify passes, open a PR into `dev` and merge it. `dev`
   deploys to the Vercel preview; confirm the deployment is Ready and walk the changed flow there.
2. **`dev` → `production`, on the user's go-ahead.** Open a release PR listing what's in it, then
   **stop.** Merging it is the production deploy, so it waits for the user.

Before each merge, migrations run deliberately against that environment's database, and
`CREDENTIALS.local.md` gets any new URL or test account.

## Feature mode

For adding a feature to an app that already has a business doc and a design system. The same
rules apply; the stages that set up the product are skipped.

### 1. Context

Read `CLAUDE.md`, `docs/BUSINESS_LOGIC.md`, `docs/DESIGN.md`, and the code the feature touches.
No intake interview — ask only what the docs and the code can't answer.

### 2. Feature spec

Write a short `docs/specs/YYYY-MM-DD-<feature>.md`:

- what the feature does, and for which roles
- the business rules it adds or changes — written as the exact edit to `docs/BUSINESS_LOGIC.md`
- new or changed endpoints, DTOs, and responses
- screens it adds or changes, built from the existing design system
- what is out of scope

**Stop for approval when the feature adds or changes a business rule, a role, money, or the data
model.** Otherwise summarise the spec and continue.

### 3. Plan

As new-app stage 5: tasks with dependencies, an edge-case list per task drawn from the business doc
first, then the alignment review on the plan.

### 4. Build

On a `feature/<name>` branch cut from `dev`, with the same three kinds of test and a per-task
alignment review. The business doc edit goes in the same PR as the code that makes it true.

### 5. Verify

As new-app stage 7 — every planned edge case matched to a named test, and the browser pass. Run the
**whole** suite, not only the new tests: a feature in an existing app is where unrelated flows break.

### 6. Ship

As new-app stage 8: PR into `dev` and merge, check the preview, then the release PR into
`production` on the user's go-ahead. New roles or test accounts go into `CREDENTIALS.local.md`.

**Switch to new-app mode** when the feature needs a new design direction, a new kind of user with
their own area of the product, or a change to how tenants are separated. Those are architecture,
not features.

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

Use them for independent tasks, broad investigations, and reviews — not by default, since each one
rebuilds context and multiplies token spend. Tasks that share files, depend on each other, are
small, or need the user stay in the main thread. Every brief stands alone, and every report is
checked rather than trusted.

When to use them, what a brief must contain, and how to check the result:
[subagents.md](subagents.md).

## Red flags

- Code written before the spec and business doc are approved
- Feature mode used in a repo with no business doc or design system
- A feature that changes a business rule, role, money, or the data model built without approval
- A behavior change committed without updating `docs/BUSINESS_LOGIC.md`, or in a different PR
- A business change made in code before it is made in the doc
- Table names, endpoints, or components in the business doc
- Backend and frontend built in parallel before the API contract exists
- Frontend screens built before the design system is approved
- A task in the plan with no edge-case list, or one drawn only from the generic checklist
- A rule in the business doc that must never break, with no test that tries to break it
- A task shipped without unit, edge-case, and full-flow tests
- A green suite accepted as proof without ticking each planned edge case against a named test
- A `CONFLICTS` verdict overridden without asking the user
- The alignment review run on every step instead of every task
- Every stack skill loaded at the start instead of at its stage
- A subagent brief or report that skips the rules in `subagents.md`
- `CREDENTIALS.local.md` written before `git check-ignore` confirms it is ignored
- A credential value in a commit, PR description, code comment, log, or brief
- A real user's password in the credentials file
- A PR merged into `dev` before Verify passes, or a direct push to `dev` or `production`
- A merge into `production` without the user's go-ahead
- A squash merge from `dev` into `production`
- A preview deployment that reads the production database or calls the production API
