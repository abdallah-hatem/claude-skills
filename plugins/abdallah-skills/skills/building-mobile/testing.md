# Testing a mobile app

Three layers, each for what it's good at — unless the project already uses something else:

| Layer | Tool | Proves |
|---|---|---|
| Behavior | jest-expo + React Native Testing Library | a screen does the right thing for each state and input |
| Smoke flows | Maestro | the app, built and running, gets through its main flows against a real backend |
| Appearance | simulator screenshots | the screen looks right on each device, direction, theme, and text size |

`lint` and `typecheck` are green alongside the tests — a green suite with a red typecheck is not
green. See [lint.md](lint.md).

## Behavior: jest-expo + React Native Testing Library

```bash
npx expo install jest-expo jest @types/jest --dev
npx expo install @testing-library/react-native test-renderer --dev   # RNTL 14 needs test-renderer
```

`package.json`: `"jest": { "preset": "jest-expo" }` and
`"test": "jest --silent"` — not Expo's `--watchAll` default, which never exits in an agent's shell.

**Test behavior, not appearance** (`building-frontends` → Testing). No test that a button renders
or a style is applied. Query the way a user finds things — `getByRole`, `getByLabelText`,
`findByText` — and act through `userEvent`:

```tsx
import { render, screen, userEvent } from "@testing-library/react-native";

test("two taps on Save send one request", async () => {
  const user = userEvent.setup();
  await render(<NewInvoiceScreen />, { wrapper: Providers }); // RNTL 14: render is async
  await user.type(screen.getByLabelText("Total"), "100000");
  const save = screen.getByRole("button", { name: "Save" });
  await user.press(save);
  await user.press(save);
  expect(createInvoice).toHaveBeenCalledTimes(1);
});
```

`Providers` is one test wrapper in `src/test/` with a fresh `QueryClient` (retries off), i18n
loaded, and the safe-area provider (`SafeAreaProvider` with `initialMetrics` for an iPhone frame —
without it, any screen that reads insets throws in tests). Mock at the data layer (`src/features/<name>/api.ts` or the
client), never `fetch` in a screen test.

**Quiet output, one summary line.** Run with `--silent` and read the runner's final
`Tests: N passed, N total` line; that line is the evidence, not a scroll of logs. A failing test
is re-run alone (`npx jest path/to/file -t "name"`) until it passes, then the whole suite.

### The edge cases

Every screen with behavior is tested beyond the happy path:

- **Empty, loading, and error states** — each renders; none is a blank screen; empty never shows
  while the first load runs
- **Long content** — a 200-character name, an unbroken URL, a long Arabic word don't break the row
- **Validation** — every rule shows its translated message and blocks submit
- **Double submit** — two taps on Save send one request; the button is disabled while pending
- **Permissions** — a denied OS permission shows its designed state; a user without the role can't
  reach the action
- **RTL** — the screen rendered with Arabic loaded and `I18nManager.isRTL` mocked `true`; assert
  the Arabic text and the order, not only English ([rtl.md](rtl.md))
- **Input edge cases** — pasted text with spaces or a newline, a pasted `+20` number normalised,
  the 12th phone digit refused, Arabic-Indic digits (`٠١٢`) in a number field
- **Offline and slow** — a failed refetch keeps the data and offers retry; a timeout shows its
  message instead of an endless skeleton

## Smoke flows: Maestro

Maestro drives the real app on a simulator. Each flow is a smoke spec for one main journey — sign
in, create the core record, see it in the list — not a test of every edge case.

```bash
curl -fsSL "https://get.maestro.mobile.dev" | bash     # once
maestro test .maestro/                                  # every flow in the folder
maestro test .maestro/ --include-tags=smoke
maestro test -e PASSWORD="$SEED_PASSWORD" .maestro/create-invoice.yaml
```

**A flow signs in as a seeded account inside the flow** — it never depends on a session left
over from a manual run, and it starts from a clean state:

```yaml
appId: com.company.app
tags:
  - smoke
---
- launchApp:
    clearState: true
- runFlow:
    file: subflows/sign-in.yaml
    env:
      EMAIL: owner@demo.test
- tapOn:
    id: "new-invoice"
- tapOn:
    id: "invoice-total"
- inputText: "100000"
- tapOn:
    id: "save"
- assertVisible: "100,000"
```

- Target elements by `testID` (`id:` in Maestro), never by position; text only for what the user
  reads.
- Seeded accounts and their passwords come from the repo's seed; pass secrets with `-e`, never
  written into a flow.
- Run flows against a local build and a local backend (Docker or the dev API — see
  [data-layer.md](data-layer.md) for reaching it), never against production data.
- Run a flow against a release-configuration build when the dev client's overlays get in the way.
- **After a change, run only the flows that cover the changed screens.** The whole folder runs
  once before the PR, not after every fix.
- **Maestro treats an element under the keyboard as visible**: `scrollUntilVisible` won't scroll
  and `tapOn` lands on the keyboard. Swipe the form up first (`swipe: start: 50%, 45% end: 50%,
  15%`); `hideKeyboard` is unreliable on iOS.
- Right after Metro restarts, the first `openLink` into the dev client can land before the
  launcher is ready — re-run once before debugging the flow.
