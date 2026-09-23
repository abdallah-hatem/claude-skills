# Shipping

Work reaches users by one path: a feature branch, a PR into `dev`, a preview deployment, then a
release PR into `production`. Both PRs are opened by default, and the `dev` PR is merged by
default. **The `production` merge waits for the user** — it is the production deploy — unless the user chose
a fully autonomous run.

```
feature/<name> ──PR──▶ dev ──PR──▶ production
                        │               │
                 Vercel preview   Vercel production
```

## Repository setup — once, before the first task

Git identity and the GitHub account come from the global `CLAUDE.md`. Check `git config user.email`
before the first commit.

`.gitignore` exists **before** the first commit — the repo is public, and anything in the first
commit is public forever:

```gitignore
node_modules
.next
dist
.env*
!.env.example
*.local.md
```

```bash
git init -b production
git check-ignore -q .env.local && git check-ignore -q CREDENTIALS.local.md && echo "secrets ignored"
git add -A && git commit -m "chore: initial commit"
gh repo create <owner>/<app> --public --source . --remote origin --push
git switch -c dev && git push -u origin dev
gh repo edit --default-branch dev
```

- **`dev` is the GitHub default branch**, so new PRs target it without anyone choosing.
- **After setup, nothing is pushed straight to `dev` or `production`.** Everything arrives by PR.

## Branches and commits

Branches are cut from `dev`: `feature/<name>`, `fix/<name>`, `chore/<name>`. Commit messages are
conventional: `feat:`, `fix:`, `refactor:`, `chore:`, `test:`, `docs:`.

## feature → dev (by default)

Once Verify has passed for the branch's tasks:

```bash
git fetch origin
git rebase origin/dev            # pick up whatever landed meanwhile — then re-run the full suite
git push -u origin feature/<name>
gh pr create --base dev --title "feat: <what it does>" --body-file <pr-body.md>
gh pr merge --squash --delete-branch
```

The PR body says what changed and why, the test command with its result, the edge cases covered,
and whether `docs/BUSINESS_LOGIC.md` changed. No credential values.

**Squash into `dev`**: one feature, one commit on `dev`, easy to read and to revert.

After the merge:

- wait for the Vercel preview deployment to be Ready — the PR's deployment check, or `vercel ls`
- run the smoke specs against the preview URL ([verification.md](verification.md)); working locally is not
  the same as working deployed

A broken preview is fixed on a new branch and a new PR — never by pushing to `dev`.

## dev → production (on the user's go-ahead)

When `dev` holds something worth releasing, run the alignment review once over everything since the
last release — it covers the `ui` and `surface` tasks that skipped per-task review — and the
`ui-auditor` over the whole app, with its findings fixed through `dev`; then open the release PR:

```bash
gh pr create --base production --head dev --title "release: <summary>" --body-file <release-body.md>
```

The body lists the features and fixes included, any migrations that will run, and anything the
user should check on the preview first. Then **stop** and wait for the user. On their go-ahead:

```bash
gh pr merge --merge              # a merge commit — never squash
```

In a **fully autonomous** run the go-ahead was given when the run started: merge once the release PR's
checks pass and the preview walk-through has succeeded. An **autonomous-to-preview** run opens the
release PR and ends there.

**Never squash `dev` into `production`.** A squash writes a new commit onto `production` that `dev`
doesn't contain. The next release PR then shows changes that are already live, and the two branches
drift further apart with every release.

## Rollback

Straight after every production deploy, run the read-only smoke specs against production:

```bash
BASE_URL=https://<app>.vercel.app npx playwright test --grep @readonly
```

If they fail, **roll back first and investigate second**:

```bash
vercel rollback <previous-production-deployment-url>     # or Instant Rollback in the dashboard
```

1. **The previous deployment is live again at once.** Users are back on working code before anyone
   starts debugging.
2. **Vercel stops promoting new production deployments automatically after a rollback.** The broken
   commit on `production` won't go live again by accident — but the fix won't either until it is
   promoted.
3. **Fix forward the normal way:** a `fix/<name>` branch, a PR into `dev`, smoke specs on the preview,
   a release PR into `production`. Never push a fix straight to `production` — the branches would
   drift.
4. **Promote the fixed release** once it's merged — `vercel promote <deployment-url>` — which turns
   automatic promotion back on. Then run the production smoke specs again.
5. **A rollback doesn't undo migrations.** The previous deployment runs against the already-migrated
   database, which is why every migration must stay compatible with the code before it (see
   Migrations).

An autonomous run does all of this without stopping, and keeps the failed release under **Blocked**
in the build log until the fix is live.

## Vercel: two environments

Every Vercel project — the web app, and the API when it is deployed separately — has:

| Environment | Branch | Database | URL |
|---|---|---|---|
| Production | `production` | production database | `<app>.vercel.app`, or the custom domain |
| Preview | `dev` | preview database | `<app>-git-dev-<team>.vercel.app` |

- **Set the Production Branch to `production`** — Project Settings → Git. Vercel takes the repo's
  default branch as production, and the default branch here is `dev`, so left alone, every merge
  into `dev` would deploy to production.
- **Every environment variable is set separately for Production and Preview.** A preview variable
  copied from production points the preview at production data.
- **Separate databases.** The preview never reads or writes production data.
- **The preview frontend calls the preview API.** `NEXT_PUBLIC_API_URL` is set per environment and
  baked in at build time — after changing it, rebuild.
- **Preview variables apply to every non-production branch**, feature branches included. Scope them
  to `dev` if feature-branch previews shouldn't touch the preview database.

Provisioning, env-var failures, and ESM/Prisma issues on Vercel: `deploying-to-vercel`.

## Migrations

`prisma migrate deploy` runs deliberately against the environment's **unpooled** database URL,
**before** the merge that deploys code depending on it — never inside the Vercel build command,
where concurrent preview builds race each other.

```bash
DATABASE_URL="<preview unpooled URL>"    npx prisma migrate deploy   # before merging into dev
DATABASE_URL="<production unpooled URL>" npx prisma migrate deploy   # before merging into production
```

The URLs come from `.env.local` or Vercel's settings — not from `CREDENTIALS.local.md`.

A migration that would break the code currently live ships in two releases: the additive change
first, the removal once nothing uses the old shape. Otherwise the gap between migrating and deploying
serves errors.

## Before the first real users

- [ ] Production test accounts removed, or their passwords rotated — `CREDENTIALS.local.md` updated
- [ ] Production environment variables reviewed; none point at preview resources
- [ ] The production database has its own credentials, shared with nothing else
- [ ] The custom domain attached, if there is one, and its URL in `CREDENTIALS.local.md`
- [ ] The read-only smoke specs pass against the production URL

## Red flags

- A first commit made before `.gitignore` covers `.env*` and `*.local.md`
- A direct push to `dev` or `production` after setup
- A PR merged into `dev` before Verify passes
- A merge into `production` without the user's go-ahead, in a run that isn't fully autonomous
- A squash merge from `dev` into `production`
- A Vercel project whose Production Branch is still the default
- A preview environment variable copied from production, or a shared database
- `prisma migrate deploy` in the Vercel build command
- A production test account still active after launch
- A production deploy with no smoke check afterwards
- A failed production smoke check investigated before rolling back
- A fix pushed straight to `production` after a rollback instead of through `dev`
- A fixed release merged after a rollback but never promoted
