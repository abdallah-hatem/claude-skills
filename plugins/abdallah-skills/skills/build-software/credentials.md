# Test credentials

Every login needed to test the app — local, preview, and production before launch — lives in
`CREDENTIALS.local.md` at the repo root, so the user can sign in to any environment without asking.

## Never committed

The repo is public. Before writing a single value:

```bash
grep -qxF '*.local.md' .gitignore || echo '*.local.md' >> .gitignore
git check-ignore -q CREDENTIALS.local.md && echo "ignored — safe to write"
```

If that doesn't print, stop. A credential pushed to a public repo is exposed the moment it lands:
automated scanners watch public pushes, and deleting the file afterwards leaves it in the history.

## Layout

```markdown
# Test credentials — never commit
Last updated: YYYY-MM-DD

## Local — http://localhost:3000
| Role  | Email            | Password | Notes                    |
|-------|------------------|----------|--------------------------|
| Owner | owner@test.local | …        | seeded by prisma/seed.ts |

## Preview — https://<app>-git-dev-<team>.vercel.app  (branch: dev)
| Role | Email | Password | Notes |

## Production — https://<app>.vercel.app  (branch: production)
| Role  | Email | Password | Notes                                      |
|-------|-------|----------|--------------------------------------------|
| Owner | …     | …        | pre-launch test account — remove at launch |
```

## Rules

- **Test accounts only**, one per role. Never a real user's password.
- **Logins and URLs, not infrastructure secrets.** Database passwords and API keys live in
  `.env.local` and Vercel's environment settings.
- **Updated in the same step** that seeds an account, changes a password, or gives an environment a
  new URL.
- **Never copied** into a commit, a PR description, a code comment, a log, or a subagent brief.
  Tests that need a signed-in user create their own.
- **Production test accounts are removed or rotated before real users arrive** — see the launch
  checklist in `shipping.md`.
- If the repo already keeps credentials under another gitignored name, follow the repo.

## Red flags

- `CREDENTIALS.local.md` written before `git check-ignore` confirms it is ignored
- A credential value in a commit, PR description, code comment, log, or brief
- A real user's password in the file
- A database password or API key in the file instead of the environment settings
- A production test account still active after launch
