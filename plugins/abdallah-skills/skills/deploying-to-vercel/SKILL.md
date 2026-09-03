---
name: deploying-to-vercel
description: Use when deploying a NestJS, Express or Next.js app to Vercel — especially a monorepo, or one using Prisma with Neon/Postgres, file uploads, or scheduled jobs. Also use when a Vercel deployment reports Ready but every request 500s, when requests hang for 30-60s with nothing in the logs, or when a frontend keeps calling localhost after the env var was fixed.
---

# Deploying to Vercel

## Overview

Vercel's build step proves the code compiled. It proves nothing about whether it runs.
Most of the expensive failures here share one shape: **the dashboard is green and the app
is dead**, so you go looking in your own code for a bug that is in the platform contract.

This skill covers only what is not obvious. Things a competent agent already gets right —
Root Directory per project in a monorepo, `NEXT_PUBLIC_*` baking in at build time, local
disk not surviving a deploy, Hobby cron limits — are listed once in Quick Reference and not
explained.

## Ready in the dashboard, 500 on every request

Check these in order. The first two produce an identical symptom and are invisible at build
time.

### 1. ERR_REQUIRE_ESM — the most likely cause, and the easiest to miss

```
ERR_REQUIRE_ESM: require() of ES Module .../node_modules/<pkg>/dist/index.js
  from /var/task/src/app.module.js not supported
```

A dependency shipped `"type": "module"`, the TypeScript build emits CommonJS, and the
`require` throws at runtime. Locally `ts-node` or the dev server resolves the ESM build and
everything works, so this appears **only** on the deployed host. The build passes, the
deployment reports Ready, and every single request 500s.

Audit before deploying rather than after the second outage:

```bash
# Which dependencies are ESM-only?
for d in $(node -p "Object.keys(require('./package.json').dependencies).join(' ')"); do
  t=$(node -p "try{require('./node_modules/$d/package.json').type||'commonjs'}catch(e){'?'}")
  [ "$t" = "module" ] && echo "  $d is ESM-only"
done
```

`"type": "module"` alone is not proof of breakage — a package with an `exports` map that
offers a CommonJS build under the `require` condition is fine. **Check by requiring it, not
by reading the field:**

```bash
node -e "require('@vercel/blob'); console.log('requires cleanly')"
```

Fixes, in order of preference: replace it with a built-in (`randomUUID` from `node:crypto`
instead of `uuid`), pin to the last CommonJS major, or switch the build to ESM — the last
is the largest change and rarely worth it for one dependency.

### 2. Prisma client not generated, or wrong engine

`PrismaClientInitializationError`, or "Query engine library for current platform not
found". The build must run `prisma generate` explicitly; a monorepo install can skip the
postinstall hook.

```json
{ "buildCommand": "npx prisma generate && npm run build" }
```

### 3. Env var set for the wrong environment

Vercel scopes each variable to Production / Preview / Development **separately**. A value
added to Development only is absent in production and the failure is a null-reference deep
in a service. `vercel env ls` from the app directory shows the scope.

**Diagnosis for all of the above:** the deployment's **Runtime Logs**, not the build log.
If a failing request produces no log line from your own code, it never reached your handler.

## NestJS needs no serverless adapter

**Do not write a `@vendia/serverless-express` wrapper, a `api/index.ts` handler, or a
`vercel.json` rewrite to a single function.** Vercel has a first-party `nestjs` framework
preset. `main.ts` keeps `app.listen(process.env.PORT ?? 3000)` exactly as it is locally, and
the same file serves both environments.

This is worth stating flatly because the adapter pattern is all over older blog posts and is
the default thing to reach for. It adds a second entry point, a second bootstrap path, and a
class of body-parsing and multipart bugs that the preset does not have.

## Requests that hang instead of failing

Symptom: the same endpoint answers in 1.5s, then takes 60s. Nothing in the API log, because
the request never reached a handler — it is queued waiting for a database connection.

