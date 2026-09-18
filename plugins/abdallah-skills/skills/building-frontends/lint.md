# Lint and typecheck

The rules in `SKILL.md` that a linter can see are enforced by the linter, not by memory. A task whose
`lint` or `typecheck` fails isn't done.

## Setup

```bash
npm i -D eslint@9 eslint-config-next typescript-eslint eslint-plugin-i18next eslint-plugin-boundaries \
  eslint-import-resolver-typescript eslint-config-prettier prettier prettier-plugin-tailwindcss
```

- Copy [eslint.config.mjs](eslint.config.mjs) from this folder to the app root. It was run against a
  scratch Next.js 16 app: each rule catches its violation, and a clean app reports zero problems.
- `.prettierrc`:
  ```json
  { "plugins": ["prettier-plugin-tailwindcss"], "tailwindFunctions": ["cn", "clsx", "cva", "twMerge"] }
  ```
- `package.json` scripts: `"lint": "eslint ."`, `"typecheck": "tsc --noEmit"`, `"format": "prettier --write ."`.
- TypeScript must sit inside the range `typescript-eslint` supports — check its peer dependency and pin
  `typescript` to it rather than taking the newest release.

**The folders are constants at the top of the config** — `UI_KIT` (`src/components/ui/**`),
`API_LAYER` (`src/lib/**`), and the `src/features/*` element. When a repo keeps them elsewhere, change
the constants. Never delete a rule to get green.

## What it enforces

| Rule | Enforces |
|---|---|
| `local/no-physical-direction` | logical utilities only — `pl-4` fails with "use `ps-4`"; covers `md:`, `hover:`, `-ml-2`, `pl-4!` |
| `local/no-raw-colors` | token colours only — hex values, `text-[#123456]`, and palette classes like `bg-blue-500` or `text-white` fail outside `src/components/ui/` |
| `no-restricted-syntax` | no native `<select>`, `<progress>`, `<details>`, or checkbox/radio/date/time/file/range/color inputs outside `src/components/ui/`; the message names the shadcn replacement |
| `i18next/no-literal-string` | no hardcoded text in JSX (tests and config files exempt) |
| `no-restricted-globals` / `no-restricted-properties` | `fetch` only inside the API layer |
| `boundaries/dependencies` | a feature never imports another feature — shared code moves to `src/components` or `src/lib` |
| `@typescript-eslint/no-floating-promises`, `no-misused-promises`, `no-explicit-any` | awaited promises, no `async` handlers where a `void` return is expected, no `any` |
| Next `core-web-vitals` + `typescript` | Next's own rules, React hooks rules, and accessibility basics |

**Known limits:** a class string stored in a plain variable before it reaches `className` or `cn()`
isn't checked; in style objects only hex is banned, since tokens use `hsl(var(--x))`.

## An existing repo

**The house lint config is not a stack change.** "The existing project's stack always wins" covers
the framework, libraries, and structure. Lint is a check on the code, so a repo without this config
gets it — as its own `chore/lint` commit before the first task.

1. **No ESLint config:** add this one. **Its own config:** keep it, and add the house blocks from this
   file on top — the local plugin, the restricted syntax and imports, and the feature boundaries.
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
