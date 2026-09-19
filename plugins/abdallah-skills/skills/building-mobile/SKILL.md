---
name: building-mobile
description: Use when building or changing any React Native or Expo app — screens, navigation, tabs, sheets, lists, forms, data fetching and auth against a NestJS API or Supabase, i18n or RTL layout, splash and icons, EAS builds or OTA updates — and when scaffolding a new Expo app or adding a React Native Reusables component.
---

# Building Mobile

Abdallah's mobile conventions. Every screen ships built from the kit, internationalized,
RTL-correct, and working on phone and tablet — or it isn't finished.

## Stack

| Concern | Choice |
|---|---|
| Framework | Expo (current SDK), expo-router |
| Language | TypeScript, `strict` |
| Styling | NativeWind, themed from the design tokens |
| Components | React Native Reusables (the shadcn/ui port) in `src/ui/` |
| Client state | Zustand |
| Server state | React Query over one data client — see [data-layer.md](data-layer.md) |
| Auth storage | expo-secure-store — never AsyncStorage for a token |
| Forms | react-hook-form + zod |
| i18n | react-i18next + expo-localization — RTL in [rtl.md](rtl.md) |
| Animation | Reanimated |
| Lists | FlashList (`@shopify/flash-list`) |
| Images | `expo-image` |
| Release | EAS Build + EAS Update — see [release.md](release.md) |
| Crash visibility | `expo:eas-update-insights`. No Sentry. |

**The existing project's stack always wins.** In an app that already picked Tamagui, Redux,
StyleSheet, or its own folder layout, follow the app. This table is for new projects and for gaps
an app hasn't filled. Never migrate a working app to match it.

**Lint is not part of the stack.** Every app gets the house lint config — an app without it gets it
added, with existing violations frozen. See Lint.

## Shared with the web

These rules are defined once, in `building-frontends`, and apply here unchanged. Read them there:

- **Reusability contract** — applied to this layout in Reuse.
- **Forms** — zod schemas, required asterisk, placeholder and label, grouped numbers, Egyptian
  mobile numbers ([forms.md](../building-frontends/forms.md)).
- **i18n and RTL** — no hardcoded user-facing string; `en` and `ar` keep identical key sets.
- **Testing** — behavior, not appearance.

The web's Scrollbars section is N/A: mobile keeps the system scroll indicators.

In a repo with a web app, the zod schemas, API types, locale files, tokens, and pure helpers
(phone normalising, number formatting) live in `packages/shared` and both apps import them.

## The Expo skills

The official `expo` plugin owns general Expo know-how. Load its skills at these points; never copy
them.

| When | Load |
|---|---|
| Any Expo task, first | `expo:expo-overview` |
| Any screen, layout, icons, media | `expo:expo-native-ui` |
| Routes, stacks, tabs, headers, form sheets | `expo:expo-router` |
| Motion, gestures, keyboard-tracking UI | `expo:expo-animation` |
| Tokens, theme, a drift audit | `expo:expo-design-system` (with `designing-mobile`) |
| Scaffolding a new app | `expo:expo-project-structure` — then this skill's Structure |
| Any network call | `expo:expo-data-fetching`, then [data-layer.md](data-layer.md) |
| A native module, before a dev build | `expo:expo-dev-client` |
| Publishing an OTA update | `expo:eas-update`, then [release.md](release.md) |
| After an OTA reaches production | `expo:eas-update-insights` |
| A store build or submission | `expo:eas-app-stores`, then [release.md](release.md) |
| The repo has `.eas/workflows/` | `expo:eas-workflows` |
| SDK upgrade | `expo:expo-upgrade` |
| Writing a native module or view | `expo:expo-module` |
| A native control the kit can't provide | `expo:expo-ui` |
| A third-party integration (Stripe, Supabase auth, maps) | `expo:expo-examples` |

Not used: `eas-hosting`, `eas-observe`, `eas-simulator`, `expo-app-clip`, `expo-brownfield`,
`expo-dom`, `expo-web-to-native`, `expo-skill-feedback`.

Where a house rule below differs from an Expo skill, the difference is named in one line. The
house rule wins; everything else in the Expo skill applies.

## Structure

```
app/                      routes only — thin files that render a feature's screen
src/ui/                   the kit: React Native Reusables components + the app's own primitives
src/features/<name>/      screens, hooks, API calls, and components owned by one feature
src/lib/                  data client, query client, i18n, storage, pure helpers
packages/shared/          (web + mobile repos) zod schemas, API types, locale files, tokens, pure logic
```

**The house layout wins over `expo:expo-project-structure`'s `components/` + `screens/` split,**
because a feature folder keeps a feature's screens, hooks, and API calls together the way the web
app's does. Its other rules stand: routes-only `app/`, kebab-case files, colocated tests, `@/`
aliases.

