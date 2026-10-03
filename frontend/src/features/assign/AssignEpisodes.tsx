import { SearchX } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { describeError } from "@/api/errors";
import {
  EPISODES_PAGE_SIZE,
  useEpisodes,
  useTaskNames,
  type EpisodeFilters,
} from "@/api/queries/episodes";
import { useAssign } from "@/api/queries/requests";
import type { Episode, RequestDetail } from "@/api/types";
import { Button } from "@/components/ui/button";
import { FilterChips } from "@/components/ui/filter-chips";
import { Select } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, EmptyState, ErrorState } from "@/components/ui/states";
import { Table, TableScroll, Td, Th } from "@/components/ui/table";
import { Tip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { QUALITY_LABEL } from "@/lib/copy";
import { formatDate, plural } from "@/lib/format";

const QUALITY_CHIPS = [
  { value: "" as EpisodeFilters["quality"], label: "Any" },
  { value: "good" as EpisodeFilters["quality"], label: "Good" },
  { value: "usable" as EpisodeFilters["quality"], label: "Usable" },
  { value: "bad" as EpisodeFilters["quality"], label: "Bad" },
];

const assignable = (e: Episode) => e.quality !== "bad";

function QualityText({ q }: { q: Episode["quality"] }) {
  return (
    <span className={cn(q === "bad" && "text-danger", "font-medium")}>{QUALITY_LABEL[q]}</span>
  );
}

function EpisodeCheckbox({
  episode,
  checked,
  onChange,
}: {
  episode: Episode;
  checked: boolean;
  onChange: () => void;
}) {
  const disabled = !assignable(episode);
  const box = (
    <label className="inline-flex size-9 cursor-pointer items-center justify-center has-[:disabled]:cursor-not-allowed">
      <input
        type="checkbox"
        className="size-[18px] accent-primary"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        aria-label={`Select ${episode.episode_id}`}
      />
    </label>
  );
  return disabled ? <Tip label="Episodes rated bad cannot be assigned">{box}</Tip> : box;
}

export default function AssignEpisodes({
  detail,
  onDone,
}: {
  detail: RequestDetail;
  onDone: () => void;
}) {
  const tasks = useTaskNames();
  const assign = useAssign(detail.id);
  const [taskChoice, setTaskChoice] = useState<string | null>(null); // null = the user has not chosen
  const [quality, setQuality] = useState<EpisodeFilters["quality"]>("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Until the operator picks one, filter to what the client asked for (when recordings use that
  // task name); null while the task list is still loading.
  const task: string | null =
    taskChoice ??
    (tasks.data ? (tasks.data.includes(detail.task_name) ? detail.task_name : "") : null);
  const effectiveTask = task ?? "";
  const episodes = useEpisodes({ task: effectiveTask, quality, page }, task !== null);
  const rows = useMemo(() => episodes.data?.items ?? [], [episodes.data]);
  const selectable = rows.filter(assignable);
  const allOnPage = selectable.length > 0 && selectable.every((e) => selected.has(e.episode_id));
  const someOnPage = selectable.some((e) => selected.has(e.episode_id));
  const mismatched = [...selected].filter((id) => {
    const e = rows.find((x) => x.episode_id === id);
    return e && e.task_name !== detail.task_name;
  }).length;
  const missing = Math.max(0, detail.episodes_requested - detail.assigned_count);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const togglePage = () =>
    setSelected((s) => {
      const next = new Set(s);
      selectable.forEach((e) => (allOnPage ? next.delete(e.episode_id) : next.add(e.episode_id)));
      return next;
    });

  const filterChanged = (fn: () => void) => {
    fn();
    setPage(1);
  };

  const submit = () =>
    assign.mutate([...selected], {
      onSuccess: () => {
        toast.success(`Assigned ${plural(selected.size, "episode")}`);
        setSelected(new Set());
      },
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-4 px-4 pt-4 sm:px-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,16rem)_1fr] sm:items-end">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="assign-task" className="text-base font-medium">
              Task
            </label>
            <Select
              id="assign-task"
              value={effectiveTask}
              disabled={task === null}
              onChange={(e) => filterChanged(() => setTaskChoice(e.target.value))}
            >
              <option value="">All tasks</option>
              {(tasks.data ?? []).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-base font-medium" id="assign-quality">
              Quality
            </span>
            <div aria-labelledby="assign-quality" role="group">
              <FilterChips
                label="Quality"
                chips={QUALITY_CHIPS}
                value={quality}
                onChange={(v) => filterChanged(() => setQuality(v))}
              />
            </div>
          </div>
        </div>

        <p className="text-sm text-muted-foreground" aria-live="polite">
          {episodes.data
            ? `${episodes.data.total.toLocaleString()} unassigned episodes match`
            : "Loading episodes…"}
          {missing > 0 && ` · this request still needs ${plural(missing, "episode")}`}
        </p>

        {assign.error && <Alert>{describeError(assign.error)}</Alert>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        {episodes.isPending || task === null ? (
          <div
            role="status"
            aria-label="Loading episodes"
            aria-busy="true"
            className="flex flex-col gap-2"
          >
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : episodes.isError ? (
          <ErrorState
            message={describeError(episodes.error)}
            onRetry={() => void episodes.refetch()}
            retrying={episodes.isFetching}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="No matching episodes"
            description="Try another task or quality, or import more episodes."
          />
        ) : (
          <>
            {/* Wide screens: a table. Phones: one tappable row per episode, no sideways scrolling. */}
            <div className="hidden md:block">
              <TableScroll label="Unassigned episodes">
                <Table>
                  <caption className="sr-only">Unassigned episodes matching the filters</caption>
                  <thead>
                    <tr>
                      <Th className="w-12">
                        <label className="inline-flex size-9 cursor-pointer items-center justify-center">
                          <input
                            type="checkbox"
                            className="size-[18px] accent-primary"
                            checked={allOnPage}
                            ref={(el) => {
                              if (el) el.indeterminate = !allOnPage && someOnPage;
                            }}
                            onChange={togglePage}
                            aria-label="Select all assignable episodes on this page"
                          />
                        </label>
                      </Th>
                      <Th>Episode</Th>
                      <Th>Robot</Th>
                      <Th>Task</Th>
                      <Th>Recorded</Th>
                      <Th>Quality</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((e) => (
                      <tr
                        key={e.episode_id}
                        className={cn(
                          !assignable(e) && "opacity-60",
                          selected.has(e.episode_id) && "bg-primary-soft",
                        )}
                      >
                        <Td className="w-12 !px-1 text-center">
                          <EpisodeCheckbox
                            episode={e}
                            checked={selected.has(e.episode_id)}
                            onChange={() => toggle(e.episode_id)}
                          />
                        </Td>
                        <Td className="font-mono text-sm whitespace-nowrap">{e.episode_id}</Td>
                        <Td className="whitespace-nowrap">{e.robot_id}</Td>
                        <Td className="capitalize">{e.task_name}</Td>
                        <Td className="whitespace-nowrap tabular">{formatDate(e.recorded_at)}</Td>
                        <Td>
                          <QualityText q={e.quality} />
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableScroll>
            </div>
            <ul className="flex flex-col gap-2 md:hidden">
              {rows.map((e) => (
                <li
                  key={e.episode_id}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border border-line p-1 pr-3",
                    !assignable(e) && "opacity-60",
                    selected.has(e.episode_id) && "border-primary bg-primary-soft",
                  )}
                >
                  <EpisodeCheckbox
                    episode={e}
                    checked={selected.has(e.episode_id)}
                    onChange={() => toggle(e.episode_id)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm">{e.episode_id}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {e.robot_id} · <span className="capitalize">{e.task_name}</span> ·{" "}
                      {formatDate(e.recorded_at)}
                    </p>
                  </div>
                  <QualityText q={e.quality} />
                </li>
              ))}
            </ul>
            <Pagination
              page={page}
              hasNext={page * EPISODES_PAGE_SIZE < (episodes.data?.total ?? 0)}
              busy={episodes.isFetching}
              onPage={setPage}
              total={episodes.data?.total}
              pageSize={EPISODES_PAGE_SIZE}
            />
          </>
        )}
      </div>

      {/* Fixed footer outside the scrolling list: always reachable, however long the list is. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-4 py-3 sm:px-5">
        <div className="text-sm">
          <p className="font-medium tabular">{plural(selected.size, "episode")} selected</p>
          {mismatched > 0 && (
            <p className="text-warning">
              {mismatched} {mismatched === 1 ? "is" : "are"} for a different task than “
              {detail.task_name}”.
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <Button variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          )}
          <Button variant="outline" onClick={onDone}>
            Done
          </Button>
          <Button disabled={selected.size === 0} loading={assign.isPending} onClick={submit}>
            Assign {selected.size > 0 ? selected.size : ""}
          </Button>
        </div>
      </div>
    </div>
  );
}
