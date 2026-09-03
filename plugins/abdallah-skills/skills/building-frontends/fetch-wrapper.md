# The API layer

Three layers, each with one job. Nothing calls `fetch()` against the API outside of them.

| Layer | File | Runs | Job |
|---|---|---|---|
| `apiFetch` | `src/lib/api.ts` | server only | transport: base URL, params, auth, refresh, retry, revalidate |
| endpoints | `src/apis.ts` | `"use server"` | one exported `SCREAMING_CASE` Server Action per API route |
| `handleResponse` | `src/lib/handleResponse.ts` | both | toasts + the logout redirect |
| `callApi` | `src/lib/callApi.ts` | client | re-runs `handleResponse` in the browser so toasts appear |

Both `src/lib/api.ts` and `src/apis.ts` are `"use server"`. Endpoints are therefore Server
Actions: a client component imports one and calls it, and Next turns that into an RPC. The
request, the token, and the backend URL all stay on the server — the browser only ever sees
the serialized response.

**Why `callApi` exists:** because the endpoint body runs on the server, the `handleResponse`
inside it executes where `window` is undefined and `toast()` renders nothing. `callApi`
awaits the action, then runs `handleResponse` a second time in the browser, where the toast
can actually appear.

## `src/lib/api.ts`

```ts
"use server";

import { revalidateTag } from "next/cache";
import { cookies, headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { refreshTokens } from "@/src/lib/middlewareFunctions";

const ACCESS_TOKEN_KEY =
  process.env.NEXT_PUBLIC_AUTH_TOKEN_KEY || "auth_token";
const REFRESH_TOKEN_KEY =
  process.env.NEXT_PUBLIC_REFRESH_TOKEN_KEY || "refresh_token";

// Retry read-only requests on transient network failures. Off by default;
// set `ENABLE_API_RETRY=true` in the env to turn it on.
const API_RETRY_ENABLED = process.env.ENABLE_API_RETRY === "true";
const API_RETRY_ATTEMPTS = 3;

function normalizeHeaders(h?: HeadersInit): Record<string, string> {
  if (!h) return {};
  if (h && typeof (h as any).entries === "function") {
    return Object.fromEntries((h as Headers).entries());
  }
  if (Array.isArray(h)) return Object.fromEntries(h);
  return h as Record<string, string>;
}

function isPlainObject(obj: any): boolean {
  return (
    typeof obj === "object" &&
    obj !== null &&
    Object.prototype.toString.call(obj) !== "[object FormData]" &&
    Object.prototype.toString.call(obj) !== "[object ArrayBuffer]"
  );
}

type ApiFetchOptions = RequestInit & {
  includeAuth?: boolean;
  /** When true, use the refresh token (not the access token) as the bearer */
  useRefreshToken?: boolean;
  params?: Record<string, string | string[] | undefined>;
  revalidateTags?: string[];
  ignore401Redirect?: boolean;
  /** Internal: prevents recursion when the refresh attempt itself returns 401 */
  _skipRefresh?: boolean;
};

export async function apiFetch(url: string, options: ApiFetchOptions = {}) {
  const baseURL = process.env.BASE_URL!;

  let fullUrl = baseURL + url;
  if (options.params) {
    const queryString = new URLSearchParams(
      Object.entries(options.params).reduce(
        (acc, [key, value]) => {
          if (value !== undefined) {
            acc[key] = Array.isArray(value) ? value.join(",") : value;
          }
          return acc;
        },
        {} as Record<string, string>,
      ),
    ).toString();

    if (queryString) {
      fullUrl += (url.includes("?") ? "&" : "?") + queryString;
    }
  }

  const includeAuth = options.includeAuth !== false;
  const isFormData = options.body instanceof FormData;

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...normalizeHeaders(options.headers),
  };
  if (!isFormData) headers["Content-Type"] = "application/json";

  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_KEY)?.value;
  const refreshToken = cookieStore.get(REFRESH_TOKEN_KEY)?.value;
  const lang = cookieStore.get("lang")?.value || "ar";

  if (options.useRefreshToken) {
    if (refreshToken) headers["Authorization"] = `Bearer ${refreshToken}`;
  } else if (includeAuth && accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }
  if (!headers["Accept-Language"]) headers["Accept-Language"] = lang;

  let body: any = options.body;
  if (body && !isFormData && isPlainObject(body)) {
    body = JSON.stringify(body);
  }

  return executeRequest(fullUrl, options, headers, body);
}

/**
 * `fetch` with a small retry for transient network failures (DNS blips, dropped
 * connections, and especially stale keep-alive sockets — undici reuses a pooled
 * connection the backend already closed, which throws "fetch failed" on the
 * first try). Only retried for idempotent requests so a POST can't double-submit.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  attempts: number,
): Promise<Response> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      lastErr = err;
      if (i < attempts) await new Promise((r) => setTimeout(r, 150 * i));
    }
  }
  throw lastErr;
}

async function executeRequest(
  fullUrl: string,
  options: ApiFetchOptions,
  headers: Record<string, string>,
  body: any,
) {
  try {
    // Only read verbs are retried, so a transient "fetch failed" (e.g. a stale
    // pooled keep-alive socket the backend already closed) recovers on the next
    // attempt. Writes are never repeated: POST double-submits a create, and
    // PATCH is not idempotent by spec — a relative update applies twice.
    const method = (options.method || "GET").toUpperCase();
    const isIdempotent = ["GET", "HEAD", "OPTIONS"].includes(method);
    const attempts =
      API_RETRY_ENABLED && isIdempotent ? API_RETRY_ATTEMPTS : 1;
    const res = await fetchWithRetry(
      fullUrl,
      { ...options, headers, body },
      attempts,
    );

    if (options.revalidateTags) {
      options.revalidateTags.forEach((tag: string) => {
        revalidateTag(tag, "default");
      });
    }

    if (
      res.status === 401 &&
      !options.ignore401Redirect &&
      !options._skipRefresh &&
      !options.useRefreshToken
    ) {
      const hdrs = await nextHeaders();
      // Server Actions send a `next-action` header. Only in that context can we
      // reliably write cookies (a Server Component render is read-only). So:
      //   - Server Action  → refresh the token pair inline, set the new cookies
      //     (they ride back on the action response), and retry the request once
      //     with the fresh access token.
      //   - render / other → hand off to /api/auth/refresh, which does the same
      //     in a route-handler context and redirects back to the current page.
      const isServerAction = !!hdrs.get("next-action");

      if (isServerAction) {
        const cookieStore = await cookies();
        try {
          const refreshToken = cookieStore.get(REFRESH_TOKEN_KEY)?.value;
          if (refreshToken) {
            const tokens = await refreshTokens(refreshToken);
            if (tokens) {
              const secure = process.env.NODE_ENV === "production";
              cookieStore.set({
                name: ACCESS_TOKEN_KEY,
                value: tokens.access_token,
                httpOnly: true,
                secure,
                sameSite: "strict",
                path: "/",
                maxAge: 60 * 60 * 24,
              });
              if (tokens.refresh_token) {
                cookieStore.set({
                  name: REFRESH_TOKEN_KEY,
                  value: tokens.refresh_token,
                  httpOnly: true,
                  secure,
                  sameSite: "strict",
                  path: "/",
                  maxAge: 60 * 60 * 24 * 14,
                });
              }
              // Retry once with the fresh token (`_skipRefresh` guards a loop).
              return executeRequest(
                fullUrl,
                { ...options, _skipRefresh: true },
                { ...headers, Authorization: `Bearer ${tokens.access_token}` },
                body,
              );
            }
          }
        } catch {
          // Inline refresh failed unexpectedly — fall through to logout.
        }
        // Refresh missing/failed → clear the session cookies so the
        // unauthorized signal below results in a clean logout.
        cookieStore.delete(ACCESS_TOKEN_KEY);
        cookieStore.delete(REFRESH_TOKEN_KEY);
      } else {
        const pathname = hdrs.get("x-pathname") || "/";
        redirect(`/api/auth/refresh?next=${encodeURIComponent(pathname)}`);
      }

      const lang = headers["Accept-Language"] || "ar";
      const fallbackMessage =
        lang === "ar"
          ? "انتهت صلاحية الجلسة، يرجى تسجيل الدخول مرة أخرى"
          : "Your session has expired, please log in again";
      let BEMessage = "";
      try {
        const errBody = await res.clone().json();
        BEMessage = errBody?.message || errBody?.error || "";
      } catch {
        // ignore
      }
      throw {
        unauthorized: true,
        redirect: "/auth/login",
        message: BEMessage || fallbackMessage,
      };
    }

    return await parseResponse(res);
  } catch (err: any) {
    if (err.unauthorized) {
      return {
        unauthorized: true,
        redirect: err.redirect,
        message: err.message,
      };
    }
    if (
      err?.digest?.startsWith?.("NEXT_REDIRECT") ||
      err?.digest?.startsWith?.("NEXT_NOT_FOUND")
    ) {
      throw err;
    }
    console.error("[apiFetch] network error:", err?.message || err);
    return {
      success: false,
      status: 0,
      message: err?.message || "Network error",
      data: null,
      networkError: true,
    };
  }
}

async function parseResponse(res: Response) {
  const contentType = res.headers.get("content-type");
  // A lying content-type shouldn't reject the whole request.
  const body: unknown = contentType?.includes("json")
    ? await res.json().catch(() => null)
    : await res.text();

  // Only a PLAIN OBJECT may merge into the envelope. Spreading a string turns an
  // HTML error page into {"0":"<","1":"h",…}; spreading an array turns a list
  // response into index keys and kills .map(). Both ride under `data` instead.
  const merge: Record<string, unknown> =
    typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : { data: body };

  // Envelope LAST: a resource with its own `status` field ("active") must not
  // overwrite the HTTP status.
  if (!res.ok) {
    return {
      ...merge,
      success: false,
      status: res.status,
      message:
        typeof merge.message === "string" ? merge.message : "An error occurred",
      errors: merge.errors,
    };
  }

  return { ...merge, success: true, status: res.status };
}
```

