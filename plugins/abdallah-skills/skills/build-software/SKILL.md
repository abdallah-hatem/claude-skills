---
name: build-software
description: Use when the user asks to build an app, a product, or named phases or milestones of one ("build Aesthetica phases 1–2", "build me a booking app", "continue the build"), to add a whole feature to an app through the full pipeline, or runs /build-software — web, mobile, or both, on the NestJS + Next.js + Expo stack. Not for a bug fix, a small change, a refactor, or a question.
---

# Build Software

The pipeline from an idea to a deployed app, and a shorter one for adding a feature to an app that
already exists. This skill owns the **order**, the **gates**, and **which skill to load when** — not
the rules. Those live in the stack skills and in the reference files beside this one, loaded at the
stage that needs them.

**In an existing repo, read its `CLAUDE.md`, `docs/BUSINESS_LOGIC.md`, and `docs/DESIGN.md` first.**
The repo's branching, test commands, and verification steps override anything here.

## Not for this skill

This pipeline builds a product or adds a feature to one. Most changes are neither, and pushing them
through six or eight stages wastes hours and tokens.

| Change | Do this instead |
|---|---|
| **A bug** | `superpowers:systematic-debugging` — reproduce it, write a test that fails, fix it, then a `fix/<name>` PR into `dev` ([shipping.md](shipping.md)) |
| **A small change** — copy, a style tweak, a config value, a dependency bump | a `chore/<name>` branch, a visual check, the same PR into `dev` |
| **A refactor** that changes no behavior | the existing tests pass before and after; no spec, no plan |
| **A question or an investigation** | answer it — there is nothing to ship |

The test: **does it add or change what the product does for a user?** If not, it doesn't belong here.

## Ask first

Before anything else, ask one question with `AskUserQuestion`:

**Run mode**
- **Guided** — stops at every gate below that waits for the user.
- **Autonomous to preview** — decides every gate itself, ships to the `dev` preview, and ends at the
  release PR.
- **Fully autonomous** — decides every gate itself and doesn't stop until the app is live in
  production.

**Graft is always on** — not a question. Every run wires in a local code graph so agents find code
with a query instead of reading file after file: [graft.md](graft.md).

Skip the question when the invocation already answers it (`/build-software autonomous <goal>`), or
when `docs/BUILD_LOG.md` already records it — then resume from the log. Autonomous runs log every
decision in `docs/BUILD_LOG.md`, and still stop for money, missing access, and irreversible data loss:
[autonomous.md](autonomous.md).

## Modes

| | New app | Feature |
|---|---|---|
| **Use when** | the repo has no `docs/BUSINESS_LOGIC.md` yet | the repo already has a business doc and a design system |
| **Stages** | all eight, below | Context → Feature spec → Plan → Build → Verify → Ship |
| **Skips** | — | intake, the full contract, and the design system — it uses what exists |

Pick the mode from the repo, not from how the request is worded; if the two disagree, ask.

**Feature mode follows every rule below.** Its spec includes the exact edit to
`docs/BUSINESS_LOGIC.md` and **stops for approval only when the feature changes a business rule, a
role, money, or the data model**. Its Verify runs the whole suite and every smoke spec, not only the
new ones. A feature that needs a new design direction, a new kind of user, or a change to how tenants
are separated is architecture — use new-app mode. Its Context stage wires Graft in if the repo doesn't have it yet, and explores the code
through it. Stage by stage: [feature-mode.md](feature-mode.md).

## The business doc

`docs/BUSINESS_LOGIC.md` is the living source of truth for what the business is and how it behaves.
A spec records one decision; this file is what is true **now**. It holds:

- **The business** — what it does, for whom, and how it earns money
- **Roles** — who can do what
- **Entities and their rules**, and **flows** step by step, including what happens when a step fails
- **Invariants** — rules that must never break ("a paid booking is refunded, never deleted")
- **Money** — pricing, discounts, rounding, refunds
- **Scope** — what is built, what is **Planned**, and what is deliberately left out

