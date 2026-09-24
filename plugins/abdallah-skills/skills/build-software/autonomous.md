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
covers: approving the spec, pushing, opening PRs, merging, and — for fully autonomous — deploying
to production. Record it at the top of the build log. **It is not permission to choose the look**:
see the design exception below.

## The one question that still comes first

An autonomous run needs a goal to measure "done" against. If the request names no product — "build
me something" — ask what the app is for, once, then go. Never invent the goal.

## Deciding instead of asking

- **Intake** — answer every question from the request, then the recommended default.
- **Spec, business doc, feature spec** — produce them as usual, then approve them yourself against
  the goal instead of waiting.
- **Design is the exception — it always waits for the user, in every mode.** Mock two or three
  clearly different, bold directions (`designing-mobile` / `frontend-design`), show them, and stop
  for a pick. Taste can't be judged against the goal: a self-approved "quiet" direction was
  rejected as "very bad, so basic" after every screen had been built on it, and cost a full
  restyle. Keep building anything that doesn't depend on the look while waiting.
- **Alignment review `CONFLICTS`** — the business doc wins; fix the code. There is no user to move the
  business mid-run, so the doc written at the start stays the authority.
- **Anything with more than one reasonable answer** — take the recommended one.

Every one of these goes in the build log.

## The build log

A small **index** at `docs/BUILD_LOG.md` plus many small files under `docs/build-log/`, all
committed with the work. It is what makes an autonomous run reviewable and what lets any session
pick the run back up — and it is split so nobody reads more of it than they need.

**Why split:** a single log grows past 150 KB (≈40k tokens) within a few features. Every session and
every subagent brief that says "read the build log" pays that in full, and parallel tasks appending to
one file conflict on every merge. Small files cost a few thousand tokens to read and never collide.

```
docs/BUILD_LOG.md                        the index — at most ~80 lines, read by everyone
docs/build-log/decisions/<phase>.md      one file per phase or feature (foundation, notifications…)
docs/build-log/waves/<feature>/<task>.md one file per task, written by that task (T5.md)
docs/build-log/feedback/<date>-<topic>.md  user feedback rounds and what each item became
docs/build-log/notes/<topic>.md          anything else that must outlive the session (a trap, a runbook)
```

**The index** holds only what a resuming session needs first, and links to the rest:

```markdown
# Build log
Run mode: fully autonomous — chosen by the user on YYYY-MM-DD
Goal (current): <the goal, in the user's words> · plan `docs/superpowers/plans/<plan>.md`
Current stage: 6 — Build (T9 of 14) · <one line of where things are>

## Waiting on the user
- …
## Blocked
- **T11 — SMS**: provider needs an API key this machine doesn't have.
## Next up
- …
## Phases
- Notifications (D55) — built · [decisions](build-log/decisions/notifications.md) · [waves](build-log/waves/notifications/)
- Streaks (D59) — building · [decisions](build-log/decisions/streaks.md) · [waves](build-log/waves/streaks/)
```

**A decision file** — one entry per decision a guided run would have asked about: what was decided,
why, and the alternatives passed over, so each one can be reversed later.

```markdown
- **[Stage 2] Refund policy** — cancellations before the wash starts refund in full.
  Why: the request mentions refunds but no rule; this is the simplest rule a customer accepts.
  Alternatives: partial refund; no refund after payment.
```

**A wave file** (`waves/<feature>/T5.md`) is written by the task that did the work: its commit, what
it built, test counts, what the plan got wrong. The main thread writes the wave's dispatch line
(`Wave 3: T4 T5 T6 in parallel · T8 waits on T4`) into the feature's `waves/<feature>/README.md`.

Rules:
- **Edit the file the change belongs to, or create a new one** — never append to the index what
  belongs in a phase file. The index gets a one-line link when a new file appears.
- **Update `Current stage` in the index** whenever a stage or task finishes.
- **Briefs name the files a subagent needs** (its phase's decisions, the plan) — never "read the
  build log" whole.
- **A file past ~400 lines is split** (by stage, or by month).
- No credential values, ever — the files are committed and the repo is public.
- An existing repo with one big `BUILD_LOG.md`: move its sections into this layout once, verbatim,
  and leave the index at the same path so hooks and habits that read it keep working.

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
