import { ApiError } from "./errors";

export const SESSION_EXPIRED_EVENT = "session-expired";

interface Options {
  body?: unknown;
  signal?: AbortSignal;
}

async function call<T>(method: string, path: string, { body, signal }: Options = {}): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    method,
    signal,
    credentials: "same-origin",
    headers: body !== undefined && !isForm ? { "Content-Type": "application/json" } : undefined,
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    // A 401 anywhere except the sign-in form or the "who am I" probe means the session ended
    // (expiry, deactivation, sign-out elsewhere): tell the app to return to the login screen.
    if (res.status === 401 && path !== "/auth/login" && path !== "/auth/me") {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    const e = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)
      ?.error;
    throw new ApiError(res.status, e?.code ?? "error", e?.message ?? res.statusText, e?.details);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => call<T>("GET", path, { signal }),
  post: <T>(path: string, body: unknown = {}) => call<T>("POST", path, { body }),
  patch: <T>(path: string, body: unknown) => call<T>("PATCH", path, { body }),
  del: <T>(path: string) => call<T>("DELETE", path),
};
