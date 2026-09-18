# The data layer

One client, one contract. A screen never knows whether a NestJS API or Supabase is behind it:
every call returns the same `ApiResult`, the web's `{ success, data, message }` shape, and React
Query hooks sit on top. Nothing calls `fetch` outside `src/lib/`.

`expo:expo-data-fetching` covers the general mechanics (four screen states, offline React Query,
cancellation). This file is the house shape on top of it. The code below typechecks under
TypeScript `strict` with `@tanstack/react-query` 5, `@supabase/supabase-js` 2, `expo-secure-store`,
`sonner-native`, `i18next`, and `@react-native-community/netinfo`.

| File | Job |
|---|---|
| `src/lib/api/contract.ts` | `ApiResult`, `ApiError`, `unwrap` |
| `src/lib/api/config.ts` | the per-environment API URL and the timeout |
| `src/lib/api/secure-storage.ts` | a SecureStore adapter that handles large values |
| `src/lib/api/tokens.ts` | access + refresh tokens (NestJS) |
| `src/lib/api/session.ts` | the one "session expired" hook the auth store registers |
| `src/lib/api/nest-client.ts` | the NestJS adapter |
| `src/lib/api/supabase-client.ts` | the Supabase adapter |
| `src/lib/api/report-error.ts` | the one place a failure becomes a translated toast |
| `src/lib/query-client.ts` | React Query defaults, wired to `reportError` |
| `src/lib/online.ts` | offline and app-focus awareness for React Query |
| `src/features/<name>/api.ts`, `hooks.ts` | a feature's calls and its `useX()` hooks |

An app uses one adapter or both: `nest-client.ts` for a NestJS API, `supabase-client.ts` for
Supabase. Delete the one it doesn't use.

## The contract

A failure is a value, not a throw. `code` is `NETWORK`, `TIMEOUT`, `UNAUTHORIZED`, or the
backend's stable `error` code (`UNIQUE_VIOLATION`, `NOT_FOUND`); screens key UI off `code`, never
off `message` prose. `unwrap` turns a failure into an `ApiError` inside a hook, so React Query
sees it as an error.

`src/lib/api/contract.ts`

```ts
// The one shape every call site sees, whichever backend is behind it.
export type ApiErrorCode =
  | "NETWORK"
  | "TIMEOUT"
  | "UNAUTHORIZED"
  | (string & {}); // the backend's stable `error` code, e.g. "UNIQUE_VIOLATION"

export type ApiResult<T> =
  | { success: true; data: T; message: string; meta?: PageMeta }
  | { success: false; data: null; message: string; status: number; code: ApiErrorCode };

export interface PageMeta {
  total: number;
  page: number;
  limit: number;
  hasNextPage?: boolean;
  hasPreviousPage?: boolean;
}

/** Thrown only by `unwrap`, so React Query sees a failure as an error. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: ApiErrorCode,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function unwrap<T>(result: ApiResult<T>): T {
  if (!result.success) throw new ApiError(result.message, result.status, result.code);
  return result.data;
}
```

## Environment

`EXPO_PUBLIC_*` values are inlined into the JavaScript bundle at build and at update time. Anyone
with the app can read them. **They hold URLs and the Supabase anon key, never a secret** — no
service-role key, no third-party secret key, no DB password.

Each environment has its own URL: `.env.local` for local work, and the EAS environment
(`development`, `preview`, `production`) for builds and updates — see [release.md](release.md).

`src/lib/api/config.ts`

```ts
// EXPO_PUBLIC_* is inlined into the bundle: a URL, never a secret.
const apiUrl = process.env.EXPO_PUBLIC_API_URL;
if (!apiUrl) throw new Error("EXPO_PUBLIC_API_URL is not set");

export const API_URL = apiUrl.replace(/\/+$/, "");
export const REQUEST_TIMEOUT_MS = 15_000;
```

**A phone against a local backend** can't reach `localhost` — that is the phone itself. Use the
Mac's LAN IP:

