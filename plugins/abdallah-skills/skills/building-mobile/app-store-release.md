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
- **Collect from the user up front:** the review contact phone number, and an interactive Apple
  login for the first production build (or an App Store Connect API key).

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

**Which slot App Store Connect actually asks for:** the version page's iPhone slot was **6.5"
Display, accepting only 1242×2688 or 1284×2778** — a 1320×2868 (6.9") upload was rejected ("The
dimensions of one or more screenshots are wrong"). Read the slot's stated sizes before uploading.
Converting 6.9" shots: scale to width 1284 (→ 1284×2790) and centre-crop to 2778 tall — 12 px, nothing
visible lost. Apple then uses the 6.5" set for every iPhone size. Uploads land in completion order,
not file order: re-order by dragging, then **Save**. Upload with the browser tool's `file_upload` on
the slot's file input (≤10 MB per call). (Aesthetica, 2026-10-01)

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

## 4. App Information page

Subtitle (≤30 — the field says "less than 30" but 30 is accepted; the counter shows 0), Primary and
Secondary category (click the select, type the visible text, Return), **Content Rights**: "No" —
users' own uploads aren't "third-party content" in Apple's sense (that's licensed media).

**Age rating questionnaire** (7 steps). Answer from what the app does, not what users might post —
UGC is declared on its own line. For a moderated photo-social app with weekly competitions:
parental controls No, age assurance No, unrestricted web No, **User-Generated Content Yes, Social
Media Yes**, social media disabled under 13 No, messaging No (public comments aren't DMs),
advertising No; all mature themes / medical / sexuality / violence None; **Contests: Frequent**,
gambling and loot boxes No. Result: 13+ in 171 countries (16+ in 2, Brazil A16, Korea 15+), and the
app isn't sold in Afghanistan and Morocco (local contest laws). Make the privacy policy's minimum age
match the result.

Set `ios.infoPlist.ITSAppUsesNonExemptEncryption: false` in app.json (HTTPS only) so App Store
Connect doesn't ask about encryption on every build.

## 5. Production build

`eas build --platform ios --profile production` needs an **App Store** provisioning profile; the ad
hoc one from preview builds doesn't count. **The first production build can't run
`--non-interactive`** ("Credentials are not set up. Run this command again in interactive mode"): the
user runs it once in a terminal, logs in to Apple and picks the team, and EAS creates the profile.
Later builds can run non-interactively. For many apps: create an **App Store Connect API key**
(Users and Access → Integrations → App Store Connect API, role App Manager), keep the .p8 under
`~/.config/<org>/`, and give it to EAS (`eas credentials` → App Store Connect API key) — then
builds and `eas submit` never need an interactive Apple login. (Aesthetica, 2026-10-01)

## 6. App Privacy, pricing, review information

**App Privacy** (Trust & Safety → App Privacy): set the Privacy Policy URL first, then "Yes, we
collect data", tick each type, and for each one: purpose (App Functionality only, for an app with
no ads or analytics), "linked to the user's identity" Yes, two explanation pages (Next, Next), then
tracking No → Save. Then **Publish** at the top — the labels don't count until published. Derive the
types from the published privacy policy so the two match. For a photo-social app: Email Address,
Precise Location, Photos or Videos, Other User Content, User ID, Device ID (push token, App
Attest), Product Interaction. Browser-tool tip: refs inside these dialogs are stable within a
dialog — `find` the checkbox/radio/Next/Save each step rather than clicking coordinates.

**Pricing and Availability**: Add Pricing → $0.00 → Next → Confirm; Set Up Availability → All
countries → Next → Confirm.

**App Review Information** (version page): untick "Sign-in required" when Sign in with Apple works
for the reviewer, and say so in the notes; **the contact phone number is required** — ask the user
for it at the start of the release, not at the end (the whole version page refuses to save without
it). Notes: how to sign in, what needs a real device and why, where each main feature is, and the
safety features (report, block, delete account) — Apple checks those for UGC apps. (Aesthetica,
2026-10-01)

## 7. Version number, submit, attach

**Set `expo.version` to the App Store version before the production build.** App Store Connect's
first version is `1.0`; a build is attached to the version with the same `CFBundleShortVersionString`.
An Expo app scaffolded at `0.1.0` produces a build that can't attach to `1.0` — Aesthetica's first
store build was `0.1.0` and had to be rebuilt as `1.0.0`. Side effect with `runtimeVersion:
{ policy: "appVersion" }`: OTA updates only reach installs of the same version, so the preview build
on the user's phone (still `0.1.0`) stops receiving updates from `1.0.0` code — schedule a new
preview build. (Aesthetica, 2026-10-01)

**`eas submit`**: put `submit.production.ios.ascAppId` (the App Store Connect app ID) and
`appleTeamId` in eas.json. The first submit needs an **App Store Connect API key** and can't create
one in `--non-interactive` ("App Store Connect API Keys cannot be set up in --non-interactive
mode"): the user runs it once and either picks an existing key (one key on the team serves every app
— Aesthetica reused the `[Expo] EAS Submit` key Split Bite already had) or adds a new one. After
that, `eas build --platform ios --profile production --non-interactive --auto-submit` builds and
submits with nobody at the keyboard. EAS then queues the upload ("waiting for an available
submitter") — minutes, not an error.

## 8. … (next steps are added as the Aesthetica release goes)
