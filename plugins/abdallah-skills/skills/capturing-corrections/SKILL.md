---
name: capturing-corrections
description: Use when the user corrects course, restates something already said, rejects an approach, or states a preference that should outlive this session — and when they say "remember this", "write that down", or ask what has been recorded for a project.
---

# Capturing Corrections

A correction the user has to give twice is a correction that was never recorded. Write it
to `.claude/LEARNINGS.md` in the current project, where a `SessionStart` hook force-loads it
into every future session.

## Record it when

The point would still be true next week, in a fresh session, with no memory of this
conversation. Concretely:

- The user restated something they already said
- An approach was rejected in favor of another, and the reason generalizes
- A preference was stated that is not visible from the code
- A trap was hit that the repo does not document

## Do not record

- Task content — what to build, which bug to fix. That is work, not a rule.
- Anything already in `CLAUDE.md`, a skill, or the code. Duplication rots.
- One-offs that cannot recur ("skip the tests **this** time").
- Facts about a specific file that will change with the file.

If it does not survive the "true next week?" test, resolve it and move on.

## Where it goes

`<repo>/.claude/LEARNINGS.md` — the project you are working in. Create the file if absent.

A rule about **how you should work** in general belongs in a global skill, not here. A rule
about **this codebase** belongs here. When both fit, this file wins — it is cheaper to
promote later than to pollute every project now.

## Format

Group by area. One line per rule: the rule, then why, then the date. Imperative mood.

```markdown
# Learnings

Corrections recorded so they don't have to be repeated. Loaded at session start.

## Data layer
- Never await an endpoint directly in a client component — use `callApi`, or the toast
  never fires. — 2026-08-26

## Workflow
- Don't push to `dev` to test; it auto-deploys to shared staging. Verify locally first.
  — 2026-08-26
```

## Before appending: read the file

Read the existing file first, then:

- **Already covered** — leave it. Don't add a near-duplicate.
- **Contradicts an entry** — replace the old line, don't stack a second one. A file with two
  conflicting rules teaches nothing. Note the reversal in the new line if it matters.
- **Sharpens an entry** — edit that line in place.

Only a genuinely new rule gets a new line.

## After writing

Tell the user in one line what was recorded and where. They may want it worded differently,
and this is the moment to catch it — not three sessions later.

## Red flags

- Appending without reading the file first
- A rule that restates something in `CLAUDE.md`
- An entry naming a line number or a function that will move
- Recording the task instead of the rule
- More than about 40 lines in one file — it has become a dumping ground; promote the
  durable ones to `CLAUDE.md` or a skill and delete the rest
