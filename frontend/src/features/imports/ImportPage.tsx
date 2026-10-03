import { CircleCheck, Download, FileSpreadsheet, History, Upload, X } from "lucide-react";
import { useId, useMemo, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { describeError } from "@/api/errors";
import { useImportCsv, useImportRuns } from "@/api/queries/imports";
import type { ImportReport } from "@/api/types";
import { PageHeader } from "@/components/PageHeader";
import { Stat } from "@/components/Stat";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, EmptyState, ErrorState } from "@/components/ui/states";
import { Table, TableScroll, Td, Th } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { IMPORT_REASON_LABEL } from "@/lib/copy";
import { downloadText, toCsv } from "@/lib/csv";
import { formatRelative, plural } from "@/lib/format";

const MAX_BYTES = 50 * 1024 * 1024;

export function validateFile(file: File): string | null {
  if (!/\.csv$/i.test(file.name)) return "Choose a .csv file exported from the recording system.";
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_BYTES) return "That file is larger than the 50 MB limit.";
  return null;
}

const size = (bytes: number) =>
  bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

function Dropzone({ onFile, disabled }: { onFile: (file: File) => void; disabled: boolean }) {
  const id = useId();
  const [dragging, setDragging] = useState(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && !disabled) onFile(file);
  };
  return (
    // Drag-and-drop is a convenience only: the file input inside is the real, keyboard-operable control.
    <label
      htmlFor={id}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-input-line px-6 py-10 text-center transition-colors",
        "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
        dragging ? "border-primary bg-primary-soft" : "hover:bg-muted",
        disabled && "pointer-events-none opacity-60",
      )}
    >
      <Upload className="size-8 text-primary" aria-hidden />
      <span className="text-md font-medium">Drop a CSV here, or click to choose a file</span>
      <span className="text-sm text-muted-foreground">
        Up to 50 MB. Importing the same file again is safe.
      </span>
      <input
        id={id}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = ""; // allow choosing the same file again
        }}
      />
    </label>
  );
}

