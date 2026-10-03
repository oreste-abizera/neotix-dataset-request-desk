import { useCallback, useEffect, useState } from "react";
import { api, describeError } from "./api";
import { Card, ErrorText } from "./components";
import { fmtDate } from "./format";
import type { EpisodePage, RequestDetail } from "./types";

const PAGE_SIZE = 25;

export default function AssignPanel({
  detail,
  onChange,
}: {
  detail: RequestDetail;
  onChange: (d: RequestDetail) => void;
}) {
  const [tasks, setTasks] = useState<string[]>([]);
  const [task, setTask] = useState(detail.task_name); // pre-filter to what the client asked for
  const [quality, setQuality] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<EpisodePage | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<string[]>("/episodes/task-names").then(setTasks).catch(() => setTasks([]));
  }, []);

  const load = useCallback(async () => {
    const q = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE), unassigned: "true" });
    if (task) q.set("task_name", task);
    if (quality) q.set("quality", quality);
    try {
      setData(await api.get<EpisodePage>(`/episodes?${q}`));
      setError(null);
    } catch (e) {
      setError(describeError(e));
    }
  }, [task, quality, page]);

  useEffect(() => {
    load();
  }, [load, detail.assigned_count]);

  const assignable = (data?.items ?? []).filter((e) => e.quality !== "bad");
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  async function assign() {
    setBusy(true);
    try {
      onChange(await api.post<RequestDetail>(`/requests/${detail.id}/assignments`, { episode_ids: [...selected] }));
      setSelected(new Set());
      setError(null);
    } catch (e) {
      setError(describeError(e));
      load(); // somebody else may have taken one of them
    } finally {
      setBusy(false);
    }
  }

  const mismatched = [...selected].filter((id) => data?.items.find((e) => e.episode_id === id)?.task_name !== detail.task_name).length;
  const lastPage = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  return (
    <Card title="Assign episodes">
      <div className="row">
        <label className="inline">
          Task
          <select value={task} onChange={(e) => { setTask(e.target.value); setPage(1); }}>
            <option value="">All tasks</option>
            {tasks.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="inline">
          Quality
          <select value={quality} onChange={(e) => { setQuality(e.target.value); setPage(1); }}>
            <option value="">Any</option>
            <option value="good">good</option>
            <option value="usable">usable</option>
            <option value="bad">bad (not assignable)</option>
          </select>
        </label>
        <span className="muted">Showing unassigned episodes only. {data ? `${data.total} match.` : ""}</span>
      </div>
      <ErrorText message={error} />
      {data && data.items.length === 0 && <p className="muted">No matching unassigned episodes.</p>}
      {data && data.items.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="Select all on this page"
                  checked={assignable.length > 0 && assignable.every((e) => selected.has(e.episode_id))}
                  onChange={(ev) =>
                    setSelected((s) => {
                      const next = new Set(s);
                      assignable.forEach((e) => (ev.target.checked ? next.add(e.episode_id) : next.delete(e.episode_id)));
                      return next;
                    })
                  }
                />
              </th>
              <th>Episode</th>
              <th>Robot</th>
              <th>Task</th>
              <th>Recorded</th>
              <th>Quality</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((e) => (
              <tr key={e.episode_id} className={e.quality === "bad" ? "dim" : undefined}>
                <td>
                  <input
                    type="checkbox"
                    disabled={e.quality === "bad"}
                    checked={selected.has(e.episode_id)}
                    onChange={() => toggle(e.episode_id)}
                    aria-label={`Select ${e.episode_id}`}
                  />
                </td>
                <td>{e.episode_id}</td>
                <td>{e.robot_id}</td>
                <td>{e.task_name}</td>
                <td>{fmtDate(e.recorded_at)}</td>
                <td>{e.quality}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="row">
        <button className="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <span>
          Page {page} of {lastPage}
        </span>
        <button className="secondary" disabled={page >= lastPage} onClick={() => setPage(page + 1)}>
          Next
        </button>
        <span className="spacer" />
        <button disabled={busy || selected.size === 0} onClick={assign}>
          Assign {selected.size || ""} selected
        </button>
      </div>
      {mismatched > 0 && (
        <p className="muted">
          {mismatched} selected episode(s) are for a different task than “{detail.task_name}”.
        </p>
      )}
    </Card>
  );
}
