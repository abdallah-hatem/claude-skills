# Testing

Two tiers, different rules. Unit specs sit next to the code and mock everything; e2e specs
live in `test/` and run against a real database.

```
src/ingest/ingest.pure.ts          pure functions, no I/O
src/ingest/ingest.pure.spec.ts     ← colocated, no DB, no network
src/ingest/ingest.service.spec.ts  ← service with every collaborator mocked
test/ingest.e2e-spec.ts            ← real HTTP, real DB
test/helpers.ts                    ← shared e2e harness
```

## Extract the pure part

Logic that doesn't need I/O — parsing, matching, dedupe keys, date maths, money rules —
moves into `<feature>.pure.ts` and gets tested there. Those tests are instant, need no
mocks, and are where edge cases belong.

What's left in the service is orchestration, which is what the service spec covers.

## Service specs: construct directly, don't boot Nest

`Test.createTestingModule` boots a DI container to hand you an object you could have built
with `new`. Skip it. Build the service with a factory that supplies working defaults and
lets a test override just the collaborator it cares about:

```ts
function makeService(
  overrides: Partial<Record<'prisma' | 'ai' | 'tokens', Record<string, any>>> = {},
) {
  const prisma = {
    transactions: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({ id: 'txn-1' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    ...overrides.prisma,
  }
  const ai = {
    isConfigured: jest.fn().mockReturnValue(true),
    categorizeSingle: jest.fn().mockResolvedValue(SAMPLE_PARSED),
    ...overrides.ai,
  }
  const tokens = {
    lookupUserId: jest.fn().mockResolvedValue('user-1'),
    ...overrides.tokens,
  }

  const svc = new IngestService(prisma as any, ai as any, tokens as any)
  return { svc, prisma, ai, tokens }   // return the mocks so tests can assert on them
}
```

Every default is the happy path, so a test only states what it changes:

```ts
it('rejects an unknown token → 401', async () => {
  const { svc } = makeService({ tokens: { lookupUserId: jest.fn().mockResolvedValue(null) } })
  await expect(svc.ingestSms({ token: 'nope', body: 'x' })).rejects.toThrow(UnauthorizedException)
})
```

Mock with plain objects of `jest.fn()`. Don't reach for `jest.mock()` module mocking — it
hides which collaborator a test actually depends on.

**Assert on thrown exception types**, not on status numbers: `rejects.toThrow(NotFoundException)`.
The filter owns the mapping to HTTP, and it is tested once.

## e2e specs: real HTTP, real DB

A dedicated database on its own port — never the dev DB, never a shared one.

```ts
// test/helpers.ts
export const db = new PrismaClient({
  datasources: { db: { url: 'postgresql://postgres:postgres@localhost:5434/<app>?schema=public' } },
})

let seq = 0
export const uniqueEmail = (label: string) => `${label}-${Date.now()}-${seq++}@test.local`

export const http = (app: INestApplication) => request(app.getHttpServer())
export const auth = (token: string) => ({ Authorization: `Bearer ${token}` })

export async function registerAndLogin(app: INestApplication, email: string, password = 'password123') {
  const res = await http(app).post('/auth/register').send({ email, password }).expect(201)
  return { accessToken: res.body.accessToken as string, user: res.body.user }
}

export async function dropUsers(emails: string[]) {
  await db.users.deleteMany({ where: { email: { in: emails } } })
}
```

`uniqueEmail` is timestamp **plus** a counter — `Date.now()` alone collides when two
registrations land in the same millisecond.

Each spec seeds what it needs and drops it in `afterAll`. No global truncate: a shared
teardown makes every spec depend on every other one's cleanup.

## Serial, always

e2e specs share one database, so they cannot run in parallel:

```json
"scripts": { "test": "jest --runInBand", "test:watch": "jest --watch" },
"jest": { "testTimeout": 30000, "maxWorkers": 1, "testRegex": ".*\\.(spec|e2e-spec)\\.ts$" }
```

## What must have a test

- **Cross-user isolation.** For every endpoint that takes an id, a test where user B asks for
  user A's row and gets 403/404. This is the bug class that leaks data, and it is invisible
  in single-user manual testing.
- **The auth boundary** — no token, expired token, wrong role.
- **Every branch of a pure function**, in its `.pure.spec.ts`.
- **Validation rejection** — a request missing a required field, and one carrying an
  unexpected field (`forbidNonWhitelisted` makes that a 400).
- **The envelope**, once — that a success is `{ success: true, data }` and a thrown
  exception comes back `{ success: false, error }`.

## Use real fixtures

Copy an actual payload — a real SMS body, a real webhook, the real Arabic string with its
diacritics. Synthetic `"test123"` data passes tests that production input would fail. When a
bug is found, its input becomes a fixture.

## Rules

- A bug fix ships with the test that reproduces it. No test, no fix.
- Never assert on a Prisma call's shape when you can assert on the returned value — mock
  assertions couple the test to the implementation.
- Never point an e2e run at the dev database. The teardown deletes rows.
- A spec that needs `Test.createTestingModule` is usually a spec that should be e2e.
