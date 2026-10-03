import {
  ArrowLeft,
  CalendarClock,
  Layers,
  PackageSearch,
  Plus,
  RotateCw,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { ApiError, describeError } from "@/api/errors";
import {
  useAssign,
  useRequest,
  useRetryExports,
  useTransition,
  useUnassign,
} from "@/api/queries/requests";
import type { Episode, RequestDetail, Status } from "@/api/types";
import { useUser } from "@/app/guards";
import { PageHeader } from "@/components/PageHeader";
import { ExportBadge, StatusBadge } from "@/components/StatusBadge";
import { Timeline } from "@/components/Timeline";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, SheetContent } from "@/components/ui/dialog";
import { ProgressBar } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Table, TableScroll, Td, Th } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { QUALITY_LABEL, STATUS_HINT, TRANSITION_COPY } from "@/lib/copy";
import { dueIn, formatDate, formatDateTime, plural } from "@/lib/format";
import AssignEpisodes from "@/features/assign/AssignEpisodes";

function DetailSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading request"
      aria-busy="true"
      className="flex flex-col gap-4"
    >
      <Skeleton className="h-8 w-72 max-w-full" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 lg:col-span-2" />
        <Skeleton className="h-72" />
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/requests"
      className="mb-4 inline-flex items-center gap-1.5 rounded-md text-base text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden /> All requests
    </Link>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:gap-4">
      <dt className="text-sm text-muted-foreground sm:w-28 sm:shrink-0">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function EpisodesTable({
  episodes,
  showExport,
  onRemove,
}: {
  episodes: Episode[];
  showExport: boolean;
  onRemove?: (e: Episode) => void;
}) {
  return (
    <TableScroll label="Assigned episodes">
      <Table>
        <caption className="sr-only">Episodes assigned to this request</caption>
        <thead>
          <tr>
            <Th>Episode</Th>
            <Th>Robot</Th>
            <Th>Task</Th>
            <Th>Recorded</Th>
            <Th>Quality</Th>
            {showExport && <Th>Export</Th>}
            {onRemove && (
              <Th>
                <span className="sr-only">Actions</span>
              </Th>
            )}
          </tr>
        </thead>
        <tbody>
          {episodes.map((e) => (
            <tr key={e.episode_id}>
              <Td className="font-mono text-sm whitespace-nowrap">{e.episode_id}</Td>
              <Td className="whitespace-nowrap">{e.robot_id}</Td>
              <Td className="capitalize">{e.task_name}</Td>
              <Td className="whitespace-nowrap tabular">{formatDateTime(e.recorded_at)}</Td>
              <Td>{QUALITY_LABEL[e.quality]}</Td>
              {showExport && (
                <Td>
                  <ExportBadge info={e.export} />
                </Td>
              )}
              {onRemove && (
                <Td className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemove(e)}
                    aria-label={`Remove ${e.episode_id}`}
                  >
                    <Trash2 className="size-4" aria-hidden />
                    <span className="hidden sm:inline">Remove</span>
                  </Button>
                </Td>
              )}
            </tr>
          ))}
        </tbody>
      </Table>
    </TableScroll>
  );
}

