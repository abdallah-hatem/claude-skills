# Lint and typecheck

The Red flags in `SKILL.md` that a linter can see are enforced by the linter, not by memory. A task
whose `lint` or `typecheck` fails isn't done.

## Setup

```bash
npm i -D eslint@9 @eslint/js typescript-eslint eslint-plugin-boundaries eslint-import-resolver-typescript \
  eslint-config-prettier prettier globals
```

- Copy [eslint.config.mjs](eslint.config.mjs) from this folder to the API root. It was run against a
  scratch NestJS + Prisma app: each rule catches its violation, and idiomatic controllers, services,
  repositories, and config report zero problems — with no `no-unsafe-*` noise from decorators or
  Prisma results.
- `.prettierrc`: `{ "singleQuote": true, "trailingComma": "all" }`
- `package.json` scripts: `"lint": "eslint ."`, `"typecheck": "tsc --noEmit"`.
- TypeScript must sit inside the range `typescript-eslint` supports — check its peer dependency and pin
  `typescript` to it rather than taking the newest release.

**The zones are constants at the top of the config** — `PRISMA_ZONES` (repositories, `src/database`,
`src/common/repositories`) and `ENV_ZONES` (`src/config`, `prisma.config.ts`, test setup). When a repo
keeps them elsewhere, change the constants. Never delete a rule to get green.

`no-restricted-imports`, `no-restricted-properties`, and `no-restricted-syntax` **replace** their
options when a later block matches the same file — they don't merge. Each zone in the config
rebuilds its full option list from the shared pieces at the top; a new block has to do the same.

## What it enforces

| Rule | Enforces |
|---|---|
| `@typescript-eslint/no-restricted-imports` in `*.controller.ts` | no `@prisma/client` (not even types) and nothing under `database/` in a controller |
| `no-restricted-syntax` in `*.controller.ts` | no `@Res()` / `@Response()`, no `.status()` / `.sendStatus()` — throw `HttpException`s, use `@HttpCode()` |
| `@typescript-eslint/no-restricted-imports` | value imports from `@prisma/client` only in repositories and `src/database`; `import type` is fine everywhere else |
| `no-restricted-properties` / `no-restricted-imports` | `process.env` only in `src/config` — inject `ConfigService` elsewhere |
| `no-restricted-properties` | no `$queryRawUnsafe` / `$executeRawUnsafe` — tagged `$queryRaw` with `Prisma.sql` |
| `no-console` | Nest `Logger` in `src/`; allowed in `test/` and `scripts/` |
| `boundaries/dependencies` | a domain never imports another domain's repository — inject its exported service |
| `@typescript-eslint/no-floating-promises`, `no-misused-promises`, `no-explicit-any`, `await-thenable`, `require-await`, `only-throw-error` | promises awaited, no `any`, only `Error`s thrown |

**Known limit:** the `.status()` check is by syntax, so any `x.status(...)` call in a controller is
flagged, not only one on a response object.

## An existing repo

**The house lint config is not a stack change.** "The existing project's stack always wins" covers
the framework, ORM, and structure. Lint is a check on the code, so a repo without this config gets
it — as its own `chore/lint` commit before the first task.

1. **No ESLint config:** add this one. **Its own config** (the Nest CLI generates one): keep it, and
   add the house blocks from this file on top — the restricted imports, properties, and syntax, and
   the domain boundaries.
2. Freeze what's already there: `npx eslint --suppress-all .` writes `eslint-suppressions.json`.
   Commit it. Every existing violation is recorded; every new one fails.
3. The count only goes down. After fixing suppressed violations, run `npx eslint --prune-suppressions .`
   and commit the smaller file. Adding a new violation of a suppressed rule to a file surfaces all of
   that rule's errors in the file — fix them all, then prune.

Never reformat the whole repo in the same change; Prettier runs on the files a task touches.

## Red flags

- `eslint-disable` without a `-- reason` on the same line
- A rule removed or turned to `warn` to make a task pass
- A repo left without lint because "the existing stack wins"
- `eslint-suppressions.json` growing
- A commit made with `lint` or `typecheck` failing
