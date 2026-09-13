---
name: build-software
description: Use when the user runs /build-software to build a new app from idea to deployed — intake, spec, business doc, API contract, design system, plan, build, verify, ship — or to add a feature to an existing app through the lighter feature mode — guided, or fully autonomous — on the NestJS + Next.js stack.
disable-model-invocation: true
---

# Build Software

The pipeline from an idea to a deployed app, and a shorter one for adding a feature to an app that
already exists. This skill owns the **order**, the **gates**, and **which skill to load when** —
not the rules. Those live in the stack skills, loaded at the stage that needs them, never all up
front.

**In an existing repo, read its `CLAUDE.md`, `docs/BUSINESS_LOGIC.md`, and `docs/DESIGN.md`
first.** The repo's branching, test commands, and verification steps override anything here.

## Not for this skill

This pipeline builds a product or adds a feature to one. Most changes are neither, and pushing them
through six or eight stages wastes hours and tokens.

| Change | Do this instead |
|---|---|
| **A bug** | `superpowers:systematic-debugging` — reproduce it, write a test that fails, fix it, then a `fix/<name>` PR into `dev` ([shipping.md](shipping.md)) |
| **A small change** — copy, a style tweak, a config value, a dependency bump | a `chore/<name>` branch, a visual check, the same PR into `dev` |
| **A refactor** that changes no behavior | the existing tests pass before and after; no spec, no plan |
| **A question or an investigation** | answer it — there is nothing to ship |

The test: **does it add or change what the product does for a user?** If not, it doesn't belong
here. A bug fix that turns out to change a business rule updates `docs/BUSINESS_LOGIC.md` in the
same PR — that still isn't a reason to run the pipeline.

## Run mode — ask first

Before anything else, ask with `AskUserQuestion` how the run should go:

- **Guided** — stops at every gate below that waits for the user.
- **Autonomous to preview** — decides every gate itself, ships to the `dev` preview, and ends at the
  release PR.
- **Fully autonomous** — decides every gate itself and doesn't stop until the app is live in
  production.

Skip the question if the invocation names the mode (`/build-software autonomous <goal>`), or if
`docs/BUILD_LOG.md` already records one — then resume from it. Autonomous runs log every decision in
`docs/BUILD_LOG.md`, and still stop for money, missing access, and irreversible data loss. Details:
[autonomous.md](autonomous.md).

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

Every test login — local, preview, and production before launch — goes in `CREDENTIALS.local.md` at
the repo root, so the user can sign in to any environment. **The repo is public, so the file is
never committed.** Before writing any value:

```bash
grep -qxF '*.local.md' .gitignore || echo '*.local.md' >> .gitignore
git check-ignore -q CREDENTIALS.local.md && echo "ignored — safe to write"
```

If that doesn't print, stop. Layout and rules: [credentials.md](credentials.md).

## Task classes

Not everything is worth testing, and not everything needs a business review. Every task in the plan
gets one class, and the class decides both:

| Class | Covers | Tests | Alignment review |
|---|---|---|---|
| **`logic`** | business rules, money, permissions, data writes, tenant isolation — anything the business doc names | unit, edge cases, full flow | after the task |
| **`ui`** | screens with behavior: forms, validation, conditional states, anything a user can get wrong | component tests for that behavior, plus a smoke spec | in the release review |
| **`surface`** | styling, copy, layout, static pages, config, dependency bumps | none — the smoke screenshots are the check | in the release review |

- **When unsure, go up a class.** A task is `logic` if breaking it would be wrong for the business,
  not merely ugly.
- **A screen that enforces a business rule is `logic`.** A form that blocks a refund larger than the
  amount paid is a money rule with a screen attached.
- **Tests prove behavior, never appearance.** No test that a button renders, a class is applied, or
  a heading reads some text — those break on every redesign and catch nothing.
- **The reviewer checks the classes on the plan**, so no task can be classed down to dodge its tests.

## Stages — new app

