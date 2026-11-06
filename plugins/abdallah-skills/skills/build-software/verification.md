# Verification: seed data and smoke checks

Two things every build sets up before its first task, because every later check depends on them:
**seed data**, so there is always an account to sign in as, and **smoke specs**, so every screen is
checked the same way — locally, on the preview, and on production.

## Seed data

`prisma/seed.ts` creates, and can re-run safely:

- **one test account per role** the business doc names
- **realistic data for every flow** — records in each state a flow moves through (pending, paid,
  cancelled), not one happy-path row
- **Arabic content beside English** — names, addresses, notes — so RTL screens are checked with real
  text

```ts
// prisma/seed.ts
const ROLES = ['owner', 'manager', 'customer'] as const   // the roles in the business doc

async function main() {
  const passwordHash = await hash(process.env.SEED_PASSWORD!)

  for (const role of ROLES) {
    await prisma.user.upsert({
      where: { email: `${role}@test.local` },
      update: {},
      create: { email: `${role}@test.local`, role, passwordHash },
    })
  }

  // …then records in every state each flow needs, also by upsert
}
```

- **Upsert, never insert.** A second run must neither fail nor duplicate — it runs on every fresh
  database.
- **The password comes from the environment** — `SEED_PASSWORD` in `.env.local` — never from the
  file. The seed is committed to a public repo.
- **The logins go into `CREDENTIALS.local.md`** as soon as the seed runs against a new environment.
- **Local and preview only.** Production gets at most one pre-launch test account, created on
  purpose and removed at launch — never the sample data.
- **A new role in the business doc gets its seeded account** in the same change.
- **Re-seed before every flow, not once per run**, whenever a suite signs in repeatedly. Sign-in
  is rate limited — a code every 60 s, a handful an hour, per address — and a suite where most
  flows sign in as the same seeded member runs out partway through, failing the later flows for a
  reason that has nothing to do with the code. Clearing those accounts' sign-in codes is part of
  what the seed does, so a re-seed per flow costs a second and makes the suite order-independent.

```bash
npx prisma db seed                                          # local
DATABASE_URL="<preview unpooled URL>" npx prisma db seed    # preview, after its first migration
```

## Smoke check

Playwright specs that sign in as the seeded accounts, walk the main flows, and screenshot each screen
in every combination the app supports. The same specs run locally, on the preview, and on production
— only `BASE_URL` changes.

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

const viewports = { mobile: devices['iPhone 13'], tablet: devices['iPad (gen 7)'] }
const locales = ['en', 'ar'] as const
const schemes = ['light', 'dark'] as const
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET

export default defineConfig({
  testDir: 'e2e',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    // Vercel previews are protected by default; this header lets the specs through.
    extraHTTPHeaders: bypass
      ? { 'x-vercel-protection-bypass': bypass, 'x-vercel-set-bypass-cookie': 'true' }
      : undefined,
  },
  projects: [
    { name: 'auth', testMatch: /auth\.setup\.ts/ },
    ...Object.entries(viewports).flatMap(([viewport, device]) =>
      locales.flatMap((locale) =>
        schemes.map((colorScheme) => ({
          name: `${viewport}-${locale}-${colorScheme}`,
          dependencies: ['auth'],
          use: { ...device, locale, colorScheme },
        })),
      ),
    ),
  ],
})
```

```ts
// e2e/auth.setup.ts — signs in once per role; every spec reuses the saved session
import { test as setup } from '@playwright/test'

for (const role of ['owner', 'customer']) {
  setup(`sign in as ${role}`, async ({ page }) => {
    await page.goto('/en/auth/login')
    await page.getByTestId('login-email').fill(`${role}@test.local`)
    await page.getByTestId('login-password').fill(process.env.SEED_PASSWORD!)
    await page.getByTestId('login-submit').click()
    await page.waitForURL((url) => !url.pathname.includes('/auth/login'))
    await page.context().storageState({ path: `e2e/.auth/${role}.json` })
  })
}
```

```ts
// e2e/bookings.spec.ts
import { test, expect } from '@playwright/test'

test.use({ storageState: 'e2e/.auth/owner.json' })

test('owner sees the bookings list @smoke @readonly', async ({ page }, info) => {
  const locale = info.project.use.locale
  await page.goto(`/${locale}/bookings`)
  await expect(page.getByTestId('bookings-table')).toBeVisible()
  await page.screenshot({ path: `e2e/shots/${info.project.name}/bookings.png`, fullPage: true })
})

