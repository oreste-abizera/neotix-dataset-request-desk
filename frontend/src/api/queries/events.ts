import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { keys } from "../keys";

export type LiveState = "connecting" | "live" | "offline";

const EVENT_TYPES = [
  "request.created",
  "request.status_changed",
  "request.assignments_changed",
  "request.exports_changed",
  "resync",
] as const;

/**
 * Staff only. Subscribes to the server's event stream and turns each event into query
 * invalidations, so every visible list/detail refetches through the normal authorised endpoints.
 * EventSource reconnects by itself; after a reconnect everything is refreshed because events may
 * have been missed in between.
 */
export function useLiveEvents(enabled: boolean): LiveState {
  const qc = useQueryClient();
  const [state, setState] = useState<LiveState>("connecting");

  useEffect(() => {
    if (!enabled) return;
    const source = new EventSource("/api/events");
    let wasDown = false;
    let timer: number | undefined;
    const pending = new Set<number | "all">();

    const flush = () => {
      const all = pending.has("all");
      void qc.invalidateQueries({
        queryKey: keys.requests,
        predicate: (q) => all || q.queryKey[1] === "list" || pending.has(q.queryKey[2] as number),
      });
      void qc.invalidateQueries({ queryKey: keys.episodes });
      pending.clear();
    };
    const onEvent = (e: Event) => {
      try {
        const data = JSON.parse((e as MessageEvent<string>).data) as { request_id?: number };
        pending.add(typeof data.request_id === "number" ? data.request_id : "all");
      } catch {
        pending.add("all");
      }
      window.clearTimeout(timer); // coalesce bursts (e.g. a bulk assignment)
      timer = window.setTimeout(flush, 150);
    };

    source.onopen = () => {
      setState("live");
      if (wasDown) {
        pending.add("all");
        flush();
      }
      wasDown = false;
    };
    source.onerror = () => {
      setState("offline");
      wasDown = true;
    };
    EVENT_TYPES.forEach((t) => source.addEventListener(t, onEvent));
    return () => {
      window.clearTimeout(timer);
      source.close();
      setState("connecting");
    };
  }, [enabled, qc]);

  return state;
}
