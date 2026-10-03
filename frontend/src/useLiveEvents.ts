import { useEffect, useState } from "react";

const EVENTS = ["request.created", "request.status_changed", "request.assignments_changed", "resync"];

/**
 * Subscribes to the server's event stream (staff only). Calls `onChange` whenever something
 * happened, so pages refetch through the normal authorised endpoints. EventSource reconnects by
 * itself; after a reconnect we also refresh, because events may have been missed meanwhile.
 */
export function useLiveEvents(enabled: boolean, onChange: () => void): boolean {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const source = new EventSource("/api/events");
    let timer: number | undefined;
    let wasDown = false;
    const refresh = () => {
      window.clearTimeout(timer); // coalesce bursts (e.g. a bulk assignment)
      timer = window.setTimeout(onChange, 150);
    };
    source.onopen = () => {
      setConnected(true);
      if (wasDown) refresh();
      wasDown = false;
    };
    source.onerror = () => {
      setConnected(false);
      wasDown = true;
    };
    EVENTS.forEach((type) => source.addEventListener(type, refresh));
    return () => {
      window.clearTimeout(timer);
      source.close();
      setConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return connected;
}