function Report({ report }: { report: ImportReport }) {
  const [reason, setReason] = useState("");
  const reasons = Object.entries(report.skipped_by_reason);
  const shown = useMemo(
    () => report.skipped.filter((s) => !reason || s.reason === reason),
    [report, reason],
  );
  const label = (r: string) => IMPORT_REASON_LABEL[r] ?? r.replace(/_/g, " ");

  const download = () =>
    downloadText(
      `skipped-rows-${report.import_run_id}.csv`,
      toCsv(
        ["line", "episode_id", "reason", "detail"],
        report.skipped.map((s) => [s.line, s.episode_id, s.reason, s.detail]),
      ),
    );

  return (
    <Card>
      <CardHeader
        title={`Report for ${report.filename}`}
        description={`Import #${report.import_run_id}`}
        actions={
          report.skipped_count > 0 ? (
            <Button variant="outline" size="sm" onClick={download}>
              <Download className="size-4" aria-hidden /> Skipped rows (CSV)
            </Button>
          ) : undefined
        }
      />
      <CardBody className="flex flex-col gap-5">
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Rows read" value={report.total_rows.toLocaleString()} />
          <Stat label="Imported" value={report.imported.toLocaleString()} />
          <Stat label="Already there" value={report.unchanged.toLocaleString()} hint="unchanged" />
          <Stat label="Skipped" value={report.skipped_count.toLocaleString()} />
          <Stat label="Blank lines" value={report.blank_lines.toLocaleString()} />
        </dl>

        {report.skipped_count === 0 ? (
          <Alert tone="success">
            <span className="inline-flex items-center gap-2">
              <CircleCheck className="size-4" aria-hidden /> Every row was imported or already
              present.
            </span>
          </Alert>
        ) : null}

        {Object.keys(report.warnings_by_code).length > 0 && (
          <Alert tone="warning">
            Imported with warnings:{" "}
            {Object.entries(report.warnings_by_code)
              .map(([c, n]) => `${c.replace(/_/g, " ")} (${n})`)
              .join(", ")}
            .
          </Alert>
        )}

        {report.skipped_count > 0 && (
          <div>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <h3 className="text-md">Skipped rows</h3>
              <div className="w-full sm:w-72">
                <label htmlFor="reason-filter" className="sr-only">
                  Filter skipped rows by reason
                </label>
                <Select
                  id="reason-filter"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                >
                  <option value="">All reasons ({report.skipped_count})</option>
                  {reasons.map(([r, n]) => (
                    <option key={r} value={r}>
                      {label(r)} ({n})
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <TableScroll label="Skipped rows">
              <Table>
                <caption className="sr-only">Rows that were not imported, with the reason</caption>
                <thead>
                  <tr>
                    <Th>Line</Th>
                    <Th>Episode</Th>
                    <Th>Reason</Th>
                    <Th>Detail</Th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((s) => (
                    <tr key={`${s.line}-${s.reason}`}>
                      <Td className="tabular">{s.line}</Td>
                      <Td className="font-mono text-sm">{s.episode_id ?? "—"}</Td>
                      <Td className="whitespace-nowrap font-medium">{label(s.reason)}</Td>
                      <Td className="min-w-64 text-muted-foreground">{s.detail}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableScroll>
            {report.details_truncated && (
              <p className="mt-2 text-sm text-muted-foreground">
                Only the first 1,000 rows are listed here; the counts above are complete.
              </p>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function RecentImports() {
  const runs = useImportRuns();
  return (
    <Card>
      <CardHeader title="Recent imports" />
      {runs.isPending ? (
        <div role="status" aria-label="Loading imports" className="flex flex-col gap-2 p-4">
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </div>
      ) : runs.isError ? (
        <ErrorState message={describeError(runs.error)} onRetry={() => void runs.refetch()} />
      ) : runs.data.length === 0 ? (
        <EmptyState
          icon={History}
          title="No imports yet"
          description="Your uploads will be listed here."
        />
      ) : (
        <TableScroll label="Recent imports">
          <Table>
            <caption className="sr-only">Most recent episode imports</caption>
            <thead>
              <tr>
                <Th>File</Th>
                <Th>When</Th>
                <Th className="text-right">Imported</Th>
                <Th className="text-right">Skipped</Th>
              </tr>
            </thead>
            <tbody>
              {runs.data.map((r) => (
                <tr key={r.id}>
                  <Td className="font-medium">{r.filename}</Td>
                  <Td className="whitespace-nowrap text-muted-foreground">
                    {formatRelative(r.created_at)}
                  </Td>
                  <Td className="text-right tabular">{(r.imported ?? 0).toLocaleString()}</Td>
                  <Td className="text-right tabular">{(r.skipped_count ?? 0).toLocaleString()}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableScroll>
      )}
    </Card>
  );
}

export default function ImportPage() {
  const importCsv = useImportCsv();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const choose = (f: File) => {
    const problem = validateFile(f);
    setFileError(problem);
    setFile(problem ? null : f);
    importCsv.reset();
  };

  const start = () => {
    if (!file) return;
    importCsv.mutate(file, {
      onSuccess: (r) => {
        toast.success(`Imported ${plural(r.imported, "episode")}`, {
          description: r.skipped_count
            ? `${plural(r.skipped_count, "row")} skipped; see the report.`
            : undefined,
        });
        setFile(null);
      },
    });
  };

  return (
    <>
      <PageHeader
        title="Import episodes"
        description="Upload the CSV export from the recording system. Existing episodes are never changed, and every skipped row is listed with the reason."
      />
      <div className="flex flex-col gap-5">
        <Card>
          <CardBody className="flex flex-col gap-4">
            <Dropzone onFile={choose} disabled={importCsv.isPending} />
            {fileError && <Alert>{fileError}</Alert>}
            {importCsv.error && <Alert>{describeError(importCsv.error)}</Alert>}
            {file && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-muted px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <FileSpreadsheet className="size-5 shrink-0 text-primary" aria-hidden />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{file.name}</p>
                    <p className="text-sm text-muted-foreground">{size(file.size)}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFile(null)}
                    disabled={importCsv.isPending}
                  >
                    <X className="size-4" aria-hidden /> Remove
                  </Button>
                  <Button size="sm" onClick={start} loading={importCsv.isPending}>
                    {importCsv.isPending ? "Importing…" : "Import"}
                  </Button>
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        {importCsv.data && <Report report={importCsv.data} />}
        <RecentImports />
      </div>
    </>
  );
}