Prisma's default pool is `cpus * 2 + 1`, sized for one long-lived server. On a serverless
host every concurrent request can be its own instance with its own pool, so a handful of
cold functions each claim nine connections and exhaust what the database allows. The next
request does not fail. **It waits**, which from a browser is a spinner that never resolves
and from the dashboard is a green deployment.

```ts
// PrismaService — one connection per instance, and refuse rather than hang.
function serverlessUrl(url: string): string {
  if (!process.env.VERCEL) return url;           // local default pool is correct
  const u = new URL(url);
  u.searchParams.set('connection_limit', '1');
  u.searchParams.set('pool_timeout', '20');
  return u.toString();
}
```

`pool_timeout` is the half that is usually forgotten, and it is the half that turns an
unbounded hang into a fast, visible refusal.

Also instantiate `PrismaClient` once at module scope, never per request.

**This combines with Neon's pooler rather than replacing it.** `vercel integration add neon`
sets `DATABASE_URL` to the **pooled** endpoint already, and `DATABASE_URL_UNPOOLED` beside
it. Neon's pooler caps connections *at the database*; `connection_limit` caps them *per
function instance*. Both are needed — the pooled URL alone still lets each instance open
nine connections and queue behind them. Use the unpooled URL for migrations only, where
advisory locks matter.

## Provisioning from the CLI

Both of these create the resource, attach it to the linked project, and write the
environment variables themselves — no credential is ever typed or pasted.

```bash
cd apps/api
vercel link --yes --project <name> --scope <team-or-personal-scope>

vercel integration add neon              # provisions + connects, sets DATABASE_URL (+ ~18 more)
vercel blob create-store <name> --access private --yes   # sets BLOB_READ_WRITE_TOKEN
```

Blob is **first-party**, not a marketplace integration — `vercel integration add blob`
fails with "No integration found". It lives under `vercel blob`.

`--scope` is not optional in a multi-team account, and the CLI's suggested default may be
the wrong team. Check where sibling projects live first: `vercel projects ls`.

Each app is linked separately from its own directory and gets its own `.vercel/`, its own
environment variables and its own Root Directory. Nothing is shared between them — including
the variables you assume you already set.

### Choosing Blob access

`--access private` whenever the store holds anything a user uploaded. A public store hands
out a URL that works forever for anyone who sees it, which silently defeats whatever
authentication the app puts in front of those files.

Private reads have a different API shape than the docs' public examples suggest:

```ts
// `access` is required and is NOT inferred from the store — passing it wrong
// fails against a store that holds the object perfectly well.
const result = await get(objectKey, { access: 'private' });
if (!result || result.statusCode !== 200 || !result.stream) throw new Error('not found');

// It returns { statusCode, stream, blob } — NOT a Response. There is no
// `.arrayBuffer()` on it.
const chunks: Uint8Array[] = [];
const reader = result.stream.getReader();
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  if (value) chunks.push(value);
}
return Buffer.concat(chunks);
```

Writing is the ordinary shape, with one flag that matters:

```ts
// `addRandomSuffix: false` — the default appends characters to the pathname, so the
// URL stops matching the key stored in the database. `allowOverwrite` because
// re-uploading a processed size must replace it rather than fail.
await put(objectKey, bytes, { access: 'private', addRandomSuffix: false, allowOverwrite: true });
```

Verify privacy is real rather than assumed — fetch the blob's own URL unauthenticated and
require a 401/403.

**Put both behind one interface before deploying**, not after. `put` / `get` / `delete` with
a local-disk implementation and a blob implementation, chosen by whether
`BLOB_READ_WRITE_TOKEN` is set — by the token rather than by `NODE_ENV`, so the app follows
what it was actually given. Object keys stay identical across both, so a database written by
one is readable by the other. Deciding this at deploy time means rewriting every call site
that touches an image.

## Scheduled jobs

