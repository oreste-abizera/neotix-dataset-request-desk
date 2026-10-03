import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "../client";
import { keys } from "../keys";
import type { EpisodePage } from "../types";

export const EPISODES_PAGE_SIZE = 25;

export interface EpisodeFilters {
  task: string;
  quality: "" | "good" | "usable" | "bad";
  page: number;
}

/** Unassigned episodes matching the filters (what an operator can still assign). */
export function useEpisodes({ task, quality, page }: EpisodeFilters, enabled = true) {
  return useQuery({
    queryKey: [...keys.episodes, "list", task, quality, page],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => {
      const q = new URLSearchParams({
        page: String(page),
        page_size: String(EPISODES_PAGE_SIZE),
        unassigned: "true",
      });
      if (task) q.set("task_name", task);
      if (quality) q.set("quality", quality);
      return api.get<EpisodePage>(`/episodes?${q}`, signal);
    },
  });
}

export function useTaskNames(enabled = true) {
  return useQuery({
    queryKey: keys.taskNames,
    enabled,
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) => api.get<string[]>("/episodes/task-names", signal),
  });
}
