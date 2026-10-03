import { useMemo } from "react";
import { cn } from "@/lib/cn";

export interface Bucket {
  label: string;
  /** Full description for the hover title and the screen-reader summary. */
  title: string;
  values: Record<string, number>;
}

// Static class names so Tailwind includes them; five series match the five robots.
const SERIES_CLASS = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5"];

/**
 * Stacked bars built from plain elements (no charting library): scales with its container, keeps
 * text readable on phones, and is paired with a data table by the caller for non-visual access.
 */
export function BarChart({
  buckets,
  series,
  summary,
}: {
  buckets: Bucket[];
  series: string[];
  summary: string;
}) {
  const totals = useMemo(
    () => buckets.map((b) => Object.values(b.values).reduce((a, n) => a + n, 0)),
    [buckets],
  );
  const max = Math.max(1, ...totals);
  const first = buckets[0]?.label;
  const last = buckets.at(-1)?.label;

  return (
    <figure className="flex flex-col gap-3">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Legend">
        {series.map((s, i) => (
          <li key={s} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className={cn("size-2.5 rounded-sm", SERIES_CLASS[i % SERIES_CLASS.length])}
            />
            {s}
          </li>
        ))}
      </ul>
      <div role="img" aria-label={summary} className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 flex h-44 flex-col justify-between sm:h-56"
        >
          {[max, Math.round(max / 2), 0].map((n, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-8 text-right tabular">{n}</span>
              <span className="h-px flex-1 bg-line" />
            </div>
          ))}
        </div>
        <div className="relative ml-10 flex h-44 items-end gap-px sm:h-56">
          {buckets.map((b, bi) => (
            <div
              key={b.label}
              title={b.title}
              className="flex h-full min-w-0 flex-1 flex-col-reverse"
            >
              {series.map((s, si) => {
                const v = b.values[s] ?? 0;
                return v > 0 ? (
                  <div
                    key={s}
                    className={cn(
                      SERIES_CLASS[si % SERIES_CLASS.length],
                      "min-h-px first:rounded-b-[2px] last:rounded-t-[2px]",
                    )}
                    style={{ height: `${(v / max) * 100}%` }}
                  />
                ) : null;
              })}
              <span className="sr-only">{totals[bi]}</span>
            </div>
          ))}
        </div>
        <div aria-hidden className="mt-1 ml-10 flex justify-between text-xs text-muted-foreground">
          <span>{first}</span>
          <span>{last}</span>
        </div>
      </div>
    </figure>
  );
}