## Components — the kit first

**React Native Reusables first.** If the kit has the component, add it and compose:

```bash
npx @react-native-reusables/cli@latest init          # new app: Expo + NativeWind template
npx @react-native-reusables/cli@latest add button input select
```

Point `components.json` → `aliases.ui` at `@/ui` so components land in `src/ui/`. The kit has
Button, Input, Textarea, Label, Select, Checkbox, RadioGroup, Switch, Toggle, ToggleGroup, Tabs,
Dialog, AlertDialog, Popover, DropdownMenu, ContextMenu, Tooltip, Progress, Skeleton, Card, Badge,
Avatar, Accordion, Collapsible, Separator, Alert, and `Text`. It has no toast and no sheet: toasts
are `sonner-native` wrapped once in `src/ui/`, sheets are native (see Sheets and modals).

Never hand-roll a button, input, select, switch, checkbox, dialog, sheet, toast, tabs, or skeleton
in a screen.

**The kit wins over `expo:expo-ui` and `expo:expo-native-ui`'s "native controls first",** because
one brand across both OSes, with the same component names and API as the web's shadcn, matters
more here than per-OS control looks. `@expo/ui` is still the fallback for a control the kit can't
build (a native date picker), wrapped in `src/ui/` like any other.

**NativeWind wins over `expo:expo-native-ui`'s inline styles and `Color` palette,** because tokens
must be defined once and shared with the web. Its other styling rules stand: `gap` over margins,
`boxShadow`, `borderCurve: 'continuous'`. Setting up NativeWind in an existing
app: `expo:expo-examples` (`with-nativewind`) or the kit's manual installation.

## Nothing ships as a raw React Native control

`Button`, `Switch`, `TextInput`, `ActivityIndicator`, `Alert.alert`, and the community picker look
different on each OS and read as unstyled next to a branded screen. Screens use the kit's version.
A control the kit lacks is built into `src/ui/` first, token-styled, with variants, and then used.

Layout primitives are fine: `View`, `ScrollView`, `FlatList`, `Pressable`, `KeyboardAvoidingView`.

**Navigation chrome stays native** — expo-router native tabs, stack headers on pushed screens,
`formSheet` presentation, header search bars, link context menus. These follow `expo:expo-router`
exactly; the kit never imitates them. Tab screens have no header at all (`headerShown: false`) —
their big title is part of the content, per `designing-mobile`; never iOS large titles.

## Reuse

The rule that erodes under deadline, so it is spelled out:

- **Search before writing.** Before a component, hook, or helper, look for an existing one with
  `graft ask "<concept>"`. Grep `src/ui/`, `src/lib/`, and `packages/shared/` for the concept and
  its synonyms only when the repo has no `graft/` folder. Extend what you find rather than writing a
  sibling.
- **Second use extracts,** in the same commit: a component to `src/ui/`, a hook or helper used by
  two features to `src/lib/` (or `packages/shared` when the web needs it too). The original caller
  switches to the shared version.
- **Never copy or reach in.** A feature never imports from another feature's folder; what two
  features share moves out. A kit component that needs a different look gets a variant (`size`,
  `variant`) in `src/ui/`, never a copy tweaked in a screen.

## Screens

- **Safe areas** through stack headers, native tabs, or `contentInsetAdjustmentBehavior="automatic"`
  on the root scroll view, per `expo:expo-native-ui`. A screen whose root is a list has no outer
  `ScrollView`. **Check them yourself before showing the user any screen:** nothing under the
  status bar — at rest, while scrolled, and with the keyboard open — and nothing under the home
  indicator (a bottom-anchored button or caption clears `insets.bottom`). Get the numbers from the
  element bounds (`maestro hierarchy`), not from eyeballing a screenshot.
- **Headerless screens cover only the status bar**, with a strip painted in the screen's own
  backdrop (see `designing-mobile`), so scrolled content never runs under the clock.
- **A transparent header over a nested scroll view is not inset by iOS.** When the scroll view
  isn't the screen's first view (it sits inside a backdrop wrapper), reserve the height yourself:
  a spacer of `insets.top + 44` at the top and `insets.bottom` at the end.
- **NativeWind's `contentContainerClassName` replaces `contentContainerStyle`** — put inset-based
  spacing in a spacer `<View style={{ height }} />`, never in `contentContainerStyle`.
- **Keyboard:** the focused field stays above the keyboard and the rest of the form stays
  reachable by scrolling — `automaticallyAdjustKeyboardInsets` on a `ScrollView` (iOS); Android
  needs `KeyboardAvoidingView behavior="padding"`. Don't pin the primary button above the keyboard
  in a sticky footer; the user chose plain scrolling forms. UI that tracks the keyboard frame
  follows `expo:expo-animation`'s keyboard recipe. `keyboardShouldPersistTaps="handled"` on every
  scrollable form.
