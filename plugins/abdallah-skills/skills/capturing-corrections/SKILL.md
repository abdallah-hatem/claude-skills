---
name: capturing-corrections
description: Use when the user corrects course, restates something already said, rejects an approach, or states a preference that should outlive this session — and when they say "remember this", "write that down", or ask what has been recorded for a project.
---

# Capturing Corrections

A correction the user has to give twice is a correction that was never recorded. Write it to
one of two `LEARNINGS.md` files — global or project, see Where it goes — which a `SessionStart`
hook force-loads into every future session.

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

Pick the file by what the rule is about, not by the folder the session happens to be in:

| The rule is about | File | Loaded |
|---|---|---|
| **The user** — how they want you to work, their preferences, their machine and tools, their own commands and shortcuts, facts about them and their work | `~/.claude/LEARNINGS.md` | in every project |
| **This codebase** — its branches, test setup, deploy targets, a trap in its code | `<repo>/.claude/LEARNINGS.md` | in this repo only |

The test: **would it still be true in a different repo?** Yes → global. No → project.

- "Every command must use an absolute path" → global. "Lead with the verdict" → global.
- "No Flutter jobs" → global, even when said inside a job-hunt repo: it is about the user.
- "pgTAP here runs on the live DB — never assert global counts" → project.

Create the file if it is absent. Both are the only targets: `CLAUDE.md` files are instructions the
user maintains by hand, so a correction never goes there.

A new global rule reaches other sessions that are already running only at their next start,
resume, `/clear`, or compaction.

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

Tell the user in one line what was recorded and in which file — **global** or **this project**.
They may want it worded differently or filed in the other one, and this is the moment to catch it
— not three sessions later.

## Red flags

- Appending without reading the file first
- A rule about the user written to a project file — every other repo will repeat the mistake
- A rule about one codebase written to the global file
- A correction written into a `CLAUDE.md`
- A rule that restates something in `CLAUDE.md`
- An entry naming a line number or a function that will move
- Recording the task instead of the rule
- More than about 40 lines in a project file, or 150 in the global one — it has become a dumping
  ground; move the durable ones into a skill and delete the rest
