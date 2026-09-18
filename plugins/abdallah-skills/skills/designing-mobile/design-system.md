# Mobile design system — the token files

The values live in code, in the shape React Native Reusables (RNR) expects. Checked against RNR's
docs (installation → manual, and customization): the NativeWind flavour of RNR is **Tailwind v3**
with **HSL channel** variables under `:root` and **`.dark:root`** (not `.dark` — NativeWind needs
the `:root` form), mapped with `hsl(var(--x))` in `tailwind.config.js`, and mirrored as full
`hsl(...)` strings in `lib/theme.ts` alongside `NAV_THEME`. Dark mode switches through
`useColorScheme` from `nativewind`.

Four files, one set of values:

| File | Holds |
|---|---|
| `global.css` | the tokens as CSS variables, light and dark |
| `tailwind.config.js` | semantic class names → variables; radius, fonts |
| `src/lib/theme.ts` | the same values in TS (for Reanimated, `expo-image` tints, charts) + `NAV_THEME` |
| `components.json` | where the RNR CLI writes components — point `ui` at `src/ui` |

When a value changes, all of them change in the same commit. With web and mobile in one repo,
generate them (below) instead of editing by hand.

## `global.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Example values — replace with the direction's palette. HSL channels, no hsl() wrapper. */
@layer base {
  :root {
    --background: 40 20% 98%;
    --foreground: 220 25% 12%;
    --card: 0 0% 100%;
    --card-foreground: 220 25% 12%;
    --popover: 0 0% 100%;
    --popover-foreground: 220 25% 12%;
    --primary: 168 62% 32%;
    --primary-foreground: 168 40% 97%;
    --secondary: 40 14% 93%;
    --secondary-foreground: 220 25% 18%;
    --muted: 40 14% 94%;
    --muted-foreground: 220 10% 40%;
    --accent: 168 30% 92%;
    --accent-foreground: 168 60% 20%;
    --destructive: 4 72% 48%;
    --destructive-foreground: 0 0% 100%;
    --border: 40 10% 87%;
    --input: 40 10% 84%;
    --ring: 168 62% 32%;
    --radius: 0.75rem;
  }

  .dark:root {
    --background: 220 20% 8%;
    --foreground: 40 15% 94%;
    --card: 220 18% 11%;
    --card-foreground: 40 15% 94%;
    --popover: 220 18% 12%;
    --popover-foreground: 40 15% 94%;
    --primary: 168 45% 52%;
    --primary-foreground: 168 60% 8%;
    --secondary: 220 14% 17%;
    --secondary-foreground: 40 15% 94%;
    --muted: 220 14% 15%;
    --muted-foreground: 220 10% 66%;
    --accent: 168 25% 18%;
    --accent-foreground: 168 40% 88%;
    --destructive: 4 70% 58%;
    --destructive-foreground: 0 0% 100%;
    --border: 220 12% 20%;
    --input: 220 12% 24%;
    --ring: 168 45% 52%;
  }
}
```

Dark surfaces step up in lightness (`background` 8% → `card` 11% → `popover` 12%) instead of
relying on shadows, which barely show on dark.

## `tailwind.config.js`

Start from the file RNR's `init` or manual setup writes (`darkMode: 'class'`, the
`nativewind/preset`, `hairlineWidth`, `tailwindcss-animate`) and keep its colour map. Add the
house parts:

```js
const { hairlineWidth } = require('nativewind/theme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      borderWidth: { hairline: hairlineWidth() },
      // One family name per weight — React Native does not pick a file from fontWeight.
      fontFamily: {
        sans: ['IBMPlexSansArabic-Regular'],
        'sans-medium': ['IBMPlexSansArabic-Medium'],
        'sans-semibold': ['IBMPlexSansArabic-SemiBold'],
        'sans-bold': ['IBMPlexSansArabic-Bold'],
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
```

The type scale lives in the kit's `Text` component as variants (`largeTitle`, `title`, `headline`,
`body`, `subhead`, `caption`), each setting size, line height and family together. Screens pick a
variant; they never set `text-[17px]` or a font family.

## Fonts

Bundle through the `expo-font` config plugin so fonts exist before the first frame:

```json
{
  "expo": {
    "plugins": [
      ["expo-font", {
        "fonts": [
          "./assets/fonts/IBMPlexSansArabic-Regular.ttf",
          "./assets/fonts/IBMPlexSansArabic-Medium.ttf",
          "./assets/fonts/IBMPlexSansArabic-SemiBold.ttf",
          "./assets/fonts/IBMPlexSansArabic-Bold.ttf"
        ]
      }]
    ]
  }
}
```

The family names in `tailwind.config.js` must match each file's PostScript name. This family
carries Latin and Arabic, so one scale serves both languages.

## `src/lib/theme.ts`

RNR's `THEME` mirror plus the nav theme, and the house motion, elevation and haptic sets:

```ts
import { DarkTheme, DefaultTheme, type Theme } from 'expo-router/react-navigation';

export const THEME = {
  light: { background: 'hsl(40 20% 98%)', foreground: 'hsl(220 25% 12%)', card: 'hsl(0 0% 100%)',
           primary: 'hsl(168 62% 32%)', border: 'hsl(40 10% 87%)', destructive: 'hsl(4 72% 48%)' /* … every token */ },
  dark:  { background: 'hsl(220 20% 8%)', foreground: 'hsl(40 15% 94%)', card: 'hsl(220 18% 11%)',
           primary: 'hsl(168 45% 52%)', border: 'hsl(220 12% 20%)', destructive: 'hsl(4 70% 58%)' /* … */ },
} as const;

export const NAV_THEME: Record<'light' | 'dark', Theme> = {
  light: { ...DefaultTheme, colors: { background: THEME.light.background, border: THEME.light.border,
    card: THEME.light.card, notification: THEME.light.destructive, primary: THEME.light.primary,
    text: THEME.light.foreground } },
  dark: { ...DarkTheme, colors: { background: THEME.dark.background, border: THEME.dark.border,
    card: THEME.dark.card, notification: THEME.dark.destructive, primary: THEME.dark.primary,
    text: THEME.dark.foreground } },
};

// The elevation set — applied only inside src/ui components.
export const elevation = {
  raised: '0 1px 2px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.08)',
  overlay: '0 8px 24px rgba(0,0,0,0.14)',
} as const;
```

```ts
// src/lib/motion.ts — spring presets from expo:expo-animation's table, defined once
export const spring = {
  settle: { duration: 400, dampingRatio: 1 },
  snap: { duration: 400, dampingRatio: 0.8 },     // pass the gesture's velocity
  sheet: { duration: 300, dampingRatio: 0.8 },
} as const;
```

```ts
// src/lib/haptics.ts — the only file that imports expo-haptics
import * as Haptics from 'expo-haptics';

export const haptic = {
  select: () => Haptics.selectionAsync(),
  commit: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  destructive: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  error: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
};
```

## Sharing tokens with the web

When `apps/web` and `apps/mobile` both exist, the values live once, in
`packages/shared/src/tokens.ts`, as HSL channels:

```ts
export const tokens = {
  radius: '0.75rem',
  light: { background: '40 20% 98%', foreground: '220 25% 12%', primary: '168 62% 32%' /* … */ },
  dark:  { background: '220 20% 8%', foreground: '40 15% 94%', primary: '168 45% 52%' /* … */ },
} as const;
```

A `tokens:build` script in `packages/shared` writes the variable blocks into
`apps/mobile/global.css` (`:root` / `.dark:root`), `apps/mobile/src/lib/theme.ts` (`hsl(...)`
strings), and `apps/web/app/globals.css` (`:root` / `.dark`). Generated blocks sit between
`/* tokens:start */` and `/* tokens:end */` markers; nothing else in those files is touched. Run
it in `prebuild`, and fail CI when the committed files differ from its output.

The web skill's default is OKLCH on Tailwind v4. In a shared repo the web uses the same HSL
channels instead, wrapped in its `@theme inline` block — `--color-primary: hsl(var(--primary));` —
because RNR's NativeWind flavour reads HSL channels and one format beats a converter.

## Splash screen and icon

```json
["expo-splash-screen", {
  "image": "./assets/splash-mark.png",
  "imageWidth": 160,
  "backgroundColor": "#FBFAF9",
  "dark": { "image": "./assets/splash-mark-dark.png", "backgroundColor": "#101318" }
}]
```

`app.json` cannot read CSS variables, so these hex values are the `background` token converted —
written by `tokens:build` into `app.config.ts`, never typed by hand. The same holds for the Android
adaptive icon's `backgroundColor`.
