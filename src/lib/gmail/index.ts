import "server-only";
import type { Email, EmailCategory } from "../types";
import { PAGE_SIZE } from "../paging";
import { GmailError, gmailGet, gmailPost, mapPool } from "./api";
import { enrich } from "./enrich";
import { findPart, mimeOf, parseMessage, type GmailMessage } from "./parse";

/**
 * Gmail as the email source: the signed-in user's inbox, read with their own
 * access token (Auth.js keeps it fresh). Server-side only.
 */

// The gmailGet pacing keeps this under Gmail's quota; concurrency only hides latency.
const CONCURRENCY = 8;


// Messages already loaded, per user. Going back to a page (or opening an email from
// it) costs no Gmail calls. A message's content never changes, so this is long: the cost of
// it expiring is re-reading the whole page (and every attachment on it), which is what made
// the first click after a pause take seconds. What can change -- the unread mark -- is kept
// right by the app itself (opening an email clears it) and by the Refresh button.
const STORE_TTL_MS = 60 * 60_000;
/** How long the newest page's list of ids (and the inbox total) may be reused when switching tabs. */
const LISTING_TTL_MS = 60_000;
const STORE_MAX = 1500; // above COUNT_CAP, so counting the inbox never evicts what it just read
type Store = Map<string, { at: number; email: Email }>;
type Cursor = { at: number; tokens: (string | undefined)[]; total?: number };
type Listing = { at: number; ids: string[]; next?: string; total?: number };

// On globalThis, not module scope: the pages and the /api/inbox route are bundled
// separately and would each get their own copy, so they would never share a cache.
type GmailState = {
  stores: Map<string, Store>;
  cursors: Map<string, Cursor>;
  // optional: a dev server that hot-reloads this file still holds the older shape
  counters?: Map<string, CountState>;
  listings?: Map<string, Listing>;
};
const g = globalThis as unknown as { __wayboxGmail?: GmailState };
const gmailState: GmailState = (g.__wayboxGmail ??= { stores: new Map(), cursors: new Map() });
const { stores, cursors } = gmailState;
const counters = (gmailState.counters ??= new Map<string, CountState>());
const listings = (gmailState.listings ??= new Map<string, Listing>());

function storeFor(userKey: string) {
  let store = stores.get(userKey);
  if (!store) stores.set(userKey, (store = new Map()));
  if (store.size > STORE_MAX) {
    const now = Date.now();
    for (const [id, held] of store) if (now - held.at > STORE_TTL_MS) store.delete(id);
    if (store.size > STORE_MAX) store.clear();
  }
  return store;
}

const fresh = (held?: { at: number }) => !!held && Date.now() - held.at <= STORE_TTL_MS;


async function fetchMessage(token: string, id: string): Promise<Email | null> {
  try {
    const msg = await gmailGet<GmailMessage>(token, `/messages/${encodeURIComponent(id)}`, {
      format: "full",
    });
    return enrich(parseMessage(msg));
  } catch (e) {
    if (e instanceof GmailError && e.status === 404) return null; // deleted since listing
    throw e;
  }
}

// Gmail pages are cursor-based: page N is reached with the token returned by page N-1.
// tokens[i] is the token that opens page i+1 (page 1 needs none). Kept per user so
// "next page" is one list call; a cold instance or an unseen page walks forward using
// list calls only (ids, no message bodies), which are cheap.
const CURSOR_TTL_MS = 10 * 60_000;

async function listPage(token: string, pageToken?: string) {
  const page = await gmailGet<{ messages?: { id: string }[]; nextPageToken?: string }>(
    token,
    "/messages",
    {
      labelIds: "INBOX",
      maxResults: String(PAGE_SIZE),
      fields: "messages/id,nextPageToken",
      ...(pageToken ? { pageToken } : {}),
    },
  );
  return { ids: (page.messages ?? []).map((m) => m.id), next: page.nextPageToken };
}

export interface InboxPage {
  emails: Email[];
  /** 1-based; may be lower than requested if that page is past the end */
  page: number;
  /** Messages in the whole inbox, when Gmail reported it */
  total?: number;
  hasNext: boolean;
}