An in-process scheduler (`@nestjs/schedule`'s `@Cron`, `node-cron`, `setInterval`) needs a
process that survives between ticks. A serverless function exists for one request. The
decorator registers a job that never fires, **nothing errors, and nothing logs** — the work
simply stops happening.

Move the schedule to the platform and expose the same method over HTTP:

```json
{ "crons": [{ "path": "/api/v1/jobs/sweep", "schedule": "0 3 * * *" }] }
```

Keep the decorator too if the app also runs on a host with a real process; a well-written
sweep is idempotent.

**Hobby allows two cron jobs, once a day, and the build rejects anything finer.** If the
cadence is load-bearing, the endpoint is plain authenticated HTTP — anything can call it. A
GitHub Actions `schedule` with a `curl` step is free and runs every few minutes. Before
reaching for that, check whether the cadence is truly load-bearing: often the sweep is
housekeeping and the real rule is enforced on read (a query that ignores expired rows is
correct between sweeps), in which case daily is fine and only the *warning* half degrades.
State which half degrades rather than glossing it.

**Guard the endpoint, including when the secret is absent.** Vercel sends
`Authorization: Bearer $CRON_SECRET`. A deployment that forgot to set it would otherwise
leave a public endpoint that mutates data:

```ts
const expected = process.env.CRON_SECRET;
if (!expected) throw unauthorized('CRON_NOT_CONFIGURED', '...');   // refuse, do not run
if (authorization !== `Bearer ${expected}`) throw unauthorized('CRON_FORBIDDEN', '...');
```

## Migrations

Keep `prisma migrate deploy` **out** of the build command. `generate` is safe to repeat;
applying migrations is not something a build should do to a live database unasked, and
concurrent preview builds will race each other. Run it deliberately, against the unpooled
URL:

```bash
DATABASE_URL="<unpooled Neon URL>" npx prisma migrate deploy
```

## When the CLI cannot upload

`vercel deploy` failing with `fetch failed` / `ENETUNREACH <ip>:443` while `api.vercel.com`
answers curl fine means the network blocks the upload host specifically. Do not spend time
on it — connect the project to GitHub in the dashboard and deploy by pushing. That is a
better default anyway: builds become reproducible from a commit rather than from one
machine's working tree.

## Quick Reference

| Trap | What happens | Fix |
|---|---|---|
| ESM-only dependency | Ready, then 500 on every request | Audit `"type": "module"`, verify by requiring |
| NestJS adapter | Wasted work, new bugs | Native `nestjs` preset, keep `app.listen()` |
| Prisma default pool | Requests hang 60s, no logs | `connection_limit=1&pool_timeout=20` when `VERCEL` |
| `vercel redeploy` | Reuses build artifacts — new env vars **not** picked up | `vercel deploy --prod`, or push |
| `vercel link` | Appends bare `.env*` to `.gitignore`, swallowing `.env.example` | Add `!.env.example` |
| Blob public by default | User uploads readable by URL forever | `--access private`, verify with an anonymous fetch |
| Cron on Hobby | Build rejects sub-daily schedules | Daily, or Pro |
| Root Directory unset | Builds from repo root, fails | Set per project |
| `NEXT_PUBLIC_*` | Baked in at build time | Set before building; changing it needs a rebuild |
| Local disk writes | Gone on next deploy | Object storage behind an adapter interface |

## Common Mistakes

- **Believing the dashboard.** Ready means compiled. Always hit a real endpoint before
  reporting success, and read Runtime Logs rather than the build log.
- **Reading `.env` to learn what production does.** Local `.env` says nothing about a
  deployment. `vercel env ls` from the app directory is the source of truth, and `.vercel/`
  is per-app — checking one app proves nothing about its siblings.
- **Fixing env vars with `vercel redeploy`.** It reuses artifacts. The variable changes and
  the behaviour does not, which reads as the variable being ignored.
- **Testing a frontend before the API has a stable URL.** Deploy the API first, then set
  `NEXT_PUBLIC_API_URL`, then build the frontends — or point them at a custom domain from
  the start so a later API redeploy never requires rebuilding them.
