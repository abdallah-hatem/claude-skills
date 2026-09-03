# Docker: local, test, production

## Local: compose at the repo root

One `docker-compose.yml` above `api/`, not inside it — the infra serves the whole project
(`api/` + `app/`), not just the backend.

```yaml
# Local infrastructure for <project>.
# Ports are offset from <other-project> (5433 / 1080) so both can run side by side.
services:
  db:
    image: postgres:16
    container_name: <project>_db
    environment:
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: <project>
    ports: ['5434:5432']
    volumes:
      - <project>_pgdata:/var/lib/postgresql/data

  # Local SMTP catcher — verification email really sends, and lands here
  # instead of the internet.
  mail:
    image: maildev/maildev:2.1.0
    container_name: <project>_mail
    environment:
      MAILDEV_INCOMING_USER: ""
      MAILDEV_INCOMING_PASS: ""
    ports:
      - '1081:1080'   # web inbox
      - '1026:1025'   # smtp

volumes:
  <project>_pgdata:
```

**Offset the host port per project, and never bind 5432.** Several backends run at once, and
5432 is whatever Postgres the machine already has. Before picking, check what is already
taken:

```bash
docker ps --format '{{.Names}}\t{{.Ports}}'          # running containers
grep -rh -A2 'ports:' ~/**/docker-compose.y*ml       # every project's claim
```

Take the next free port above 5432 and **record the choice in the compose comment**, so the
next project can see it without starting this one.

**Name the container and the volume.** Unnamed volumes accumulate as anonymous blobs, and
`docker compose down -v` in the wrong directory takes the wrong data.

## Inline `DATABASE_URL` in every db script

Never rely on an ambient `DATABASE_URL` for a Prisma command. An exported variable from
another project silently points `migrate` at the wrong database.

```json
{
  "scripts": {
    "migrate":        "DATABASE_URL=\"postgresql://postgres:postgres@localhost:5434/app?schema=public\" prisma migrate dev",
    "migrate:create": "DATABASE_URL=\"...\" prisma migrate dev --create-only",
    "generate":       "DATABASE_URL=\"...\" prisma generate",
    "seed":           "DATABASE_URL=\"...\" ts-node prisma/seed.ts"
  }
}
```

## Test: a separate database, same container

e2e teardown **deletes rows**. Pointing it at the dev database means a test run wipes the
data you were developing against.

Use a second database inside the same Postgres container — no extra service, no extra port:

```bash
docker compose exec db psql -U postgres -c 'CREATE DATABASE app_test;'
```

```json
{
  "scripts": {
    "test:e2e": "DATABASE_URL=\"postgresql://postgres:postgres@localhost:5434/app_test?schema=public\" jest --runInBand --config test/jest-e2e.json",
    "test:e2e:setup": "DATABASE_URL=\"postgresql://postgres:postgres@localhost:5434/app_test?schema=public\" prisma migrate deploy"
  }
}
```

`test/helpers.ts` then points at `app_test`, and `migrate deploy` (not `dev`) brings its
schema up before a run.

**The test database name must differ from the dev one.** A shared name is the whole hazard —
teardown cannot tell them apart.

## Production: multi-stage image

```dockerfile
# ---- build ----
FROM node:20-alpine AS build
WORKDIR /app

# Manifests first: this layer is cached until dependencies actually change.
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

# ---- production dependencies ----
# A separate install so devDependencies (typescript, jest, @types) never
# reach the final image.
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --omit=dev && npx prisma generate

# ---- runtime ----
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package*.json ./

# Don't run as root.
USER node

EXPOSE 3000
CMD ["node", "dist/src/main"]
```

**Three things this fixes** over copying the build stage's `node_modules` wholesale:

- **devDependencies stay out.** `typescript`, `jest`, `@types/*` are build-time only; shipping
  them multiplies image size and attack surface.
- **`npm ci`, not `npm install`.** `ci` installs exactly the lockfile. `install` may resolve
  something new, so the image differs from what was tested.
- **`USER node`.** The default is root, and a container process should not be.

`prisma generate` runs in **both** stages: the build stage needs the types to compile, the
deps stage needs the engine binaries next to the pruned `node_modules`.

`prisma generate` needs `DATABASE_URL` to be *parseable*, not reachable — a placeholder at
build time is legitimate, since nothing connects.

## Migrations are not the container's job

```dockerfile
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main"]   # avoid
```

Every replica runs this on start, so N containers race on deploy. Prisma takes an advisory
lock so it usually survives, but a slow migration then blocks every replica's startup and
a failed one crash-loops the whole service.

Run migrations as a **separate step** — a release command, a pre-deploy job, an init
container — and let the app image only start the app. Keep the combined `CMD` only for a
single-instance deploy where the simplicity is worth it, and know that is what you traded.

## `.dockerignore`

Without it the build context ships `node_modules`, `.git`, and `.env` — slow, and secrets
land in a layer.

```
node_modules
dist
.git
.env
.env.*
*.log
test
coverage
```

## Rules

- **Compose at the repo root**, one per project, with the port offsets in a comment.
- **Never bind host 5432.** Pick the next free offset.
- **Name every container and volume.**
- **Inline `DATABASE_URL` in db scripts** — never trust the ambient one.
- **A separate test database**, never the dev one.
- **`npm ci` everywhere**, never `npm install`, in any image.
- **Never copy the build stage's `node_modules` into the runtime stage.**
- **Never bake secrets into an image.** They arrive as runtime env.
- **`.dockerignore` before the first build**, not after `.env` has shipped.