/** One page (newest first) of the inbox: lists ids, then loads only the messages not held yet. */
export async function getInboxPage(
  token: string,
  userKey: string,
  requested: number,
  opts: {
    /**
     * Read this page from Gmail again instead of using what's held (the Refresh button).
     * Only the messages this page lists are re-read -- pages the person has already paged
     * through stay held, so a refresh costs one page of calls, not the whole inbox.
     */
    refresh?: boolean;
    /**
     * A tab switch: page 1 was read moments ago, so reuse its list of ids and total instead of
     * asking Gmail again. Every tab shows the same page of the inbox, so switching is free.
     */
    reuse?: boolean;
    retried?: boolean;
  } = {},
): Promise<InboxPage> {
  const { refresh = false, retried = false, reuse = false } = opts;
  let page = Math.max(1, Math.floor(requested) || 1);
  // New mail shifts every page boundary along, so held page tokens (and the total) are no
  // longer trustworthy once we go back to Gmail for the newest page.
  if (refresh) {
    cursors.delete(userKey);
    listings.delete(userKey);
  }
  let cur = cursors.get(userKey);
  if (!cur || Date.now() - cur.at > CURSOR_TTL_MS) {
    cur = { at: Date.now(), tokens: [undefined] };
    cursors.set(userKey, cur);
  }

  let ids: string[];
  let next: string | undefined;
  const held = reuse && !refresh && page === 1 ? listings.get(userKey) : undefined;
  if (held && Date.now() - held.at <= LISTING_TTL_MS) {
    ({ ids, next } = held);
    cur.total = held.total;
  } else {
    // "1-50 of 1,234". Read every time, not held with the cursor: the ids are always this
    // moment's, so a held total goes stale the moment mail arrives and the header ends up
    // reading "1-30 of 29". It is a label read (1 quota unit, against 5 for a page of ids),
    // started now so it runs alongside the list rather than after it -- two calls one after
    // the other was two round trips to Gmail on every page load. If it fails the last known
    // total stands rather than the header losing its total.
    const lastTotal = cur.total;
    const totalRead = gmailGet<{ messagesTotal?: number }>(token, "/labels/INBOX", {
      fields: "messagesTotal",
    })
      .then((l) => l.messagesTotal ?? lastTotal)
      .catch(() => lastTotal);
    try {
      while (cur.tokens.length < page) {
        const r = await listPage(token, cur.tokens[cur.tokens.length - 1]);
        if (!r.next) {
          page = cur.tokens.length; // past the end: show the last page instead
          break;
        }
        cur.tokens.push(r.next);
      }
      ({ ids, next } = await listPage(token, cur.tokens[page - 1]));
      if (next && cur.tokens.length === page) cur.tokens.push(next);
    } catch (e) {
      // A stale page token: forget the cursor and walk again from page 1, once
      if (e instanceof GmailError && e.status === 400 && !retried) {
        cursors.delete(userKey);
        return getInboxPage(token, userKey, requested, { ...opts, retried: true });
      }
      throw e;
    }
    cur.total = await totalRead;
    if (page === 1) listings.set(userKey, { at: Date.now(), ids, next, total: cur.total });
  }

  const store = storeFor(userKey);
  const todo = refresh ? ids : ids.filter((id) => !fresh(store.get(id)));
  await mapPool(todo, CONCURRENCY, async (id) => {
    const email = await fetchMessage(token, id);
    if (email) store.set(id, { at: Date.now(), email });
  });

  const emails = ids.flatMap((id) => store.get(id)?.email ?? []);
  console.info(`[gmail] page ${page}: ${emails.length} messages (${todo.length} fetched)`);
  return { emails, page, total: cur.total, hasNext: !!next };
}

/** One message by id (opening an email directly, e.g. from a bookmark). */
export async function getMessage(
  token: string,
  userKey: string,
  id: string,
): Promise<Email | undefined> {
  const store = storeFor(userKey);
  const held = store.get(id);
  if (fresh(held)) return held!.email;
  const email = await fetchMessage(token, id);
  if (!email) return undefined;
  store.set(id, { at: Date.now(), email });
  return email;
}

// --- Per-category totals for the tab bar -------------------------------------------------
//
// Gmail only ever hands over a page at a time, and a message's category is decided by
// reading it (subject, body, the classifier) -- so a total per category means reading the
// whole inbox. That is done once in the background, into the same message store the tabs
// already list from, so the number on a tab is always the number of emails that tab holds.
// It never blocks a page: callers get whatever has been counted so far and ask again.

