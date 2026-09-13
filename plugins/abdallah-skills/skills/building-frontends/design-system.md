# Design system

Nothing is designed screen by screen. A project has one design system — colour, type, spacing,
radius, shadow, and motion — decided once, stored as tokens in code, and used everywhere.
Screens are assembled from it.

## Establish it before the first screen

Load `frontend-design` to set the direction (`epic-design` for a marketing site): what the
product should feel like, a palette, a type pairing, and how motion behaves. Then record it in
two places.

**The values go in code** — `globals.css`, the Tailwind theme, and `lib/motion.ts`. Nowhere else.

**The direction goes in `docs/DESIGN.md`** — words, not values:

- **Feel** — three or four words the product must read as ("calm, precise, trustworthy")
- **Colour roles** — what `primary` is for (the one main action on a view), when `destructive`
  appears, what `accent` highlights
- **Type** — the pairing, and where each face is used
- **Motion** — what animates, and what never does
- **Don'ts** — the choices that would break the feel

A hex code in `DESIGN.md` is a second copy of a value, and it goes stale the first time the
palette is tuned.

## Colour tokens

Colours are CSS variables, defined for light and dark together and mapped into Tailwind under
semantic names. Components use the names, never a raw colour. `shadcn init` generates this
structure — tune the values, keep the shape.

**Tailwind v4** — `app/globals.css`:

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

/* Example values. OKLCH is perceptually even: a hover shade is the same colour with
   lightness moved by about 0.05, and that step looks the same in every hue. */
:root {
  --background: oklch(0.99 0.004 250);
  --foreground: oklch(0.21 0.02 255);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.21 0.02 255);
  --primary: oklch(0.52 0.15 255);
  --primary-foreground: oklch(0.98 0.01 255);
  --muted: oklch(0.96 0.006 250);
  --muted-foreground: oklch(0.48 0.02 255);
  --accent: oklch(0.95 0.02 255);
  --accent-foreground: oklch(0.3 0.06 255);
  --destructive: oklch(0.56 0.21 27);
  --border: oklch(0.91 0.008 250);
  --ring: oklch(0.52 0.15 255);
  --radius: 0.75rem;
}

.dark {
  --background: oklch(0.16 0.015 255);
  --foreground: oklch(0.96 0.006 250);
  --card: oklch(0.2 0.018 255);
  --card-foreground: oklch(0.96 0.006 250);
  --primary: oklch(0.7 0.13 255);
  --primary-foreground: oklch(0.18 0.03 255);
  --muted: oklch(0.24 0.016 255);
  --muted-foreground: oklch(0.7 0.02 255);
  --accent: oklch(0.28 0.04 255);
  --accent-foreground: oklch(0.94 0.02 255);
  --destructive: oklch(0.65 0.2 27);
  --border: oklch(0.3 0.016 255);
  --ring: oklch(0.7 0.13 255);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-ring: var(--ring);

  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}
```

**Tailwind v3** — the variables hold HSL channels (`--primary: 221 83% 53%;`) and
`tailwind.config.ts` maps them:

```ts
theme: {
  extend: {
    colors: {
      background: 'hsl(var(--background))',
      foreground: 'hsl(var(--foreground))',
      primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
      muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
      destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
      border: 'hsl(var(--border))',
      ring: 'hsl(var(--ring))',
    },
    borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)' },
    transitionTimingFunction: { snappy: 'cubic-bezier(0.22, 1, 0.36, 1)' },
  },
},
plugins: [require('tailwindcss-animate')],
```

## Type

The typeface has to cover Arabic. A Latin-only font in an Arabic UI renders in whatever the
operating system picks, and the two scripts stop looking like one product.

```tsx
// app/[locale]/layout.tsx
import { Inter, IBM_Plex_Sans_Arabic } from 'next/font/google'

const latin = Inter({ subsets: ['latin'], variable: '--font-latin' })
const arabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-arabic',
})

