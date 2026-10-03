export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface FieldDetail {
  field: string;
  message: string;
}

interface AssignmentFailure {
  episode_id: string;
  reason: string;
}

const isFieldDetails = (d: unknown): d is FieldDetail[] =>
  Array.isArray(d) &&
  d.every((x) => typeof x?.field === "string" && typeof x?.message === "string");

const REASONS: Record<string, string> = {
  not_found: "does not exist",
  quality_not_assignable: "is rated bad and cannot be assigned",
  already_assigned: "is already assigned to a request",
  already_assigned_to_this_request: "is already assigned to this request",
};

/** Per-field messages from a 422 validation error ({} for any other error). */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || error.code !== "validation_error") return {};
  if (!isFieldDetails(error.details)) return {};
  return Object.fromEntries(error.details.map((d) => [d.field, d.message]));
}

/** One human-readable sentence for any error. */
export function describeError(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return error instanceof TypeError
      ? "Could not reach the server. Check your connection and try again."
      : "Something went wrong. Please try again.";
  }
  const { code, details } = error;
  if (code === "validation_error" && isFieldDetails(details)) {
    return details.map((d) => `${d.field}: ${d.message}`).join("; ");
  }
  if (code === "assignment_rejected") {
    const failures = (details as { failures?: AssignmentFailure[] } | undefined)?.failures ?? [];
    const list = failures.map((f) => `${f.episode_id} ${REASONS[f.reason] ?? f.reason}`).join("; ");
    return `Nothing was assigned. ${list}`.trim();
  }
  if (code === "insufficient_episodes") {
    const d = details as { assigned: number; required: number } | undefined;
    return d
      ? `Only ${d.assigned} of ${d.required} episodes are assigned. Assign ${d.required - d.assigned} more before delivering.`
      : error.message;
  }
  if (error.status === 403) return "You do not have permission to do that.";
  if (error.status >= 500) return "The server had a problem. Please try again in a moment.";
  return error.message;
}
