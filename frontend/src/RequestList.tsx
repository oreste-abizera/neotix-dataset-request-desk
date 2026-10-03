import { useCallback, useEffect, useState } from "react";
import { api, describeError } from "./api";
import { ErrorText, StatusBadge } from "./components";
import { STATUS_LABEL } from "./format";
import type { RequestRow, Status, User } from "./types";

export default function RequestList({ user, refreshKey }: { user: User; refreshKey: number }) {
  const [rows, setRows] = useState<RequestRow[] | null>(null);
  const [status, setStatus] = useState<Status | "">("");
  const [error, setError] = useState<string | null>(null);
  const staff = user.role !== "client";

  const load = useCallback(async () => {
    try {
      setRows(await api.get<RequestRow[]>(`/requests${status ? `?status=${status}` : ""}`));
      setError(null);
    } catch (e) {
      setError(describeError(e));
    }
  }, [status]);

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
          <select value={status} onChange={(e) => setStatus(e.target.value as Status | "")}>
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
            {rows.map((r) => (
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
      )}
    </>
  );
}
