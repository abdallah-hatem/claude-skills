# Mobile skills: `building-mobile`, `designing-mobile`, and mobile in `build-software`

Date: 2026-09-18 · Status: draft for review

## Goal

Let `/build-software` build and ship React Native (Expo) apps the way it already builds NestJS
backends and Next.js frontends: with house conventions, a design system, tests, verification, and a
release path — for a mobile app alone or next to a web app, on any backend.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Scope of the mobile skill | The app and its connection to a backend — any backend | The backend is already covered by `building-backends`, or already exists |
| Backends supported | NestJS API (built by the run, or existing) and Supabase (existing) | The user's apps use both |
| App shapes | web + mobile on one API · mobile only on a NestJS API · mobile on Supabase | All three chosen by the user |
| Skill structure | New `building-mobile`; shared rules referenced from `building-frontends`, not copied | One definition per rule; the web skill stays untouched |
| Official Expo know-how | Load the `expo` plugin's skills at named points; never copy them | They are maintained upstream |
| Expo plugin scope | Installed at user scope (today: project scope in one repo) | Skill references must resolve in any project |
| Crash reporting | No Sentry; `expo:eas-update-insights` for crash/launch rates per channel | User decision |
| Design default | Native-first + brand | User decision; feels at home on each OS |
| Mobile design | New `designing-mobile` skill, the mobile counterpart of `frontend-design` | No existing skill found (`SuggestSkills` returned none) |
| Existing repos | The repo's stack always wins, as in the web skill | Never migrate a working app to match a table |

## 1. `building-mobile` (new skill)

`plugins/abdallah-skills/skills/building-mobile/`

**`SKILL.md`**
- Description triggers on: any React Native / Expo screen, navigation, data fetching, forms, i18n/RTL
  layout, EAS build or update, or scaffolding a new Expo app.
- **Default stack** (new projects): Expo (current SDK), expo-router, TypeScript `strict`, NativeWind
  per `expo:expo-tailwind-setup`, Zustand, React Query, react-hook-form + zod, react-i18next +
  expo-localization, Reanimated, expo-secure-store. No Sentry.
- **Shared with the web** — REQUIRED from `building-frontends`: Reusability contract, Forms (zod
  schemas), i18n content rules (no hardcoded strings, identical `en`/`ar` keys), Testing philosophy
  (behavior, not appearance). Referenced by section name, not copied.
- **Expo skill map** — when to load which official skill:

  | When | Load |
  |---|---|
  | Any screen, navigation, or animation | `expo:building-native-ui` |
  | Styling setup in a new project | `expo:expo-tailwind-setup` |
  | Any network call | `expo:native-data-fetching`, plus `data-layer.md` |
  | A dev client for native changes | `expo:expo-dev-client` |
  | Store release | `expo:expo-deployment`; `expo:expo-cicd-workflows` if the repo uses EAS workflows |
  | After an OTA reaches production | `expo:eas-update-insights` |
  | SDK upgrade | `expo:upgrading-expo` |
  | Native module / native UI | `expo:expo-module` / `expo:expo-ui` |
  | A third-party integration | `expo:expo-examples` |

  Not used: `add-app-clip`, `expo-brownfield`, `expo-api-routes`, `use-dom`, `expo-observe`.
- **Screens**: safe areas; keyboard handling per platform (`KeyboardAvoidingView behavior="padding"`
  on Android, `automaticallyAdjustKeyboardInsets` is iOS-only); tap targets ≥ 44pt; phone and tablet
  layouts; design comes from `designing-mobile`.
- **Reuse**: search first (`graft ask`), shared primitives in `src/ui/`, extract on the second use.
- **Red flags** section.

**`data-layer.md`** — one client shape, two backends:
- NestJS: unwraps the response envelope from `building-backends`, keeps access + refresh tokens in
  expo-secure-store, refreshes once for concurrent 401s (single-flight), then retries.
- Supabase: session persisted through a SecureStore adapter, RLS does the authorization, the anon key
  only — never the service key.
- Both: `EXPO_PUBLIC_*` is baked into the bundle, so it never holds a secret; a device reaches a local
  backend through the Mac's LAN IP (`ipconfig getifaddr en0`), which changes with the network.

