# App Store release — first submission of an Expo app

The path from a working EAS preview to an app live on the App Store, written from real runs. Every
problem hit on a real app is recorded under its step with the fix, so the next app doesn't hit it.
**Add to this file during every release**: a new problem goes in the moment it's solved.

`release.md` covers EAS channels, OTA updates and store builds in general; this file is the
first-submission checklist on top of it.

## 0. Before starting — what a public release needs (check first, it decides the plan)

A public App Store build talks to **production**, and Apple reviews it. Check all of these before
touching App Store Connect, and tell the user what's missing in one list:

- **A production backend** of its own: API deployment, database, object storage bucket and keys —
  not the preview's. The `production` EAS profile needs `EXPO_PUBLIC_API_URL` set to it.
- **A privacy policy URL** (required for any app with accounts, photos, location) and a **support
  URL**. Hosted, public, in the app's languages.
- **In-app account deletion** (Guideline 5.1.1(v)) — required when the app has sign-up.
- **Sign in with Apple** when any third-party sign-in exists (4.8).
- **User-generated content**: report, block, moderation, and a way to contact you (1.2).
- **A way for the reviewer to sign in.** Demo account credentials in the review notes, or a sign-in
  method the reviewer can use (Sign in with Apple works). Email-code sign-in needs a mail provider
  that's live in production.
- **Secrets that were ever pasted in chat are rotated** before production uses them.
- **Store listing assets**: screenshots for the 6.9" iPhone (1320×2868 or 1290×2796) — at least 3;
  iPad screenshots too if the app supports iPad (`supportsTablet`).
- Anything the product's own business doc marks "required before public launch".

TestFlight needs none of the listing work and no review for internal testers — offer it when the
user wants the app on phones fast, but follow the user's call.

## 1. Create the app record in App Store Connect

App Store Connect → Apps → **+** → New App. Fields: platform iOS, Name, Primary language, Bundle ID
(must already exist in Certificates, Identifiers & Profiles — EAS creates it on the first build),
SKU (any unique string, e.g. `<slug>-ios`), User Access: Full Access.

**Problems hit:**
- **The form ignores programmatic input** (browser automation `form_input` reports success but the
  React form keeps empty values). Fill it with real clicks and typing: click the field, type; for
  the `<select>`s, click to open, type the option's visible text, press Return. Re-screenshot after
  every field — a window resize moves everything and clicks land in the wrong place. (Aesthetica,
  2026-10-01)
- **The name must be unique across the whole App Store**, and Apple only checks on Create.
  "Aesthetica", "Aesthetix" and "Aesthetiq" were all taken; "Aestheca" went through. Agree a short
  list of names with the user *before* starting, try them in order, and remember the store name is
  separate from the name under the icon (`expo.name` / CFBundleDisplayName) — the phone can still
  say the brand. The store name can be changed until the first version is released. (Aesthetica,
  2026-10-01)
- Check the account menu top-right before creating: an account in several teams must create the app
  in the team that owns the bundle ID.

## 2. … (next steps are added as the Aesthetica release goes)
