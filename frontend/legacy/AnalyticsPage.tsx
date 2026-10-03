import { useEffect, useState } from "react";
import { api, describeError } from "./api";
import { Card, ErrorText } from "./components";
import { fmtDuration, STATUS_LABEL } from "./format";
import type { Analytics, Status } from "./types";

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function AnalyticsPage() {
  const [to, setTo] = useState(iso(new Date()));
  const [from, setFrom] = useState(iso(new Date(Date.now() - 30 * 86400000)));
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (from > to) return setError("‘From’ must not be after ‘To’.");
    api
      .get<Analytics>(`/analytics?from=${from}&to=${to}`)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(describeError(e)));
  }, [from, to]);

  const robots = data ? [...new Set(data.episodes_per_day_per_robot.map((r) => r.robot_id))].sort() : [];
  const days = data ? [...new Set(data.episodes_per_day_per_robot.map((r) => r.day))].sort() : [];
  const cell = (day: string, robot: string) =>
    data?.episodes_per_day_per_robot.find((r) => r.day === day && r.robot_id === robot)?.episodes ?? 0;

  return (
    <>
      <div className="row">
        <h1>Analytics</h1>
        <span className="spacer" />
        <label className="inline">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="inline">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      <p className="muted">Both days inclusive, UTC. Requests are counted by submission date.</p>
      <ErrorText message={error} />
      {data && (
        <>
          <Card title="Request fulfilment">
            <ul className="stats">
              {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                <li key={s}><b>{data.requests.by_status[s]}</b> {STATUS_LABEL[s].toLowerCase()}</li>
              ))}
              <li>
                <b>{fmtDuration(data.requests.median_seconds_submitted_to_delivered)}</b> median time to delivery
                ({data.requests.delivered_count} delivered)
              </li>
            </ul>
          </Card>
          <Card title="Top tasks by good episodes">
            {data.top_tasks_by_good_episodes.length === 0 ? (
              <p className="muted">No good episodes recorded in this range.</p>
            ) : (
              <table>
                <thead><tr><th>Task</th><th>Good episodes</th></tr></thead>
                <tbody>
                  {data.top_tasks_by_good_episodes.map((t) => (
                    <tr key={t.task_name}><td>{t.task_name}</td><td>{t.good_episodes}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
          <Card title="Episodes recorded per day, per robot">
            {days.length === 0 ? (
              <p className="muted">No episodes recorded in this range.</p>
            ) : (
              <div className="scroll">
                <table>
                  <thead><tr><th>Day</th>{robots.map((r) => <th key={r}>{r}</th>)}</tr></thead>
                  <tbody>
                    {days.map((d) => (
                      <tr key={d}><td>{d}</td>{robots.map((r) => <td key={r}>{cell(d, r) || "·"}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}