- **Phone and tablet:** ~375pt and 768–1024pt, portrait and landscape where the app allows it; no
  horizontal overflow; `useWindowDimensions`, never `Dimensions.get()`. A tablet gets a real layout
  (two columns, a wider form), not a stretched phone.
- **Design comes from `designing-mobile`** — see Design.

## Pressables

The mobile form of the web's `cursor-pointer` rule. Every tappable thing has a **pressed state**
(opacity or scale from the tokens) and a **hit area ≥ 44pt** — `hitSlop` when the visual is
smaller. Disabled looks disabled and ignores taps. A row that navigates is a `Link` with
`asChild`, so it can carry `Link.Preview` and a context menu per `expo:expo-router`.

## Forms

Built from the kit's `Input`, `Textarea`, `Select`, `Checkbox`, with react-hook-form + zod — the
rules in `building-frontends` → Forms apply, and the schemas and helpers come from
`packages/shared` when the web exists. Mobile adds:

- The right `keyboardType` / `inputMode`, `autoComplete`, and `textContentType` per field — a phone
  field gets the phone pad, an email the email keyboard, a one-time code `oneTimeCode`.
- `returnKeyType="next"` moves focus to the next field; the last field's return submits.
- Prose fields are the kit's `Textarea` (multiline, 3–4 lines tall), never a one-line `Input`.
- Numbers read as quantities are shown grouped (`100,000`) with the form holding a `number`.
- Egyptian mobile numbers: exactly 11 digits starting `01`, a pasted `+20` normalised — the web's
  helpers, from `packages/shared` when it exists.
- **Double submit is impossible:** the submit button is disabled and shows its spinner while
  `mutation.isPending`, and the handler returns early when pending.

See [data-layer.md](data-layer.md) for how a failed save keeps the draft.

## Lists

The mobile form of the web's Tables and pagination.

- **FlashList** for anything long or unbounded; `FlatList` is fine for short fixed lists.
- **Infinite scroll keeps the current rows** while the next page loads; a footer skeleton row, never
  a full-list swap.
- **Pull to refresh** on every list that shows server data.
- **Search, filter, sort, and tab changes never jump the list to the top** — the query keeps the
  previous data (`placeholderData: keepPreviousData`) and the list dims until the new rows land.
- **Empty is designed:** `ListEmptyComponent` says why it is empty and offers the next action, and
  never shows while the first load is still running (`expo:expo-data-fetching` → four states).

## Sheets and modals

A sheet is a route with `presentation: "formSheet"` per `expo:expo-router` — native, with detents.
**This wins over `expo:expo-ui`'s `BottomSheet` default,** because a route-backed sheet gets
native chrome, a URL, and back handling for free.

- **Sized to content** with `sheetAllowedDetents`; a short form never opens full-height.
- **Height capped**, header and footer fixed, only the body scrolls. Actions live in the fixed
  footer, never at the bottom of the scrolling body.
- **The keyboard is handled inside the sheet** — the focused field and the Save button stay visible.
- **Scroll never escapes** to the screen behind.
- **Confirmations** are the kit's `AlertDialog`, never `Alert.alert`. Destructive ones say what
  will be lost and use the destructive variant.

## Loading

**Skeletons that mirror the content** — same heights, gaps, and count — using the kit's `Skeleton`.
Never a centred `ActivityIndicator` for a screen or list. A spinner only ever sits inside a
submitting button. Below ~200ms render nothing. Previous data stays on screen while refetching.

**The skeleton rule wins over `expo:expo-data-fetching`'s first-fetch spinner,** because a
skeleton keeps the layout from jumping when data lands.

## Errors

The data layer returns the web's `{ success, data, message }` contract whichever backend is behind
it. A failure shows a translated toast from **one place** (`reportError`), never `toast.error` in a
screen. No unhandled promise. An offline or slow network shows a state with a retry, and a failed
refetch keeps the data already on screen. See [data-layer.md](data-layer.md).

## Accessibility

- AA contrast for every text and background pair, in both themes.
- Every icon-only pressable has an `accessibilityLabel` (translated) and `accessibilityRole`.
- State is announced: `accessibilityState` for selected, checked, disabled, busy.
- Dynamic Type up to the largest accessibility size: text wraps, nothing clips, actions stay
  reachable. No `allowFontScaling={false}` on content.
