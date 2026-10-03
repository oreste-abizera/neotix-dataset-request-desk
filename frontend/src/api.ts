export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: body !== undefined && !isForm ? { "Content-Type": "application/json" } : undefined,
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error;
    throw new ApiError(res.status, e?.code ?? "error", e?.message ?? res.statusText, e?.details);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => call<T>("GET", path),
  post: <T>(path: string, body?: unknown) => call<T>("POST", path, body ?? {}),
  patch: <T>(path: string, body: unknown) => call<T>("PATCH", path, body),
  del: <T>(path: string) => call<T>("DELETE", path),
};

/** Human-readable text for any error, including per-field validation and assignment failures. */
export function describeError(err: unknown): string {
  if (!(err instanceof ApiError)) return "Something went wrong. Please try again.";
  const d = err.details as any;
  if (err.code === "validation_error" && Array.isArray(d))
    return d.map((x: { field: string; message: string }) => `${x.field}: ${x.message}`).join("; ");
  if (err.code === "assignment_rejected" && d?.failures)
    return `${err.message} ` + d.failures.map((f: any) => `${f.episode_id} (${f.reason})`).join(", ");
  if (err.code === "insufficient_episodes" && d)
    return `${err.message} (${d.assigned} of ${d.required} assigned)`;
  return err.message;
}
