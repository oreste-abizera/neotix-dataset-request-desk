import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import { keys } from "../keys";
import type { Role, User } from "../types";

export function useUsers() {
  return useQuery({
    queryKey: keys.users,
    queryFn: ({ signal }) => api.get<User[]>("/users", signal),
  });
}

export interface NewUser {
  email: string;
  name: string;
  role: Role;
  password: string;
  organisation: string | null;
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: NewUser) => api.post<User>("/users", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.users }),
  });
}

/** Optimistic: the change shows immediately and rolls back if the server refuses. */
export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<Pick<User, "role" | "is_active">> }) =>
      api.patch<User>(`/users/${id}`, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: keys.users });
      const previous = qc.getQueryData<User[]>(keys.users);
      qc.setQueryData<User[]>(keys.users, (list) =>
        list?.map((u) => (u.id === id ? { ...u, ...patch } : u)),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(keys.users, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.users }),
  });
}
