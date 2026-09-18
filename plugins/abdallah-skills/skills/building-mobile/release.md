# Releasing a mobile app

Lessons from a shipped app. The mechanics — `eas.json`, `eas update:configure`, signing, submission
— belong to the Expo skills; load them for the how:

- `expo:eas-update` — channels, branches, runtime versions, publishing an OTA
- `expo:eas-app-stores` — store builds, signing, version numbers, submission
- `expo:eas-update-insights` — crash and launch rates per channel after an update ships
- `expo:eas-workflows` — when the repo has `.eas/workflows/`

This file is what those skills can't know: how the house branches map to channels, and the
mistakes that fail silently for people already running the app.

## Profiles, channels, branches

| EAS build profile | Channel | Fed by | Who has it |
|---|---|---|---|
| `development` | — (dev client) | Metro on your machine | you, on a simulator or your phone |
| `preview` | `preview` | the `dev` git branch | testers, internal distribution |
| `production` | `production` | the `production` git branch | the stores, and the owner's own phone |

`feature → dev` publishes an OTA to `preview`. `dev → production`, on the user's go-ahead,
publishes an OTA to `production` — or, for a native change, needs a production store build.

## Runtime version, set up front

Pick the runtime-version policy before the first build that leaves your machine (`appVersion` or
`fingerprint`), and don't change it as a side fix — changing it decides which installed builds can
still receive updates.

**An OTA reaches only builds with the same runtime version *and* the same channel.** Publishing to
`preview` updates nobody on `production`. The owner's own phone usually runs the store build — it
listens on `production` — so "I published it and my phone didn't change" is usually a channel or
runtime mismatch, not a cache. Before saying an update is out, name the channel, the runtime version,
and the platforms it went to. Release builds apply an update on the next cold launch, sometimes the
one after (`expo:eas-update` → testing).

## OTA or store build

- **OTA** for JavaScript, styles, translations, and bundled assets the installed native code
  already supports.
- **A store build** for anything native: a new native library or config plugin, `app.json` native
  fields (permissions, icons, splash, `supportsRTL`, schemes, bundle id), and SDK upgrades. No OTA
  can add native code to a build that doesn't have it.

When unsure, compare what changed against the runtime policy: under `fingerprint` a native change
changes the runtime, and an OTA published anyway reaches no one.

## Build credits are limited

EAS cloud builds come from a monthly allowance. **Test on a local development build** —
`npx expo run:ios` / `npx expo run:android`, or `eas build --profile development --local` — and
never start a `preview` cloud build to see whether something works. A cloud build is for
distributing work that was already verified locally.

## Keep the default branch OTA-shippable

`dev` and `production` must always be publishable as an OTA to the builds already installed. Native
work — a new native library, a config plugin, an SDK upgrade — lives on its own branch until its
store build ships. Merged early, it blocks every JS fix behind it: the next OTA would ship
JavaScript that calls native code the installed builds don't have, and crash on launch.

## Identity, chosen once

The iOS bundle identifier and the Android package name are chosen **once, together, before the
first build**, and kept identical where the platforms allow (`com.company.app` on both). Changing
or diverging them later breaks signing credentials, push configuration, and every OAuth client
(Google, Apple) registered against the old id — each has to be recreated per platform.

## Environment values

`EXPO_PUBLIC_*` values are inlined when the bundle is built — for a store build **and** for every
OTA. Publishing an update with the wrong environment ships the wrong API URL to every phone on that
channel. Publish with the environment matching the channel (`preview` → preview values, `production`
→ production values), never from a shell that happens to have `.env.local` loaded. Secrets never go
in these values — see [data-layer.md](data-layer.md).

## Approval

**A store build or a store submission always needs the user's explicit approval, in every run
mode** — autonomous, batch, or a plan that already lists it. It spends build credits and puts a
version in front of reviewers and users. Say what will be built (platforms, profile, version, why a
build and not an OTA) and wait for a yes.

An OTA to `production` also waits for the user's go-ahead, as `dev → production` always does. An
OTA to `preview` follows a green, locally verified merge to `dev`.

## After it ships

No crash-reporting SDK. After an OTA reaches `production`, load `expo:eas-update-insights` and
compare the crash and launch rates of the new update with the previous one on that channel. A
spike means rolling back first (`eas update:rollback`, with the user's go-ahead) and investigating
after.

## Record every precaution at once

Release, OTA, runtime, and branch mistakes fail **silently, for live users** — a wrong channel, an
env inlined from the wrong file, native code merged into an OTA branch. The first time one is
found, record it before continuing:

- Invoke `capturing-corrections`; it files repo-specific rules in `<repo>/.claude/LEARNINGS.md`,
  which every future session loads.
- Keep the repo's `CLAUDE.md` release section current with the channels, profiles, runtime policy,
  and which branch feeds which channel.

## Red flags

- A store build or submission started without the user's explicit yes
- A `preview` cloud build started to test something that a local dev build could have shown
- "The update is out" without naming the channel, runtime version, and platforms
- An OTA for a change that adds native code or native config
- The runtime-version policy changed as a side fix, or left unset until after the first build
- Native work merged into `dev` or `production` before its store build ships
- An update published with another environment's values, or from `.env.local`
- A bundle id or package name changed after the first build, or different on the two platforms
- An OTA to `production` with nobody checking `expo:eas-update-insights` afterwards
- A release trap discovered and fixed without being recorded
