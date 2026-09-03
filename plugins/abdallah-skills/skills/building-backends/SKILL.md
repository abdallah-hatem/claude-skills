---
name: building-backends
description: Use when building or changing any backend API — NestJS controllers, services, modules, DTOs, Prisma schema or queries, auth guards, pagination, or error handling — and when scaffolding a new backend or adding an endpoint.
---

# Building Backends

Abdallah's NestJS conventions. Every endpoint ships validated, envelope-wrapped, scoped to the caller, and paginated when it returns a list — or it isn't finished.

## Stack

| Concern | Choice |
|---|---|
| Framework | NestJS |
| Language | TypeScript, `strict` |
| ORM | Prisma |
| Auth | Passport JWT (`@nestjs/passport` + `passport-jwt`) |
| Validation | `class-validator` DTOs + global `ValidationPipe` — see [dtos.md](dtos.md) |
| Response shape | global `ResponseInterceptor` — see [response-envelope.md](response-envelope.md) |
| Errors | global `AllExceptionsFilter` — same file |
| Data access | `BaseRepository` per model — see [repository-layer.md](repository-layer.md) |
| Tests | Jest + supertest — see [testing.md](testing.md) |
| Config | `@nestjs/config`, `isGlobal: true` |
| Local infra | Docker Compose at the repo root — see [docker.md](docker.md) |
| Schema | Prisma — see [data-model.md](data-model.md) |

**The existing project's stack always wins.** In a repo that already picked TypeORM, Express, or a flat module layout, follow the repo. This table is for new backends and for gaps an existing one hasn't filled.

## Structure

```
src/
  domains/<feature>/
    <feature>.controller.ts     route, DTO, guard, delegate — no Prisma, no rules
    <feature>.service.ts        business rules — returns data, never touches res
    <feature>.module.ts
    dto/                        request contracts        → dtos.md
    interfaces/                 I<Domain>Repository + external service shapes
    repositories/               every Prisma call, extends BaseRepository
  common/
    interceptors/  decorators/  pipes/  utils/  interfaces/
    repositories/base.repository.ts
  database/                     DatabaseService (Prisma)
```

A controller importing Prisma has skipped two layers. A service querying Prisma directly is
fine until a second caller needs the same query — then it becomes a repository method.

**No `entities/` folder.** Prisma generates the row types; a hand-written mirror is a second
definition nothing checks, and it drifts — a field the schema made nullable stays required in
the copy. Import from `@prisma/client`. See [repository-layer.md](repository-layer.md).

## Bootstrap

`main.ts` — `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })` and CORS.

`app.module.ts` — three global providers: `APP_INTERCEPTOR` → `ResponseInterceptor`, `APP_FILTER` → `AllExceptionsFilter`, `APP_GUARD` → `JwtAuthGuard`.

Both files in [response-envelope.md](response-envelope.md).

## Validation

Every body, query, and param gets a DTO with `class-validator` decorators — never `any`, a
bare interface, or a Prisma model; an interface has no runtime existence, so the pipe checks
nothing. An *undecorated* property is stripped just as silently, so decorate every field.

Update DTOs derive (`PartialType(CreateXDto)`). Query DTOs need `@Type(() => Number)`. Nested
objects need `@ValidateNested()` **and** `@Type()`. No `userId`/`tenantId` in a create DTO —
ownership comes from the token.

See [dtos.md](dtos.md).

## Auth

**Guard globally, open explicitly.** `JwtAuthGuard` as `APP_GUARD`; `@Public()` marks the exceptions. A new endpoint is protected by default — forgetting the decorator fails closed.

**Never decide ownership from the request body or params.** Read the user off the token (`@GetUser()`) and scope the query by it. An `id` in the payload is a claim by the caller, not a fact.

Roles via `@Roles()` + `RolesGuard`.

## Pagination

Any endpoint returning a list is paginated. `BaseRepository.findAllWithPagination` caps `limit` at 20 and returns `{ data, total, page, limit, hasNextPage, hasPreviousPage }` — which is exactly the envelope's `meta`.

## Errors

Throw Nest exceptions — `NotFoundException`, `ConflictException`, `ForbiddenException`. The filter turns them into the envelope.

