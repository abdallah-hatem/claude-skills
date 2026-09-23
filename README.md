# claude-skills

My [Claude Code](https://claude.com/claude-code) skills — the conventions I'd otherwise
re-explain at the start of every project, written down so the agent reads them instead.

## Install

```bash
claude plugin marketplace add abdallah-hatem/claude-skills
claude plugin install abdallah-skills@abdallah-hatem
```

Restart the session afterwards; skills load at startup.

## What's in it

| Skill | Fires on |
|---|---|
| **building-frontends** | any UI work — design system, colour tokens and motion, components, forms, styling, loading states, i18n/RTL, data fetching |
| **building-backends** | any API work — controllers, services, DTOs, Prisma, auth, pagination, errors |
| **building-mobile** | any Expo / React Native work — screens, navigation, lists, sheets, forms, data fetching against a NestJS API or Supabase, RTL, EAS builds and OTA updates |
| **designing-mobile** | the look of a mobile app — direction, native-first with the brand on top, tokens, motion and haptics, the themed kit |
| **capturing-corrections** | a correction worth recording so it doesn't have to be given twice |
| **deploying-to-vercel** | deploying a Nest/Express/Next app, and the failures that look like nothing is wrong |
| **build-software** | `/build-software` only — a new app from idea to production, or a feature added to an existing app, run guided or fully autonomous, for web, mobile, or both. Business doc, edge-case tests, house lint rules, a design approval, parallel subagent waves, git flow with PRs into `dev` and `production`, preview and production deploys on Vercel or EAS, and test logins kept in a gitignored file |

Each keeps `SKILL.md` as a scannable contract and pushes detail into sibling files that load
only when they're relevant.

**building-frontends** — Next.js · TypeScript · Tailwind · shadcn/ui · Zustand ·
react-hook-form + zod. Reusability contract, logical-property RTL, skeletons over spinners,
a CSS-only scrollbar, and the form rules (required asterisk, placeholder *and* label, the
16px iOS-Safari zoom fix). A verified ESLint config turns the mechanical rules into errors.

**building-backends** — NestJS · Prisma · Passport-JWT · class-validator · Jest.
Controller → service → repository, a single response envelope with a matching exception
filter, DTO conventions, RLS multi-tenancy, Docker for local/test/prod, a two-tier
testing setup, and a verified ESLint config for the layering rules.

**building-mobile** — Expo · expo-router · NativeWind · React Native Reusables · React Query ·
react-hook-form + zod. The kit first and no raw React Native controls (lint-enforced), feature folders,
one data client for NestJS or Supabase, RTL on native, EAS channels and OTA-vs-store-build rules, and
Maestro smoke flows. Loads the official `expo` plugin's skills where they apply.

**designing-mobile** — the mobile counterpart of `frontend-design`: a committed direction,
platform-native navigation with the brand in colour, type, motion and a few signature moments, and
tokens shared with the web.

## Agents

| Agent | Used by | Does |
|---|---|---|
| `business-alignment-reviewer` | `/build-software` | Checks a plan, or a task's diff, against `docs/BUSINESS_LOGIC.md` — including whether every business rule has an edge-case test that tries to break it. Reports conflicts, missing coverage, or a doc that's out of date. Read-only. |
| `ui-auditor` | `/build-software` Verify, and before each release PR | Enumerates every screen, tab, modal, sheet, menu and empty/loading/error state from the code, drives the app to each (Maestro on the iOS simulator for Expo, Playwright for web) as the seeded accounts, and screenshots it in light/dark, LTR/RTL (Arabic), small and large device, plus the largest Dynamic Type. Then looks at every shot for overflow, overlap, misalignment, wrong arrow direction, cut-off sheets, safe-area bleed, untranslated text, Western digits in Arabic and anything out of place. Reports findings with severity and screenshot paths, and every screen it couldn't reach. Never edits app code; one simulator at a time, shut down when done. |

## Hooks

`hooks/` holds the pieces `capturing-corrections` needs — a skill alone can't guarantee
anything, because the model decides when to invoke it. Hooks are run by the harness.

| Hook | Event | Does |
|---|---|---|
| `capture-correction.sh` | `UserPromptSubmit` | notices correction-shaped messages and asks the model to record the rule |
| `load-learnings.sh` | `SessionStart` | force-loads `~/.claude/LEARNINGS.md` (every project) and `<repo>/.claude/LEARNINGS.md` (that repo) so the record is actually read |
| `burn-warn.py` | `UserPromptSubmit` | warns when the 5-hour usage window is burning fast, compared with your own usual block — the median of your last 45 days, learned, not a fixed number |
| `statusline-burn.py` | `statusLine` | the 5-hour burn in the status line; also the engine `burn-warn.py` imports, so it must sit at `~/.claude/statusline-burn.py`. Run it once with `--rebuild-history` to learn from past transcripts; `--stats` shows what it has learned |
| `session-state.sh` | `SessionStart` | loads the work's state into every new, resumed, cleared, or compacted session: a `/build-software` run's `docs/BUILD_LOG.md` header, or the repo's handoff note from `~/.claude/handoffs/` |
| `pre-compact.sh` | `PreCompact` | tells the compaction summary what must survive — goal, finished work with hashes, work in progress, decisions, next step — and the build log's current stage |
| `stop-handoff.sh` | `Stop` | after a reply that made real progress (a commit, or files changed with the note 30+ min old), has the model write the why / in-progress / next step into the repo's handoff note — silent otherwise, skipped in a `/build-software` run, can't loop |
| `session-end-handoff.sh` | `SessionEnd` | writes the facts half of the handoff note when a session ends — branch, commits, uncommitted files, the user's last requests — keeping the model's summary above it |

Copy them somewhere stable and wire them up in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "~/.claude/hooks/capture-correction.sh", "timeout": 5 }] }
    ],
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "~/.claude/hooks/load-learnings.sh", "timeout": 5 }] },
      { "hooks": [{ "type": "command", "command": "~/.claude/hooks/session-state.sh", "timeout": 5 }] }
    ],
    "PreCompact": [
      { "hooks": [{ "type": "command", "command": "~/.claude/hooks/pre-compact.sh", "timeout": 5 }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "~/.claude/hooks/stop-handoff.sh", "timeout": 10 }] }
    ],
    "SessionEnd": [
      { "hooks": [{ "type": "command", "command": "~/.claude/hooks/session-end-handoff.sh", "timeout": 10 }] }
    ]
  }
}
```

Use absolute paths if `~` doesn't expand in your shell. Every script exits 0 on unexpected
input, so a broken hook can never block a prompt or a compaction. `session-state.sh` reads
`jq` and `git`; `SessionStart` also fires after a compaction (source `compact`), which is when
it asks for the build log or the handoff note to be brought up to date.


## Editing these

Edit here, not in `~/.claude/skills/` — the plugin install is what your machines read.

**Bump `version` in `plugins/abdallah-skills/.claude-plugin/plugin.json` in the same commit.**
`claude plugin update` compares version strings, so without a bump it reports
"already at the latest version" and silently keeps serving the old files.

```bash
claude plugin marketplace update abdallah-hatem
claude plugin update abdallah-skills@abdallah-hatem
```

Then restart the session; skills load at startup.

## Adapting these

They encode *my* stack. The line that matters is in each skill:

> **The existing project's stack always wins.**

Fork it and swap the stack table for yours — the structure (a short contract, detail in
sibling files, a red-flag checklist) is the reusable part.

## License

MIT
