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
| **building-frontends** | any UI work — components, forms, styling, loading states, i18n/RTL, data fetching |
| **building-backends** | any API work — controllers, services, DTOs, Prisma, auth, pagination, errors |
| **capturing-corrections** | a correction worth recording so it doesn't have to be given twice |
| **deploying-to-vercel** | deploying a Nest/Express/Next app, and the failures that look like nothing is wrong |

Each keeps `SKILL.md` as a scannable contract and pushes detail into sibling files that load
only when they're relevant.

**building-frontends** — Next.js · TypeScript · Tailwind · shadcn/ui · Zustand ·
react-hook-form + zod. Reusability contract, logical-property RTL, skeletons over spinners,
a CSS-only scrollbar, and the form rules (required asterisk, placeholder *and* label, the
16px iOS-Safari zoom fix).

**building-backends** — NestJS · Prisma · Passport-JWT · class-validator · Jest.
Controller → service → repository, a single response envelope with a matching exception
filter, DTO conventions, RLS multi-tenancy, Docker for local/test/prod, and a two-tier
testing setup.

## Hooks

`hooks/` holds the pieces `capturing-corrections` needs — a skill alone can't guarantee
anything, because the model decides when to invoke it. Hooks are run by the harness.

| Hook | Event | Does |
|---|---|---|
| `capture-correction.sh` | `UserPromptSubmit` | notices correction-shaped messages and asks the model to record the rule |
| `load-learnings.sh` | `SessionStart` | force-loads `.claude/LEARNINGS.md` so the record is actually read |
| `burn-warn.py` | `UserPromptSubmit` | warns when the 5-hour usage window is burning fast |

Copy them somewhere stable and wire them up in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "~/.claude/hooks/capture-correction.sh", "timeout": 5 }] }
    ],
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "~/.claude/hooks/load-learnings.sh", "timeout": 5 }] }
    ]
  }
}
```

Use absolute paths if `~` doesn't expand in your shell. Both scripts exit 0 on unexpected
input, so a broken hook can never block a prompt.

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
