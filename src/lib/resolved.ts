import { useSyncExternalStore } from "react";

/**
 * Which emails a person has marked resolved. Kept in this browser's localStorage
 * (there's no per-user store on the server to put it in), and shared between the
 * list pane and the summary panel through a tiny external store, so pressing
 * Resolve on the right updates the left immediately without a refetch.
 */

const KEY = "wayboxai:resolved";
const EMPTY: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();
let cache: ReadonlySet<string> | null = null;

function read(): ReadonlySet<string> {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    cache = new Set();
  }
  return cache;
}

function write(next: Set<string>) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify([...next]));
  } catch {} // private mode / quota: still resolved for this tab
  listeners.forEach((l) => l());
}

export function setResolved(id: string, resolved: boolean) {
  const next = new Set(read());
  if (resolved) next.add(id);
  else next.delete(id);
  write(next);
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Another tab resolved something
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    cache = null;
    onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Empty on the server and during hydration, so the first paint matches the server's. */
export function useResolvedIds(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