## `src/lib/handleResponse.ts`

```ts
import { redirect } from "next/navigation";
import { toast } from "sonner";

interface HandleResponseProps {
  response: any;
  showErrorToast?: boolean;
  showSuccessToast?: boolean;
}

export const handleResponse = async ({
  response,
  showErrorToast = true,
  showSuccessToast = false,
}: HandleResponseProps) => {
  // 401 — the session is dead. apiFetch clears the auth cookies before it
  // signals `unauthorized`, so here we just send the user to the login page
  // (the middleware prepends the active locale).
  if (response.unauthorized) {
    if (typeof window !== "undefined") {
      const { userStore } = await import("@/src/store/userStore");
      userStore.getState().clearUser();

      if (showErrorToast) {
        const errorMessage =
          response.error ||
          response.message ||
          response.body?.message ||
          "An error occurred";
        toast.error(errorMessage);
      }

      window.location.href = "/auth/login";
      return response;
    }

    redirect("/auth/login");
  }

  // Toasts are client-only
  if (typeof window !== "undefined") {
    if (response.success && showSuccessToast && response.message) {
      toast.success(response.message);
    }

    if (!response.success && showErrorToast) {
      const errorMessage =
        response.error ||
        response.message ||
        response.body?.message ||
        "An error occurred";
      toast.error(errorMessage);
    }
  }

  return response;
};
```

