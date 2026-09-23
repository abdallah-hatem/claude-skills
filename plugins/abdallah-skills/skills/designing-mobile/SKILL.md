---
name: designing-mobile
description: Use when setting the look of a new mobile app, at the design-system stage of /build-software for a mobile app, when designing or restyling a React Native or Expo screen, when choosing colours, type, icons, motion or haptics for a React Native app, or when a mobile screen looks generic, AI-made, or inconsistent with the rest of the app.
---

# Designing Mobile

How a React Native (Expo) app looks and feels, decided before the first screen and held on every
screen after it. The mobile counterpart of `frontend-design`. The mechanics of building screens
live in `building-mobile`; the component kit is React Native Reusables (RNR) in `src/ui/`.

**The existing app's design system always wins.** In a repo with tokens and a kit already, extend
them in their own idiom. Never add a second theme beside the first.

## Direction first

**Aim bold, modern, and eye-catching** — rich colour, depth (glass, glow, gradient used with
intent), big confident type, one or two signature moments. A "quiet", "minimal", or "let the
content speak" direction reads as basic and generic; it was rejected outright once and cost a full
restyle. When unsure, go further, not safer.

**Show the direction before building on it — in every run mode, autonomous included.** Mock two or
three clearly different directions as phone screens (welcome, the core screen, a list, a detail)
on one page, let the user pick or mix, then build tokens. A look chosen by the agent alone is not
approved.

Before any token or screen, write the product's personality in one sentence and commit to it:
"a calm, exact ledger for busy shop owners", "a loud, quick companion for a pickup football
game". Every later choice — hue, typeface, radius, how much things move — is checked against that
sentence. A choice that fits any app fits none.

Avoid the generic-app look:

- The default blue (or default purple) as the brand colour
- A card around everything — every row, every section, a white rounded shadowed box
- Everything centred — titles, empty states, forms, buttons
- Gradients for their own sake, especially a gradient hero pushing the task below the fold
- Emoji as icons
- A different radius on every element

`expo:expo-design-system` → `references/native-slop.md` names twenty of these tells with grep
checks. Use it when reviewing a screen.

## Native-first, then brand

The app should feel at home on each OS. Structure and behaviour are the platform's; the brand is
the app's.

**Stays native:**

- iOS: native tabs (`NativeTabs`), stack headers on pushed screens, system sheets
  (`presentation: 'formSheet'` with detents), context menus (`Link.Menu`), the swipe-back gesture,
  the system share sheet.
- Android: Material behaviour — the system back gesture and predictive back, Material top app
  bar and navigation bar, edge-to-edge insets. No iOS chevrons or large-title text on Android; no
  FAB or ripple in an iOS layout.
- Screen transitions are the platform default. Never rebuild one in JS.

Mechanics for all of this: `expo:expo-router` and `expo:expo-native-ui`.

**Top-level (tab) screens have no header bar.** The page title is a big bold heading drawn as the
first thing in the screen's scroll content, so it scrolls away with it; a header action (settings)
sits beside that heading. Not an iOS large title — its area stays clear, so content scrolled under
it shows through the text — and not a frosted or solid bar across the top. The status bar is the
only thing covered, by a strip painted with the **screen's own backdrop** (the same gradient or
glows, lined up with the page) so it reads as transparent while scrolled content disappears under
it. Never a black or flat band that differs from the page behind it. Pushed screens keep their
native back header; a full-bleed photo screen draws its own floating back button.

**Carries the brand:** colour, type, iconography, motion, and one or two **signature moments** per
app — the completed-order check that springs in, the pull-to-refresh that is the logo. Name them in
`docs/DESIGN.md`. Spend the delight budget there and nowhere else.

**Controls come from the kit, not the OS.** Buttons, inputs, switches, checkboxes, selects,
dialogs, toasts and skeletons are RNR components themed from the tokens. House rule over
`expo:expo-native-ui`, `expo:expo-ui` and `expo:expo-design-system` (which prefer `@expo/ui` and leave the RN `Switch` unwrapped): one brand
across both platforms and a lint rule that can enforce it. Navigation chrome stays native because
that is where platform familiarity matters most.

## Consistency

A consistent app is built from few parts, each styled once.

- **One component per job.** One `Button` with `variant` and `size`, not `PrimaryButton`,
  `BigButton`, `ButtonV2`. A new look is a new variant in `src/ui/`, never a className override at
  the call site and never a copied-and-tweaked component.