Business terms only — no table names, endpoints, or components, or it goes stale with every refactor.

1. **Read it before every task.** It is how a new session, or a subagent, recovers the business.
2. **Every behavior change updates it in the same commit** and bumps its `Last updated` line.
   Otherwise the task isn't done.
3. **When the business changes mid-build, the doc changes first.** Then the alignment review on the
   plan finds the tasks the change affects, then the code changes.

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
  not merely ugly — so a form that blocks a refund larger than the amount paid is `logic`.
- **Tests prove behavior, never appearance.** No test that a button renders, a class is applied, or
  a heading reads some text.
- **The reviewer checks the classes on the plan**, so no task can be classed down to dodge its tests.

## Staying light

A long run gets expensive because the conversation keeps growing and every turn re-sends it. Four
rules keep it small — commands and examples in [efficiency.md](efficiency.md):

1. **State lives in files, not in the conversation.** Every run — guided or autonomous — keeps
   `docs/BUILD_LOG.md`, the plan's checkboxes, and the business doc current, so a compaction or a new
   session loses nothing.
2. **The main thread coordinates; subagents do the heavy work.** Build tasks run in fresh subagents,
   whose file reads, test output, and debugging are discarded when they report back. This happens on
   its own in every run — no one has to clear anything.
3. **Output is short.** One line per finished task; specs, plans, and reports go to files and the chat
   points to them; nothing already written gets restated.
4. **Tests are quiet.** The full log goes to a file; the conversation gets the summary line and the
   failures.

In a guided run, each approval gate ends with a one-line suggestion to `/clear` and run
`/build-software` again — the user is there anyway, and the run resumes from the build log.

## Stages — new app

| # | Stage | Load | Gate |
|---|---|---|---|
| 1 | Intake | `grilling` (or `superpowers:brainstorming`) | — |
| 2 | Spec + business doc | — | **user approves both** |
| 3 | Contract | `abdallah-skills:building-backends` (or the existing backend) | — |
| 4 | Design system | `frontend-design` (or `epic-design` for a marketing site); `designing-mobile` for an app | **user approves the look** |
| 5 | Plan | `superpowers:writing-plans` | **classes, edge cases, alignment review** |
| 6 | Build | `abdallah-skills:building-backends` / `building-frontends` / `building-mobile`, per task | **tests by class · review for `logic`** |
| 7 | Verify | `superpowers:verification-before-completion` | **all green + smoke check** |
| 8 | Ship | `abdallah-skills:deploying-to-vercel`; `building-mobile` → `release.md` for an app | **dev: automatic · production: user says go · rollback on failure · a store build always waits for the user** |

In an autonomous run, every gate that waits for the user is decided with the recommended default and
logged in `docs/BUILD_LOG.md` instead.

### 1. Intake

Ask only what changes the architecture: who it's for, what the first version includes, where it runs,
whether it's multi-tenant, **which platforms** (web, mobile, or both — and for mobile, iOS, Android, or
both), and **which backend** (a NestJS API this run builds, or an existing NestJS API or Supabase
project the app connects to). Decide everything smaller yourself with the recommended default and
record each choice in the spec.

### 2. Spec and business doc

Write `docs/specs/YYYY-MM-DD-<topic>.md`: users and roles, entities, flows, what is out of scope, and
the defaults chosen at intake, including the platforms and the backend. Then create or update
`docs/BUSINESS_LOGIC.md` from it.

**Layout follows the platforms:** web + mobile → `apps/api`, `apps/web`, `apps/mobile`, and
`packages/shared` for the zod schemas, API types, locale files, tokens, and pure logic both use.
Mobile only → `apps/mobile` (plus `apps/api` when this run builds the backend). **Stop for
approval of both.** No code before they are agreed.

### 3. Contract

Before splitting work, fix the seam between backend and frontend — every endpoint, its DTO, and its
response shape inside the envelope — and write it into the spec. When the app connects to a backend
that already exists, the contract records what that backend offers instead of designing it. It is what lets the two sides be
built independently without disagreeing when they meet.

