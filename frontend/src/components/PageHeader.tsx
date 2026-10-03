import type { ReactNode } from "react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

/**
 * Page title (the h1 that receives focus on navigation) with optional description and actions.
 * Also sets the document title, so every page has a distinct tab title and screen-reader context.
 */
export function PageHeader({
  title,
  description,
  actions,
  documentTitle,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  documentTitle?: string;
}) {
  useDocumentTitle(documentTitle ?? title);
  return (
    <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 tabIndex={-1} className="text-xl outline-none sm:text-2xl">
          {title}
        </h1>
        {description && <p className="mt-1 text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