- **One spacing scale** (Tailwind's 4-point steps), **one radius set** (`sm`/`md`/`lg` from
  `--radius`, plus `full` for pills), **one elevation set** (two or three shadows, named).
- **The app draws its own icon set — no stock icons anywhere.** Not Lucide, SF Symbols, or
  Material, not even in the tab bar: stock glyphs (hourglass, pin, clock, flip camera) read as
  generic "native" icons and were rejected. One style for every icon — a 24pt grid, one stroke
  weight with round caps and joins, soft generous radii, a small friendly detail where it fits —
  with an **outline default and a filled variant for the active/selected state**, Instagram-style.
  In-app icons are `react-native-svg` components in `src/ui/icons/` (one data file of glyphs, one
  component per icon, the kit's `Icon` wrapper takes them); tab icons are the same drawings
  rendered to template PNGs at 1x/2x/3x (`src={{ default, selected }}`, `renderingMode="template"`)
  so the native bar tints them. Uninstall `lucide-react-native` and ban it with
  `no-restricted-imports`. A new icon is drawn in the same style — preview a sheet of the set
  before wiring it in. Replacing an icon means checking every screen that shows it.
- **Rounded means all four corners.** A card, photo frame, or viewfinder is rounded on every
  corner — never rounded only at the bottom with a flat top against the screen edge. Photos sit
  in one shared frame component (inset from the screen sides, `borderCurve: 'continuous'`) used
  by the camera viewfinder, drafts, and posts alike, so every photo frame matches.
- **The same situation looks the same everywhere.** Every list's empty state uses one
  `EmptyState` (icon, one line, one action). Every destructive action uses one confirmation (an
  `AlertDialog` naming the thing destroyed, with the destructive variant on the confirm button).
  Every form error sits in the same place, in the same colour, with the same icon. Every success
  gets the same toast and the same haptic.

The lint rules in `building-mobile` enforce the mechanical part — no raw controls outside
`src/ui/`, no hex colours or raw pixel values in screens. This section is the judgement part.

## Colour and type

**Colour roles, not colours.** Tokens are semantic — `background`, `foreground`, `card`,
`primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring` — defined for
light and dark in the same change. `primary` is the one main action on a screen. `destructive`
appears only where something is lost. A colour the system lacks becomes a new token with a role,
in both themes, never a one-off.

- **AA in both themes:** 4.5:1 for body text, 3:1 for large text, icons and control borders. Check
  `muted-foreground` on `muted` and `primary-foreground` on `primary` in dark mode — they fail
  first.
- Dark mode is its own palette, not an inversion: surfaces lift by lightness, not shadow.
- House rule over `expo:expo-native-ui` (which builds the palette from `Color` / `PlatformColor`):
  colours are CSS-variable tokens in NativeWind, shared with the web when one exists. The brand
  stays identical across iOS, Android and web; platform semantic colours would not.

**Type:**

- A scale of five or six named steps (`largeTitle`, `title`, `headline`, `body`, `subhead`,
  `caption`) mirroring the platform ramp — body 17 on iOS, 16 on Android is fine. At most three or
  four sizes on a screen; hierarchy from size, weight and colour together.
- **Arabic and Latin in one family,** or one family per script switched by language. React Native
  does not fall through a font stack per glyph the way the web does — a Latin-only face renders
  Arabic in the system font. IBM Plex Sans Arabic, Noto Sans Arabic and Cairo carry both scripts.
  Arabic needs more line height than Latin at the same size; set it per step.
- **Dynamic Type honoured.** Never `allowFontScaling={false}`. Rows grow with `minHeight` and
  padding, never a fixed height. Cap with `maxFontSizeMultiplier` only on chrome that truly
  cannot reflow, never on body text.
- **Fonts load through `expo-font`** — the config plugin for bundled fonts, so they exist before
  the first frame. Static fonts need one family name per weight; `fontWeight` on a custom family
  makes iOS synthesise or fall back.

## Motion and haptics

Mechanics, spring configs and recipes: `expo:expo-animation`. Its gate applies — tab switches,
keyboard, toggles in settings never animate beyond the platform default.

- **Springs for anything that moves** — position, scale, sheets, snapping. Timing curves only for
  opacity and colour. House rule, stricter than `expo:expo-animation` (springs only when a finger
  was involved): app state changes interrupt motion often, and a spring settles from its current
  velocity where a timing curve restarts. Use its spring table; define the presets once in
  `src/lib/motion.ts`.
- **Gestures track the finger** 1:1 on the UI thread, hand off velocity on release, and dismiss on
  velocity or distance. Swipe-to-delete, drag-to-dismiss and reorder feel physical or are not
  built.
- **Press feedback on press-in** (scale 0.97 on buttons, highlight on rows), built into the kit once.
- **Haptics only on meaningful confirmations** — a commit, a success, an error, a detent catching,
  a destructive action firing. Never on scroll, navigation, or an entrance. Always paired with a
  visual. Route every call through one `src/lib/haptics.ts` with named moments (`success`,
  `error`, `select`, `commit`) so the same moment always feels the same.
- **Reduce Motion respected:** fewer and gentler, not none — keep fades and colour changes that
  explain state, drop translation, scale, overshoot and parallax.
- **Horizontal motion flips in RTL.** `translateX` does not mirror on its own: multiply by
  `I18nManager.isRTL ? -1 : 1`. A swipe action on the trailing edge moves to the left in Arabic.

## Craft states

- **Empty:** designed, from the shared `EmptyState` — what goes here, and the one action that fills
  it. Never shown while the first load is still running.
- **Loading:** skeletons shaped like the content; a spinner only inside a submitting button;
  nothing for loads under ~200ms; previous data stays visible while refetching.
- **Error:** says what failed and offers retry; offline has its own state.
- **Splash screen and app icon from the tokens:** splash background is the `background` token (light
  and dark variants via `expo-splash-screen`), the mark in `primary`. The icon uses the same mark;
  Android gets an adaptive icon with a safe-zone foreground, iOS gets dark and tinted variants.

## Mechanics

1. **Tokens in code before the first screen.** The RNR theme: CSS variables in `global.css`
   (`:root` and `.dark:root`), mapped in `tailwind.config.js`, mirrored in `src/lib/theme.ts` with
   `NAV_THEME` so native chrome uses the same colours. When web and mobile both exist, the values
   live once in `packages/shared` and both apps are generated from them. See
   [design-system.md](design-system.md).
2. **The kit themed from those tokens.** RNR components added with its CLI into `src/ui/`, then
   given the app's variants, radius and press feedback — once, in the kit.
3. **`docs/DESIGN.md` holds the direction, not the values:** the personality sentence, what each
   colour role is for, the type family and where each step is used, what moves and what never
   does, the haptic moments, the signature moments, and the don'ts. A hex code there goes stale.
4. **A kit preview screen for approval** — a dev-only route (`app/(dev)/kit.tsx`, behind
   `__DEV__`) showing buttons in every variant and state, inputs with label, placeholder and error,
   a sheet, a toast, a list row, an empty state and a skeleton, in light and dark. The user approves
   it before screens are built.
5. **Review by screenshot** on iPhone and iPad (and an Android device when Android ships), in LTR
   and RTL, light and dark — the `abdallah-skills:ui-auditor` agent takes and checks the set. Run
   `expo:expo-design-system`'s self-critique pass on each; a defect that recurs is fixed in the
   token or the kit, not on the screen.

## Red flags

- A screen built before the personality sentence, the tokens and the approved kit preview exist
- The brand colour is the platform default blue, or no one can say why it is that colour
- Cards around every row, everything centred, emoji as icons, or two icon families
- A stock icon (Lucide, SF Symbol, Material) anywhere in the app, tab bar included
- A card or photo frame rounded on some corners only
- An iOS large title or a header bar on a tab screen; a status-bar strip that doesn't match the
  page backdrop behind it
- A quiet/minimal direction, or a direction the user never saw mocked up
- A radius, shadow, or spacing value that is not in the set
- A className override on a kit component to get a new look — that is a missing variant
- Two empty states, confirmations, or form errors that look different
- A raw RN `Switch`, `Button`, `TextInput` or `Alert.alert` in a screen
- iOS chrome hand-built on Android, or a FAB and ripple in an iOS layout
- A screen transition or tab bar rebuilt in JS
- A token missing from dark, or text below AA in either theme
- A Latin-only font in an app that renders Arabic
- `allowFontScaling={false}`, or a fixed-height row that clips at large text
- A timing curve on something that moves and can be interrupted
- A haptic on scroll, navigation, or an entrance, or a haptic with no visual
- An animation that ignores Reduce Motion, or a slide that doesn't flip in RTL
- A centred spinner where a skeleton belongs; an empty state flashing during the first load
- Hex values in `docs/DESIGN.md`
- Reviewed only on iPhone, only in English, or only in light mode