```bash
ipconfig getifaddr en0          # e.g. 192.168.1.23
# .env.local
EXPO_PUBLIC_API_URL=http://192.168.1.23:3000
```

The IP changes with the network — a new café, a hotspot, a router restart. When requests from the
phone start timing out, check the IP first and restart Metro with `--clear` so the new value is
inlined. The backend must listen on all interfaces, not only `127.0.0.1`. The iOS simulator can use
`localhost`; the Android emulator uses `10.0.2.2`.

## Secure storage

Tokens and sessions live in expo-secure-store (Keychain / Keystore), never AsyncStorage. Some iOS
releases refused keychain values above about 2 KB and Expo does not enforce a limit, so the
adapter splits a value into chunks and writes the chunk count last — a half-finished write reads as
signed out rather than as a corrupt token. Keys may only contain letters, digits, `.`, `-`, `_`.

`src/lib/api/secure-storage.ts`

```ts
import * as SecureStore from "expo-secure-store";

// Some iOS releases refuse keychain values above ~2 KB, and a Supabase session
// can be larger. Values are split into chunks under that size.
const CHUNK = 1800;
const countKey = (key: string) => `${key}.chunks`;
const chunkKey = (key: string, i: number) => `${key}.${i}`;

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const count = Number(await SecureStore.getItemAsync(countKey(key)));
    if (!count) return null;
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i));
      if (part === null) return null; // a partial write — treat as signed out
      parts.push(part);
    }
    return parts.join("");
  },

  async setItem(key: string, value: string): Promise<void> {
    await secureStorage.removeItem(key);
    const count = Math.ceil(value.length / CHUNK);
    for (let i = 0; i < count; i++) {
      await SecureStore.setItemAsync(chunkKey(key, i), value.slice(i * CHUNK, (i + 1) * CHUNK));
    }
    await SecureStore.setItemAsync(countKey(key), String(count)); // last: marks the write complete
  },

  async removeItem(key: string): Promise<void> {
    const count = Number(await SecureStore.getItemAsync(countKey(key)));
    await SecureStore.deleteItemAsync(countKey(key));
    for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(chunkKey(key, i));
  },
};
```

`src/lib/api/tokens.ts`

```ts
import { secureStorage } from "./secure-storage";

const ACCESS = "auth.access";
const REFRESH = "auth.refresh";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export const tokens = {
  access: () => secureStorage.getItem(ACCESS),
  refresh: () => secureStorage.getItem(REFRESH),
  async save(pair: TokenPair) {
    await secureStorage.setItem(ACCESS, pair.accessToken);
    await secureStorage.setItem(REFRESH, pair.refreshToken);
  },
  async clear() {
    await secureStorage.removeItem(ACCESS);
    await secureStorage.removeItem(REFRESH);
  },
};
```

The data layer never imports the router or a store. The auth store registers what signed-out
means once, at startup:

`src/lib/api/session.ts`

```ts
// The auth store registers what "signed out" means (clear state, route to sign-in).
// The data layer only calls it — it never imports the router or a store.
let onSessionExpired: () => void = () => {};

export function setSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler;
}

export function sessionExpired() {
  onSessionExpired();
}
```

## NestJS adapter

Unwraps the envelope from `building-backends` → [response-envelope.md](../building-backends/response-envelope.md)
into `ApiResult`. On a 401 it refreshes **once** for all concurrent requests (single-flight), then
each request retries once with the new token. A refresh the server rejects clears the tokens and
signs the user out once; a refresh that fails on the network does not sign anyone out. Every
request has a timeout, and the caller's `signal` (React Query passes one) cancels it on unmount.
`Accept-Language` carries the app language so the backend answers in it.

Writes are never retried by the client.

`src/lib/api/nest-client.ts`

