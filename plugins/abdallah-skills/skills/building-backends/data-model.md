# Schema, migrations, transactions

## Schema conventions

PascalCase models, camelCase fields in Prisma; snake_case in the database via `@map`. The
code reads as TypeScript, the database reads as SQL, and neither side compromises.

```prisma
model User {
  id           String   @id @default(uuid()) @db.Uuid
  email        String   @unique
  passwordHash String   @map("password_hash")
  createdAt    DateTime @default(now()) @map("created_at")

  profile      Profile?
  bookings     Booking[]

  @@map("users")
}
```

- **UUID primary keys**, `@db.Uuid` — never a serial int on anything a client can see.
  A sequential id leaks row counts and invites enumeration.
- **Money is `Decimal`**, never `Float`: `@db.Decimal(14, 2)`. Floating point loses cents.
- **Index every foreign key and every column a filter uses.** Prisma indexes `@unique` and
  `@id` only; a `where: { userId }` on an unindexed column is a sequential scan.
- **Timestamps on every table** — `createdAt`, and `updatedAt @updatedAt` on anything mutable.
- **Enums in the schema**, not strings validated in code, when the set is closed and known.

A schema introspected from an existing database (`prisma db pull`) keeps that database's
snake_case model names. Don't rename it to match this — follow the repo.

## Migrations

```bash
npx prisma migrate dev --name add_booking_status   # local: generate + apply
npx prisma migrate deploy                          # CI/prod: apply only, never generate
npx prisma generate                                # after any schema change
```

- **Never edit a migration that has been applied anywhere but your machine.** The checksum
  is recorded; editing it makes every other environment's history diverge. Write a new one.
- **Never `migrate reset` against a database with real data.** It drops everything.
- **`migrate deploy` in CI and production** — `migrate dev` can prompt, and can decide to
  reset.
- **Review the generated SQL before committing.** A rename Prisma cannot detect becomes a
  drop plus an add, which is silent data loss.
- **Adding a required column to a populated table needs a default or a backfill**, in that
  order: add nullable → backfill → make required.

## Transactions

Any operation that writes more than one row, where a partial result would be wrong, runs in
`$transaction`. A create-plus-decrement that half-applies leaves data no code path expects.

```ts
// Both rows, or neither.
return this.prisma.$transaction(async (tx) => {
  const booking = await tx.booking.create({ data: { userId, slotId } })
  await tx.slot.update({ where: { id: slotId }, data: { taken: true } })
  return booking
})
```

Needs one when: a create writes a row plus a related row · a balance moves between records ·
a write is paired with an audit or ledger entry · a status change fans out to dependents.

Doesn't need one for a single `create`, `update`, or `delete` — those are already atomic.

- **Keep transactions short.** No HTTP calls, no AI calls, no waiting on anything external
  inside one — it holds a connection from the pool the whole time.
- **Use the `tx` client inside, never `this.prisma`.** A call on the outer client runs
  outside the transaction and will not roll back.
- **Read-modify-write needs the read inside the transaction**, or two concurrent requests
  both read the old value.

## Never leak fields outbound

Prisma returns the whole row by default, so a `findUnique` on a user hands the password hash
to the controller — and the interceptor will happily serialize it.

```ts
// ✗ returns passwordHash, and every column added later
return this.prisma.user.findUnique({ where: { id } })

// ✓ the response shape is explicit and stays that way
return this.prisma.user.findUnique({
  where: { id },
  select: { id: true, email: true, createdAt: true, profile: { select: { name: true } } },
})
```

- **`select` on anything that reaches a response.** Not `omit`, not deleting keys afterward —
  those fail open when a column is added.
- **`select` over `include`** for relations, so a nested object doesn't drag its own secrets.
- **A column added to the schema must not silently appear in an API response.** Explicit
  `select` is what guarantees that.
