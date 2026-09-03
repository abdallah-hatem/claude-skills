# Multi-tenancy

Only for projects where rows belong to a tenant. Two ways to enforce it, and they are not
interchangeable — pick one per project and never mix them in the same table.

| Model | Enforced by | Use when |
|---|---|---|
| **Application scoping** | every repository filters by `tenantId` | simple apps, single-tenant-per-user |
| **RLS** | Postgres policies read a session variable | the isolation boundary must not depend on remembering a `where` clause |

RLS is the stronger choice: a forgotten filter returns nothing instead of everything.

## RLS: session context per transaction

Postgres policies read `app.tenant_id` from the session. The context is set with
**`SET LOCAL` inside a transaction** — never plain `SET`.

```ts
export interface TenantContext {
  tenantId: string
  userId?: string
  appRole?: 'owner' | 'manager'
  branchIds?: string[]
  permissions?: Record<string, string>
}

/**
 * Runs `fn` in a transaction with the tenant context applied, so RLS can see it.
 *
 * SET LOCAL is scoped to the transaction and reverts on commit or rollback, which is
 * what keeps context from leaking across a pooled connection. Plain SET persists on
 * the connection and leaks into the next request -- never use it here.
 *
 * SET LOCAL takes no bind parameters, so every value is interpolated. Validation is
 * therefore the only thing between this and SQL injection: uuids are format-checked
 * and permissions go through JSON.
 */
export async function withTenant<T>(
  prisma: PrismaService,
  context: string | TenantContext,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const ctx: TenantContext = typeof context === 'string' ? { tenantId: context } : context

  const settings: string[] = []
  settings.push(`set local app.tenant_id = '${assertUuid(ctx.tenantId, 'tenantId')}'`)

  if (ctx.userId) settings.push(`set local app.user_id = '${assertUuid(ctx.userId, 'userId')}'`)
  if (ctx.appRole) {
    if (ctx.appRole !== 'owner' && ctx.appRole !== 'manager') {
      throw new Error(`appRole must be owner or manager, got: ${ctx.appRole as string}`)
    }
    settings.push(`set local app.app_role = '${ctx.appRole}'`)
  }
  if (ctx.branchIds?.length) {
    const ids = ctx.branchIds.map((id) => assertUuid(id, 'branchId')).join(',')
    settings.push(`set local app.branch_ids = '${ids}'`)
  }
  if (ctx.permissions) {
    // Single quotes are the only character that could break out of the literal.
    const json = JSON.stringify(ctx.permissions).replace(/'/g, "''")
    settings.push(`set local app.permissions = '${json}'`)
  }

  return prisma.$transaction(async (tx) => {
    for (const stmt of settings) await tx.$executeRawUnsafe(stmt)
    return fn(tx)
  })
}
```

**Three things here are load-bearing, and each is a vulnerability if changed:**

1. **`SET LOCAL`, not `SET`.** Plain `SET` outlives the request on a pooled connection — the
   next request inherits the previous tenant's context and reads their rows.
2. **Every interpolated value is validated.** `SET LOCAL` accepts no bind parameters, so the
   uuid regex and the role check are the injection defense, not a formality.
3. **Everything runs inside the transaction.** A query on the outer client sees no context,
   so RLS denies it — which is the safe direction, but it will look like a mystery empty result.

## Deriving the context

Claims → context, throwing rather than degrading:

```ts
/**
 * Throws rather than silently producing an unscoped context -- a missing
 * tenant must never degrade into "see everything".
 */
export function scopeOf(claims: AppClaims): TenantContext {
  if (!claims?.tenantId) throw new ForbiddenException('No tenant access')
  return {
    tenantId: claims.tenantId,
    userId: claims.userId,
    appRole: claims.appRole ?? undefined,
    branchIds: claims.branchIds,
    permissions: claims.permissions,
  }
}
```

The tenant comes from the **token**, never from a header, a query param, or a body field. A
client-supplied `tenantId` is a request to read someone else's data.

## The elevated client

A few paths legitimately run before any tenant exists — building claims at login, platform
admin operations, push delivery. They get a separate client on a separate connection string,
behind a symbol so it cannot be injected by accident.

```ts
export const ELEVATED_PRISMA = Symbol('ELEVATED_PRISMA')

export const elevatedPrismaProvider: Provider = {
  provide: ELEVATED_PRISMA,
  useFactory: () =>
    new PrismaClient({
      datasources: {
        db: { url: process.env.ELEVATED_DATABASE_URL ?? process.env.MIGRATE_DATABASE_URL },
      },
    }),
}
```

**Never inject `ELEVATED_PRISMA` into a tenant-scoped service.** Every use is a place where
the database has stopped enforcing isolation and the code must. Each one is worth a comment
saying why it is safe.

## Postgres traps that silently disable RLS

These are Postgres behaviours, not Supabase ones — they apply to any RLS setup, and each
fails **open** or fails **invisibly**.

**1. The table owner bypasses its own policies.** RLS is not enforced for the role that owns
the table unless you say so. If migrations and runtime use the same Postgres user, every
policy you wrote is inert in production and nothing warns you.

```sql
alter table bookings enable row level security;
alter table bookings force  row level security;   -- applies to the owner too
```

Better still, keep the roles separate: migrations run as the owner, the app connects as a
non-owning role that policies actually bind.

**2. UPDATE and DELETE need a SELECT policy.** Postgres must read a row before changing it.
With an UPDATE policy but no SELECT policy the statement matches nothing — no error, just
zero rows. Through Prisma that surfaces as `updateMany` returning `{ count: 0 }`, or
`update` throwing `P2025`, which the exception filter maps to **404 Resource not found**. A
missing policy therefore looks exactly like a missing record.

**3. Views bypass RLS by default.** A view runs with its definer's privileges, so a reporting
or analytics view over a tenant table returns every tenant's rows. Postgres 15+:

```sql
create view booking_totals with (security_invoker = true) as
  select tenant_id, count(*) from bookings group by tenant_id;
```

On older versions, revoke access from the app role and keep the view in an unexposed schema.

**Test the negative case, not the positive one.** A policy that lets the right tenant through
proves nothing — that also happens when RLS is off entirely. The test that matters is tenant
B querying tenant A's row and getting nothing.

## Every new table

A table holding tenant data needs, together, in the same change:

1. A `tenantId` column
2. An RLS policy keyed on `app.tenant_id`
3. An index on `tenantId`
4. An isolation test — tenant B queries tenant A's row and gets nothing

The test is not optional. RLS that was never exercised is a policy nobody has confirmed is
switched on.

## Red flags

- Plain `SET` instead of `SET LOCAL`
- An interpolated value that was not format-validated first
- `tenantId` read from a header, param, or body
- `ELEVATED_PRISMA` in a tenant-scoped service
- A new tenant table with no policy, no index, or no isolation test
- A query on the outer client inside a `withTenant` block — it sees no context
- `enable row level security` without `force` when the app connects as the table owner
- An UPDATE or DELETE policy with no matching SELECT policy — silently affects zero rows
- A view over a tenant table without `security_invoker = true`
- An isolation test that only checks the *allowed* case
