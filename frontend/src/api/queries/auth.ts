import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "../client";
import { ApiError } from "../errors";
import { keys } from "../keys";
import type { User } from "../types";

/**
 * Replace the session: drop every cached query except "who am I", then set that one.
 * (queryClient.clear() would also detach the observers that are watching "who am I", and the
 * UI would never learn that the user changed.)
 */
export function resetSession(qc: QueryClient, user: User | null): void {
  void qc.cancelQueries();
  qc.removeQueries({ predicate: (q) => q.queryKey[0] !== keys.me[0] });
  qc.setQueryData(keys.me, user);
}

/** The signed-in user, or null when there is no valid session (not an error). */
export function useMe() {
  return useQuery({
    queryKey: keys.me,
    staleTime: 5 * 60_000,
    queryFn: async ({ signal }) => {
      try {
        return await api.get<User>("/auth/me", signal);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (credentials: { email: string; password: string }) =>
      api.post<User>("/auth/login", credentials),
    onSuccess: (user) => resetSession(qc, user), // never show another user's cached data
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>("/auth/logout"),
    onSettled: () => resetSession(qc, null),
  });
}
