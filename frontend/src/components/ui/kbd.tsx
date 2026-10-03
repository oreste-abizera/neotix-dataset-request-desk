import type { ReactNode } from "react";

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-6 items-center justify-center rounded-md border border-line bg-muted px-1.5 py-0.5 font-sans text-xs font-medium text-muted-foreground">
      {children}
    </kbd>
  );
}
