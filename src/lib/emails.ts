import "server-only";
import { cache } from "react";
import { auth } from "@/auth";
import type { CategorySlug } from "./categories";
import { CATEGORIES, getCategoryBySlug, type InboxCounts } from "./categories";
import { ApiError, backendEnabled, request } from "./api/client";
import { routes } from "./api/routes";
import { loadDemoEmail, loadDemoEmails } from "./demo/load";
import {
  getInboxCounts as getGmailCounts,
  getInboxCountsNow as getGmailCountsNow,
  getInboxPage as getGmailPage,
  getMessage,
  type InboxPage,
} from "./gmail";
import { withShipmentAnalysis } from "./gmail/attachments";
import { wasOpened } from "./gmail/read-memory";
import type { InboxRow } from "@/components/inbox-pane";
import { displayName } from "./format";
import { PAGE_SIZE } from "./paging";
import { labelFor } from "./shipment";
import { withSummary } from "./summarize";
import { MOCK_EMAILS } from "./mock-data";
import type { Email, ShipmentFieldKey } from "./types";

/**
 * Data access for the dashboard: the one place that decides where emails come
 * from. Demo account -> bundled dummy inbox; BACKEND_API_URL set -> the backend
 * (endpoints and data mapping live in lib/api/routes.ts); a Google sign-in with
 * no backend -> the user's own Gmail inbox (lib/gmail); else mock data.
 *
 * The list is shown a page at a time (getInboxPage). Gmail really is fetched 50 at a
 * time, on demand, so a big inbox never gets pulled in bulk (Gmail's quota); the other
 * sources already hold everything in memory and just slice it.
 */

/** True when emails come from the user's Gmail (paged; use getInboxPage, not getEmails). */
export const usesGmail = cache(async (): Promise<boolean> => {
  const session = await auth();
  return !session?.demo && !backendEnabled && !!session?.accessToken;
});

export interface InboxPageResult extends InboxPage {
  /**
   * true: `emails` are already only the requested category, and `total` counts that
   * category (in-memory sources). false: `emails` are the page's messages of every
   * category, so the list filters them itself (Gmail: the rest of the inbox isn't loaded).
   */
  filtered: boolean;
}

/** One page (PAGE_SIZE) of the inbox for a filter tab, newest first, from whichever source applies. */
export async function getInboxPage(
  slug: CategorySlug,
  page: number,
  /**
   * refresh: read this page from the source again rather than from anything held (the Refresh
   * button). reuse: a tab switch, so a page read moments ago will do (see the Gmail source).
   */
  opts: { refresh?: boolean; reuse?: boolean } = {},
): Promise<InboxPageResult> {
  const session = await auth();
  if (await usesGmail()) {
    const token = session!.accessToken!;
    const gmail = await getGmailPage(token, session!.user.id, page, opts);
    // The row badges ("Mismatch", "Needs review") come from `status`, which only
    // exists once the attachments have been read -- so the list has to do it too,
    // not just the opened email. Messages without attachments cost nothing and
    // the rest are cached, so opening one of these rows is then free.
    const userKey = session!.user.id;
    const emails = await Promise.all(gmail.emails.map((e) => withShipmentAnalysis(token, e)));
    // Gmail may still say unread (it is only told once the app has permission to change
    // mail); whatever has been opened here stays read regardless.
    const opened = emails.map((e) => (e.unread && wasOpened(userKey, e.email_id) ? { ...e, unread: false } : e));
    return { ...gmail, emails: opened, filtered: false };
  }

  const all = filterEmails(await getEmails(), slug);
  const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  return {
    emails: all.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE),
    page: current,
    total: all.length,
    hasNext: current < pages,
    filtered: true,
  };
}

/** What a list row needs; keeps the list light. */
export function toInboxRow(e: Email): InboxRow {
  return {
    id: e.email_id,
    from: displayName(e.from),
    subject: e.subject,
    category: e.category,
    attachmentCount: e.attachments.length,
    receivedAt: e.received_at,
    unread: e.unread,
    reviewReason: e.status === "NEEDS_REVIEW" ? (e.review_reason ?? "unknown") : undefined,
    mismatchedFields:
      e.status === "MISMATCH"
        ? (e.defect_fields ?? []).map((f) => labelFor(f as ShipmentFieldKey))
        : undefined,
    matched: e.status === "OK" ? true : undefined,
  };
}

// cache(): the dashboard layouts and pages all call this in one request; fetch once
export const getEmails = cache(async (): Promise<Email[]> => {
  const session = await auth();
  // Demo account: bundled dummy inbox (public/dummy), never the backend
  if (session?.demo) return loadDemoEmails();

  if (!backendEnabled && session?.accessToken) {
    throw new Error("The Gmail inbox is paged: use getInboxPage()");
  }
  const emails = backendEnabled ? await request(routes.emails) : MOCK_EMAILS;
  // Newest first (emails without a valid date keep their order)
  const time = (e: Email) => new Date(e.received_at ?? 0).getTime() || 0;
  return [...emails].sort((a, b) => time(b) - time(a));
});

/** One email with everything the email page shows, whichever source it comes from. */
export async function getEmail(emailId: string): Promise<Email | undefined> {
  const email = await loadEmail(emailId);
  // The TL;DR is written here, on open, not for the whole list: it is only shown for one email
  return email && withSummary(email);
}

async function loadEmail(emailId: string): Promise<Email | undefined> {
  const session = await auth();
  if (session?.demo) return loadDemoEmail(emailId);

  if (backendEnabled) {
    try {
      return await request(routes.email, emailId);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return undefined;
      throw e;
    }
  }
  if (session?.accessToken) {
    const email = await getMessage(session.accessToken, session.user.id, emailId);
    // Attachments are read here, not in getMessage: that cache is shared with
    // the inbox list, which must stay cheap. Opening one email is where the
    // SI/BL work belongs -- the same split the demo makes between
    // loadDemoEmails (no analysis) and loadDemoEmail (analysis).
    return email && withShipmentAnalysis(session.accessToken, email);
  }
  return MOCK_EMAILS.find((e) => e.email_id === emailId);
}

export function filterEmails(emails: Email[], slug: CategorySlug): Email[] {
  const category = getCategoryBySlug(slug)?.category;
  return category ? emails.filter((e) => e.category === category) : emails;
}

/**
 * Tab totals for a Gmail inbox, counted in the background (see lib/gmail). Returns whatever
 * has been counted so far; the tab bar asks again until `done`. Null when the account
 * isn't a Gmail one (those get exact counts up front from countByCategory).
 */
export async function getLiveCounts(opts: { fresh?: boolean } = {}): Promise<InboxCounts | null> {
  if (!(await usesGmail())) return null;
  const session = await auth();
  const token = session!.accessToken!;
  const userKey = session!.user.id;
  const snap = opts.fresh
    ? await getGmailCountsNow(token, userKey)
    : getGmailCounts(token, userKey);
  const counts = {} as Record<CategorySlug, number>;
  let all = 0;
  for (const { slug, category } of CATEGORIES) {
    if (!category) continue;
    counts[slug] = snap?.counts[category] ?? 0;
    all += counts[slug];
  }
  counts.all = all;
  return { counts, done: snap?.done ?? false, capped: snap?.capped ?? false };
}

/** Derived from CATEGORIES, so adding a category needs no change here. */
export function countByCategory(emails: Email[]): Record<CategorySlug, number> {
  const counts = {} as Record<CategorySlug, number>;
  for (const { slug } of CATEGORIES) counts[slug] = filterEmails(emails, slug).length;
  return counts;
}
