# Subagents

Use them where they buy real parallelism or keep noise out of the main context. Every subagent
rebuilds context from scratch and multiplies token spend — so batch small work, and run independent
work at the same time rather than one task after another.

## When

**Build tasks run in subagents** — that is what keeps a long run's main thread small. Each task's file
reads, test output, and debugging are discarded when the subagent reports back.

- **Related small tasks go into one subagent together.** A brief for a two-line change costs more than
  the change; five of them in one brief doesn't.
- **Tasks that depend on each other run one after another**, each in its own subagent.
- **Independent tasks run in parallel**, each in its own worktree, or they overwrite each other's
  changes. Backend and frontend tasks become independent once the Contract stage has fixed the API.
- **Broad investigations and reviews** also go to subagents — only the conclusion comes back.

**Stay in the main thread for anything that needs the user:** intake, approvals, any open decision. A
subagent cannot ask the user anything.

## The parallel check — before every dispatch

Run it before the first task and again every time a subagent reports back — not only when parallel
work looks likely:

1. **Ready tasks** — every task whose dependencies are committed and checked (and, for frontend work,
   whose contract exists). **Derive this from each task's own inputs, never from the plan's wave
   table.** The table is a planner's guess and is wrong in both directions: it can group tasks that
   collide, and it can park a task in a later wave that is already free. A task whose inputs exist
   is ready *now*, whatever wave it was written into — and a free slot while one is waiting is the
   failure this check exists to prevent. Don't wait for the user to ask why nothing else is running.
2. **Separate the ones that collide.** Two ready tasks can't run side by side when they edit the same
   files. The usual shared ones: `prisma/schema.prisma` and migrations, `package.json` and the
   lockfile, shared layouts and navigation, the i18n locale files, the generated API client — and a
   signature change to a symbol another ready task calls (grep for its callers). Colliding
   tasks go into one subagent together, or one waits for the next wave.
3. **Dispatch the rest in one message** — one `Agent` call per task (or batch), each with
   `isolation: "worktree"` and its own `feature/<name>` branch, at most five at once. A task that
   depends on an earlier wave's task is cut from that task's branch, or from a local merge of several,
   not from `dev` — nothing is pushed before Ship.
4. **Log the wave** in the feature's `docs/build-log/waves/<feature>/README.md`, including what waits
   and why:
   `Wave 3: T4 T5 T6 T7 in parallel · T8 waits on T4 · T9 after T6 (both edit ar.json)`. One ready
   task is still a wave: `Wave 5: T11 alone — T10 not done`.

**`superpowers:subagent-driven-development` dispatches implementers one at a time.** Use its brief and
review loop for each task, but let the parallel check decide what is dispatched together.

**Parallel agents share one machine.** Inside a worktree, a subagent runs its unit and component
tests only. Anything that binds a port, starts a dev server, or migrates the local database — e2e and
smoke specs, `prisma migrate` — waits until the wave is back, and the main thread runs it once on the
merged result. **The exception is a repo whose e2e setup takes a per-agent database** (for example, a
test setup that keeps any `DATABASE_URL` naming a `<app>_test*` database): create and migrate one
database per parallel agent first, name it in each brief, and they can run e2e side by side without
truncating each other's rows.

**A fresh worktree is missing everything generated.** No `node_modules`, no built workspace
packages (`packages/*/dist`), no generated Prisma client. Every worktree brief says: `npm install`
at the root, build the shared package, and `prisma generate` — otherwise `tsc` resolves the shared
package *up into the main checkout's build* and reports phantom errors against a different branch.
The same trap runs the other way: after switching the main checkout to another branch, rebuild the
shared package, or the API typechecks against the old one.

