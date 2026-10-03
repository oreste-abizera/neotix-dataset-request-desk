import { cn } from "@/lib/cn";

/** Brand mark: three stacked frames (episodes) with the front one "recording". */
export function Logo({
  className,
  withWordmark = true,
}: {
  className?: string;
  withWordmark?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect x="6" y="3" width="22" height="14" rx="3" className="fill-primary opacity-30" />
        <rect x="4" y="8" width="22" height="14" rx="3" className="fill-primary opacity-60" />
        <rect x="2" y="13" width="22" height="14" rx="3" className="fill-primary" />
        <circle cx="8" cy="20" r="2.6" className="fill-primary-foreground" />
      </svg>
      {withWordmark && <span className="font-semibold tracking-tight">Dataset Request Desk</span>}
    </span>
  );
}
