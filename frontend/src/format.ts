import type { Status } from "./types";

export const STATUS_LABEL: Record<Status, string> = {
  submitted: "Submitted",
  in_progress: "In progress",
  delivered: "Delivered",
  accepted: "Accepted",
  rejected: "Rejected",
};

export const ACTION_LABEL: Record<Status, string> = {
  submitted: "Submit",
  in_progress: "Start work",
  delivered: "Mark delivered",
  accepted: "Accept delivery",
  rejected: "Reject delivery",
};

export const fmtDate = (iso: string) => new Date(iso).toLocaleString();

export function fmtDuration(seconds: number | null): string {
  if (seconds === null) return "n/a";
  const h = seconds / 3600;
  return h >= 48 ? `${(h / 24).toFixed(1)} days` : h >= 1 ? `${h.toFixed(1)} h` : `${Math.round(seconds / 60)} min`;
}
