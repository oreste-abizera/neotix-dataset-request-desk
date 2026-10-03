import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Horizontal scroll container that is keyboard-reachable and labelled (axe: scrollable-region-focusable).
 * `relative` matters: absolutely positioned sr-only text inside the table would otherwise be placed
 * against the page and widen it on small screens.
 */
export function TableScroll({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="region"
      aria-label={label}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable regions must be focusable
      tabIndex={0}
      className="relative overflow-x-auto rounded-md"
    >
      {children}
    </div>
  );
}

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full border-collapse text-left", className)} {...props} />;
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn(
        "bg-muted px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground first:pl-4 last:pr-4",
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn(
        "border-t border-line px-3 py-2.5 align-middle first:pl-4 last:pr-4",
        className,
      )}
      {...props}
    />
  );
}