- A VoiceOver pass on every changed screen: reading order, labels, the focus after a sheet closes.
- Reduce Motion respected (Reanimated's `useReducedMotion`).

## Mobile-only

- **Permissions** are asked in context, at the moment the feature needs them, after a line saying
  why. The denied and "don't ask again" cases have a designed state with a link to Settings.
- **Images** use `expo-image` with a placeholder (blurhash or the token surface), a set
  `contentFit`, and caching — never the React Native `Image` for remote content.
- **Splash screen and app icon** come from the design tokens (background, mark) with a dark
  variant; the splash stays up until fonts, the session, and the language direction are loaded.

## Design

**Design comes from a design system, never screen by screen.** Before the first screen, load
`designing-mobile` and establish one: direction, tokens (colour roles for light and dark, type
scale covering Arabic and Latin, spacing, radius, elevation, motion), and the kit themed from them.
Screens use tokens by name — `bg-primary`, `text-muted-foreground`, `gap-4` — never a hex value or
a one-off size. **Every custom type step and font family goes into `cn`'s `extendTailwindMerge`**
(`src/lib/utils.ts`) the moment it is added: tailwind-merge reads an unknown `text-display` as a
colour and drops `text-foreground` beside it, so the text renders black.

## Lint

`lint` and `typecheck` pass before every commit. The house config turns the mechanical rules above
into errors:

- **Raw controls outside `src/ui/`** — `Button`, `Switch`, `TextInput`, `ActivityIndicator`, and
  `Alert` imported from `react-native`
- **Raw colours and raw sizes in screens** — hex values and palette classes, arbitrary pixel values
  in `app/` and `src/features/`
- **Physical direction** — `marginLeft`, `paddingRight`, `left`, `right`, `ml-`, `pr-`, and friends
- **Hardcoded `Text`** — `i18next/no-literal-string`
- **`fetch` outside `src/lib/`**
- **Feature walls** — one feature importing another
- **Promises and `any`** — `no-floating-promises`, `no-misused-promises`, `no-explicit-any`

Setup, what each rule catches, and adding it to an existing app: [lint.md](lint.md).

## Testing

jest-expo + React Native Testing Library for behavior, Maestro flows as smoke specs, simulator
screenshots for appearance — see [testing.md](testing.md). Screens with behavior are tested beyond
the happy path:

- **Empty, loading, and error states** — each renders; none is a blank screen
- **Long content** — a 200-character name or an unbroken URL doesn't break the row
- **Validation** — every rule shows its translated message and blocks submit
- **Double submit** — two taps on Save send one request
- **Permissions** — a denied permission shows its state; a user without the role can't reach the action
- **RTL** — the screen rendered with Arabic and the direction forced, not only English
- **Input edge cases** — pasted text, a pasted `+20` number, the 12th phone digit
- **Offline** — a failed refetch keeps the data and offers retry

## Before calling it done

**Restart Metro with `--clear` before anyone looks at a change.** Without watchman, Metro misses
file edits and new NativeWind class names, and keeps serving the old code even across app
relaunches — a fix can look broken, or a stale screen can be reported as fixed. Check the served
bundle when in doubt (`curl` the bundle URL and grep for the change).

Check the changed screen on a phone and a tablet, in **both** LTR (English) and RTL (Arabic), in
**both** light and dark, with Reduce Motion on, at the **largest** Dynamic Type size, and on the
**smallest** supported phone (iPhone SE size). Matrix in [testing.md](testing.md).

## Red flags

- A commit with `lint` or `typecheck` failing, or an `eslint-disable` with no `-- reason`
- A raw `Button`, `Switch`, `TextInput`, `ActivityIndicator`, or `Alert.alert` in a screen
- A hand-rolled dialog, sheet, toast, select, or skeleton instead of the kit's
- A kit component copied into a feature and tweaked instead of given a variant
- A hex colour, palette class, or one-off pixel size outside the tokens
- A feature importing another feature's internals
- `fetch` in a screen or hook — the data client lives in `src/lib/`
- A token in AsyncStorage, or a secret in an `EXPO_PUBLIC_*` variable
- `toast.error` called in a screen — errors go through `reportError`
- A centred `ActivityIndicator` where a skeleton belongs
- A list that jumps to the top or collapses to skeletons on search, filter, or page change
- A submit button that stays enabled while its request is pending
- A pressable with no pressed state or a hit area under 44pt
- A focused field hidden under the keyboard, or a form that can't scroll to its primary action
- Content running under the status bar or the home indicator — checked by bounds, not by eye
- A string literal rendered to the user, or a physical-direction style in new code
- A directional icon or `translateX` animation that doesn't flip in RTL
- A permission asked on launch, or no state for the denied case
- Verified only in English, only in light mode, or only at the default text size
- A screen built before the app has a design system
- An EAS cloud build started to "see if it works", or a store build without the user's yes —
  see [release.md](release.md)
