import { FormEvent, useRef, useState } from "react";
import { api, describeError } from "./api";
import { Card, ErrorText } from "./components";
import type { ImportReport } from "./types";

export default function ImportPage() {
  const input = useRef<HTMLInputElement>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const file = input.current?.files?.[0];
    if (!file) return;
    const body = new FormData();
    body.append("file", file);
    setBusy(true);
    setError(null);
    try {
      setReport(await api.post<ImportReport>("/imports", body));
    } catch (err) {
      setReport(null);
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Import episodes</h1>
      <Card>
        <p className="muted">
          Upload the CSV export from the recording system. Importing is safe to repeat: existing episodes are
          never changed, and every skipped row is reported with the reason.
        </p>
        <form onSubmit={submit} className="row">
          <input ref={input} type="file" accept=".csv,text/csv" required />
          <button disabled={busy}>{busy ? "Importing…" : "Import"}</button>
        </form>
        <ErrorText message={error} />
      </Card>
      {report && (
        <Card title={`Report for ${report.filename}`}>
          <ul className="stats">
            <li><b>{report.total_rows}</b> rows read</li>
            <li><b>{report.imported}</b> imported</li>
            <li><b>{report.unchanged}</b> already present, unchanged</li>
            <li><b>{report.skipped_count}</b> skipped</li>
            <li><b>{report.blank_lines}</b> blank lines ignored</li>
          </ul>
          {Object.keys(report.warnings_by_code).length > 0 && (
            <p>
              Imported with warnings:{" "}
              {Object.entries(report.warnings_by_code).map(([c, n]) => `${c} × ${n}`).join(", ")}
            </p>
          )}
          {report.skipped_count > 0 && (
            <table>
              <thead>
                <tr><th>Line</th><th>Episode</th><th>Reason</th><th>Detail</th></tr>
              </thead>
              <tbody>
                {report.skipped.map((s, i) => (
                  <tr key={i}>
                    <td>{s.line}</td>
                    <td>{s.episode_id ?? "—"}</td>
                    <td><code>{s.reason}</code></td>
                    <td>{s.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {report.details_truncated && <p className="muted">Only the first 1000 rows are listed; counts are complete.</p>}
        </Card>
      )}
    </>
  );
}
