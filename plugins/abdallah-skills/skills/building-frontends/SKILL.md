---
name: building-frontends
description: Use when building or changing any frontend UI — React or Next.js components, pages, forms, modals, design system and color tokens, animations, styling, loading states, scrollbars, client state, or data fetching — and when scaffolding a new frontend project, adding a shadcn/ui component, or touching i18n/RTL layout.
---

# Building Frontends

Abdallah's frontend conventions. Every screen ships reusable, generic, internationalized, RTL-correct, and responsive — or it isn't finished.

## Stack

| Concern | Choice |
|---|---|
| Framework | Next.js (App Router) |
| Language | TypeScript, `strict` |
| Styling | Tailwind |
| Components | shadcn/ui |
| Client state | Zustand |
| Data fetching | `apiFetch` → `src/apis.ts` endpoints → `callApi` on the client — see [fetch-wrapper.md](fetch-wrapper.md) |
| Auth | access + refresh tokens in `httpOnly` cookies, refreshed inside `apiFetch` |
| Forms | shadcn `<Form>` + react-hook-form + zod |
| Design | tokens as CSS variables in `globals.css`, mapped to Tailwind — see [design-system.md](design-system.md) |
| Animation | `motion` for choreography; Tailwind transitions and `tw-animate-css` for state |

**The existing project's stack always wins.** In a repo that already picked Vite, Redux, or anything else, follow the repo. This table is for new projects and for gaps a repo hasn't filled. Never migrate a working project to match it.

## Design

**Design comes from a design system, never screen by screen.** Before a project's first screen,
load `frontend-design` and establish one: palette, type, spacing, radius, shadow, and motion. For
landing pages and anything scroll-driven, `epic-design` sets the direction instead.

- **Tokens live in code, once.** CSS variables in `globals.css`, defined for light and dark
  together and mapped to semantic Tailwind names (`@theme inline` on v4, `tailwind.config.ts` on
  v3). Components use `bg-primary` and `text-muted-foreground` — never `bg-blue-500` or a hex code.
- **`docs/DESIGN.md` holds the direction, not the values:** the feel, what each colour role is
  for, the type pairing, what animates, and what to avoid.
- **Pleasant and readable.** Every text-and-background pair passes WCAG AA in both themes, and
  the typeface covers Arabic.
- **Motion explains change and never delays it.** 150–250ms, transform and opacity only, exits
  faster than entrances, reduced motion respected, horizontal motion flipped in RTL. `motion` for
  choreography, Tailwind transitions for state.

See [design-system.md](design-system.md).

## Components

**shadcn/ui first.** If shadcn has the primitive, install it and compose. Never hand-roll a dialog, select, popover, toast, or table.

**Nothing ships looking native.** Browser defaults are inconsistent across platforms and instantly read as unstyled. The usual offenders: `<select>`, checkbox and radio, `<input type="file">`, `<input type="date">`, `<progress>`, `<details>`/`<summary>`, the default focus ring, and the scrollbar. Reach for the shadcn equivalent — `Select`, `Checkbox`, `RadioGroup`, `Calendar` + `Popover`, `Progress`, `Accordion`.

When shadcn has no equivalent, style it yourself until it belongs to the design: `appearance-none`, explicit border, radius, padding, background, and hover / focus-visible / disabled states. A control that still looks like the OS drew it is unfinished.

**Every clickable thing gets `cursor-pointer`.** A native `<button>` renders the arrow cursor, not the hand — so buttons need it explicitly, along with links, clickable rows and cards, tabs, icon buttons, and any custom control. Disabled gets `cursor-not-allowed` instead, never `cursor-pointer`. Nothing non-interactive gets it.

## Forms

Every required field carries an asterisk on its **label** (`aria-hidden`, with `required` on
the input). Every input gets a placeholder **and** keeps its label — the placeholder shows the
shape of a valid answer, never restates the name. Both are translated strings.

Prose fields — description, notes, address, comment — are a `<Textarea>` with 3–4 rows, never
a single-line input. Fields are 16px on mobile (`text-base md:text-sm`) or iOS Safari zooms in
and stays zoomed. Number inputs ship with no spin buttons and ignore the wheel. Numbers a person reads as
quantities are displayed grouped — `100,000`, not `100000` — with the form holding a number
and the input holding a string. Egyptian mobile fields accept exactly 11 digits starting with
`01`: a 12th digit or an impossible prefix is never entered, and a pasted `+20` number is
normalised.

