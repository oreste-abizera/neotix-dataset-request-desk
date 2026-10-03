import type { ReactNode } from "react";
import { STATUS_LABEL } from "./format";
import type { ExportInfo, Status } from "./types";

export const StatusBadge = ({ status }: { status: Status }) => (
  <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>
);

export const ErrorText = ({ message }: { message: string | null }) =>
  message ? (
    <p className="error" role="alert">
      {message}
    </p>
  ) : null;

export const Card = ({ title, children }: { title?: string; children: ReactNode }) => (
  <section className="card">
    {title && <h2>{title}</h2>}
    {children}
  </section>
);

export function ExportBadge({ info }: { info: ExportInfo | null | undefined }) {
  if (!info) return <span className="muted">n/a</span>;
  const tries = `${info.attempts}/${info.max_attempts}`;
  switch (info.status) {
    case "succeeded":
      return <span className="badge badge-accepted">Exported</span>;
    case "running":
      return <span className="badge badge-in_progress">Exporting… (try {tries})</span>;
    case "failed":
      return (
        <span className="badge badge-rejected" title={info.last_error ?? undefined}>
          Failed ({tries})
        </span>
      );
    default:
      return info.attempts === 0 ? (
        <span className="badge">Queued</span>
      ) : (
        <span className="badge badge-submitted" title={info.last_error ?? undefined}>
          Retrying (after try {info.attempts})
        </span>
      );
  }
}
