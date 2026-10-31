# UI patterns

## Skeletons

A skeleton is not a grey box — it is a **tracing of the real component**. Same heights,
same gaps, same rounding, same number of rows as a full page of results. If the layout
moves when data arrives, the skeleton was wrong.

Build one skeleton per row/card component and colocate it with that component, so the two
drift together instead of apart.

```tsx
// components/customers/customer-row.tsx
import { Skeleton } from '@/components/ui/skeleton'

export function CustomerRow({ customer }: { customer: Customer }) {
  return (
    <div className="flex items-center gap-3 p-4">
      <Avatar className="h-10 w-10" src={customer.avatarUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{customer.name}</p>
        <p className="truncate text-xs text-muted-foreground">{customer.phone}</p>
      </div>
      <Button size="sm" variant="ghost">{t('common.view')}</Button>
    </div>
  )
}

// Same box model as CustomerRow — h-10/w-10 avatar, two stacked lines, a trailing action.
export function CustomerRowSkeleton() {
  return (
    <div className="flex items-center gap-3 p-4">
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-8 w-16 rounded-md" />
    </div>
  )
}
```

Render as many as the page normally holds — one skeleton where ten rows are coming still
shifts the layout:

```tsx
{isLoading
  ? Array.from({ length: PAGE_SIZE }, (_, i) => <CustomerRowSkeleton key={i} />)
  : customers.map((c) => <CustomerRow key={c.id} customer={c} />)}
```

In the App Router, a route's own skeleton belongs in `loading.tsx` next to `page.tsx` —
it streams in automatically, no `isLoading` state needed.

**Rules**

- Skeleton for *first paint of absent data*. For a refetch of data already on screen, keep
  the stale content and dim it — do not flash back to skeletons.
- For mutations, update optimistically. A skeleton after "Save" is a regression.
- Under ~200ms, render nothing. A skeleton that appears and vanishes reads as a glitch.
- Never animate a skeleton faster than ~1.5s per cycle; quicker pulses read as an error state.
- The skeleton traces the component **in the state it opens in**. A disclosure, accordion,
  tab or panel that starts open is skeletoned open (its rows), one that starts folded is
  skeletoned as the folded bar. Changing a default state (open/closed, which tab, how many
  rows show) means changing the skeleton in the same change, with a test that pins its shape.

## Scrollbar

Native scrollbars are inconsistent across platforms and heavy on Windows. One utility fixes
every scroll container. Pure CSS — no library, no JS, no wrapper component, so keyboard
scrolling, momentum, and screen readers keep working.

```css
/* app/globals.css */
:root {
  --scrollbar-thumb: rgb(0 0 0 / 0.18);
  --scrollbar-thumb-hover: rgb(0 0 0 / 0.32);
}
.dark {
  --scrollbar-thumb: rgb(255 255 255 / 0.20);
  --scrollbar-thumb-hover: rgb(255 255 255 / 0.34);
}

@layer utilities {
  .scrollbar-clean {
    /* Reserve the gutter so content doesn't jump when the bar appears. */
    scrollbar-gutter: stable;
  }

  /* Standard properties only where the WebKit pseudo-elements don't exist (Firefox). In
     Chrome 121+ `scrollbar-width` overrides the ::-webkit-scrollbar styles below, and on
     Windows that brings back the native ▲▼ arrow buttons and a grey thumb. */
  @supports not selector(::-webkit-scrollbar) {
    .scrollbar-clean {
      scrollbar-width: thin;
      scrollbar-color: var(--scrollbar-thumb) transparent;
    }
  }

  /* WebKit/Blink: Chrome, Edge, Safari. */
  .scrollbar-clean::-webkit-scrollbar { width: 10px; height: 10px; }
  .scrollbar-clean::-webkit-scrollbar-button { display: none; }
  .scrollbar-clean::-webkit-scrollbar-track { background: transparent; }
  .scrollbar-clean::-webkit-scrollbar-corner { background: transparent; }
  .scrollbar-clean::-webkit-scrollbar-thumb {
    background-color: var(--scrollbar-thumb);
    border-radius: 9999px;
    /* Transparent border + content-box clip insets the thumb, so a 10px track
       renders a ~6px bar with breathing room on both sides. */
    border: 2px solid transparent;
    background-clip: content-box;
  }
  .scrollbar-clean:hover::-webkit-scrollbar-thumb {
    background-color: var(--scrollbar-thumb-hover);
  }
}
```

