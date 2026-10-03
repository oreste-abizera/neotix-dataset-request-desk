const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const dateOnly = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

export const formatDateTime = (iso: string): string => dateTime.format(new Date(iso));

/** 'YYYY-MM-DD' (a calendar date, no timezone) or an ISO instant, shown as a medium date. */
export function formatDate(value: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return dateOnly.format(d);
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "5 minutes ago", "yesterday", "in 3 days". */
export function formatRelative(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) return relative.format(Math.round(diff / ms), unit);
  }
  return "just now";
}

export interface DueInfo {
  label: string;
  overdue: boolean;
  soon: boolean;
}

/** Deadline wording relative to today, in calendar days. */
export function dueIn(deadline: string, now = new Date()): DueInfo {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const due = new Date(`${deadline}T00:00:00`).getTime();
  const days = Math.round((due - today) / 86_400_000);
  if (days < 0) {
    const n = -days;
    return { label: `Overdue by ${n} ${n === 1 ? "day" : "days"}`, overdue: true, soon: false };
  }
  if (days === 0) return { label: "Due today", overdue: false, soon: true };
  if (days === 1) return { label: "Due tomorrow", overdue: false, soon: true };
  return { label: `Due in ${days} days`, overdue: false, soon: days <= 3 };
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "n/a";
  const h = seconds / 3600;
  if (h >= 48) return `${(h / 24).toFixed(1)} days`;
  if (h >= 1) return `${h.toFixed(1)} h`;
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}

export const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`;

export const isoDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