**Keep the bundler out of agent worktrees.** Worktrees live under `.claude/worktrees/`, inside the
workspace that Metro (and Jest's haste map) watch in a monorepo — each a full copy of the app. With
the same module on disk in several places, Metro can serve the phone a **stale copy from a
worktree** while the main tree's code, the API and the served bundle are all correct. Before the
first mobile wave, add the path to Metro's resolver blockList:

```js
const blockList = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(blockList) ? blockList : blockList ? [blockList] : []),
  /[/\\]\.claude[/\\]worktrees[/\\].*/,
];
```

When a device shows something the code says it can't, put a `console.log` in the file you believe
is running. If it never fires, the phone is running another copy — check this before debugging the
feature.

## Briefing a subagent

A subagent starts with none of this conversation, so the brief has to stand alone:

- **Goal and done-criteria** — the task from the plan, and what proves it is finished.
- **Scope** — the repo path, the `feature/<name>` branch or worktree it works in, the files or
  domain it owns, and what it must not touch.
- **The skill to load first** — `building-backends`, `building-frontends`, or `building-mobile`. It
  won't know to.
- **Existing code first** — before writing a component, hook, helper, service method, guard, or DTO,
  grep for one and extend it; extract on the second use, as the stack
  skill says. List every shared piece it creates (`common/`, `lib/`, `components/ui/`) by path in the
  report.
- **Before changing a symbol other code uses,** grep for every caller and update each one.
- **The business doc** — `docs/BUSINESS_LOGIC.md`, to read before starting.
- **The build-log files it needs, by path** — its phase's `docs/build-log/decisions/<phase>.md` and
  any `notes/` file that applies — never "read the build log". It writes its own report to
  `docs/build-log/waves/<feature>/<task>.md` and touches no other log file, so parallel tasks never
  conflict there.
- **For frontend tasks, the design system** — `docs/DESIGN.md` and the tokens in `globals.css`.
  Screens use tokens only; no new colours, sizes, or curves. **For mobile tasks**, `docs/DESIGN.md`, the
  NativeWind tokens, and the kit in `src/ui/` — screens are built from the kit, never raw React Native
  controls.
- **The contract** it builds against, pasted in rather than pointed at.
- **The task's class and its tests** — `logic`: unit and full-flow tests plus **the edge-case list
  from the plan, pasted in**, one test per case named after it · `ui`: component tests for the
  behavior and a smoke spec · `surface`: no new tests.
- **No credentials.** Never paste values from `CREDENTIALS.local.md`. Tests that need a signed-in
  user create one in their own setup.
- **Run the tests, `lint`, and `typecheck` in the foreground, and commit only when all three pass.** A
  subagent that starts a long test run in the background stops mid-turn and leaves its work
  uncommitted. Lint errors are fixed, never disabled without a `-- reason`.
- **Don't push, open PRs, or merge.** Shipping happens once, from the main thread, after Verify.
- **Report back in ten lines or fewer:** the files changed, the test command with the runner's summary
  line and any failures in full, the `lint` and `typecheck` result, the commit hash, and the shared pieces it
  created. No narrative, no recap of the brief.
- **Keep test output quiet** — full log to a file, summary and failures only ([efficiency.md](efficiency.md)).

## After it reports

Check, don't trust — cheaply. Confirm the commit exists with `git show --stat`, re-run the tests with
quiet output, and for a `logic` task let the alignment review read the diff. "All tests pass" without
the runner's summary line is a claim, not evidence.

**Compare the shared pieces across the wave.** Agents in parallel worktrees can't see each other, so
two of them can each write the same helper or component. When the reports list overlapping pieces,
merge them into one — and switch both callers to it — before the next wave.

## Red flags

- A dispatch with no parallel check and no wave line in the build log before it
- Ready, independent tasks sent one per message, one after another
- A ready task left waiting because the plan's wave table put it in a later wave
- A task landing with no fresh parallel check straight after it
- A subagent spawned for one tiny task that could have been batched with others
- Parallel subagents editing the same files, or sharing one worktree
- Parallel subagents each running e2e specs, dev servers, or migrations on the same machine
- A device check with agent worktrees on disk and Metro not blocking `.claude/worktrees/`
- A brief that doesn't say which skill to load
- A brief without the existing-code-first line
- Two agents in one wave each adding the same helper or component, left unmerged
- A frontend or mobile brief that doesn't point the subagent at the design system and the kit
- A mobile subagent starting a simulator, Metro, or an EAS build — those belong to the main thread
  (or to `ui-auditor`, dispatched alone after the wave)
- A brief that contains a credential value
- A subagent running its tests in the background
- A subagent that pushes, opens a PR, or merges
- A subagent's "done" accepted without checking the commit and re-running the tests
- A report longer than about ten lines, or one that pastes a full test log