Tailwind v4 uses `@utility scrollbar-clean { … }` instead of the `@layer utilities` block;
the declarations are identical.

Apply it to the scroll container, and to `html` for the page itself:

```tsx
<div className="scrollbar-clean max-h-96 overflow-y-auto">…</div>
```

**Rules**

- Style the scrollbar; never replace the mechanism. `overflow: hidden` plus a JS-driven
  fake bar breaks keyboard `PageDown`, trackpad momentum, and `scrollIntoView`.
- Keep the thumb visible, not hover-only. A scroll region with no visible affordance reads
  as static content — people don't discover it.
- RTL needs nothing: browsers move the scrollbar to the left edge automatically under
  `dir="rtl"`. Don't hand-position it.
- Never on a rounded edge. A scroll region that fills a rounded container draws its bar over the
  border and past the corners; inset the region from the container's edge so the bar sits inside
  (see Modals, "The bar stays inside its container").
- `scrollbar-gutter: stable` matters most on dynamic lists — without it, the layout shifts
  the moment content grows past one screen.

## Modals, sheets and popovers

Every bounded overlay — dialog, sheet, drawer, popover, dropdown — follows three rules:

1. its **width follows its content**,
2. its **height is capped** by the viewport,
3. it **scrolls its own body**, never the page behind it.

### Width follows content

shadcn's `DialogContent` defaults to `sm:max-w-lg` (32rem). That fits a confirmation and not
much else: a table or a two-column form inside it gets squeezed until it wraps badly or
scrolls sideways. **A modal that scrolls horizontally because it is too narrow is a sizing
bug — widen it.**

Put a size prop on the primitive instead of overriding `className` at each call site:

```tsx
const dialogSizes = {
  sm: 'sm:max-w-md',   // confirmation, a single field
  md: 'sm:max-w-lg',   // short form
  lg: 'sm:max-w-3xl',  // two-column form, detail view
  xl: 'sm:max-w-5xl',  // tables, wide content
} as const
```

Pick the size from the **widest thing inside**. Every size is still capped at
`max-w-[calc(100vw-2rem)]`, so `xl` on a phone is simply full width with a margin.

Horizontal scroll is acceptable only when content is genuinely wider than any screen — a
12-column table on mobile — and then it lives on that table's own `overflow-x-auto` wrapper,
not on the modal.

### Height is capped; only the body scrolls

```tsx
<DialogContent
  className={cn(
    'flex max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] flex-col gap-0 p-0',
    dialogSizes[size],
  )}
>
  <DialogHeader className="shrink-0 border-b p-6">…</DialogHeader>

  <div className="scrollbar-clean min-h-0 flex-1 overflow-y-auto overscroll-contain p-6">
    {children}
  </div>

  <DialogFooter className="shrink-0 border-t p-6">…</DialogFooter>
</DialogContent>
```

Four details, each load-bearing:

- **`dvh`, not `vh`.** On mobile `100vh` includes the area under the browser toolbars, so a
  `vh`-capped modal has its bottom cut off — and the bottom is where Save is.
- **`min-h-0` on the body.** A flex child won't shrink below its content without it, so
  `overflow-y-auto` never engages and the whole modal overflows instead.
- **Header and footer `shrink-0`, outside the scroll region.** Title and actions stay put;
  only the content moves. A Save button that scrolls out of view is one nobody finds.
- **`overscroll-contain`.** Reaching the end of the body doesn't chain the scroll to the
  page underneath.
- **The bar stays inside its container.** The scrollbar is drawn on the scrolling element's own
  edge, so a scroll region that touches the card's border puts the bar on that border and runs it
  past the rounded corners. Keep the region off every rounded edge: the header and footer cap its
  ends, and it sits inset from the card's side (`mx-1.5` on the body, its padding reduced to
  match, so content stays where it was). The same holds for any rounded scroll area — a dropdown,
  a sheet, a card with a scrolling list: the bar never sits on the rounded border.

```tsx
  <div className="scrollbar-clean mx-1.5 min-h-0 flex-1 overflow-y-auto overscroll-contain px-[1.125rem] py-6">
    {children}
  </div>
```

### Scroll never escapes to the page