export default function RequestDetailPage() {
  const user = useUser();
  const staff = user.role !== "client";
  const id = Number(useParams().id);
  const q = useRequest(id);
  const transition = useTransition(id);
  const unassign = useUnassign(id);
  const assign = useAssign(id);
  const retryExports = useRetryExports(id);
  const [pending, setPending] = useState<Status | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);

  if (q.isPending) return <DetailSkeleton />;
  if (q.isError) {
    const notFound = q.error instanceof ApiError && q.error.status === 404;
    return (
      <>
        <BackLink />
        <PageHeader title={notFound ? "Request not found" : "Could not load request"} />
        <Card>
          {notFound ? (
            <EmptyState
              icon={PackageSearch}
              title="That request doesn't exist"
              description="It may have been removed, or it belongs to another account."
              action={
                <Button asChild>
                  <Link to="/requests">Back to requests</Link>
                </Button>
              }
            />
          ) : (
            <ErrorState
              message={describeError(q.error)}
              onRetry={() => void q.refetch()}
              retrying={q.isFetching}
            />
          )}
        </Card>
      </>
    );
  }

  const r: RequestDetail = q.data;
  const editable = r.status === "submitted" || r.status === "in_progress";
  const due = dueIn(r.deadline);
  const missing = Math.max(0, r.episodes_requested - r.assigned_count);
  const failedExports = r.episodes.filter((e) => e.export?.status === "failed").length;
  const hint = STATUS_HINT[r.status][staff ? "staff" : "client"];

  const run = (to: Status) => {
    const copy = TRANSITION_COPY[to];
    return transition.mutateAsync(to).then(() => {
      toast.success(`${copy.action} done`, {
        description: `Request #${r.id} is now ${to.replace("_", " ")}.`,
      });
    });
  };

  const onTransition = (to: Status) => {
    if (TRANSITION_COPY[to].confirmFirst) setPending(to);
    else
      run(to).catch((e: unknown) =>
        toast.error("That didn't work", { description: describeError(e) }),
      );
  };

  const onRemove = (e: Episode) =>
    unassign.mutate(e.episode_id, {
      onSuccess: () =>
        toast(`Removed ${e.episode_id}`, {
          action: {
            label: "Undo",
            onClick: () =>
              assign.mutate([e.episode_id], {
                onError: (err) =>
                  toast.error("Could not undo", { description: describeError(err) }),
              }),
          },
        }),
      onError: (err) =>
        toast.error("Could not remove the episode", { description: describeError(err) }),
    });

  return (
    <>
      <BackLink />
      <PageHeader
        title={`Request #${r.id}`}
        documentTitle={`Request #${r.id}: ${r.task_name}`}
        description={<span className="capitalize">{r.task_name}</span>}
        actions={
          <>
            <StatusBadge status={r.status} className="text-base" />
            {r.allowed_transitions.map((to, i) => (
              <Button
                key={to}
                variant={i === 0 && TRANSITION_COPY[to].tone !== "danger" ? "primary" : "outline"}
                className={cn(
                  TRANSITION_COPY[to].tone === "danger" &&
                    "border-danger text-danger hover:bg-danger-soft",
                )}
                loading={transition.isPending && transition.variables === to}
                disabled={transition.isPending}
                onClick={() => onTransition(to)}
              >
                {TRANSITION_COPY[to].action}
              </Button>
            ))}
          </>
        }
      />

      <p
        className="mb-5 rounded-lg border border-line bg-primary-soft px-4 py-3 text-primary"
        role="status"
      >
        {hint}
        {staff &&
          r.status === "in_progress" &&
          missing > 0 &&
          ` ${plural(missing, "more episode")} needed before it can be delivered.`}
      </p>

      <div className="grid items-start gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <Card>
            <CardHeader
              title={`Episodes (${r.assigned_count} of ${r.episodes_requested})`}
              description={
                editable && staff
                  ? "Assign good or usable episodes. Delivery needs the full count."
                  : undefined
              }
              actions={
                staff && editable ? (
                  <Button size="sm" onClick={() => setAssignOpen(true)}>
                    <Plus className="size-4" aria-hidden />
                    Assign episodes
                  </Button>
                ) : undefined
              }
            />
            {staff && failedExports > 0 && (
              <div
                className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-danger-soft px-4 py-3 text-danger sm:px-5"
                role="alert"
              >
                <span className="font-medium">
                  {plural(failedExports, "export")} failed after all attempts.
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  loading={retryExports.isPending}
                  onClick={() =>
                    retryExports.mutate(undefined, {
                      onSuccess: () => toast.success("Exports queued again"),
                      onError: (e) =>
                        toast.error("Could not retry", { description: describeError(e) }),
                    })
                  }
                >
                  <RotateCw className="size-4" aria-hidden />
                  Retry failed exports
                </Button>
              </div>
            )}
            {r.episodes.length === 0 ? (
              <EmptyState
                icon={Layers}
                title="No episodes assigned yet"
                description={
                  staff && editable
                    ? "Pick episodes that match this request to start building the delivery."
                    : "Episodes will appear here once an operator assigns them."
                }
                action={
                  staff && editable ? (
                    <Button onClick={() => setAssignOpen(true)}>
                      <Plus className="size-4" aria-hidden />
                      Assign episodes
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <EpisodesTable
                episodes={r.episodes}
                showExport={staff}
                onRemove={staff && editable ? onRemove : undefined}
              />
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <dl className="divide-y divide-line">
                <Detail label="Client">{r.client_organisation ?? r.client_name}</Detail>
                <Detail label="Deadline">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
                    {formatDate(r.deadline)}
                  </span>
                  {r.status !== "accepted" && (
                    <span
                      className={cn(
                        "block text-sm",
                        due.overdue ? "font-medium text-danger" : "text-muted-foreground",
                      )}
                    >
                      {due.label}
                    </span>
                  )}
                </Detail>
                <Detail label="Progress">
                  <ProgressBar
                    value={r.assigned_count}
                    max={r.episodes_requested}
                    label="Episodes assigned"
                    className="mt-2"
                  />
                  <span className="mt-1 block text-sm text-muted-foreground tabular">
                    {r.assigned_count} of {r.episodes_requested} assigned
                  </span>
                </Detail>
                <Detail label="Notes">
                  {r.notes || <span className="text-muted-foreground">None</span>}
                </Detail>
              </dl>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="History" />
            <CardBody>
              <Timeline events={r.events} />
            </CardBody>
          </Card>
        </div>
      </div>

      {pending && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setPending(null)}
          title={TRANSITION_COPY[pending].title}
          description={TRANSITION_COPY[pending].description}
          confirmLabel={TRANSITION_COPY[pending].confirm}
          tone={TRANSITION_COPY[pending].tone}
          onConfirm={() => run(pending)}
        />
      )}

      {staff && (
        <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
          <SheetContent
            title="Assign episodes"
            description={`Request #${r.id}: ${r.task_name}. Only unassigned episodes are listed.`}
          >
            <AssignEpisodes detail={r} onDone={() => setAssignOpen(false)} />
          </SheetContent>
        </Dialog>
      )}
    </>
  );
}