```ts
import i18n from "i18next";
import { API_URL, REQUEST_TIMEOUT_MS } from "./config";
import type { ApiResult, PageMeta } from "./contract";
import { sessionExpired } from "./session";
import { tokens, type TokenPair } from "./tokens";

// The NestJS envelope from building-backends → response-envelope.md
interface Envelope<T> {
  success: boolean;
  message: string;
  statusCode: number;
  data?: T;
  error?: string;
  meta?: PageMeta;
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RequestOptions {
  method?: Method;
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal; // React Query passes one; unmount cancels the request
  auth?: boolean; // false for sign-in and other public routes
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const first = await send<T>(path, options);
  if (first.status !== 401 || options.auth === false) return first.result;

  // Many requests can hit 401 at once; they share one refresh, then each retries once.
  const outcome = await refreshOnce();
  if (outcome === "ok") return (await send<T>(path, options)).result;
  if (outcome === "unreachable") {
    return { success: false, data: null, status: 0, code: "NETWORK", message: "" };
  }
  return first.result; // rejected: already signed out
}

type RefreshOutcome = "ok" | "rejected" | "unreachable";
let refreshing: Promise<RefreshOutcome> | null = null;

function refreshOnce(): Promise<RefreshOutcome> {
  refreshing ??= refresh()
    .then(async (outcome) => {
      if (outcome === "rejected") {
        // Signed out once, however many requests were waiting on this refresh.
        // A network failure is not a rejection — the user stays signed in.
        await tokens.clear();
        sessionExpired();
      }
      return outcome;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function refresh(): Promise<RefreshOutcome> {
  const refreshToken = await tokens.refresh();
  if (!refreshToken) return "rejected";
  // Match the backend's refresh route and response; this one takes the refresh token as bearer.
  const { status, result } = await send<{ access_token: string; refresh_token: string }>(
    "/auth/refresh",
    { method: "POST", auth: false, bearer: refreshToken },
  );
  if (status === 0 || status >= 500) return "unreachable";
  if (!result.success) return "rejected";
  const pair: TokenPair = {
    accessToken: result.data.access_token,
    refreshToken: result.data.refresh_token,
  };
  await tokens.save(pair);
  return "ok";
}

async function send<T>(
  path: string,
  options: RequestOptions & { bearer?: string },
): Promise<{ status: number; result: ApiResult<T> }> {
  const url = new URL(API_URL + path);
  for (const [key, value] of Object.entries(options.params ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Accept-Language": i18n.language || "ar",
  };
  const isForm = options.body instanceof FormData;
  if (options.body !== undefined && !isForm) headers["Content-Type"] = "application/json";

  const bearer = options.bearer ?? (options.auth === false ? null : await tokens.access());
  if (bearer) headers.Authorization = `Bearer ${bearer}`;

  const { signal, cancel, timedOut } = withTimeout(options.signal, REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      method: options.method ?? "GET",
      headers,
      body: isForm
        ? (options.body as FormData)
        : options.body === undefined
          ? undefined
          : JSON.stringify(options.body),
      signal,
    });
    return { status: res.status, result: await parse<T>(res) };
  } catch {
    const code = timedOut() ? "TIMEOUT" : "NETWORK";
    return { status: 0, result: { success: false, data: null, status: 0, code, message: "" } };
  } finally {
    cancel();
  }
}

async function parse<T>(res: Response): Promise<ApiResult<T>> {
  const body = (await res.json().catch(() => null)) as Envelope<T> | null;

  if (res.ok && body?.success) {
    return { success: true, data: body.data as T, message: body.message, meta: body.meta };
  }
  return {
    success: false,
    data: null,
    status: res.status,
    code: res.status === 401 ? "UNAUTHORIZED" : (body?.error ?? `HTTP_${res.status}`),
    message: body?.message ?? "",
  };
}

// One signal that aborts on the caller's cancel or on the timeout.
// (AbortSignal.any / AbortSignal.timeout are not available on every RN runtime.)
function withTimeout(outer: AbortSignal | undefined, ms: number) {
  const controller = new AbortController();
  let expired = false;
  const timer = setTimeout(() => {
    expired = true;
    controller.abort();
  }, ms);
  const onAbort = () => controller.abort();
  outer?.addEventListener("abort", onAbort);
  return {
    signal: controller.signal,
    timedOut: () => expired,
    cancel: () => {
      clearTimeout(timer);
      outer?.removeEventListener("abort", onAbort);
    },
  };
}
```