Never hand-build a `{ success: false }` object in a service, and never let a raw Prisma error or internal message reach the client — the filter maps known Prisma codes and hides everything else in production.

## Testing

Unit specs beside the code with every collaborator mocked; e2e in `test/` against a
**dedicated** database. Pure logic moves to `<feature>.pure.ts` and is tested with no mocks.

Build services with a `makeService(overrides)` factory — don't boot `Test.createTestingModule`
for an object `new` would give you. Every endpoint taking an id needs a cross-user isolation
test; that is the bug class that leaks data and never shows up in manual testing.

See [testing.md](testing.md).

## Data

PascalCase models, camelCase fields, `@map` to snake_case. UUID keys, money as `Decimal`, an
index on every foreign key and filtered column. `migrate dev` locally, `migrate deploy` in CI
— never edit an applied migration.

Multi-row writes that would be wrong half-applied go in `$transaction`, using the `tx` client
throughout. **`select` explicitly on anything reaching a response** — a bare `findUnique` on a
user returns the password hash, and every column added later joins the API for free.

See [data-model.md](data-model.md).

## Multi-tenancy

Only where rows are tenant-owned, and one model per project: repository filtering, or RLS.
RLS is stronger — a forgotten filter returns nothing rather than everything.

Context is applied with `SET LOCAL` inside a transaction via `withTenant`; plain `SET`
persists on a pooled connection and leaks the previous tenant's context into the next request.
The tenant comes from the token, never a header, param, or body. A new tenant table needs its
column, policy, index, and isolation test in the same change — and `force row level security`,
or the owning role bypasses every policy.

See [multi-tenancy.md](multi-tenancy.md).

## Config

`ConfigModule.forRoot({ isGlobal: true })`. Read config through `ConfigService`, not scattered
`process.env` lookups, and fail at boot on a missing required variable — not on the first
request that needs it. Secrets live in env, never in code or the schema.

## Local infra and Docker

`docker-compose.yml` at the **repo root**, host Postgres port offset per project (never 5432),
containers and volumes named. Inline `DATABASE_URL` in every db script — an ambient one points
`migrate` at the wrong database. e2e gets its own database; teardown deletes rows.

Production is multi-stage: `npm ci`, a pruned dependency stage so devDependencies never ship,
`USER node`, `.dockerignore` before the first build. Migrations run as a release step, not in
`CMD` — every replica would race on start.

See [docker.md](docker.md).

## Red flags

**Layering** — Prisma in a controller · `res.status().json()` in a controller · an `entities/`
folder mirroring a Prisma model · a raw client call outside a repository.

**Input** — a body/query/param with no DTO · an undecorated DTO property (`whitelist` strips
it) · a hand-written update DTO instead of `PartialType` · `userId`/`tenantId` accepted in a
create DTO · a query number without `@Type(() => Number)` · `@ValidateNested()` with no
`@Type()` · a `limit` `@Max` disagreeing with the repository cap.

**Output** — a hand-built `{ success: false }` instead of a thrown exception · a bare
`findUnique`/`findMany` whose result reaches a response.

**Auth** — a new endpoint with neither guard nor `@Public()` · ownership resolved from a
body/param id · a token read in client-facing code.

**Data** — a list endpoint with no pagination · a multi-row write with no `$transaction`, or
`this.prisma` used inside one · an edited migration already applied · money as `Float` · a
foreign key or filtered column with no index.

**Tenancy** — `tenantId` from a header/param/body · plain `SET` where `SET LOCAL` is required
· `enable row level security` without `force` when the app owns the table · an UPDATE/DELETE
policy with no SELECT policy · a view with no `security_invoker` · an elevated client injected
into a tenant-scoped service · a new tenant table missing its policy, index, or isolation test.

**Tests** — a bug fixed without the test that reproduces it · an id endpoint with no
cross-user isolation test · an isolation test that only checks the allowed case · e2e pointed
at the dev database · tests parallel against one database.

**Infra** — a secret or connection string in code · a db script on an ambient `DATABASE_URL` ·
host 5432 bound in compose · `npm install` in a Dockerfile · the build stage's `node_modules`
copied into runtime · a container running as root · `migrate deploy` in `CMD` on a
multi-replica deploy · no `.dockerignore`.
