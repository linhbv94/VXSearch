import { useEffect, useRef } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
interface PendingSearch { id: number; query: string }

/** Acknowledge only after React receives the query; events are merely wake-up hints. */
export function useQuickSearchHandoff(onQuery: (query: string) => void): void {
  const callback = useRef(onQuery);
  callback.current = onQuery;
  const appliedId = useRef(0);
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    const unlisteners: UnlistenFn[] = [];
    const frames = new Set<number>();
    const apply = (request: PendingSearch | null) => {
      if (disposed || !request || !Number.isSafeInteger(request.id) || typeof request.query !== "string") return;
      if (request.id > appliedId.current) {
        appliedId.current = request.id;
        callback.current(request.query);
      }
      const frame = requestAnimationFrame(() => {
        frames.delete(frame);
        if (!disposed) void invoke("ack_pending_search", { id: request.id }).catch(() => {});
      });
      frames.add(frame);
    };
    const readPending = () => {
      if (!disposed) void invoke<PendingSearch | null>("get_pending_search").then(apply).catch(() => {});
    };
    const subscribe = async () => {
      for (const event of ["quick_search_requested", "search_focus"]) {
        if (disposed) return;
        const unlisten = await listen(event, readPending);
        if (disposed) unlisten(); else unlisteners.push(unlisten);
      }
      readPending();
    };
    void subscribe().catch(() => {});
    return () => {
      disposed = true;
      unlisteners.forEach(unlisten => unlisten());
      frames.forEach(cancelAnimationFrame);
    };
  }, []);
}