Match `/auth/refresh` and its response fields to the backend's actual route. A `FormData` body
(file upload) is sent as-is so `fetch` sets the multipart boundary.

## Supabase adapter

The session persists through the same SecureStore adapter. **The anon key only** — Row Level
Security decides what the signed-in user can read and write. A service-role key in the app would
bypass RLS for anyone who unpacks the bundle. Auto-refresh runs only while the app is in the
foreground. `fromSupabase` maps a supabase-js response onto the same `ApiResult`, so hooks and
screens look identical on both backends.

`src/lib/api/supabase-client.ts`

```ts
import { createClient, type PostgrestError } from "@supabase/supabase-js";
import { AppState } from "react-native";
import type { ApiResult } from "./contract";
import { secureStorage } from "./secure-storage";

// The anon key only. RLS decides what a signed-in user can read and write;
// a service_role key in the app would bypass it for everyone who unzips the bundle.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anonKey) throw new Error("Supabase env is not set");

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Refresh the session only while the app is in the foreground.
AppState.addEventListener("change", (state) => {
  if (state === "active") void supabase.auth.startAutoRefresh();
  else void supabase.auth.stopAutoRefresh();
});

/** Adapts a supabase-js response to the same contract the NestJS client returns. */
export async function fromSupabase<T>(
  query: PromiseLike<{ data: T | null; error: PostgrestError | null; status: number }>,
): Promise<ApiResult<T>> {
  try {
    const { data, error, status } = await query;
    if (error) {
      return { success: false, data: null, status, code: error.code || `HTTP_${status}`, message: error.message };
    }
    return { success: true, data: data as T, message: "" };
  } catch {
    return { success: false, data: null, status: 0, code: "NETWORK", message: "" };
  }
}
```

Use it in a feature's `api.ts`:
`list: () => fromSupabase(supabase.from("invoices").select("*").order("created_at"))`.

For sign-in flows (OAuth, magic links, deep-link redirects) follow `expo:expo-examples` → the
Supabase example, and keep the session in this adapter.

## One place for errors

Screens never call `toast.error`. A failed query or mutation reaches `reportError` through the
query client. A known code shows its translated message (`errors.NETWORK`, `errors.TIMEOUT`,
`errors.UNIQUE_VIOLATION` in both locale files); otherwise the backend's message, which it wrote
in the `Accept-Language` it received; otherwise `errors.generic`. `UNAUTHORIZED` is silent — the
session handler already routed to sign-in.

`src/lib/api/report-error.ts`

```ts
import i18n from "i18next";
import { toast } from "sonner-native";
import { ApiError } from "./contract";

// The one place a failure becomes a toast. Screens never call toast.error themselves.
export function reportError(error: unknown) {
  if (!(error instanceof ApiError)) {
    toast.error(i18n.t("errors.generic"));
    return;
  }
  if (error.code === "UNAUTHORIZED") return; // session handling already routed to sign-in

  // A known code has a translated message; otherwise the backend's own message
  // (it answers in the Accept-Language it was sent); otherwise a generic one.
  const key = `errors.${error.code}`;
  const message = i18n.exists(key) ? i18n.t(key) : error.message || i18n.t("errors.generic");
  toast.error(message);
}
```

`src/lib/query-client.ts`

```ts
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api/contract";
import { reportError } from "./api/report-error";

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    // A background refetch that fails while data is on screen still tells the user.
    onError: (error) => reportError(error),
  }),
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      if (mutation.meta?.silent) return; // the form shows this error inline instead
      reportError(error);
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Retry network blips and timeouts, never a 4xx the server meant.
      retry: (count, error) =>
        count < 2 && error instanceof ApiError && (error.status === 0 || error.status >= 500),
    },
    mutations: { retry: false }, // a write is never repeated on its own
  },
});

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: { silent?: boolean };
  }
}
```

A form that shows its error inline passes `meta: { silent: true }` on its mutation so the user
doesn't get the same error twice.

