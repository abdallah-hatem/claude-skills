# RTL on React Native

Arabic is a first-class language, not a translation pass. The web's rule — logical properties,
transforms flipped by hand — holds here, with one difference that changes everything: **the layout
direction is fixed when the app starts.** Changing it needs a reload.

`expo-localization`'s guide covers the config; this file is the house shape on top of it.

## The direction is set at launch

React Native reads the layout direction once, natively, when the JavaScript starts.
`I18nManager.forceRTL(true)` writes a preference for the **next** launch; the screen in front of
the user does not flip until the app reloads.

- **Config:** set `supportsRTL: true` on the `expo-localization` config plugin in `app.json`, so a
  device in Arabic launches RTL. It is native config — it needs a new build, not an OTA.
- **In-app language switch:** change the language, persist it, set the direction, reload.
- **At launch:** if the saved language's direction differs from `I18nManager.isRTL`, set it and
  reload once. Keep the splash up until this is settled, so nobody sees a mirrored flash.
- **Reload:** `Updates.reloadAsync()` from expo-updates in a release build. It rejects in
  development and in Expo Go, so development uses `DevSettings.reload()`.
- **Expo Go resets the RTL preference** — check RTL on a development build, never in Expo Go.

`src/lib/i18n/direction.ts`

```ts
import i18n from "i18next";
import { DevSettings, I18nManager } from "react-native";
import * as Updates from "expo-updates";

const RTL_LANGUAGES = ["ar"];

export const isRtlLanguage = (lng: string) => RTL_LANGUAGES.includes(lng.split("-")[0] ?? lng);

/** True when the running layout doesn't match the language — the caller reloads. */
export function syncDirection(lng: string): boolean {
  const rtl = isRtlLanguage(lng);
  if (I18nManager.isRTL === rtl) return false;
  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);
  return true;
}

/** Layout direction is read at launch, so a change needs a reload to show. */
export async function reloadApp() {
  if (__DEV__) DevSettings.reload(); // reloadAsync rejects in development
  else await Updates.reloadAsync();
}

export async function changeLanguage(lng: string, persist: (lng: string) => Promise<void>) {
  await persist(lng);
  await i18n.changeLanguage(lng);
  if (syncDirection(lng)) await reloadApp();
}
```

At startup, run `syncDirection(savedLanguage)` before hiding the splash and reload when it returns
`true`. Because the check compares against `I18nManager.isRTL`, the reload happens once, not in a
loop.

## What `I18nManager.isRTL` covers, and what it doesn't

With the direction set, React Native mirrors on its own:

- `flexDirection: "row"` lays out from the start edge — the first child sits on the right in Arabic.
- Logical props (`start`, `end`, `marginStart`, `paddingEnd`, `borderStartWidth`,
  `borderTopStartRadius`) resolve to the right side.
- Native navigation chrome — stack headers, the back button and its swipe, native tabs — mirrors.
- Text with the default alignment follows the writing direction.

It does **not** touch:

- **Transforms** — `translateX`, a slide-in, a swipe offset, a progress bar that grows.
- **Icons** — a chevron, a back arrow, a "send" icon is a picture; it points the same way in both.
- **Gestures** — a Reanimated/Gesture Handler `translationX` is physical; "swipe toward the end"
  is negative in RTL.
- **Numbers and Latin runs inside Arabic** — a phone number or a code can reorder; render it in its
  own `Text` so it stays left-to-right.
- **Physical props** — `left`, `right`, `marginLeft`, `paddingRight`, `textAlign: "left"`. Some are
  swapped by `swapLeftAndRightInRTL` on some platforms and not others; never rely on it. Use the
  logical props and leave `textAlign` at its default.
- **Anything drawn** — SVG paths, charts, custom canvases.

Read direction from `I18nManager.isRTL`, never from `i18n.language` — the language can change a
moment before the reload that applies it.

## Logical styles

| Use | Not |
|---|---|
| `ms-` `me-` `ps-` `pe-` | `ml-` `mr-` `pl-` `pr-` |
| `start-` `end-` | `left-` `right-` |
| `rounded-s-` `rounded-e-` `border-s-` `border-e-` | `rounded-l-` `rounded-r-` `border-l-` `border-r-` |
| `marginStart` `paddingEnd` `start` `end` | `marginLeft` `paddingRight` `left` `right` |

Symmetric values (`mx-`, `px-`, `marginHorizontal`) are fine as they are. The lint config bans the
physical forms — see [lint.md](lint.md).

## Directional icons

One wrapper in `src/ui/` mirrors any icon that means a direction — back, forward, chevrons, "next",
send, reply, undo/redo, a list bullet arrow:

```tsx
<Icon style={{ transform: [{ scaleX: I18nManager.isRTL ? -1 : 1 }] }} />
```

Icons without a direction never flip: search, check, close, plus, a clock, a play button, logos,
and anything with text or a hand in it.

## Animations and gestures

Multiply every horizontal offset by the direction, once, in a helper:

```ts
const dir = I18nManager.isRTL ? -1 : 1;
translateX.value = withSpring(open ? dir * DRAWER_WIDTH : 0);
```

The same applies to swipe-to-delete (the action lives on the end side), a carousel's paging
direction, a horizontal progress bar, and an entering transition that slides "from the side".
Reanimated's layout animations like `SlideInRight` are physical: pick the matching one by direction.

Horizontal lists and pagers start at the start edge in RTL; check the first item is the one on the
right and that scrolling "forward" goes left.

## Checking it

- Every changed screen in **both** directions, on phone and tablet — mirroring breaks layouts that
  look fine in English.
- In a unit test, render the screen with the Arabic locale and the direction forced (mock
  `I18nManager.isRTL`), and assert the text and the order — see [testing.md](testing.md).
- Screenshots in RTL come from a development build with Arabic selected in the app, not Expo Go.
- Look for: a chevron pointing the wrong way, a drawer that slides in from the wrong edge, a badge
  pinned to the wrong corner, a phone number reordered, a row whose icon and label overlap.

## Red flags

- A language switch with no reload, or a reload that loops on every launch
- `Updates.reloadAsync()` called in development, or RTL checked only in Expo Go
- The direction read from `i18n.language` instead of `I18nManager.isRTL`
- `marginLeft`, `paddingRight`, `left:`, `ml-`, `pr-`, `textAlign: "left"` in new code
- Relying on `swapLeftAndRightInRTL` to fix physical props
- A back arrow or chevron that doesn't flip, or a clock or logo that does
- A `translateX`, swipe, or slide-in that moves the same way in both directions
- A phone number or code rendered inside Arabic text so its digits reorder
- A screen checked only in English
