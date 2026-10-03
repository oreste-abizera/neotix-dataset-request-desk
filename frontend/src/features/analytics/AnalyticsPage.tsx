import { BarChart3 } from "lucide-react";
import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { describeError } from "@/api/errors";
import { useAnalytics } from "@/api/queries/analytics";
import type { Analytics, Status } from "@/api/types";
import { BarChart, type Bucket } from "@/components/BarChart";
import { PageHeader } from "@/components/PageHeader";
import { Stat } from "@/components/Stat";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FilterChips } from "@/components/ui/filter-chips";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, EmptyState, ErrorState } from "@/components/ui/states";
import { Table, TableScroll, Td, Th } from "@/components/ui/table";
import { STATUS_LABEL, STATUS_ORDER } from "@/lib/copy";
import { formatDate, formatDuration, isoDate, plural } from "@/lib/format";

type Range = "7" | "30" | "90" | "custom";
const RANGES = [
  { value: "7" as Range, label: "7 days" },
  { value: "30" as Range, label: "30 days" },
  { value: "90" as Range, label: "90 days" },
  { value: "custom" as Range, label: "Custom" },
];
const WEEKLY_AFTER_DAYS = 45;

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDate(d);
}

/** Group daily points per robot into chart buckets (weekly when the range is long). */
export function toBuckets(
  points: Analytics["episodes_per_day_per_robot"],
  from: string,
  to: string,
) {
  const robots = [...new Set(points.map((p) => p.robot_id))].sort();
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  const spanDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const step = spanDays > WEEKLY_AFTER_DAYS ? 7 : 1;
  const byDay = new Map<string, Record<string, number>>();
  for (const p of points)
    byDay.set(p.day, { ...(byDay.get(p.day) ?? {}), [p.robot_id]: p.episodes });

  const buckets: Bucket[] = [];
  for (let i = 0; i < spanDays; i += step) {
    const values: Record<string, number> = {};
    for (let j = 0; j < step && i + j < spanDays; j++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i + j);
      for (const [robot, n] of Object.entries(byDay.get(isoDate(d)) ?? {}))
        values[robot] = (values[robot] ?? 0) + n;
    }
    const first = new Date(start);
    first.setDate(first.getDate() + i);
    const total = Object.values(values).reduce((a, n) => a + n, 0);
    const detail = robots
      .filter((r) => values[r])
      .map((r) => `${r} ${values[r]}`)
      .join(", ");
    buckets.push({
      label: formatDate(isoDate(first)),
      title: `${step > 1 ? "Week of " : ""}${formatDate(isoDate(first))}: ${total} ${total === 1 ? "episode" : "episodes"}${detail ? ` (${detail})` : ""}`,
      values,
    });
  }
  return { buckets, robots, step };
}