| # | Stage | Load | Gate |
|---|---|---|---|
| 1 | Intake | `grilling` (or `superpowers:brainstorming`) | — |
| 2 | Spec + business doc | — | **user approves both** |
| 3 | Contract | `abdallah-skills:building-backends` | — |
| 4 | Design system | `frontend-design` (or `epic-design` for a marketing site) | **user approves the look** |
| 5 | Plan | `superpowers:writing-plans` | **classes, edge cases, alignment review** |
| 6 | Build | `abdallah-skills:building-backends` / `building-frontends`, per task | **tests by class · review for `logic`** |
| 7 | Verify | `superpowers:verification-before-completion` | **all green + smoke check** |
| 8 | Ship | `abdallah-skills:deploying-to-vercel` | **dev: automatic · production: user says go · rollback on failure** |

In an autonomous run, every gate that waits for the user is decided with the recommended default and
logged in `docs/BUILD_LOG.md` instead — see [autonomous.md](autonomous.md).

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

Break the spec into tasks. Each gets a **class** (`logic` / `ui` / `surface`), an area (`backend` /
`frontend` / `infra`), and what it depends on — the dependency marks decide what can run in
parallel.

**Every `logic` task lists its edge cases before any code is written.** Derive them from three
sources, in this order:

| Source | Rule |
|---|---|
| **Business doc** | every invariant the task touches gets a test that tries to break it · every failure path in its flows gets a test · every money rule gets boundary tests · every role gets a test proving a role without the permission is refused |
| **Contract** | every request field the task accepts: missing, `null`, wrong type, at the limit, one past the limit |
| **Stack checklist** | the generic cases in `building-backends` → `testing.md`, or `building-frontends` → Testing |

`ui` tasks list only the interaction cases that apply — validation messages, empty and error states,
double submit. `surface` tasks list none.

Write each case as one line with its expected outcome and where it came from:

```markdown
#### Task 7 — Cancel a booking (backend · logic)
Edge cases:
- [ ] Cancel a booking whose wash has started → 409, status unchanged   (invariant: cancel only before start)
- [ ] Cancel another customer's booking → 404                            (role: customers see only their own)
- [ ] Cancel a paid booking → refund created for the full amount         (money: cancellation refunds in full)
- [ ] Cancel an already-cancelled booking → 409                          (checklist: wrong state)
- [ ] Unknown booking id → 404                                           (checklist: not found)
```

Business-doc cases come first because no generic checklist can produce them. The source in
brackets shows why each case is there — and makes a missing one easy to spot.

Keep the lists in the plan file and include them when you summarise the plan, so the user sees them
before any code and can add one that was missed. Then run the alignment review on the plan.

### 6. Build

Before the first task, set up what every later check depends on:

1. **Repository** — the repo and its `production` and `dev` branches:
   [shipping.md](shipping.md) → Repository setup.
2. **Seed data** — one test account per role and realistic data for every flow, with the logins
   written to `CREDENTIALS.local.md`: [verification.md](verification.md) → Seed data.
3. **Smoke specs** — the Playwright setup that signs in as the seeded accounts:
   [verification.md](verification.md) → Smoke check.

Every task then happens on a `feature/<name>` branch cut from `dev`. Backend tasks load
`building-backends`; frontend tasks load `building-frontends`. Tests follow the task's class:

- **`logic`** — unit tests branch by branch, one test per planned edge case named after it, and a
  full-flow test. A case discovered while building is added to the plan *and* tested.
- **`ui`** — component tests for the behavior, and the screen added to a smoke spec.
- **`surface`** — no new tests; the screen's smoke screenshots are the check.

One task, one commit. A `logic` task then gets the alignment review on its diff. Decide per batch
whether to run tasks inline or through subagents — see Subagents.

### 7. Verify

1. **The full test suite is green**, with the real output shown.
2. **Each planned edge case is ticked off** against the test that covers it, by name. A case with no
   matching test fails verification, however green the suite is.
3. **The smoke check passes locally.** The smoke specs sign in as the seeded accounts, walk the main
   flows, and screenshot every changed screen at mobile and tablet, in LTR and RTL, in light and
   dark. Look at the screenshots — a passing spec doesn't prove a screen looks right.

Signing in happens inside the specs, from the seeded accounts. Verification never depends on anyone
typing a password into a login page — the agent can't, and scripted checks can be re-run against
every deployment anyway.

