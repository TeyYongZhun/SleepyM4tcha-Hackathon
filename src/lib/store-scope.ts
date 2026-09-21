"use client";

/**
 * Which account the browser-held stores belong to.
 *
 * Everything these stores keep -- notifications, which emails are read, which flags have been
 * resolved -- is one person's, but localStorage is the browser's. Without the account in the
 * key, signing out of the demo and into a real mailbox showed the demo's notifications and
 * read state as though they were yours. Keys are scoped by user id instead, so each account
 * keeps its own and switching back finds it again.
 */

let scope = "anon";
const resets = new Set<() => void>();

/** A store's key. Read it at the point of use: the scope is not known when modules load. */
export const scopedKey = (base: string) => `${base}:${scope}`;

/** Registers a store so whatever it is holding is dropped when the account changes. */
export function onScopeChange(reset: () => void) {
  resets.add(reset);
  return () => resets.delete(reset);
}

/**
 * Called as the provider renders, before anything can read a store, so the first paint is
 * already the right account's. It only clears caches -- no React state is touched here, and
 * each store defers telling its subscribers until the render in progress has finished.
 */
export function setStoreScope(userId: string) {
  if (!userId || userId === scope) return;
  scope = userId;
  resets.forEach((reset) => reset());
}
