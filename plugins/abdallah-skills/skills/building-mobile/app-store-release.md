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

## 2. Store screenshots

6.9" iPhone, 1320×2868 portrait, 3–6 shots (plus iPad 13" if `supportsTablet`). Take them on a
simulator **running the current iOS**: the same app looks different per iOS (iOS 26's tab bar and
sheets vs iOS 18's), and the store should show what users get. Before briefing, run
`xcrun simctl list devices` and pick a 6.9" model on the newest runtime (e.g. iPhone 17 Pro Max on
iOS 26.x), by UDID. A fresh simulator needs a dev client built locally (`npx expo run:ios --device
<UDID>`), not EAS. Clean status bar: `xcrun simctl status_bar <UDID> override --time 9:41
--batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3`.

**Problems hit:**
- An agent was pointed at "iPhone 16 Pro Max" by UDID without checking its runtime: it was iOS
  18.5, so the screenshots would have shown the old UI. Check the runtime, not just the size.
  (Aesthetica, 2026-10-01)

## 3. Listing text (version page)

Fields and limits: Promotional Text 170, Description 4000, **Keywords 100 (commas count; no spaces
needed after commas)**, Subtitle 30 and Name 30 (on App Information), Copyright (e.g. `2026 <Name>`),
Support URL and Marketing URL. Count before typing — `printf %s "<keywords>" | wc -c` — the field
only complains on save. Typing a long description with the browser tool can time out
("Input.dispatchKeyEvent timed out") yet still land: screenshot and check the counter before retrying.

**Problems hit:**
- The keyword list was 101 characters and Apple refused it; dropped the weakest word. (Aesthetica,
  2026-10-01)

## 4. … (next steps are added as the Aesthetica release goes)
