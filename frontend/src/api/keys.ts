import type { Status } from "./types";

/** Central query keys so invalidation (including SSE-driven) is predictable. */
export const keys = {
  me: ["me"] as const,
  requests: ["requests"] as const,
  requestList: (status: Status | "", page: number) => ["requests", "list", status, page] as const,
  request: (id: number) => ["requests", "detail", id] as const,
  episodes: ["episodes"] as const,
  taskNames: ["episodes", "task-names"] as const,
  users: ["users"] as const,
  imports: ["imports"] as const,
  analytics: (from: string, to: string) => ["analytics", from, to] as const,
};
