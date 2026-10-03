import { useEffect, useRef } from "react";

/** Bindings: "n", "?", "/", "mod+k", or a two-key sequence such as "g r" (second key within 1 s). */
export type HotkeyMap = Record<string, () => void>;

const SEQUENCE_TIMEOUT_MS = 1000;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** Pure matcher, exported for tests. Returns the binding that `key` completes, if any. */
export function matchBinding(
  bindings: string[],
  key: string,
  previous: string | null,
): { binding: string | null; pending: string | null } {
  if (previous) {
    const hit = bindings.find((b) => b === `${previous} ${key}`);
    if (hit) return { binding: hit, pending: null };
  }
  const single = bindings.find((b) => b === key);
  if (single) return { binding: single, pending: null };
  const startsSequence = bindings.some((b) => b.startsWith(`${key} `));
  return { binding: null, pending: startsSequence ? key : null };
}

export function useHotkeys(map: HotkeyMap, enabled = true): void {
  const ref = useRef(map);
  useEffect(() => {
    ref.current = map;
  });

  useEffect(() => {
    if (!enabled) return;
    let pending: string | null = null;
    let timer: number | undefined;

    const onKey = (e: KeyboardEvent) => {
      const bindings = Object.keys(ref.current);
      // Cmd/Ctrl combinations work even while typing; plain keys never do.
      if ((e.metaKey || e.ctrlKey) && !e.altKey) {
        const combo = `mod+${e.key.toLowerCase()}`;
        if (bindings.includes(combo)) {
          e.preventDefault();
          ref.current[combo]?.();
        }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      const { binding, pending: next } = matchBinding(bindings, e.key, pending);
      window.clearTimeout(timer);
      pending = next;
      if (next) timer = window.setTimeout(() => (pending = null), SEQUENCE_TIMEOUT_MS);
      if (binding) {
        e.preventDefault();
        ref.current[binding]?.();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [enabled]);
}
