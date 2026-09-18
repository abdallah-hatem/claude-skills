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
loaded, and the safe-area provider. Mock at the data layer (`src/features/<name>/api.ts` or the
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

## Appearance: simulator screenshots

Screenshots are the visual check the unit tests deliberately skip. **One simulator at a time** —
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

## Red flags

- `render(...)` not awaited under RNTL 14, or `react-test-renderer` added to the project
- A test asserting a style, a class, or that a component renders
- `fetch` mocked in a screen test instead of the data layer
- The suite run with `--watchAll`, or "tests pass" claimed without the summary line
- Tests green while `lint` or `typecheck` is red
- Only the happy path tested on a screen that has empty, error, and validation states
- RTL covered only by the English render
- A Maestro flow that relies on an existing session, a hardcoded password, or tap coordinates
- A Maestro flow run against production
- Screenshots from several simulators booted at once, or taken but never looked at
- Checked only on one device, in English, in light mode, at the default text size
