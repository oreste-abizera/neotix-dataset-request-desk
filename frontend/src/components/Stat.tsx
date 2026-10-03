import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Stat({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-line bg-surface p-4 shadow-xs", className)}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular sm:text-2xl">{value}</dd>
      {hint && <dd className="mt-0.5 text-sm text-muted-foreground">{hint}</dd>}
    </div>
  );
}
