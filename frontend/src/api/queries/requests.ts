import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { api } from "../client";
import { keys } from "../keys";
import type { RequestDetail, RequestRow, Status } from "../types";

export const REQUESTS_PAGE_SIZE = 20;

export function useRequests(status: Status | "", page: number, enabled = true) {
  return useQuery({
    queryKey: keys.requestList(status, page),
    enabled,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => {
      // Ask for one extra row to learn whether a next page exists (the API returns a bare list).
      const q = new URLSearchParams({
        limit: String(REQUESTS_PAGE_SIZE + 1),
        offset: String((page - 1) * REQUESTS_PAGE_SIZE),
      });
      if (status) q.set("status", status);
      return api.get<RequestRow[]>(`/requests?${q}`, signal);
    },
    select: (rows) => ({
      rows: rows.slice(0, REQUESTS_PAGE_SIZE),
      hasNext: rows.length > REQUESTS_PAGE_SIZE,
    }),
  });
}

export function useRequest(id: number) {
  return useQuery({
    queryKey: keys.request(id),
    enabled: Number.isInteger(id),
    queryFn: ({ signal }) => api.get<RequestDetail>(`/requests/${id}`, signal),
  });
}

/** After a mutation returns the fresh detail, store it and refresh the lists that show it. */
function adopt(qc: QueryClient, detail: RequestDetail) {
  qc.setQueryData(keys.request(detail.id), detail);
  void qc.invalidateQueries({
    queryKey: keys.requests,
    predicate: (q) => q.queryKey[1] === "list",
  });
}

export interface NewRequest {
  task_name: string;
  episodes_requested: number;
  deadline: string;
  notes: string;
}

export function useCreateRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: NewRequest) => api.post<RequestDetail>("/requests", body),
    onSuccess: (detail) => adopt(qc, detail),
  });
}

export function useTransition(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (to: Status) => api.post<RequestDetail>(`/requests/${id}/transitions`, { to }),
    onSuccess: (detail) => adopt(qc, detail),
  });
}

export function useAssign(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (episodeIds: string[]) =>
      api.post<RequestDetail>(`/requests/${id}/assignments`, { episode_ids: episodeIds }),
    onSuccess: (detail) => {
      adopt(qc, detail);
      void qc.invalidateQueries({ queryKey: keys.episodes }); // they are no longer "unassigned"
    },
    // A rejected batch may mean someone else took an episode: refresh the candidate list.
    onError: () => void qc.invalidateQueries({ queryKey: keys.episodes }),
  });
}

/** Optimistic: the row disappears at once and comes back if the server refuses. */
export function useUnassign(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (episodeId: string) =>
      api.del<RequestDetail>(`/requests/${id}/assignments/${encodeURIComponent(episodeId)}`),
    onMutate: async (episodeId) => {
      await qc.cancelQueries({ queryKey: keys.request(id) });
      const previous = qc.getQueryData<RequestDetail>(keys.request(id));
      if (previous) {
        qc.setQueryData<RequestDetail>(keys.request(id), {
          ...previous,
          assigned_count: Math.max(0, previous.assigned_count - 1),
          episodes: previous.episodes.filter((e) => e.episode_id !== episodeId),
        });
      }
      return { previous };
    },
    onError: (_err, _episodeId, ctx) => {
      if (ctx?.previous) qc.setQueryData(keys.request(id), ctx.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.request(id) });
      void qc.invalidateQueries({ queryKey: keys.episodes });
    },
  });
}

export function useRetryExports(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<RequestDetail>(`/requests/${id}/exports/retry`),
    onSuccess: (detail) => adopt(qc, detail),
  });
}
