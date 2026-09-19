import "server-only";
import { cache } from "react";
import { auth } from "@/auth";
import type { CategorySlug } from "./categories";
import { getCategoryBySlug } from "./categories";
import { ApiError, backendEnabled, request } from "./api/client";
import { routes } from "./api/routes";
import { loadDemoEmail, loadDemoEmails } from "./demo/load";
import { getInboxPage as getGmailPage, getMessage, type InboxPage } from "./gmail";
import type { InboxRow } from "@/components/inbox-pane";
import { displayName } from "./format";
import { PAGE_SIZE } from "./paging";
import { MOCK_EMAILS } from "./mock-data";
import type { Email } from "./types";

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
export async function getInboxPage(slug: CategorySlug, page: number): Promise<InboxPageResult> {
  const session = await auth();
  if (await usesGmail()) {
    const gmail = await getGmailPage(session!.accessToken!, session!.user.id, page);
    return { ...gmail, filtered: false };
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

export async function getEmail(emailId: string): Promise<Email | undefined> {
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
  if (session?.accessToken) return getMessage(session.accessToken, session.user.id, emailId);
  return MOCK_EMAILS.find((e) => e.email_id === emailId);
}

export function filterEmails(emails: Email[], slug: CategorySlug): Email[] {
  const category = getCategoryBySlug(slug)?.category;
  return category ? emails.filter((e) => e.category === category) : emails;
}

export function countByCategory(emails: Email[]): Record<CategorySlug, number> {
  return {
    all: emails.length,
    relevant: filterEmails(emails, "relevant").length,
    spam: filterEmails(emails, "spam").length,
    "human-intervention": filterEmails(emails, "human-intervention").length,
    unrelated: filterEmails(emails, "unrelated").length,
  };
}