- With a dev client, `launchApp: clearState: true` forgets the Metro URL: a shared `open-app`
  subflow opens the bundle with `openLink` and dismisses the dev menu's first-run sheet.
- **Maestro taps where an element *is*, without scrolling it into view.** A part-scrolled list
  means a tap at a point off the screen, and the step still reports COMPLETED. When a header
  scrolls with its list, scroll it back (`scrollUntilVisible` on a header element) before touching
  anything positioned relative to it.
- **A text selector is matched against the element's whole accessibility label, and iOS merges a
  row's children into one label.** `"Held photo"` never matches a row reading "Held photo, @omar,
  scan was unsure". Use `".*Held photo.*"`, or a `testID`.
- **`clearState: true` does not clear the app's Documents directory.** Anything the app persists
  there — a chosen language, an onboarding flag — survives into the next flow. Don't try to reset
  it from the runner either: the *next* flow's `clearState` wipes the reset, and the app then falls
  back to the device's own setting.
- **The app follows the device language until the member picks one**, so a flow that taps a native
  tab by its English label breaks on a machine set to anything else. Match both
  (`tapOn: "Profile|الملف الشخصي"`) rather than pinning the device.
- **A handler that defers — a double-tap window, a debounce — plus Maestro's tap retry reads as a
  second tap.** Maestro taps again when the screen doesn't change, which inside the window is a
  double tap. Set `retryTapIfNoChange: false` on that tap.
- **Never edit source while a suite is running.** Metro hot-reloads into the flows mid-run and the
  result means nothing. Let it finish, or stop it.

### What only a flow can see

A green unit suite says nothing about the runtime the app actually ships on. Jest runs on Node,
which has full ICU and every web API; Hermes does not. `Intl.RelativeTimeFormat` is missing on
iOS — a feed built on it threw *"undefined cannot be used as a constructor"* on every card while
237 unit tests passed. The same goes for `Intl.PluralRules`, newer `Intl` options, and anything
polyfilled by the test environment but not by the engine.

This is the reason the smoke run is not optional, and the reason it runs before the PR rather than
after it.

**A regression test for a platform gap must remove the capability before asserting**, or Node
hides the bug again:

```ts
const withoutRelativeTimeFormat = <T,>(run: () => T): T => {
  const intl = Intl as unknown as Record<string, unknown>;
  const real = intl.RelativeTimeFormat;
  delete intl.RelativeTimeFormat;
  try {
    return run();
  } finally {
    intl.RelativeTimeFormat = real;
  }
};
```

## Appearance: simulator screenshots

Screenshots are the visual check the unit tests deliberately skip. In a `/build-software` run the
`abdallah-skills:ui-auditor` agent takes this matrix over every screen, sheet and state, looks at each
shot, and shuts its simulator down. **One simulator at a time** —
boot it, take the set, shut it down, then the next; several at once starve the machine and flake.

The matrix for every changed screen:

| Axis | Values |
|---|---|
| Device | an iPhone, an iPad, and the smallest supported phone (iPhone SE size) |
| Direction | LTR (English) and RTL (Arabic, switched in the app on a dev build) |
| Theme | light and dark |
| Text size | default and the largest accessibility size |
| Motion | Reduce Motion on, once, to confirm nothing depends on an animation |

```bash
xcrun simctl ui booted appearance dark
xcrun simctl ui booted content_size accessibility-extra-extra-extra-large
xcrun simctl io booted screenshot screens/invoice-list-ipad-rtl-dark.png
```

Name each file by screen, device, direction, and theme, and look at every one — a screenshot nobody
opened proves nothing. Check: nothing clipped or overlapping at the largest text size, chevrons and
drawers mirrored in RTL, contrast holding in dark, the tablet using its width, the primary action
visible above the keyboard.

Android: check the same screens on an emulator when the app ships to Android; the direction and
text-size checks matter most there.

## Tear down when done

A booted simulator, emulator and Metro together hold several GB of memory. When the test pass is
over and no more mobile work is coming in the next ~20 minutes, shut them all down; boot again
when needed — a cold boot costs less than a slow machine.

```bash
xcrun simctl shutdown all && osascript -e 'quit app "Simulator"'
adb devices | awk '/emulator-/{print $1}' | xargs -I{} adb -s {} emu kill
pkill -f "expo start|react-native start|metro"
```

Stop only the servers you started — never a blanket `pkill node`, which takes down Claude's own
tools.

## Red flags

- `render(...)` not awaited under RNTL 14, or `react-test-renderer` added to the project
- A test asserting a style, a class, or that a component renders
- `fetch` mocked in a screen test instead of the data layer
- The suite run with `--watchAll`, or "tests pass" claimed without the summary line
- Tests green while `lint` or `typecheck` is red
- Only the happy path tested on a screen that has empty, error, and validation states
- RTL covered only by the English render
- A Maestro flow that relies on an existing session, a hardcoded password, or tap coordinates
- A bare text selector in a flow, where iOS merges the row into one label
- Source edited while a suite is running, so the result describes neither version
- A platform gap "fixed" with a test that still passes on the old code, because Node has the
  API the phone lacks
- A Maestro flow run against production
- Screenshots from several simulators booted at once, or taken but never looked at
- Checked only on one device, in English, in light mode, at the default text size
- A simulator, emulator or Metro left running after the test pass with no mobile work coming next
