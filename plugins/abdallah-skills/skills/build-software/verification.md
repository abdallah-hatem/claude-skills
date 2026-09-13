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
- **Locate by test id** (`data-testid`). Labels change with the locale, and classes change with the
  design.
- **Production runs `@readonly` specs only.** A smoke check must never leave records real users see.
- **Sign-in happens in `auth.setup.ts`** from the seeded accounts. Nobody types a password by hand.
- **`e2e/.auth/` and `e2e/shots/` are gitignored** — the saved sessions are live tokens.

## Red flags

- A test account that exists only because someone created it by hand
- A seed that fails or duplicates on its second run
- A seed password, a saved session, or a bypass secret committed
- A verification step that needs a person to type a password into a login page
- Smoke specs pointed at a protected preview without the bypass header
- Screenshots produced and never looked at
- Production smoke specs that create data
