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

**Lint is not part of the stack.** Every app gets the house lint config — a repo without it gets it added, with existing violations frozen. See Lint.

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
- **Motion craft comes from Emil Kowalski's skills.** Building an animation → load `animate`;
  reviewing one → `review-animations`; the principles behind both → `emil-design-eng`. They decide
  whether something animates and how it feels; this skill's tokens, RTL flipping and Arabic rules
  still win where they disagree. Rules and curves: [design-system.md](design-system.md#motion).

See [design-system.md](design-system.md).

**Show it before you build it.** The user judges visuals by looking, not by reading — a yes to a
look described in prose is not a yes to the result. Before building a new page, a new component
with a visible look, a restyle, or any choice between visual options, render a mockup (an HTML
preview page or the `design` skill) in light and dark, show it, and wait for the user's OK. When
choosing between approaches, mock each one — a sample, not a menu of descriptions. When the user
names a reference app ("like Instagram"), mock what that app actually does. In an autonomous
`/build-software` run the stop is the design-system approval; screens built on an approved system
are screenshotted and shown as they land, not held for a reply.

## Components

**shadcn/ui first.** If shadcn has the primitive, install it and compose. Never hand-roll a dialog, select, popover, toast, or table.

**Nothing ships looking native.** Browser defaults are inconsistent across platforms and instantly read as unstyled. The usual offenders: `<select>`, checkbox and radio, `<input type="file">`, `<input type="date">`, `<progress>`, `<details>`/`<summary>`, the default focus ring, and the scrollbar. Reach for the shadcn equivalent — `Select`, `Checkbox`, `RadioGroup`, `Calendar` + `Popover`, `Progress`, `Accordion`.

When shadcn has no equivalent, style it yourself until it belongs to the design: `appearance-none`, explicit border, radius, padding, background, and hover / focus-visible / disabled states. A control that still looks like the OS drew it is unfinished.

**Nothing ships looking like the library either.** shadcn's defaults are a starting point: form
controls ship with `bg-transparent` (the page shows through), and `Select` / `DropdownMenu` lists
are a cramped grey-highlight list not aligned to their trigger. When the design system lands, give
every form control a solid surface and design the popover content — aligned to the trigger,
reading-size rows, themed highlight and check, `scrollbar-clean`, stacked above floating UI — in
the shared primitives. Judge each control **open**, not just closed. See
[ui-patterns.md](ui-patterns.md#form-controls-and-popovers-look-designed).

**Every clickable thing gets `cursor-pointer`.** A native `<button>` renders the arrow cursor, not the hand — so buttons need it explicitly, along with links, clickable rows and cards, tabs, icon buttons, and any custom control. Disabled gets `cursor-not-allowed` instead, never `cursor-pointer`. Nothing non-interactive gets it.

## Forms

Every required field carries an asterisk on its **label** (`aria-hidden`, with `required` on
the input). Every input gets a placeholder **and** keeps its label — the placeholder shows the
shape of a valid answer, never restates the name. Both are translated strings.

Prose fields — description, notes, address, comment — are a `<Textarea>` with 3–4 rows, never
a single-line input. Long-form text in an admin (descriptions, article bodies) is a plain
auto-growing textarea too, not a rich-text editor, unless the user asks for formatting; when the
stored format is HTML, convert blank-line paragraphs on save and back to plain text on load.
Fields are 16px on mobile (`text-base md:text-sm`) or iOS Safari zooms in and stays zoomed.
Number inputs ship with no spin buttons and ignore the wheel. Numbers a person reads as
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

**Opening an overlay never moves the page.** Radix's scroll lock adds a scrollbar-width margin to
`<body>`; with `scrollbar-gutter: stable` on `<html>` that compensation is applied twice and the
page jumps sideways on every open. Neutralise the body margin once in `globals.css`, and guard it
with a test that compares element positions before and after opening. See
[ui-patterns.md](ui-patterns.md#opening-an-overlay-never-moves-the-page).

See [ui-patterns.md](ui-patterns.md).

## Reusability contract

The rule that matters most, because it is the one that erodes under deadline.

**Before writing a component, hook, or helper, search for an existing one.** Grep the components directory and the utils/lib directory for the concept and its synonyms. Extend what you find rather than writing a sibling.

**Write the generic version first.** A component takes props for what varies; it does not read global state, route params, or the current user unless that IS its job. A helper takes arguments and returns a value.

**Second occurrence extracts.** The moment near-identical JSX or logic exists in two places, extract it — do not wait for a third. Copy-paste-and-tweak is never the smaller change; it is the same change made twice, forever.

**The usual repeats are shared from the start**, not after the second copy: the data table (columns,
widths, header, skeleton rows, empty state, overflow rules), list rows and cards, dialogs and
confirm prompts, form fields with their label/hint/error, pickers, empty states, page headers with
their actions, status badges, money and date display. A page describes what varies — its columns,
its fields, its copy — and the shared component owns everything that should look and behave the
same. Hand-writing a `<table>` in a page is how one layout fix becomes the same edit on every screen.


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

## Auth routing

Every app with sign-in routes visitors by session, in middleware, on the first request — never by
rendering a page and then bouncing:
- **Signed out on a protected page** → the login page, keeping the path to return to.
- **Signed in on a guest-only page** (landing, login, register, forgot-password) → the user's home.
  A returning user never sees the landing page or a login form again until they sign out.
- **Home depends on the role** — each role has one home (e.g. the dashboard for staff, the main
  screen for customers); one `homeFor(role)` decides it, and every redirect uses it.
- **Expired access token with a valid refresh token** → refresh **in place** in middleware (forward the
  new access token to the same request and set both cookies on its response), never by redirecting
  the browser to a refresh URL — that URL flashes in the address bar. Only a failed refresh lands on
  login.
- **Concurrent refreshes are normal**: a page load plus its `<Link>` prefetches all arrive with the same
  refresh token. With rotation, the API must accept a reused token within a short grace window
  (≈30 s) by issuing a pair in the same family; reuse after the window revokes that family. Without
  it, the parallel requests read as token theft and sign the user out.
- **After login** → the kept return path, else `homeFor(role)`.
- **A role on a page it can't use** → its own home, not the landing page.

These are `ui` test cases on every app: one test per rule, in the middleware's tests — including
several requests refreshing at once with the same refresh token.

## Signed-in UI at first paint

The server knows who is signed in when it renders, so the first paint is already that person's
screen: their name in the header, their menu, the buttons their role may use. Nothing signed-in
appears a moment after the page does.
- **The session is a cookie the server reads.** The layout reads it (`cookies()` in a Server
  Component) and hands the user to the client auth provider as its initial state; client and
  server then render the same thing and nothing changes when the scripts load.
- **Never derive who is signed in only from `localStorage` or a client effect.** The server cannot
  read storage, so every page renders signed out first and the account card, role-gated buttons
  and role menus vanish on each refresh, then come back.
- **A token that must stay in client storage** (an app not yet on `httpOnly` cookies) still gets a
  cookie: a display-only copy of id, name and role, written at sign-in, cleared at sign-out, on a
  401 and on a sign-out in another tab, and rewritten from storage on every load. It is never a
  credential — the API authorises from the token — so a hand-edited value changes what is drawn,
  never what is allowed.
- **Reading the cookie makes those routes dynamic.** That is the price of a correct first paint;
  pay it in the layout once rather than gating each control.
- **Until the session is known** (no cookie yet), the account card is a skeleton of its own size;
  role-gated controls are never simply absent and then present.

Test it by freezing the server's paint: block the page's scripts, reload, and assert the account
card shows the right name, the role's menu is complete, and the role's buttons are present (and
absent for a role without them).

## Loading states

**Skeletons, not spinners.** A skeleton mirrors the shape of what it replaces — same heights, same gaps, same count — so nothing shifts when data lands. Use shadcn's `<Skeleton>`; see [ui-patterns.md](ui-patterns.md).

A spinner is only ever inside a button that is mid-submit. Never a centered spinner standing in for a page or a list.

Below ~200ms, render nothing rather than a skeleton — a flash of placeholder reads as jank.

**Every wait has feedback — no exceptions.** Any time the UI waits on a response, the user sees it:
- **Content** being loaded or *replaced* — a skeleton in its shape. When the request changes what the
  content is (a toggle or filter that swaps the content, another tab, another item), skeleton it; when it only
  refreshes the same content, keep it on screen, dimmed.
- **Actions** — the control that started it shows busy (a spinner or a "working…" label) and is
  disabled, and so is anything that would send a conflicting request (choosing one option
  locks its siblings until the response arrives).
- **Waits over ~1.5s** (AI calls, uploads, grading) — add a one-line status describing what is happening
  so a slow answer never looks frozen.
- An error always ends the loading state and shows the error.

Before calling a screen done, list every request it awaits and check each has one of these.

## Scrollbars

Never ship the native scrollbar. Every scroll container gets the `scrollbar-clean` utility — thin, rounded, transparent track, theme-aware. Implementation in [ui-patterns.md](ui-patterns.md).

The bar stays inside its container: a scroll region never touches a rounded border, so its bar
never runs over the edge or past the corners. In a dialog only the body scrolls, inset from the
card's sides, with the title and the actions fixed above and below it.

A scroll cue — an edge shadow or fade on a table that scrolls sideways — shows only when content
actually overflows on that side, and never on a container that fits.

Never a JS scrollbar library. They break keyboard scrolling, momentum, and screen readers, and they cost a dependency for something CSS does in twenty lines.

## Responsive

Tablet-first. Every screen works at ~375px and ~768–1024px: no horizontal overflow, tap targets ≥ 44px, readable type.

## Testing

Components with Vitest + React Testing Library, full flows with Playwright — unless the project
already uses something else. **Test behavior, not appearance.** No test that a button renders, a class is applied, or a heading
reads some text — those break on every redesign and catch nothing; screenshots cover appearance.
Screens with behavior are tested beyond the happy path:

- **Empty, loading, and error states** — each one renders; none is a blank screen
- **Long content** — a 200-character name or an unbroken URL doesn't break the layout
- **Validation** — every rule shows its translated message and blocks submit
- **Double submit** — the button is disabled while the request is pending; two clicks send one
  request
- **Permissions** — a user without the permission can't reach the action
- **RTL** — the screen rendered under `dir="rtl"`, not only in English
- **Input edge cases** — pasted text, the 12th phone digit, the wheel over a number field

The full-flow test drives the feature end to end the way a user would, against a real backend.

## Lint

`lint` and `typecheck` pass before every commit. The house config turns the rules above into
errors — physical direction utilities, raw colours, native controls, hardcoded JSX text, `fetch`
outside the API layer, and one feature importing another. Setup, what each rule catches, and adding
it to an existing repo: [lint.md](lint.md).

## Before calling it done

Search the change for a second copy: any JSX, hook or logic you wrote that already exists, or
that you wrote twice. Extract it before finishing — a duplicate shipped is a fix that will have to
be made in every place it was pasted.

Check the changed screen at mobile and tablet, in **both** LTR (English) and RTL (Arabic), and in
**both** light and dark mode. Mirroring breaks layouts the LTR pass looks fine in, and a colour
that works on white can disappear on dark. Turn reduced motion on once and confirm nothing that
matters depends on an animation.

**A screen that renders user data** — names, emails, amounts, counts, lists — gets a `break-ui` pass:
realistic worst-case data (long Arabic names, unbreakable emails, `1` and `1,284` items, empty
lists, missing optional fields) through the same fixture or seed the demo data uses, checked at
320px, 200% zoom, dark and RTL. Its worst-case toggle is dev-only and never ships.

**A web app people use on phones** — any PWA, or a flow customers open on mobile — gets the
`mobile-native` checklist once: sticky hover, tap flashes, `100dvh`, inputs that zoom, safe areas,
pull-to-refresh, status bar colour. Test it on a real phone.

## Red flags

- A new page, restyle, or visual choice built from a prose description the user never saw
  mocked up

- A signed-in user who can still reach the landing, login or register page, or a role sent to a
  home that isn't its own

- A `<table>`, dialog, form field, empty state or list row written by hand in a page while a shared
  one exists — or two near-identical ones with no shared component at all

- A scrollbar on a rounded edge, or a dialog whose actions scroll away with its content

- A dropdown that opens empty — no "nothing to choose yet" message, no hint where the first one is
  made

- A form control (input, textarea, select trigger, search box, filter, date picker) with
  `bg-transparent` — the page shows through and it reads as unfinished

- A select or dropdown list left at the library look: not aligned to its trigger, small grey rows,
  native ▲▼ scrollbar buttons, or opening underneath a cookie bar or floating button

- Opening a select, dropdown, dialog or sheet that shifts the page sideways

- A scroll shadow drawn on a table or row that doesn't overflow

- A rich-text editor where the user asked for, or never needed, a plain textarea

- A header, menu or role-gated button that is missing for a moment on refresh — the server rendered
  signed out because the session lived only in client storage

- A request the UI awaits with no skeleton, busy state, or status line — a toggle that silently
  refetches, a choice tap with no feedback, a submit button that can be pressed twice

- A commit with `lint` or `typecheck` failing, or an `eslint-disable` with no `-- reason`
- An app without the house lint config
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
- An input, picker, search box or textarea with no placeholder, a placeholder that just repeats the label,
  or one that isn't a valid example of the field's type and rules (a password field showing `••••••••`)
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
- `ease-in` on any UI animation, an entrance from `scale(0)`, or `transition: all`
- Hover motion not gated by `@media (hover: hover) and (pointer: fine)` — it sticks on touch
- A trigger-anchored popover or dropdown that grows from its centre instead of its trigger
- Animation on a keyboard shortcut or an action done many times a day
- A horizontal slide that doesn't flip in RTL
- An app-UI animation over ~300ms, or one the user has to wait through