Radix locks body scroll while a dialog is open — which is exactly why an uncapped modal is
broken: its overflow has nowhere to go, so the content past the fold is simply unreachable.
The height cap plus an internal scroll body is what makes long content reachable at all.

The rule is not modal-specific. A sheet, a popover list, a dropdown with 200 options, a side
panel: each gets a max height and scrolls itself. Content never scrolls by moving the page
behind the thing it belongs to.

**Rules**

- Size from the content, through the size prop — never ship shadcn's default width holding a
  table or a multi-column form.
- Cap both axes at the viewport: `max-w-[calc(100vw-2rem)]`, `max-h-[calc(100dvh-2rem)]`.
- Actions live in a fixed footer, never inside the scrolling body.
- Every scroll body gets `scrollbar-clean`, like every other scroll container.

## Form controls and popovers look designed

shadcn's primitives are a starting point, not a finished look. Two defaults have to be replaced in
the shared primitives the day the design system lands, not screen by screen later:

- **Form controls get a solid surface.** `Input`, `Textarea`, the `Select` trigger, search boxes,
  filter controls and date-picker triggers ship with `bg-transparent`, so the page shows through
  and the field reads as unfinished. Give them a surface token (`bg-card`, or a dedicated
  `--input` background) with a clear border, a visible focus ring and a distinct disabled state.
  Ghost buttons and table-row hovers keep their transparency; form controls don't.
- **Popover content is designed.** A `Select`, `DropdownMenu` or `Combobox` list is aligned to its
  trigger (`position="popper"`, `sideOffset`, width `var(--radix-select-trigger-width)` with a
  sensible min-width), uses reading-size rows (40–44px), a themed highlight (not the grey
  default), a themed check on the inline-end side, a max height with `scrollbar-clean`, and a
  short fade + scale from the trigger. Put the look in the shared primitive with variants (a
  public tone and a quieter admin tone) — never one-off overrides at call sites.
- **Popovers stack above floating UI.** A dropdown opened near the bottom of the screen must sit
  above the cookie bar, chat or WhatsApp button and toasts. Give overlays a z-index token
  (`--z-popover`) above every fixed element, instead of lowering the fixed elements.

Judge each one **open**, at phone and desktop, in both languages: does it look designed for this
product, or like a library default?

## Opening an overlay never moves the page

Radix overlays (Dialog, Sheet, Select, DropdownMenu, Popover) lock page scroll with
`react-remove-scroll`, which hides the page scrollbar and adds `margin-right` (the scrollbar's
width) to `<body>` so the content doesn't jump. If `<html>` already reserves the gutter with
`scrollbar-gutter: stable`, that compensation is applied **twice** and the whole page jumps
sideways every time something opens. Keep the gutter and neutralise the margin, once, in
`globals.css`:

```css
html { scrollbar-gutter: stable; }

/* The page never loses its scrollbar: Chrome drops even a stable gutter once the lock hides
   overflow on <body> (or on <html>), and the page shifts. Keep overflow visible and undo the
   margin the lock adds; the lock still blocks wheel and touch scrolling behind the modal. */
html body[data-scroll-locked] {
  overflow: visible !important;
  margin-left: 0 !important;
  margin-right: 0 !important;
  --removed-body-scroll-bar-size: 0px !important;
}
```

`scrollbar-gutter: stable` alone is **not** enough: measure `innerWidth -
document.documentElement.getBoundingClientRect().width` before and after opening a dialog with
real scrollbars (Playwright: `launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] }`). If it
drops to 0, the page moved. A failing shift test is never "machine noise" until that number says so.

Fixed elements (header, floating buttons, cookie bar) must not jump either. Guard it with a
Playwright test: record the `getBoundingClientRect()` of a heading, the header and every fixed
element, open a select, a dropdown menu and (at phone width) the menu sheet, and assert the rects
are identical, in LTR and RTL. A screenshot taken after opening can't show the jump; only the
before/after measurement can.

## Scroll cues only when there is something to scroll to

An edge shadow or fade that says "this table scrolls sideways" appears only when the content
actually overflows **on that side**: the end cue before the user scrolls to the end, the start cue
after they scroll away from the start, nothing when it fits. Measure with a `ResizeObserver` and a
scroll listener on the scroll container, and mirror it in RTL. A cue drawn on a container that
fits is a static grey bar that means nothing.
