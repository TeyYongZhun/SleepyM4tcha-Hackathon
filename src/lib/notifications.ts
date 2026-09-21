"use client";

import { useSyncExternalStore } from "react";
import { currentScope, keyFor, onScopeChange, scopedKey } from "./store-scope";

/**
 * The notifications behind the bell in the navbar: every reply result that has been reported,
 * kept after its toast has gone.
 *
 * It lives here rather than in the reply bar because that bar is unmounted the moment you open
 * another email, which is often before the reply has even been confirmed. Held in localStorage
 * so the list survives a reload, and capped -- this is a recent-activity list, not an archive.
 */

const KEY_BASE = "wayboxai:notifications";
const LIMIT = 30;

/** How a reply ended up. Also what the toast shows (components/toast.tsx). */
export type ReplyOutcome = "sent" | "delivered" | "not-sent" | "bounced";

/** Everything worth recording: reply results, plus the review flags a person clears by hand. */
export type NotificationKind = ReplyOutcome | "resolved" | "reopened";

export interface Notification {
  id: string;
  kind: NotificationKind;
  /** What it is about: the address for a reply, the email's subject for a review flag. */
  subject: string;
  /** Epoch ms. */
  at: number;
  read?: boolean;
  /**
   * Waiting on a result that may still change this one -- a sent reply that has not yet been
   * confirmed delivered or bounced. Its toast stays up until it settles.
   */
  pending?: boolean;
}

const listeners = new Set<() => void>();
let cache: Notification[] = [];
let cacheRaw: string | null = null;

function read(): Notification[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(scopedKey(KEY_BASE));
  } catch {
    return cache; // private mode: whatever this session has built up
  }
  // useSyncExternalStore compares snapshots by identity, so the same array has to come back
  // out until the stored text actually changes -- otherwise React re-renders forever.
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      cache = Array.isArray(parsed) ? (parsed as Notification[]) : [];
    } catch {
      cache = [];
    }
  }
  return cache;
}

function write(next: Notification[]) {
  cache = next.slice(0, LIMIT);
  cacheRaw = JSON.stringify(cache);
  try {
    localStorage.setItem(scopedKey(KEY_BASE), cacheRaw);
  } catch {
    // private mode: it just won't survive a reload
  }
  listeners.forEach((l) => l());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

const EMPTY: Notification[] = [];

// Signing into another account: forget this one's list, then let subscribers re-read once the
// render that changed the scope has finished.
onScopeChange(() => {
  cache = [];
  cacheRaw = null;
  queueMicrotask(() => listeners.forEach((l) => l()));
});

/** Newest first. */
export const useNotifications = () => useSyncExternalStore(subscribe, read, () => EMPTY);

/**
 * The newest notification's id as things stand, without subscribing. Lets the toast start out
 * knowing what was already stored, so a reload doesn't announce an old notification as though
 * it had just happened. Returns null on the server, where there is no storage to read.
 */
export function latestNotificationId(): string | null {
  if (typeof window === "undefined") return null;
  return read()[0]?.id ?? null;
}

/**
 * Changes one account's list. That is whoever is signed in, unless the caller names another: a
 * reply watch names the account it started in, so a result that comes back after switching
 * accounts is filed with the account that sent the reply -- straight to its storage, without
 * appearing on the screen of the account now signed in.
 */
function change(owner: string, edit: (all: Notification[]) => Notification[]) {
  if (owner === currentScope()) return write(edit(read()));
  try {
    const key = keyFor(KEY_BASE, owner);
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    const all = Array.isArray(parsed) ? (parsed as Notification[]) : [];
    localStorage.setItem(key, JSON.stringify(edit(all).slice(0, LIMIT)));
  } catch {
    // private mode, or nothing readable there: that account just won't see it
  }
}

const make = (kind: NotificationKind, subject: string, pending: boolean): Notification => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  kind,
  subject,
  at: Date.now(),
  pending,
});

export function addNotification(
  kind: NotificationKind,
  subject: string,
  pending = false,
  owner = currentScope(),
) {
  change(owner, (all) => [make(kind, subject, pending), ...all]);
}

/**
 * Replaces the newest notification when it is the same reply moving on -- "sent" becoming
 * "delivered" or "bounced" -- rather than logging the same reply twice.
 */
export function updateLatest(kind: NotificationKind, subject: string, owner = currentScope()) {
  change(owner, (all) => {
    const latest = all[0];
    if (!latest || latest.subject !== subject || latest.kind !== "sent") {
      return [make(kind, subject, false), ...all];
    }
    // Same id, so its toast stays on screen and simply changes rather than reappearing
    return [{ ...latest, kind, at: Date.now(), read: false, pending: false }, ...all.slice(1)];
  });
}

export function markAllRead() {
  const all = read();
  if (all.every((n) => n.read)) return;
  write(all.map((n) => ({ ...n, read: true })));
}

export function clearNotifications() {
  write([]);
}
