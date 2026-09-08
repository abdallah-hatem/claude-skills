---
name: building-frontends
description: Use when building or changing any frontend UI — React or Next.js components, pages, forms, styling, loading states, scrollbars, client state, or data fetching — and when scaffolding a new frontend project, adding a shadcn/ui component, or touching i18n/RTL layout.
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

**The existing project's stack always wins.** In a repo that already picked Vite, Redux, or anything else, follow the repo. This table is for new projects and for gaps a repo hasn't filled. Never migrate a working project to match it.

## Design

Pick by what is being built, before writing markup:

- **App UI** — dashboards, tables, forms, settings, anything behind a login: call the Skill tool with `frontend-design`.
- **Marketing** — landing pages, hero sections, anything scroll-driven or promotional: call the Skill tool with `epic-design`.

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
and the input holding a string.

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

## Before calling it done

Check the changed screen at mobile and tablet, in **both** LTR (English) and RTL (Arabic). Mirroring breaks layouts the LTR pass looks fine in.

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