## Offline and slow networks

Queries pause while offline instead of failing, and resume when the network returns. Returning to
the app refetches stale screens. Import `online.ts` once in the root layout.

`src/lib/online.ts`

```ts
import NetInfo from "@react-native-community/netinfo";
import { focusManager, onlineManager } from "@tanstack/react-query";
import { AppState } from "react-native";

// Offline: queries pause instead of failing, and resume when the network returns.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(state.isConnected !== false)),
);

// Returning to the app counts as focus, so stale screens refetch.
focusManager.setEventListener((setFocused) => {
  const sub = AppState.addEventListener("change", (s) => setFocused(s === "active"));
  return () => sub.remove();
});
```

On screen, the four states from `expo:expo-data-fetching` apply: `data === undefined` with
`fetchStatus === "paused"` is the offline state with a retry; `error` with data on screen is an
inline "couldn't refresh" with a retry, and the data stays. A timeout is a failure like any other —
it gets the `TIMEOUT` message and a retry, never an endless skeleton.

## Feature hooks

A feature exposes `useX()` hooks; screens never call the client directly. List queries keep the
previous data while the next page, search, or filter loads, so the list never collapses or jumps.
A mutation invalidates the lists it changes.

`src/features/invoices/api.ts`

```ts
import { api } from "@/lib/api/nest-client";
import type { PageMeta } from "@/lib/api/contract";

export interface Invoice {
  id: string;
  number: string;
  total: number;
  status: "draft" | "sent" | "paid";
}

export interface InvoiceFilters {
  page: number;
  search?: string;
  status?: Invoice["status"];
}

export type NewInvoice = Pick<Invoice, "total"> & { customerId: string };

export const invoicesApi = {
  list: (filters: InvoiceFilters, signal?: AbortSignal) =>
    api<Invoice[]>("/invoices", { params: { ...filters }, signal }),
  create: (body: NewInvoice) => api<Invoice>("/invoices", { method: "POST", body }),
};

export type InvoicePage = { rows: Invoice[]; meta?: PageMeta };
```

`src/features/invoices/hooks.ts`

```ts
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, unwrap } from "@/lib/api/contract";
import { invoicesApi, type InvoiceFilters, type InvoicePage, type NewInvoice } from "./api";

export const invoiceKeys = {
  all: ["invoices"] as const,
  list: (filters: InvoiceFilters) => ["invoices", "list", filters] as const,
};

export function useInvoices(filters: InvoiceFilters) {
  return useQuery({
    queryKey: invoiceKeys.list(filters),
    queryFn: async ({ signal }): Promise<InvoicePage> => {
      const res = await invoicesApi.list(filters, signal);
      if (!res.success) throw new ApiError(res.message, res.status, res.code);
      return { rows: res.data, meta: res.meta };
    },
    // Page, search and filter changes keep the current rows on screen until the next ones land.
    placeholderData: keepPreviousData,
  });
}

export function useCreateInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: NewInvoice) => unwrap(await invoicesApi.create(body)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: invoiceKeys.all }),
  });
}
```

**No double fire.** The submit button reads `mutation.isPending`: disabled, with its spinner, and
the handler returns early when pending. A failed save keeps the draft on screen; the form closes
only in `onSuccess`.

## Red flags

- `fetch` anywhere outside `src/lib/`, or a screen calling the client instead of a hook
- A token or session in AsyncStorage, or read from storage in a screen
- A secret — service-role key, API secret, DB password — in any `EXPO_PUBLIC_*` variable
- Each 401 starting its own refresh, or a refresh loop with no single-flight
- Signing the user out because the refresh request hit a network error
- A request with no timeout, or one that ignores React Query's `signal`
- `toast.error` in a screen, or an error shown both inline and as a toast
- A write retried automatically
- A list query without `placeholderData: keepPreviousData`
- A submit button enabled while `isPending`
- A hardcoded `localhost` API URL used from a physical phone
- Keying UI off the backend's `message` text instead of `code`
