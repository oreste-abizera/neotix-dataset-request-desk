import { ChevronRight, ClipboardList, Plus, SearchX } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { describeError } from "@/api/errors";
import { REQUESTS_PAGE_SIZE, useRequests } from "@/api/queries/requests";
import type { RequestRow, Status } from "@/api/types";
import { useUser } from "@/app/guards";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FilterChips } from "@/components/ui/filter-chips";
import { Pagination } from "@/components/ui/pagination";
import { ProgressBar } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Table, TableScroll, Td, Th } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { STATUS_LABEL, STATUS_ORDER } from "@/lib/copy";
import { dueIn, formatDate } from "@/lib/format";

type Filter = Status | "";
const CHIPS = [
  { value: "" as Filter, label: "All" },
  ...STATUS_ORDER.map((s) => ({ value: s as Filter, label: STATUS_LABEL[s] })),
];

const isStatus = (v: string | null): v is Status => STATUS_ORDER.includes(v as Status);

function Deadline({ row }: { row: RequestRow }) {
  const open = row.status !== "accepted";
  const due = dueIn(row.deadline);
  return (
    <div>
      <div className="tabular">{formatDate(row.deadline)}</div>
      {open && (
        <div
          className={cn(
            "text-sm",
            due.overdue ? "font-medium text-danger" : "text-muted-foreground",
          )}
        >
          {due.label}
        </div>
      )}
    </div>
  );
}

function Progress({ row }: { row: RequestRow }) {
  return (
    <div className="min-w-28">
      <div className="mb-1 text-sm tabular">
        {row.assigned_count} of {row.episodes_requested}{" "}
        <span className="text-muted-foreground">episodes</span>
      </div>
      <ProgressBar
        value={row.assigned_count}
        max={row.episodes_requested}
        label={`Request ${row.id} episodes assigned`}
      />
    </div>
  );
}

function RowsTable({ rows, staff }: { rows: RequestRow[]; staff: boolean }) {
  return (
    <TableScroll label="Requests">
      <Table>
        <caption className="sr-only">Dataset requests, newest first</caption>
        <thead>
          <tr>
            <Th>Request</Th>
            {staff && <Th>Client</Th>}
            <Th>Progress</Th>
            <Th>Deadline</Th>
            <Th>Status</Th>
            <Th>
              <span className="sr-only">Open</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="relative transition-colors hover:bg-muted/60">
              <Td>
                <Link
                  to={`/requests/${r.id}`}
                  className="font-medium capitalize after:absolute after:inset-0 after:content-[''] focus-visible:outline-offset-[-2px]"
                >
                  {r.task_name}
                </Link>
                <div className="font-mono text-sm text-muted-foreground">#{r.id}</div>
              </Td>
              {staff && <Td>{r.client_organisation ?? r.client_name}</Td>}
              <Td>
                <Progress row={r} />
              </Td>
              <Td>
                <Deadline row={r} />
              </Td>
              <Td>
                <StatusBadge status={r.status} />
              </Td>
              <Td className="w-8 text-muted-foreground">
                <ChevronRight className="size-4" aria-hidden />
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </TableScroll>
  );
}

function RowsCards({ rows, staff }: { rows: RequestRow[]; staff: boolean }) {
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.id}>
          <Link
            to={`/requests/${r.id}`}
            className="block rounded-lg border border-line bg-surface p-4 shadow-xs transition-colors active:bg-muted"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium capitalize">{r.task_name}</p>
                <p className="text-sm text-muted-foreground">
                  <span className="font-mono">#{r.id}</span>
                  {staff && <> · {r.client_organisation ?? r.client_name}</>}
                </p>
              </div>
              <StatusBadge status={r.status} />
            </div>
            <div className="mt-3">
              <Progress row={r} />
            </div>
            <div className="mt-3 text-sm">
              <Deadline row={r} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ListSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading requests"
      aria-busy="true"
      className="flex flex-col gap-3"
    >
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

export default function RequestsPage() {
  const user = useUser();
  const staff = user.role !== "client";
  const [params, setParams] = useSearchParams();
  const statusParam = params.get("status");
  const status: Filter = isStatus(statusParam) ? statusParam : "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const q = useRequests(status, page);

  const update = (next: { status?: Filter; page?: number }) => {
    const p = new URLSearchParams(params);
    if (next.status !== undefined) {
      if (next.status) p.set("status", next.status);
      else p.delete("status");
      p.delete("page");
    }
    if (next.page !== undefined) {
      if (next.page > 1) p.set("page", String(next.page));
      else p.delete("page");
    }
    setParams(p);
  };

  const newRequest = (
    <Button asChild>
      <Link to="/requests/new">
        <Plus className="size-4" aria-hidden />
        New request
      </Link>
    </Button>
  );

  let body;
  if (q.isPending) body = <ListSkeleton />;
  else if (q.isError)
    body = (
      <Card>
        <ErrorState
          message={describeError(q.error)}
          onRetry={() => void q.refetch()}
          retrying={q.isFetching}
        />
      </Card>
    );
  else if (q.data.rows.length === 0)
    body = (
      <Card>
        {status ? (
          <EmptyState
            icon={SearchX}
            title={`No ${STATUS_LABEL[status].toLowerCase()} requests`}
            description="Try another status, or clear the filter."
            action={
              <Button variant="outline" onClick={() => update({ status: "" })}>
                Show all requests
              </Button>
            }
          />
        ) : staff ? (
          <EmptyState
            icon={ClipboardList}
            title="The queue is empty"
            description="New requests from clients will appear here as soon as they are submitted."
          />
        ) : (
          <EmptyState
            icon={ClipboardList}
            title="You have no requests yet"
            description="Describe the dataset you need and we'll start collecting it."
            action={newRequest}
          />
        )}
      </Card>
    );
  else
    body = (
      <>
        <div className="hidden md:block">
          <Card className="overflow-hidden">
            <RowsTable rows={q.data.rows} staff={staff} />
          </Card>
        </div>
        <div className="md:hidden">
          <RowsCards rows={q.data.rows} staff={staff} />
        </div>
        {(page > 1 || q.data.hasNext) && (
          <Pagination
            page={page}
            hasNext={q.data.hasNext}
            busy={q.isFetching}
            onPage={(n) => update({ page: n })}
            pageSize={REQUESTS_PAGE_SIZE}
          />
        )}
      </>
    );

  return (
    <>
      <PageHeader
        title={staff ? "Requests" : "My requests"}
        description={
          staff
            ? "Everything clients have asked for. Open a request to assign episodes or move it forward."
            : "Track what you asked for and review deliveries."
        }
        actions={!staff && newRequest}
      />
      <div className="mb-4" aria-busy={q.isFetching}>
        <FilterChips
          label="Filter by status"
          chips={CHIPS}
          value={status}
          onChange={(v) => update({ status: v })}
        />
      </div>
      {body}
    </>
  );
}