## `src/lib/callApi.ts`

```ts
import { handleResponse } from "./handleResponse";

interface CallApiOptions {
  showSuccessToast?: boolean;
  showErrorToast?: boolean;
}

export async function callApi<T>(
  request: Promise<T>,
  options: CallApiOptions = {},
): Promise<T> {
  const response = await request;
  await handleResponse({ response, ...options });
  return response;
}
```

## Endpoints — `src/apis.ts`

`"use server"` at the top. One exported function per route, `SCREAMING_CASE`, `apiFetch`
then `handleResponse`. A `"use server"` module may only export `async` functions — no
constants, no types, no sync helpers:

```ts
"use server";

export async function GET_TENANTS_KPIS() {
  const response = await apiFetch("/dashboards/tenants/kpis", {
    method: "GET",
    next: {
      tags: ["customers-kpis"],
    },
  });
  return handleResponse({ response });
}

export async function CREATE_CUSTOMER({ data }: { data: CustomerInput }) {
  const response = await apiFetch("/customers", {
    method: "POST",
    body: data,
    revalidateTags: ["customers"],
  });
  return handleResponse({ response });
}
```

## Calling them

**Server Component** — call the endpoint directly. No toast is possible there; a 401
redirects on its own.

```tsx
const res = await GET_TENANTS_KPIS();
if (!res.success) return <ErrorState message={res.message} />;
```

**Client component** — always through `callApi`, or no toast will ever fire:

```tsx
const res = await callApi(LOGIN({ data }), { showSuccessToast: true });
if (res?.success) router.push("/");
```

Toasts belong to `handleResponse`. Components never call `toast.*` themselves.

## The return contract

`apiFetch` **never throws** for API failures — it returns one of these. Check `success`
before touching data. `redirect()` and `notFound()` are the only things that propagate.

