import { FormEvent, useState } from "react";
import { api, describeError } from "./api";
import { Card, ErrorText } from "./components";
import type { RequestDetail } from "./types";

export default function NewRequest() {
  const today = new Date().toISOString().slice(0, 10);
  const [task, setTask] = useState("");
  const [count, setCount] = useState(10);
  const [deadline, setDeadline] = useState(today);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api.post<RequestDetail>("/requests", {
        task_name: task,
        episodes_requested: count,
        deadline,
        notes,
      });
      window.location.hash = `#/requests/${created.id}`;
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  }

  return (
    <main className="narrow">
      <h1>New dataset request</h1>
      <Card>
        <form onSubmit={submit}>
          <label>
            Task
            <input value={task} onChange={(e) => setTask(e.target.value)} placeholder="e.g. pick cup" maxLength={200} required />
          </label>
          <label>
            Number of episodes
            <input type="number" min={1} max={100000} value={count} onChange={(e) => setCount(Number(e.target.value))} required />
          </label>
          <label>
            Deadline
            <input type="date" min={today} value={deadline} onChange={(e) => setDeadline(e.target.value)} required />
          </label>
          <label>
            Notes
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} rows={4} />
          </label>
          <ErrorText message={error} />
          <div className="row">
            <button disabled={busy}>{busy ? "Submitting…" : "Submit request"}</button>
            <a href="#/requests">Cancel</a>
          </div>
        </form>
      </Card>
    </main>
  );
}
