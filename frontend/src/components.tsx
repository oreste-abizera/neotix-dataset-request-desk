import type { ReactNode } from "react";
import { STATUS_LABEL } from "./format";
import type { Status } from "./types";

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
