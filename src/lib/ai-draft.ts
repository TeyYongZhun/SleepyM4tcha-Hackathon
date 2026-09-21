import { useSyncExternalStore } from "react";

/** The "AI Draft" switch next to the Reply button. Remembered per browser. */
const KEY = "wayboxai:ai-draft";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setAiDraft(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    // private mode: the switch just won't persist
  }
  listeners.forEach((l) => l());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export const useAiDraft = () => useSyncExternalStore(subscribe, read, () => false);
