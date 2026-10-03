import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import { keys } from "../keys";
import type { ImportReport, ImportRunSummary } from "../types";

export function useImportRuns() {
  return useQuery({
    queryKey: keys.imports,
    queryFn: ({ signal }) => api.get<ImportRunSummary[]>("/imports", signal),
  });
}

export function useImportCsv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append("file", file);
      return api.post<ImportReport>("/imports", body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.imports });
      void qc.invalidateQueries({ queryKey: keys.episodes });
      void qc.invalidateQueries({ queryKey: ["analytics"] });
    },
  });
}