function Content({ data, from, to }: { data: Analytics; from: string; to: string }) {
  const { buckets, robots, step } = useMemo(
    () => toBuckets(data.episodes_per_day_per_robot, from, to),
    [data, from, to],
  );
  const totalEpisodes = data.episodes_per_day_per_robot.reduce((a, p) => a + p.episodes, 0);
  const peak = buckets.reduce(
    (best, b) => {
      const t = Object.values(b.values).reduce((a, n) => a + n, 0);
      return t > best.t ? { t, label: b.label } : best;
    },
    { t: 0, label: "" },
  );
  const topMax = Math.max(1, ...data.top_tasks_by_good_episodes.map((t) => t.good_episodes));
  const r = data.requests;

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="fulfilment">
        <h2 id="fulfilment" className="mb-3 text-md">
          Request fulfilment
        </h2>
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          {STATUS_ORDER.map((s: Status) => (
            <Stat key={s} label={STATUS_LABEL[s]} value={r.by_status[s]} />
          ))}
          <Stat label="Submitted in range" value={r.total} />
          <Stat
            label="Median time to delivery"
            value={formatDuration(r.median_seconds_submitted_to_delivered)}
            hint={`${plural(r.delivered_count, "request")} delivered`}
            className="col-span-2 md:col-span-1"
          />
        </dl>
      </section>

      <Card>
        <CardHeader
          title="Episodes recorded"
          description={`${totalEpisodes.toLocaleString()} in this range${step > 1 ? ", grouped by week" : ""}${peak.t ? `. Busiest: ${peak.label} (${peak.t})` : ""}`}
        />
        <CardBody>
          {totalEpisodes === 0 ? (
            <EmptyState
              icon={BarChart3}
              title="No episodes recorded in this range"
              description="Try a longer range, or import more episodes."
            />
          ) : (
            <>
              <BarChart
                buckets={buckets}
                series={robots}
                summary={`Episodes recorded per ${step > 1 ? "week" : "day"}, stacked by robot. ${totalEpisodes} in total.${peak.t ? ` Busiest: ${peak.label} with ${peak.t}.` : ""}`}
              />
              <details className="mt-4">
                <summary className="inline-flex min-h-9 items-center rounded-md text-base font-medium text-primary">
                  View data as a table
                </summary>
                <div className="mt-2">
                  <TableScroll label="Episodes per day and robot">
                    <Table>
                      <caption className="sr-only">
                        Episodes recorded per {step > 1 ? "week" : "day"} and robot
                      </caption>
                      <thead>
                        <tr>
                          <Th>{step > 1 ? "Week of" : "Day"}</Th>
                          {robots.map((x) => (
                            <Th key={x} className="text-right">
                              {x}
                            </Th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {buckets
                          .filter((b) => Object.keys(b.values).length > 0)
                          .map((b) => (
                            <tr key={b.label}>
                              <Td className="whitespace-nowrap">{b.label}</Td>
                              {robots.map((x) => (
                                <Td key={x} className="text-right tabular">
                                  {b.values[x] ?? "·"}
                                </Td>
                              ))}
                            </tr>
                          ))}
                      </tbody>
                    </Table>
                  </TableScroll>
                </div>
              </details>
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Top tasks by good episodes"
          description="Only episodes rated good are counted."
        />
        <CardBody>
          {data.top_tasks_by_good_episodes.length === 0 ? (
            <p className="text-muted-foreground">No good episodes were recorded in this range.</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {data.top_tasks_by_good_episodes.map((t) => (
                <li key={t.task_name}>
                  <div className="mb-1 flex justify-between gap-3">
                    <span className="capitalize">{t.task_name}</span>
                    <span className="font-medium tabular">{t.good_episodes.toLocaleString()}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <div
                      className="h-full rounded-full bg-chart-1"
                      style={{ width: `${(t.good_episodes / topMax) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

export default function AnalyticsPage() {
  const [params, setParams] = useSearchParams();
  const rangeParam = params.get("range");
  const range: Range =
    rangeParam === "7" || rangeParam === "90" || rangeParam === "custom" ? rangeParam : "30";
  const today = isoDate(new Date());
  const from =
    range === "custom" ? (params.get("from") ?? daysAgo(29)) : daysAgo(Number(range) - 1);
  const to = range === "custom" ? (params.get("to") ?? today) : today;
  const invalid = from > to;
  const q = useAnalytics(from, to);

  const set = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    setParams(p, { replace: true });
  };

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Recording volume and request fulfilment. Days are UTC and both ends are included."
      />
      <div className="mb-5 flex flex-wrap items-end gap-4">
        <FilterChips
          label="Date range"
          chips={RANGES}
          value={range}
          onChange={(v) =>
            set({
              range: v === "30" ? null : v,
              ...(v === "custom" ? { from, to } : { from: null, to: null }),
            })
          }
        />
        {range === "custom" && (
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="from" className="text-sm font-medium">
                From
              </label>
              <Input
                id="from"
                type="date"
                value={from}
                max={to}
                onChange={(e) => set({ from: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="to" className="text-sm font-medium">
                To
              </label>
              <Input
                id="to"
                type="date"
                value={to}
                max={today}
                onChange={(e) => set({ to: e.target.value })}
              />
            </div>
          </div>
        )}
      </div>
      {invalid ? (
        <Alert>The start date must not be after the end date.</Alert>
      ) : q.isPending ? (
        <div
          role="status"
          aria-label="Loading analytics"
          aria-busy="true"
          className="flex flex-col gap-4"
        >
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          <Skeleton className="h-72" />
        </div>
      ) : q.isError ? (
        <Card>
          <ErrorState
            message={describeError(q.error)}
            onRetry={() => void q.refetch()}
            retrying={q.isFetching}
          />
        </Card>
      ) : (
        <div aria-busy={q.isFetching}>
          <Content data={q.data} from={from} to={to} />
        </div>
      )}
    </>
  );
}