See [forms.md](forms.md).

## Tables and pagination

**No control that re-queries a list ever moves the viewport** — pagination, search, sort,
filter, page size, tab switches, "load more". The user is looking at the rows; jumping to the
top of the page means scrolling back down to see what they just asked for, and the control
they used should still be under their cursor.

In the App Router these are URL param changes, and `router.push` scrolls to top by default.
Opt out at every one of them:

```tsx
router.push(`?${params}`, { scroll: false })
// and for links
<Link href={`?${params}`} scroll={false}>
```

While the next page loads, keep the current rows in place and dim them. Swapping back to
skeletons collapses the table to a different height, which moves the viewport just as badly
as scrolling did — see Loading states.

## Modals and overlays

**Size a dialog to its content**, not to shadcn's `max-w-lg` default: a `size` prop on the
primitive (`sm`/`md`/`lg`/`xl`), chosen from the widest thing inside, always capped at
`max-w-[calc(100vw-2rem)]`. A modal that scrolls sideways because it is too narrow is a sizing
bug — widen it.

**Cap the height** at `max-h-[calc(100dvh-2rem)]` — `dvh`, because mobile `vh` hides the bottom
of the modal, and the Save button with it, under the toolbar. Header and footer stay fixed;
only the body scrolls (`min-h-0 flex-1 overflow-y-auto overscroll-contain`).

**Scroll lives inside the container** — modal, sheet, drawer, popover, dropdown — never on the
page behind it.

See [ui-patterns.md](ui-patterns.md).

## Reusability contract

The rule that matters most, because it is the one that erodes under deadline.

**Before writing a component or helper, search for an existing one.** Grep the components directory and the utils/lib directory for the concept and its synonyms. Extend what you find rather than writing a sibling.

**Write the generic version first.** A component takes props for what varies; it does not read global state, route params, or the current user unless that IS its job. A helper takes arguments and returns a value.

**Second occurrence extracts.** The moment near-identical JSX or logic exists in two places, extract it — do not wait for a third. Copy-paste-and-tweak is never the smaller change; it is the same change made twice, forever.


## i18n and RTL

No hardcoded user-facing strings — every string comes from the locale files via `useTranslation()`. `en` and `ar` keep identical key sets.

Use logical Tailwind utilities so layouts mirror under Arabic:

| Use | Not |
|---|---|
| `ps-` `pe-` `ms-` `me-` | `pl-` `pr-` `ml-` `mr-` |
| `text-start` `text-end` | `text-left` `text-right` |
| `start-` `end-` | `left-` `right-` |
| `rounded-s-` `rounded-e-` | `rounded-l-` `rounded-r-` |

CSS transforms do not auto-flip. `translateX`, chevrons, and progress animations need an explicit `[dir="rtl"]` override.

## Loading states

**Skeletons, not spinners.** A skeleton mirrors the shape of what it replaces — same heights, same gaps, same count — so nothing shifts when data lands. Use shadcn's `<Skeleton>`; see [ui-patterns.md](ui-patterns.md).

A spinner is only ever inside a button that is mid-submit. Never a centered spinner standing in for a page or a list.

Below ~200ms, render nothing rather than a skeleton — a flash of placeholder reads as jank.

## Scrollbars

Never ship the native scrollbar. Every scroll container gets the `scrollbar-clean` utility — thin, rounded, transparent track, theme-aware. Implementation in [ui-patterns.md](ui-patterns.md).

Never a JS scrollbar library. They break keyboard scrolling, momentum, and screen readers, and they cost a dependency for something CSS does in twenty lines.

## Responsive

Tablet-first. Every screen works at ~375px and ~768–1024px: no horizontal overflow, tap targets ≥ 44px, readable type.

## Testing

Components with Vitest + React Testing Library, full flows with Playwright — unless the project
already uses something else. Every screen is tested beyond the happy path:

- **Empty, loading, and error states** — each one renders; none is a blank screen
- **Long content** — a 200-character name or an unbroken URL doesn't break the layout
- **Validation** — every rule shows its translated message and blocks submit
- **Double submit** — the button is disabled while the request is pending; two clicks send one
  request
- **Permissions** — a user without the permission can't reach the action
- **RTL** — the screen rendered under `dir="rtl"`, not only in English
- **Input edge cases** — pasted text, the 12th phone digit, the wheel over a number field

The full-flow test drives the feature end to end the way a user would, against a real backend.

## Before calling it done

Check the changed screen at mobile and tablet, in **both** LTR (English) and RTL (Arabic), and in
**both** light and dark mode. Mirroring breaks layouts the LTR pass looks fine in, and a colour
that works on white can disappear on dark. Turn reduced motion on once and confirm nothing that
matters depends on an animation.

## Red flags

- Raw `fetch()` against the API anywhere — use `apiFetch`
- A token read in client code — they are `httpOnly` by design
- An endpoint awaited directly in a client component — use `callApi`
- `toast.*` called in a component — that belongs to `handleResponse`
- `if (!res.success)` without checking `res.unauthorized` first
- A mutation with no `revalidateTags`
- A `pl-`/`ml-`/`left-` in new markup
- A string literal rendered to the user
- A second component whose name is the first one plus a qualifier (`UserCardSmall`, `TableV2`)
- A centered spinner where a skeleton belongs
- A scroll container without `scrollbar-clean`
- A JS scrollbar library in `package.json`
- Hand-rolled dialog, dropdown, or toast
- A dialog at shadcn's default width holding a table or multi-column form
- A modal that scrolls horizontally because it is too narrow
- A modal, sheet, popover, or dropdown with no max height
- `vh` in an overlay's height cap — use `dvh`
- A flex scroll body without `min-h-0` — the overflow never engages
- Save or other actions inside the scrolling body instead of a fixed footer
- A bare `<select>`, checkbox, radio, date, or file input — style it or use shadcn
- A required field with no asterisk on its label
- An asterisk without `aria-hidden`, or an input without `required`
- An input with no placeholder, or a placeholder that just repeats the label
- A placeholder used instead of a label
- A hardcoded placeholder string
- `router.push` or `<Link>` without `scroll: false` on any list control — pagination, search, sort, filter, page size, tabs
- A table that falls back to skeletons on page change instead of dimming its rows
- A description, notes, or comment field as a single-line `<Input>`
- A length limit with no visible counter
- A raw `100000` shown to a user where `100,000` belongs
- An Egyptian mobile field that accepts a 12th digit, letters, or a prefix other than `01`
- A phone field that trims to 11 digits instead of rejecting the change — the last digit falls off
- `maxLength` on a phone field — it clips a pasted `+20` number before it can be normalised
- A phone number passed through `Number()` — the leading zero is lost
- Formatted text stored in form state or sent to the API
- Reformatting on every keystroke — the caret jumps; format on blur
- A `type="number"` with visible spin buttons, or one the wheel can change
- `preventDefault()` in an `onWheel` handler — React makes it passive, so it does nothing
- `type="number"` for a phone, OTP, or ID — use `inputMode="numeric"`
- An input/textarea/select under 16px on mobile — iOS Safari zooms and stays zoomed
- `user-scalable=no` or `maximum-scale=1` in the viewport meta
- A clickable element without `cursor-pointer`
- `cursor-pointer` on something disabled or non-interactive
- Verified in English only
- A screen tested only on the happy path — no empty, error, long-content, or RTL case
- A submit button that can fire twice while its request is pending
- A screen built before the project has a design system
- A raw colour in a component — `bg-blue-500`, `text-[#…]`, inline `style={{ color }}`
- A token defined for light but not for dark
- Text that fails WCAG AA contrast in either theme
- Hex values in `docs/DESIGN.md` — they drift from the code
- A one-off colour instead of a new token with a role
- A Latin-only font in a UI that renders Arabic
- Animating width, height, top, or margin instead of transform and opacity
- Motion that ignores `prefers-reduced-motion`
- A horizontal slide that doesn't flip in RTL
- An app-UI animation over ~300ms, or one the user has to wait through