/** Newest messages counted. Keeps a huge inbox inside Gmail's quota; past it, totals read "N+". */
const COUNT_CAP = 1000;
// A recount is cheap -- a list call or two, plus only the messages not seen before -- so the
// totals are never allowed to get much older than a minute, and a page load recounts at once.
const COUNT_TTL_MS = 60_000;
const COUNT_RETRY_MS = 60_000;
/**
 * How long a page load will wait for its recount before showing the previous numbers. On a
 * reload the page has already read the new mail, so the recount is just the list call(s) and
 * lands well inside this; a first count of a cold inbox does not, and reports progress instead.
 */
const COUNT_WAIT_MS = 2_500;

export interface InboxCategoryCounts {
  counts: Record<EmailCategory, number>;
  done: boolean;
  capped: boolean;
}
interface CountState {
  /** When the current (or last) scan started */
  at: number;
  running: boolean;
  failed: boolean;
  /** What callers see. Grows during the first scan; after that only swaps when a rescan finishes. */
  view?: InboxCategoryCounts;
  /** The scan in flight, so a caller that wants the newest numbers can wait for it */
  inflight?: Promise<void>;
}

const emptyCounts = (): Record<EmailCategory, number> => ({
  bl_comparison: 0,
  si_request: 0,
  invoice_query: 0,
  general: 0,
  spam: 0,
});

async function scanInbox(token: string, userKey: string, state: CountState): Promise<void> {
  const ids: string[] = [];
  let next: string | undefined;
  do {
    const page = await gmailGet<{ messages?: { id: string }[]; nextPageToken?: string }>(
      token,
      "/messages",
      {
        labelIds: "INBOX",
        maxResults: "500",
        fields: "messages/id,nextPageToken",
        ...(next ? { pageToken: next } : {}),
      },
    );
    ids.push(...(page.messages ?? []).map((m) => m.id));
    next = page.nextPageToken;
  } while (next && ids.length < COUNT_CAP);
  const capped = !!next || ids.length > COUNT_CAP;
  const counted = ids.slice(0, COUNT_CAP);

  const counts = emptyCounts();
  // A rescan keeps showing the last full count until it has a new one; only the first scan
  // shows its progress as it goes.
  const showProgress = !state.view;
  const publish = (done: boolean) => {
    if (showProgress || done) state.view = { counts: { ...counts }, done, capped };
  };

  const store = storeFor(userKey);
  const todo: string[] = [];
  for (const id of counted) {
    // Held is enough, however old: a message's category doesn't change, and only what has
    // never been read needs fetching -- which is what keeps a recount to a call or two.
    const held = store.get(id);
    if (held) counts[held.email.category]++;
    else todo.push(id);
  }
  publish(false);

  let sincePublish = 0;
  try {
    await mapPool(todo, CONCURRENCY, async (id) => {
      const email = await fetchMessage(token, id);
      if (!email) return; // deleted since listing
      store.set(id, { at: Date.now(), email });
      counts[email.category]++;
      if (++sincePublish % 10 === 0) publish(false);
    });
  } catch (e) {
    // Quota or a dropped connection part-way: keep what was counted, but say it is a floor
    console.warn("[gmail] counting the inbox stopped early:", e instanceof Error ? e.message : e);
    state.failed = true;
    if (showProgress || state.view) state.view = { counts: { ...counts }, done: true, capped: true };
    return;
  }
  publish(true);
}

/**
 * The per-category totals so far (null before the first scan has anything), starting or
 * refreshing the background count when there is none or it has aged out. Never waits on Gmail.
 * `fresh` is a page load or a return to the tab: recount now rather than wait out the TTL.
 * While a recount is running the last full totals are still returned, marked not `done`, so
 * the caller knows to ask again shortly.
 */
function scanIfDue(token: string, userKey: string, fresh: boolean): CountState {
  let state = counters.get(userKey);
  if (!state) counters.set(userKey, (state = { at: 0, running: false, failed: false }));
  // `fresh` is a page load or a return to the tab: count now rather than wait out the TTL.
  // No floor beneath it -- `running` is what stops two scans overlapping, and a floor is
  // exactly what left a reload showing the previous numbers until the next TTL came round.
  const wait = state.failed ? COUNT_RETRY_MS : fresh ? 0 : COUNT_TTL_MS;
  if (!state.running && Date.now() - state.at >= wait) {
    const st = state;
    st.running = true;
    st.failed = false;
    st.at = Date.now();
    st.inflight = scanInbox(token, userKey, st)
      .catch((e) => {
        console.warn("[gmail] could not count the inbox:", e instanceof Error ? e.message : e);
        st.failed = true;
      })
      .finally(() => {
        st.running = false;
        st.inflight = undefined;
      });
  }
  return state;
}

