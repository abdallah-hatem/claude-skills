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
| Component library | React Native Reusables (the shadcn/ui port) | User decision; same component names and API as the web's shadcn, copied into the repo, NativeWind-based |
| Native vs kit | Navigation chrome is native (expo-router native tabs, stack headers, system sheets); every control comes from the kit | Native-first for structure, one consistent brand for controls |
| Consistency enforcement | ESLint `no-restricted-imports` + a token check, not prose alone | Mechanical rules are automated; prose is for judgment calls |
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
- **Structure**:
  ```
  app/                      routes only — thin files that compose a feature's screen
  src/ui/                   the kit: React Native Reusables components + the app's own primitives
  src/features/<name>/      screens, hooks, API calls, and components owned by one feature
  src/lib/                  data client, i18n, storage, pure helpers
  packages/shared/          (web + mobile repos) zod schemas, API types, locale files, tokens, pure logic
  ```
- **Components — the kit first** (mirrors the web's "shadcn/ui first"): if React Native Reusables has
  the component, add it with its CLI into `src/ui/` and compose. Never hand-roll a button, input,
  select, switch, checkbox, dialog, sheet, toast, tabs, or skeleton in a screen.
- **Nothing ships as a raw React Native control** (mirrors "nothing ships looking native"): `Button`,
  `Switch`, `TextInput`, `ActivityIndicator`, `Alert.alert`, and the native picker look different on
  each OS and read as unstyled. Screens use the kit's version; a missing control is built into
  `src/ui/` first, token-styled, then used. Layout primitives (`View`, `ScrollView`, `FlatList`) are
  fine. Navigation chrome stays native — expo-router native tabs, stack headers, `formSheet`
  presentation.
- **Enforced, not hoped for**: the app's ESLint config gets `no-restricted-imports` blocking those
  controls from `react-native` outside `src/ui/`, and a check that fails on hex colours or raw
  pixel values in `app/` and `src/features/`. Set up with the kit, before the first screen.
- **Reuse**: search first (`graft ask`), extract on the second use — a component to `src/ui/`, a hook
  or helper shared by two features to `src/lib/` (or `packages/shared` when web needs it too).
  Features never import from another feature's folder; what two features share moves out.
- **Screens**: safe areas; keyboard handling per platform (`KeyboardAvoidingView behavior="padding"`
  on Android, `automaticallyAdjustKeyboardInsets` is iOS-only); tap targets ≥ 44pt; phone and tablet
  layouts; design comes from `designing-mobile`.
- **Red flags** section — including a raw control in a screen, a hex colour or one-off size outside the
  tokens, a hand-rolled dialog/sheet/toast, a feature importing another feature's internals, and a
  kit component copied and tweaked instead of given a variant.

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
- **Consistency**: one component per job, styled once in the kit with variants (`size`, `variant`)
  instead of per-screen overrides; one spacing scale, one radius set, one shadow/elevation set, one
  icon family; the same pattern for the same situation everywhere (every list's empty state, every
  destructive confirmation, every form error look alike).
- **Mechanics**: tokens in code before the first screen — NativeWind theme, shared with web through
  `packages/shared` when both exist; the React Native Reusables kit themed from those tokens; a
  preview screen showing the kit (buttons, inputs, sheet, toast, list row, empty state) for approval;
  screenshots on iPhone and iPad, LTR and RTL, light and dark.
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
for approval, RTL handling, whether a design direction is committed before the first screen, and
whether a screen is built from the kit (no raw `Switch`/`TextInput`/`Alert.alert`, no hex colours,
no hand-rolled sheet) with shared code extracted instead of copied.

## Out of scope

- Building Supabase backends from scratch in `build-software` (connecting to an existing one is in).
- App Clips, brownfield integration, DOM components, Expo API routes.
- Crash-reporting SDKs.

## Version

Plugin `1.15.0` → `1.16.0`.