| Case | Shape |
|---|---|
| JSON success | `{ success: true, status, ...body }` |
| HTTP error | `{ success: false, status, message, errors?, ...body }` |
| Session expired | `{ unauthorized: true, redirect: "/auth/login", message }` |
| Network failure | `{ success: false, status: 0, message, data: null, networkError: true }` |
| Non-JSON / array success | `{ success: true, status, data: <string \| array> }` |

## Options

| Option | Effect |
|---|---|
| `params` | Query object. Arrays join with `,`; `undefined` is dropped. |
| `revalidateTags` | Tags to `revalidateTag()` after the response arrives. |
| `next.tags` | Tags this response is cached under, for later revalidation. |
| `includeAuth: false` | Omit the bearer — public endpoints only. |
| `useRefreshToken` | Send the refresh token as bearer. Refresh endpoint only. |
| `ignore401Redirect` | Return the 401 instead of refreshing/redirecting. |

`callApi` takes `showSuccessToast` (default `false`) and `showErrorToast` (default `true`).

Body is JSON-stringified automatically unless it is `FormData` — pass `FormData` raw and
the `Content-Type` is left for the browser to set with its boundary.

## Rules

- **Never call `fetch()` against the API.** Endpoints use `apiFetch`; everything else uses
  an endpoint.
- **Client code always goes through `callApi`.** Awaiting an endpoint directly from a client
  component silently swallows every toast — the failure is invisible, which is what makes it
  worth a rule.
- **Never call `toast.*` in a component.** Pass `showSuccessToast` / `showErrorToast` instead.
- **Never read a token in client code.** They are `httpOnly`; the browser cannot see them.
- **Validate every argument inside the endpoint.** Each export in a `"use server"` file is a
  public HTTP endpoint that anyone can call with any payload. A client-side zod check is a UX
  affordance, not a guard — an id, tenant, or role arriving as an argument must be
  re-validated against the session on the server.
- **Success toasts need a server `message`.** `handleResponse` only fires one when the body
  carries `message`, so `showSuccessToast: true` on a message-less endpoint does nothing.
- **`revalidateTags` on every mutation** that changes data a cached page renders, and
  `next.tags` on the reads that cache it.
- **POST is never retried.** A non-POST endpoint that is not safely repeatable must not rely
  on the retry being off.

## Known sharp edges

Real, and left in place — change them deliberately, not by accident.

- **`handleResponse` runs twice per client call** — once inside the endpoint on the server
  (inert: no `window`, so no toast), once inside `callApi` on the client. Only the second
  can toast, so any side effect added to `handleResponse` executes twice.
- **The client 401 branch is mostly unreachable.** The endpoint runs as a Server Action, so
  its own `handleResponse` takes the `window === undefined` branch and calls
  `redirect("/auth/login")`, which throws `NEXT_REDIRECT`. Next converts that to a client
  navigation, so the action never resolves and `callApi`'s second pass never runs —
  `userStore.clearUser()` and the 401 toast only fire when `handleResponse` is called
  directly on the client. **Clear the user store on the login page mount**, not here; that
  covers every route into logout.
- **`response.error` and `response.body?.message` are dead reads.** `apiFetch` emits
  neither — only `message`. They can appear solely via the merged body.
- **The 401 fallback message is hardcoded Arabic/English**, not read from the locale files —
  the one deliberate break in the i18n rule, because it runs where `t()` is unavailable.
- **The chain is untyped.** `response: any` through `handleResponse`, and `apiFetch` has no
  generic, so nothing forces a call site to check `success` before reading data.
- **A `Blob` or `URLSearchParams` body silently becomes `"{}"`.** `isPlainObject` only
  excludes `FormData` and `ArrayBuffer`, so anything else non-plain gets `JSON.stringify`d
  into an empty object. Send binary as `FormData`.

## Fixed in this version

These were bugs in the original and are corrected above. If an existing repo still has the
old `parseResponse`, it has all four.

| Bug | Was | Now |
|---|---|---|
| Non-object error body | `...body` spread an HTML page into `{"0":"<","1":"h",…}` | non-objects ride under `data` |
| Top-level array success | spread into index keys — `.map()` throws | rides under `data` |
| Non-JSON success | returned the bare string, so `success` was `undefined` and `handleResponse` fired an **error toast on a successful request** | enveloped as `{ success: true, data }` |
| Body with its own `status` | a resource `status: "active"` overwrote the HTTP status | envelope spread **last**, so it wins |
| Retry verb test | `method !== "POST"` also retried PATCH, which is not idempotent | `["GET","HEAD","OPTIONS"]` only |
