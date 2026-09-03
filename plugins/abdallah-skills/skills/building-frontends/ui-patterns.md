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

    /* Standard — Firefox, and Chrome 121+. */
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb) transparent;
  }

  /* WebKit/Blink fallback. Harmless where the standard properties already applied. */
  .scrollbar-clean::-webkit-scrollbar { width: 10px; height: 10px; }
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
- `scrollbar-gutter: stable` matters most on dynamic lists — without it, the layout shifts
  the moment content grows past one screen.
