# Test credentials and the integrations register

Every login needed to test the app — local, preview, and production before launch — lives in
`CREDENTIALS.local.md` at the repo root, so the user can sign in to any environment without asking.

The same file also holds the **integrations register**: every third-party account, resource and key
the project uses, with the details needed to find, rotate or rebuild it. A key he created last week
must never have to be asked for again, and no session should have to rediscover which account a
database lives under.

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

For a mobile app, add a `## Mobile` section: the EAS project, the iOS bundle id and Android package,
the store app ids, and which channel each build listens on — never keystores, signing keys, or API keys.

## Integrations register

One `## Integrations` section, one block per provider and environment. **Written automatically, in
the same step** that an account is chosen, a resource is created, or the user hands over a key, a
URL, an ID or a setting — never "later", never only in the conversation.

```markdown
## Integrations
### Backblaze B2 — preview photos
- Account: <login email / account id> · Dashboard: <url>
- Bucket `aesthetica-preview-photos` · id `a5c7…` · private · SSE-B2 on · Object Lock off · lifecycle: keep only the last version
- Region `us-east-005` · S3 endpoint `https://s3.us-east-005.backblazeb2.com`
- App key `aesthetica-preview-api` · key id `0055…` · scope: this bucket, read+write · no expiry
- Secret: `~/.config/aesthetica/b2-preview.txt` (mode 600) · consumed as `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
- Set in: local `.env` ☐ · Vercel preview ☐ · Vercel production ☐
- Created 2026-09-24 by the user · rotate by: delete the key in the dashboard, create a new one, replace the file
```

Record for every provider: the account (and team / org / owner), the dashboard URL, every resource
name and id, region, endpoint or host, public ids (key id, team id, client id, bundle id, project
id), scopes and permissions, expiry, which env vars consume it, **which environments it is already
set in**, the secret's file path, when and by whom it was created, and how to rotate it. Planned
integrations get a block too, marked *pending*, so the missing pieces are visible in one place.

## Where secret values live

- **Secret values** — API secrets, private keys (`.p8`), passwords, connection strings with a
  password — go in `~/.config/<project>/<provider>-<env>.<ext>`, directory mode 700, file mode 600,
  **outside the repo tree**. The register holds the path, never the value. A gitignored file inside
  the repo is still one `git add -f`, one backup sync, or one subagent brief away from leaking.
- When the user **pastes a secret into the chat**, save it to its file at once, confirm the path, and
  never repeat the value in a reply. Say once that it now sits in the conversation history, and
  suggest rotating it if the environment matters (production).
- Processes read secrets from the file at start (`APNS_PRIVATE_KEY="$(cat …)" node …`) or from the
  host's environment settings (Vercel), never from a committed file.

## Rules

- **Test accounts only**, one per role. Never a real user's password.
- **Logins, URLs and integration details — not secret values.** Secret values live in
  `~/.config/<project>/` and the host's environment settings; the file points to them.
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
- A secret value (API secret, private key, password) in the file or anywhere in the repo tree
- A third-party account, resource, key or endpoint used by the project with no register entry
- A key the user pasted repeated back in a reply, or left only in the conversation
- A production test account still active after launch
