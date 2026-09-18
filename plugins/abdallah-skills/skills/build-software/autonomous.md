# Autonomous runs

In an autonomous run, nothing waits for the user. Every question gets the recommended answer, every
approval gate is decided and logged instead of held, and the run keeps going until the goal is
reached. The user reviews the result and the log afterwards instead of each step along the way.

## Choosing the run mode

Before anything else — before intake, before reading the repo — ask with `AskUserQuestion`:

| Option | Behaviour |
|---|---|
| **Guided** | Stops at every gate: spec and business doc, design, feature spec, production merge. |
| **Autonomous to preview** | Decides every gate itself and ships to the `dev` preview. Opens the release PR into `production` and ends there. |
| **Fully autonomous** | Decides every gate itself, merges into `production`, and finishes with the app live. |

Say in the option descriptions that autonomous runs are long and use a lot of tokens.

Skip the question when the invocation already names the mode — `/build-software autonomous <goal>`
or `/build-software guided <goal>`.

Choosing an autonomous mode **is** the user's permission, given once, for everything that mode
covers: approving the spec and design, pushing, opening PRs, merging, and — for fully autonomous —
deploying to production. Record it at the top of the build log.

## The one question that still comes first

An autonomous run needs a goal to measure "done" against. If the request names no product — "build
me something" — ask what the app is for, once, then go. Never invent the goal.

## Deciding instead of asking

- **Intake** — answer every question from the request, then the recommended default.
- **Spec, business doc, design, feature spec** — produce them as usual, then approve them yourself
  against the goal instead of waiting.
- **Alignment review `CONFLICTS`** — the business doc wins; fix the code. There is no user to move the
  business mid-run, so the doc written at the start stays the authority.
- **Anything with more than one reasonable answer** — take the recommended one.

Every one of these goes in the build log.

## The build log

`docs/BUILD_LOG.md`, committed with the work. It is what makes an autonomous run reviewable, and
what lets any session pick the run back up.

```markdown
# Build log
Run mode: fully autonomous — chosen by the user on YYYY-MM-DD
Graft: wired in YYYY-MM-DD
Goal: <the goal, in the user's words>
Current stage: 6 — Build (task 9 of 14)

## Waves
- Wave 3: T7 T8 T9 in parallel · T10 waits on T8 · T11 after T9 (both edit schema.prisma)

## Decisions
- **[Stage 2] Refund policy** — cancellations before the wash starts refund in full.
  Why: the request mentions refunds but no rule; this is the simplest rule a customer accepts.
  Alternatives: partial refund; no refund after payment.
- **[Stage 4] Design approved** — calm and precise; teal primary; Inter + IBM Plex Sans Arabic.

## Blocked
- **Task 11 — SMS notifications**: provider needs an API key this machine doesn't have.
```

- One entry per decision a guided run would have asked about: what was decided, why, and the
  alternatives it passed over — so each one can be reversed later.
- Update `Current stage` whenever a stage or task finishes, and add a wave line before every
  dispatch ([subagents.md](subagents.md) → The parallel check).
- No credential values, ever — the file is committed and the repo is public.

## Not stopping

**Resume from disk, not from memory.** The plan's checkboxes and the build log hold the state. A new
session that runs `/build-software` on a repo with a build log reads it and continues from
`Current stage` without asking the run-mode question again.

**For unattended runs, start it as `/loop /build-software`**, so a turn that ends picks the run back
up instead of leaving it idle.

**A failing task gets three real attempts**, each through `superpowers:systematic-debugging`. If it
still fails, mark it under **Blocked** with what was tried, and carry on with every task that doesn't
depend on it. Only when every remaining task depends on something blocked does the run stop.

**A failed production smoke check doesn't stop the run either.** Roll back, log the release under
**Blocked**, fix forward through `dev`, and release again — `shipping.md` → Rollback.

## What still stops an autonomous run

These can't be decided on the user's behalf, whatever mode was chosen:

- **Spending money** — a paid plan, a domain, any purchase.
- **A store build or submission** — it spends EAS build credits and starts a store review. OTA updates
  are not builds and don't stop the run.
- **Access it doesn't have** — an account to create, a login, an API key, a CLI that isn't signed in.
- **Irreversible data loss** — deleting a database or a repo, dropping tables that hold data,
  force-pushing a shared branch.
- **No goal** — see above.

Stop, say exactly what is needed, and leave the build log current so the run resumes once it's
provided. Anything else that can wait — a missing API key for one feature — is **Blocked**, not a stop.

## Done

The run is done when:

- every task in the plan is ticked, or listed under **Blocked** with its reason
- the full suite is green and every planned edge case matches a named test
- the final alignment review is `ALIGNED`
- the app is deployed — to preview, or to production for a fully autonomous run — and the smoke
  specs pass against the deployed URL — read-only specs on production
- `CREDENTIALS.local.md` has every URL and test account

Then write a final report: what was built, the preview and production URLs, where the test logins
are, the decisions worth reviewing first, and anything blocked with what it needs.

## Red flags

- A run started without asking the run mode, when the invocation didn't name it
- A goal invented because the request didn't give one
- An autonomous decision that isn't in the build log, or an entry with no reason
- An autonomous run that spends money, creates an account, or deletes data instead of stopping
- A failing task retried forever instead of marked **Blocked** after three attempts
- A whole run stopped over a task other work doesn't depend on
- A resumed session that asks the run-mode question again
- A credential value in `docs/BUILD_LOG.md`