**`rtl.md`**: `I18nManager.allowRTL` / `forceRTL` needs an app reload; logical style props
(`start`/`end`, `ms-`/`me-`); directional icons mirrored; `translateX` animations flipped; every
changed screen checked in both directions.

**`release.md`** (lessons from a shipped app):
- EAS profiles and channels: `development` (dev client), `preview` ← `dev` branch, `production` ←
  `production` branch.
- Runtime version policy set up front; an OTA reaches only builds with the same runtime **and**
  channel — the owner's own phone usually listens on `production`.
- OTA for JS/asset changes; a store build only for native changes. EAS build credits are limited:
  test on a local dev build, never a preview build for development.
- The default branch stays OTA-shippable; native-only work lives on its own branch until its build
  ships.
- iOS bundle id and Android package chosen once, together, and kept identical where possible —
  diverging later breaks signing and OAuth clients.
- Env values inlined per environment when publishing an update.

**`testing.md`**: jest-expo + React Native Testing Library for behavior (quiet output, summary line);
Maestro flows as the smoke specs, signing in as the seeded accounts inside the flow; simulator
screenshots for the visual check.

## 2. `designing-mobile` (new skill)

`plugins/abdallah-skills/skills/designing-mobile/` — loaded at the design-system stage for mobile
and whenever a mobile screen's look is being decided.

- **Direction first**: name the product's personality and commit to it; ban the generic look
  (default blue, cards on everything, centered everything, gradient-for-its-own-sake).
- **Native-first + brand**: platform conventions stay (large titles, native tabs, system sheets and
  menus on iOS; Material behaviour on Android); the brand lives in colour, type, iconography,
  motion, and one or two signature moments per app.
- **Motion**: springs over durations; gesture-driven interactions that track the finger; haptics on
  meaningful confirmations only; respect Reduce Motion.
- **Craft**: spacing scale, type scale covering Arabic and Latin (Dynamic Type honoured), colour roles
  for light and dark, one icon family, designed empty/loading/error states.
- **Mechanics**: tokens in code before the first screen — NativeWind theme, shared with web through
  `packages/shared` when both exist; a preview screen for approval; screenshots on iPhone and iPad,
  LTR and RTL, light and dark.
- **Red flags** section.

## 3. `build-software` changes

- **Intake / spec**: record platforms (web / mobile / both; iOS / Android / both) and backend (build
  NestJS / existing NestJS / existing Supabase). A resumed run reads them from the build log.
- **Layout**: web + mobile → `apps/api`, `apps/web`, `apps/mobile`, `packages/shared` (zod schemas,
  API types, locale files). Mobile only → `apps/mobile` (+ `apps/api` when building one).
- **Design system (stage 4)**: mobile loads `designing-mobile`; the approval preview shows a screen on
  each platform built.
- **Plan**: new area `mobile`; the parallel check treats it like the others — independent of web once
  the contract is fixed.
- **Build setup**: check the `expo` plugin is installed; mobile tasks load `building-mobile`; briefs
  carry the Graft block and existing-code-first line as today.
- **Verify**: Jest summary line; Maestro smoke flows; simulator screenshots by the main thread after
  each wave (one simulator at a time).
- **Ship**: `feature → dev` = OTA to `preview`. `dev → production` on go-ahead: JS-only = OTA to
  `production` then `eas-update-insights`; native = EAS production build and store submission.
  **A store build always needs the user's approval, in every run mode** — it spends EAS credits.
- **Credentials file**: EAS project, bundle id / package, store app ids — never keystores or signing
  keys.

## 4. Setup

- Install `expo@claude-plugins-official` at user scope.
- `build-software` Build setup checks for it and says how to install it if missing.

## Testing the skills

Per `superpowers:writing-skills`, each change is tested before it ships: scenario prompts run by
subagents against the skill text, 3 runs before and 3 after, checking concrete behavior — which Expo
skill is loaded when, where tokens and secrets go, OTA-vs-build choices, whether a store build waits
for approval, RTL handling, and whether a design direction is committed before the first screen.

## Out of scope

- Building Supabase backends from scratch in `build-software` (connecting to an existing one is in).
- App Clips, brownfield integration, DOM components, Expo API routes.
- Crash-reporting SDKs.

## Version

Plugin `1.15.0` → `1.16.0`.
