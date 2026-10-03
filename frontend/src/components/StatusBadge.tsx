import {
  CircleCheck,
  CircleDashed,
  CircleX,
  Clock,
  Inbox,
  PackageCheck,
  RefreshCw,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type { ExportInfo, Status } from "@/api/types";
import { cn } from "@/lib/cn";
import { STATUS_LABEL } from "@/lib/copy";

// Full class names (not built dynamically) so Tailwind can see them at build time.
const STATUS_STYLE: Record<Status, string> = {
  submitted: "bg-status-submitted text-status-submitted-fg",
  in_progress: "bg-status-in_progress text-status-in_progress-fg",
  delivered: "bg-status-delivered text-status-delivered-fg",
  accepted: "bg-status-accepted text-status-accepted-fg",
  rejected: "bg-status-rejected text-status-rejected-fg",
};

const STATUS_ICON: Record<Status, LucideIcon> = {
  submitted: Inbox,
  in_progress: CircleDashed,
  delivered: PackageCheck,
  accepted: CircleCheck,
  rejected: CircleX,
};

const pill =
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-medium whitespace-nowrap";

/** Status is always conveyed by text and an icon, never by color alone. */
export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const Icon = STATUS_ICON[status];
  return (
    <span className={cn(pill, STATUS_STYLE[status], className)}>
      <Icon className="size-3.5" aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function ExportBadge({ info }: { info: ExportInfo | null | undefined }) {
  if (!info) return <span className="text-muted-foreground">n/a</span>;
  const tries = `${info.attempts}/${info.max_attempts}`;
  switch (info.status) {
    case "succeeded":
      return (
        <span className={cn(pill, "bg-status-accepted text-status-accepted-fg")}>
          <CircleCheck className="size-3.5" aria-hidden /> Exported
        </span>
      );
    case "running":
      return (
        <span className={cn(pill, "bg-status-in_progress text-status-in_progress-fg")}>
          <RefreshCw className="size-3.5 animate-spin" aria-hidden /> Exporting (try {tries})
        </span>
      );
    case "failed":
      return (
        <span
          className={cn(pill, "bg-status-rejected text-status-rejected-fg")}
          title={info.last_error ?? undefined}
        >
          <TriangleAlert className="size-3.5" aria-hidden /> Failed ({tries})
        </span>
      );
    default:
      return info.attempts === 0 ? (
        <span className={cn(pill, "bg-status-neutral text-status-neutral-fg")}>
          <Clock className="size-3.5" aria-hidden /> Queued
        </span>
      ) : (
        <span
          className={cn(pill, "bg-status-submitted text-status-submitted-fg")}
          title={info.last_error ?? undefined}
        >
          <RefreshCw className="size-3.5" aria-hidden /> Retrying (after try {info.attempts})
        </span>
      );
  }
}