test('owner creates a booking @smoke', async ({ page }, info) => {
  // …walks the flow; creates data, so it never runs against production
})
```

```bash
npx playwright test --grep @smoke                                                      # local
BASE_URL=https://<app>-git-dev-<team>.vercel.app npx playwright test --grep @smoke     # preview
BASE_URL=https://<app>.vercel.app npx playwright test --grep @readonly                  # production
```

- **Few and fast.** One spec per main flow and one screenshot per screen. Edge cases belong in unit
  and integration tests, not here.
- **Every `ui` and `surface` screen appears in a smoke spec**, so its screenshots exist to look at.
- **Look at the screenshots.** A passing run proves the flow works, not that the screen looks right.
  The `ui-auditor` agent does the looking, over every screen and state, at Verify and before a release.
- **Locate by test id** (`data-testid`). Labels change with the locale, and classes change with the
  design.
- **Production runs `@readonly` specs only.** A smoke check must never leave records real users see.
- **Sign-in happens in `auth.setup.ts`** from the seeded accounts. Nobody types a password by hand.
- **`e2e/.auth/` and `e2e/shots/` are gitignored** — the saved sessions are live tokens.

## Tests that survive a full run

A spec that passes alone and on a fresh seed can still fail in the full suite, on CI, or on a
different day. Every e2e spec is written to pass on any day, after any other spec, on a slow machine:

- **No calendar assumptions.** Don't click "the 10th" or expect "this month" to have data — on the
  1st or 2nd it hasn't. Pick the first day the picker offers, or derive dates from today.
- **Read the state you meet, not the seed you remember.** Earlier specs leave records behind:
  extra users, closed records, very large amounts. Find a record that fits the test by asking the API
  for one with the properties it needs, page through whole lists rather than the first page, and when
  the right answer depends on existing state, read that state and compute the expectation from it.
- **Clean up what you add that changes others' results.** A spec that creates users, accounts or
  settings that later specs count takes them out again in `afterAll`.
- **Wait for the screen, don't read it once.** Assert with retrying matchers (`toHaveCount`,
  `toHaveText`, `toHaveURL`) instead of reading a value once and comparing it.
- **Optional config is optional on CI too.** A feature that needs a key CI doesn't have (push, mail)
  checks it is hidden there and skips the rest.
- **Every test timing out on `page.goto`, with `next-server` near 100% CPU, is the dev server, not
  the tests.** Stop the run, kill the server, `rm -rf apps/web/.next`, and never let `next build`
  and `next dev` share one `.next`. Split long suites into ~3-minute spec groups, each a foreground
  run with a 10-minute timeout.
- To prove a fix, rebuild the late-run state in a throwaway setup spec, show the old test failing
  with CI's exact error, then the fixed one passing in that state and on a fresh seed.

## Visual baselines

`toHaveScreenshot` baselines are per operating system: fonts render differently, so keep a
`-darwin` set taken locally and a `-linux` set taken by CI, and never copy one over the other.

- **Linux CI:** headless Chromium rounds each glyph to a whole pixel, so Latin text comes out wider
  than on a Mac and fixed-width columns overflow only on CI. Launch Chromium with
  `--font-render-hinting=none` on Linux (`launchOptions.args` in `playwright.config.ts`, gated on
  `process.platform === 'linux'`).
- **Freeze what changes:** the seed, the clock (the API's and the browser's), and anything random.
- **First Linux run:** CI writes the missing baselines (`--update-snapshots=missing`) and uploads them
  as an artifact. Download, look at every one, then commit. A baseline nobody looked at checks nothing.
- A deliberate screen change retakes that screen's baselines in both sets.

## Red flags

- A test account that exists only because someone created it by hand
- A seed that fails or duplicates on its second run
- A seed password, a saved session, or a bypass secret committed
- A verification step that needs a person to type a password into a login page
- Smoke specs pointed at a protected preview without the bypass header
- Screenshots produced and never looked at
- Production smoke specs that create data
- A suite that seeds once and then fails its later flows on a sign-in rate limit
- An e2e spec that clicks a fixed day of the month, or expects a fresh seed in the middle of the suite
- Visual baselines committed without being looked at, or one OS's set copied over the other's