// <html className={`${latin.variable} ${arabic.variable}`}>
```

```css
@theme inline {
  --font-sans: var(--font-latin), var(--font-arabic), ui-sans-serif, system-ui, sans-serif;
}
```

The stack does the switching: the Latin face has no Arabic glyphs, so Arabic text falls
through to the Arabic face on its own — mixed-language lines included.

- Fonts load through `next/font`: self-hosted, no layout shift, no flash of fallback text.
- At most three or four text sizes on a screen. Hierarchy comes from size, weight, and colour
  together, not size alone.

## Rules for colour and type

- **Never a raw colour in a component** — no `bg-blue-500`, no `text-[#1a73e8]`, no inline
  `style={{ color }}`. A semantic token, or it doesn't ship.
- **Every token is defined for light and dark in the same change.**
- **Every text-and-background pair passes WCAG AA** — 4.5:1 for body text, 3:1 for large text
  and UI borders — in both themes. Pleasant but hard to read is not flawless.
- **A colour the system doesn't have becomes a new token** with a role, in both themes, and a
  line in `DESIGN.md`. Never a one-off.
- **Spacing from Tailwind's scale, radius from the token, shadows from a small fixed set.** No
  arbitrary `p-[13px]`.
- **Charts load `dataviz`** and take their colours from the tokens.

## What "flawless" means, concretely

- Spacing has a rhythm: related things sit closer together than unrelated ones, and every gap
  is on the scale
- One primary action per view; everything else is secondary or ghost
- Edges line up — nothing a few pixels off
- Every interactive element has hover, focus-visible, active, and disabled states
- Empty, loading, and error states are designed, not left as defaults
- Checked in light and dark, LTR and RTL, mobile and tablet

## Motion

Motion explains a change — something appeared, moved, or responded. It never decorates and
never makes the user wait.

| What | Duration | Easing |
|---|---|---|
| Hover, press, colour change | 150ms | ease-out |
| Dropdown, popover, tooltip | 150–200ms | ease-out |
| Dialog, sheet, toast | 200–250ms in, 150ms out | ease-out in, ease-in out |
| List stagger, section reveal | 250–300ms, 40ms apart | ease-out |

Exits are faster than entrances: the user has already decided to move on.

One source for the curve, shared by CSS and JavaScript:

```css
@theme inline {
  --ease-snappy: cubic-bezier(0.22, 1, 0.36, 1);   /* → the ease-snappy utility */
}
```

```ts
// lib/motion.ts
export const ease = [0.22, 1, 0.36, 1] as const   // same curve as --ease-snappy
export const duration = { fast: 0.15, base: 0.22, slow: 0.3 } as const
```

**Which tool:**

- **shadcn primitives** already animate open and close through `tw-animate-css` (v4) or
  `tailwindcss-animate` (v3). Keep that.
- **Tailwind transitions** for state changes: `transition-colors duration-150`,
  `active:scale-[0.98]`. Put press feedback on the `Button` primitive once, not at call sites.
- **`motion`** (`motion/react`) for choreography: list stagger, items entering and leaving,
  layout changes.

```tsx
import { motion, useReducedMotion } from 'motion/react'
import { duration, ease } from '@/lib/motion'

export function RevealList({ items }: { items: Item[] }) {
  const reduce = useReducedMotion()
  return (
    <ul>
      {items.map((item, i) => (
        <motion.li
          key={item.id}
          initial={{ opacity: 0, y: reduce ? 0 : 8 }}   // reduced motion still fades, just doesn't move
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: duration.base, ease, delay: Math.min(i, 10) * 0.04 }}
        >
          <ItemRow item={item} />
        </motion.li>
      ))}
    </ul>
  )
}
```

**Rules**

- **Animate `transform` and `opacity` only.** Animating width, height, top, or margin
  recalculates layout on every frame and stutters.
- **Respect `prefers-reduced-motion`** — `motion-safe:` / `motion-reduce:` in Tailwind,
  `useReducedMotion()` in `motion`. Reduced means fades instead of movement, not no feedback.
- **Horizontal motion flips in RTL.** What slides in from the left in English slides in from the
  right in Arabic: `x: isRtl ? 16 : -16`, or `rtl:` variants in CSS.
- **Never make the user wait.** Nothing over about 300ms in app UI, no animation that blocks an
  interaction, no intro sequence on a dashboard. Marketing pages can go further through
  `epic-design`.
- **Don't animate what changes constantly** — live counters, rows on refetch, typing. Motion
  there reads as flicker.
- **Stagger only the first ten or so items.** Beyond that the total delay becomes waiting.