### 4. Design system

Skip this only when the project already has one. Load `frontend-design` — or `epic-design` for a
marketing site — set the direction from the spec, and put it in code before any screen exists,
following `building-frontends` → `design-system.md`: colour tokens for light and dark mapped into
Tailwind, fonts through `next/font` covering Arabic, motion tokens, and `docs/DESIGN.md` with the
feel, colour roles, type, motion, and what to avoid — no values.

Show the user the palette, the type scale, and one representative screen in light and dark — a preview
page, or a mockup through the `design` skill. **Stop for approval.** A look agreed now is cheap; a
look changed after twenty screens is a rewrite.

**For a mobile app, load `designing-mobile`** instead: native-first with the brand on top, tokens in
NativeWind (shared with the web through `packages/shared` when both exist), and the React Native
Reusables kit themed from them. The preview is the themed kit on a phone, in light and dark. With
both platforms, one direction covers both and the preview shows a screen on each.

### 5. Plan

Break the spec into tasks, each with a **class**, an area (`backend` / `frontend` / `infra`), and what
it depends on — the dependencies decide what can run in parallel. Apps add the area `mobile`, which is
independent of `frontend` once the contract is fixed.

**Every `logic` task lists its edge cases before any code**, drawn from the business doc first, then
the contract, then the stack checklist — each written with its expected outcome and its source. `ui`
tasks list only their interaction cases; `surface` tasks list none. Show the lists with the plan, then
run the alignment review. How to derive and write them: [planning.md](planning.md).

### 6. Build

Before the first task, set up what every later check depends on:

1. **Repository** — the repo, and its `production` and `dev` branches: [shipping.md](shipping.md).
2. **Seed data** — one test account per role and realistic data for every flow, with the logins in
   `CREDENTIALS.local.md`: [verification.md](verification.md).
3. **Smoke specs** — the Playwright setup that signs in as the seeded accounts:
   [verification.md](verification.md).
4. **Graft** — wired in before the first task, if the repo doesn't have it yet: [graft.md](graft.md).
5. **Lint and typecheck** — every app gets its stack's house config and `lint` / `typecheck` scripts:
   `building-backends` → [lint.md](../building-backends/lint.md), `building-frontends` →
   [lint.md](../building-frontends/lint.md), `building-mobile` → [lint.md](../building-mobile/lint.md). A repo that already exists gets it too, with its current
   violations frozen — lint is a check, not a stack change.
6. **For a mobile app** — the official `expo` plugin installed (`claude plugin install
   expo@claude-plugins-official`; `building-mobile` loads its skills), EAS project and channels set up
   per `building-mobile` → [release.md](../building-mobile/release.md), and Maestro smoke flows that
   sign in as the seeded accounts ([testing.md](../building-mobile/testing.md)).

Every task then happens on a `feature/<name>` branch cut from `dev` — or, when it depends on a task
that isn't merged yet, from that task's branch. Backend tasks load
`building-backends`; frontend tasks load `building-frontends`. Tests follow the class:

- **`logic`** — unit tests branch by branch, one test per planned edge case named after it, and a
  full-flow test. A case discovered while building is added to the plan *and* tested.
- **`ui`** — component tests for the behavior, and the screen added to a smoke spec.
- **`surface`** — no new tests; the screen's smoke screenshots are the check.

One task, one commit. A `logic` task then gets the alignment review on its diff. Tasks run in
subagents, in parallel waves wherever the plan's dependencies allow — see Staying light and Subagents.

### 7. Verify

1. **The full test suite, `lint`, and `typecheck` are green**, each with its real summary line shown —
   and any failures in full, never the whole log.
2. **Each planned edge case is ticked off** against its test, by name. A case with no matching test
   fails verification, however green the suite is.
