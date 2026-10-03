import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./button";

export function Pagination({
  page,
  hasNext,
  onPage,
  busy,
  total,
  pageSize,
}: {
  page: number;
  hasNext: boolean;
  onPage: (page: number) => void;
  busy?: boolean;
  total?: number;
  pageSize?: number;
}) {
  const pages = total && pageSize ? Math.max(1, Math.ceil(total / pageSize)) : null;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 py-3">
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1 || busy}
        onClick={() => onPage(page - 1)}
      >
        <ChevronLeft className="size-4" aria-hidden />
        Previous
      </Button>
      <span className="text-sm text-muted-foreground tabular" aria-live="polite">
        Page {page}
        {pages ? ` of ${pages}` : ""}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={!hasNext || busy}
        onClick={() => onPage(page + 1)}
      >
        Next
        <ChevronRight className="size-4" aria-hidden />
      </Button>
    </nav>
  );
}