### 8. Ship

Everything reaches users by one path — details in [shipping.md](shipping.md):

1. **feature → `dev`, by default.** Once Verify passes, open a PR into `dev` and merge it. When the
   preview deployment is Ready, run the smoke specs against the preview URL.
2. **`dev` → `production`, on the user's go-ahead.** Run the alignment review once over everything
   since the last release, open a release PR listing what's in it, then **stop.** Merging it is the
   production deploy, so it waits for the user.
3. **Smoke-check production after every deploy.** If the read-only smoke specs fail, roll back to the
   previous deployment first, then fix forward through `dev` — [shipping.md](shipping.md) → Rollback.

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

As new-app stage 5: every task classed, dependencies marked, an edge-case list for each `logic` task
drawn from the business doc first, then the alignment review on the plan.

### 4. Build

On a `feature/<name>` branch cut from `dev`, with tests by class and the review on `logic` tasks. A
new role gets its seeded account. The business doc edit goes in the same PR as the code that makes
it true.

### 5. Verify

As new-app stage 7 — edge cases matched to named tests, and the smoke check. Run the **whole** suite
and every smoke spec, not only the new ones: a feature in an existing app is where unrelated flows
break.

### 6. Ship

As new-app stage 8: PR into `dev` and merge, smoke specs against the preview, the release review and
release PR into `production` on the user's go-ahead, then the production smoke check with rollback.
New roles or test accounts go into `CREDENTIALS.local.md`.

**Switch to new-app mode** when the feature needs a new design direction, a new kind of user with
their own area of the product, or a change to how tenants are separated. Those are architecture,
not features.

## Alignment review

The `business-alignment-reviewer` agent ships with this plugin — subagent type
`abdallah-skills:business-alignment-reviewer`. Give it the business doc's path and the plan's path,
a task's commit range, or the release's range. It reports; it never edits.

Run it:

- **after the plan**, before any code — including whether every task is classed correctly and the
  edge cases cover every rule in the doc
- **after each `logic` task**, on that task's diff — including whether each planned edge case has a
  test
- **once before each release PR**, over everything since the last release — which covers the `ui` and
  `surface` tasks it skipped
- **after a business change**, on the plan, to find the tasks the change invalidated

Not after every task. `ui` and `surface` tasks don't change business behavior, and the release review
still reads their diffs; reviewing each one separately multiplies the cost without catching more.

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

- A bug fix, small change, or refactor run through the full pipeline
- Code written before the spec and business doc are approved
- Feature mode used in a repo with no business doc or design system
- A feature that changes a business rule, role, money, or the data model built without approval
- A behavior change committed without updating `docs/BUSINESS_LOGIC.md`, or in a different PR
- A business change made in code before it is made in the doc
- Table names, endpoints, or components in the business doc
- Backend and frontend built in parallel before the API contract exists
- Frontend screens built before the design system is approved
- A task in the plan with no class, or one classed down to avoid its tests
- A `logic` task with no edge-case list, or one drawn only from the generic checklist
- A rule in the business doc that must never break, with no test that tries to break it
- A `logic` task shipped without unit, edge-case, and full-flow tests
- A test that checks appearance — a class name, a rendered heading — instead of behavior
- A green suite accepted as proof without ticking each planned edge case against a named test
- A `CONFLICTS` verdict overridden without asking the user
- The alignment review run on `ui` or `surface` tasks, or skipped before a release PR
- Every stack skill loaded at the start instead of at its stage
- A subagent brief or report that skips the rules in `subagents.md`
- `CREDENTIALS.local.md` written before `git check-ignore` confirms it is ignored
- Tests, credentials, or a preview that depend on an account no seed script creates
- A verification step that needs someone to type a password into a login page
- A PR merged into `dev` before Verify passes, or a direct push to `dev` or `production`
- A merge into `production` without the user's go-ahead, in a run that isn't fully autonomous
- A run started without asking the run mode, or an autonomous decision missing from the build log
- A squash merge from `dev` into `production`
- A preview deployment that reads the production database or calls the production API
- A production deploy with no smoke check afterwards, or a failed one left live
