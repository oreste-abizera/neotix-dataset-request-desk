import { useCallback, useEffect, useState } from "react";
import { api, describeError } from "./api";
import { ErrorText, StatusBadge } from "./components";
import { STATUS_LABEL } from "./format";
import type { RequestRow, Status, User } from "./types";

const PAGE_SIZE = 25;

export default function RequestList({ user, refreshKey }: { user: User; refreshKey: number }) {
  const [rows, setRows] = useState<RequestRow[] | null>(null);
  const [status, setStatus] = useState<Status | "">("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const staff = user.role !== "client";

  const load = useCallback(async () => {
    try {
      // Ask for one extra row to learn whether a next page exists.
      const q = new URLSearchParams({ limit: String(PAGE_SIZE + 1), offset: String((page - 1) * PAGE_SIZE) });
      if (status) q.set("status", status);
      setRows(await api.get<RequestRow[]>(`/requests?${q}`));
      setError(null);
    } catch (e) {
      setError(describeError(e));
    }
  }, [status, page]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return (
    <>
      <div className="row">
        <h1>{staff ? "All requests" : "My requests"}</h1>
        <span className="spacer" />
        <label className="inline">
          Status
          <select value={status} onChange={(e) => { setStatus(e.target.value as Status | ""); setPage(1); }}>
            <option value="">All</option>
            {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        {!staff && (
          <a className="button" href="#/new">
            New request
          </a>
        )}
      </div>
      <ErrorText message={error} />
      {rows === null ? (
        <p>Loading…</p>
      ) : rows.length === 0 ? (
        <p className="muted">No requests{status ? " with this status" : " yet"}.</p>
      ) : (
        <>
        <table>
          <thead>
            <tr>
              <th>#</th>
              {staff && <th>Client</th>}
              <th>Task</th>
              <th>Episodes</th>
              <th>Deadline</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, PAGE_SIZE).map((r) => (
              <tr key={r.id}>
                <td>
                  <a href={`#/requests/${r.id}`}>{r.id}</a>
                </td>
                {staff && <td>{r.client_organisation ?? r.client_name}</td>}
                <td>{r.task_name}</td>
                <td>
                  {r.assigned_count} / {r.episodes_requested}
                </td>
                <td>{r.deadline}</td>
                <td>
                  <StatusBadge status={r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row">
          <button className="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <span>Page {page}</span>
          <button className="secondary" disabled={rows.length <= PAGE_SIZE} onClick={() => setPage(page + 1)}>
            Next
          </button>
        </div>
        </>
      )}
    </>
  );
}
