# Adopt mode

For a repo that already has a working app but was built without this skill: no
`docs/BUSINESS_LOGIC.md`, usually no `docs/DESIGN.md`, often no seed accounts or smoke specs. Adopt
writes down what the app **already is**, adds the checks the pipeline relies on, and then hands over
to feature mode for whatever the user asked to build.

**Adopt describes; it never redesigns.** No intake interview, no new design direction, no stack
change, no refactor, no renamed files. Adopt commits are docs and `chore` setup only. The code is the
evidence of what the product does today.

## 1. Survey (read-only)

Read the repo's `CLAUDE.md`, `README`, everything in `docs/`, and `git log --oneline | head -50` for
the story so far. Then map the app — for a big repo, hand the sweep to a read-only search subagent and
take back only the answers:

- **Platforms and stack** — the apps, frameworks, backend (own API, Supabase, other), hosting
- **Roles and auth** — who can sign in, how roles are told apart, what each can reach
- **Entities** — the schema (Prisma, SQL migrations, Supabase), and the rules enforced on them
  (validation, constraints, RLS policies, guards)
- **Flows** — every route, screen, and endpoint, grouped into what a user actually does
- **Money** — prices, discounts, rounding, payments, refunds, if any
- **Design** — the tokens or theme (Tailwind config, `globals.css`, NativeWind theme), fonts, the
  component kit, and whether screens use tokens or hardcoded values
- **Checks that exist** — test suites and how to run them, lint, typecheck, CI, deploy config,
  branches, seed data

## 2. Business doc and design doc

Write `docs/BUSINESS_LOGIC.md` in the layout from `SKILL.md` — business, roles, entities and rules,
flows, invariants, money, scope — **in business terms, describing what the code does now.** Scope
lists what is built; Planned starts empty unless the repo's docs or the user name something.

Mark every rule the code implies but doesn't make obvious as **(inferred)**. Collect anything that
looks unintended — a role that can reach a screen it probably shouldn't, a refund path that skips a
check, a flow that dead-ends — into a **Questions** list in
`docs/specs/YYYY-MM-DD-adopt.md`, never into the business doc. The code can't say whether odd
behavior is a rule or a bug; only the user can.

Write `docs/DESIGN.md` from the existing look, following the stack skill's design-system rules
(`building-frontends` → `design-system.md`, `designing-mobile` for an app): the feel the current
screens give, colour roles, type, motion, the component kit — direction, no values. **Record the
current look, don't improve it.** If screens hardcode colours and sizes instead of using tokens, say
so in the adopt spec and add a `chore` task to extract tokens that reproduce today's look exactly.

## 3. Confirm

**Stop for the user** with three things: the business doc, the design doc, and the Questions list.
Their answers turn each question into a rule (the doc changes) or a bug (it becomes a `fix/` task
after adopt, through `superpowers:systematic-debugging`). Nothing is fixed during adopt.

In an autonomous run, don't stop: treat current behavior as intended, keep the **(inferred)** marks,
log every question in the build log for the user to review later, and continue.

## 4. Set up the checks — without changing the stack

What `SKILL.md` stage 6 sets up before the first task, applied to the repo as it is. **The repo's
`CLAUDE.md` wins** wherever it already decides something (branch names, test commands, environments).

1. **Baseline** — run the existing suites, lint, typecheck, and the build once, and record the result
   in the adopt spec. Tests that already fail are logged as known failures, not fixed now — so later
   runs can tell an old failure from a new one.
2. **Lint** — the house config in its own `chore/lint` commit, existing violations frozen
   ([building-frontends/lint.md](../building-frontends/lint.md),
   [building-backends/lint.md](../building-backends/lint.md),
   [building-mobile/lint.md](../building-mobile/lint.md)).
3. **Branches** — `production` and `dev` per [shipping.md](shipping.md), unless the repo already has
   its own flow.
4. **Seed data and credentials** — one test account per role found in the survey, realistic data for
   the main flows, logins in `CREDENTIALS.local.md` ([verification.md](verification.md),
   [credentials.md](credentials.md)).
5. **Smoke specs** — sign in as each seeded role and walk the main flows from the business doc, so
   the first feature has something to break against ([verification.md](verification.md); Maestro
   flows for an app, [building-mobile/testing.md](../building-mobile/testing.md)).

## 5. Hand over

Start `docs/BUILD_LOG.md` ([autonomous.md](autonomous.md)) with `Mode: adopted YYYY-MM-DD` and the
baseline. Commit the docs and setup to `dev` through a `chore/adopt` PR, then run the user's request
in **feature mode** ([feature-mode.md](feature-mode.md)). If adopting was the whole request, stop
here.

## Red flags

- An intake interview, a new design direction, or a stack change during adopt
- A refactor, rename, restyle, or bug fix slipped into the adopt commits
- Suspected bugs written into the business doc as rules, or fixed without the user's answer
- A business doc that names tables, endpoints, or components instead of business terms
- A design doc that proposes a new look instead of describing the current one
- Existing test failures fixed, hidden, or deleted instead of logged as the baseline
- Feature work started before the user confirmed the docs, in a guided run
