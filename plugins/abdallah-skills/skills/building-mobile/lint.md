# Lint and typecheck

The rules in `SKILL.md` that a linter can see are enforced by the linter, not by memory. A task whose
`lint` or `typecheck` fails isn't done.

## Setup

```bash
npx expo install -- --save-dev eslint@9 eslint-config-expo typescript-eslint eslint-plugin-i18next \
  eslint-plugin-boundaries eslint-import-resolver-typescript eslint-config-prettier prettier \
  prettier-plugin-tailwindcss
```

- Copy [eslint.config.mjs](eslint.config.mjs) from this folder to the app root. It was run against a
  scratch Expo 57 app with NativeWind and React Native Reusables: each rule catches its violation, and
  a clean app — kit components, token and logical classes, `t()` text, `fetch` inside `src/lib` —
  reports zero problems.
- `.prettierrc`:
  ```json
  { "plugins": ["prettier-plugin-tailwindcss"], "tailwindFunctions": ["cn", "clsx", "cva"] }
  ```
  Keep NativeWind's `tailwind.config.js` at the root so the plugin orders token classes correctly.
- `package.json` scripts: `"lint": "eslint ."`, `"typecheck": "tsc --noEmit"`.
- TypeScript must sit inside the range `typescript-eslint` supports — check its peer dependency and pin
  `typescript` to it rather than taking the newest release.

**The folders are constants at the top of the config** — the kit (`src/ui/**`), the data layer
(`src/lib/**`), the screens checked for raw sizes (`app/`, `src/features/`), and the `src/features/*`
element. When a repo keeps them elsewhere, change the constants. Never delete a rule to get green.

## What it enforces

| Rule | Enforces |
|---|---|
| `no-restricted-imports` | no `Button`, `Switch`, `TextInput`, `ActivityIndicator`, `Alert`, `Modal`, or `Touchable*` from `react-native`, and no `@react-native-picker/picker`, outside `src/ui/` — the message names the kit replacement. `View`, `Text`, `ScrollView`, `FlatList`, `Pressable`, `Image` stay allowed |
| `local/no-raw-colors` | no hex, `rgb()` or `hsl()` in styles, `StyleSheet.create`, or colour props, and no `bg-[#…]` or palette classes (`bg-red-500`, `text-white`) outside `src/ui/` |
| `local/no-raw-sizes` | no raw numbers for margin, padding, gap, font size, line height, letter spacing, or radius in `app/` and `src/features/` — token classes or the theme. `0`, `flex`, percentages, and `StyleSheet.hairlineWidth` pass |
| `local/no-physical-direction` | no `marginLeft`/`paddingRight`/`left`/`right`/left-right border and corner keys, no `textAlign: 'left'`, no `pl-`/`mr-`/`left-`/`text-left` classes — the message names the logical form (`marginStart`, `ps-`, `start-`, `text-start`) |
| `i18next/no-literal-string` | no hardcoded text in JSX (tests exempt) |
| `no-restricted-globals` / `no-restricted-properties` | `fetch` only inside `src/lib/` |
| `boundaries/dependencies` | a feature never imports another feature |
| `@typescript-eslint/no-floating-promises`, `no-misused-promises`, `no-explicit-any` | awaited promises, no `async` `onPress` where a `void` return is expected, no `any` |
| `eslint-config-expo` | Expo's own rules and React hooks rules |

**Known limits:** styles are checked only when written in a `style`/`*Style` prop, in
`StyleSheet.create`, or in a variable typed `ViewStyle`/`TextStyle`/`ImageStyle`/`StyleProp` — a value
spread in from elsewhere isn't; colour props are caught when the prop name ends in `color`/`colors`;
class strings are checked in `className`/`*ClassName` props and inside `cn()`/`clsx()`/`cva()`.

## An existing repo

**The house lint config is not a stack change.** "The existing project's stack always wins" covers
the framework, libraries, and structure. Lint is a check on the code, so an app without this config
gets it — as its own `chore/lint` commit before the first task.

1. **No ESLint config:** add this one. **Its own config** (Expo generates one): keep it, and add the
   house blocks from this file on top.
2. Freeze what's already there: `npx eslint --suppress-all .` writes `eslint-suppressions.json`.
   Commit it. Every existing violation is recorded; every new one fails.
3. The count only goes down. After fixing suppressed violations, run `npx eslint --prune-suppressions .`
   and commit the smaller file. Adding a new violation of a suppressed rule to a file surfaces all of
   that rule's errors in the file — fix them all, then prune.

Never reformat the whole app in the same change; Prettier runs on the files a task touches.

## Red flags

- `eslint-disable` without a `-- reason` on the same line
- A rule removed or turned to `warn` to make a task pass
- An app left without lint because "the existing stack wins"
- `eslint-suppressions.json` growing
- A commit made with `lint` or `typecheck` failing
