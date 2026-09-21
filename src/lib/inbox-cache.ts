"use client";

import type { InboxPageData } from "@/components/inbox-pane";
import { onScopeChange } from "./store-scope";

/**
 * The newest page of a Gmail inbox, as this browser last read it.
 *
 * Every tab of a Gmail inbox lists the same page -- the newest fifty messages, filtered on
 * screen -- so asking the server for it again on each tab switch only made the switch wait on
 * Gmail, and on a serverless host on whichever instance answered, which may never have read
 * the page and had to read every message on it again. The list keeps what it last had here and
 * a tab switch starts from it (see the category layout), reading it again in the background
 * only once it is old enough for new mail to have arrived.
 *
 * Only a page that holds every category is kept. The other sources send each tab its own
 * emails, straight from memory, so there is nothing for them to gain.
 */

/** Matches how long the server itself reuses the newest page's list of ids. */
export const HELD_FRESH_MS = 60_000;

let held: { at: number; data: InboxPageData } | null = null;

// Another account's inbox is not this one's
onScopeChange(() => {
  held = null;
});

export const heldFirstPage = () => held;

export function rememberFirstPage(data: InboxPageData) {
  if (data.filtered || data.page !== 1) return;
  held = { at: Date.now(), data };
}
