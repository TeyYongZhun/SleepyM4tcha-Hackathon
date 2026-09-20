import { useSyncExternalStore } from "react";

/**
 * A set of ids kept in this browser's localStorage and shared between components
 * through a tiny external store, so a change in one (the summary panel) shows up
 * in another (the list) immediately, with no refetch. Used for state the server
 * has no per-user place to keep: which emails are resolved, and which are read.
 */
export function createIdStore(key: string) {
  const EMPTY: ReadonlySet<string> = new Set();
  const listeners = new Set<() => void>();
  let cache: ReadonlySet<string> | null = null;

  function read(): ReadonlySet<string> {
    if (cache) return cache;
    try {
      const raw = localStorage.getItem(key);
      cache = new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      cache = new Set();
    }
    return cache;
  }

  function write(next: Set<string>) {
    cache = next;
    try {
      localStorage.setItem(key, JSON.stringify([...next]));
    } catch {} // private mode / quota: still held for this tab
    listeners.forEach((l) => l());
  }

  function subscribe(onChange: () => void) {
    listeners.add(onChange);
    // Another tab changed it
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return;
      cache = null;
      onChange();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(onChange);
      window.removeEventListener("storage", onStorage);
    };
  }

  return {
    set(id: string, on: boolean) {
      if (read().has(id) === on) return;
      const next = new Set(read());
      if (on) next.add(id);
      else next.delete(id);
      write(next);
    },
    /** Empty on the server and during hydration, so the first paint matches the server's. */
    useIds: (): ReadonlySet<string> => useSyncExternalStore(subscribe, read, () => EMPTY),
  };
}
