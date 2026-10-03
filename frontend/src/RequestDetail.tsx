import { useCallback, useEffect, useState } from "react";
import { api, describeError } from "./api";
import AssignPanel from "./AssignPanel";
import { Card, ErrorText, StatusBadge } from "./components";
import { ACTION_LABEL, fmtDate } from "./format";
import type { RequestDetail as Detail, Status, User } from "./types";

const CONFIRM: Partial<Record<Status, string>> = {
  accepted: "Accept this delivery? This cannot be undone.",
  rejected: "Reject this delivery and send it back for rework?",
};

export default function RequestDetail({ id, user, refreshKey }: { id: number; user: User; refreshKey: number }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const staff = user.role !== "client";

  const load = useCallback(async () => {
    try {
      setDetail(await api.get<Detail>(`/requests/${id}`));
      setError(null);
    } catch (e) {
      setError(describeError(e));
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function transition(to: Status) {
    if (CONFIRM[to] && !window.confirm(CONFIRM[to])) return;
    setBusy(true);
    try {
      setDetail(await api.post<Detail>(`/requests/${id}/transitions`, { to }));
      setError(null);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  if (!detail) return error ? <ErrorText message={error} /> : <p>Loading…</p>;
  const editable = detail.status === "submitted" || detail.status === "in_progress";

  return (
    <>
      <p>
        <a href="#/requests">← Back to requests</a>
      </p>
      <div className="row">
        <h1>
          Request #{detail.id}: {detail.task_name}
        </h1>
        <StatusBadge status={detail.status} />
      </div>
      <ErrorText message={error} />

      <Card>
        <dl>
          <dt>Client</dt>
          <dd>{detail.client_organisation ?? detail.client_name}</dd>
          <dt>Episodes</dt>
          <dd>
            {detail.assigned_count} assigned of {detail.episodes_requested} requested
          </dd>
          <dt>Deadline</dt>
          <dd>{detail.deadline}</dd>
          <dt>Notes</dt>
          <dd>{detail.notes || <span className="muted">none</span>}</dd>
        </dl>
        {detail.allowed_transitions.length > 0 && (
          <div className="row">
            {detail.allowed_transitions.map((to) => (
              <button
                key={to}
                disabled={busy}
                className={to === "rejected" ? "danger" : undefined}
                onClick={() => transition(to)}
              >
                {ACTION_LABEL[to]}
              </button>
            ))}
          </div>
        )}
        {staff && detail.status === "in_progress" && detail.assigned_count < detail.episodes_requested && (
          <p className="muted">
            Assign {detail.episodes_requested - detail.assigned_count} more episode(s) before this can be
            delivered.
          </p>
        )}
        {!staff && detail.status === "delivered" && (
          <p className="muted">This request has been delivered. Please review the episodes below.</p>
        )}
      </Card>

      {staff && editable && <AssignPanel detail={detail} onChange={setDetail} />}

      <Card title={`Assigned episodes (${detail.episodes.length})`}>
        {detail.episodes.length === 0 ? (
          <p className="muted">No episodes assigned yet.</p>
        ) : (
          <EpisodeTable
            episodes={detail.episodes}
            onRemove={
              staff && editable
                ? async (episodeId) => {
                    try {
                      setDetail(await api.del<Detail>(`/requests/${id}/assignments/${episodeId}`));
                      setError(null);
                    } catch (e) {
                      setError(describeError(e));
                    }
                  }
                : undefined
            }
          />
        )}
      </Card>

      <Card title="History">
        <ul className="history">
          {detail.events.map((e, i) => (
            <li key={i}>
              <StatusBadge status={e.to_status} /> by {e.actor_name}{" "}
              <span className="muted">{fmtDate(e.created_at)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

function EpisodeTable({
  episodes,
  onRemove,
}: {
  episodes: Detail["episodes"];
  onRemove?: (episodeId: string) => void;
}) {
  return (
    <table>
      <thead>
        <tr>
          <th>Episode</th>
          <th>Robot</th>
          <th>Task</th>
          <th>Recorded</th>
          <th>Seconds</th>
          <th>Quality</th>
          {onRemove && <th />}
        </tr>
      </thead>
      <tbody>
        {episodes.map((e) => (
          <tr key={e.episode_id}>
            <td>{e.episode_id}</td>
            <td>{e.robot_id}</td>
            <td>{e.task_name}</td>
            <td>{fmtDate(e.recorded_at)}</td>
            <td>{e.duration_seconds}</td>
            <td>{e.quality}</td>
            {onRemove && (
              <td>
                <button className="link" onClick={() => onRemove(e.episode_id)}>
                  Remove
                </button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
