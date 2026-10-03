import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "../client";
import { keys } from "../keys";
import type { Analytics } from "../types";

export function useAnalytics(from: string, to: string) {
  return useQuery({
    queryKey: keys.analytics(from, to),
    enabled: from <= to,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => api.get<Analytics>(`/analytics?from=${from}&to=${to}`, signal),
  });
}