/** Whatever has been counted, marked not done while a scan is in flight. */
const snapshot = (state: CountState): InboxCategoryCounts | null =>
  state.view ? { ...state.view, done: state.view.done && !state.running } : null;

export function getInboxCounts(token: string, userKey: string): InboxCategoryCounts | null {
  return snapshot(scanIfDue(token, userKey, false));
}

/**
 * The totals for a page load: recounts at once and waits briefly for that to finish, so the
 * tabs show the inbox as it is now rather than as it was before the new mail arrived. Falls
 * back to whatever has been counted if the scan is slower than COUNT_WAIT_MS.
 */
export async function getInboxCountsNow(
  token: string,
  userKey: string,
): Promise<InboxCategoryCounts | null> {
  const state = scanIfDue(token, userKey, true);
  if (state.inflight) {
    let timer: ReturnType<typeof setTimeout>;
    await Promise.race([
      state.inflight,
      new Promise<void>((r) => (timer = setTimeout(r, COUNT_WAIT_MS))),
    ]).finally(() => clearTimeout(timer!));
  }
  return snapshot(state);
}

/**
 * Clears Gmail's UNREAD label, so it stays read the next time the inbox is
 * loaded (not just in the current tab), and updates the held copy so a
 * same-session reload of this page shows it as read without an extra fetch.
 */
export async function markMessageRead(token: string, userKey: string, id: string): Promise<void> {
  await gmailPost(token, `/messages/${encodeURIComponent(id)}/modify`, { removeLabelIds: ["UNREAD"] });
  const held = storeFor(userKey).get(id);
  if (held) held.email = { ...held.email, unread: false };
}

export interface AttachmentFile {
  data: Buffer;
  filename: string;
  mime_type: string;
}

/** One attachment's bytes, straight from Gmail. Nothing is stored. */
export async function fetchAttachment(
  token: string,
  messageId: string,
  partId: string,
): Promise<AttachmentFile | null> {
  const msg = await readMessage(token, messageId);
  return msg ? readPart(token, messageId, msg, partId) : null;
}

/**
 * Several attachments of one message. The message has to be read to find where each part
 * lives, so this reads it once for all of them rather than once per attachment -- for an
 * SI + BL pair that is a third of the calls the list of a page of shipping emails makes.
 * A part that can't be read comes back null, without failing the others.
 */
export async function fetchAttachments(
  token: string,
  messageId: string,
  partIds: string[],
): Promise<Map<string, AttachmentFile | null>> {
  const out = new Map<string, AttachmentFile | null>();
  const msg = await readMessage(token, messageId).catch(() => null);
  await mapPool(partIds, CONCURRENCY, async (partId) => {
    out.set(partId, msg ? await readPart(token, messageId, msg, partId).catch(() => null) : null);
  });
  return out;
}

async function readMessage(token: string, messageId: string): Promise<GmailMessage | null> {
  try {
    return await gmailGet<GmailMessage>(token, `/messages/${encodeURIComponent(messageId)}`, {
      format: "full",
    });
  } catch (e) {
    if (e instanceof GmailError && e.status === 404) return null;
    throw e;
  }
}

async function readPart(
  token: string,
  messageId: string,
  msg: GmailMessage,
  partId: string,
): Promise<AttachmentFile | null> {
  // Look the part up by partId (stable). Gmail's attachmentId can change between calls.
  const part = findPart(msg.payload, partId);
  if (!part || (!part.filename && !part.body?.attachmentId)) return null;

  let b64 = part.body?.data;
  if (!b64 && part.body?.attachmentId) {
    const att = await gmailGet<{ data?: string }>(
      token,
      `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(part.body.attachmentId)}`,
    );
    b64 = att.data;
  }
  if (!b64) return null;

  return {
    data: Buffer.from(b64, "base64url"),
    filename: part.filename || "attachment",
    mime_type: mimeOf(part),
  };
}
