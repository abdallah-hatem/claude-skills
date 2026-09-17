# Feature mode

For adding a feature to an app that already has `docs/BUSINESS_LOGIC.md` and a design system. Every
rule in `SKILL.md` applies; the stages that set up the product are skipped because they already ran.

## 1. Context

Read `CLAUDE.md`, `docs/BUSINESS_LOGIC.md`, `docs/DESIGN.md`, and the code the feature touches. No
intake interview — ask only what the docs and the code can't answer.

**Wire Graft in first** if the repo doesn't have it ([graft.md](graft.md)). Then get oriented
with `graft map` or `graft_repo_map`, find the code the feature touches with `graft ask`, and scope what
it affects with `graft callers <symbol> --depth all` — instead of reading files broadly.

## 2. Feature spec

Write a short `docs/specs/YYYY-MM-DD-<feature>.md`:

- what the feature does, and for which roles
- the business rules it adds or changes — written as the exact edit to `docs/BUSINESS_LOGIC.md`
- new or changed endpoints, DTOs, and responses
- screens it adds or changes, built from the existing design system
- what is out of scope

**Stop for approval when the feature adds or changes a business rule, a role, money, or the data
model.** Otherwise summarise the spec and continue.

## 3. Plan

As new-app stage 5 ([planning.md](planning.md)): every task classed, dependencies marked, an edge-case
list for each `logic` task drawn from the business doc first, then the alignment review on the plan.

## 4. Build

On a `feature/<name>` branch cut from `dev`, with tests by class and the alignment review on `logic`
tasks. A new role gets its seeded account ([verification.md](verification.md)). The business doc edit
goes in the same PR as the code that makes it true.

## 5. Verify

As new-app stage 7 — edge cases matched to named tests, and the smoke check. Run the **whole** suite
and **every** smoke spec, not only the new ones: a feature in an existing app is where unrelated flows
break.

## 6. Ship

As new-app stage 8 ([shipping.md](shipping.md)): PR into `dev` and merge, smoke specs against the
preview, the release review and release PR into `production` on the user's go-ahead, then the
production smoke check with rollback. New roles or test accounts go into `CREDENTIALS.local.md`.

## When it isn't a feature

Switch to new-app mode when the change needs a new design direction, a new kind of user with their own
area of the product, or a change to how tenants are separated. Those are architecture, not features.

## Red flags

- Feature mode used in a repo with no business doc or design system
- A feature that changes a business rule, role, money, or the data model built without approval
- A business doc edit in a different PR from the code that makes it true
- Only the new tests and smoke specs run, not the whole suite
- Architecture — a new design direction, a new kind of user, tenant separation — built as a feature
