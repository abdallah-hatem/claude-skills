# Efficiency: context, output, and test noise

Every turn re-sends the whole conversation. A file read, a 400-line test log, or a long recap stays in
it for the rest of the session and is paid for again on every turn after. The cost of a run comes from
what piles up in the conversation — not from the skill's own text.

## State on disk

Every run keeps `docs/BUILD_LOG.md` — autonomous runs record the decisions made on the user's behalf,
guided runs record the gates the user approved. Its format is in `autonomous.md`.

- **Update `Current stage` at every stage and task boundary**, before moving on.
- **Anything the run will need later is written to a file first** — the build log, the plan's
  checkboxes, the spec, the business doc.
- **After a compaction, or in a new session, re-read the build log and the plan** — not the
  conversation.

With the state on disk, the conversation can be cleared or compacted at any point without losing
anything the run depends on.

## The main thread coordinates

The main thread holds the run mode, the current stage, the plan, and one short report per task. The
work happens elsewhere:

- **Build tasks run in subagents** ([subagents.md](subagents.md)). Related small tasks go into one
  subagent together; tasks that depend on each other run one after another; independent tasks run in
  parallel, each in its own worktree.
- **Broad searches go to a read-only search subagent**, which returns the answer, not the files it read.
- **Read the lines you need**, not the whole file. Never re-read a file you just wrote.
- **With Graft on, query before reading** — `graft_repo_map`, `graft_find_code`, and `graft skeleton
  <file>` for a file's signatures without its bodies ([graft.md](graft.md)).

Stages that need the user — intake, approvals, open decisions — stay in the main thread, since a
subagent can't ask the user anything.

## Output

Chat is for decisions and status; content lives in files.

- **One line per finished task:**
  `✓ 7/14 Cancel a booking — 18 tests, 5 edge cases, a1b2c3d`
- **Long content goes to a file, and the chat names the file** — specs, plans, edge-case lists, review
  findings, final reports.
- **Never restate** a plan, a spec, or a file just written, and don't narrate tool calls.
- **Approval messages stay short too:** what is being approved, the two or three decisions worth a
  look, and the file to read.

## Quiet tests

A green suite needs one line, not two hundred. Send the full output to a log and show the summary —
plus the failures, only when there are any:

```bash
mkdir -p .logs
npm test > .logs/test.log 2>&1; rc=$?     # not `status` — read-only in zsh
tail -n 15 .logs/test.log
[ $rc -ne 0 ] && grep -n -B2 -A25 -E '●|✘|FAIL|Error' .logs/test.log | head -n 150
```

This works whatever the runner. Quieter reporters help further: `vitest run --reporter=dot`,
`playwright test --reporter=dot`, `jest --silent`.

- **`.logs/` is gitignored.** The full log stays on disk for when a failure needs more than the excerpt.
- **The summary line is the evidence**, copied exactly as the runner printed it. "All tests pass" without
  it is a claim; a pasted 400-line log is a cost.

## Clearing the conversation

- **Guided runs:** every approval gate ends with one line — *"Good point to `/clear` and run
  `/build-software` again; it resumes from the build log."* The user is at the keyboard anyway.
- **Autonomous runs:** there is nobody to clear. The coordinating main thread keeps the conversation
  small, and when Claude Code compacts it automatically, the state on disk means nothing is lost.

## Red flags

- Run state that exists only in the conversation
- Build tasks run inline in the main thread on a long run
- A recap of work that is already in a file
- A full test log in the conversation, or a test result paraphrased instead of its summary line
- A subagent report longer than about ten lines
- A whole file read to find one value, or a file re-read right after writing it
