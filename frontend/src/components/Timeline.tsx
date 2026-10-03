import type { StatusEvent } from "@/api/types";
import { formatDateTime, formatRelative } from "@/lib/format";
import { StatusBadge } from "./StatusBadge";

/** Who changed the status, and when. Newest first. */
export function Timeline({ events }: { events: StatusEvent[] }) {
  const items = [...events].reverse();
  return (
    <ol className="relative flex flex-col gap-5 border-l border-line pl-5">
      {items.map((e, i) => (
        <li key={`${e.created_at}-${e.to_status}-${i}`} className="relative">
          <span
            aria-hidden
            className="absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-surface bg-primary"
          />
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={e.to_status} />
            <span className="text-base">
              {e.from_status === null ? "created by" : "by"} {e.actor_name}
            </span>
          </div>
          <time
            dateTime={e.created_at}
            title={formatDateTime(e.created_at)}
            className="text-sm text-muted-foreground"
          >
            {formatRelative(e.created_at)}
          </time>
        </li>
      ))}
    </ol>
  );
}