3. **For a mobile app, the Maestro flows pass** and every changed screen is screenshotted on iPhone and
   iPad, LTR and RTL, light and dark, at the largest Dynamic Type — by the main thread after the wave,
   one simulator at a time ([testing.md](../building-mobile/testing.md)).
4. **The smoke check passes locally** — the specs sign in as the seeded accounts, walk the main flows,
   and screenshot every changed screen at mobile and tablet, LTR and RTL, light and dark. Look at the
   screenshots; a passing spec doesn't prove a screen looks right.

Sign-in always happens inside the specs. Verification never waits on anyone typing a password into a
login page.

### 8. Ship

Everything reaches users by one path — details in [shipping.md](shipping.md):

1. **feature → `dev`, by default.** Once Verify passes, open a PR into `dev` and merge it, then run the
   smoke specs against the preview URL.
2. **`dev` → `production`, on the user's go-ahead.** Run the alignment review over everything since
   the last release, open a release PR, then **stop** — merging it is the production deploy.
3. **Smoke-check production after every deploy.** If the read-only specs fail, roll back first, then
   fix forward through `dev`.

**A mobile app ships through EAS** — [release.md](../building-mobile/release.md): `feature → dev` is an
OTA update to the `preview` channel; `dev → production` is an OTA update to `production` for JS-only
changes, checked with `expo:eas-update-insights`, or a store build for native changes. **A store build
or submission always waits for the user's go-ahead, in every run mode** — it spends EAS credits and
starts a store review.

Migrations run deliberately against each environment's database before its merge, and
`CREDENTIALS.local.md` gets every new URL or test account.

## Alignment review

The `business-alignment-reviewer` agent — subagent type
`abdallah-skills:business-alignment-reviewer` — reads the business doc against a plan, a task's commit
range, or a release's range. It reports; it never edits. Run it:

- **after the plan** — the classes, and edge cases covering every rule in the doc
- **after each `logic` task** — its diff, and a test for each of its planned edge cases
- **once before each release PR** — everything since the last release, covering the `ui` and
  `surface` tasks it skipped
- **after a business change** — on the plan, to find the tasks the change invalidated

| Verdict | Then |
|---|---|
| `ALIGNED` | continue |
| `CONFLICTS` | stop the task; fix the code — or, if the code is right and the doc is wrong, ask the user |
| `DOC OUT OF DATE` | update the doc in the same commit and review again |
| `NO BUSINESS DOC` | go back to stage 2 |

It finds disagreements; it doesn't decide who is right. When code and doc disagree because the
business moved, the user decides.

## Subagents

Build tasks run in subagents so each one's reading and test output is discarded when it reports:
related small tasks batched into one, dependent tasks one after another, independent tasks in
parallel in separate worktrees. **Before every dispatch, run the parallel check** — which tasks are
ready, which collide — send every ready, non-colliding task in one message, and log the wave. Stages
that need the user stay in the main thread. Every brief stands alone, and every report is checked
rather than trusted: [subagents.md](subagents.md).

## Red flags

Each reference file ends with the red flags for its own stage. These cut across all of them:

- A bug fix, small change, or refactor run through the full pipeline
- Code written before the spec and business doc are approved, in a guided run
- A behavior change without a `docs/BUSINESS_LOGIC.md` update in the same PR
- A business change made in code before it is made in the doc
- Backend and frontend built in parallel before the API contract exists
- An app built or changed without the house lint config, or a task committed with `lint` or `typecheck` failing
- Independent tasks built one at a time because no parallel check was run
- Frontend screens built before the design system is approved
- A task with no class, or one classed down to avoid its tests
- A test that checks appearance instead of behavior
- A `CONFLICTS` verdict overridden without asking the user
- The alignment review run on `ui` or `surface` tasks, or skipped before a release PR
- `CREDENTIALS.local.md` written before `git check-ignore` confirms it is ignored
- A merge into `production` without the user's go-ahead, in a run that isn't fully autonomous
- A production deploy with no smoke check afterwards, or a failed one left live
- Run state that exists only in the conversation, or Build tasks run inline on a long run
